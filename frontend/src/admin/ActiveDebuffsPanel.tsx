import { useEffect, useState } from "react";
import type { GameServerHandler } from "../connection";
import type { ActiveDebuff } from "../player/PlayerController";
import type { AdminCmd, AdminMessage } from "./adminState";
import type { SpectatorController } from "./SpectatorController";

function PlayerActiveDebuffs({
  player,
  controller,
  onClearOne,
  onClearAllPlayer,
}: {
  player: string;
  controller: SpectatorController;
  onClearOne: (player: string, name: string) => void;
  onClearAllPlayer: (player: string) => void;
}) {
  const debuffs = controller.usePlayerStore((s) => s.debuffs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const active = debuffs.filter((d) => d.endTime > now);

  // Deduplicate by name, keeping max endTime
  const byName = new Map<string, ActiveDebuff>();
  for (const d of active) {
    const existing = byName.get(d.name);
    if (!existing || d.endTime > existing.endTime) byName.set(d.name, d);
  }
  const unique = Array.from(byName.values()).sort((a, b) => b.endTime - a.endTime);

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm">{player}</span>
        {unique.length > 0 && (
          <button
            onClick={() => onClearAllPlayer(player)}
            className="text-xs text-gray-400 underline cursor-pointer hover:text-gray-200"
          >
            clear all
          </button>
        )}
      </div>
      {unique.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {unique.map((d) => (
            <span key={d.name} className="flex items-center gap-1 bg-gray-700 rounded px-2 py-0.5 text-xs">
              <span>{d.name}</span>
              <span className="text-gray-400 ml-0.5">
                {d.endTime - now > 3_600_000 ? "∞" : `${Math.round((d.endTime - now) / 1000)}s`}
              </span>
              <button
                onClick={() => onClearOne(player, d.name)}
                className="text-red-400 hover:text-red-300 cursor-pointer leading-none ml-1"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500">None</div>
      )}
    </div>
  );
}

export function ActiveDebuffsPanel({
  players,
  getController,
  server,
}: {
  players: string[];
  getController: (player: string) => SpectatorController;
  server: GameServerHandler<AdminCmd, AdminMessage>;
}) {
  const clearOne = (player: string, name: string) => server.send({ type: "clear_debuff", players: [player], name });

  const clearAllPlayer = (player: string) => server.send({ type: "clear_debuff", players: [player], name: null });

  const clearAll = () => server.send({ type: "clear_debuff", players: ["*"], name: null });

  return (
    <div className="border rounded p-4 bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">Active Debuffs</h2>
        <button
          onClick={clearAll}
          className="text-sm text-red-400 underline cursor-pointer hover:bg-red-500/25 rounded px-2 py-1"
        >
          Clear all
        </button>
      </div>

      {players.map((player) => (
        <PlayerActiveDebuffs
          key={player}
          player={player}
          controller={getController(player)}
          onClearOne={clearOne}
          onClearAllPlayer={clearAllPlayer}
        />
      ))}
    </div>
  );
}
