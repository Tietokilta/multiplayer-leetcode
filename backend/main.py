import asyncio
from dataclasses import dataclass, field
import json
from logging import getLogger, basicConfig, DEBUG, INFO
from os import environ
import signal
from subprocess import PIPE, STDOUT
import traceback
from typing import Literal

import aiosqlite
from websockets import WebSocketException, ServerConnection, serve
from yaml import safe_load


log = getLogger(__name__)

ADMIN_PASSWORD = environ.get("ADMIN_PASSWORD")


async def run_code(code: str, input: str, submission: "Submission"):
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

    try:
        # Read incremental output and yield it
        async with asyncio.timeout(3):  # Slightly longer than process timeout to get final output
            while True:
                line = await stdout.read(1024)
                if not line:
                    # EOF, done
                    await process.wait()
                    break
                decoded = line.decode("iso-8859-1")  # Decode as latin-1 to avoid errors
                yield {
                    "type": "output",
                    "content": decoded,
                }
                submission.output += decoded
                if len(submission.output) >= 100 * 1024:  # 100 KB limit
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
            submission.status = "invalid"
            submission.error = f"Process exited with code {returncode}"
        else:
            # TODO: fuzzier matching?
            if submission.puzzle.expected_output.strip() == submission.output.strip():
                submission.status = "valid"
            else:
                submission.status = "invalid"
    finally:
        yield {"type": "state", "state": submission.status, "error": submission.error}


@dataclass
class Player:
    name: str
    score: int
    code: str
    col: int
    row: int
    conn_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    tx_queue: asyncio.Queue | None = None

    def editor_json(self):
        return {
            "type": "editor",
            "code": self.code,
            "row": self.row,
            "col": self.col,
        }

    def send(self, message: dict):
        if self.tx_queue:
            self.tx_queue.put_nowait(message)

    async def tx_queue_task(self, queue: asyncio.Queue, ws: ServerConnection):
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
        async with self.conn_lock:
            # Disconnect previous connection if exists
            if self.tx_queue:
                self.tx_queue.put_nowait(None)
            self.tx_queue = queue = asyncio.Queue()
        asyncio.create_task(self.tx_queue_task(queue, ws))


@dataclass
class Puzzle:
    id: str
    title: str
    description: str
    template: str  # code template to start with
    start_pos: tuple[int, int]  # (col, row)
    wrapper: str  # wrapper to insert user code in with format()
    expected_output: str

    def json(self):
        return {
            "type": "puzzle",
            "title": self.title,
            "description": self.description,
        }


@dataclass
class Submission:
    puzzle: Puzzle
    code: str
    output: str = ""
    status: Literal["running", "valid", "invalid"] = "running"
    error: str = ""
    task: asyncio.Task | None = None


class PlayerManager:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db
        self.players: dict[str, Player] = {}
        self.submissions: dict[str, Submission] = {}
        self.unsaved: set[str] = set()
        self.puzzles: dict[str, Puzzle] = {}
        self.current_puzzle: Puzzle | None = None

    async def load_players(self):
        async with self.db.execute("SELECT id, name, score, code, col, row FROM players") as cursor:
            for row in await cursor.fetchall():
                player = Player(*row)
                self.players[player.name] = player

    async def player_connected(self, name: str, ws: ServerConnection):
        if name not in self.players:
            raise ValueError("No such player")
        player = self.players[name]
        await player.connected(ws)
        return player

    async def switch_puzzle(self, id: str):
        if id not in self.puzzles:
            return {"type": "error", "message": "No such puzzle"}
        puzzle = self.puzzles[id]
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
        # Synchronously update state (no further awaits)
        self.current_puzzle = puzzle
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
            player.code = puzzle.template
            player.col = puzzle.start_pos[0]
            player.row = puzzle.start_pos[1]
            self.unsaved.add(player.name)
            player.send(puzzle.json())
            player.send(player.editor_json())
        return None

    async def _submit_task(self, player: Player, submission: Submission):
        try:
            async for result in run_code(player.code, "", submission):
                # Send outputs only if still on the same puzzle
                if self.current_puzzle == submission.puzzle:
                    player.send(result)
        finally:
            # Ensure no ghost states
            if submission.status == "running":
                submission.status = "invalid"
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

    def submit(self, player: Player) -> dict[str, str] | None:
        if not self.current_puzzle:
            return {"type": "error", "message": "No puzzle loaded"}

        # Only allow one submission running or valid at a time
        if (sub := self.submissions.get(player.name)) and not (
            (sub.task and not sub.task.done()) or sub.status == "valid"
        ):
            return {"type": "error", "message": "Submission already running"}

        self.submissions[player.name] = submission = Submission(
            puzzle=self.current_puzzle, code=player.code
        )
        submission.task = asyncio.create_task(self._submit_task(player, submission))
        # Don't bother saving here - if the server crashes during execution, just resubmit
        return None

    def reload_puzzles(self):
        log.info("Reloading puzzles from puzzles.yaml")
        try:
            data = safe_load(open("puzzles.yaml", "r", encoding="utf-8"))
            puzzles = {}
            for entry in data:
                start_code = entry["template"].partition("|")[0]
                start_row = start_code.count("\n")
                start_col = len(start_code.rpartition("\n")[2])
                puzzle = Puzzle(
                    **entry,
                    template=entry["template"].replace("|", ""),
                    start_pos=(start_col, start_row),
                )
                puzzles[puzzle.id] = puzzle
        except Exception:
            log.exception("Failed to load puzzles")
        else:
            self.puzzles = puzzles


async def send(ws: ServerConnection, message: dict):
    await ws.send(json.dumps(message), True)


async def ws_handler(
    ws: ServerConnection,
    manager: PlayerManager,
):
    player: Player | None = None
    admin = False
    async for message in ws:
        try:
            msg = json.loads(message)
            action = msg["type"]

            # Admin actions
            if admin:
                if action == "spectate":
                    pass  # not implemented yet
                elif action == "change_puzzle":
                    log.info(f"Admin changing puzzle to {msg["puzzle"]}")
                    if error := await manager.switch_puzzle(msg["puzzle"]):
                        await send(ws, error)
                else:
                    await send(ws, {"type": "error", "message": "unknown admin action"})

            # Player actions
            elif player:
                if action == "edit":
                    if "code" in msg:
                        player.code = msg["code"]
                    player.row = msg["row"]
                    player.col = msg["col"]
                    manager.unsaved.add(player.name)
                elif action == "submit":
                    if error := manager.submit(player):
                        await send(ws, error)
                else:
                    log.warning(f"Unknown action from player {player.name}: {action}")
                    await send(ws, {"type": "error", "message": "unknown action"})
                    break  # just dump the connection

            # Login as admin
            elif action == "admin_login":
                if msg["password"] == ADMIN_PASSWORD:
                    log.info("Admin logged in")
                    admin = True
                    await send(ws, {"type": "admin_welcome"})
                else:
                    log.warning("Invalid admin password attempt")
                    await send(ws, {"type": "error", "message": "invalid admin password"})
                    break  # just dump the connection

            # Login as player
            elif action == "login":
                name = msg["id"]
                player = await manager.player_connected(name, ws)
                await send(ws, {"type": "welcome"})
                # Send current puzzle, if any
                if puzzle := manager.current_puzzle:
                    await send(ws, puzzle.json())
                # Send current editor state
                await send(ws, player.editor_json())
                # Send latest submission state, if any
                if submission := manager.submissions.get(name):
                    await send(ws, {"type": "state", "state": submission.status})
                    await send(ws, {"type": "output", "content": submission.output})

            # Unknown action, not logged in
            else:
                log.warning(f"Unknown action before login: {action}")
                await send(ws, {"type": "error", "message": "not logged in"})
                break  # just dump the connection
        except WebSocketException:
            # no point in sending error messages if connection is closed
            break
        except Exception:
            traceback.print_exc()
            await send(ws, {"type": "error", "message": "failed to parse"})
            break  # just dump the connection
    await ws.close()


async def save_players_periodically(manager: PlayerManager, done: asyncio.Event):
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
        """
    )
    await db.commit()

    player_manager = PlayerManager(db)
    await player_manager.load_players()
    player_manager.reload_puzzles()

    save_players = asyncio.create_task(save_players_periodically(player_manager, done))

    server = await serve(lambda ws: ws_handler(ws, player_manager), "localhost", 6979)

    async with server:
        await done.wait()

    # Wait for saving to finish
    await save_players


if __name__ == "__main__":
    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD environment variable not set")

    basicConfig(level=DEBUG if environ.get("DEBUG") else INFO)

    asyncio.run(main())
