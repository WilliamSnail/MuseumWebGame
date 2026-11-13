// 圖的點擊範圍：看不到的部分不能點得到（玩家 11-13 回報手作坊常常按不到）
// 背景畫滿 -100..300，青蛙的 svg 是 overflow: visible；只用 mask 時看不到的部分還是點得到，會蓋住旁邊的卡片和頁籤。
// 要用 clip-path 剪掉（clip-path 會連點擊範圍壹起剪，mask 不會）。瀏覽器實測見維護日誌 11-13 手作坊背景點擊範圍
const fs = require("fs"), path = require("path"), assert = require("assert");
const art = fs.readFileSync(path.join(__dirname, "..", "web/src/art.js"), "utf8");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error("沒過：" + name + "\n  " + e.message); } };
T("框起來的背景有 clip-path（不只 mask）", () => {
  assert.ok(/class="f-bg" clip-path="url\(#\$\{id\}c\)"/.test(art), "f-bg 要有 clip-path");
  assert.ok(/<clipPath id="\$\{id\}c"><rect x="16" y="16" width="168" height="168"/.test(art), "clipPath 要剪在框裡");
});
console.log(`art_hit.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
