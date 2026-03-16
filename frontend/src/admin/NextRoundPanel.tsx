import { useState } from "react";
import { debuffInfo, type Debuff } from "../debuffs";
import type { GameServerHandler } from "../connection";
import type { AdminCmd, AdminMessage, PreparedDebuff } from "./adminState";

const debuffNames = Object.keys(debuffInfo) as Debuff[];

function getDefaults(name: Debuff) {
  const info = debuffInfo[name];
  return {
    duration: info.defaultDuration ?? 30,
    strength: info.defaultStrength ?? (info.maxStrength ? Math.ceil(info.maxStrength / 2) : 1),
  };
}

function DebuffSelector({
  list,
  onAdd,
  onRemove,
}: {
  list: PreparedDebuff[];
  onAdd: (d: PreparedDebuff) => void;
  onRemove: (idx: number) => void;
}) {
  const [name, setName] = useState<Debuff>(debuffNames[0]);
  const [duration, setDuration] = useState(() => getDefaults(debuffNames[0]).duration);
  const [strength, setStrength] = useState(() => getDefaults(debuffNames[0]).strength);

  function handleNameChange(n: Debuff) {
    setName(n);
    const d = getDefaults(n);
    setDuration(d.duration);
    setStrength(d.strength);
  }

  const info = debuffInfo[name];

  return (
    <>
      <div className="flex gap-2 items-end flex-wrap mb-2">
        <select
          value={name}
          onChange={(e) => handleNameChange(e.target.value as Debuff)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
        >
          {debuffNames.map((n) => (
            <option key={n} value={n}>
              {debuffInfo[n].title} ({n})
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-sm">
          <span>Duration: {duration === 120 ? "\u221E" : `${duration}s`}</span>
          <input
            type="range"
            min={0}
            max={120}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-28"
          />
        </label>
        {info.maxStrength && (
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Strength: {strength}/{info.maxStrength}
            </span>
            <input
              type="range"
              min={1}
              max={info.maxStrength}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-28"
            />
          </label>
        )}
        <button
          onClick={() =>
            onAdd({
              name,
              debuff_type: info.debuff_type,
              strength,
              duration: duration === 120 ? 0 : duration,
            })
          }
          className="text-green-500 underline p-1 rounded cursor-pointer hover:bg-green-500/25"
        >
          + Add
        </button>
      </div>
      <div className="space-y-1">
        {list.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-gray-300">
              {d.name} {d.duration === 0 ? "\u221E" : `${d.duration}s`}
              {debuffInfo[d.name as Debuff]?.maxStrength ? ` str:${d.strength}` : ""}
            </span>
            <button
              onClick={() => onRemove(i)}
              className="text-red-500 hover:bg-red-500/25 rounded px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
        {list.length === 0 && <div className="text-xs text-gray-500">None added</div>}
      </div>
    </>
  );
}

export function NextRoundPanel({
  server,
  puzzles,
  currentPuzzle,
}: {
  server: GameServerHandler<AdminCmd, AdminMessage>;
  puzzles: { id: string; title: string }[];
  currentPuzzle: string | null;
}) {
  const [nextPuzzle, setNextPuzzle] = useState<string>("");
  const [initialDebuffs, setInitialDebuffs] = useState<PreparedDebuff[]>([]);
  const [minigamePool, setMinigamePool] = useState<PreparedDebuff[]>([]);

  function launchRound() {
    if (!nextPuzzle) return;
    server.send({ type: "launch_round", puzzle: nextPuzzle, initial_debuffs: initialDebuffs, awards: minigamePool });
    setNextPuzzle("");
    setInitialDebuffs([]);
    setMinigamePool([]);
  }

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
              {p.title}
              {p.id === currentPuzzle ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Initial debuffs */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-1">Initial Debuffs (applied to all players on launch)</label>
        <DebuffSelector
          list={initialDebuffs}
          onAdd={(d) => setInitialDebuffs((prev) => [...prev, d])}
          onRemove={(i) => setInitialDebuffs((prev) => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      {/* Minigame pool */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-1">
          Minigame Pool (debuffs available to award during the round)
        </label>
        <DebuffSelector
          list={minigamePool}
          onAdd={(d) => setMinigamePool((prev) => [...prev, d])}
          onRemove={(i) => setMinigamePool((prev) => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      {/* Launch */}
      <button
        onClick={launchRound}
        disabled={!nextPuzzle}
        className="text-green-500 underline p-1 rounded cursor-pointer hover:bg-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
      >
        Launch Round
      </button>
    </div>
  );
}
