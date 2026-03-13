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
  | { type: "welcome"; player_id: string }
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
  const [welcome, setWelcome] = useState<Extract<MinigameMsg, { type: "welcome" }> | null>(null);

  useEffect(() => {
    const server = serverRef.current;
    server.handleState = setConnState;
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
      setWelcome(null);
    };
  }, [canConnect, serverIp, myId, setServerIpError]);

  const connIndicator = (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-3 h-3 rounded-full inline-block ${stateColors[connState]}`} />
      <span>
        {connState === "connected" ? "Connected" : connState === "connecting" ? "Connecting\u2026" : "Disconnected"}
      </span>
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
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold">Audience Minigames</h1>
      {connIndicator}
      {serverIpError && <div className="text-red-500 text-sm">{serverIpError}</div>}
      {welcome && (
        <div className="text-sm text-gray-300">
          Welcome, <span className="font-semibold text-white">{welcome.player_id}</span>!
        </div>
      )}
      {!import.meta.env.PROD && (
        <button
          className="border rounded px-3 py-1 text-sm text-gray-400"
          onClick={() => {
            serverRef.current.disconnect();
            setServerIp("");
            setMyId("");
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
