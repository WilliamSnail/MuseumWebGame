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
  ["參觀展廳、送佩佩、伺服器的信（Functions 每一步要做的事）", ["test/visit.test.cjs"]],
  ["每日簽到、每週全簽到、節日（11-09，決定 0030）", ["test/signin.test.cjs"]],
  ["主題展辦完（連續 3 天、三級、限定配件、策展手記、每週特展，決定 0035）", ["test/themeshow.test.cjs"]],
  ["合作地下收藏庫（投票、強度、技能、理智、受傷、幽靈）", ["test/coop.test.cjs"]],
  ["合作地下的流程（投票時間、掛機、離隊、每天幾趟）", ["test/coop_flow.test.cjs"]],
  ["合作地下好玩的機制（線索、幻覺、變形、幽靈、證據、留守、搬東西、報告、痕跡）", ["test/coop_fun.test.cjs"]],
  ["留下痕跡（留言牌、按讚、影子、幽影）", ["test/coop_trace.test.cjs"]],
  ["邀請、隊伍、一起融合", ["test/party.test.cjs"]],
  ["每週劇情（任務、獎勵、週章、換日換週、書、劇情線、備用週）", ["test/story.test.cjs"]],
  ["管理員介面的摘要（算得對、壞存檔不丟錯、舊存檔、沒有 email，決定 0033）", ["test/admin.test.cjs"]],
  ["兌換所和技能成長（裝備、提升技能、上課、試煉房間、跟館友學、限定頭飾）", ["test/shop.test.cjs"]],
  ["大廳導覽圖上的館友（名單 → 每間房有誰、白名單、放不下的「+N」）", ["test/mates.test.cjs"]],
  ["公告發到 Discord", ["test/discord.test.cjs"]],
  ["Firebase 的固定動作", ["test/fb_task.test.cjs"]],
  ["每週劇情的內容檢查擋得住壞的內容", ["test/week_check.test.cjs"]],
  ["每週劇情的內容（content/weeks、帳本、排程設定）", ["tools/week_check.cjs"]],
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
