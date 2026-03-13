import { useState } from "react";
import { debuffInfo, type Debuff } from "../debuffs";
import type { GameServerHandler } from "../connection";
import type { AdminCmd, AdminMessage, PreparedDebuff } from "./adminState";

const debuffNames = Object.keys(debuffInfo) as Debuff[];

function defaultDebuff(name: Debuff): PreparedDebuff {
  const info = debuffInfo[name];
  const duration = info.defaultDuration ?? 30;
  const strength = info.defaultStrength ?? (info.maxStrength ? Math.ceil(info.maxStrength / 2) : 1);
  return { name, debuff_type: info.type, strength, duration };
}

export function NextRoundPanel({
  server,
  puzzles,
  players,
  currentPuzzle,
}: {
  server: GameServerHandler<AdminCmd, AdminMessage>;
  puzzles: { id: string; title: string }[];
  players: string[];
  currentPuzzle: string | null;
}) {
  const [nextPuzzle, setNextPuzzle] = useState<string>("");
  const [initialDebuffs, setInitialDebuffs] = useState<PreparedDebuff[]>([]);
  const [minigamePool, setMinigamePool] = useState<PreparedDebuff[]>([]);

  // Form state for adding an initial debuff
  const [addName, setAddName] = useState<Debuff>(debuffNames[0]);
  const [addDuration, setAddDuration] = useState(() => debuffInfo[debuffNames[0]].defaultDuration ?? 30);
  const [addStrength, setAddStrength] = useState(() => {
    const info = debuffInfo[debuffNames[0]];
    return info.defaultStrength ?? (info.maxStrength ? Math.ceil(info.maxStrength / 2) : 1);
  });

  // Multiselect state for pool
  const [poolSelected, setPoolSelected] = useState<Debuff[]>([]);
  const poolDebuffNames = new Set(minigamePool.map((e) => e.name));
  const availableForPool = debuffNames.filter((name) => !poolDebuffNames.has(name));

  function handleAddNameChange(name: Debuff) {
    setAddName(name);
    const info = debuffInfo[name];
    setAddDuration(info.defaultDuration ?? 30);
    setAddStrength(info.defaultStrength ?? (info.maxStrength ? Math.ceil(info.maxStrength / 2) : 1));
  }

  function addInitialDebuff() {
    const info = debuffInfo[addName];
    setInitialDebuffs((prev) => [
      ...prev,
      { name: addName, debuff_type: info.type, strength: addStrength, duration: addDuration === 120 ? 0 : addDuration },
    ]);
  }

  function removeInitialDebuff(idx: number) {
    setInitialDebuffs((prev) => prev.filter((_, i) => i !== idx));
  }

  function addPoolSelected() {
    const toAdd = poolSelected.length > 0 ? poolSelected : availableForPool;
    setMinigamePool((prev) => [...prev, ...toAdd.map(defaultDebuff)]);
    setPoolSelected([]);
  }

  function removePoolEntry(idx: number) {
    const removed = minigamePool[idx].name as Debuff;
    setMinigamePool((prev) => prev.filter((_, i) => i !== idx));
    setPoolSelected((prev) => prev.filter((n) => n !== removed));
  }

  function launchRound() {
    if (!nextPuzzle) return;
    server.send({ type: "launch_round", puzzle: nextPuzzle, initial_debuffs: initialDebuffs });
    setNextPuzzle("");
    setInitialDebuffs([]);
  }

  const addInfo = debuffInfo[addName];

  return (
    <div className="border rounded p-4">
      <h2 className="font-bold mb-3">Prepare Next Round</h2>

      {/* Puzzle selector */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-1">Puzzle</label>
        <select
          className="border rounded p-2 w-full max-w-sm bg-gray-800 text-white"
          value={nextPuzzle}
          onChange={(e) => setNextPuzzle(e.target.value)}
        >
          <option value="" disabled>
            Select puzzle&hellip;
          </option>
          {puzzles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}{p.id === currentPuzzle ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Initial debuffs */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-1">Initial Debuffs (applied to all players on launch)</label>
        <div className="flex gap-2 items-end flex-wrap mb-2">
          <select
            value={addName}
            onChange={(e) => handleAddNameChange(e.target.value as Debuff)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
          >
            {debuffNames.map((name) => (
              <option key={name} value={name}>
                {debuffInfo[name].title} ({name})
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-sm">
            <span>Duration: {addDuration === 120 ? "∞" : `${addDuration}s`}</span>
            <input
              type="range"
              min={0}
              max={120}
              value={addDuration}
              onChange={(e) => setAddDuration(Number(e.target.value))}
              className="w-28"
            />
          </label>
          {addInfo.maxStrength && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Strength: {addStrength}/{addInfo.maxStrength}</span>
              <input
                type="range"
                min={1}
                max={addInfo.maxStrength}
                value={addStrength}
                onChange={(e) => setAddStrength(Number(e.target.value))}
                className="w-28"
              />
            </label>
          )}
          <button
            onClick={addInitialDebuff}
            className="text-green-500 underline p-1 rounded cursor-pointer hover:bg-green-500/25"
          >
            + Add
          </button>
        </div>
        <div className="space-y-1">
          {initialDebuffs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gray-300">
                {d.name} {d.duration === 0 ? "∞" : `${d.duration}s`}{debuffInfo[d.name as Debuff]?.maxStrength ? ` str:${d.strength}` : ""}
              </span>
              <button
                onClick={() => removeInitialDebuff(i)}
                className="text-red-500 hover:bg-red-500/25 rounded px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
          {initialDebuffs.length === 0 && <div className="text-xs text-gray-500">None added</div>}
        </div>
      </div>

      {/* Minigame pool */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-1">
          Minigame Pool (debuffs available to award during the round)
        </label>
        <div className="flex gap-2 items-start mb-2">
          <select
            multiple
            size={5}
            value={poolSelected}
            onChange={(e) =>
              setPoolSelected(Array.from(e.target.selectedOptions, (o) => o.value as Debuff))
            }
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm w-56"
          >
            {availableForPool.map((name) => (
              <option key={name} value={name}>
                {debuffInfo[name].title} ({name})
              </option>
            ))}
          </select>
          <button
            onClick={addPoolSelected}
            disabled={availableForPool.length === 0}
            className="text-green-500 underline p-1 rounded cursor-pointer hover:bg-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {poolSelected.length === 0 ? "+ Add all to pool" : "+ Add selected to pool"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {minigamePool.map((entry, i) => (
            <span key={i} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-0.5 text-sm">
              {entry.name}
              <button
                onClick={() => removePoolEntry(i)}
                className="text-red-500 hover:text-red-400 cursor-pointer leading-none"
              >
                ✕
              </button>
            </span>
          ))}
          {minigamePool.length === 0 && (
            <div className="text-xs text-gray-500">
              Pool is empty — select debuffs above or click "+ Add all to pool"
            </div>
          )}
        </div>
      </div>

      {/* Launch */}
      <button
        onClick={launchRound}
        disabled={!nextPuzzle}
        className="bg-green-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
      >
        Launch Round
      </button>
    </div>
  );
}
