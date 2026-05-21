import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API + WebSocket to the CNC server (avoids Windows firewall on port 3847)
    proxy: {
      "/api": { target: "http://127.0.0.1:3847", changeOrigin: true },
      "/ws": { target: "http://127.0.0.1:3847", ws: true, changeOrigin: true },
    },
  },
});
