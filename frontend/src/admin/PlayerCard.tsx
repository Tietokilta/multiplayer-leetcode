import { useShallow } from "zustand/react/shallow";
import type { SpectatorController } from "./SpectatorController";
import { submissionColors } from "./submissionColors";
import { DebuffQueue } from "../player/DebuffQueue";

export function PlayerCard({
  name,
  controller,
  onClick,
}: {
  name: string;
  controller: SpectatorController;
  onClick?: () => void;
}) {
  const state = controller.usePlayerStore(
    useShallow((s) => ({
      submissionState: s.submissionState,
      rendered: s.rendered,
      output: s.output,
      activeDebuffNames: s.activeDebuffNames,
    })),
  );

  return (
    <div
      className={`
        mlc--player-card
        border
        rounded
        p-2
        flex
        flex-col
        gap-1
        overflow-hidden
        ${onClick ? "cursor-pointer hover:border-blue-400 transition-colors" : ""}
        ${[...state.activeDebuffNames].map((name) => `debuff-${name}`).join(" ")}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-1 shrink-0">
        <span className="font-bold text-sm truncate">{name}</span>
        {state.submissionState && (
          <span className={`text-xs ${submissionColors[state.submissionState]}`}>{state.submissionState}</span>
        )}
      </div>
      <div className="bg-gray-900 text-gray-100 p-1 rounded text-xs overflow-hidden flex-1 min-h-0 mlc--editor">
        {state.rendered}
      </div>
      {state.output && (
        <div className="shrink-0">
          <div className="text-xs text-gray-500">Output:</div>
          <div className="bg-gray-800 text-gray-100 p-1 rounded text-xs font-mono overflow-y-auto whitespace-pre-wrap max-h-20">
            {state.output}
          </div>
        </div>
      )}
      <DebuffQueue minimal controller={controller} />
    </div>
  );
}
