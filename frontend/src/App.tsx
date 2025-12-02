import { type ReactNode, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { EditorState } from "./Editor";

type GameServerCmd =
  | { type: "login"; id: string }
  | { type: "edit"; code?: string; row: number; col: number }
  | { type: "submit" };

type GameServerMessage =
  | { type: "welcome" }
  | { type: "new_task"; description: "string"; template: string }
  | { type: "output"; content: string }
  | { type: "debuffs"; debuffs: string[] };

type KeyboardServerCmd = [keyboardId: string, numLock: 0 | 1, capsLock: 0 | 1, scrollLock: 0 | 1];

type KeyState = "down" | "up" | "hold";
type KeyboardServerMessage = [keyboardId: string, state: KeyState, key: string];

type ConnState = "connected" | "not" | "connecting";

const stateColors = {
  connected: "bg-green-500",
  not: "bg-red-500",
  connecting: "bg-yellow-500",
};

class GameServerHandler {
  active: boolean = false;
  hasOpened: boolean = false;
  socket: WebSocket | null = null;
  timeout?: number;
  queuedEdit: GameServerCmd | null = null;
  queuedSubmit: boolean = false;
  handleState: ((state: ConnState, error: boolean) => void) | null = null;
  handleMessage: ((data: GameServerMessage) => void) | null = null;

  send(cmd: GameServerCmd) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(cmd));
    } else if (cmd.type === "edit") {
      this.queuedEdit = cmd;
    } else if (cmd.type === "submit") {
      this.queuedSubmit = true;
    }
  }

  connect(ip: string) {
    console.log("Connecting to game server at", ip);
    this.handleState?.("connecting", false);
    this.active = true;
    this.socket = new WebSocket(`ws://${ip}:6979/`);
    this.socket.addEventListener("open", () => {
      console.log("Game server connection opened");
      this.hasOpened = true;
      this.handleState?.("connected", false);
      if (this.queuedEdit) {
        this.socket!.send(JSON.stringify(this.queuedEdit));
        this.queuedEdit = null;
      }
      if (this.queuedSubmit) {
        this.socket!.send(JSON.stringify({ type: "submit" }));
        this.queuedSubmit = false;
      }
    });
    this.socket.addEventListener("message", (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      this.handleMessage?.(data);
    });
    this.socket.addEventListener("close", (event: CloseEvent) => {
      console.log("Game server connection closed:", event.code);
      this.handleState?.("not", !event.wasClean && !this.hasOpened);
      // Reconnect if mounted
      if (event.target === this.socket) {
        this.socket = null;
        if (this.active) this.timeout = window.setTimeout(() => this.connect(this.socket!.url), 1000);
      }
    });
  }

  disconnect() {
    this.active = false;
    this.hasOpened = false;
    this.queuedEdit = null;
    this.queuedSubmit = false;
    this.socket?.close();
    this.socket = null;
    clearTimeout(this.timeout);
  }
}

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

/* eslint-disable react-hooks/immutability -- I'm lazy af */

function App() {
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-my-id", "");
  const [myIdInput, setMyIdInput] = useState(myId);

  const [serverIp, setServerIp] = useLocalStorage("multiplayer-leetcode-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-server-ip-error", false);
  const [serverIpInput, setServerIpInput] = useState(serverIp);

  const [editor] = useState(() => new EditorState(example));
  const [rendered, setRendered] = useState<ReactNode>(editor.render());

  const [keyboardServer] = useState(() => new KeyboardServerHandler());
  const [gameServer] = useState(() => new GameServerHandler());

  const [keyboardConnected, setKeyboardConnected] = useState<ConnState>("not");
  const [gameConnected, setGameConnected] = useState<ConnState>("not");

  useEffect(() => {
    keyboardServer.handleState = setKeyboardConnected;
    keyboardServer.handleMessage = ([keyboard, state, key]: KeyboardServerMessage) => {
      const action = editor.act(keyboard, key, state);
      if (action === true) {
        setRendered(editor.render());
        gameServer.send({ type: "edit", code: editor.getCode(), row: editor.row, col: editor.col });
      } else if (action === "submit") {
        gameServer.send({ type: "submit" });
      }
    };
    keyboardServer.connect();

    return () => {
      keyboardServer.disconnect();
    };
  }, [keyboardServer, editor, gameServer]);

  useEffect(() => {
    if (!myId || !serverIp || serverIpError) return;

    gameServer.handleState = (state, error) => {
      setGameConnected(state);
      if (error) setServerIpError(true);
      if (state === "connected") {
        gameServer.send({ type: "login", id: myId });
      }
    };
    gameServer.handleMessage = (data: unknown) => {
      console.log("Received message from game server:", data);
    };
    gameServer.connect(serverIp);

    return () => {
      gameServer.disconnect();
    };
  }, [gameServer, myId, serverIp, setServerIp, serverIpError, setServerIpError]);

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
          <div className="m-3 text-red-500">Error connecting to server. Please check the IP and try again.</div>
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
          <button
            className="border-1 rounded p-1 disabled:opacity-50"
            disabled={!myIdInput || !serverIpInput}
            onClick={() => {
              setMyId(myIdInput);
              setServerIp(serverIpInput);
              setServerIpError(false);
            }}
          >
            Connect
          </button>
        </div>
        <div className="mt-5">{rendered}</div>
      </>
    );
  }

  return <>{connState}</>;
}

export default App;
