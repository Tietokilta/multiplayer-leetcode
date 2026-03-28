import asyncio
import json
import re
import signal
import time
import traceback
from dataclasses import dataclass, field
from logging import DEBUG, INFO, basicConfig, getLogger
from os import environ
from pathlib import Path
from subprocess import PIPE, STDOUT
from typing import AsyncGenerator, Literal, Never, NotRequired, TypedDict, cast

import aiosqlite
from inotify_simple import Event as InotifyEvent, INotify, flags
from openrouter import OpenRouter
from websockets import ClientConnection, ConnectionClosed, ServerConnection, WebSocketException, connect, serve
from yaml import safe_load

log = getLogger(__name__)

ADMIN_PASSWORD = environ.get("ADMIN_PASSWORD")
GENERATED_ID_RE = re.compile(r"^[0-9a-f]{12}$")
MINIGAME_BACKEND = environ.get("MINIGAME_BACKEND")
OPENROUTER_KEY = environ.get("OPENROUTER_KEY")
SEPARATOR = "=== END EXPECTED OUTPUT ===\n"

MINIGAME_AWARDS: list["MinigameAward"] = []

_SOLUTION_TOKEN_RE = re.compile(
    r'"(?:[^"\\]|\\.)*"'
    r"|'(?:[^'\\]|\\.)*'"
    r"|[a-zA-Z_]\w*"
    r"|[0-9]+(?:\.[0-9]+)?"
    r"|[+\-*/%&|^~<>=!]+"
    r"|[()[\]{},.:;@]"
)


def tokenize_solution(solution: str) -> tuple[list[str], list[list[str | int]], list[list[str | int]]]:
    """Tokenize a model solution into a token list and a line structure.

    Returns:
        tokens: flat list of token strings (words, operators, punctuation)
        lines: one entry per line; each entry is a list of str (whitespace gaps)
               or int (index into tokens)
    """
    tokens: list[str] = []
    lines: list[list[str | int]] = []
    correct: list[list[str | int]] = []
    for line in solution.splitlines():
        line_parts: list[str | int] = []
        corr_parts: list[str | int] = []
        last_end = 0
        for m in _SOLUTION_TOKEN_RE.finditer(line):
            if m.start() > last_end:
                line_parts.append(line[last_end : m.start()])
                corr_parts.append(line[last_end : m.start()])
            line_parts.append(-1)
            corr_parts.append(m.group())
            tokens.append(m.group())
            last_end = m.end()
        if last_end < len(line):
            line_parts.append(line[last_end:])
            corr_parts.append(line[last_end:])
        lines.append(line_parts)
        correct.append(corr_parts)
    return tokens, lines, correct


class LoginCmd(TypedDict):
    type: Literal["login"]
    id: str


class EditCmd(TypedDict):
    type: Literal["edit"]
    code: str
    row: int
    col: int


class SubmitCmd(TypedDict):
    type: Literal["submit"]


class AdminLoginCmd(TypedDict):
    type: Literal["admin_login"]
    password: str


class AdminPlayerCmd(TypedDict):
    type: Literal["add_player"] | Literal["remove_player"]
    name: str


class AdminSpectateCmd(TypedDict):
    type: Literal["spectate"]
    players: list[str]


class AdminPuzzleCmd(TypedDict):
    type: Literal["change_puzzle"]
    puzzle: str


class AdminReloadPuzzlesCmd(TypedDict):
    type: Literal["reload_puzzles"]


class AdminDebuffCmd(TypedDict):
    type: Literal["administer_debuff"]
    players: list[str]
    name: str
    debuff_type: str
    strength: float
    duration: float


class MinigameAward(TypedDict):
    name: str
    type: str
    strength: float
    duration: float


class MinigamePuzzleActivated(TypedDict):
    type: Literal["puzzle_activated"]
    players: list[str]
    awards: list[MinigameAward]
    tokens: list[str]
    solution_lines: list[list[str | int]]
    correct_solution: list[list[str | int]]
    template: str


class MinigameDebuffCmd(TypedDict):
    """Debuff assignment from the minigame backend (single player target)."""

    type: Literal["administer_debuff"]
    player: str
    name: str
    debuff_type: str
    strength: float
    duration: float


class DebuffStateCmd(TypedDict):
    type: Literal["debuff_state"]
    name: str
    payload: object


class AssignIdCmd(TypedDict):
    type: Literal["assign_id"]
    generated_id: str
    player: str


type WsCmd = LoginCmd | EditCmd | SubmitCmd | AdminLoginCmd | AdminPlayerCmd | AdminSpectateCmd | AdminPuzzleCmd | AdminReloadPuzzlesCmd | AdminDebuffCmd | DebuffStateCmd | AssignIdCmd


class WelcomeMessage(TypedDict):
    type: Literal["welcome"]
    name: str


class AdminWelcomeMessage(TypedDict):
    type: Literal["admin_welcome"]


class CodeRunOutput(TypedDict):
    type: Literal["output"]
    content: str


class CodeRunState(TypedDict):
    type: Literal["state"]
    state: Literal["running", "valid", "invalid", "expired"]
    error: NotRequired[str]


class ActionError(TypedDict):
    type: Literal["error"]
    message: str


class PuzzleJson(TypedDict):
    """A puzzle to be shown to the player."""

    type: Literal["puzzle"]
    title: str
    description: str


class PlayerJson(TypedDict):
    """The current state of a player's code editor, sent on startup."""

    type: Literal["editor"]
    code: str
    row: int
    col: int


class PuzzleListItem(TypedDict):
    """A puzzle in the puzzle list."""

    id: str
    title: str
    description: str


class PuzzleListMessage(TypedDict):
    """List of available puzzles sent to admin."""

    type: Literal["puzzles"]
    puzzles: list[PuzzleListItem]
    current: str | None


class PlayerListMessage(TypedDict):
    """List of players sent to admin."""

    type: Literal["players"]
    players: list[str]


class SpectateMessage(TypedDict):
    """Editor state update for a specific player, sent to spectating admin."""

    type: Literal["spectate_editor"]
    player: str
    code: str
    row: int
    col: int


class SpectateStateMessage(TypedDict):
    """Submission state update for a specific player, sent to spectating admin."""

    type: Literal["spectate_state"]
    player: str
    state: Literal["running", "valid", "invalid", "expired"] | None
    error: NotRequired[str]


class SpectateOutputMessage(TypedDict):
    """Submission output for a specific player, sent to spectating admin."""

    type: Literal["spectate_output"]
    player: str
    content: str


class DebuffItem(TypedDict):
    name: str
    type: str
    strength: float
    duration: float  # remaining seconds from now


class DebuffMessage(TypedDict):
    type: Literal["debuffs"]
    debuffs: list[DebuffItem]


class SpectateDebuffMessage(TypedDict):
    type: Literal["spectate_debuffs"]
    player: str
    debuffs: list[DebuffItem]


class SpectateDebuffStateMessage(TypedDict):
    type: Literal["spectate_debuff_state"]
    player: str
    name: str
    payload: object


class PendingLoginsMessage(TypedDict):
    type: Literal["pending_logins"]
    ids: list[str]


type WsMessage = WelcomeMessage | AdminWelcomeMessage | CodeRunOutput | CodeRunState | ActionError | PuzzleJson | PlayerJson | PuzzleListMessage | PlayerListMessage | SpectateMessage | SpectateStateMessage | SpectateOutputMessage | DebuffMessage | SpectateDebuffMessage | SpectateDebuffStateMessage | PendingLoginsMessage


LLM_MODEL = "openai/gpt-5.3-codex"


DEBUFF_USER_TEMPLATE = """### Task
{task}

### User Code
```
{code}
```"""


async def run_code(
    code: str, input: str, submission: "Submission"
) -> AsyncGenerator[CodeRunOutput | CodeRunState, None]:
    """
    Runs the given code in a restricted Docker container, yielding output and results incrementally.
    """
    yield {"type": "state", "state": "running"}

    args = [
        "docker",
        "run",
        "--rm",
        # No network access
        "--network=none",
        # Resource limits
        "--pids-limit=10",
        "--memory=256m",
        "--cpus=0.5",
        # Read-only filesystem
        "--read-only",
        # No new privileges
        "--security-opt",
        "no-new-privileges",
        # Strictly limit syscalls
        "--security-opt",
        "seccomp=seccomp-strict.json",
        # Mask sysfs
        "--tmpfs",
        "/sys:ro",
        # Use slim python image
        "python:3.14-slim",
        # Set a 2 second timeout
        "timeout",
        "--signal=SIGKILL",
        "--preserve-status",
        "2s",
        "python3",
        "-I",  # Isolated mode (ignore environment variables)
        "-B",  # Don't write .pyc files
        "-E",  # Ignore environment variables
        "-u",  # Unbuffered output
        "-s",  # Don't add the default path to sys.path
        "-c",
        code,
    ]
    log.debug("Running code with args: %s", args)
    process = await asyncio.create_subprocess_exec(
        *args,
        stdin=PIPE,
        stdout=PIPE,
        stderr=STDOUT,
    )
    stdin: asyncio.StreamWriter = process.stdin  # type: ignore
    stdout: asyncio.StreamReader = process.stdout  # type: ignore

    if input:
        stdin.write(input.encode("utf-8"))
        await stdin.drain()

    # Buffer pre-separator output; only stream actual output (post-separator) to player
    expected_output = ""
    sep_found = False

    try:
        # Read incremental output and yield it
        async with asyncio.timeout(3):  # Slightly longer than process timeout to get final output
            while True:
                chunk = await stdout.read(1024)
                if not chunk:
                    # EOF, done
                    await process.wait()
                    break
                decoded = chunk.decode("iso-8859-1")  # Decode as latin-1 to avoid errors
                log.debug(f"Process output: {decoded!r}")
                if not sep_found:
                    expected_output += decoded
                    expected_output, sep, remainder = expected_output.partition(SEPARATOR)
                    if sep:
                        sep_found = True
                        if remainder:
                            yield {"type": "output", "content": remainder}
                            submission.output += remainder
                else:
                    yield {"type": "output", "content": decoded}
                    submission.output += decoded
                if len(expected_output) + len(submission.output) >= 100 * 1024:  # 100 KB limit
                    process.kill()
                    await process.wait()
                    submission.status = "invalid"
                    submission.error = "Output limit exceeded"
                    break
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        submission.status = "invalid"
        submission.error = "Execution timed out"
    else:
        returncode = await process.wait()
        if returncode == 137:  # SIGKILL due to timeout or OOM
            submission.status = "invalid"
            submission.error = "Execution timed out or memory limit exceeded"
        elif returncode != 0:
            if not sep_found:
                # Might be a syntax error; output everything
                yield {"type": "output", "content": expected_output}
                submission.output = expected_output
            submission.status = "invalid"
            submission.error = f"Process exited with code {returncode}"
        else:
            if not sep_found:
                submission.status = "invalid"
                submission.error = "Missing expected output separator"
            # TODO: fuzzier matching?
            elif expected_output.strip() == submission.output.strip():
                submission.status = "valid"
            else:
                submission.status = "invalid"
                submission.error = "Output did not match expected result"
    finally:
        yield {"type": "state", "state": submission.status, "error": submission.error}


@dataclass
class Debuff:
    name: str
    debuff_type: str
    strength: float
    start: float  # time.monotonic() when administered
    duration: float  # total duration in seconds


@dataclass
class Player:
    name: str
    score: int
    code: str
    col: int
    row: int
    conn_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    tx_queue: asyncio.Queue[WsMessage | None] | None = None
    debuffs: list[Debuff] = field(default_factory=list[Debuff])

    def editor_json(self) -> PlayerJson:
        """Returns the current editor state as JSON."""
        return {
            "type": "editor",
            "code": self.code,
            "row": self.row,
            "col": self.col,
        }

    def debuffs_json(self) -> DebuffMessage:
        """Returns active debuffs with remaining durations as JSON."""
        now = time.monotonic()
        return {
            "type": "debuffs",
            "debuffs": [
                {
                    "name": d.name,
                    "type": d.debuff_type,
                    "strength": d.strength,
                    "duration": d.start + d.duration - now,
                }
                for d in self.debuffs
                if d.start + d.duration > now
            ],
        }

    def send(self, message: WsMessage):
        """Send a message to the player's websocket, if connected."""
        if self.tx_queue:
            self.tx_queue.put_nowait(message)

    async def tx_queue_task(self, queue: asyncio.Queue[WsMessage | None], ws: ServerConnection):
        """Task to send messages coming into the tx_queue to the player's websocket."""
        try:
            while True:
                result = await queue.get()
                if result is None:
                    break
                try:
                    await send(ws, result)
                except Exception:
                    break
        finally:
            async with self.conn_lock:
                if self.tx_queue == queue:
                    self.tx_queue = None
            await ws.close()

    async def connected(self, ws: ServerConnection):
        """Disconnects any previous connection for this player and sets up a new one."""
        async with self.conn_lock:
            # Disconnect previous connection if exists
            if self.tx_queue:
                self.tx_queue.put_nowait(None)
            self.tx_queue = queue = asyncio.Queue[WsMessage | None]()
        asyncio.create_task(self.tx_queue_task(queue, ws))


@dataclass
class Puzzle:
    id: str
    title: str
    description: str
    template: str  # code template to start with (| removed)
    raw_template: str  # original template with | cursor marker
    start_pos: tuple[int, int]  # (col, row)
    wrapper: str  # wrapper to insert user code in with format(); must print expected output then SEPARATOR before running user code
    solution_tokens: list[str]
    solution_lines: list[list[str | int]]
    correct_solution: list[list[str | int]]

    def json(self) -> PuzzleJson:
        """Returns the puzzle data as JSON."""
        return {
            "type": "puzzle",
            "title": self.title,
            "description": self.description,
        }


@dataclass
class Submission:
    """State of a player's submission for a puzzle."""

    puzzle: Puzzle
    code: str
    output: str = ""
    status: Literal["running", "valid", "invalid", "expired"] = "running"
    error: str = ""
    task: asyncio.Task[None] | None = None


class AdminConnection:
    """Tracks an admin WebSocket connection and what they're spectating."""

    def __init__(self, ws: ServerConnection):
        self.ws = ws
        self.spectating: set[str] = set()  # player names being spectated, or {"*"} for all

    def is_spectating(self, player: str) -> bool:
        return "*" in self.spectating or player in self.spectating


class PlayerManager:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db
        self.players: dict[str, Player] = {}
        self.submissions: dict[str, Submission] = {}
        self.unsaved: set[str] = set()
        self.puzzles: dict[str, Puzzle] = {}
        self.current_puzzle: Puzzle | None = None
        self.admins: dict[ServerConnection, AdminConnection] = {}
        self.debuff_system_prompts: dict[str, str] = {}
        self.pending_ids: set[str] = set()
        self.id_mapping: dict[str, str] = {}
        self.minigame_puzzle_event = asyncio.Event()
        self.minigame_puzzle_buf: MinigamePuzzleActivated | None = None

    async def load_players(self) -> None:
        """Loads players from the database into memory."""
        async with self.db.execute("SELECT name, score, code, col, row FROM players") as cursor:
            for row in await cursor.fetchall():
                player = Player(*row)
                self.players[player.name] = player

    def get_pending_logins_msg(self) -> PendingLoginsMessage:
        return {"type": "pending_logins", "ids": list(self.pending_ids)}

    async def player_connected(self, name: str, ws: ServerConnection) -> Player | ActionError:
        """Adds a player connecting via websocket."""
        actual_name = self.id_mapping.get(name, name)
        if actual_name not in self.players:
            if GENERATED_ID_RE.match(name):
                self.pending_ids.add(name)
                self.broadcast_to_admins(self.get_pending_logins_msg())
            return {"type": "error", "message": "No such player"}
        player = self.players[actual_name]
        await player.connected(ws)
        return player

    async def switch_puzzle(
        self, id: str, reset_editors: bool = True, expire_submissions: bool = False
    ) -> ActionError | None:
        """Changes the current puzzle to the given one.

        Args:
            id: The puzzle ID to switch to.
            reset_editors: If True, reset all player editors to the puzzle template.
                           If False, only send updated puzzle info without resetting editors.
        """
        if id not in self.puzzles:
            return {"type": "error", "message": "No such puzzle"}
        puzzle = self.puzzles[id]
        # Expire any existing valid submissions if requested, to allow resubmission on the new puzzle
        if expire_submissions:
            await self.db.execute(
                """
                UPDATE submissions
                SET status = 'expired'
                WHERE puzzle_id = ? AND status = 'valid'
                """,
                (puzzle.id,),
            )
            await self.db.commit()
        # Load existing valid submissions for this puzzle
        # Using valid submissions only avoids the need to sort which is annoying in SQLite
        cursor = await self.db.execute(
            """
            SELECT player_name, code, output, status
            FROM submissions
            WHERE puzzle_id = ? AND status = 'valid'
            """,
            (puzzle.id,),
        )
        existing_submissions = await cursor.fetchall()
        # Persist current puzzle to DB
        await self.db.execute(
            "INSERT OR REPLACE INTO game_state (key, value) VALUES ('current_puzzle_id', ?)",
            (puzzle.id,),
        )
        await self.db.commit()
        # Synchronously update state (no further awaits)
        self.current_puzzle = puzzle
        self.broadcast_to_admins(self.get_puzzle_list())
        if MINIGAME_BACKEND:
            self.notify_minigame_puzzle()
        self.submissions.clear()
        for row in existing_submissions:
            if row[0] in self.players:
                self.submissions[row[0]] = Submission(
                    puzzle=puzzle,
                    code=row[1],
                    output=row[2],
                    status=row[3],
                )
        for player in self.players.values():
            existing_submission = None
            if reset_editors:
                if player.name in self.submissions:
                    # Load existing valid submission
                    existing_submission = self.submissions[player.name]
                    player.code = existing_submission.code
                    player.col = 0
                    player.row = 0
                else:
                    # Reset to template
                    player.code = puzzle.template
                    player.col = puzzle.start_pos[0]
                    player.row = puzzle.start_pos[1]
                self.unsaved.add(player.name)
            player.send(puzzle.json())
            if reset_editors:
                player.send(player.editor_json())
                # Notify spectating admins of the reset
                self.notify_spectators(player.name, player.editor_json())
                if existing_submission:
                    player.send({"type": "state", "state": existing_submission.status})
                    player.send({"type": "output", "content": existing_submission.output})
                    self.notify_spectators(player.name, {"type": "state", "state": existing_submission.status})
                    self.notify_spectators(player.name, {"type": "output", "content": existing_submission.output})
        return None

    async def _submit_task(self, player: Player, submission: Submission) -> None:
        """Task to run a player's submission and handle its results."""
        try:
            full_code = submission.puzzle.wrapper.format(submission.code)
            async for result in run_code(full_code, "", submission):
                # Send outputs only if still on the same puzzle
                if self.current_puzzle == submission.puzzle:
                    player.send(result)
                    # Notify spectating admins
                    self.notify_spectators(player.name, result)
        except Exception as e:
            log.error(f"Submission failed for player {player.name}: {e}")
            submission.error = str(e)
            player.send({"type": "output", "content": f"Internal error: {e}\n"})
        finally:
            # Ensure no ghost states
            if submission.status == "running":
                submission.status = "invalid"

            log.info(
                f"Submission finished for player {player.name} with status {submission.status}, error: {submission.error}"
            )
            # TODO: recalculate score based on time, attempts, etc?
            # Save submission to database
            await self.db.execute(
                """
                INSERT INTO submissions (player_name, puzzle_id, code, output, status)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    player.name,
                    submission.puzzle.id,
                    submission.code,
                    submission.output,
                    submission.status,
                ),
            )
            await self.db.commit()

    def submit(self, player: Player) -> ActionError | None:
        """Attempts to submit the player's current code for evaluation. Does not wait for the result."""
        if not self.current_puzzle:
            return {"type": "error", "message": "No puzzle loaded"}

        # Only allow one submission running or valid at a time
        previous = self.submissions.get(player.name)
        if previous and previous.task and not previous.task.done():
            return {"type": "error", "message": "Submission already running"}
        if previous and previous.status == "valid":
            return {"type": "error", "message": "You have already submitted a valid solution"}

        self.submissions[player.name] = submission = Submission(puzzle=self.current_puzzle, code=player.code)
        submission.task = asyncio.create_task(self._submit_task(player, submission))
        # Don't bother saving here - if the server crashes during execution, just resubmit
        return None

    async def reload_puzzles(self):
        """Reloads puzzles from puzzles.yaml."""
        log.info("Reloading puzzles from puzzles.yaml")
        try:
            data = safe_load(open("puzzles.yaml", "r", encoding="utf-8"))
            puzzles: dict[str, Puzzle] = {}
            for entry in data:
                start_code = entry["template"].partition("|")[0]
                start_row = start_code.count("\n")
                start_col = len(start_code.rpartition("\n")[2])
                raw_solution = entry.get("modelSolution", "").strip()
                solution_tokens, solution_lines, correct_solution = tokenize_solution(raw_solution)
                puzzle = Puzzle(
                    **{k: v for k, v in entry.items() if k not in ("template", "start_pos", "modelSolution")},
                    template=entry["template"].replace("|", ""),
                    raw_template=entry["template"],
                    start_pos=(start_col, start_row),
                    solution_tokens=solution_tokens,
                    solution_lines=solution_lines,
                    correct_solution=correct_solution,
                )
                puzzles[puzzle.id] = puzzle
        except Exception:
            log.exception("Failed to load puzzles")
        else:
            old_puzzle = self.current_puzzle
            self.puzzles = puzzles
            # Notify admins of puzzle list change
            self.broadcast_to_admins(self.get_puzzle_list())
            # If current puzzle changed, resend its info to users
            if old_puzzle and old_puzzle.id in puzzles:
                new_puzzle = puzzles[old_puzzle.id]
                # Check if anything changed
                if old_puzzle != new_puzzle:
                    # Reset editors only if template or start position changed
                    reset_editors = old_puzzle.template != new_puzzle.template
                    log.info(f"Current puzzle '{old_puzzle.id}' changed, resending (reset_editors={reset_editors})")
                    await self.switch_puzzle(old_puzzle.id, reset_editors=reset_editors)

    def reload_prompts(self):
        """Reloads debuff system prompts from prompts.yaml."""
        log.info("Reloading prompts from prompts.yaml")
        try:
            data = safe_load(open("prompts.yaml", "r", encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("prompts.yaml must be a mapping")
            data = cast(dict[str, str], data)
        except Exception:
            log.exception("Failed to load prompts")
        else:
            self.debuff_system_prompts = data
            log.info(f"Loaded {len(data)} debuff prompts: {list(data)}")

    def get_puzzle_list(self) -> PuzzleListMessage:
        """Returns the list of available puzzles for admin."""
        return {
            "type": "puzzles",
            "puzzles": [{"id": p.id, "title": p.title, "description": p.description} for p in self.puzzles.values()],
            "current": self.current_puzzle.id if self.current_puzzle else None,
        }

    def get_player_list(self) -> PlayerListMessage:
        """Returns the list of players for admin."""
        return {
            "type": "players",
            "players": list(self.players.keys()),
        }

    def broadcast_to_admins(self, message: WsMessage):
        """Sends a message to all connected admins."""
        data = json.dumps(message)
        for admin in self.admins.values():
            try:
                # TODO: use queue tasks like with players
                asyncio.create_task(admin.ws.send(data, True))
            except Exception:
                pass  # Ignore send errors

    def notify_spectators(
        self, player_name: str, message: CodeRunOutput | CodeRunState | PlayerJson | DebuffMessage | DebuffStateCmd
    ):
        """Sends a message to all admins spectating a specific player."""

        converted: WsMessage
        if message["type"] == "output":
            converted = {
                **message,
                "type": "spectate_output",
                "player": player_name,
            }
        elif message["type"] == "state":
            converted = {
                **message,
                "type": "spectate_state",
                "player": player_name,
            }
        elif message["type"] == "editor":
            converted = {
                **message,
                "type": "spectate_editor",
                "player": player_name,
            }
        elif message["type"] == "debuffs":
            converted = {
                **message,
                "type": "spectate_debuffs",
                "player": player_name,
            }
        elif message["type"] == "debuff_state":
            converted = {
                **message,
                "type": "spectate_debuff_state",
                "player": player_name,
            }
        else:
            _: Never = message
            raise ValueError("notify_spectators passed invalid message type")

        data = json.dumps(converted)
        for admin in self.admins.values():
            if converted["type"] == "spectate_state" or admin.is_spectating(player_name):
                try:
                    # TODO: use queue tasks like with players
                    asyncio.create_task(admin.ws.send(data, True))
                except Exception:
                    pass

    async def add_player(self, name: str) -> ActionError | None:
        """Adds a new player to the database and memory."""
        if name in self.players:
            return {"type": "error", "message": "Player already exists"}
        if not name or len(name) > 15:
            return {"type": "error", "message": "Invalid player name"}
        # Add to database
        await self.db.execute(
            "INSERT INTO players (name) VALUES (?)",
            (name,),
        )
        await self.db.commit()
        # Add to memory
        player = Player(name=name, score=0, code="", col=0, row=0)
        self.players[name] = player
        # Notify admins
        self.broadcast_to_admins(self.get_player_list())
        # Send initial state to wildcard spectators
        for admin in self.admins.values():
            if "*" in admin.spectating:
                asyncio.create_task(
                    admin.ws.send(
                        json.dumps(
                            {
                                "type": "spectate_editor",
                                "player": name,
                                "code": player.code,
                                "row": player.row,
                                "col": player.col,
                            }
                        ),
                        True,
                    )
                )
        log.info(f"Added player: {name}")
        return None

    async def remove_player(self, name: str) -> ActionError | None:
        """Removes a player from the database and memory."""
        if name not in self.players:
            return {"type": "error", "message": "Player not found"}
        # Remove from database
        await self.db.execute("DELETE FROM players WHERE name = ?", (name,))
        await self.db.commit()
        # Remove from memory
        del self.players[name]
        # Notify admins
        self.broadcast_to_admins(self.get_player_list())
        log.info(f"Removed player: {name}")
        return None

    async def _apply_llm_debuff(
        self, player: Player, system_prompt: str, code: str, duration: float, delay: float = 0.0
    ) -> None:
        """Calls OpenRouter to transform the player's code, then replaces their editor state with the result."""
        if not OPENROUTER_KEY or not self.current_puzzle:
            return
        if delay > 0:
            log.info(f"LLM debuff call for player {player.name} delayed by {delay:.2f}s")
            await asyncio.sleep(delay)
        task_desc = self.current_puzzle.description
        user_content = DEBUFF_USER_TEMPLATE.format(task=task_desc, code=code)
        start_at = time.monotonic()
        # Entry is ~3.5s, exit is ~4s, aim for the result to be returned around 2/3 of the way through the "active" part
        min_done_at = start_at + 3.5 + max(duration - delay - 7.5, 0) * 0.67
        log.info(f"LLM debuff call starting for player {player.name} (model={LLM_MODEL})")
        log.debug(f"LLM debuff system prompt: {system_prompt}")
        log.debug(f"LLM debuff user content: {user_content}")
        try:
            async with OpenRouter(api_key=OPENROUTER_KEY) as client:
                res = await client.chat.send_async(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                    model=LLM_MODEL,
                    stream=False,
                )
            new_code = res.choices[0].message.content
            if not isinstance(new_code, str):
                log.warning(f"LLM debuff call returned empty content for player {player.name}")
                return
            duration = time.monotonic() - start_at
            log.info(f"LLM debuff call succeeded for player {player.name} ({len(new_code)} chars, {duration:.2f}s)")
            log.debug(f"LLM debuff result: {new_code}")
            # Strip triple-backtick fences and surrounding whitespace
            new_code = (
                new_code.strip()
                .removeprefix("```python")
                .removeprefix("```py")
                .removeprefix("```")
                .removesuffix("```")
                .strip()
            )
        except Exception:
            log.exception(f"LLM debuff call failed for player {player.name}")
            return
        # Wait until at least half the debuff duration has elapsed
        remaining = min_done_at - time.monotonic()
        if remaining > 0:
            await asyncio.sleep(remaining)
        # Apply the new code (same as puzzle reset)
        player.code = new_code
        player.col = 0
        player.row = 0
        self.unsaved.add(player.name)
        player.send(player.editor_json())
        self.notify_spectators(player.name, player.editor_json())

    def administer_debuff(self, cmd: AdminDebuffCmd) -> ActionError | None:
        """Administers a debuff to the listed players. Duration stacks with existing same-type debuffs."""
        now = time.monotonic()
        found_any = False
        for player_name in cmd["players"]:
            player = self.players.get(player_name)
            if not player:
                continue
            found_any = True
            log.info(
                f"Administering debuff {cmd['name']!r} to player {player_name} (duration={cmd['duration']}s, strength={cmd['strength']})"
            )
            # Remove expired debuffs
            player.debuffs = [d for d in player.debuffs if d.start + d.duration > now]
            # Find longest remaining duration of same-type debuffs to stack with
            same_type = [d for d in player.debuffs if d.debuff_type == cmd["debuff_type"]]
            extra = max((d.start + d.duration - now for d in same_type), default=0.0)
            duration = cmd["duration"] + extra
            # Administer new debuff
            player.debuffs.append(
                Debuff(
                    name=cmd["name"],
                    debuff_type=cmd["debuff_type"],
                    strength=cmd["strength"],
                    start=now,
                    duration=duration,
                )
            )
            msg: DebuffMessage = {
                "type": "debuffs",
                "debuffs": [
                    {
                        "name": cmd["name"],
                        "type": cmd["debuff_type"],
                        "strength": cmd["strength"],
                        "duration": duration,
                    }
                ],
            }
            player.send(msg)
            self.notify_spectators(player_name, msg)
            # If this debuff type has an LLM prompt, launch the code-transform task
            if system_prompt := self.debuff_system_prompts.get(cmd["name"]):
                asyncio.create_task(self._apply_llm_debuff(player, system_prompt, player.code, duration, delay=extra))
        if not found_any:
            return {"type": "error", "message": "No such player"}
        return None

    def notify_minigame_puzzle(self) -> None:
        """Buffer the current puzzle for the minigame backend and wake the sender."""
        puzzle = self.current_puzzle
        if not puzzle or not puzzle.solution_tokens:
            return
        self.minigame_puzzle_buf = MinigamePuzzleActivated(
            type="puzzle_activated",
            players=list(self.players.keys()),
            awards=MINIGAME_AWARDS,
            tokens=puzzle.solution_tokens,
            solution_lines=puzzle.solution_lines,
            correct_solution=puzzle.correct_solution,
            template=puzzle.raw_template,
        )
        self.minigame_puzzle_event.set()

    async def minigame_ws_task(self, done: asyncio.Event) -> None:
        """Background task: maintain a WebSocket connection to the minigame backend."""
        url = f"ws://{MINIGAME_BACKEND}:6978"
        headers = {"X-Secret": ADMIN_PASSWORD or ""}
        while not done.is_set():
            try:
                async with connect(url, additional_headers=headers) as ws:
                    log.info("Connected to minigame backend")
                    # Run send/receive concurrently
                    send_task = asyncio.create_task(self._minigame_send_loop(ws, done))
                    try:
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                                if msg.get("type") == "administer_debuff":
                                    debuff_cmd: MinigameDebuffCmd = msg
                                    self.administer_debuff(
                                        AdminDebuffCmd(
                                            type="administer_debuff",
                                            players=[debuff_cmd["player"]],
                                            name=debuff_cmd["name"],
                                            debuff_type=debuff_cmd["debuff_type"],
                                            strength=debuff_cmd["strength"],
                                            duration=debuff_cmd["duration"],
                                        )
                                    )
                                else:
                                    log.warning(f"Unknown message from minigame: {msg.get('type')!r}")
                            except Exception:
                                log.exception("Error handling minigame message")
                    finally:
                        send_task.cancel()
            except asyncio.CancelledError:
                return
            except Exception:
                log.exception("Minigame backend connection error")
            if not done.is_set():
                await asyncio.sleep(1)

    async def _minigame_send_loop(self, ws: ClientConnection, done: asyncio.Event) -> None:
        """Wait for puzzle updates and send them over the minigame WebSocket."""
        try:
            while not done.is_set():
                if self.minigame_puzzle_buf is not None:
                    log.info("Sending puzzle update to minigame backend")
                    puzzle = self.minigame_puzzle_buf
                    self.minigame_puzzle_buf = None
                    self.minigame_puzzle_event.clear()
                    await ws.send(json.dumps(puzzle))
                await self.minigame_puzzle_event.wait()
        except (ConnectionClosed, asyncio.CancelledError):
            pass


async def send(ws: ServerConnection, message: WsMessage):
    """Sends a JSON message over the websocket."""
    await ws.send(json.dumps(message), True)


async def ws_handler(
    ws: ServerConnection,
    manager: PlayerManager,
):
    """Main websocket handler for player/admin connections."""
    player: Player | None = None
    admin_conn: AdminConnection | None = None
    try:
        async for message in ws:
            try:
                msg: WsCmd = json.loads(message)

                # Admin actions
                if admin_conn:
                    if msg["type"] == "spectate":
                        # Set which players to spectate
                        players = msg.get("players", [])
                        if "*" in players:
                            admin_conn.spectating = {"*"}
                            effective = set(manager.players.keys())
                        else:
                            admin_conn.spectating = set(players) & set(manager.players.keys())
                            effective = admin_conn.spectating
                        log.info(f"Admin spectating: {admin_conn.spectating}")
                        # Send current state of all spectated players
                        for name in effective:
                            p = manager.players[name]
                            await send(
                                ws,
                                {
                                    "type": "spectate_editor",
                                    "player": name,
                                    "code": p.code,
                                    "row": p.row,
                                    "col": p.col,
                                },
                            )
                            # Send submission output if exists
                            if sub := manager.submissions.get(name):
                                await send(
                                    ws,
                                    {
                                        "type": "spectate_output",
                                        "player": name,
                                        "content": sub.output,
                                    },
                                )
                            # Send active debuffs
                            p_debuffs = p.debuffs_json()
                            await send(ws, {**p_debuffs, "type": "spectate_debuffs", "player": name})
                    elif msg["type"] == "change_puzzle":
                        log.info(f"Admin changing puzzle to {msg['puzzle']}")
                        if error := await manager.switch_puzzle(msg["puzzle"], expire_submissions=True):
                            await send(ws, error)
                    elif msg["type"] == "add_player":
                        if error := await manager.add_player(msg["name"]):
                            await send(ws, error)
                    elif msg["type"] == "remove_player":
                        if error := await manager.remove_player(msg["name"]):
                            await send(ws, error)
                    elif msg["type"] == "reload_puzzles":
                        await manager.reload_puzzles()
                        # reload_puzzles already broadcasts the puzzle list to all admins
                    elif msg["type"] == "administer_debuff":
                        if error := manager.administer_debuff(msg):
                            await send(ws, error)
                    elif msg["type"] == "assign_id":
                        generated_id = msg["generated_id"]
                        player_name = msg["player"]
                        if player_name == "":
                            manager.pending_ids.discard(generated_id)
                            manager.broadcast_to_admins(manager.get_pending_logins_msg())
                        elif player_name not in manager.players:
                            await send(ws, {"type": "error", "message": "No such player"})
                        else:
                            manager.id_mapping[generated_id] = player_name
                            manager.pending_ids.discard(generated_id)
                            manager.broadcast_to_admins(manager.get_pending_logins_msg())
                    else:
                        await send(ws, {"type": "error", "message": "unknown admin action"})

                # Player actions
                elif player is not None or cast(bool, False):  # pyright thinks player is None...
                    assert player is not None
                    if msg["type"] == "edit":
                        if "code" in msg:
                            player.code = msg["code"]
                        player.row = msg["row"]
                        player.col = msg["col"]
                        manager.unsaved.add(player.name)
                        # Notify spectating admins
                        manager.notify_spectators(player.name, player.editor_json())
                    elif msg["type"] == "submit":
                        log.info(f"Player {player.name} submitting code")
                        if error := manager.submit(player):
                            log.info(f"Submission error for player {player.name}: {error['message']}")
                            await send(ws, error)
                    elif msg["type"] == "debuff_state":
                        manager.notify_spectators(player.name, msg)
                    elif msg["type"] == "administer_debuff" and environ.get("DEBUG"):
                        if error := manager.administer_debuff(msg):
                            await send(ws, error)
                    else:
                        log.warning(f"Unknown action from player {player.name}: {msg['type']}")
                        await send(ws, {"type": "error", "message": "unknown action"})
                        break  # just dump the connection

                # Login as admin
                elif msg["type"] == "admin_login":
                    if msg["password"] == ADMIN_PASSWORD:
                        log.info("Admin logged in")
                        admin_conn = AdminConnection(ws)
                        manager.admins[ws] = admin_conn
                        await send(ws, {"type": "admin_welcome"})
                        # Send puzzle list, player list, and pending logins
                        await send(ws, manager.get_puzzle_list())
                        await send(ws, manager.get_player_list())
                        await send(ws, manager.get_pending_logins_msg())
                        # Send current submission state for all players
                        for name, sub in manager.submissions.items():
                            await send(
                                ws,
                                {
                                    "type": "spectate_state",
                                    "player": name,
                                    "state": sub.status,
                                    "error": sub.error,
                                },
                            )
                    else:
                        log.warning("Invalid admin password attempt")
                        await send(ws, {"type": "error", "message": "invalid admin password"})
                        break  # just dump the connection

                # Login as player
                elif msg["type"] == "login":
                    name = msg["id"]
                    player_or_err = await manager.player_connected(name, ws)
                    if not isinstance(player_or_err, Player):
                        log.warning(f"Invalid player login attempt: {name}")
                        await send(ws, player_or_err)  # send error
                        break  # just dump the connection
                    player = player_or_err
                    log.info(f"Player logged in: {name}")
                    await send(ws, {"type": "welcome", "name": player.name})
                    # Send current puzzle, if any
                    if puzzle := manager.current_puzzle:
                        await send(ws, puzzle.json())
                    # Send current editor state
                    await send(ws, player.editor_json())
                    # Send latest submission state, if any
                    if submission := manager.submissions.get(name):
                        await send(ws, {"type": "state", "state": submission.status, "error": submission.error})
                        await send(ws, {"type": "output", "content": submission.output})
                    # Send active debuffs
                    await send(ws, player.debuffs_json())

                # Unknown action, not logged in
                else:
                    log.warning(f"Unknown action before login: {msg['type']}")
                    await send(ws, {"type": "error", "message": "not logged in"})
                    break  # just dump the connection
            except WebSocketException:
                # no point in sending error messages if connection is closed
                break
            except Exception:
                traceback.print_exc()
                await send(ws, {"type": "error", "message": "failed to parse"})
                break  # just dump the connection
    finally:
        # Clean up admin connection
        # TODO: make manager clean up instead of poking its internals
        if admin_conn and ws in manager.admins:
            del manager.admins[ws]
            log.info("Admin disconnected")
        await ws.close()


async def save_players_periodically(manager: PlayerManager, done: asyncio.Event):
    """Periodically saves modified player states to the database."""
    while manager.unsaved or not done.is_set():
        # Check every 1 second, unless doing final save on shutdown
        try:
            await asyncio.wait_for(done.wait(), timeout=1.0)
        except TimeoutError:
            pass
        if manager.unsaved:
            to_save = list(manager.unsaved)
            manager.unsaved.clear()
            values = [
                (player.score, player.code, player.col, player.row, player.name)
                for name in to_save
                for player in [manager.players[name]]
            ]
            await manager.db.executemany(
                "UPDATE players SET score = ?, code = ?, col = ?, row = ? WHERE name = ?",
                values,
            )
            await manager.db.commit()


async def watch_yaml_files(manager: PlayerManager, done: asyncio.Event):
    """Watches puzzles.yaml and prompts.yaml for changes and reloads them when modified."""
    puzzles_path = Path("puzzles.yaml")
    prompts_path = Path("prompts.yaml")
    inotify = INotify()
    watch_flags = flags.MODIFY | flags.CLOSE_WRITE | flags.MOVED_TO
    wd = inotify.add_watch(str(puzzles_path.parent), watch_flags)

    try:
        while not done.is_set():
            # Use run_in_executor to make blocking inotify.read() async-friendly
            events: list[InotifyEvent] = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: inotify.read(timeout=200, read_delay=100),
            )
            reload_puzzles = False
            reload_prompts = False
            for event in events:
                if event.name == puzzles_path.name:
                    reload_puzzles = True
                elif event.name == prompts_path.name:
                    reload_prompts = True
            if reload_puzzles:
                log.info("puzzles.yaml changed, reloading...")
                await manager.reload_puzzles()
            if reload_prompts:
                log.info("prompts.yaml changed, reloading...")
                manager.reload_prompts()
    finally:
        inotify.rm_watch(wd)
        inotify.close()


async def main():
    loop = asyncio.get_event_loop()
    done = asyncio.Event()

    def on_shutdown():
        done.set()

    loop.add_signal_handler(signal.SIGINT, on_shutdown)

    db = await aiosqlite.connect("state.db")
    await db.executescript(
        """
        CREATE TABLE IF NOT EXISTS players (
            name VARCHAR(15) PRIMARY KEY NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            code TEXT NOT NULL DEFAULT '',
            col INTEGER NOT NULL DEFAULT 0,
            row INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name VARCHAR(15) NOT NULL,
            puzzle_id VARCHAR(15) NOT NULL,
            code TEXT NOT NULL,
            output TEXT NOT NULL,
            status VARCHAR(10) NOT NULL,
            error TEXT NOT NULL DEFAULT '',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_name) REFERENCES players(name)
        );
        CREATE TABLE IF NOT EXISTS game_state (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
        """
    )
    await db.commit()

    player_manager = PlayerManager(db)
    await player_manager.reload_puzzles()
    cursor = await db.execute("SELECT value FROM game_state WHERE key = 'current_puzzle_id'")
    row = await cursor.fetchone()
    if row and row[0] in player_manager.puzzles:
        log.info(f"Restoring current puzzle '{row[0]}' from DB")
        await player_manager.switch_puzzle(row[0], reset_editors=False)
    await player_manager.load_players()
    player_manager.reload_prompts()

    save_players = asyncio.create_task(save_players_periodically(player_manager, done))
    watch_yamls = asyncio.create_task(watch_yaml_files(player_manager, done))
    minigame_task: asyncio.Task[None] | None = None
    if MINIGAME_BACKEND:
        log.info(f"Minigame backend configured at {MINIGAME_BACKEND}:6978")
        minigame_task = asyncio.create_task(player_manager.minigame_ws_task(done))

    server = await serve(lambda ws: ws_handler(ws, player_manager), "0.0.0.0", 6979)

    async with server:
        await done.wait()

    # Wait for background tasks to finish
    await save_players
    await watch_yamls
    if minigame_task:
        minigame_task.cancel()
        try:
            await minigame_task
        except asyncio.CancelledError:
            pass

    await db.close()


if __name__ == "__main__":
    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD environment variable not set")

    basicConfig(level=INFO, format="%(asctime)s %(levelname)s %(message)s")
    if environ.get("DEBUG"):
        log.setLevel(DEBUG)

    if not OPENROUTER_KEY:
        log.warning("OPENROUTER_KEY environment variable not set")

    asyncio.run(main())
