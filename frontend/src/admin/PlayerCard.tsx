import { useLayoutEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { fireCharConfetti, fireConfettiAt, fireConfettiFromEl, fireEmojiConfettiFromEl } from "../player/confetti";
import { DebuffQueue } from "../player/DebuffQueue";
import { LightsOut, Screensaver } from "../player/Game";
import type { SpectatorController } from "./SpectatorController";
import { submissionColors } from "./submissionColors";

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

  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    controller.confetti = {
      fireConfettiAtCursor: () => {
        const el = cardRef.current?.querySelector(".mlc--cursor") ?? null;
        if (el) fireConfettiFromEl(el);
      },
      fireEmojiConfettiAtCursor: () => {
        const el = cardRef.current?.querySelector(".mlc--cursor") ?? null;
        if (el) fireEmojiConfettiFromEl(el);
      },
      fireConfettiAt,
      fireCharConfetti,
    };
    return () => {
      controller.confetti = null;
    };
  }, [controller]);

  return (
    <div
      ref={cardRef}
      className={`
        mlc--player-card
        border
        rounded
        p-2
        flex
        flex-col
        gap-1
        overflow-hidden
        relative
        ${onClick ? "cursor-pointer hover:border-blue-400 transition-colors" : ""}
        ${[...state.activeDebuffNames].map((name) => `debuff-${name}`).join(" ")}`}
      onClick={onClick}
    >
      <span className="absolute top-0 right-0 border-l border-b p-2 rounded-bl bg-gray-800 font-bold text-sm z-100">
        {name}
      </span>
      <div className="bg-gray-900 text-gray-100 p-1 rounded text-xs overflow-hidden flex-1 min-h-0 mlc--editor">
        {state.rendered}
      </div>
      {(state.output || state.submissionState) && (
        <div className="shrink-0">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Output:</span>
            {state.submissionState && (
              <span className={submissionColors[state.submissionState]}>{state.submissionState}</span>
            )}
          </div>
          <div className="bg-gray-800 text-gray-100 p-1 rounded text-xs font-mono overflow-y-auto whitespace-pre-wrap max-h-20">
            {state.output || "\xA0"}
          </div>
        </div>
      )}
      <LightsOut controller={controller} spectator />
      <Screensaver controller={controller} />
      <DebuffQueue minimal controller={controller} />
    </div>
  );
}
