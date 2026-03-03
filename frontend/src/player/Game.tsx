import { type RefObject, useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { PlayerController } from "./PlayerController";

type Props = {
  outputRef: RefObject<HTMLPreElement | null>;
  controller: PlayerController;
};

function Game({ outputRef, controller }: Props) {
  const { puzzle, output, submissionState, submissionError, rendered } = controller.usePlayerStore();
  const [isOutputScrolling, setIsOutputScrolling] = useState(false);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    setIsOutputScrolling(el.scrollHeight > el.clientHeight);
  }, [output, outputRef]);

  return (
    <>
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
          {(submissionState === null || submissionState === "invalid") && (
            <div className="text-blue-500 font-bold animate-[pulse_ease_2s_infinite]">
              Press Ctrl+Enter to submit{isOutputScrolling && ", Ctrl+Up/Down to scroll output"}
            </div>
          )}
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
