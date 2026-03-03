import { useEffect } from "react";
import type { PlayerController } from "./PlayerController";
import type { KeyState } from "../messages";

type Props = {
  controller: PlayerController;
};

const LocalKeyboard = ({ controller }: Props) => {
  useEffect(() => {
    const handleKeyEvent = (evt: KeyboardEvent) => {
      // Prevent default browser behavior for Tab key
      if (evt.code === "Tab") {
        evt.preventDefault();
      }
      controller.handleKeyboardEvent(evt);
    };
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyEvent);
      window.removeEventListener("keyup", handleKeyEvent);
    };
  }, [controller]);
  return null;
};

export default LocalKeyboard;

// Most keys map from KeyboardEvent.code to evdev key names just by uppercasing, but some need special handling:
const keyMapping: Record<string, string> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ControlLeft: "LEFTCTRL",
  ControlRight: "RIGHTCTRL",
  ShiftLeft: "LEFTSHIFT",
  ShiftRight: "RIGHTSHIFT",
  AltRight: "RIGHTALT",
  BracketLeft: "LEFTBRACE",
  BracketRight: "RIGHTBRACE",
  Period: "DOT",
  Quote: "APOSTROPHE",
  IntlBackslash: "102ND",
};

// eslint-disable-next-line react-refresh/only-export-components
export function mapKeyboardEvent(evt: KeyboardEvent): [key: string, state: KeyState] {
  // Map KeyboardEvent.code to evdev key names
  const key = keyMapping[evt.code] || evt.code.replace(/^Key|^Digit/, "").toUpperCase();
  // Map event type to state
  const state = evt.type === "keyup" ? "up" : evt.repeat ? "hold" : "down";
  return [key, state];
}
