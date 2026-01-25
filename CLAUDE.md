# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer LeetCode is a real-time collaborative coding game where multiple players on a team solve programming puzzles simultaneously using multiple physical keyboards connected to a single computer.

The system captures raw keyboard input via Linux evdev and streams keystrokes through WebSockets to a shared code editor. The system enforces rules such as which keyboard must be used to type the next character, which may be indicated by e.g. keyboard LEDs.

Other players can send "penalties" by completing online puzzles, which temporarily mess with the typing experience even more (e.g. swapping keys, randomizing rules, visual effects).

The game server executes player code submissions in isolated Docker containers to validate correctness.

## Architecture

The project consists of three components:

1. **Backend** (`backend/`) - Python WebSocket game server
  - Manages player sessions, editor state, submissions, penalties and online puzzles
  - Executes Python code submissions in isolated Docker containers
  - Stores player/submission data in SQLite (`state.db`)
  - (Re)loads puzzles defined in `puzzles.yaml`
  - Runs on port 6979

2. **evdev-ws** (`evdev-ws/`) - Python keyboard input daemon (Linux only)
  - Captures raw keyboard events via Linux evdev, identifies keyboards by USB port path
  - Broadcasts keystrokes to WebSocket clients
  - Controls keyboard LEDs (NumLock, CapsLock, ScrollLock) via WebSocket messages
  - Runs on port 6969

3. **Frontend** (`frontend/`) - React/Vite web client
  - Text editing
  - Player penalties (visual effects, keyboard usage rules, key remapping)
  - Submissions
  - Admin frontend for control and spectation
  - Features:
    - Custom text editor implementation (`Editor.tsx`) - not using any editor library
    - Keyboard layout handling (Finnish layout default, US layout available)
    - Connects to both game server and keyboard server via WebSockets

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev      # Start dev server
npm run build    # Build for production (runs tsc first)
npm run lint     # Run ESLint
```

### Backend
```bash
cd backend
uv sync                           # Install dependencies
ADMIN_PASSWORD=xxx uv run main.py # Start server (requires Docker)
DEBUG=1 ADMIN_PASSWORD=xxx uv run main.py  # With debug logging
```

### evdev-ws (Linux only)
```bash
cd evdev-ws
uv sync
sudo uv run main.py  # Requires root for evdev access
```

## Key Concepts

### Keyboard Identification
Keyboards are identified by their USB port path (not device name), allowing consistent identification when reconnected to the same port.

### Code Execution
User code is wrapped using the puzzle's `wrapper` template and executed in Docker with strict sandboxing:
- No network, 256MB memory, 0.5 CPU, 2s timeout
- Read-only filesystem, seccomp profile
- Output compared against `expected_output` for validation

### Puzzle Format
Puzzles in `puzzles.yaml` use `|` to mark initial cursor position in the template.

## WebSocket Protocols

### Game Server (port 6979)
- Client sends: `login`, `edit`, `submit`
- Server sends: `welcome`, `editor`, `puzzle`, `output`, `state`, `error`

### Keyboard Server (port 6969)
- Server broadcasts: `[keyboardId, state, key]` (state: "down"|"up"|"hold")
- Client sends: `[keyboardId, numLock, capsLock, scrollLock]` for LED control
