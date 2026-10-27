import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Em desenvolvimento, rode `npm run dev:api` (Worker em :8787) junto com `npm run dev`.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
