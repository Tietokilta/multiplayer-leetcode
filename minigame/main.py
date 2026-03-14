import asyncio
import json
import math
import random
import signal
import time
import traceback
from dataclasses import dataclass, field
from logging import DEBUG, INFO, basicConfig, getLogger
from os import environ
from typing import Annotated, Any, Literal, TypedDict

import jwt
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from websockets import ServerConnection, WebSocketException, serve

log = getLogger(__name__)

ADMIN_PASSWORD = environ.get("ADMIN_PASSWORD")
MINIGAME_JWT_SECRET = environ.get("MINIGAME_JWT_SECRET")
HOST = environ.get("HOST", "0.0.0.0")
PORT = int(environ.get("PORT", "6978"))
ATTEMPT_RATE_LIMIT = 5.0  # seconds between attempts per minigame player
GOOD_PLAYER_COOLDOWN = int(environ.get("GOOD_PLAYER_COOLDOWN", "1"))  # puzzles to skip after earning an award


# ── Solution comparison ────────────────────────────────────────────────────────

# Operators where (a OP b) == (b OP a)
_COMMUTATIVE_OPS: frozenset[str] = frozenset(["==", "!=", "+", "*", "&", "|", "^", "and", "or"])

# Operator precedence — lower number splits first (= lower Python precedence).
# Keywords that introduce clauses are given the lowest numbers so they split
# the line before any expression operator.
_OP_PREC: dict[str, int] = {
    "if": -3, "elif": -3, "for": -3, "while": -3, "return": -3, "else": -3,
    ":": -2, ";": -2,
    ",": -1,
    "or": 0, "and": 1,
    "==": 2, "!=": 2, "<": 2, ">": 2, "<=": 2, ">=": 2,
    "|": 3, "^": 4, "&": 5,
    "+": 6, "-": 6,
    "*": 7, "/": 7, "//": 7, "%": 7,
}

_OPEN: frozenset[str] = frozenset("([{")
_CLOSE: frozenset[str] = frozenset(")]}")
_MATCHING_CLOSE: dict[str, str] = {"(": ")", "[": "]", "{": "}"}


def _extract_tokens(line: list[str | int]) -> list[str | int]:
    """Strip pure-whitespace strings; keep token strings and any unfilled slots."""
    return [x for x in line if not (isinstance(x, str) and not x.strip())]


def _find_split_op(tokens: list[str | int]) -> int | None:
    """Return the index of the rightmost lowest-precedence operator at bracket depth 0."""
    depth = 0
    best_idx: int | None = None
    best_prec: int | None = None
    for i, tok in enumerate(tokens):
        if not isinstance(tok, str):
            continue
        if tok in _OPEN:
            depth += 1
        elif tok in _CLOSE:
            depth -= 1
        elif depth == 0 and tok in _OP_PREC:
            prec = _OP_PREC[tok]
            if best_prec is None or prec <= best_prec:  # <= keeps rightmost
                best_prec = prec
                best_idx = i
    return best_idx


def _find_bracket_end(tokens: list[str | int], start: int) -> int:
    """Return the index of the matching closing bracket for tokens[start], or -1."""
    open_tok = tokens[start]
    assert isinstance(open_tok, str)
    close_tok = _MATCHING_CLOSE[open_tok]
    depth = 1
    for i in range(start + 1, len(tokens)):
        tok = tokens[i]
        if not isinstance(tok, str):
            continue
        if tok == open_tok:
            depth += 1
        elif tok == close_tok:
            depth -= 1
            if depth == 0:
                return i
    return -1


def _token_seqs_equiv(sub: list[str | int], cor: list[str | int]) -> bool:
    """Return True if *sub* is commutatively equivalent to *cor*."""
    if sub == cor:
        return True

    # Strategy 1: split at the lowest-precedence operator in *cor* and try
    # both orderings when that operator is commutative.
    split_idx = _find_split_op(cor)
    if split_idx is not None:
        op = cor[split_idx]
        assert isinstance(op, str)
        cor_left = cor[:split_idx]
        cor_right = cor[split_idx + 1:]
        depth = 0
        for i, tok in enumerate(sub):
            if not isinstance(tok, str):
                continue
            if tok in _OPEN:
                depth += 1
            elif tok in _CLOSE:
                depth -= 1
            elif depth == 0 and tok == op:
                sl, sr = sub[:i], sub[i + 1:]
                if op in _COMMUTATIVE_OPS:
                    if _token_seqs_equiv(sl, cor_left) and _token_seqs_equiv(sr, cor_right):
                        return True
                    if _token_seqs_equiv(sl, cor_right) and _token_seqs_equiv(sr, cor_left):
                        return True
                else:
                    if _token_seqs_equiv(sl, cor_left) and _token_seqs_equiv(sr, cor_right):
                        return True

    # Strategy 2: element-by-element, recursing into matching bracket pairs so
    # commutativity inside e.g. range(a + b) is also handled.
    if len(sub) != len(cor):
        return False
    i = 0
    while i < len(cor):
        c, s = cor[i], sub[i]
        if isinstance(c, str) and c in _OPEN:
            if not (isinstance(s, str) and s == c):
                return False
            ce = _find_bracket_end(cor, i)
            se = _find_bracket_end(sub, i)
            if ce < 0 or se < 0 or ce != se:
                return False
            if not _token_seqs_equiv(sub[i + 1 : se], cor[i + 1 : ce]):
                return False
            i = ce + 1
        else:
            if s != c:
                return False
            i += 1
    return True


def _solutions_equiv(submitted: list[list[str | int]], correct: list[list[str | int]]) -> bool:
    """Return True if submitted solution matches correct accounting for commutativity."""
    if len(submitted) != len(correct):
        return False
    return all(
        _token_seqs_equiv(_extract_tokens(s), _extract_tokens(c))
        for s, c in zip(submitted, correct)
    )


# ── Inbound models (Pydantic) ──────────────────────────────────────────────────


class DebuffModel(BaseModel):
    name: str
    debuff_type: str
    strength: float
    duration: float


class PuzzleActivatedCmd(BaseModel):
    type: Literal["puzzle_activated"]
    players: list[str]
    awards: list[DebuffModel]
    tokens: list[str]
    solution_lines: list[list[str | int]]
    correct_solution: list[list[str | int]]
    template: str


class LoginCmd(BaseModel):
    type: Literal["login"]
    token: str


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
    num_awards: int
    template: str


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
    name: str


class CooldownMessage(TypedDict):
    type: Literal["cooldown"]
    puzzles_remaining: int


class ErrorMessage(TypedDict):
    type: Literal["error"]
    message: str


type MessageOut = PuzzleMessage | FeedbackMessage | AwardMessage | AwardGrantedMessage | DebuffAssignedMessage | AssignedMessage | LimitReachedMessage | WelcomeMessage | CooldownMessage | ErrorMessage


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
    award_used: bool = False
    cooldown_remaining: int = 0


@dataclass
class PuzzleState:
    tokens: list[str]
    solution_lines: list[list[str | int]]
    correct_solution: list[list[str | int]]
    awards: list[DebuffModel]
    main_game_players: list[str]
    template: str
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
        shuffled_tokens = list(cmd.tokens)
        random.shuffle(shuffled_tokens)
        self.puzzle_state = PuzzleState(
            tokens=shuffled_tokens,
            solution_lines=cmd.solution_lines,
            correct_solution=cmd.correct_solution,
            awards=cmd.awards,
            main_game_players=cmd.players,
            template=cmd.template,
            debuffs_by_player={p: [] for p in cmd.players},
        )

        for player in self.players.values():
            player.earned_award_idx = None
            player.award_used = False
            player.last_attempt = 0.0
            player.cooldown_remaining = max(0, player.cooldown_remaining - 1)
            await send(player.ws, CooldownMessage(type="cooldown", puzzles_remaining=player.cooldown_remaining))

        await self.broadcast(
            PuzzleMessage(
                type="puzzle",
                tokens=self.puzzle_state.tokens,
                solution_lines=self.puzzle_state.solution_lines,
                players=self.puzzle_state.main_game_players,
                num_awards=len(self.puzzle_state.awards),
                template=self.puzzle_state.template,
            )
        )
        log.info(
            f"Puzzle activated: {len(cmd.tokens)} tokens, "
            f"{len(cmd.awards)} awards, {len(cmd.players)} main game players"
        )

    # ── Minigame players ───────────────────────────────────────────────────────

    async def handle_player(self, ws: ServerConnection, player_id: str, player_name: str = "") -> None:
        log.info(f"Minigame player connected: {player_id}")

        if existing := self.players.get(player_id):
            try:
                log.info(f"Player {player_id} already connected, closing old connection")
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
                    name=player_name or player_id,
                ),
            )

            if self.puzzle_state is not None:
                ps = self.puzzle_state
                await send(
                    ws,
                    PuzzleMessage(
                        type="puzzle",
                        tokens=ps.tokens,
                        solution_lines=ps.solution_lines,
                        players=ps.main_game_players,
                        num_awards=len(ps.awards),
                        template=ps.template,
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

            await send(ws, CooldownMessage(type="cooldown", puzzles_remaining=player.cooldown_remaining))

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

        if player.award_used:
            await send(player.ws, ErrorMessage(type="error", message="already used your award this puzzle"))
            return

        ps = self.puzzle_state

        if not _solutions_equiv(cmd.solution, ps.correct_solution):
            await send(player.ws, FeedbackMessage(type="incorrect"))
            return

        await send(player.ws, FeedbackMessage(type="correct"))

        if player.cooldown_remaining > 0:
            await send(player.ws, CooldownMessage(type="cooldown", puzzles_remaining=player.cooldown_remaining))
            return

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
        player.cooldown_remaining = GOOD_PLAYER_COOLDOWN
        log.info(f"Player {player.id} earned award {award_idx}: {award.name} (cooldown set to {GOOD_PLAYER_COOLDOWN})")
        await send(player.ws, CooldownMessage(type="cooldown", puzzles_remaining=player.cooldown_remaining))

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
        player.award_used = True
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
                        debuff_type=award.debuff_type,
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

        try:
            payload = jwt.decode(  # pyright: ignore[reportUnknownMemberType]
                login.token, MINIGAME_JWT_SECRET, algorithms=["HS256"]
            )
            player_id: str = payload["sub"]
            player_name: str = payload.get("name", player_id)
        except jwt.InvalidTokenError as e:
            log.warning(f"Invalid JWT from player: {e}")
            await send(ws, ErrorMessage(type="error", message="invalid token"))
            await ws.close()
            return
        except KeyError:
            log.warning("JWT missing 'sub' claim")
            await send(ws, ErrorMessage(type="error", message="invalid token"))
            await ws.close()
            return

        await self.handle_player(ws, player_id, player_name)


# ── Entry point ────────────────────────────────────────────────────────────────


async def main() -> None:
    loop = asyncio.get_event_loop()
    done = asyncio.Event()

    loop.add_signal_handler(signal.SIGINT, done.set)
    loop.add_signal_handler(signal.SIGTERM, done.set)

    server = MinigameServer()
    async with serve(server.ws_handler, HOST, PORT):
        log.info(f"Minigame server listening on {HOST}:{PORT}")
        await done.wait()

    log.info("Shutting down")


if __name__ == "__main__":
    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD environment variable not set")
    if not MINIGAME_JWT_SECRET:
        raise RuntimeError("MINIGAME_JWT_SECRET environment variable not set")
    basicConfig(level=INFO, format="%(asctime)s %(levelname)s %(message)s")
    if environ.get("DEBUG"):
        log.setLevel(DEBUG)
    asyncio.run(main())
