import { type RefObject, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { clippyDebuffs, Debuff } from "../debuffs";
import type { PlayerController } from "./PlayerController";
import { Clippy } from "./Clippy";

function Screensaver({ controller }: { controller: PlayerController }) {
  const active = controller.usePlayerStore((state) => state.screensaverActive);
  const delayRef = useRef({ x: 0, y: 0 });
  const prevActiveRef = useRef<boolean>(null);

  if (prevActiveRef.current !== active) {
    prevActiveRef.current = active;
    delayRef.current = {
      x: -(Math.random() * 7 * 2),
      y: -(Math.random() * 5.3 * 2),
    };
  }

  if (!active) return null;
  return (
    <div
      className="absolute inset-0 z-50 mlc--screensaver"
      style={{ animationDelay: `${delayRef.current.x}s, ${delayRef.current.y}s` }}
    />
  );
}

type Props = {
  outputRef: RefObject<HTMLPreElement | null>;
  controller: PlayerController;
};

function LightsOut({ controller }: { controller: PlayerController }) {
  const debuff = controller.usePlayerStore((state) =>
    state.activeDebuffNames.has(Debuff.lights_out)
      ? state.debuffs.find((d) => d.name === Debuff.lights_out)
      : undefined,
  );
  if (!debuff) return null;
  const radius = Math.round(500 / debuff.strength);
  return (
    <div className="absolute inset-0 z-50 mlc--lights-out" style={{ "--sl-r": `${radius}vw` } as React.CSSProperties} />
  );
}

function ClippyController({ controller }: { controller: PlayerController }) {
  const debuff = controller.usePlayerStore((state) =>
    clippyDebuffs.some((d) => state.activeDebuffNames.has(d))
      ? state.debuffs.find((d) => clippyDebuffs.includes(d.name))
      : undefined,
  );
  const done = controller.usePlayerStore((state) => state.clippyEdited);
  if (!debuff) return null;
  return <Clippy key={debuff.endTime} debuff={debuff} done={done} />;
}

function Game({ outputRef, controller }: Props) {
  const { puzzle, output, submissionState, submissionError, rendered, clippyBlocked, activeDebuffNames } =
    controller.usePlayerStore();
  const clippyActive = clippyDebuffs.some((d) => activeDebuffNames.has(d));
  const [isOutputScrolling, setIsOutputScrolling] = useState(false);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    setIsOutputScrolling(el.scrollHeight > el.clientHeight);
  }, [output, outputRef]);

  return (
    <>
      <Screensaver controller={controller} />
      <LightsOut controller={controller} />
      <ClippyController controller={controller} />
      {puzzle ? (
        <div className="border rounded p-4 flex flex-col gap-2 mlc--puzzle">
          <h2 className="font-bold text-xl">{puzzle.title}</h2>
          <Markdown>{puzzle.description}</Markdown>
        </div>
      ) : (
        <div className="border rounded p-4 text-red-500">The server currently has no puzzle loaded.</div>
      )}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="border rounded p-4 mlc--editor">
          <h2 className="font-bold text-lg mb-2">Code</h2>
          {rendered}
        </div>
        <div className="border rounded p-4 flex flex-col gap-2 min-h-0 debuff-nausea mlc--output">
          {(submissionState === null || submissionState === "invalid") &&
            (clippyActive && clippyBlocked > 0 ? (
              <div key={clippyBlocked} className="text-red-500 font-bold animate-[fadeout_1s_linear_1_forwards]">
                Clippy is helping you, please wait!
              </div>
            ) : (
              <div className="text-blue-500 font-bold animate-[pulse_ease_2s_infinite]">
                Press Ctrl+Enter to submit{isOutputScrolling && ", Ctrl+Up/Down to scroll output"}
              </div>
            ))}
          {submissionState === "running" && (
            <div className="text-blue-500 font-bold animate-[pulse_ease_1s_infinite]">Submission running...</div>
          )}
          {submissionState === "valid" && <div className="text-green-500 font-bold">Submission valid!</div>}
          <pre ref={outputRef} className="whitespace-pre-wrap flex-shrink overflow-y-auto scroll-smooth">
            {output}
          </pre>
          {(submissionState === "invalid" || submissionError) && (
            <div className="text-red-500 font-bold">{submissionError ?? "Submission failed with unknown status"}</div>
          )}
        </div>
      </div>
    </>
  );
}

export default Game;
