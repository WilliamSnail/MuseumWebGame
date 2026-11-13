// npm test：一次跑全部的檢查。任何一項沒過，整個就算沒過（CI 也是跑這個）。
// 模擬（sim*.cjs）比較久，不在這裡跑；改數值時自己跑：node test/sim.cjs 1000
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
  ["合作地下接上打怪物（房間探索完才打守門、打贏才算走完、逃跑、倒下真的受傷、膽量壹趟壹份、看不到別人選什麼，決定 0067、0068）", ["test/coop_fight.test.cjs"]],
  ["合作地下的地圖選路（探索點走原本的房間、遭遇、休息、寶箱、最後守門、地圖不露怪物，地下室改版）", ["test/coop_route.test.cjs"]],
  ["打怪的新玩法（怪物的九種個性、佩佩的顏色和組合、完美招式兩次、引開、鼓舞、分膽、安慰、看清、你適合、助手補位）", ["test/cellar_traits.test.cjs"]],
  ["地下室改版：打怪物和每層的小地圖（1～4 人、看穿和推的加成、安撫、擋、招式一場一次、守門兩階段、撤退、地圖每天一張、房間一趟走得完，決定 0067）", ["test/cellar_fight.test.cjs"]],
  ["邀請、隊伍、一起融合", ["test/party.test.cjs"]],
  ["圖的點擊範圍（背景看不到的部分點不到）", ["test/art_hit.test.cjs"]],
  ["每週劇情（任務、獎勵、週章、換日換週、書、劇情線、備用週）", ["test/story.test.cjs"]],
  ["線索 → 你看懂了（拿線索不重複、集齊才跳、只跳壹次、靈感壹次、舊存檔、壞資料、提示不破梗、不扣理智、舊週拿不到不卡、W46 d1）", ["test/clues.test.cjs"]],
  ["管理員介面的摘要（算得對、壞存檔不丟錯、舊存檔、沒有 email，決定 0033）", ["test/admin.test.cjs"]],
  ["兌換所和技能成長（裝備、提升技能、上課、試煉房間、跟館友學、限定頭飾）", ["test/shop.test.cjs"]],
  ["每週排行榜（同分、第一週、相減、壞存檔、暱稱清理、2000 字、建議，決定 0039）", ["test/board.test.cjs"]],
  ["館友證和典藏冊的摘要（只讀存檔、稀有度分開算、自由模式）", ["test/pass.test.cjs"]],
  ["大廳導覽圖上的館友（名單 → 每間房有誰、白名單、放不下的「+N」）", ["test/mates.test.cjs"]],
  ["合作試煉（隊伍選試煉房間、各算各的成長、資格不合陪打、次數不多扣、活動加成、離隊和斷線接回去，決定 0041）", ["test/coop_trial.test.cjs"]],
  ["限時活動（時間邊界、台灣時間、開始時在活動內算到走完、多 1 趟、試煉加成、壞資料，決定 0041）", ["test/events.test.cjs"]],
  ["Hamachi 賭場（21 點的規則、真的牌組、賠率、看錯牌、錢包、救濟、大禮包、餐車、換小獎、成就和財產、舊資料認領，決定 0040）", ["test/casino.test.cjs"]],
  ["Hamachi 賭場的館友同桌（輪流、同一副牌、時間限制、超時和斷線當停牌、離桌、暗牌不外洩、錢守恆，決定 0040）", ["test/casino_table.test.cjs"]],
  ["地下探險撿籌碼（機率、上限、換日、同房間不重複、莊家守恆、舊錢包、壞資料、不認得的房間，決定 0047）", ["test/casino_find.test.cjs"]],
  ["交委託拿籌碼、委託的靈感打折（數量、一天上限、換日、同一張不重複、莊家守恆、舊錢包、壞資料，決定 0062）", ["test/casino_job.test.cjs"]],
  ["重讀禁書再擲看懂檢定、《看懂的事》的清單和提示（當天不行、隔天可以、一天一次、舊存檔、不外流還沒看懂的內容，決定 0063）", ["test/reread.test.cjs"]],
  ["跟 Yuga 借錢（利息、額度、到期直接扣到負的、準時還清額度變高、欠款中也能借、舊錢包，決定 0064）", ["test/loan.test.cjs"]],
  ["招領（理智歸零的參觀者做成招領單、只公開該公開的、幾天內遇得到、自己的遇不到、送回去壹次、獎勵、舊存檔）", ["test/lostfound.test.cjs"]],
  ["欠款送參觀者去地下工作（要送的時機、換人上場、每天還 34%、理智 −5 最低 1、還清回來、花靈感補理智，決定 0064）", ["test/work.test.cjs"]],
  ["新的大廳（回滾的總開關、舊的大廳還在、11 間房、素材都在、沒有英文字，決定 0066）", ["test/lobby2.test.cjs"]],
  ["class 名字（全域 class 不能當 css 前綴、往 html／body 加 class 要先登記，11-13，docs/class名單.md）", ["test/class_names.test.cjs"]],
  ["館內 GDP 和景氣指數（活動次數、四塊算法、成長率要兩段各 7 天、平滑、人太少不算、日報有景氣一段，11-13）", ["test/casino_gdp.test.cjs"]],
  ["參觀者門票（第一次只記起點、票價照展廳評分、三份分法、每天上限、守恆，11-13）", ["test/casino_ticket.test.cjs"]],
  ["賭場的記帳（每條會動籌碼的路都要記到帳上、守恆、快照相減，11-13）", ["test/casino_book.test.cjs"]],
  ["館外股票的每日漲跌（名字表、縮放和上限、休市不動、缺資料用前一天、資料到了沒、抓資料整理，11-13）", ["test/stocks.test.cjs"]],
  ["賭場的拚經濟（成功、失敗、油水的機率邊界、每日上限、換日、莊家和錢包金額、莊家拚回正、文字界線，決定 0052）", ["test/casino_econ.test.cjs"]],
  ["Yuga Bot 銀行的活存、定存（存領、到期、解約、利息從莊家出、破產不給、補算、守恆、利率順序）", ["test/casino_bank.test.cjs"]],
  ["館債（每週壹期、利率照莊家、照天數計息、到期、預算池墊、憑證補付、上限、守恆、利率順序）", ["test/casino_bond.test.cjs"]],
  ["藝術市場（稀有度、價格放久了／景氣反向／搶手、一天變動小、買賣守恆、價差短線必虧、上限、舊存檔、壞資料、畫面資料，11-14）", ["test/casino_art.test.cjs"]],
  ["銀行廳的財報頁（沒日報給 null、景氣夾範圍、新聞照資料挑、壞資料）", ["test/casino_bankecon.test.cjs"]],
  ["股票（館外七支、停盤、手續費、換日調價、莊家曝險上限、守恆）", ["test/casino_stock.test.cjs"]],
  ["股票限價單、停損單（鎖籌碼和股、跳空用觸發價、過期、取消、上限、守恆）", ["test/casino_stock_order.test.cjs"]],
  ["賭場的實況和斗內（開播、搶不走、到期和離線算下播、斗內金額範圍和守恆、不能斗自己、不夠錢、每日上限、收款上限、換日、壞資料、實況主沒有錢包、資料庫規則，決定 0053）", ["test/casino_live.test.cjs"]],
  ["Hamachi 賭場的每週收藏（換週歸零、過期不懲罰、重複領不行、條件邊界、壞資料、舊錢包、同桌和單人都算、只由伺服器算，決定 0042）", ["test/casino_week.test.cjs"]],
  ["稱號到處看得到（公開哪一個、讀回來檢查、館友名單、導覽圖、每週榜單、資料庫規則只放寬 titles，決定 0050）", ["test/titles.test.cjs"]],
  ["Hamachi 賭場的連勝連敗（連贏回心情、連輸扣理智、平手不算、歸零、每天上限、換日、舊錢包、理智最低留 1、自由模式、重複送同一局，決定 0049）", ["test/casino_streak.test.cjs"]],
  ["手機轉橫的提示（先用直的記在裝置上、鎖橫向失敗不丟錯、landscape.css 只在手機橫拿和直拿才生效，決定 0043）", ["test/orient.test.cjs"]],
  ["動畫減量不會讓東西看不到", ["test/motion.test.cjs"]],
  ["說明文字標重點", ["test/mark.test.cjs"]],
  ["公告發到 Discord", ["test/discord.test.cjs"]],
  ["Discord 聯動第一步的規則（解析 interaction、綁定碼、打錯擋、加入連結、公開的字沒有 email、指令清單，決定 0051）", ["test/discord_bot.test.cjs"]],
  ["Discord 聯動第三步的文字和按鈕（指令選項、按鈕 custom_id、21 點訊息、餐車選單、把理智拿掉、21 點併單、規則只有壹套、不先回再做，決定 0051）", ["test/discord_play.test.cjs"]],
  ["Yuga Bot 交代的任務（giver 的文字、說完 done 不重複、舊存檔、壞資料、Discord 的 says 不帶理智、借錢規則只有壹套、/pepe-借錢，決定 0051）", ["test/yuga.test.cjs"]],
  ["Discord 聯動第二步的規則（遊戲大事發到頻道：事件的字只有暱稱、冷卻、太舊的不發、不 @ 任何人、token 不進 repo、部署流程、模擬器不連真的 Discord，決定 0051）", ["test/discord_out.test.cjs"]],
  ["預約公告（時間換算、不重發、工作流程對得上）", ["test/announce.test.cjs"]],
  ["給 AI 重複用的腳本", ["test/tools.test.cjs"]],
  ["每天新關卡的工具（每種打法每一層都過檢查、少寫預告會說、調難度、今天的點放進地圖，決定 0067）", ["test/new_level.test.cjs"]],
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

// 同時跑好幾項（翊文 11-13：「你能優化一下測試嗎」）：以前壹項排完才跑下壹項，現在壹次跑「核心數 − 1」項。
// 每項本來就是自己的 Node 程式；會寫檔的（tools.test、server.test）都用自己的暫存資料夾、伺服器用隨機 port，同時跑不會打架。
// 結果還是照上面的順序印。TEST_JOBS=1 ＝ 照舊壹項壹項跑（懷疑同時跑出問題時用）。--slow：最後列出最慢的 10 項。
const os = require("os");
const { spawn } = require("child_process");
const JOBS = Math.max(1, Number(process.env.TEST_JOBS) || Math.max(2, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
const t0 = Date.now();
const results = new Array(STEPS.length);
let next = 0, printed = 0, failed = 0;
function flush() {
  while (printed < STEPS.length && results[printed]) {
    const { name, ok, out } = results[printed];
    console.log(`${ok ? "✓" : "✗"} ${name}：${out[out.length - 1] || ""}`);
    if (!ok) console.log(out.map(l => "    " + l).join("\n"));
    printed++;
  }
}
function runOne(i) {
  const [name, args] = STEPS[i], t = Date.now();
  return new Promise(done => {
    const p = spawn(process.execPath, args, { cwd: root });
    let buf = "";
    p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
    p.stdout.on("data", d => { buf += d; }); p.stderr.on("data", d => { buf += d; });
    p.on("error", e => { buf += String(e && e.message); });
    p.on("close", code => {
      const ok = code === 0;
      if (!ok) failed++;
      results[i] = { name, ok, out: buf.trim().split("\n"), ms: Date.now() - t };
      flush();
      done();
    });
  });
}
async function worker() { while (next < STEPS.length) await runOne(next++); }
Promise.all(Array.from({ length: Math.min(JOBS, STEPS.length) }, worker)).then(() => {
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  if (process.argv.includes("--slow")) {
    console.log("\n最慢的 10 項：");
    results.slice().sort((a, b) => b.ms - a.ms).slice(0, 10).forEach(r => console.log(`  ${(r.ms / 1000).toFixed(1)} 秒　${r.name}`));
  }
  console.log(failed ? `\n${failed} 項沒過（${sec} 秒，同時跑 ${JOBS} 項）` : `\n全部通過（${sec} 秒，同時跑 ${JOBS} 項）`);
  process.exit(failed ? 1 : 0);
});
