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
  ["趣味節日（固定日期、第幾個星期幾、閏日、壹天好幾個、大節日不變、不發獎勵、文字乾淨、Discord 冷知識，決定 0044）", ["test/funday.test.cjs"]],
  ["主題展辦完（連續 3 天、三級、限定配件、策展手記、每週特展，決定 0035）", ["test/themeshow.test.cjs"]],
  ["合作地下收藏庫（投票、強度、技能、理智、受傷、幽靈）", ["test/coop.test.cjs"]],
  ["合作地下的流程（投票時間、掛機、離隊、每天幾趟）", ["test/coop_flow.test.cjs"]],
  ["合作地下好玩的機制（線索、幻覺、變形、幽靈、證據、留守、搬東西、報告、痕跡）", ["test/coop_fun.test.cjs"]],
  ["留下痕跡（留言牌、按讚、影子、幽影）", ["test/coop_trace.test.cjs"]],
  ["邀請、隊伍、一起融合", ["test/party.test.cjs"]],
  ["每週劇情（任務、獎勵、週章、換日換週、書、劇情線、備用週）", ["test/story.test.cjs"]],
  ["管理員介面的摘要（算得對、壞存檔不丟錯、舊存檔、沒有 email，決定 0033）", ["test/admin.test.cjs"]],
  ["兌換所和技能成長（裝備、提升技能、上課、試煉房間、跟館友學、限定頭飾）", ["test/shop.test.cjs"]],
  ["每週排行榜（同分、第一週、相減、壞存檔、暱稱清理、2000 字、建議，決定 0039）", ["test/board.test.cjs"]],
  ["大廳導覽圖上的館友（名單 → 每間房有誰、白名單、放不下的「+N」）", ["test/mates.test.cjs"]],
  ["合作試煉（隊伍選試煉房間、各算各的成長、資格不合陪打、次數不多扣、活動加成、離隊和斷線接回去，決定 0041）", ["test/coop_trial.test.cjs"]],
  ["限時活動（時間邊界、台灣時間、開始時在活動內算到走完、多 1 趟、試煉加成、壞資料，決定 0041）", ["test/events.test.cjs"]],
  ["Hamachi 賭場（21 點的規則、真的牌組、賠率、看錯牌、錢包、救濟、大禮包、餐車、換小獎、成就和財產、舊資料認領，決定 0040）", ["test/casino.test.cjs"]],
  ["Hamachi 賭場的館友同桌（輪流、同一副牌、時間限制、超時和斷線當停牌、離桌、暗牌不外洩、錢守恆，決定 0040）", ["test/casino_table.test.cjs"]],
  ["地下探險撿籌碼（機率、上限、換日、同房間不重複、莊家守恆、舊錢包、壞資料、不認得的房間，決定 0047）", ["test/casino_find.test.cjs"]],
  ["賭場的拚經濟（成功、失敗、油水的機率邊界、每日上限、換日、莊家和錢包金額、莊家拚回正、文字界線，決定 0052）", ["test/casino_econ.test.cjs"]],
  ["賭場的實況和斗內（開播、搶不走、到期和離線算下播、斗內金額範圍和守恆、不能斗自己、不夠錢、每日上限、收款上限、換日、壞資料、實況主沒有錢包、資料庫規則，決定 0053）", ["test/casino_live.test.cjs"]],
  ["Hamachi 賭場的每週收藏（換週歸零、過期不懲罰、重複領不行、條件邊界、壞資料、舊錢包、同桌和單人都算、只由伺服器算，決定 0042）", ["test/casino_week.test.cjs"]],
  ["稱號到處看得到（公開哪一個、讀回來檢查、館友名單、導覽圖、每週榜單、資料庫規則只放寬 titles，決定 0050）", ["test/titles.test.cjs"]],
  ["Hamachi 賭場的連勝連敗（連贏回心情、連輸扣理智、平手不算、歸零、每天上限、換日、舊錢包、理智最低留 1、自由模式、重複送同一局，決定 0049）", ["test/casino_streak.test.cjs"]],
  ["手機轉橫的提示（先用直的記在裝置上、鎖橫向失敗不丟錯、landscape.css 只在手機橫拿和直拿才生效，決定 0043）", ["test/orient.test.cjs"]],
  ["動畫減量不會讓東西看不到", ["test/motion.test.cjs"]],
  ["說明文字標重點", ["test/mark.test.cjs"]],
  ["公告發到 Discord", ["test/discord.test.cjs"]],
  ["Discord 聯動第一步的規則（解析 interaction、綁定碼、打錯擋、加入連結、公開的字沒有 email、指令清單，決定 0051）", ["test/discord_bot.test.cjs"]],
  ["預約公告（時間換算、不重發、工作流程對得上）", ["test/announce.test.cjs"]],
  ["給 AI 重複用的腳本", ["test/tools.test.cjs"]],
  ["交過的委託不能再交", ["test/commission_keep.test.cjs"]],
  ["每週任務的旁白", ["test/story_words.test.cjs"]],
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
