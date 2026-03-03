import type { ReactNode } from "react";
import { Debuff } from "../debuffs";
import { finnishLayout, type KeyboardLayout } from "../keyboards";
import type { EditorMessage, KeyState } from "../messages";
import type { PlayerController } from "./PlayerController";

// These keys cannot be "messed up" and are always active
const navigationKeys = new Set(["LEFT", "RIGHT", "UP", "DOWN", "HOME", "END", "PAGEUP", "PAGEDOWN"]);

const tabSize = 2;

export type EditorAction = "edit" | "navigate" | "submit" | "ctrl_up" | "ctrl_down" | false;

export class EditorState {
  layouts: Map<string, KeyboardLayout> = new Map();
  code: string[][];
  row: number = 0;
  col: number = 0;
  ctrl: boolean = false;
  shift: boolean = false;
  altGr: boolean = false;
  meta: boolean = false;

  constructor(code: string = "") {
    this.code = code.split("\n").map((line) => line.split(""));
  }

  load(status: EditorMessage) {
    this.code = status.code.split("\n").map((line) => line.split(""));
    this.row = status.row;
    this.col = status.col;
  }

  getCode() {
    return this.code.map((line) => line.join("")).join("\n");
  }

  render(debuffs: Set<Debuff>): ReactNode {
    let col = this.realCol;
    if (debuffs.has(Debuff.cursor_shift)) {
      // cursor_shift: shift cursor left on even rows, right on odd rows
      col += this.row % 2 === 0 ? -1 : 1;
    }
    return this.code.map((line, i) => {
      const isCursorLine = i === this.row;
      const farFromCursor = Math.abs(i - this.row) > 1;
      return (
        <div key={i} className={`whitespace-pre font-mono mlc--line ${farFromCursor ? "mlc--far" : ""}`}>
          {line.map((char, j) => {
            const isCursorChar = isCursorLine && j === col;
            const farFromCursorChar = !farFromCursor && Math.abs(j - col) > 3;
            return (
              <span key={j} className={isCursorChar ? "mlc--cursor" : farFromCursorChar ? "mlc--far-char" : ""}>
                {char}
              </span>
            );
          })}
          {isCursorLine && col >= line.length && <span className="mlc--cursor"> </span>}
          {!isCursorLine && line.length === 0 && <span>&nbsp;</span>}
        </div>
      );
    });
  }

  get line() {
    return this.code[this.row];
  }

  get lineBeforeCursor() {
    return this.line.slice(0, this.realCol);
  }

  set line(value: string[]) {
    this.code[this.row] = value;
  }

  get realCol() {
    return Math.min(this.col, this.line.length);
  }

  act(keyboard: string, key: string, state: KeyState, messUp: boolean = false): EditorAction {
    const layout = this.layouts.get(keyboard) || finnishLayout;

    // Track modifier keys
    if (key === "LEFTCTRL" || key === "RIGHTCTRL") {
      this.ctrl = state !== "up";
      return false;
    }
    if (key === "LEFTSHIFT" || key === "RIGHTSHIFT") {
      this.shift = state !== "up";
      return false;
    }
    if (key === "RIGHTALT") {
      this.altGr = state !== "up";
      return false;
    }
    if (key === "LEFTMETA" || key === "RIGHTMETA") {
      this.meta = state !== "up";
      return false;
    }

    // Ignore other key releases
    if (state === "up") return false;

    // Ignore everything if Meta is held, usually means user is using OS-level shortcuts
    if (this.meta) return false;

    // Special actions
    if (this.ctrl && key === "ENTER") return "submit";
    if (this.ctrl && key === "UP") return "ctrl_up";
    if (this.ctrl && key === "DOWN") return "ctrl_down";

    // If messing up and not a navigation key, press something random
    if (messUp && !navigationKeys.has(key)) {
      const choices = [
        ...Object.keys(layout.normal),
        ...Object.keys(layout.shifted),
        "BACKSPACE",
        "ENTER",
        "DELETE",
        "SPACE",
      ];
      key = choices[Math.floor(Math.random() * choices.length)];
    }

    switch (key) {
      // Navigation keys
      case "LEFT":
        if (this.realCol > 0) {
          this.col = this.realCol - 1;
        } else if (this.row > 0) {
          this.row--;
          this.col = this.line.length;
        }
        return "navigate";
      case "RIGHT":
        if (this.col < this.line.length) {
          this.col = this.realCol + 1;
        } else if (this.row < this.code.length - 1) {
          this.row++;
          this.col = 0;
        }
        return "navigate";
      case "UP":
        if (this.row > 0) {
          this.row--;
        } else {
          this.col = 0;
        }
        return "navigate";
      case "DOWN":
        if (this.row < this.code.length - 1) {
          this.row++;
        }
        return "navigate";
      case "HOME":
        if (this.ctrl) {
          this.row = 0;
        }
        this.col = 0;
        return "navigate";
      case "END":
        if (this.ctrl) {
          this.row = this.code.length - 1;
        }
        this.col = this.line.length;
        return "navigate";
      case "PAGEUP":
        this.row = 0;
        this.col = 0;
        return "navigate";
      case "PAGEDOWN":
        this.row = this.code.length - 1;
        this.col = this.line.length;
        return "navigate";

      // Editing keys
      case "BACKSPACE":
        if (this.realCol > 0) {
          const isOnlyWhitespace = /^\s+$/.test(this.lineBeforeCursor.join(""));
          // If only whitespace, remove up to previous tab stop
          const charsToDelete = isOnlyWhitespace ? this.realCol % tabSize || tabSize : 1;
          this.line.splice(this.realCol - charsToDelete, charsToDelete);
          this.col = Math.min(this.col - charsToDelete, this.line.length);
        } else if (this.row > 0) {
          const [currLine] = this.code.splice(this.row, 1);
          this.row--;
          this.col = this.line.length;
          this.line = this.line.concat(currLine);
        }
        return "edit";
      case "DELETE":
        if (this.shift) return false; // ignore shift+delete, usually means "cut"

        if (this.realCol < this.line.length) {
          this.line.splice(this.realCol, 1);
        } else if (this.row < this.code.length - 1) {
          const [nextLine] = this.code.splice(this.row + 1, 1);
          this.line = this.line.concat(nextLine);
        }
        return "edit";
      case "TAB": {
        // Insert spaces until next tab stop
        const spaces = " ".repeat(tabSize - (this.realCol % tabSize)).split("");
        this.line.splice(this.realCol, 0, ...spaces);
        this.col = this.realCol + spaces.length;
        return "edit";
      }
      case "ENTER": {
        // Look at content before cursor to determine indentation
        const beforeCursorString = this.lineBeforeCursor.join("");
        let indentSize = beforeCursorString.match(/^\s*/)?.[0].length || 0;

        const trimmedBefore = beforeCursorString.trim();
        if (trimmedBefore.endsWith(":")) {
          indentSize += 2;
        } else if (["return", "raise", "break", "continue", "pass"].some((kw) => trimmedBefore.startsWith(kw))) {
          indentSize = Math.max(0, indentSize - 2);
        }

        // Split the line at cursor and create new line
        const newLineContent = this.line.splice(this.realCol);
        this.row++;

        // Apply indentation to new line
        const indent = " ".repeat(indentSize).split("");
        this.code.splice(this.row, 0, indent.concat(newLineContent));
        this.col = indent.length;
        return "edit";
      }

      // Regular character input
      default: {
        // Ignore Ctrl+key combinations
        if (this.ctrl) return false;

        let char = this.altGr
          ? this.shift
            ? layout.shiftedAltGr[key]
            : layout.altGr[key]
          : this.shift
            ? layout.shifted[key]
            : layout.normal[key];

        // When messing up, ignore AltGrs that don't produce a character
        if (messUp && this.altGr && !char) {
          char = this.shift ? layout.shifted[key] : layout.normal[key];
        }

        if (char) {
          this.line.splice(this.realCol, 0, char);
          this.col++;
          this.col = this.realCol;
          return "edit";
        }
        return false;
      }
    }
  }
}

export const RenderedEditor = ({ controller }: { controller: PlayerController }) => {
  const rendered = controller.usePlayerStore((state) => state.rendered);
  return rendered;
};
