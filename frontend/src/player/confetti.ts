import JSConfetti from "js-confetti";

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
  });
}

export function fireEmojiConfetti() {
  const emoji = FUNNY_EMOJIS[Math.floor(Math.random() * FUNNY_EMOJIS.length)];
  jsConfetti.addConfettiAtPosition({
    confettiDispatchPosition: getCursorCenter(),
    emojis: [emoji],
    emojiSize: 30,
    confettiNumber: 20,
  });
}
