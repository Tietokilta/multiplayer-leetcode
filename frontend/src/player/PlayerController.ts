import { createRef, type ReactNode } from "react";
import { create } from "zustand";
import { GameServerHandler, type ConnState } from "../connection";
import { clippyDebuffs, Debuff } from "../debuffs";
import { keyToRow, nextKeyRight, reverseNavigationKeys } from "../keyboards";
import type {
  DebuffItem,
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
import { fireConfetti, fireEmojiConfetti } from "./confetti";

export type ActiveDebuff = {
  name: Debuff;
  type: string;
  strength: number;
  duration: number;
  endTime: number; // Date.now() + duration * 1000
};

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
  clippyEdited: boolean;
  clippyBlocked: number;

  screensaverActive: boolean;
  screensaverTimeout: number | null;
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

function filterActive(debuffs: ActiveDebuff[]) {
  const seen = new Set<string>();
  return debuffs.filter((d) => {
    if (seen.has(d.type)) return false;
    seen.add(d.type);
    return true;
  });
}

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

    rendered: this.editor.render(new Set()), // Initial render without debuffs
    puzzle: null,
    output: "",
    submissionState: null,
    submissionError: null,

    keyboardConnected: "not",
    currentKeyboard: undefined,
    keyboardList: [],

    debuffs: [],
    activeDebuffNames: new Set(),
    clippyEdited: false,
    clippyBlocked: 0,

    screensaverActive: false,
    screensaverTimeout: null,
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

  rerender() {
    const { activeDebuffNames } = this.usePlayerStore.getState();
    this.update({ rendered: this.editor.render(activeDebuffNames) });
  }

  private updateScreensaver(bump: boolean) {
    const { screensaverTimeout, screensaverActive } = this.usePlayerStore.getState();
    const debuff = this.findDebuff(Debuff.screensaver);
    if (screensaverTimeout && (!debuff || bump)) {
      clearTimeout(screensaverTimeout);
    }
    if (!debuff) {
      if (screensaverActive)
        this.server.send({ type: "debuff_state", name: "screensaver", payload: { kind: "inactive" } });
      this.update({ screensaverActive: false, screensaverTimeout: null });
      return;
    } else if (bump || !screensaverTimeout) {
      if (screensaverActive)
        this.server.send({ type: "debuff_state", name: "screensaver", payload: { kind: "inactive" } });
      const delay = 10000 - debuff.strength; // strength is ms of inactivity before screensaver
      this.update({
        screensaverActive: false,
        screensaverTimeout: setTimeout(() => {
          this.update({ screensaverActive: true });
          this.server.send({ type: "debuff_state", name: "screensaver", payload: { kind: "active" } });
        }, delay),
      });
    }
  }

  hasDebuff(...name: Debuff[]) {
    const { activeDebuffNames } = this.usePlayerStore.getState();
    return name.some((n) => activeDebuffNames.has(n));
  }

  findDebuff(name: Debuff): ActiveDebuff | undefined {
    const { activeDebuffNames, debuffs } = this.usePlayerStore.getState();
    if (!activeDebuffNames.has(name)) return undefined;
    return debuffs.find((d) => d.name === name);
  }

  tick() {
    const now = Date.now();
    const remaining = this.updateDebuffs([]);
    if (remaining.length > 0) {
      setTimeout(() => this.tick(), remaining[0].endTime - now);
    }
    this.updateScreensaver(false);

    let debuff;
    if ((debuff = this.findDebuff(Debuff.auto_cycle))) {
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

  private updateDebuffs(newDebuffs: DebuffItem[] | false) {
    const now = Date.now();
    const { debuffs: debuffsBefore } = this.usePlayerStore.getState();
    const activeBefore = filterActive(debuffsBefore);

    const debuffsAfter =
      newDebuffs === false
        ? []
        : [
            ...debuffsBefore.filter((d) => d.endTime > now),
            ...newDebuffs.map((d) => ({
              name: d.name,
              type: d.type,
              strength: d.strength,
              duration: d.duration * 1000,
              endTime: now + d.duration * 1000,
            })),
          ].sort((a, b) => a.endTime - b.endTime);
    const activeAfter = filterActive(debuffsAfter);

    for (const ended of activeBefore) {
      if (!activeAfter.includes(ended)) {
        console.log("Debuff ended:", ended.name);
      }
    }
    for (const started of activeAfter) {
      if (!activeBefore.includes(started)) {
        console.log("Debuff started:", started.name);
        if (clippyDebuffs.includes(started.name)) {
          this.update({ clippyEdited: false, clippyBlocked: 0 });
        }
        if (started.name === Debuff.keyboard_cat) {
          // Allow some time for the video to start, then start injecting random keys
          setTimeout(() => this.injectRandomKey(), 1500);
        }
        if (started.name === Debuff.waves) {
          document.body.style.setProperty("--wave-strength", `${started.strength}px`);
        }
        if (started.name === Debuff.nausea) {
          document.documentElement.style.setProperty("--nausea-strength", `${1 - started.strength / 10}`);
        }
      }
    }

    this.update({ debuffs: debuffsAfter, activeDebuffNames: new Set(activeAfter.map((d) => d.name)) });
    return debuffsAfter;
  }

  handleMessage(data: PlayerMessage) {
    switch (data.type) {
      case "editor":
        this.editor.load(data);
        if (clippyDebuffs.some((d) => this.hasDebuff(d))) {
          this.update({ clippyEdited: true, clippyBlocked: 0 });
        }
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
          this.updateDebuffs([]);
          this.update({ debuffs: [], activeDebuffNames: new Set() });
          this.rerender();
          break;
        }
        const now = Date.now();
        const newDebuffs = this.updateDebuffs(data.debuffs);
        this.rerender();
        this.updateScreensaver(false);
        if (newDebuffs.length > 0) {
          setTimeout(() => this.tick(), newDebuffs[0].endTime - now);
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

  handleKey(
    isMyTurn: boolean,
    port: string,
    key: string,
    state: KeyState,
    handledDebuffs: Partial<Record<Debuff, boolean>> = {},
  ): void {
    // Disable input if Clippy debuff is active
    if (clippyDebuffs.some((d) => this.hasDebuff(d)) && !this.usePlayerStore.getState().clippyEdited) {
      this.update({ clippyBlocked: Date.now() });
      return;
    }
    // Delay input if input_lag debuff is active
    let debuff;
    if (!handledDebuffs.input_lag && (debuff = this.findDebuff(Debuff.input_lag))) {
      const delay = (0.5 + 0.5 * Math.random()) * debuff.strength;
      setTimeout(() => this.handleKey(isMyTurn, port, key, state, { ...handledDebuffs, input_lag: true }), delay);
      return;
    }
    // Input debuffs:
    if (this.hasDebuff(Debuff.key_shift)) {
      // Shift keys to the right by one (Q->W, W->E, ..., P->[, [->], ]->Q) where possible.
      key = nextKeyRight[key] ?? key;
    }
    if (this.hasDebuff(Debuff.reverse_navigation)) {
      // Reverse navigation keys (LEFT<->RIGHT, UP<->DOWN, HOME<->END, PGDN<->PGUP)
      key = reverseNavigationKeys[key] ?? key;
    }

    const action = this.editor.act(port, key, state, !isMyTurn, this.hasDebuff(Debuff.caps_lock));

    this.updateScreensaver(true);

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
        if (this.hasDebuff(Debuff.confetti)) fireConfetti();
        if (this.hasDebuff(Debuff.emoji_confetti)) fireEmojiConfetti();
        let debuff;
        if (
          action === "edit" &&
          !handledDebuffs.random_duplicate &&
          (debuff = this.findDebuff(Debuff.random_duplicate)) &&
          Math.random() * 100 < debuff.strength
        ) {
          this.handleKey(isMyTurn, port, key, state, { ...handledDebuffs, random_duplicate: true });
        }
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
  }

  private injectRandomKey() {
    const action = this.editor.act("local", "A", "down", true);
    if (action === "edit" || action === "navigate") {
      this.rerender();
      this.server.send({
        type: "edit",
        code: this.editor.getCode(),
        row: this.editor.row,
        col: this.editor.col,
      });
    }
    let debuff;
    if ((debuff = this.findDebuff(Debuff.keyboard_cat))) {
      const intervalMs = (debuff.duration - 1500) / debuff.strength;
      setTimeout(() => this.injectRandomKey(), intervalMs);
    }
  }

  handleKeyboardEvent(evt: KeyboardEvent): void {
    const [key, state] = mapKeyboardEvent(evt);
    this.handleKey(true, "local", key, state);
  }

  handleKeyboardMessage(msg: KeyboardServerMessage): void {
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
        break;
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
        break;
      case "key": {
        // Ignore events while window is not focused
        if (!document.hasFocus()) break;
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
        this.handleKey(isMyTurn, port, key, state);
        break;
      }
      default:
        console.warn("Unhandled message from keyboard server:", msg);
        break;
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
