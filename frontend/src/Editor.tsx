import type { ReactNode } from "react";
import { finnishLayout, type KeyboardLayout } from "./keyboards";
import type { EditorMessage } from "./messages";

// Most keys map from KeyboardEvent.code to evdev key names just by uppercasing and
// prepending "KEY_", but some need special handling:
const keyMapping: Record<string, string> = {
  ArrowLeft: "KEY_LEFT",
  ArrowRight: "KEY_RIGHT",
  ArrowUp: "KEY_UP",
  ArrowDown: "KEY_DOWN",
  ControlLeft: "KEY_LEFTCTRL",
  ControlRight: "KEY_RIGHTCTRL",
  ShiftLeft: "KEY_LEFTSHIFT",
  ShiftRight: "KEY_RIGHTSHIFT",
  AltRight: "KEY_RIGHTALT",
  BracketLeft: "KEY_LEFTBRACE",
  BracketRight: "KEY_RIGHTBRACE",
  Period: "KEY_DOT",
  Quote: "KEY_APOSTROPHE",
  IntlBackslash: "KEY_102ND",
};

// These keys cannot be "messed up" and are always active
const navigationKeys = new Set([
  "KEY_LEFT",
  "KEY_RIGHT",
  "KEY_UP",
  "KEY_DOWN",
  "KEY_HOME",
  "KEY_END",
  "KEY_PAGEUP",
  "KEY_PAGEDOWN",
]);

export type EditorAction = "edit" | "navigate" | "submit" | false;

export class EditorState {
  layouts: Map<string, KeyboardLayout> = new Map();
  code: string[][];
  row: number = 0;
  col: number = 0;
  ctrl: boolean = false;
  shift: boolean = false;
  altGr: boolean = false;

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

  render(): ReactNode {
    return this.code.map((line, i) => {
      const isCursorLine = i === this.row;
      return (
        <div key={i} className="whitespace-pre font-mono">
          {line.map((char, j) => {
            const isCursorChar = isCursorLine && j === this.col;
            return isCursorChar ? (
              <span key={j} className="bg-white text-black">
                {char}
              </span>
            ) : (
              <span key={j}>{char}</span>
            );
          })}
          {isCursorLine && this.col >= line.length && <span className="bg-white text-black"> </span>}
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

  actLocal(evt: KeyboardEvent, messUp: boolean = false): EditorAction {
    // Map KeyboardEvent.code to evdev key names
    const key = keyMapping[evt.code] || `KEY_${evt.code.replace(/^Key|^Digit/, "").toUpperCase()}`;
    // Map event type to state
    const state = evt.type === "keyup" ? "up" : evt.repeat ? "hold" : "down";
    return this.act("local", key, state, messUp);
  }

  act(keyboard: string, key: string, state: "down" | "up" | "hold", messUp: boolean = false): EditorAction {
    const layout = this.layouts.get(keyboard) || finnishLayout;

    // Track modifier keys
    if (key === "KEY_LEFTCTRL" || key === "KEY_RIGHTCTRL") {
      this.ctrl = state !== "up";
      return false;
    }
    if (key === "KEY_LEFTSHIFT" || key === "KEY_RIGHTSHIFT") {
      this.shift = state !== "up";
      return false;
    }
    if (key === "KEY_RIGHTALT") {
      this.altGr = state !== "up";
      return false;
    }

    // Ignore other key releases
    if (state === "up") return false;

    // Special actions
    if (this.ctrl && key === "KEY_ENTER") return "submit";

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
      key = "KEY_" + choices[Math.floor(Math.random() * choices.length)];
    }

    switch (key) {
      // Navigation keys
      case "KEY_LEFT":
        if (this.col > 0) {
          this.col = this.realCol - 1;
        } else if (this.row > 0) {
          this.row--;
          this.col = this.line.length;
        }
        return "navigate";
      case "KEY_RIGHT":
        if (this.col < this.line.length) {
          this.col = this.realCol + 1;
        } else if (this.row < this.code.length - 1) {
          this.row++;
          this.col = 0;
        }
        return "navigate";
      case "KEY_UP":
        if (this.row > 0) {
          this.row--;
        } else {
          this.col = 0;
        }
        return "navigate";
      case "KEY_DOWN":
        if (this.row < this.code.length - 1) {
          this.row++;
        }
        return "navigate";
      case "KEY_HOME":
        if (this.ctrl) {
          this.row = 0;
        }
        this.col = 0;
        return "navigate";
      case "KEY_END":
        if (this.ctrl) {
          this.row = this.code.length - 1;
        }
        this.col = this.line.length;
        return "navigate";
      case "KEY_PAGEUP":
        this.row = 0;
        this.col = 0;
        return "navigate";
      case "KEY_PAGEDOWN":
        this.row = this.code.length - 1;
        this.col = this.line.length;
        return "navigate";

      // Editing keys
      case "KEY_BACKSPACE":
        if (this.realCol > 0) {
          const isOnlyWhitespace = /^\s+$/.test(this.lineBeforeCursor.join(""));
          // If only whitespace, remove a tab
          const charsToDelete = isOnlyWhitespace ? Math.min(2, this.realCol) : 1;
          this.line.splice(this.realCol - charsToDelete, charsToDelete);
          this.col -= charsToDelete;
        } else if (this.row > 0) {
          const [currLine] = this.code.splice(this.row, 1);
          this.row--;
          this.col = this.line.length;
          this.line = this.line.concat(currLine);
        }
        return "edit";
      case "KEY_DELETE":
        if (this.shift) return false; // ignore shift+delete, usually means "cut"

        if (this.realCol < this.line.length) {
          this.line.splice(this.realCol, 1);
        } else if (this.row < this.code.length - 1) {
          const [nextLine] = this.code.splice(this.row + 1, 1);
          this.line = this.line.concat(nextLine);
        }
        return "edit";
      case "KEY_TAB": {
        const spaces = "  ".split("");
        this.line.splice(this.realCol, 0, ...spaces);
        this.col = this.realCol + spaces.length;
        return "edit";
      }
      case "KEY_ENTER": {
        // Look at content before cursor to determine indentation
        const beforeCursorString = this.lineBeforeCursor.join("");
        let indentSize = beforeCursorString.match(/^\s*/)?.[0].length || 0;

        const trimmedBefore = beforeCursorString.trim();
        if (trimmedBefore.endsWith(":")) {
          indentSize += 2;
        }
        else if (["return", "raise", "break", "continue", "pass"].some(kw => trimmedBefore.startsWith(kw))) {
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

        const name = key.slice(4); // remove "KEY_"
        let char = this.altGr
          ? this.shift
            ? layout.shiftedAltGr[name]
            : layout.altGr[name]
          : this.shift
            ? layout.shifted[name]
            : layout.normal[name];

        // When messing up, ignore AltGrs that don't produce a character
        if (messUp && this.altGr && !char) {
          char = this.shift ? layout.shifted[name] : layout.normal[name];
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
