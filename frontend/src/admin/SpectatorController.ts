import { Debuff } from "../debuffs";
import type { DebuffItem } from "../messages";
import type { AngryBirdInitPayload, AngryBirdPosPayload } from "../player/AngryBird";
import { EditorState } from "../player/Editor";
import { AbstractPlayerController, type BasePlayerState } from "../player/PlayerController";

type SpectateMessage =
  | { type: "spectate_editor"; player: string; code: string; row: number; col: number }
  | { type: "spectate_state"; player: string; state: "running" | "valid" | "invalid" | null }
  | { type: "spectate_output"; player: string; content: string }
  | { type: "spectate_debuffs"; player: string; debuffs: DebuffItem[] }
  | { type: "spectate_debuff_state"; player: string; name: string; payload: unknown };

export type SpectatorState = BasePlayerState & {
  birdInit: AngryBirdInitPayload | null;
  birdPos: AngryBirdPosPayload | null;
};

export class SpectatorController extends AbstractPlayerController<SpectatorState> {
  confetti: Pick<Window, "fireConfetti" | "fireEmojiConfetti"> | null = null;

  protected createState(): SpectatorState {
    return {
      puzzle: null,
      rendered: undefined,
      output: "",
      submissionState: null,
      submissionError: null,

      debuffs: [],
      activeDebuffNames: new Set(),

      screensaverActive: false,
      screensaverTimeout: null,
      clippyEdited: false,
      clippyBlocked: 0,
      birdInit: null,
      birdPos: null,
    };
  }

  update(slice: Partial<SpectatorState> | ((state: SpectatorState) => Partial<SpectatorState>)) {
    this.usePlayerStore.setState(slice);
  }

  reset(): void {
    this.editor = new EditorState();
    this.update({ rendered: undefined, output: "", submissionState: null, submissionError: null });
  }

  handleMessage(msg: SpectateMessage): void {
    switch (msg.type) {
      case "spectate_editor": {
        this.editor.load({ type: "editor", code: msg.code, row: msg.row, col: msg.col });
        this.rerender();
        if (this.confetti) {
          if (this.hasDebuff(Debuff.confetti)) this.confetti.fireConfetti();
          if (this.hasDebuff(Debuff.emoji_confetti)) this.confetti.fireEmojiConfetti();
        }
        break;
      }
      case "spectate_state":
        this.update({
          submissionState: msg.state,
          ...(msg.state === "running" || msg.state === null ? { output: "" } : {}),
        });
        break;
      case "spectate_output":
        this.update((prev) => ({ output: prev.output + msg.content }));
        break;
      case "spectate_debuffs": {
        this.updateDebuffs(msg.debuffs);
        this.rerender();
        break;
      }
      case "spectate_debuff_state": {
        const payload = msg.payload as Record<string, unknown>;
        if (msg.name === "screensaver") {
          this.update({ screensaverActive: payload.kind === "active" });
        } else if (msg.name === "angry_bird") {
          this.update((prev) => ({
            ...(payload.kind === "init" ? { birdInit: payload as AngryBirdInitPayload } : {}),
            birdPos: payload.kind === "pos" ? (payload as AngryBirdPosPayload) : prev.birdPos,
          }));
        }
        break;
      }
    }
  }
}
