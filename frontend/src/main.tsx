import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

if (window.name !== "spotlight") {
  const Admin = lazy(() => import("./admin/Admin.tsx"));
  const App = lazy(() => import("./player/App.tsx"));
  const Spectate = lazy(() => import("./admin/Spectate.tsx"));

  const { pathname } = window.location;
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
