import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BACKEND lets the dev server talk to another backend (for example a test copy); the default is the usual one
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backend = (globalThis as any).process?.env?.VITE_BACKEND || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/output": backend,
      "/input": backend,
    },
  },
});
