import { useEffect, useState, useRef } from "react";

type ConnState = "connected" | "not" | "connecting";

type PuzzleInfo = { id: string; title: string };

type AdminMessage =
  | { type: "admin_welcome" }
  | { type: "puzzles"; puzzles: PuzzleInfo[]; current: string | null }
  | { type: "players"; players: string[] }
  | { type: "spectate_editor"; player: string; code: string; row: number; col: number }
  | { type: "spectate_state"; player: string; state: "running" | "valid" | "invalid" }
  | { type: "spectate_output"; player: string; content: string }
  | { type: "error"; message: string };

type PlayerState = {
  code: string;
  row: number;
  col: number;
  state: "running" | "valid" | "invalid" | null;
  output: string;
};

const stateColors = {
  connected: "bg-green-500",
  not: "bg-red-500",
  connecting: "bg-yellow-500",
};

const submissionColors = {
  running: "text-yellow-500",
  valid: "text-green-500",
  invalid: "text-red-500",
};

export default function Admin() {
  const [serverIp, setServerIp] = useState("");
  const [password, setPassword] = useState("");
  const [connState, setConnState] = useState<ConnState>("not");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [puzzles, setPuzzles] = useState<PuzzleInfo[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<string | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [spectating, setSpectating] = useState<Set<string>>(new Set());
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});

  const [newPlayerName, setNewPlayerName] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const ipRef = useRef<string>("");

  const send = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const connect = (ip: string) => {
    setConnState("connecting");
    setError(null);

    const ws = new WebSocket(`ws://${ip}:6979/`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState("connected");
      ws.send(JSON.stringify({ type: "admin_login", password }));
    };

    ws.onmessage = (event) => {
      const data: AdminMessage = JSON.parse(event.data);
      console.log("Admin received:", data);

      switch (data.type) {
        case "admin_welcome":
          setLoggedIn(true);
          // Only enable auto-reconnect after successful login
          ipRef.current = ip;
          break;
        case "puzzles":
          setPuzzles(data.puzzles);
          setCurrentPuzzle(data.current);
          break;
        case "players":
          setPlayers(data.players);
          break;
        case "spectate_editor":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...prev[data.player],
              code: data.code,
              row: data.row,
              col: data.col,
              state: prev[data.player]?.state ?? null,
              output: prev[data.player]?.output ?? "",
            },
          }));
          break;
        case "spectate_state":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...prev[data.player],
              code: prev[data.player]?.code ?? "",
              row: prev[data.player]?.row ?? 0,
              col: prev[data.player]?.col ?? 0,
              state: data.state,
              output: data.state === "running" ? "" : prev[data.player]?.output ?? "",
            },
          }));
          break;
        case "spectate_output":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...prev[data.player],
              code: prev[data.player]?.code ?? "",
              row: prev[data.player]?.row ?? 0,
              col: prev[data.player]?.col ?? 0,
              state: prev[data.player]?.state ?? null,
              output: (prev[data.player]?.output ?? "") + data.content,
            },
          }));
          break;
        case "error":
          setError(data.message);
          break;
      }
    };

    ws.onclose = () => {
      setConnState("not");
      setLoggedIn(false);
      // Reconnect after delay if we were logged in
      if (ipRef.current) {
        setTimeout(() => {
          if (ipRef.current) connect(ipRef.current);
        }, 2000);
      }
    };
  };

  const disconnect = () => {
    ipRef.current = "";
    wsRef.current?.close();
    wsRef.current = null;
    setLoggedIn(false);
    setConnState("not");
  };

  const toggleSpectate = (player: string) => {
    setSpectating((prev) => {
      const next = new Set(prev);
      if (next.has(player)) {
        next.delete(player);
      } else {
        next.add(player);
      }
      return next;
    });
  };

  // Send spectate command when selection changes
  useEffect(() => {
    if (loggedIn) {
      send({ type: "spectate", players: Array.from(spectating) });
    }
  }, [spectating, loggedIn]);

  const changePuzzle = (puzzleId: string) => {
    send({ type: "change_puzzle", puzzle: puzzleId });
  };

  const addPlayer = () => {
    if (newPlayerName.trim()) {
      send({ type: "add_player", name: newPlayerName.trim() });
      setNewPlayerName("");
    }
  };

  const removePlayer = (name: string) => {
    if (confirm(`Remove player "${name}"?`)) {
      send({ type: "remove_player", name });
    }
  };

  const reloadPuzzles = () => {
    send({ type: "reload_puzzles" });
  };

  // Login form
  if (!loggedIn) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
        <div className="flex items-center mb-2">
          <span className={`w-3 h-3 rounded-full inline-block mr-2 ${stateColors[connState]}`} />
          <span className="text-sm">{connState}</span>
        </div>
        {error && <div className="text-red-500 mb-2">{error}</div>}
        <div className="mb-3">
          <input
            className="border rounded p-2 w-full"
            type="text"
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            placeholder="Server IP (e.g. 127.0.0.1)"
          />
        </div>
        <div className="mb-3">
          <input
            className="border rounded p-2 w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
          />
        </div>
        <button
          className="bg-blue-500 text-white rounded p-2 w-full disabled:opacity-50"
          disabled={!serverIp || !password || connState === "connecting"}
          onClick={() => connect(serverIp)}
        >
          Connect
        </button>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className={`w-3 h-3 rounded-full inline-block ${stateColors[connState]}`} />
          <button className="text-red-500 underline" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Puzzle Control */}
        <div className="border rounded p-4">
          <h2 className="font-bold mb-2">Puzzle Control</h2>
          <div className="mb-2">
            <select
              className="border rounded p-2 w-full"
              value={currentPuzzle ?? ""}
              onChange={(e) => changePuzzle(e.target.value)}
            >
              <option value="" disabled>
                Select puzzle
              </option>
              {puzzles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <button className="text-blue-500 underline text-sm" onClick={reloadPuzzles}>
            Reload puzzles.yaml
          </button>
        </div>

        {/* Player Management */}
        <div className="border rounded p-4">
          <h2 className="font-bold mb-2">Players ({players.length})</h2>
          <div className="flex gap-2 mb-2">
            <input
              className="border rounded p-1 flex-1"
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="New player name"
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            <button className="bg-green-500 text-white rounded px-2" onClick={addPlayer}>
              Add
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {players.map((name) => (
              <div key={name} className="flex justify-between items-center py-1">
                <span>{name}</span>
                <button className="text-red-500 text-sm" onClick={() => removePlayer(name)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Spectate Control */}
        <div className="border rounded p-4">
          <h2 className="font-bold mb-2">Spectate</h2>
          <div className="max-h-40 overflow-y-auto">
            {players.map((name) => (
              <label key={name} className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={spectating.has(name)}
                  onChange={() => toggleSpectate(name)}
                />
                <span>{name}</span>
                {playerStates[name]?.state && (
                  <span className={submissionColors[playerStates[name].state!]}>
                    ({playerStates[name].state})
                  </span>
                )}
              </label>
            ))}
          </div>
          {players.length > 0 && (
            <div className="mt-2 flex gap-2">
              <button
                className="text-blue-500 text-sm underline"
                onClick={() => setSpectating(new Set(players))}
              >
                All
              </button>
              <button
                className="text-blue-500 text-sm underline"
                onClick={() => setSpectating(new Set())}
              >
                None
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spectate Views */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from(spectating).map((name) => {
          const state = playerStates[name];
          return (
            <div key={name} className="border rounded p-2">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">{name}</span>
                {state?.state && (
                  <span className={submissionColors[state.state]}>
                    {state.state}
                  </span>
                )}
              </div>
              <pre className="bg-gray-900 text-gray-100 p-2 rounded text-xs overflow-auto max-h-60 font-mono whitespace-pre">
                {state?.code ?? "(no data)"}
              </pre>
              {state?.output && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500">Output:</div>
                  <pre className="bg-gray-800 text-gray-100 p-1 rounded text-xs overflow-auto max-h-20 font-mono">
                    {state.output}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
