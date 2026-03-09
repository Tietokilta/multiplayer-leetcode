import { createRef, useRef, useState, type RefObject } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { useInterval } from "usehooks-ts";
import { debuffInfo, type Debuff } from "../debuffs";
import type { AbstractPlayerController } from "./PlayerController";

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DebuffQueue({ controller, minimal }: { controller: AbstractPlayerController; minimal?: boolean }) {
  const [, setTick] = useState(0);
  useInterval(() => setTick((t) => t + 1), 1000);

  const debuffs = controller.usePlayerStore((state) => state.debuffs);
  const now = Date.now();

  const nodeRefs = useRef(new Map<string, RefObject<HTMLDivElement | null>>());
  const activeKeys = new Set(debuffs.map((d) => `${d.name}-${d.endTime}`));
  for (const key of nodeRefs.current.keys()) {
    if (!activeKeys.has(key)) nodeRefs.current.delete(key);
  }
  function getNodeRef(key: string) {
    if (!nodeRefs.current.has(key)) nodeRefs.current.set(key, createRef());
    return nodeRefs.current.get(key)!;
  }

  return (
    <div className={`flex ${minimal ? "gap-1" : "gap-2"} pointer-events-none -mr-4 overflow-hidden relative z-100`}>
      <TransitionGroup component={null}>
        {debuffs.map((debuff) => {
          const key = `${debuff.name}-${debuff.endTime}`;
          const nodeRef = getNodeRef(key);
          const info = debuffInfo[debuff.name as Debuff];
          return (
            <CSSTransition key={key} nodeRef={nodeRef} timeout={300} classNames="debuff-item">
              <div ref={nodeRef} className="debuff-item-wrapper">
                <div
                  className={`
                    debuff-inner
                    border
                    rounded
                    bg-red-800
                    text-white
                    whitespace-nowrap
                    flex
                    items-baseline
                    ${minimal ? "text-xs px-2 py-1 gap-2" : "p-3 gap-3"}
                    `}
                >
                  <span className="font-bold">{info?.title ?? debuff.name}</span>
                  <span className={`text-white ${minimal ? "" : "text-lg"} font-mono`}>
                    {formatDuration(debuff.endTime - now)}
                  </span>
                </div>
              </div>
            </CSSTransition>
          );
        })}
      </TransitionGroup>
    </div>
  );
}
