import JSConfetti from "@purkkakoodari/js-confetti";

const confettiCanvas = document.getElementById("confetti") as HTMLCanvasElement;

confettiCanvas.width = window.innerWidth;
confettiCanvas.height = window.innerHeight;
window.addEventListener("resize", () => {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

const jsConfetti = new JSConfetti({ canvas: confettiCanvas });

const FUNNY_EMOJIS = ["💀", "🤡", "🐸", "🦆", "🍕", "🎉", "🤦", "😭", "🦧", "🔥", "💩", "🥴"];

function getCursorCenter() {
  const el = document.querySelector(".mlc--cursor")!;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function fireConfetti() {
  jsConfetti.addConfettiAtPosition({
    confettiDispatchPosition: getCursorCenter(),
    confettiRadius: 10,
    confettiNumber: 40,
    initialVelocityMin: 0.4,
    initialVelocityMax: 1.0,
  });
}

export function fireEmojiConfetti() {
  const emoji = FUNNY_EMOJIS[Math.floor(Math.random() * FUNNY_EMOJIS.length)];
  jsConfetti.addConfettiAtPosition({
    confettiDispatchPosition: getCursorCenter(),
    emojis: [emoji],
    emojiSize: 30,
    confettiNumber: 20,
    initialVelocityMin: 0.4,
    initialVelocityMax: 0.8,
  });
}

export function fireCharConfetti(char: string, color: string, pos: { x: number; y: number }) {
  jsConfetti.addConfettiAtPosition({
    confettiDispatchPosition: pos,
    confettiColors: [color],
    emojis: [char],
    emojiSize: 24,
    confettiNumber: 15,
    initialVelocityMin: 0.4,
    initialVelocityMax: 1.0,
  });
}

export function fireConfettiAt(pos: { x: number; y: number }, colors: string[]) {
  jsConfetti.addConfettiAtPosition({
    confettiDispatchPosition: pos,
    confettiColors: colors,
    confettiRadius: 8,
    confettiNumber: 60,
    initialVelocityMin: 0.4,
    initialVelocityMax: 1.2,
  });
}
