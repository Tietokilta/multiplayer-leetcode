import { useEffect } from "react";
import type { EditorAction, EditorState } from "./Editor";
import type { TurnTracker } from "./TurnTracker";
import { usePlayerStore } from "./store";

type Props = {
  editor: EditorState;
  turnTracker: TurnTracker;
  handleEditorAction: (action: EditorAction) => void;
};

const LocalKeyboard = ({ editor, turnTracker, handleEditorAction }: Props) => {
  const handleKeyboardEvent = usePlayerStore((state) => state.handleKeyboardEvent);

  useEffect(() => {
    const handleKeyEvent = (evt: KeyboardEvent) => {
      // Prevent default browser behavior for Tab key
      if (evt.code === "Tab") {
        evt.preventDefault();
      }
      const action = handleKeyboardEvent(editor, turnTracker, evt);
      handleEditorAction(action);
    };
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyEvent);
      window.removeEventListener("keyup", handleKeyEvent);
    };
  }, [editor, turnTracker, handleEditorAction, handleKeyboardEvent]);
  return null;
};

export default LocalKeyboard;
