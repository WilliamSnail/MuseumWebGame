// npm test：一次跑全部的檢查。任何一項沒過，整個就算沒過（CI 也是跑這個）。
// 模擬（sim*.cjs）比較久，不在這裡跑；改數值時自己跑：node test/sim.cjs 1000
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const STEPS = [
  ["規則測試", ["test/logic.test.cjs"]],
  ["新玩家的下一步", ["test/guide.test.cjs"]],
  ["公佈欄、信箱", ["test/notice.test.cjs"]],
  ["參觀者一位接一位（遺物、選職業抽優缺點、歷任紀錄）", ["test/legacy.test.cjs"]],
  ["多位參觀者（換人、位子、名字）", ["test/visitors.test.cjs"]],
  ["館友之間（送佩佩、參觀展廳的規則）", ["test/gifts.test.cjs"]],
  ["每日簽到、每週全簽到、節日（11-09，決定 0030）", ["test/signin.test.cjs"]],
  ["合作地下收藏庫（投票、強度、技能、理智、受傷、幽靈）", ["test/coop.test.cjs"]],
  ["邀請、隊伍、一起融合", ["test/party.test.cjs"]],
  ["內容檢查（content.js）", ["test/content/check.cjs"]],
  ["內容檢查（content3.js）", ["test/content/check3.cjs"]],
  ["特效在 Node 載得起來", ["test/fx/node-check.cjs"]],
  ["ES 模組接得上", ["test/esm_smoke.mjs"]],
  ["遊戲伺服器（登入、存檔、在線名單、net.js）", ["test/server.test.mjs"]],
  ["import／export 都對得上（沒有漏 import、ui_core 沒 import 後面的檔）", ["tools/check_imports.cjs"]],
  ["維護日誌的格式", ["tools/log_check.cjs"]],
];

let failed = 0;
for (const [name, args] of STEPS) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  const out = (r.stdout + r.stderr).trim().split("\n");
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}：${out[out.length - 1] || ""}`);
  if (!ok) console.log(out.map(l => "    " + l).join("\n"));
}
console.log(failed ? `\n${failed} 項沒過` : "\n全部通過");
process.exit(failed ? 1 : 0);
