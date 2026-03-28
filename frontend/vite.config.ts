import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isMinigame = process.env.BUILD_TARGET === "minigame";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  build: {
    outDir: isMinigame ? "dist-minigame" : "dist",
    rollupOptions: {
      input: isMinigame
        ? { minigame: resolve(__dirname, "minigame.html") }
        : { main: resolve(__dirname, "index.html") },
    },
  },
});
