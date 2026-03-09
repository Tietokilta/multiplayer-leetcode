/* eslint-disable react-hooks/immutability -- I'm lazy af */
import { useCallback, useEffect, useRef, useState } from "react";
import { type ConnState, GameServerHandler } from "../connection";
import type { DebuffItem } from "../messages";
import { SpectatorController } from "./SpectatorController";

type PuzzleInfo = { id: string; title: string };

type AdminCmd =
  | { type: "admin_login"; password: string }
  | { type: "spectate"; players: string[] }
  | { type: "change_puzzle"; puzzle: string }
  | { type: "add_player"; name: string }
  | { type: "remove_player"; name: string }
  | { type: "reload_puzzles" };

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

  const spectators = useRef<Map<string, SpectatorController>>(new Map());
  const prevPuzzleRef = useRef<string | null | undefined>(undefined);

  const getController = useCallback((player: string): SpectatorController => {
    if (!spectators.current.has(player)) {
      spectators.current.set(player, new SpectatorController());
    }
    return spectators.current.get(player)!;
  }, []);

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
          if (prevPuzzleRef.current !== data.current) {
            prevPuzzleRef.current = data.current;
            for (const controller of spectators.current.values()) controller.reset();
          }
          break;
        case "players":
          setPlayers(data.players);
          break;
        case "spectate_editor":
        case "spectate_state":
        case "spectate_output":
        case "spectate_debuffs":
        case "spectate_debuff_state":
          getController(data.player).handleMessage(data);
          break;
        case "error":
          setError(data.message);
          break;
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
    getController,
  };
}

export type AdminState = ReturnType<typeof useAdminState>;
