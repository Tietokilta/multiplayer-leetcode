import { useState } from "react";
import { stateColors } from "../connection";
import { useAdminState } from "./adminState";
import { AdminLogin } from "./AdminLogin";
import { PlayerCard } from "./PlayerCard";
import type { SpectatorController } from "./SpectatorController";
import { submissionColors } from "./submissionColors";

function UnassignedLogin({
  generatedId,
  players,
  onAssign,
}: {
  generatedId: string;
  players: string[];
  onAssign: (id: string, player: string) => void;
}) {
  const [selected, setSelected] = useState(players[0] ?? "");
  return (
    <div className="flex gap-2 items-center py-1">
      <span className="font-mono text-sm flex-1">{generatedId}</span>
      <select className="border rounded p-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {players.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button
        className="text-green-500 underline p-1 rounded cursor-pointer hover:bg-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => onAssign(generatedId, selected)}
        disabled={!selected}
      >
        Assign
      </button>
      <button
        className="text-gray-500 underline p-1 rounded cursor-pointer hover:bg-gray-500/25"
        onClick={() => onAssign(generatedId, "")}
      >
        Dismiss
      </button>
    </div>
  );
}

function PlayerSpectateStatus({ controller }: { controller: SpectatorController }) {
  const submissionState = controller.usePlayerStore((s) => s.submissionState);
  return submissionState ? <span className={submissionColors[submissionState]}>({submissionState})</span> : null;
}

export default function Admin() {
  const state = useAdminState({});
  const {
    disconnect,
    setSpectating,
    server,
    connState,
    loggedIn,
    error,
    puzzles,
    currentPuzzle,
    players,
    pendingLogins,
    assignId,
    spectating,
    getController,
  } = state;

  const [newPlayerName, setNewPlayerName] = useState("");

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

  const [nextPuzzle, setNextPuzzle] = useState<string | null>(null);
  const changePuzzle = () => {
    if (!nextPuzzle) return;
    server.send({ type: "change_puzzle", puzzle: nextPuzzle });
    setNextPuzzle(null);
  };

  const addPlayer = () => {
    if (newPlayerName.trim()) {
      server.send({ type: "add_player", name: newPlayerName.trim() });
      setNewPlayerName("");
    }
  };

  const removePlayer = (name: string) => {
    if (confirm(`Remove player "${name}"?`)) {
      server.send({ type: "remove_player", name });
    }
  };

  const reloadPuzzles = () => {
    server.send({ type: "reload_puzzles" });
  };

  // Login form
  if (!loggedIn) {
    return <AdminLogin state={state} />;
  }

  // Admin dashboard
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full inline-block ${stateColors[connState]}`} />
          <button
            className="text-red-500 underline p-2 rounded cursor-pointer hover:bg-red-500/25"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {pendingLogins.length > 0 && (
        <div className="border border-yellow-500 rounded p-4 mb-6">
          <h2 className="font-bold mb-2">Unassigned logins ({pendingLogins.length})</h2>
          {pendingLogins.map((id) => (
            <UnassignedLogin key={id} generatedId={id} players={players} onAssign={assignId} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Puzzle Control */}
        <div className="border rounded p-4">
          <h2 className="font-bold mb-2">Current Puzzle: {currentPuzzle ?? "None"}</h2>
          <div className="mb-2 flex items-center gap-2">
            <select
              className="border rounded p-2 w-full"
              value={nextPuzzle ?? ""}
              onChange={(e) => setNextPuzzle(e.target.value)}
            >
              <option value="" disabled>
                Select next puzzle&hellip;
              </option>
              {puzzles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              className="text-green-500 underline p-1 rounded cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed hover:bg-green-500/25"
              onClick={changePuzzle}
              disabled={!nextPuzzle}
            >
              Change
            </button>
          </div>
          <button
            className="text-blue-500 underline text-sm p-1 rounded cursor-pointer hover:bg-blue-500/25"
            onClick={reloadPuzzles}
          >
            Reload puzzles.yaml
          </button>
        </div>

        {/* Player Management */}
        <div className="border rounded p-4">
          <h2 className="font-bold mb-2">Players ({players.length})</h2>
          <div className="flex gap-2 items-center mb-2">
            <input
              className="border rounded p-1 flex-1"
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="New player name"
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            <button
              className="text-green-500 underline rounded p-1 cursor-pointer hover:bg-green-500/25"
              onClick={addPlayer}
            >
              Add
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {players.map((name) => (
              <div key={name} className="flex justify-between items-center py-1">
                <span>{name}</span>
                <button
                  className="text-red-500 underline text-sm p-1 rounded cursor-pointer hover:bg-red-500/25"
                  onClick={() => removePlayer(name)}
                >
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
                <input type="checkbox" checked={spectating.has(name)} onChange={() => toggleSpectate(name)} />
                <span>{name}</span>
                <PlayerSpectateStatus controller={getController(name)} />
              </label>
            ))}
          </div>
          {players.length > 0 && (
            <div className="mt-2 flex gap-2">
              <button
                className="text-blue-500 underline text-sm p-1 rounded cursor-pointer hover:bg-blue-500/25"
                onClick={() => setSpectating(new Set(players))}
              >
                All
              </button>
              <button
                className="text-blue-500 underline text-sm p-1 rounded cursor-pointer hover:bg-blue-500/25"
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
        {Array.from(spectating).map((name) => (
          <PlayerCard key={name} name={name} controller={getController(name)} />
        ))}
      </div>
    </div>
  );
}
