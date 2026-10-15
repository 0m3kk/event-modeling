import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@em/spec": path.resolve(__dirname, "./packages/spec/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
  },
});
