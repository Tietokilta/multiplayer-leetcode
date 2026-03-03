import { useEffect } from "react";
import type { PlayerController } from "./PlayerController";

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
