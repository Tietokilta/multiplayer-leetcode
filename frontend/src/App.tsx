import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { type ConnState, stateColors, GameServerHandler } from "./connection";
import { EditorState, type EditorAction } from "./Editor";
import { TurnTracker } from "./TurnTracker";

type PlayerCmd =
  | { type: "login"; id: string }
  | { type: "edit"; code?: string; row: number; col: number }
  | { type: "submit" };

type PlayerMessage =
  | { type: "welcome" }
  | { type: "editor"; code: string; row: number; col: number }
  | { type: "puzzle"; title: string; description: string }
  | { type: "output"; content: string }
  | { type: "state"; state: "running" | "valid" | "invalid"; error?: string }
  | { type: "debuffs"; debuffs: string[] }
  | { type: "error"; message: string };

type KeyboardServerCmd = [keyboardId: string, numLock: 0 | 1, capsLock: 0 | 1, scrollLock: 0 | 1];

type KeyState = "down" | "up" | "hold";
type KeyboardServerMessage =
  | { type: "key"; port: string; state: KeyState; key: string }
  | { type: "keyboards"; keyboards: string[] }
  | { type: "keyboard"; port: string; action: "added" | "removed" };

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
      console.log("Keyboard server message:", data);
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

function KeyboardList({ current, keyboards }: { current: string | undefined; keyboards: string[] }) {
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

function App() {
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-my-id", "");
  const [myIdInput, setMyIdInput] = useState(myId);

  const [serverIp, setServerIp] = useLocalStorage("multiplayer-leetcode-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-server-ip-error", "");
  const [serverIpInput, setServerIpInput] = useState(serverIp);

  const [allowLocalKeyboard, setAllowLocalKeyboard] = useLocalStorage("multiplayer-leetcode-allow-local", false);
  const [showKeyboards, setShowKeyboards] = useLocalStorage("multiplayer-leetcode-show-keyboards", false);
  const [ignoreWrongOrder, setIgnoreWrongOrder] = useLocalStorage("multiplayer-leetcode-ignore-wrong-order", false);

  const [editor] = useState(() => new EditorState(example));
  const [turnTracker] = useState(() => new TurnTracker());
  const [rendered, setRendered] = useState<ReactNode>(editor.render());

  const [currentKeyboard, setCurrentKeyboard] = useState<string | undefined>(undefined);
  const [keyboardList, setKeyboardList] = useState<string[]>([]);

  const [keyboardServer] = useState(() => new KeyboardServerHandler());
  const [gameServer] = useState(() => new GameServerHandler<PlayerCmd, PlayerMessage>());

  const [keyboardConnected, setKeyboardConnected] = useState<ConnState>("not");
  const [gameConnected, setGameConnected] = useState<ConnState>("not");

  const handleEditorAction = useCallback(
    (action: EditorAction, advanceTurn: boolean) => {
      if (action === "edit" || action === "navigate") {
        setRendered(editor.render());
        if (action === "edit") {
          if (advanceTurn) {
            turnTracker.advanceTurn();
            setKeyboardList(turnTracker.seenKeyboards.slice());
            setCurrentKeyboard(turnTracker.currentKeyboard);
          }
          gameServer.send({ type: "edit", code: editor.getCode(), row: editor.row, col: editor.col });
        }
      } else if (action === "submit") {
        gameServer.send({ type: "submit" });
      }
    },
    [editor, gameServer, turnTracker],
  );

  useEffect(() => {
    if (!allowLocalKeyboard) return;

    const handleKeyEvent = (evt: KeyboardEvent) => {
      const action = editor.actLocal(evt);
      handleEditorAction(action, false);
    };
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyEvent);
      window.removeEventListener("keyup", handleKeyEvent);
    };
  }, [allowLocalKeyboard, editor, handleEditorAction]);

  useEffect(() => {
    keyboardServer.handleState = setKeyboardConnected;
    keyboardServer.handleMessage = (msg: KeyboardServerMessage) => {
      switch (msg.type) {
        case "keyboards":
          // Initial keyboard list from server
          for (const kb of msg.keyboards) {
            turnTracker.registerKeyboard(kb);
          }
          setKeyboardList(turnTracker.seenKeyboards.slice());
          setCurrentKeyboard(turnTracker.currentKeyboard);
          break;
        case "keyboard":
          // Keyboard added/removed
          if (msg.action === "added") {
            turnTracker.registerKeyboard(msg.port);
          } else if (msg.action === "removed") {
            turnTracker.removeKeyboard(msg.port);
          }
          setKeyboardList(turnTracker.seenKeyboards.slice());
          setCurrentKeyboard(turnTracker.currentKeyboard);
          break;
        case "key": {
          // Key event
          const { port, state, key } = msg;
          turnTracker.registerKeyboard(port);
          const isMyTurn = ignoreWrongOrder || turnTracker.isMyTurn(port);
          const action = editor.act(port, key, state, !isMyTurn);
          handleEditorAction(action, isMyTurn);
          break;
        }
      }
    };
  }, [keyboardServer, editor, turnTracker, handleEditorAction, ignoreWrongOrder]);

  useEffect(() => {
    keyboardServer.connect();
    return () => {
      keyboardServer.disconnect();
    };
  }, [keyboardServer]);

  useEffect(() => {
    if (!myId || !serverIp || serverIpError) return;

    gameServer.handleState = setGameConnected;
    gameServer.handleError = setServerIpError;
    gameServer.handleMessage = (data) => {
      console.log("Received message from game server:", data);
    };
    gameServer.connect(serverIp, { type: "login", id: myId });

    return () => {
      gameServer.disconnect();
    };
  }, [gameServer, myId, serverIp, serverIpError, setServerIpError]);

  const connState = (
    <div className="absolute top-3 right-3 flex items-center">
      <span className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[gameConnected]}`} />
      <span
        className="mr-2"
        onDoubleClick={() => {
          setMyId("");
          setServerIp("");
          gameServer.disconnect();
        }}
      >
        Game server
      </span>
      <span className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[keyboardConnected]}`} />
      <span className="mr-2">Keyboard server</span>
    </div>
  );

  if (!myId || !serverIp || serverIpError) {
    return (
      <>
        {connState}
        <div className="m-3">Please set the team name and game server IP.</div>
        {serverIpError && (
          <div className="m-3 text-red-500">
            Error connecting to server: "{serverIpError}" Please check the IP and try again.
          </div>
        )}
        <div className="m-3">
          <input
            className="border-1 rounded p-1"
            type="text"
            value={myIdInput}
            onChange={(e) => setMyIdInput(e.target.value)}
            placeholder="TiK"
          />
        </div>
        <div className="m-3">
          <input
            className="border-1 rounded p-1"
            type="text"
            value={serverIpInput}
            onChange={(e) => setServerIpInput(e.target.value)}
            placeholder="1.2.3.4"
          />
        </div>
        <div className="m-3">
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
        <div className="m-3">
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
        <div className="m-3">
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
        <div className="m-3">
          <button
            className="border-1 rounded p-1 disabled:opacity-50"
            disabled={!myIdInput || !serverIpInput}
            onClick={() => {
              setMyId(myIdInput);
              setServerIp(serverIpInput);
              setServerIpError("");
            }}
          >
            Connect
          </button>
        </div>
        {showKeyboards && <KeyboardList current={currentKeyboard} keyboards={keyboardList} />}
        <div className="mt-5">{rendered}</div>
      </>
    );
  }

  return (
    <>
      {connState}
      {showKeyboards && <KeyboardList current={currentKeyboard} keyboards={keyboardList} />}
      <div className="mt-5">{rendered}</div>
    </>
  );
}

export default App;
