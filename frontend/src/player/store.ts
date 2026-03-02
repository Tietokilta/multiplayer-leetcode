import { type ReactNode } from "react";
import { create } from "zustand";
import type { KeyboardServerMessage, PlayerMessage, PuzzleMessage, StateMessage } from "../messages";
import { EditorState, type EditorAction } from "./Editor";
import type { TurnTracker } from "./TurnTracker";

export type PlayerState = {
  rendered?: ReactNode;
  puzzle: PuzzleMessage | null;
  output: string;
  submissionState: StateMessage["state"] | null;
  submissionError: string | null;

  currentKeyboard: string | undefined;
  keyboardList: string[];

  handleMessage: (editor: EditorState, data: PlayerMessage) => void;
  handleEditorAction: (
    editor: EditorState,
    isMyTurn: boolean,
    turnTracker: TurnTracker,
    action: EditorAction,
  ) => EditorAction;
  handleKeyboardEvent: (editor: EditorState, turnTracker: TurnTracker, e: KeyboardEvent) => EditorAction | false;
  handleKeyboardMessage: (
    editor: EditorState,
    turnTracker: TurnTracker,
    msg: KeyboardServerMessage,
  ) => EditorAction | false;
};

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  puzzle: null,
  output: "",
  submissionState: null,
  submissionError: null,

  currentKeyboard: undefined,
  keyboardList: [],

  handleMessage(editor, data) {
    switch (data.type) {
      case "editor":
        editor.load(data);
        set({ rendered: editor.render() });
        break;
      case "puzzle":
        set((prev) =>
          prev.puzzle?.title === data.title
            ? { puzzle: data }
            : { puzzle: data, output: "", submissionState: null, submissionError: null },
        );
        break;
      case "output":
        set((prev) => ({ output: data.first ? data.content : prev.output + data.content }));
        break;
      case "state":
        if (data.state === "running") set({ output: "" });
        set({
          submissionState: data.state,
          submissionError: data.error ?? null,
        });
        break;
      case "error":
        console.error("Game server error:", data.message);
        set({ submissionError: data.message });
        break;
      default:
        console.warn("Unhandled message from game server:", data);
        break;
    }
  },
  handleEditorAction(editor, isMyTurn, turnTracker, action) {
    if (action === "edit" || action === "navigate") {
      set({ rendered: editor.render() });
    }
    if (action === "edit" && isMyTurn) {
      turnTracker.advanceTurn();
      set({
        currentKeyboard: turnTracker.currentKeyboard,
        keyboardList: turnTracker.seenKeyboards.slice(),
      });
    }
    return action;
  },
  handleKeyboardEvent(editor, turnTracker, evt) {
    const action = editor.actLocal(evt);
    return get().handleEditorAction(editor, false, turnTracker, action);
  },
  handleKeyboardMessage: (editor: EditorState, turnTracker: TurnTracker, msg: KeyboardServerMessage) => {
    switch (msg.type) {
      case "keyboards":
        // Initial keyboard list from server
        for (const kb of msg.keyboards) {
          turnTracker.registerKeyboard(kb);
        }
        set({
          keyboardList: turnTracker.seenKeyboards.slice(),
          currentKeyboard: turnTracker.currentKeyboard,
        });
        return false;
      case "keyboard":
        // Keyboard added/removed
        if (msg.action === "added") {
          turnTracker.registerKeyboard(msg.port);
        } else if (msg.action === "removed") {
          turnTracker.removeKeyboard(msg.port);
        }
        set({
          keyboardList: turnTracker.seenKeyboards.slice(),
          currentKeyboard: turnTracker.currentKeyboard,
        });
        return false;
      case "key": {
        // Ignore events while window is not focused
        if (!document.hasFocus()) return false;
        // Key event
        const { port, state, key } = msg;
        turnTracker.registerKeyboard(port);
        const isMyTurn = turnTracker.isMyTurn(port);
        const action = editor.act(port, key, state, !isMyTurn);
        return get().handleEditorAction(editor, isMyTurn, turnTracker, action);
      }
      default:
        console.warn("Unhandled message from keyboard server:", msg);
        return false;
    }
  },
}));
