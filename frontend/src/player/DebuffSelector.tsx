import { useState, type MouseEvent } from "react";
import { debuffInfo, type Debuff } from "../debuffs";
import { PlayerController } from "./PlayerController";

const debuffNames = Object.keys(debuffInfo) as Debuff[];

function initialDuration(name: Debuff): number {
  const def = debuffInfo[name].defaultDuration;
  return def ?? 30;
}

function initialStrength(name: Debuff): number {
  const def = debuffInfo[name].defaultStrength;
  if (def) return def;
  const max = debuffInfo[name].maxStrength;
  return max ? Math.ceil(max / 2) : 1;
}

export function DebuffSelector({ controller, myId }: { controller: PlayerController; myId: string }) {
  const [selectedName, setSelectedName] = useState<Debuff>(debuffNames[0]);
  const [duration, setDuration] = useState(() => initialDuration(debuffNames[0]));
  const [strength, setStrength] = useState(() => initialStrength(debuffNames[0]));

  const info = debuffInfo[selectedName];
  const maxStrength = info.maxStrength;

  function handleNameChange(name: Debuff) {
    setSelectedName(name);
    setDuration(initialDuration(name));
    setStrength(initialStrength(name));
  }

  function administer(evt: MouseEvent<HTMLButtonElement>) {
    evt.currentTarget.blur();
    controller.server.send({
      type: "administer_debuff",
      players: [myId],
      name: selectedName,
      debuff_type: info.type,
      strength,
      duration,
    });
  }

  return (
    <div className="border rounded p-3">
      <h2 className="font-bold mb-2">Debuffs</h2>
      <div className="flex gap-4 items-start flex-wrap">
        <div className="flex flex-col gap-1">
          <select
            value={selectedName}
            onChange={(e) => handleNameChange(e.target.value as Debuff)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
          >
            {debuffNames.map((name) => (
              <option key={name} value={name}>
                {debuffInfo[name].title} ({name})
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-300">{info.description}</div>
        </div>

        <label className="flex flex-col gap-1">
          <span>Duration: {duration}s</span>
          <input
            type="range"
            min={0}
            max={120}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-36"
          />
        </label>

        {maxStrength && (
          <label className="flex flex-col gap-1">
            <span>
              Strength: {strength}/{maxStrength}
            </span>
            <input
              type="range"
              min={1}
              max={maxStrength}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-36"
            />
          </label>
        )}

        <button onClick={administer} className="text-red-500 underline p-2 rounded cursor-pointer hover:bg-red-500/25">
          Administer
        </button>
        <button
          onClick={() => controller.handleMessage({ type: "debuffs", debuffs: [] })}
          className="text-gray-400 underline p-2 rounded cursor-pointer hover:bg-gray-500/25"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
