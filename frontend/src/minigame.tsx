import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import MinigameApp from "./minigame/App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MinigameApp />
  </StrictMode>,
);
