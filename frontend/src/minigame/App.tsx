import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import type { ConnState } from "../connection";
import { GameServerHandler, stateColors } from "../connection";
import Login from "../player/Login";

type MinigameCmd =
  | { type: "login"; id: string }
  | { type: "submit"; solution: (string | number)[][] }
  | { type: "assign"; target: string; award_idx: number };

type MinigameMsg =
  | { type: "welcome"; name: string }
  | { type: "puzzle"; tokens: string[]; solution_lines: (string | number)[][]; players: string[] }
  | { type: "correct" }
  | { type: "incorrect" }
  | { type: "award"; debuff: unknown; award_idx: number }
  | { type: "award_granted"; award_idx: number; awards_remaining: number }
  | { type: "debuff_assigned"; debuff_name: string; target: string }
  | { type: "assigned"; target: string }
  | { type: "limit_reached"; target: string }
  | { type: "error"; message: string };

const MINIGAME_PORT = 6978;

function useServerConfig_DEV() {
  const [myId, setMyId] = useLocalStorage("minigame-player-id", "");
  const [serverIp, setServerIp] = useLocalStorage("minigame-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("minigame-server-ip-error", "");

  return {
    myId,
    setMyId,
    serverIp,
    setServerIp,
    serverIpError,
    setServerIpError,
    canConnect: !!myId && !!serverIp && !serverIpError,
  };
}

function useServerConfig_PROD() {
  const [serverIpError, setServerIpError] = useLocalStorage("minigame-prod-server-ip-error", "");
  const myId = window.location.hash.slice(1);

  return {
    myId,
    setMyId: () => {},
    serverIp: window.location.hostname,
    setServerIp: () => {},
    serverIpError,
    setServerIpError,
    canConnect: !!myId,
  };
}

const useServerConfig = import.meta.env.PROD ? useServerConfig_PROD : useServerConfig_DEV;

export default function MinigameApp() {
  const { myId, setMyId, serverIp, setServerIp, serverIpError, setServerIpError, canConnect } = useServerConfig();

  const serverRef = useRef(new GameServerHandler<MinigameCmd, MinigameMsg>());
  const [connState, setConnState] = useState<ConnState>("not");
  const [playerName, setPlayerName] = useState<string | null>(null);

  useEffect(() => {
    const server = serverRef.current;
    server.handleState = setConnState;
    server.handleLogin = (welcome) => welcome && setPlayerName(welcome.name);
    server.handleLoginError = setServerIpError;
    server.handleMessage = (msg) => {
      console.log("minigame message:", msg);
    };
  }, [setServerIpError]);

  useEffect(() => {
    if (!canConnect) return;
    const server = serverRef.current;
    setServerIpError("");
    server.connect(serverIp, { type: "login", id: myId }, MINIGAME_PORT);
    return () => {
      server.disconnect();
      setPlayerName(null);
    };
  }, [canConnect, serverIp, myId, setServerIpError]);

  const connIndicator = (
    <div className={`self-end z-101 flex items-center gap-2 text-xs bg-gray-900`}>
      {!import.meta.env.PROD && canConnect && (
        <button
          className="border rounded px-3 text-sm text-gray-400"
          onClick={() => {
            serverRef.current.disconnect();
            setServerIp("");
            setMyId("");
          }}
        >
          Disconnect
        </button>
      )}
      {connState === "connected"
        ? (playerName ?? "Connected")
        : connState === "connecting"
          ? "Connecting\u2026"
          : "Disconnected"}
      <span className={`w-3 h-3 rounded-full inline-block ${stateColors[connState]}`} />
    </div>
  );

  if (!canConnect && !import.meta.env.PROD) {
    return (
      <Login
        storageKey="minigame"
        onConnect={(id, ip) => {
          setMyId(id);
          setServerIp(ip);
          setServerIpError("");
        }}
        error={serverIpError || null}
      >
        {connIndicator}
      </Login>
    );
  }

  return (
    <div className="flex flex-col h-screen p-2 gap-4">
      {connIndicator}
      <div>TODO</div>
    </div>
  );
}
