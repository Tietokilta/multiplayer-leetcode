import { createRef, type ReactNode } from "react";
import { create } from "zustand";
import { GameServerHandler, type ConnState } from "../connection";
import type { KeyboardServerMessage, PlayerCmd, PlayerMessage, PuzzleMessage, StateMessage } from "../messages";
import { EditorState, type EditorAction } from "./Editor";
import { KeyboardServerHandler } from "./KeyboardServerHandler";
import { TurnTracker } from "./TurnTracker";

export type PlayerState = {
  connected: ConnState;
  hasBeenConnected: boolean;

  rendered?: ReactNode;
  puzzle: PuzzleMessage | null;
  output: string;
  submissionState: StateMessage["state"] | null;
  submissionError: string | null;

  keyboardConnected: ConnState;
  currentKeyboard: string | undefined;
  keyboardList: string[];
};

const example = `function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    map.set(nums[i], i);
  }
  return [];
}`;

export class PlayerController {
  server = new GameServerHandler<PlayerCmd, PlayerMessage>();
  keyboardServer = new KeyboardServerHandler();
  editor = new EditorState(example);
  turnTracker = new TurnTracker(this.keyboardServer);
  usePlayerStore = create<PlayerState>()(() => ({
    connected: "not",
    hasBeenConnected: false,

    rendered: undefined,
    puzzle: null,
    output: "",
    submissionState: null,
    submissionError: null,

    keyboardConnected: "not",
    currentKeyboard: undefined,
    keyboardList: [],
  }));
  outputRef = createRef<HTMLPreElement>();

  constructor() {
    this.server.handleState = (state) => this.update({ connected: state });
    this.server.handleLogin = (success: boolean) => success && this.update({ hasBeenConnected: true });
    this.server.handleMessage = (data) => this.handleMessage(data);
    this.keyboardServer.handleState = (state) => this.update({ keyboardConnected: state });
    this.keyboardServer.handleMessage = (msg) => this.handleKeyboardMessage(msg);
  }

  private update(slice: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>)) {
    this.usePlayerStore.setState(slice);
  }

  tick() {}

  handleMessage(data: PlayerMessage) {
    switch (data.type) {
      case "editor":
        this.editor.load(data);
        this.update({ rendered: this.editor.render() });
        break;
      case "puzzle":
        this.update((prev) =>
          prev.puzzle?.title === data.title
            ? { puzzle: data }
            : { puzzle: data, output: "", submissionState: null, submissionError: null },
        );
        break;
      case "output":
        this.update((prev) => ({ output: data.first ? data.content : prev.output + data.content }));
        break;
      case "state":
        if (data.state === "running") this.update({ output: "" });
        this.update({
          submissionState: data.state,
          submissionError: data.error ?? null,
        });
        break;
      case "error":
        console.error("Game server error:", data.message);
        this.update({ submissionError: data.message });
        break;
      default:
        console.warn("Unhandled message from game server:", data);
        break;
    }
  }

  handleEditorAction(isMyTurn: boolean, action: EditorAction) {
    switch (action) {
      case "edit":
      case "navigate":
        this.update({ rendered: this.editor.render() });
        if (action === "edit" && isMyTurn) {
          this.turnTracker.advanceTurn();
          this.update({
            currentKeyboard: this.turnTracker.currentKeyboard,
            keyboardList: this.turnTracker.seenKeyboards.slice(),
          });
        }
        this.server.send({
          type: "edit",
          code: this.editor.getCode(),
          row: this.editor.row,
          col: this.editor.col,
        });
        break;
      case "submit":
        this.server.send({ type: "submit" });
        break;
      case "ctrl_up":
      case "ctrl_down":
        if (this.outputRef.current) {
          const scrollAmount = this.outputRef.current.clientHeight / 3;
          this.outputRef.current.scrollBy({
            top: action === "ctrl_up" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
          });
        }
        break;
    }
    return action;
  }

  handleKeyboardEvent(evt: KeyboardEvent) {
    const action = this.editor.actLocal(evt);
    return this.handleEditorAction(false, action);
  }

  handleKeyboardMessage(msg: KeyboardServerMessage) {
    switch (msg.type) {
      case "keyboards":
        // Initial keyboard list from server
        for (const kb of msg.keyboards) {
          this.turnTracker.registerKeyboard(kb);
        }
        this.update({
          keyboardList: this.turnTracker.seenKeyboards.slice(),
          currentKeyboard: this.turnTracker.currentKeyboard,
        });
        return false;
      case "keyboard":
        // Keyboard added/removed
        if (msg.action === "added") {
          this.turnTracker.registerKeyboard(msg.port);
        } else if (msg.action === "removed") {
          this.turnTracker.removeKeyboard(msg.port);
        }
        this.update({
          keyboardList: this.turnTracker.seenKeyboards.slice(),
          currentKeyboard: this.turnTracker.currentKeyboard,
        });
        return false;
      case "key": {
        // Ignore events while window is not focused
        if (!document.hasFocus()) return false;
        // Key event
        const { port, state, key } = msg;
        this.turnTracker.registerKeyboard(port);
        const isMyTurn = this.turnTracker.isMyTurn(port);
        const action = this.editor.act(port, key, state, !isMyTurn);
        return this.handleEditorAction(isMyTurn, action);
      }
      default:
        console.warn("Unhandled message from keyboard server:", msg);
        return false;
    }
  }
}
