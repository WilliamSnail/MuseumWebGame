// Vite 設定：web/ 是網頁，shared/ 是瀏覽器和伺服器共用的規則。
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("./version.json", import.meta.url), "utf8"));

export default defineConfig({
  root: "web",
  // 設定頁顯示的版本號（version.json，用 npm run version:bump 換）
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [here] }, // web/ 要讀得到上一層的 shared/
    // 遊戲伺服器（另開 npm run server，port 8787）：/api 和 /ws 轉過去，網頁和伺服器看起來是同一個網址
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
