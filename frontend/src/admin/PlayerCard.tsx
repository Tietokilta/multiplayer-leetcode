import { type AdminState } from "./adminState";

export const submissionColors = {
  running: "text-yellow-500",
  valid: "text-green-500",
  invalid: "text-red-500",
};

export type PlayerState = AdminState["playerStates"][string];

export function PlayerCard({
  name,
  state,
  onClick,
}: {
  name: string;
  state: PlayerState | undefined;
  onClick?: () => void;
}) {
  return (
    <div
      className={`border rounded p-2 flex flex-col overflow-hidden ${onClick ? "cursor-pointer hover:border-blue-400 transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-1 shrink-0">
        <span className="font-bold text-sm truncate">{name}</span>
        {state?.state && <span className={`text-xs ${submissionColors[state.state]}`}>{state.state}</span>}
      </div>
      <pre className="bg-gray-900 text-gray-100 p-1 rounded text-xs font-mono whitespace-pre overflow-hidden flex-1 min-h-0">
        {state?.code ?? ""}
      </pre>
      {state?.output && (
        <div className="mt-1 shrink-0">
          <div className="text-xs text-gray-500">Output:</div>
          <pre className="bg-gray-800 text-gray-100 p-1 rounded text-xs font-mono overflow-auto max-h-20">
            {state.output}
          </pre>
        </div>
      )}
      {state?.debuffs && state.debuffs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 shrink-0">
          {state.debuffs.map((d, i) => (
            <span key={i} className="text-xs bg-orange-900/50 text-orange-300 rounded px-1">
              {d.name} ({Math.ceil(d.duration)}s)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
