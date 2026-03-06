import { useEffect, useRef, useState } from "react";
import { buildSchedule, getClippyImage } from "./clippyData";

const FRAME_W = 124;
const FRAME_H = 93;
const MS_PER_FRAME = 100; // 10 fps

interface ClippyProps {
  duration: number;
}

export function Clippy({ duration }: ClippyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [schedule] = useState(() => buildSchedule(duration));

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
    <canvas
      ref={canvasRef}
      width={FRAME_W}
      height={FRAME_H}
      className="absolute bottom-20 right-20 z-50"
    />
  );
}
