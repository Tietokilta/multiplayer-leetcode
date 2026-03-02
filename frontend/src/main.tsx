import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const Admin = lazy(() => import("./admin/Admin.tsx"));
const App = lazy(() => import("./player/App.tsx"));

const isAdmin = window.location.pathname === "/admin";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="m-4 border rounded p-4">Connecting to game server&hellip;</div>}>
      {isAdmin ? <Admin /> : <App />}
    </Suspense>
  </StrictMode>,
);
