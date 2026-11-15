import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Python API runs on :8000. Vite forwards /api to it during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
