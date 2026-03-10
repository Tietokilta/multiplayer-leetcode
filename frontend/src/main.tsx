import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { preloadAngryBird } from "./player/angryBirdData.ts";
import { preloadClippy } from "./player/clippyData.ts";
import {
  fireCharConfetti,
  fireConfettiAt,
  fireConfettiAtCursor,
  fireEmojiConfettiAtCursor,
} from "./player/confetti.ts";

preloadClippy();
preloadAngryBird();

const { pathname } = window.location;
if (pathname === "/spotlight") {
  window.confetti = {
    fireConfettiAtCursor,
    fireEmojiConfettiAtCursor,
    fireCharConfetti,
    fireConfettiAt,
  };
  window.opener?.postMessage({ type: "spotlight-ready" }, location.origin);
} else {
  const Admin = lazy(() => import("./admin/Admin.tsx"));
  const App = lazy(() => import("./player/App.tsx"));
  const Spectate = lazy(() => import("./admin/Spectate.tsx"));

  const isAdmin = pathname === "/admin";
  const isSpectate = pathname === "/spectate";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Suspense fallback={<div className="m-4 border rounded p-4">Loading app&hellip;</div>}>
        {isAdmin ? <Admin /> : isSpectate ? <Spectate /> : <App />}
      </Suspense>
    </StrictMode>,
  );
}
