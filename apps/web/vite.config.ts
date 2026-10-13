import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const mapsDir = path.resolve(repoRoot, "packages/map-data/maps");

export default defineConfig({
  plugins: [react()],
  // 直接以生成的 map-data 目录作为静态资源根（/maps.json、/europe-3.topojson.json）
  publicDir: mapsDir,
  server: { fs: { allow: [repoRoot] } },
});