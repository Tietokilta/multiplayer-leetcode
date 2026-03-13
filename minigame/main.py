import asyncio
import json
import math
import signal
import time
import traceback
from dataclasses import dataclass, field
from logging import DEBUG, INFO, basicConfig, getLogger
from os import environ
from typing import Annotated, Any, Literal, TypedDict
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from websockets import ServerConnection, WebSocketException, serve

log = getLogger(__name__)

ADMIN_PASSWORD = environ.get("ADMIN_PASSWORD")
PORT = int(environ.get("PORT", "6978"))
ATTEMPT_RATE_LIMIT = 5.0  # seconds between attempts per minigame player


# ── Inbound models (Pydantic) ──────────────────────────────────────────────────


class DebuffModel(BaseModel):
    name: str
    type: str
    strength: float
    duration: float


class PuzzleActivatedCmd(BaseModel):
    type: Literal["puzzle_activated"]
    players: list[str]
    awards: list[DebuffModel]
    tokens: list[str]
    correct_solution: list[list[str | int]]


class LoginCmd(BaseModel):
    type: Literal["login"]
    id: str


class SubmitCmd(BaseModel):
    type: Literal["submit"]
    solution: list[list[str | int]]


class AssignCmd(BaseModel):
    type: Literal["assign"]
    target: str
    award_idx: int


PlayerCmdIn = Annotated[SubmitCmd | AssignCmd, Field(discriminator="type")]
_player_cmd = TypeAdapter[PlayerCmdIn](PlayerCmdIn)


# ── TypedDicts: outbound ───────────────────────────────────────────────────────


class PuzzleMessage(TypedDict):
    type: Literal["puzzle"]
    tokens: list[str]
    solution_lines: list[list[str | int]]
    players: list[str]


class FeedbackMessage(TypedDict):
    type: Literal["correct"] | Literal["incorrect"]


class AwardMessage(TypedDict):
    type: Literal["award"]
    debuff: Any
    award_idx: int


class AwardGrantedMessage(TypedDict):
    type: Literal["award_granted"]
    award_idx: int
    awards_remaining: int


class DebuffAssignedMessage(TypedDict):
    type: Literal["debuff_assigned"]
    debuff_name: str
    target: str


class AssignedMessage(TypedDict):
    type: Literal["assigned"]
    target: str


class LimitReachedMessage(TypedDict):
    type: Literal["limit_reached"]
    target: str


class WelcomeMessage(TypedDict):
    type: Literal["welcome"]
    player_id: str


class ErrorMessage(TypedDict):
    type: Literal["error"]
    message: str


type MessageOut = PuzzleMessage | FeedbackMessage | AwardMessage | AwardGrantedMessage | DebuffAssignedMessage | AssignedMessage | LimitReachedMessage | WelcomeMessage | ErrorMessage


class AdministerDebuffCmd(TypedDict):
    type: Literal["administer_debuff"]
    player: str
    name: str
    debuff_type: str
    strength: float
    duration: float


type MainGameCmd = AdministerDebuffCmd


# ── State ──────────────────────────────────────────────────────────────────────


@dataclass
class MinigamePlayer:
    id: str
    ws: ServerConnection
    last_attempt: float = 0.0
    earned_award_idx: int | None = None


@dataclass
class PuzzleState:
    tokens: list[str]
    solution_lines_blank: list[list[str | int]]
    correct_solution: list[list[str | int]]
    awards: list[DebuffModel]
    main_game_players: list[str]
    next_award_idx: int = 0
    debuffs_by_player: dict[str, list[DebuffModel]] = field(default_factory=dict[str, list[DebuffModel]])

    def debuff_cap(self) -> int:
        n = len(self.main_game_players)
        if n == 0:
            return 0
        return math.ceil(len(self.awards) / n * 2)

    def debuffs_for(self, target: str) -> int:
        return len(self.debuffs_by_player.get(target, []))


# ── Helpers ────────────────────────────────────────────────────────────────────


def blank_solution(lines: list[list[str | int]]) -> list[list[str | int]]:
    return [[-1 if isinstance(item, int) else item for item in line] for line in lines]


async def send(ws: ServerConnection, message: MessageOut | MainGameCmd) -> None:
    await ws.send(json.dumps(message), True)


# ── Server ─────────────────────────────────────────────────────────────────────


class MinigameServer:
    def __init__(self) -> None:
        self.puzzle_state: PuzzleState | None = None
        self.players: dict[str, MinigamePlayer] = {}
        self.main_game_ws: ServerConnection | None = None

    async def broadcast(self, message: MessageOut) -> None:
        data = json.dumps(message)
        for player in list(self.players.values()):
            try:
                await player.ws.send(data, True)
            except Exception:
                pass

    # ── Main game server ───────────────────────────────────────────────────────

    async def handle_main_game(self, ws: ServerConnection) -> None:
        log.info("Main game server connected")
        if self.main_game_ws is not None:
            try:
                await self.main_game_ws.close()
            except Exception:
                pass
        self.main_game_ws = ws

        try:
            async for raw in ws:
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type")
                    if msg_type == "puzzle_activated":
                        await self.on_puzzle_activated(PuzzleActivatedCmd.model_validate(data))
                    else:
                        log.warning(f"Unknown command from main game: {msg_type!r}")
                except ValidationError as e:
                    log.warning(f"Invalid puzzle_activated from main game: {e}")
                except WebSocketException:
                    break
                except Exception:
                    traceback.print_exc()
        finally:
            if self.main_game_ws is ws:
                self.main_game_ws = None
            log.info("Main game server disconnected")

    async def on_puzzle_activated(self, cmd: PuzzleActivatedCmd) -> None:
        correct = cmd.correct_solution
        self.puzzle_state = PuzzleState(
            tokens=cmd.tokens,
            solution_lines_blank=blank_solution(correct),
            correct_solution=correct,
            awards=cmd.awards,
            main_game_players=cmd.players,
            debuffs_by_player={p: [] for p in cmd.players},
        )

        for player in self.players.values():
            player.earned_award_idx = None
            player.last_attempt = 0.0

        await self.broadcast(
            PuzzleMessage(
                type="puzzle",
                tokens=self.puzzle_state.tokens,
                solution_lines=self.puzzle_state.solution_lines_blank,
                players=self.puzzle_state.main_game_players,
            )
        )
        log.info(
            f"Puzzle activated: {len(cmd.tokens)} tokens, "
            f"{len(cmd.awards)} awards, {len(cmd.players)} main game players"
        )

    # ── Minigame players ───────────────────────────────────────────────────────

    async def handle_player(self, ws: ServerConnection, player_id: str) -> None:
        log.info(f"Minigame player connected: {player_id}")

        if existing := self.players.get(player_id):
            try:
                await existing.ws.close()
            except Exception:
                pass

        player = MinigamePlayer(id=player_id, ws=ws)
        self.players[player_id] = player

        try:
            await send(
                ws,
                WelcomeMessage(
                    type="welcome",
                    player_id=player_id,
                ),
            )

            if self.puzzle_state is not None:
                ps = self.puzzle_state
                await send(
                    ws,
                    PuzzleMessage(
                        type="puzzle",
                        tokens=ps.tokens,
                        solution_lines=ps.solution_lines_blank,
                        players=ps.main_game_players,
                    ),
                )
                for i in range(ps.next_award_idx):
                    await send(
                        ws,
                        AwardGrantedMessage(
                            type="award_granted",
                            award_idx=i,
                            awards_remaining=len(ps.awards) - ps.next_award_idx,
                        ),
                    )
                for target, debuffs in ps.debuffs_by_player.items():
                    for award in debuffs:
                        await send(
                            ws,
                            DebuffAssignedMessage(
                                type="debuff_assigned",
                                debuff_name=award.name,
                                target=target,
                            ),
                        )

            async for raw in ws:
                try:
                    cmd = _player_cmd.validate_json(raw)
                    if isinstance(cmd, SubmitCmd):
                        await self.on_player_submit(player, cmd)
                    else:
                        await self.on_player_assign(player, cmd)
                except ValidationError as e:
                    log.warning(f"Invalid message from player {player_id}: {e}")
                    await send(ws, ErrorMessage(type="error", message="invalid message"))
                except WebSocketException:
                    break
                except Exception:
                    traceback.print_exc()
                    await send(ws, ErrorMessage(type="error", message="internal error"))
        finally:
            if self.players.get(player_id) is player:
                del self.players[player_id]
            log.info(f"Minigame player disconnected: {player_id}")

    async def on_player_submit(self, player: MinigamePlayer, cmd: SubmitCmd) -> None:
        if self.puzzle_state is None:
            await send(player.ws, ErrorMessage(type="error", message="no active puzzle"))
            return

        now = time.monotonic()
        if now - player.last_attempt < ATTEMPT_RATE_LIMIT:
            remaining = ATTEMPT_RATE_LIMIT - (now - player.last_attempt)
            await send(player.ws, ErrorMessage(type="error", message=f"rate limited, wait {remaining:.1f}s"))
            return
        player.last_attempt = now

        if player.earned_award_idx is not None:
            await send(player.ws, ErrorMessage(type="error", message="already earned an award this puzzle"))
            return

        ps = self.puzzle_state

        if cmd.solution != ps.correct_solution:
            await send(player.ws, FeedbackMessage(type="incorrect"))
            return

        await send(player.ws, FeedbackMessage(type="correct"))

        if ps.next_award_idx >= len(ps.awards):
            return

        award_idx = ps.next_award_idx
        ps.next_award_idx += 1
        player.earned_award_idx = award_idx
        award = ps.awards[award_idx]

        await send(player.ws, AwardMessage(type="award", debuff=award.model_dump(), award_idx=award_idx))
        await self.broadcast(
            AwardGrantedMessage(
                type="award_granted",
                award_idx=award_idx,
                awards_remaining=len(ps.awards) - ps.next_award_idx,
            )
        )
        log.info(f"Player {player.id} earned award {award_idx}: {award.name}")

    async def on_player_assign(self, player: MinigamePlayer, cmd: AssignCmd) -> None:
        if self.puzzle_state is None:
            await send(player.ws, ErrorMessage(type="error", message="no active puzzle"))
            return

        target = cmd.target
        award_idx = cmd.award_idx
        ps = self.puzzle_state

        if player.earned_award_idx != award_idx:
            await send(player.ws, ErrorMessage(type="error", message="you do not hold this award"))
            return

        if target not in ps.debuffs_by_player:
            await send(player.ws, ErrorMessage(type="error", message=f"unknown player {target!r}"))
            return

        if ps.debuffs_for(target) >= ps.debuff_cap():
            await send(player.ws, LimitReachedMessage(type="limit_reached", target=target))
            return

        award = ps.awards[award_idx]
        player.earned_award_idx = None
        ps.debuffs_by_player[target].append(award)

        await send(player.ws, AssignedMessage(type="assigned", target=target))
        await self.broadcast(DebuffAssignedMessage(type="debuff_assigned", debuff_name=award.name, target=target))

        if self.main_game_ws is not None:
            try:
                await send(
                    self.main_game_ws,
                    AdministerDebuffCmd(
                        type="administer_debuff",
                        player=target,
                        name=award.name,
                        debuff_type=award.type,
                        strength=award.strength,
                        duration=award.duration,
                    ),
                )
                log.info(f"Forwarded debuff {award.name!r} to main game for player {target}")
            except Exception:
                log.exception("Failed to send administer_debuff to main game server")
        else:
            log.warning("No main game server connected; debuff not forwarded")

    # ── WebSocket dispatcher ───────────────────────────────────────────────────

    async def ws_handler(self, ws: ServerConnection) -> None:
        assert ws.request is not None

        secret = ws.request.headers.get("X-Secret", "")
        if secret and secret == ADMIN_PASSWORD:
            await self.handle_main_game(ws)
            return

        # Wait for login message
        try:
            raw = await anext(aiter(ws))
            msg = json.loads(raw)
            login = LoginCmd.model_validate(msg)
        except (StopAsyncIteration, ValidationError, json.JSONDecodeError):
            log.warning("Player disconnected or sent invalid login")
            await send(ws, ErrorMessage(type="error", message="expected login message"))
            await ws.close()
            return

        await self.handle_player(ws, login.id)


# ── Entry point ────────────────────────────────────────────────────────────────


async def main() -> None:
    loop = asyncio.get_event_loop()
    done = asyncio.Event()

    loop.add_signal_handler(signal.SIGINT, done.set)
    loop.add_signal_handler(signal.SIGTERM, done.set)

    server = MinigameServer()
    async with serve(server.ws_handler, "0.0.0.0", PORT):
        log.info(f"Minigame server listening on port {PORT}")
        await done.wait()

    log.info("Shutting down")


if __name__ == "__main__":
    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD environment variable not set")
    basicConfig(level=INFO, format="%(asctime)s %(levelname)s %(message)s")
    if environ.get("DEBUG"):
        log.setLevel(DEBUG)
    asyncio.run(main())
