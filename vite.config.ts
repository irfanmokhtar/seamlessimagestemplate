import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Browser-only SPA; base "./" keeps the built bundle portable to any static path.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
