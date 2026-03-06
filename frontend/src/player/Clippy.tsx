import { useEffect, useRef, useState } from "react";
import { buildSchedule, getClippyImage } from "./clippyData";
import type { ActiveDebuff } from "./PlayerController";
import { Debuff } from "../debuffs";

const FRAME_W = 124;
const FRAME_H = 93;
const MS_PER_FRAME = 100; // 10 fps

interface ClippyProps {
  debuff: ActiveDebuff;
  done?: boolean;
}

export function Clippy({ debuff: { duration, name }, done = false }: ClippyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [schedule] = useState(() => buildSchedule(duration));
  const [showBubble, setShowBubble] = useState(false);
  const [altText, setAltText] = useState(false);

  useEffect(() => {
    const entryEndMs = schedule[1].startMs;
    const exitStartMs = schedule[schedule.length - 2].startMs;
    const firstThirdMs = (entryEndMs + exitStartMs) / 3;

    const showTimer = setTimeout(() => setShowBubble(true), entryEndMs);
    const hideTimer = setTimeout(() => setShowBubble(false), exitStartMs);
    const textTimer = setTimeout(() => setAltText(true), firstThirdMs);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(textTimer);
    };
  }, [schedule, duration]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const mountTime = performance.now();

    console.log("[Clippy] schedule:", schedule.map(({ startMs, name }) => `${startMs}ms → ${name}`).join(", "));

    let rafId: number;

    function render() {
      const elapsed = performance.now() - mountTime;

      // Find the current schedule item
      let current = schedule[0];
      for (let i = 1; i < schedule.length; i++) {
        if (schedule[i].startMs > elapsed) break;
        current = schedule[i];
      }

      if (current.name === null) {
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);
        return;
      }

      const img = getClippyImage(current.name);
      if (img.complete && img.naturalHeight > 0) {
        const animElapsed = elapsed - current.startMs;
        const totalFrames = Math.max(1, Math.round(img.naturalHeight / FRAME_H));
        const frameIndex = Math.min(Math.floor(animElapsed / MS_PER_FRAME), totalFrames - 1);
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);
        ctx.drawImage(img, 0, frameIndex * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      }

      rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(rafId);
  }, [schedule]);

  return (
    <div className="absolute bottom-20 right-20 z-50 flex flex-col items-end pointer-events-none">
      <div className={`relative mb-[20px] ${showBubble ? "" : "invisible"}`}>
        {/* Bubble tail pointing down-right toward Clippy */}
        <div className="w-0 h-0 absolute -bottom-[15px] right-[66%]             border-[15px] border-transparent border-r-black    " />
        <div className="w-0 h-0 absolute -bottom-[13px] right-[calc(66%_+_1px)] border-[15px] border-transparent border-r-[#ffffcc]" />
        {/* Chat bubble */}
        <div className="relative bg-[#ffffcc] border border-black rounded-lg p-3 w-52 text-gray-800 flex flex-col gap-3">
          {name === Debuff.clippy_attack ? (
            done ? (
              <>
                <p>There you go, much better!</p>
                <ul className="space-y-2 pl-5 list-image-[url('/clippy/bullet.png')]">
                  <li className="pl-1">Thanks, Clippy!</li>
                  <li className="pl-1">Please help me more!</li>
                </ul>
              </>
            ) : altText ? (
              <p>All right, just a moment!</p>
            ) : (
              <>
                <p>It looks like you're writing code!</p>
                <p>Would you like help?</p>
                <ul className="space-y-2 pl-5 list-image-[url('/clippy/bullet.png')]">
                  <li className="pl-1">Get help with the algorithm</li>
                  <li className="pl-1">Yes, definitely get help with the algorithm</li>
                </ul>
                <label className="flex items-center gap-1">
                  <input type="checkbox" /> Show this more often
                </label>
              </>
            )
          ) : name === Debuff.clippy_comments ? (
            done ? (
              <>
                <p>There you go, much better!</p>
                <ul className="space-y-2 pl-5 list-image-[url('/clippy/bullet.png')]">
                  <li className="pl-1">Thanks, Clippy!</li>
                  <li className="pl-1">Please help me more!</li>
                </ul>
              </>
            ) : altText ? (
              <p>All right, just a moment!</p>
            ) : (
              <>
                <p>It looks like you don't understand the code you're writing!</p>
                <p>Would you like help?</p>
                <ul className="space-y-2 pl-5 list-image-[url('/clippy/bullet.png')]">
                  <li className="pl-1">Document my algorithm</li>
                  <li className="pl-1">Add some helpful comments</li>
                </ul>
                <label className="flex items-center gap-1">
                  <input type="checkbox" /> Show this more often
                </label>
              </>
            )
          ) : (
            "Unknown debuff"
          )}
        </div>
        {/* Cover border at bubble tail */}
        <div className="w-[15px] h-[1px] absolute bottom-0 right-[66%] bg-[#ffffcc]" />
      </div>
      <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} className="w-[186px] h-[140px]" />
    </div>
  );
}
