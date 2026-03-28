import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import type { ConnState } from "../connection";
import { GameServerHandler, stateColors } from "../connection";
import Login from "../player/Login";
import { Debuff, debuffInfo } from "../debuffs";
import { MinigameCode } from "./MinigameCode";

interface DebuffItem {
  name: Debuff;
  type: string;
  strength: number;
  duration: number;
}

export type Solution = (string | number)[][];

type MinigameCmd =
  | { type: "login"; token: string }
  | { type: "submit"; solution: Solution }
  | { type: "assign"; target: string; award_idx: number };

export type MinigamePuzzleMsg = {
  type: "puzzle";
  template: string;
  tokens: string[];
  solution_lines: Solution;
  players: string[];
  num_awards: number;
};

type MinigameMsg =
  | { type: "welcome"; name: string }
  | MinigamePuzzleMsg
  | { type: "correct" }
  | { type: "incorrect" }
  | { type: "award"; debuff: DebuffItem; award_idx: number }
  | { type: "award_granted"; award_idx: number; awards_remaining: number }
  | { type: "debuff_assigned"; debuff_name: string; target: string }
  | { type: "assigned"; target: string }
  | { type: "limit_reached"; target: string }
  | { type: "error"; message: string };

const MINIGAME_PORT = 6978;

function useServerConfig_DEV() {
  const [myToken, setMyToken] = useLocalStorage("minigame-my-id", "");
  const [serverIp, setServerIp] = useLocalStorage("minigame-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("minigame-server-ip-error", "");

  return {
    myToken,
    setMyToken,
    serverIp,
    setServerIp,
    serverIpError,
    setServerIpError,
    canConnect: !!myToken && !!serverIp && !serverIpError,
  };
}

function useServerConfig_PROD() {
  const [serverIpError, setServerIpError] = useLocalStorage("minigame-prod-server-ip-error", "");
  const myToken = window.location.hash.slice(1);

  return {
    myToken,
    setMyToken: () => {},
    serverIp: window.location.hostname,
    setServerIp: () => {},
    serverIpError,
    setServerIpError,
    canConnect: !!myToken,
  };
}

const useServerConfig = import.meta.env.PROD ? useServerConfig_PROD : useServerConfig_DEV;

export default function MinigameApp() {
  const { myToken, setMyToken, serverIp, setServerIp, serverIpError, setServerIpError, canConnect } = useServerConfig();

  const serverRef = useRef(new GameServerHandler<MinigameCmd, MinigameMsg>());
  const [connState, setConnState] = useState<ConnState>("not");
  const [playerName, setPlayerName] = useState<string | null>(null);

  const [puzzle, setPuzzle] = useState<(MinigameMsg & { type: "puzzle" }) | null>(null);
  const [award, setAward] = useState<(MinigameMsg & { type: "award" }) | null>(null);
  const [incorrect, setIncorrect] = useState(false);
  const [assignedTarget, setAssignedTarget] = useState<string | null>(null);
  const [awardsRemaining, setAwardsRemaining] = useState(0);
  const [limitTarget, setLimitTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const server = serverRef.current;
    server.handleState = setConnState;
    server.handleLogin = (welcome) => welcome && setPlayerName(welcome.name);
    server.handleLoginError = setServerIpError;
    server.handleMessage = (msg) => {
      console.log("minigame message:", msg);
      switch (msg.type) {
        case "puzzle":
          setPuzzle(msg);
          setAward(null);
          setAssignedTarget(null);
          setAwardsRemaining(msg.num_awards);
          setLimitTarget(null);
          setIncorrect(false);
          setError(null);
          break;
        case "incorrect":
          setIncorrect(true);
          break;
        case "award":
          setAward(msg);
          setAssignedTarget(null);
          setLimitTarget(null);
          setError(null);
          break;
        case "assigned":
          setAssignedTarget(msg.target);
          setError(null);
          break;
        case "award_granted":
          setAwardsRemaining(msg.awards_remaining);
          break;
        case "limit_reached":
          setLimitTarget(msg.target);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
  }, [setServerIpError]);

  useEffect(() => {
    if (!canConnect) return;
    const server = serverRef.current;
    setServerIpError("");
    server.connect(serverIp, { type: "login", token: myToken }, MINIGAME_PORT);
    return () => {
      server.disconnect();
      setPlayerName(null);
    };
  }, [canConnect, serverIp, myToken, setServerIpError]);

  const connIndicator = (
    <div className={`self-end z-101 flex items-center gap-2 text-xs bg-gray-900`}>
      {!import.meta.env.PROD && canConnect && (
        <button
          className="border rounded px-3 text-sm text-gray-400"
          onClick={() => {
            serverRef.current.disconnect();
            setServerIp("");
            setMyToken("");
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
      <div className="flex flex-col h-screen p-2 gap-4">
        {connIndicator}
        <Login
          storageKey="minigame"
          onConnect={(token, ip) => {
            setMyToken(token);
            setServerIp(ip);
            setServerIpError("");
          }}
          error={serverIpError || null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen p-2 gap-4">
      {connIndicator}
      {error && <div className="text-red-400 text-center text-sm">{error}</div>}
      {!puzzle ? (
        <div className="text-gray-400 text-center">Waiting for puzzle...</div>
      ) : assignedTarget ? (
        <div className="text-green-400 text-center">Debuff sent to {assignedTarget}! Wait for the next puzzle.</div>
      ) : award ? (
        <>
          <div className="text-yellow-400 text-center">You earned a debuff!</div>
          <DebuffInfo debuff={award.debuff} />
          <div className="text-yellow-400 text-center">Choose a player to assign it to:</div>
          {limitTarget && <div className="text-red-400 text-sm">{limitTarget} has too many debuffs already!</div>}
          <PlayerPicker
            players={puzzle.players}
            onPick={(player) => {
              setLimitTarget(null);
              serverRef.current.send({ type: "assign", target: player, award_idx: award.award_idx });
            }}
          />
        </>
      ) : awardsRemaining > 0 ? (
        <>
          <div className="text-gray-200 text-center animate-pulse">
            Solve the puzzle! {awardsRemaining} award{awardsRemaining !== 1 && "s"} remaining.
          </div>
          <MinigameCode
            puzzle={puzzle}
            incorrect={incorrect}
            onSubmit={(solution) => {
              setIncorrect(false);
              serverRef.current.send({ type: "submit", solution });
            }}
          />
        </>
      ) : (
        <div className="text-gray-400 text-center">All awards claimed. Wait for next puzzle.</div>
      )}
    </div>
  );
}

function DebuffInfo({ debuff }: { debuff: DebuffItem }) {
  const info = debuffInfo[debuff.name];
  return (
    <>
      <div className="text-xl text-center">
        {info?.title ?? debuff.name} ({debuff.duration > 3_600 ? "∞" : debuff.duration}s)
      </div>
      {info && <div className="text-center text-sm text-gray-400">{info.description}</div>}
    </>
  );
}

function PlayerPicker({ players, onPick }: { players: string[]; onPick: (player: string) => void }) {
  return (
    <div className="flex flex-col gap-3 w-min min-w-1/2 flex-1 overflow-y-auto self-center">
      {players.map((player) => (
        <button
          key={player}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 cursor-pointer rounded text-white font-bold whitespace-nowrap"
          onClick={() => onPick(player)}
        >
          {player}
        </button>
      ))}
    </div>
  );
}
