import type { Debuff } from "./debuffs";

export type PlayerCmd =
  | { type: "login"; id: string }
  | { type: "edit"; code?: string; row: number; col: number }
  | { type: "submit" }
  | {
      type: "administer_debuff";
      players: string[];
      name: string;
      debuff_type: string;
      strength: number;
      duration: number;
    }
  | { type: "debuff_state"; name: string; payload: unknown };

export type DebuffItem = {
  name: Debuff;
  type: string;
  strength: number;
  duration: number; // remaining seconds from now
};

export type EditorMessage = { type: "editor"; code: string; row: number; col: number };
export type PuzzleMessage = { type: "puzzle"; title: string; description: string };
export type StateMessage = { type: "state"; state: "running" | "valid" | "invalid"; error?: string };

export type PlayerMessage =
  | { type: "welcome" }
  | EditorMessage
  | PuzzleMessage
  | { type: "output"; first: boolean; content: string }
  | StateMessage
  | { type: "debuffs"; debuffs: DebuffItem[] }
  | { type: "error"; message: string };

export type KeyboardServerCmd = [keyboardId: string, numLock: 0 | 1, capsLock: 0 | 1, scrollLock: 0 | 1];

export type KeyState = "down" | "up" | "hold";
export type KeyboardServerMessage =
  | { type: "key"; port: string; state: KeyState; key: string }
  | { type: "keyboards"; keyboards: string[] }
  | { type: "keyboard"; port: string; action: "added" | "removed" };
