type ConfettiApi = {
  fireConfettiAtCursor: () => void;
  fireEmojiConfettiAtCursor: () => void;
  fireCharConfetti: (char: string, color: string, pos: { x: number; y: number }) => void;
  fireConfettiAt: (pos: { x: number; y: number }, colors: string[]) => void;
};

interface Window {
  confetti: ConfettiApi;
}
