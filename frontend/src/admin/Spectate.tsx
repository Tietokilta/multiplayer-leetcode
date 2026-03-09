import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { stateColors } from "../connection";
import Game from "../player/Game";
import { AdminLogin } from "./AdminLogin";
import { useAdminState } from "./adminState";
import { PlayerCard } from "./PlayerCard";
import type { SpectatorController } from "./SpectatorController";

function Spotlight({
  player,
  controller,
  window,
}: {
  player: string;
  controller: SpectatorController;
  window: Window | null;
}) {
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    controller.confetti = window;
    return () => {
      controller.confetti = null;
    };
  }, [controller, window]);

  return (
    <>
      <Game controller={controller} />
      <div className="fixed top-0 right-0 text-4xl text-semibold p-3 border-l border-b rounded-bl bg-gray-800 z-100">
        {player}
      </div>
    </>
  );
}

function useSpotlightWindow(enableListener: boolean) {
  const [spotlightContainer, setSpotlightContainer] = useState<HTMLElement | null>(null);
  const [spotlightWindow, setSpotlightWindow] = useState<Window | null>(null);
  const spotlightWindowRef = useRef<Window | null>(null);

  const showSpotlightWarning = () => {
    const win = spotlightWindowRef.current;
    if (!win || win.closed) return;
    const overlay = win.document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;color:white;font-size:2rem;font-family:sans-serif;text-align:center";
    overlay.textContent = "⚠ Main window closed";
    win.document.body.appendChild(overlay);
  };

  // When the spotlight window is ready, mount the React root into it.
  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      if (evt.data?.type !== "spotlight-ready") return;
      const win = spotlightWindowRef.current;
      if (!win || evt.source !== spotlightWindowRef.current) return;
      const root = win.document.getElementById("root");
      console.log("Spotlight ready, setting container", root);
      setSpotlightContainer(root);
      setSpotlightWindow(win);
      win.addEventListener("beforeunload", () => {
        setSpotlightContainer(null);
        setSpotlightWindow(null);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Open the spotlight window when "s" is pressed, or focus it if it's already open.
  useEffect(() => {
    if (!enableListener) return;

    const openSpotlight = (evt: KeyboardEvent) => {
      if (evt.key !== "s") return;
      const existing = spotlightWindowRef.current;
      if (existing && !existing.closed) {
        setSpotlightContainer(null);
        setSpotlightWindow(null);
        existing.location.href = `/spotlight?t=${Date.now()}`;
        return;
      }
      const win = window.open(`/spotlight?t=${Date.now()}`, "spotlight", "width=900,height=700");
      if (!win) return;
      spotlightWindowRef.current = win;
    };

    window.addEventListener("keydown", openSpotlight);
    return () => {
      window.removeEventListener("keydown", openSpotlight);
    };
  }, [enableListener]);

  // If the main window is closed while the spotlight is open, show a warning in the spotlight.
  useEffect(() => {
    window.addEventListener("beforeunload", showSpotlightWarning);
    return () => {
      window.removeEventListener("beforeunload", showSpotlightWarning);
      showSpotlightWarning();
    };
  }, []);

  const checkSpotlightWindow = () => {
    if (spotlightWindowRef.current?.closed) {
      setSpotlightContainer(null);
      setSpotlightWindow(null);
    }
  };

  return { spotlightContainer, spotlightWindow, checkSpotlightWindow };
}

export default function Spectate() {
  const adminState = useAdminState({ spectateAll: true });
  const { connState, loggedIn, players, getController } = adminState;

  const { spotlightContainer, spotlightWindow, checkSpotlightWindow } = useSpotlightWindow(loggedIn);

  // 10 fixed slots: indices 0-8 = grid, index 9 = spotlight. null = empty.
  const [orderedPlayers, setOrderedPlayers] = useState<(string | null)[]>(Array(10).fill(null));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderedPlayers((prev) => {
      const next = [...prev];
      // Clear slots for departed players
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== null && !players.includes(next[i]!)) next[i] = null;
      }
      // Add new players to first available null slot
      for (const player of players) {
        if (!next.includes(player)) {
          const idx = next.indexOf(null);
          if (idx !== -1) next[idx] = player;
        }
      }
      return next;
    });
  }, [players]);

  const handleGridClick = (i: number) => {
    checkSpotlightWindow();
    setOrderedPlayers((prev) => {
      const next = [...prev];
      [next[i], next[9]] = [next[9], next[i]];
      return next;
    });
  };

  if (!loggedIn) {
    return <AdminLogin state={adminState} />;
  }

  const gridSlots = orderedPlayers.slice(0, 9);
  const spotlightPlayer = orderedPlayers[9];

  return (
    <>
      <span className={`absolute top-0 left-0 w-3 h-3 rounded-full inline-block ${stateColors[connState]}`} />
      {/* U2 projector screens overlap by about ml-3 :D */}
      <div className="grid grid-cols-3 grid-rows-3 p-3 gap-3 h-screen ml-3">
        {gridSlots.map((player, i) =>
          player ? (
            <PlayerCard
              key={player}
              name={player}
              controller={getController(player)}
              onClick={() => handleGridClick(i)}
            />
          ) : (
            <div
              key={i}
              className="border border-dashed rounded opacity-30 cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => handleGridClick(i)}
            />
          ),
        )}
      </div>
      {spotlightContainer &&
        createPortal(
          spotlightPlayer ? (
            <Spotlight player={spotlightPlayer} controller={getController(spotlightPlayer)} window={spotlightWindow} />
          ) : (
            <div className="m-4 border rounded p-4">No spotlighted player</div>
          ),
          spotlightContainer,
        )}
    </>
  );
}
