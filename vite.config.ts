import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "client"),
  base: "/analytics/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/analytics/data": "http://localhost:3000",
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: false,
  },
});
