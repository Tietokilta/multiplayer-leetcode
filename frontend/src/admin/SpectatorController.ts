import { clippyDebuffs, Debuff } from "../debuffs";
import type { DebuffItem } from "../messages";
import type {
  AngryBirdCharConfettiPayload,
  AngryBirdFireConfettiPayload,
  AngryBirdInitPayload,
  AngryBirdPosPayload,
} from "../player/AngryBird";
import { EditorState } from "../player/Editor";
import { AbstractPlayerController, type BasePlayerState } from "../player/PlayerController";

type SpectateMessage =
  | { type: "spectate_editor"; player: string; code: string; row: number; col: number }
  | { type: "spectate_state"; player: string; state: "running" | "valid" | "invalid" | null }
  | { type: "spectate_output"; player: string; content: string }
  | { type: "spectate_debuffs"; player: string; debuffs: DebuffItem[] }
  | { type: "spectate_debuff_state"; player: string; name: string; payload: unknown };

export type SpectatorState = BasePlayerState;

export class SpectatorController extends AbstractPlayerController<SpectatorState> {
  confetti: ConfettiApi | null = null;
  birdInit: AngryBirdInitPayload | null = null;
  birdPos: AngryBirdPosPayload | null = null;

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
        if (this.hasDebuff(Debuff.confetti)) this.confetti?.fireConfettiAtCursor();
        if (this.hasDebuff(Debuff.emoji_confetti)) this.confetti?.fireEmojiConfettiAtCursor();
        if (clippyDebuffs.some((d) => this.hasDebuff(d))) {
          this.update({ clippyEdited: true, clippyBlocked: 0 });
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
        this.updateDebuffs(msg.debuffs.length === 0 ? false : msg.debuffs);
        this.rerender();
        break;
      }
      case "spectate_debuff_state": {
        const payload = msg.payload as Record<string, unknown>;
        if (msg.name === "screensaver") {
          this.update({ screensaverActive: payload.kind === "active" });
        } else if (msg.name === "angry_bird") {
          if (payload.kind === "init") {
            this.birdInit = payload as AngryBirdInitPayload;
            this.birdPos = null;
          } else if (payload.kind === "pos") {
            this.birdPos = payload as AngryBirdPosPayload;
          } else if (payload.kind === "char_confetti") {
            const p = payload as AngryBirdCharConfettiPayload;
            this.confetti?.fireCharConfetti(p.char, p.color, { x: p.x, y: p.y });
          } else if (payload.kind === "fire_confetti") {
            const p = payload as AngryBirdFireConfettiPayload;
            this.confetti?.fireConfettiAt({ x: p.x, y: p.y }, ["#ff0000", "#cc0000", "#ff4444", "#ff2222"]);
            this.birdPos = null;
          }
        }
        break;
      }
    }
  }
}
