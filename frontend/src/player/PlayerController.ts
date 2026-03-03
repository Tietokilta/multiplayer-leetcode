import { createRef, type ReactNode } from "react";
import { create } from "zustand";
import { GameServerHandler, type ConnState } from "../connection";
import { Debuff } from "../debuffs";
import { keyToRow, nextKeyRight, reverseNavigationKeys } from "../keyboards";
import type {
  KeyboardServerMessage,
  KeyState,
  PlayerCmd,
  PlayerMessage,
  PuzzleMessage,
  StateMessage,
} from "../messages";
import { EditorState } from "./Editor";
import { KeyboardServerHandler } from "./KeyboardServerHandler";
import { mapKeyboardEvent } from "./LocalKeyboard";
import { TurnTracker } from "./TurnTracker";

export type ActiveDebuff = {
  name: Debuff;
  type: string;
  strength: number;
  endTime: number; // Date.now() + duration * 1000
};

function activeNamesFromDebuffs(debuffs: ActiveDebuff[]): Set<Debuff> {
  const seen = new Set<string>();
  const names = new Set<Debuff>();
  for (const d of debuffs) {
    if (!seen.has(d.type)) {
      seen.add(d.type);
      names.add(d.name);
    }
  }
  return names;
}

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

  debuffs: ActiveDebuff[];
  activeDebuffNames: Set<Debuff>;
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
  turnTracker = new TurnTracker(this);

  autoCycleLastTick = 0;

  /** Immutable state store, updated from mutable state. */
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

    debuffs: [],
    activeDebuffNames: new Set(),
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

  private rerender() {
    const { activeDebuffNames } = this.usePlayerStore.getState();
    this.update({ rendered: this.editor.render(activeDebuffNames) });
  }

  hasDebuff(...name: Debuff[]) {
    const { activeDebuffNames } = this.usePlayerStore.getState();
    return name.some((n) => activeDebuffNames.has(n));
  }

  tick() {
    const now = Date.now();
    const { debuffs } = this.usePlayerStore.getState();
    const remaining = debuffs.filter((d) => d.endTime > now);
    this.update({ debuffs: remaining, activeDebuffNames: activeNamesFromDebuffs(remaining) });
    if (remaining.length > 0) {
      setTimeout(() => this.tick(), remaining[0].endTime - now);
    }

    if (this.hasDebuff(Debuff.auto_cycle)) {
      const debuff = remaining.find((d) => d.name === Debuff.auto_cycle)!;
      const minDelay = 10000 / debuff.strength; // strength is cycles per 10s
      if (this.autoCycleLastTick + minDelay < now) {
        this.autoCycleLastTick = now;
        this.turnTracker.advanceTurn();
        this.update({
          currentKeyboard: this.turnTracker.currentKeyboard,
          keyboardList: this.turnTracker.seenKeyboards.slice(),
        });
      }
    }
  }

  handleMessage(data: PlayerMessage) {
    switch (data.type) {
      case "editor":
        this.editor.load(data);
        this.rerender();
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
      case "debuffs": {
        if (data.debuffs.length === 0) {
          this.update({ debuffs: [], activeDebuffNames: new Set() });
          this.rerender();
          break;
        }
        const now = Date.now();
        const { debuffs: existing } = this.usePlayerStore.getState();
        const debuffs = [
          ...existing,
          ...data.debuffs.map((d) => ({
            name: d.name,
            type: d.type,
            strength: d.strength,
            endTime: now + d.duration * 1000,
          })),
        ].sort((a, b) => a.endTime - b.endTime);
        this.update({ debuffs, activeDebuffNames: activeNamesFromDebuffs(debuffs) });
        this.rerender();
        if (debuffs.length > 0) {
          setTimeout(() => this.tick(), debuffs[0].endTime - now);
        }
        break;
      }
      case "error":
        console.error("Game server error:", data.message);
        this.update({ submissionError: data.message });
        break;
      default:
        console.warn("Unhandled message from game server:", data);
        break;
    }
  }

  handleKey(isMyTurn: boolean, port: string, key: string, state: KeyState) {
    // Input debuffs:
    if (this.hasDebuff(Debuff.key_shift)) {
      // Shift keys to the right by one (Q->W, W->E, ..., P->[, [->], ]->Q) where possible.
      key = nextKeyRight[key] ?? key;
    }
    if (this.hasDebuff(Debuff.reverse_navigation)) {
      // Reverse navigation keys (LEFT<->RIGHT, UP<->DOWN, HOME<->END, PGDN<->PGUP)
      key = reverseNavigationKeys[key] ?? key;
    }

    const action = this.editor.act(port, key, state, !isMyTurn);

    switch (action) {
      case "edit":
      case "navigate": {
        this.rerender();
        if (action === "edit" && isMyTurn && !this.hasDebuff(Debuff.auto_cycle, Debuff.row_by_row)) {
          if (this.hasDebuff(Debuff.random_order)) this.turnTracker.randomizeTurn();
          else this.turnTracker.advanceTurn();
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
      }
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
    const [key, state] = mapKeyboardEvent(evt);
    return this.handleKey(false, "local", key, state);
  }

  handleKeyboardMessage(msg: KeyboardServerMessage) {
    switch (msg.type) {
      case "keyboards":
        // Initial keyboard list from server
        for (const kb of msg.keyboards) {
          this.turnTracker.registerKeyboard(kb);
        }
        this.update({
          currentKeyboard: this.turnTracker.currentKeyboard,
          keyboardList: this.turnTracker.seenKeyboards.slice(),
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
          currentKeyboard: this.turnTracker.currentKeyboard,
          keyboardList: this.turnTracker.seenKeyboards.slice(),
        });
        return false;
      case "key": {
        // Ignore events while window is not focused
        if (!document.hasFocus()) return false;
        // Key event
        let { port, state, key } = msg; // eslint-disable-line prefer-const
        key = key.slice(4); // remove "KEY_" prefix

        this.turnTracker.registerKeyboard(port);

        // Turn order determination:
        let isMyTurn;
        if (this.hasDebuff(Debuff.row_by_row)) {
          // In row_by_row, turn is determined by the row of the key pressed, instead of the keyboard
          const row = keyToRow[key];
          isMyTurn =
            row == null || this.turnTracker.seenKeyboards[row % this.turnTracker.seenKeyboards.length] === port;
        } else {
          isMyTurn = this.turnTracker.isMyTurn(port);
        }
        return this.handleKey(isMyTurn, port, key, state);
      }
      default:
        console.warn("Unhandled message from keyboard server:", msg);
        return false;
    }
  }

  sendLeds() {
    for (const [i, kb] of this.turnTracker.seenKeyboards.entries()) {
      let leds: [0 | 1, 0 | 1, 0 | 1];
      if (this.hasDebuff(Debuff.row_by_row)) {
        // In row_by_row, indicate the row each keyboard controls
        // (111 = numbers, 100 = qwerty, 010 = asdfgh, 001 = zxcvbn)
        leds = [i === 0 || i === 1 ? 1 : 0, i === 0 || i === 2 ? 1 : 0, i === 0 || i === 3 ? 1 : 0];
      } else {
        const on = i === this.turnTracker.currentTurnIndex ? 1 : 0;
        leds = [on, on, on];
      }
      this.keyboardServer.send([kb, ...leds]);
    }
  }
}
