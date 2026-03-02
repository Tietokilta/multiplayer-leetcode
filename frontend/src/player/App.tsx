import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { type ConnState, GameServerHandler, stateColors } from "../connection";
import type { KeyboardServerCmd, KeyboardServerMessage, PlayerCmd, PlayerMessage } from "../messages";
import { type EditorAction, EditorState, RenderedEditor } from "./Editor";
import Game from "./Game";
import { usePlayerStore } from "./store";
import { TurnTracker } from "./TurnTracker";
import LocalKeyboard from "./LocalKeyboard";
import Login from "./Login";

class KeyboardServerHandler {
  active: boolean = false;
  socket: WebSocket | null = null;
  timeout?: number;
  ledState: KeyboardServerCmd | null = null;
  handleMessage: ((data: KeyboardServerMessage) => void) | null = null;
  handleState: ((state: ConnState) => void) | null = null;

  send(cmd: KeyboardServerCmd) {
    this.ledState = cmd;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(cmd));
    }
  }

  connect() {
    this.active = true;
    this.socket = new WebSocket("ws://localhost:6969/");
    console.log("Connecting to keyboard server");
    this.socket.addEventListener("open", () => {
      console.log("Keyboard server connection opened");
      this.handleState?.("connected");
      if (this.ledState) {
        this.socket!.send(JSON.stringify(this.ledState));
      }
    });
    this.socket.addEventListener("message", (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      // console.log("Keyboard server message:", data);
      this.handleMessage?.(data);
    });
    this.socket.addEventListener("close", (event: CloseEvent) => {
      console.log("Keyboard server connection closed:", event.code);
      this.handleState?.("not");
      // Reconnect if mounted
      if (event.target === this.socket) {
        this.socket = null;
        if (this.active) this.timeout = window.setTimeout(() => this.connect(), 1000);
      }
    });
  }

  disconnect() {
    this.active = false;
    this.socket?.close();
    this.socket = null;
    clearTimeout(this.timeout);
  }
}

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

function KeyboardList() {
  const current = usePlayerStore((state) => state.currentKeyboard);
  const keyboards = usePlayerStore((state) => state.keyboardList);
  return (
    <div className="m-3 font-mono text-sm">
      <div className="mb-2">Keyboards ({keyboards.length}):</div>
      {keyboards.map((kb, i) => (
        <div key={kb} className={`${kb === current ? "text-green-400 font-bold" : "text-gray-500"}`}>
          {i + 1}. {kb} {kb === current && "← TURN"}
        </div>
      ))}
    </div>
  );
}

/* eslint-disable react-hooks/immutability -- I'm lazy af */

function useKeyboardServer(
  editor: EditorState,
  turnTracker: TurnTracker,
  handleEditorAction: (action: EditorAction) => void,
) {
  const [keyboardServer] = useState(() => new KeyboardServerHandler());
  const [keyboardConnected, setKeyboardConnected] = useState<ConnState>("not");

  const handleKeyboardMessage = usePlayerStore((state) => state.handleKeyboardMessage);

  useEffect(() => {
    keyboardServer.handleState = setKeyboardConnected;
    keyboardServer.handleMessage = (msg: KeyboardServerMessage) => {
      const action = handleKeyboardMessage(editor, turnTracker, msg);
      handleEditorAction(action);
    };
  }, [keyboardServer, editor, turnTracker, handleEditorAction, handleKeyboardMessage]);

  useEffect(() => {
    keyboardServer.connect();
    return () => {
      keyboardServer.disconnect();
    };
  }, [keyboardServer]);

  return keyboardConnected;
}

function useGameServer(editor: EditorState) {
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-my-id", "");
  const [serverIp, setServerIp] = useLocalStorage("multiplayer-leetcode-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-server-ip-error", "");

  const [gameServer] = useState(() => new GameServerHandler<PlayerCmd, PlayerMessage>());
  const [gameConnected, setGameConnected] = useState<ConnState>("not");
  const [hasGameOpened, setHasGameOpened] = useState(false);

  const handleMessage = usePlayerStore((state) => state.handleMessage);

  useEffect(() => {
    gameServer.handleState = setGameConnected;
    gameServer.handleLogin = (success: boolean) => {
      if (success) setHasGameOpened(true);
    };
    gameServer.handleLoginError = setServerIpError;
    gameServer.handleMessage = (data: PlayerMessage) => handleMessage(editor, data);
  }, [gameServer, editor, handleMessage, setServerIpError]);

  const canConnect = !!myId && !!serverIp && !serverIpError;

  useEffect(() => {
    if (!canConnect) return;

    gameServer.connect(serverIp, { type: "login", id: myId });
    return () => {
      gameServer.disconnect();
    };
  }, [canConnect, gameServer, myId, serverIp, serverIpError, setServerIpError]);

  return {
    canConnect,
    gameConnected,
    hasGameOpened,
    gameServer,
    connectGameServer: (myId: string, serverIp: string) => {
      setMyId(myId);
      setServerIp(serverIp);
      setServerIpError("");
    },
    disconnectGameServer: () => {
      setMyId("");
      setServerIp("");
      gameServer.disconnect();
    },
  };
}

function App() {
  const [allowLocalKeyboard, setAllowLocalKeyboard] = useLocalStorage("multiplayer-leetcode-allow-local", false);
  const [showKeyboards, setShowKeyboards] = useLocalStorage("multiplayer-leetcode-show-keyboards", false);
  const [ignoreWrongOrder, setIgnoreWrongOrder] = useLocalStorage("multiplayer-leetcode-ignore-wrong-order", false);

  const [turnTracker] = useState(() => new TurnTracker());
  const [editor] = useState(() => new EditorState(example));

  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    turnTracker.ignoreWrongOrder = ignoreWrongOrder;
  }, [ignoreWrongOrder, turnTracker]);

  const { canConnect, gameConnected, hasGameOpened, gameServer, connectGameServer, disconnectGameServer } =
    useGameServer(editor);

  /** Passes synchronous editor actions to the game server or DOM. */
  const handleEditorAction = useCallback(
    (action: EditorAction) => {
      switch (action) {
        case "edit":
        case "navigate":
          gameServer.send({ type: "edit", code: editor.getCode(), row: editor.row, col: editor.col });
          break;
        case "submit":
          gameServer.send({ type: "submit" });
          break;
        case "ctrl_up":
        case "ctrl_down":
          if (outputRef.current) {
            const scrollAmount = outputRef.current.clientHeight / 3;
            outputRef.current.scrollBy({
              top: action === "ctrl_up" ? -scrollAmount : scrollAmount,
              behavior: "smooth",
            });
          }
          break;
      }
    },
    [editor, gameServer],
  );

  const keyboardConnected = useKeyboardServer(editor, turnTracker, handleEditorAction);

  const connState = (
    <div className="absolute top-6 right-6 flex items-center">
      <span
        className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[gameConnected]} cursor-pointer`}
        onDoubleClick={disconnectGameServer}
      />
      <span className="mr-2">Game server</span>
      <span className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[keyboardConnected]}`} />
      <span className="mr-2">Keyboard server</span>
    </div>
  );

  const localKeyboard = allowLocalKeyboard && (
    <LocalKeyboard editor={editor} turnTracker={turnTracker} handleEditorAction={handleEditorAction} />
  );

  if (!canConnect) {
    return (
      <>
        {connState}
        {localKeyboard}
        <Login onConnect={connectGameServer}>
          <div>
            <label>
              <input
                type="checkbox"
                checked={allowLocalKeyboard}
                onChange={(e) => setAllowLocalKeyboard(e.target.checked)}
                className="mr-2"
              />
              Enable local keyboard input (for running without evdev-ws)
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={showKeyboards}
                onChange={(e) => setShowKeyboards(e.target.checked)}
                className="mr-2"
              />
              Show detected keyboards
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={ignoreWrongOrder}
                onChange={(e) => setIgnoreWrongOrder(e.target.checked)}
                className="mr-2"
              />
              Ignore turn order
            </label>
          </div>
        </Login>
        {showKeyboards && <KeyboardList />}
        <div className="m-4 border rounded p-4">
          <h2 className="mb-2 font-bold text-lg">You can test the editor here:</h2>
          <RenderedEditor />
        </div>
      </>
    );
  }

  if (!hasGameOpened) {
    return (
      <>
        {connState}
        {localKeyboard}
        <div className="m-4 border rounded p-4">Connecting to game server&hellip;</div>
      </>
    );
  }

  return (
    <div className="flex flex-col p-4 gap-4 h-screen">
      {connState}
      {localKeyboard}
      {showKeyboards && <KeyboardList />}
      <Game outputRef={outputRef} />
    </div>
  );
}

export default App;
