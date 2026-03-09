import { useEffect, useState } from "react";
import { type ConnState, GameServerHandler } from "../connection";
import type { AngryBirdInitPayload, AngryBirdPosPayload } from "../player/AngryBird";

type PuzzleInfo = { id: string; title: string };

type AdminCmd =
  | { type: "admin_login"; password: string }
  | { type: "spectate"; players: string[] }
  | { type: "change_puzzle"; puzzle: string }
  | { type: "add_player"; name: string }
  | { type: "remove_player"; name: string }
  | { type: "reload_puzzles" };

type DebuffItem = { name: string; type: string; strength: number; duration: number };

type AdminMessage =
  | { type: "admin_welcome" }
  | { type: "puzzles"; puzzles: PuzzleInfo[]; current: string | null }
  | { type: "players"; players: string[] }
  | { type: "spectate_editor"; player: string; code: string; row: number; col: number }
  | { type: "spectate_state"; player: string; state: "running" | "valid" | "invalid" | null }
  | { type: "spectate_output"; player: string; content: string }
  | { type: "spectate_debuffs"; player: string; debuffs: DebuffItem[] }
  | { type: "spectate_debuff_state"; player: string; name: string; payload: unknown }
  | { type: "error"; message: string };

type PlayerState = {
  code: string;
  row: number;
  col: number;
  state: "running" | "valid" | "invalid" | null;
  output: string;
  debuffs: DebuffItem[];
  screensaverActive: boolean;
  birdInit: AngryBirdInitPayload | null;
  birdPos: AngryBirdPosPayload | null;
};

const defaultPlayerState: PlayerState = {
  code: "",
  row: 0,
  col: 0,
  state: null,
  output: "",
  debuffs: [],
  screensaverActive: false,
  birdInit: null,
  birdPos: null,
};

/* eslint-disable react-hooks/immutability -- I'm lazy af */

type Options = {
  spectateAll?: boolean;
};

export function useAdminState({ spectateAll = false }: Options) {
  const [connState, setConnState] = useState<ConnState>("not");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [puzzles, setPuzzles] = useState<PuzzleInfo[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<string | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [spectating, setSpectating] = useState<Set<string>>(() => (spectateAll ? new Set(["*"]) : new Set()));
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});

  const [server] = useState(() => new GameServerHandler<AdminCmd, AdminMessage>());

  const connect = (ip: string, pwd: string) => {
    setLoginError(null);
    setError(null);

    server.handleState = setConnState;
    server.handleLogin = setLoggedIn;
    server.handleLoginError = setLoginError;
    server.handleMessage = (data) => {
      console.log("Admin received:", data);

      switch (data.type) {
        case "puzzles":
          setPuzzles(data.puzzles);
          setCurrentPuzzle(data.current);
          break;
        case "players":
          setPlayers(data.players);
          break;
        case "spectate_editor":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...defaultPlayerState,
              ...prev[data.player],
              code: data.code,
              row: data.row,
              col: data.col,
            },
          }));
          break;
        case "spectate_state": {
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...defaultPlayerState,
              ...prev[data.player],
              state: data.state,
              ...(data.state === "running" || data.state === null ? { output: "" } : {}),
            },
          }));
          break;
        }
        case "spectate_output":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...defaultPlayerState,
              ...prev[data.player],
              output: (prev[data.player]?.output ?? "") + data.content,
            },
          }));
          break;
        case "spectate_debuffs":
          setPlayerStates((prev) => ({
            ...prev,
            [data.player]: {
              ...defaultPlayerState,
              ...prev[data.player],
              debuffs: data.debuffs,
            },
          }));
          break;
        case "spectate_debuff_state": {
          const payload = data.payload as Record<string, unknown>;
          if (data.name === "screensaver") {
            setPlayerStates((prev) => ({
              ...prev,
              [data.player]: {
                ...defaultPlayerState,
                ...prev[data.player],
                screensaverActive: payload.kind === "active",
              },
            }));
          } else if (data.name === "angry_bird") {
            setPlayerStates((prev) => ({
              ...prev,
              [data.player]: {
                ...defaultPlayerState,
                ...prev[data.player],
                ...(payload.kind === "init" ? { birdInit: payload as unknown as AngryBirdInitPayload } : {}),
                birdPos:
                  payload.kind === "pos"
                    ? (payload as unknown as AngryBirdPosPayload)
                    : (prev[data.player]?.birdPos ?? null),
              },
            }));
          }
          break;
        }
      }
    };

    server.connect(ip, { type: "admin_login", password: pwd });
  };

  const disconnect = () => {
    server.disconnect();
    setConnState("not");
  };

  // Send spectate command when selection changes
  useEffect(() => {
    if (loggedIn) {
      server.send({ type: "spectate", players: Array.from(spectating) });
    }
  }, [spectating, loggedIn, server]);

  // Clear all player states when the puzzle changes
  useEffect(() => {
    setPlayerStates({});
  }, [currentPuzzle]);

  return {
    connect,
    disconnect,
    server,
    connState,
    loggedIn,
    loginError,
    error,
    puzzles,
    currentPuzzle,
    players,
    spectating,
    setSpectating,
    playerStates,
  };
}

export type AdminState = ReturnType<typeof useAdminState>;
