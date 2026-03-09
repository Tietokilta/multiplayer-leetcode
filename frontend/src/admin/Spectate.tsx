import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { createPortal } from "react-dom";
import { stateColors } from "../connection";
import { AdminLogin } from "./AdminLogin";
import { useAdminState } from "./adminState";
import { PlayerCard } from "./PlayerCard";
import type { SpectatorController } from "./SpectatorController";
import { submissionColors } from "./submissionColors";

function SpotlightView({ name, controller }: { name: string; controller: SpectatorController }) {
  const state = controller.usePlayerStore(
    useShallow((s) => ({
      submissionState: s.submissionState,
      rendered: s.rendered,
      output: s.output,
      debuffs: s.debuffs,
    })),
  );

  return (
    <div className="flex flex-col h-screen p-4 bg-gray-950 text-gray-100">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <span className="text-2xl font-bold">{name}</span>
        {state.submissionState && (
          <span className={`text-lg ${submissionColors[state.submissionState]}`}>{state.submissionState}</span>
        )}
      </div>
      <div className="bg-gray-900 text-gray-100 p-3 rounded text-sm overflow-auto flex-1 min-h-0 mlc--editor">
        {state.rendered}
      </div>
      {state.output && (
        <div className="mt-2 shrink-0">
          <div className="text-xs text-gray-500 mb-1">Output:</div>
          <pre className="bg-gray-800 text-gray-100 p-2 rounded text-sm font-mono overflow-auto max-h-32">
            {state.output}
          </pre>
        </div>
      )}
      {state.debuffs.length > 0 && (
        <div className="mt-2 shrink-0">
          <div className="text-xs text-gray-500 mb-1">Penalties:</div>
          <div className="flex flex-wrap gap-1">
            {state.debuffs.map((d, i) => (
              <span key={i} className="text-sm bg-orange-900/50 text-orange-300 rounded px-2 py-0.5">
                {d.name} ({Math.ceil(d.duration)}s)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Spectate() {
  const adminState = useAdminState({ spectateAll: true });
  const { connState, loggedIn, players, getController } = adminState;

  // 10 fixed slots: indices 0-8 = grid, index 9 = spotlight. null = empty.
  const [orderedPlayers, setOrderedPlayers] = useState<(string | null)[]>(Array(10).fill(null));
  const [spotlightContainer, setSpotlightContainer] = useState<HTMLElement | null>(null);
  const spotlightWindowRef = useRef<Window | null>(null);

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

  useEffect(() => {
    const openSpotlight = (evt: KeyboardEvent) => {
      if (evt.key !== "s") return;
      if (spotlightWindowRef.current && !spotlightWindowRef.current.closed) {
        spotlightWindowRef.current.focus();
        return;
      }
      const win = window.open("/spectate", "spotlight", "width=900,height=700");
      if (!win) return;
      spotlightWindowRef.current = win;
      win.addEventListener("load", () => {
        setSpotlightContainer(win.document.getElementById("root"));
      });
      win.addEventListener("beforeunload", () => {
        setSpotlightContainer(null);
      });
    };
    window.addEventListener("keydown", openSpotlight);
    return () => {
      window.removeEventListener("keydown", openSpotlight);
    };
  }, []);

  const handleGridClick = (i: number) => {
    if (spotlightWindowRef.current?.closed) setSpotlightContainer(null);
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
      <div className="grid grid-cols-3 grid-rows-3 p-3 gap-3 h-screen">
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
        spotlightPlayer &&
        createPortal(
          <SpotlightView name={spotlightPlayer} controller={getController(spotlightPlayer)} />,
          spotlightContainer,
        )}
    </>
  );
}
