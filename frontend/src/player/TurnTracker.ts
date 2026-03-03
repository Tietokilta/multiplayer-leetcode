import type { KeyboardServerHandler } from "./KeyboardServerHandler";

export class TurnTracker {
  keyboardServer?: KeyboardServerHandler;
  seenKeyboards: string[] = [];
  currentTurnIndex: number = 0;
  ignoreWrongOrder: boolean = false;

  constructor(keyboardServer?: KeyboardServerHandler) {
    this.keyboardServer = keyboardServer;
  }

  get currentKeyboard(): string | undefined {
    return this.seenKeyboards[this.currentTurnIndex];
  }

  registerKeyboard(keyboard: string) {
    if (!this.seenKeyboards.includes(keyboard)) {
      const index = this.seenKeyboards.findIndex((k) => k > keyboard);
      this.seenKeyboards.splice(index === -1 ? this.seenKeyboards.length : index, 0, keyboard);
      if (index !== -1 && index <= this.currentTurnIndex) {
        this.currentTurnIndex++;
      }
    }
  }

  removeKeyboard(keyboard: string) {
    const index = this.seenKeyboards.indexOf(keyboard);
    if (index !== -1) {
      this.seenKeyboards.splice(index, 1);
      if (index < this.currentTurnIndex) {
        this.currentTurnIndex--;
      } else if (this.currentTurnIndex >= this.seenKeyboards.length) {
        this.currentTurnIndex = 0;
      }
    }
  }

  isMyTurn(keyboard: string): boolean {
    return this.ignoreWrongOrder || this.seenKeyboards.length <= 1 || keyboard === this.currentKeyboard;
  }

  advanceTurn() {
    if (this.seenKeyboards.length > 0) {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.seenKeyboards.length;
      this.sendLeds();
    }
  }

  randomizeTurn() {
    if (this.seenKeyboards.length > 1) {
      const prev = this.currentTurnIndex;
      this.currentTurnIndex = Math.floor(Math.random() * (this.seenKeyboards.length - 1));
      if (this.currentTurnIndex >= prev) this.currentTurnIndex++;
      this.sendLeds();
    }
  }

  private sendLeds() {
    if (this.keyboardServer) {
      for (const [i, kb] of this.seenKeyboards.entries()) {
        const on = i === this.currentTurnIndex ? 1 : 0;
        this.keyboardServer.send([kb, on, on, on]);
      }
    }
  }
}
