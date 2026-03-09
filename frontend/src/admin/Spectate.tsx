import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { stateColors } from "../connection";
import { AdminLogin } from "./AdminLogin";
import { useAdminState } from "./adminState";
import { PlayerCard, submissionColors, type PlayerState } from "./PlayerCard";

function SpotlightView({ name, state }: { name: string; state: PlayerState | undefined }) {
  return (
    <div className="flex flex-col h-screen p-4 bg-gray-950 text-gray-100">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <span className="text-2xl font-bold">{name}</span>
        {state?.state && <span className={`text-lg ${submissionColors[state.state]}`}>{state.state}</span>}
      </div>
      <pre className="bg-gray-900 text-gray-100 p-3 rounded text-sm font-mono whitespace-pre overflow-auto flex-1 min-h-0">
        {state?.code ?? ""}
      </pre>
      {state?.output && (
        <div className="mt-2 shrink-0">
          <div className="text-xs text-gray-500 mb-1">Output:</div>
          <pre className="bg-gray-800 text-gray-100 p-2 rounded text-sm font-mono overflow-auto max-h-32">
            {state.output}
          </pre>
        </div>
      )}
      {state?.debuffs && state.debuffs.length > 0 && (
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
  const { connState, loggedIn, players, playerStates } = adminState;

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
            <PlayerCard key={player} name={player} state={playerStates[player]} onClick={() => handleGridClick(i)} />
          ) : (
            <div key={i} className="border border-dashed rounded opacity-30" />
          ),
        )}
      </div>
      {spotlightContainer &&
        spotlightPlayer &&
        createPortal(
          <SpotlightView name={spotlightPlayer} state={playerStates[spotlightPlayer]} />,
          spotlightContainer,
        )}
    </>
  );
}
