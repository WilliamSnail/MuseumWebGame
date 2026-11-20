// Vite 設定：web/ 是網頁，shared/ 是瀏覽器和伺服器共用的規則。
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = fileURLToPath(new URL(".", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("./version.json", import.meta.url), "utf8"));

// shared/game/notices_data.js 不進 git：dev、build 開始前先由 content/notices/*.json 產生（沒變就不寫，很快）
const buildNotices = () => createRequire(import.meta.url)("./tools/content/notices_build.cjs").write();
const noticesPlugin = { name: "notices-data", buildStart() { buildNotices(); }, configureServer() { buildNotices(); } };

export default defineConfig({
  plugins: [noticesPlugin],
  root: "web",
  // 設定頁顯示的版本號（version.json，用 npm run version:bump 換）
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [here] }, // web/ 要讀得到上一層的 shared/
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
