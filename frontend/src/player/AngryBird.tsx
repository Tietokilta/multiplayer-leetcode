import { useEffect, useRef } from "react";
import { Debuff } from "../debuffs";
import type { ActiveDebuff, PlayerController } from "./PlayerController";
import { fireCharConfetti, fireConfettiAt } from "./confetti";

const GRAVITY = 400; // px/s², positive = downward
const STILL_VELOCITY_THRESHOLD = 50; // px/s
const STILL_DURATION = 3; // seconds before despawn

// Rubber band attachment points in original slingshot image pixel space
const RB1_LOCAL = { x: 37, y: 37 };
const RB2_LOCAL = { x: 100, y: 51 };

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

const slingshotImg = loadImage("/angry_bird/slingshot.png");
const birdImg = loadImage("/angry_bird/red.png");

function easeSpringCosine(t: number) {
  return 1 - Math.cos((Math.PI / 2) * t);
}

export type AngryBirdPhase = "charging" | "launching" | "flying";

export type AngryBirdInitPayload = {
  kind: "init";
  canvasW: number;
  canvasH: number;
  charH: number;
  slingshotX: number;
  slingshotY: number;
  slingshotW: number;
  slingshotH: number;
  rb1: { x: number; y: number };
  rb2: { x: number; y: number };
  launchEndX: number;
  launchEndY: number;
  targetX: number;
  targetY: number;
  birdRadius: number;
  initialVx: number;
  initialVy: number;
  loadedX: number;
  loadedY: number;
};

export type AngryBirdPosPayload = {
  kind: "pos";
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  phase: AngryBirdPhase;
};

export type AngryBirdPayload = AngryBirdInitPayload | AngryBirdPosPayload;

function AngryBirdInner({ debuff, controller }: { debuff: ActiveDebuff; controller: PlayerController }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d")!;

    // Measure character height from the editor DOM
    const charSpan = document.querySelector(".mlc--editor .mlc--line span");
    const charH = charSpan ? charSpan.getBoundingClientRect().height : 20;

    // Size everything relative to character height
    const slingshotH = 4 * charH;
    const slingshotW = slingshotH * (195 / 337);
    const slingshotScale = slingshotH / 337; // maps original image px → screen px
    const birdImgH = 0.8 * charH;
    const birdImgW = birdImgH * (177 / 172);
    const birdScale = birdImgH / 172; // original image px → screen px
    // Bird center and radius in original image space: center=(80,100), radius=40
    const birdCenterX = 80 * birdScale;
    const birdCenterY = 100 * birdScale;
    const birdRadius = 80 * birdScale;

    // Slingshot screen position (bottom-right corner)
    const sx = window.innerWidth - slingshotW - 140;
    const sy = window.innerHeight - slingshotH - 100;

    // Rubber band attachment points in screen space
    const rb1 = { x: sx + RB1_LOCAL.x * slingshotScale, y: sy + RB1_LOCAL.y * slingshotScale };
    const rb2 = { x: sx + RB2_LOCAL.x * slingshotScale, y: sy + RB2_LOCAL.y * slingshotScale };

    // Launch end position: directly between the slingshot endpoints
    const rbMidX = (rb1.x + rb2.x) / 2;
    const rbMidY = (rb1.y + rb2.y) / 2;
    const launchEndX = rbMidX;
    const launchEndY = rbMidY;

    // Aim just below the first `def <name>` line
    // With gravity: dy = g*t² * (0.5 - 1/k) → t = sqrt(-dy / (g*(1/k - 0.5)))
    const editorEl = document.querySelector(".mlc--editor");
    if (!editorEl) return;
    const allLines = editorEl.querySelectorAll(".mlc--line");
    const defLineIdx = controller.editor.code.findIndex((chars) => /^def \w+/.test(chars.join("")));
    let targetX: number, targetY: number;
    if (defLineIdx >= 0 && defLineIdx + 1 < allLines.length) {
      const lineRect = allLines[defLineIdx + 1].getBoundingClientRect();
      targetX = lineRect.left + lineRect.width * 0.4;
      targetY = lineRect.top + lineRect.height / 2;
    } else {
      // Fallback: center of mass of all non-space characters
      let sumX = 0,
        sumY = 0,
        count = 0;
      for (let i = 0; i < allLines.length; i++) {
        const spans = allLines[i].querySelectorAll("span");
        const codeLine = controller.editor.code[i];
        if (!codeLine) continue;
        for (let j = 0; j < Math.min(spans.length, codeLine.length); j++) {
          if (codeLine[j] === " " || codeLine[j] === "\t") continue;
          const r = spans[j].getBoundingClientRect();
          sumX += r.left + r.width / 2;
          sumY += r.top + r.height / 2;
          count++;
        }
      }
      targetX = count > 0 ? sumX / count : window.innerWidth * 0.3;
      targetY = count > 0 ? sumY / count - 0.15 * allLines.length * charH : window.innerHeight * 0.6;
    }
    const dx = targetX - launchEndX;
    const dy = targetY - launchEndY; // negative: target is above launch point
    const k = 1.2; // arrive at k * t_apex
    const tHit = Math.sqrt(-dy / (GRAVITY * (1 / k - 0.5)));
    let vx = dx / tHit;
    let vy = (-GRAVITY * tHit) / k;
    // Charge start position: back-calculated so the interpolated velocity at launch
    // matches the initial flight velocity. easeSpringCosine'(1) = π/2, duration = 0.3s.
    const launchDuration = 0.3;
    const loadedX = launchEndX - (vx * launchDuration) / (Math.PI / 2);
    const loadedY = launchEndY - (vy * launchDuration) / (Math.PI / 2);
    let birdX = loadedX;
    let birdY = loadedY;
    let strength = debuff.strength;
    let angle = 0;
    let omega = 0; // rad/s
    let stillTime = 0;

    let phase: AngryBirdPhase = "charging";
    let phaseStartTime = performance.now();

    controller.server.send({
      type: "debuff_state",
      name: "angry_bird",
      payload: {
        kind: "init",
        canvasW: canvas.width,
        canvasH: canvas.height,
        charH,
        slingshotX: sx,
        slingshotY: sy,
        slingshotW,
        slingshotH,
        rb1,
        rb2,
        launchEndX,
        launchEndY,
        targetX,
        targetY,
        birdRadius,
        initialVx: vx,
        initialVy: vy,
        loadedX,
        loadedY,
      } satisfies AngryBirdInitPayload,
    });

    function drawRubberBand(bx: number, by: number, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#8B5E3C";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(rb1.x, rb1.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rb2.x, rb2.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    }

    function drawFrame(bx: number, by: number, showBands: boolean, bandAlpha = 1, birdAngle = 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (showBands) {
        drawRubberBand(bx, by, bandAlpha);
      }
      ctx.drawImage(slingshotImg, sx, sy, slingshotW, slingshotH);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(birdAngle);
      ctx.drawImage(birdImg, -birdCenterX, -birdCenterY, birdImgW, birdImgH);
      ctx.restore();
    }

    let rafId: number;
    let lastTime = performance.now();

    function checkCollisions() {
      const editorEl = document.querySelector(".mlc--editor");
      if (!editorEl) return;
      const lineDivs = editorEl.querySelectorAll(".mlc--line");
      let anyHit = false;
      outer: for (let i = 0; i < lineDivs.length; i++) {
        const lineRect = lineDivs[i].getBoundingClientRect();
        if (birdY + birdRadius < lineRect.top || birdY - birdRadius > lineRect.bottom) continue;
        const spans = lineDivs[i].querySelectorAll("span");
        const codeLine = controller.editor.code[i];
        if (!codeLine) continue;
        for (let j = 0; j < Math.min(spans.length, codeLine.length); j++) {
          const char = codeLine[j];
          if (char === " " || char === "\t") continue;
          const rect = spans[j].getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          if (dist(birdX, birdY, cx, cy) < birdRadius + rect.width * 0.7) {
            controller.editor.code[i][j] = " ";
            const color = window.getComputedStyle(spans[j]).color;
            fireCharConfetti(char, color, { x: cx, y: cy });
            strength--;
            vx *= 1 - 1 / debuff.strength;
            vy *= 1 - 1 / debuff.strength;
            anyHit = true;
            if (strength <= 0) break outer;
          }
        }
      }
      if (anyHit) {
        controller.rerender();
        controller.server.send({
          type: "edit",
          code: controller.editor.getCode(),
          row: controller.editor.row,
          col: controller.editor.col,
        });
      }
    }

    function checkCharacterBounces() {
      const editorEl = document.querySelector(".mlc--editor");
      if (!editorEl) return;
      const lineDivs = editorEl.querySelectorAll(".mlc--line");
      const restitution = 0.6;
      const f = 0.4;
      const r = birdRadius;
      for (let i = 0; i < lineDivs.length; i++) {
        const lineRect = lineDivs[i].getBoundingClientRect();
        if (birdY + r < lineRect.top || birdY - r > lineRect.bottom) continue;
        const spans = lineDivs[i].querySelectorAll("span");
        const codeLine = controller.editor.code[i];
        if (!codeLine) continue;
        for (let j = 0; j < Math.min(spans.length, codeLine.length); j++) {
          if (codeLine[j] === " " || codeLine[j] === "\t") continue;
          const rect = spans[j].getBoundingClientRect();
          const cpx = Math.max(rect.left, Math.min(birdX, rect.right));
          const cpy = Math.max(rect.top, Math.min(birdY, rect.bottom));
          const d = dist(birdX, birdY, cpx, cpy);
          if (d >= r) continue;
          // Collision normal from closest point toward bird center
          let nx: number, ny: number;
          if (d < 1e-6) {
            // Bird center inside rect — push out along nearest edge
            const dl = birdX - rect.left;
            const dr = rect.right - birdX;
            const dt = birdY - rect.top;
            const db = rect.bottom - birdY;
            const minD = Math.min(dl, dr, dt, db);
            if (minD === dl) {
              nx = -1;
              ny = 0;
            } else if (minD === dr) {
              nx = 1;
              ny = 0;
            } else if (minD === dt) {
              nx = 0;
              ny = -1;
            } else {
              nx = 0;
              ny = 1;
            }
          } else {
            nx = (birdX - cpx) / d;
            ny = (birdY - cpy) / d;
          }
          // Resolve penetration (like wall code snapping birdX = r)
          const pen = r - d;
          birdX += nx * pen;
          birdY += ny * pen;
          // Only bounce if approaching
          const vDotN = vx * nx + vy * ny;
          if (vDotN < 0) {
            vx -= (1 + restitution) * vDotN * nx;
            vy -= (1 + restitution) * vDotN * ny;
            // Tangential friction + spin transfer
            const tx = -ny;
            const ty = nx;
            const slip = vx * tx + vy * ty - omega * r;
            vx -= f * slip * tx;
            vy -= f * slip * ty;
            omega += (f * slip) / r;
          }
        }
      }
    }

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05); // cap dt at 50ms
      lastTime = now;
      const elapsed = now - phaseStartTime;

      if (phase === "charging") {
        // Wobble bird in place
        const wobbleX = loadedX + Math.sin(elapsed * 0.03) * 3;
        const wobbleY = loadedY + Math.cos(elapsed * 0.027) * 2;
        birdX = wobbleX;
        birdY = wobbleY;
        drawFrame(birdX, birdY, true);
        if (elapsed > 4000) {
          phase = "launching";
          phaseStartTime = now;
        }
      } else if (phase === "launching") {
        const u = Math.min(elapsed / 300, 1);
        const t = easeSpringCosine(u);
        birdX = loadedX + (launchEndX - loadedX) * t;
        birdY = loadedY + (launchEndY - loadedY) * t;
        // Rubber bands snap back toward attachment points as bird leaves
        const bandAlpha = 1 - t;
        drawFrame(birdX, birdY, true, bandAlpha);
        if (u >= 1) {
          phase = "flying";
          phaseStartTime = now;
          birdX = launchEndX;
          birdY = launchEndY;
        }
      } else {
        // Flying
        vy += GRAVITY * dt;
        birdX += vx * dt;
        birdY += vy * dt;

        angle += omega * dt;

        // Bounce off screen edges with energy loss and rolling transfer
        const restitution = 0.6;
        const f = 0.4; // friction factor for rolling
        const r = birdRadius;
        let touching = false;
        if (birdX - r < 0) {
          birdX = r;
          vx = Math.abs(vx) * restitution;
          const slip = vy - omega * r;
          vy -= f * slip;
          omega += (f * slip) / r;
          touching = true;
        } else if (birdX + r > canvas.width) {
          birdX = canvas.width - r;
          vx = -Math.abs(vx) * restitution;
          const slip = vy + omega * r;
          vy -= f * slip;
          omega -= (f * slip) / r;
          touching = true;
        }
        if (birdY - r < 0) {
          birdY = r;
          vy = Math.abs(vy) * restitution;
          const slip = vx + omega * r;
          vx -= f * slip;
          omega -= (f * slip) / r;
          touching = true;
        } else if (birdY + r > canvas.height) {
          birdY = canvas.height - r;
          vy = -Math.abs(vy) * restitution;
          const slip = vx - omega * r;
          vx -= f * slip;
          omega += (f * slip) / r;
          touching = true;
        }
        // Rolling friction: damp spin continuously while in contact
        if (touching) omega *= 0.98;

        if (strength > 0) {
          checkCollisions();
        } else {
          checkCharacterBounces();
        }

        const speed = Math.hypot(vx, vy);
        if (speed < STILL_VELOCITY_THRESHOLD) {
          stillTime += dt;
          if (stillTime >= STILL_DURATION) {
            cancelAnimationFrame(rafId);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            fireConfettiAt({ x: birdX, y: birdY }, ["#ff0000", "#cc0000", "#ff4444", "#ff2222"]);
            return;
          }
        } else {
          stillTime = 0;
        }

        drawFrame(birdX, birdY, false, 1, angle);
      }

      controller.server.send({
        type: "debuff_state",
        name: "angry_bird",
        payload: { kind: "pos", x: birdX, y: birdY, vx, vy, angle, phase } satisfies AngryBirdPosPayload,
      });
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [controller, debuff.strength]);

  return <canvas ref={canvasRef} className="fixed inset-0 z-50 pointer-events-none" />;
}

export function AngryBird({ controller }: { controller: PlayerController }) {
  const debuff = controller.usePlayerStore((state) =>
    state.activeDebuffNames.has(Debuff.angry_bird)
      ? state.debuffs.find((d) => d.name === Debuff.angry_bird)
      : undefined,
  );
  if (!debuff) return null;
  return <AngryBirdInner key={debuff.endTime} debuff={debuff} controller={controller} />;
}
