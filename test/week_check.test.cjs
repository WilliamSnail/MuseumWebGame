// 每週劇情的內容檢查（tools/week_check.cjs）擋得住壞的內容：node test/week_check.test.cjs（npm test 也會跑）
// 做法：拿真的備用週當底，複製成一個正式週（2026-W47），每一項改壞一個地方，看檢查有沒有擋下來。
const assert = require("assert");
const path = require("path");
const { checkContent, readWeeks, readJSON, LEDGER, SETTINGS } = require("../tools/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const clone = o => JSON.parse(JSON.stringify(o));
const base = readWeeks();
const ledger0 = readJSON(LEDGER), settings0 = readJSON(SETTINGS);
const TODAY = "2026-11-22"; // W47 的週日

// 備用週「常青1」複製成正式週 2026-W47：補上 week、start、每天的 date，劇情線換成這週的 id，帳本也補上
function regular() {
  const files = clone(base.files), out = {};
  Object.keys(files).filter(k => k.startsWith("備用/")).forEach(k => { out[k] = files[k]; });
  const wk = clone(files["備用/常青1/week.json"]);
  wk.week = "2026-W47"; wk.start = "2026-11-16";
  wk.lines = [{ id: "w47-lost", name: "失物招領・續", kind: "week" }, { id: "w47-door", name: "小門・續", kind: "floor" }, { id: "main-s1", name: "第壹季　帳對不上", kind: "main" }];
  out["2026-W47/week.json"] = wk;
  for (let n = 1; n <= 7; n++) {
    const d = clone(files[`備用/常青1/d${n}.json`]);
    d.date = `2026-11-${15 + n}`;
    d.books.forEach(b => { b.line = b.line === "lost" ? "w47-lost" : "w47-door"; });
    d.adds.forEach(r => { r.line = r.line === "lost" ? "w47-lost" : "w47-door"; });
    out[`2026-W47/d${n}.json`] = d;
  }
  wk.anomaly.room.line = "w47-lost";
  const ledger = clone(ledger0);
  ledger.lines.push({ id: "w47-lost", name: "失物招領・續", kind: "week", start: "2026-W47", status: "進行中", summary: "測試用" },
    { id: "w47-door", name: "小門・續", kind: "floor", start: "2026-W47", status: "進行中", summary: "測試用" });
  ledger.weeks["2026-W47"] = { use: "2026-W47", main: "第壹章　多壹隻", news: ["測試用的元素"] };
  return { files: out, ledger, settings: clone(settings0), today: TODAY };
}
const run = c => checkContent(c);
const has = (r, re) => r.errors.some(e => re.test(e));
const expectErr = (mutate, re) => { const c = regular(); mutate(c); const r = run(c); assert.ok(has(r, re), `應該擋下（${re}），結果：\n${r.errors.slice(0, 5).join("\n") || "沒擋"}`); };

T("真的內容（content/）：都過", () => {
  const r = run({ files: base.files, bad: base.bad, ledger: ledger0, settings: settings0, today: "2026-11-09" });
  assert.deepStrictEqual(r.errors, []);
});
T("複製出來的正式週也過（底是好的，下面才看得出擋了什麼）", () => {
  const r = run(regular());
  assert.deepStrictEqual(r.errors, []);
});
T("格式：週的名字、start 不是週一、date 對不上", () => {
  expectErr(c => { c.files["2026-W47/week.json"].start = "2026-11-17"; }, /start 要是這週的週一 2026-11-16/);
  expectErr(c => { c.files["2026-W47/d3.json"].date = "2026-11-19"; }, /date 要是 2026-11-18/);
  expectErr(c => { c.files["2026-W47/d2.json"].day = 3; }, /day 要是 2/);
  expectErr(c => { c.files["2026-W47/d8.json"] = {}; }, /看不懂這個檔/);
});
T("還沒到的天先寫好：擋（不破梗，第六節）", () => {
  expectErr(c => { c.today = "2026-11-17"; }, /還沒到/);
  const c = regular(); c.today = "2026-11-21"; // 週六：週日的檔是明天的，04:30 寫好可以
  assert.ok(!has(run(c), /還沒到/));
});
T("字數、畫面用「壹」、禁用字、英文字母", () => {
  expectErr(c => { c.files["2026-W47/week.json"].title = "這是壹個非常非常非常非常長的標題喔"; }, /太長了/);
  expectErr(c => { c.files["2026-W47/d1.json"].books[0].pages[0] = "警衛看了一眼。\n沒事。"; }, /用「壹」/);
  expectErr(c => { c.files["2026-W47/d1.json"].board = "總統來參觀了；書架多了 2 本書。"; }, /禁用字「總統」/);
  expectErr(c => { c.files["2026-W47/d2.json"].show.works[0].lines[0] = "牠喝著 Starbucks。"; }, /英文字母/);
  expectErr(c => { c.files["2026-W47/d2.json"].show.works[0].lines[0] = "地震的時候牠躲起來了。"; }, /禁用字「地震」/);
  expectErr(c => { c.files["2026-W47/d1.json"].books[0].pages[1] = "他寫下[[壹個字|explode]]。\n然後走了。"; }, /動作「explode」不存在/);
});
T("任務：種類要存在、每日任務做得完、不放一定要掉理智的", () => {
  expectErr(c => { c.files["2026-W47/d1.json"].daily[0].kind = "visitFriend"; }, /沒有「visitFriend」這種任務/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily[0] = { id: "d1a", kind: "view", exhibit: "strange", reward: { insp: 2 } }; }, /一定要掉理智/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily[1].need = { 顏色: "黑" }; }, /一開始就有的選項/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily[1].need = { 稀有度: "傳說級稀有" }; }, /不要指定稀有度/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily.pop(); }, /daily 要剛好 3 個/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily = [{ id: "x1", kind: "cellar", floor: 2, reward: { insp: 1 } }, { id: "x2", kind: "fuse", n: 2, reward: { insp: 1 } }, { id: "x3", kind: "show", reward: { insp: 1 } }]; }, /大約要 13 分鐘/);
  expectErr(c => { c.files["2026-W47/week.json"].weekly[0] = { id: "w1", kind: "show", reward: { insp: 2 } }; }, /不能當每週任務/);
  expectErr(c => { c.files["2026-W47/d4.json"].daily[0].book = "9z"; }, /book「9z」不是這週/);
});
T("獎勵：不超過預算、東西要存在、週章不能自己寫", () => {
  expectErr(c => { c.files["2026-W47/d1.json"].daily.forEach(t => { t.reward = { insp: 10 }; }); }, /超過預算：insp/);
  expectErr(c => { c.files["2026-W47/week.json"].weekly.forEach(t => { t.reward = { insp: 10, items: ["firstAid"] }; }); }, /超過預算/);
  expectErr(c => { c.files["2026-W47/d1.json"].dailyBonus = { items: ["傳說的金冠"] }; }, /沒有「傳說的金冠」這種東西/);
  expectErr(c => { c.files["2026-W47/d1.json"].dailyBonus = { stamps: 3 }; }, /週章由遊戲自己給/);
});
T("書：掛在存在的劇情線上、解開的條件指到存在的房間或任務", () => {
  expectErr(c => { c.files["2026-W47/d1.json"].books[0].line = "nope"; }, /line「nope」不在 lines 裡/);
  expectErr(c => { c.files["2026-W47/d1.json"].books[1].unlock = { type: "find", room: "backdoor" }; }, /不是這週到這天為止的房間/); // 那間第 3 天才出現
  expectErr(c => { c.files["2026-W47/d1.json"].books[1].unlock = { type: "task", task: "d5a" }; }, /不是這週到這天為止的任務/);
  expectErr(c => { c.files["2026-W47/d2.json"].books[0].ending = true; }, /ending 只能放在週日/);
});
T("週日收尾：沒有 ending 的書就擋（或寫 continues）", () => {
  expectErr(c => { delete c.files["2026-W47/d7.json"].books[0].ending; c.files["2026-W47/d7.json"].books[0].unlock = { type: "now" }; }, /週日要有一本 ending/);
  const c = regular(); delete c.files["2026-W47/d7.json"].books[0].ending; c.files["2026-W47/d7.json"].books[0].unlock = { type: "now" }; c.files["2026-W47/week.json"].continues = "2026-W48";
  assert.ok(!has(run(c), /週日要有/));
});
T("結局要讀的本數：新玩家讀得到才行", () => {
  expectErr(c => { c.files["2026-W47/week.json"].ending.need.read = 11; }, /新玩家打不開結局/);
});
T("今日特展：畫法、效果、理智檢定成功要不扣", () => {
  expectErr(c => { c.files["2026-W47/d1.json"].show.works[0].art = "pepe"; }, /art 只能是/);
  expectErr(c => { c.files["2026-W47/d1.json"].show.works[0].fx = ["explode"]; }, /fx「explode」不存在/);
  expectErr(c => { c.files["2026-W47/d1.json"].show.works[0].pick = { 顏色: "藍" }; }, /不是手作坊的選項/);
  expectErr(c => { c.files["2026-W47/d2.json"].show.works[3].san = "1/1D4"; }, /成功要不扣/);
  expectErr(c => { c.files["2026-W47/d2.json"].show.works[3].san = "0/1D20"; }, /失敗最多扣/);
  expectErr(c => { c.files["2026-W47/d1.json"].show.works = c.files["2026-W47/d1.json"].show.works.slice(0, 2); }, /works 要 3～5 幅/);
});
T("房間：強度門檻照樓層、下一步的字照規矩", () => {
  expectErr(c => { c.files["2026-W47/d3.json"].adds[0].choices[1].check.target = 20; }, /B1 的強度門檻要在 11～13/);
  expectErr(c => { c.files["2026-W47/d3.json"].adds[0].hint = "門後面有壹本登記簿"; }, /寫成「去 B1 …」/);
  expectErr(c => { c.files["2026-W47/d3.json"].adds[0].floor = 9; }, /floor 要是 1～5/);
});
T("兌換所上架 shop（決定 0032）：照週號輪流可以不寫；寫了只能挑已經畫好的、不重複、不超過上限", () => {
  const ok = regular(); ok.files["2026-W47/week.json"].shop = ["hat-rain", "hat-muff"];
  assert.deepStrictEqual(run(ok).errors, []);
  expectErr(c => { c.files["2026-W47/week.json"].shop = ["傳說的金冠"]; }, /不是兌換所賣的限定頭飾/);
  expectErr(c => { c.files["2026-W47/week.json"].shop = ["stand-velvet"]; }, /不是兌換所賣的限定頭飾/); // 簽到的東西不賣
  expectErr(c => { c.files["2026-W47/week.json"].shop = ["hat-rain", "hat-rain"]; }, /有重複的 id/);
  expectErr(c => { c.files["2026-W47/week.json"].shop = ["hat-rain", "hat-chef", "hat-muff", "hat-miner", "hat-bow"]; }, /最多指定 4 件/);
  expectErr(c => { c.files["2026-W47/week.json"].shop = "hat-rain"; }, /要寫成 id 的陣列/);
  expectErr(c => { c.files["2026-W47/week.json"].shop = []; }, /要寫成 id 的陣列/);
});
T("房間獎勵的技能成長（決定 0032）：只有房間可以、技能要存在、不能有不用挑戰的選項、一週有上限", () => {
  // 底：把一間房間的 none 選項拿掉，獎勵寫技能成長
  const room = c => { const r = c.files["2026-W47/d3.json"].adds[0]; r.choices = r.choices.filter(x => x.check.type !== "none"); r.reward = { skill: "偵查" }; return r; };
  const ok = regular(); room(ok);
  assert.deepStrictEqual(run(ok).errors, []);
  const anomalyOk = regular(); { const r = anomalyOk.files["2026-W47/week.json"].anomaly.room; r.choices = r.choices.filter(x => x.check.type !== "none"); r.reward = { insp: 2, skill: "鑑賞" }; }
  assert.deepStrictEqual(run(anomalyOk).errors, [], "本週異狀的房間也可以");
  expectErr(c => { room(c).reward = { skill: "打字" }; }, /沒有「打字」這個技能/);
  expectErr(c => { const r = c.files["2026-W47/d3.json"].adds[0]; r.reward = { skill: "偵查" }; r.choices[0].check = { type: "none" }; }, /不能有 check.type none/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily[0].reward = { skill: "偵查" }; }, /技能成長只能放在房間/);
  expectErr(c => { c.files["2026-W47/d1.json"].dailyBonus = { skill: "偵查" }; }, /技能成長只能放在房間/);
  expectErr(c => { c.files["2026-W47/week.json"].weeklyBonus = { skill: "偵查" }; }, /技能成長只能放在房間/);
  // 一天最多一間（預算）；一週最多 NUM.shop.weekSkillRooms 間
  const copy = (c, n, id) => { const r = clone(c.files["2026-W47/d3.json"].adds[0]); r.id = id; c.files[`2026-W47/d${n}.json`].adds.push(r); return r; };
  expectErr(c => { room(c); copy(c, 3, "extra-a"); }, /超過預算：skills/);
  expectErr(c => { room(c); copy(c, 5, "extra-b"); copy(c, 6, "extra-c"); }, /間房間給技能成長，最多/);
});
T("id 一週裡不能重複", () => {
  expectErr(c => { c.files["2026-W47/d2.json"].books[0].id = "1a"; }, /id「1a」這週用過了/);
});
T("帳本：每條線都要在帳本裡、名字一樣；每週要寫主線推到哪", () => {
  expectErr(c => { c.ledger.lines = c.ledger.lines.filter(l => l.id !== "w47-lost"); }, /不在帳本裡/);
  expectErr(c => { c.ledger.lines.find(l => l.id === "w47-door").name = "別的名字"; }, /名字跟帳本不一樣/);
  expectErr(c => { delete c.ledger.weeks["2026-W47"].main; }, /主線推到哪/);
  expectErr(c => { c.files["2026-W47/week.json"].lines.push({ id: "lost", name: "失物招領", kind: "week" }); }, /在 備用\/常青1 用過了/);
});
T("帳本：到期還沒收的伏筆只是警告", () => {
  const c = regular(); c.today = "2026-11-30";
  const r = run(c);
  assert.ok(r.warnings.some(w => /f-backdoor/.test(w) && /到期了還沒收/.test(w)), r.warnings.join("\n"));
  c.ledger.foreshadow.find(f => f.id === "f-backdoor").closed = true;
  assert.ok(!run(c).warnings.some(w => /f-backdoor/.test(w)));
});
T("備用週不放主線；備用的一天不加房間、不放 side 以外的線", () => {
  expectErr(c => { c.files["備用/常青1/week.json"].lines.push({ id: "main-s1", name: "第壹季　帳對不上", kind: "main" }); }, /備用週不放主線/);
  expectErr(c => { c.files["備用/一天/插曲1.json"].lines[0].kind = "week"; }, /只放 kind side/);
  expectErr(c => { c.files["備用/一天/插曲2.json"].adds = clone(c.files["2026-W47/d3.json"].adds); }, /備用的一天不加房間/);
});
T("排程設定：pause 要是 true／false", () => {
  expectErr(c => { c.settings.pause = "yes"; }, /pause 要是 true 或 false/);
  expectErr(c => { c.settings.pauseWeeks = ["下週"]; }, /pauseWeeks/);
});
// ---------- 季節線、主旨（決定 0037） ----------
const WINTER = "season-2026-winter";
// W47 宣告季節線、d2 放一本；帳本的冬天那條線，第 2 章改到 W47
function withSeason(c, o = {}) {
  c.files["2026-W47/week.json"].lines.push({ id: WINTER, name: "冬天的明信片", kind: "season" });
  if (o.book !== false) { const d = c.files["2026-W47/d2.json"]; d.books = d.books.slice(0, 1).concat([{ id: "sea1", line: WINTER, title: "明信片", spine: "明信片", unlock: { type: "now" }, pages: ["壹", "貳"] }]); }
  const s = c.ledger.seasonal.lines.find(l => l.id === WINTER);
  s.chapters = [{ week: "2026-W47", title: "測試的章", tell: ["壹"], ties: ["f-page"], written: o.book === false ? null : "2026-W47/sea1" }];
  c.ledger.weeks["2026-W47"].ties = ["f-page"];
  return c;
}
const warned = (c, re) => run(c).warnings.some(w => re.test(w));
T("季節線：種類合法、跨週用同一個 id；名字和種類要跟帳本一樣", () => {
  const c = withSeason(regular()), r = run(c);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(!warned(c, /還沒放書/));
  assert.ok(!warned(c, /written/));
  expectErr(k => { withSeason(k); k.files["2026-W47/week.json"].lines.find(l => l.id === WINTER).name = "別的名字"; }, /名字跟帳本不一樣/);
  expectErr(k => { withSeason(k); k.ledger.lines.find(l => l.id === WINTER).kind = "week"; }, /種類跟帳本不一樣/);
  expectErr(k => { withSeason(k); k.ledger.seasonal.lines.find(l => l.id === WINTER).name = "別的名字"; }, /要跟帳本的 lines 一樣/);
  expectErr(k => { k.files["備用/常青1/week.json"].lines.push({ id: WINTER, name: "冬天的明信片", kind: "season" }); }, /備用週不放主線、季節/);
});
T("季節線：這週帳本有章卻沒放書：週日才警告，不擋", () => {
  const sun = withSeason(regular(), { book: false });
  const r = run(sun);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /到週日還沒放書/.test(w)), r.warnings.join("\n"));
  const mid = withSeason(regular(), { book: false });
  mid.today = "2026-11-18"; // 週三，只寫到 d3
  [4, 5, 6, 7].forEach(n => delete mid.files[`2026-W47/d${n}.json`]);
  assert.ok(!warned(mid, /2026-W47 有季節線的章/), "週三還不用警告");
  const nofolder = regular();
  nofolder.ledger.seasonal.lines.find(l => l.id === WINTER).chapters = [{ week: "2026-W48", title: "用備用週那週", tell: ["壹"], ties: ["f-page"], written: null }];
  nofolder.today = "2026-11-30";
  assert.ok(warned(nofolder, /2026-W48 有季節線的章/), "那週用備用週也要提醒");
});
T("季節線：放了書帳本沒標 written、章在別的季：警告", () => {
  const c = withSeason(regular());
  c.ledger.seasonal.lines.find(l => l.id === WINTER).chapters[0].written = null;
  assert.ok(warned(c, /written 還沒標/));
  const d = withSeason(regular());
  d.ledger.seasonal.lines.find(l => l.id === WINTER).chapters.push({ week: "2027-W20", title: "夏天的章", tell: ["壹"], ties: ["x"], written: null });
  assert.ok(warned(d, /不在冬天/));
  const e = regular();
  e.ledger.seasonal.lines.find(l => l.id === WINTER).chapters = [{ week: "2027-W05", title: "跨在換季那週", tell: ["壹"], ties: ["x"], written: null }];
  assert.ok(!warned(e, /不在冬天/), "週一還是冬天");
  e.ledger.seasonal.lines[1].chapters = [{ week: "2027-W05", title: "除夕", tell: ["壹"], ties: ["x"], written: null }];
  assert.ok(!warned(e, /不在春天/), "除夕那週已經過立春：放春天也可以");
});
T("季節線的書不算進結局要讀的本數", () => {
  const c = withSeason(regular());
  // 常青1 不用走到 B2 以下就讀得到的是 9 本；加一本季節線也不會變 10
  c.files["2026-W47/week.json"].ending.need.read = 10;
  assert.ok(has(run(c), /新玩家打不開結局/));
});
T("主旨：帳本沒有 main.theme 就擋；沒有 ties 只警告", () => {
  expectErr(c => { delete c.ledger.main.theme; }, /main\.theme/);
  expectErr(c => { c.ledger.main.theme = "  "; }, /main\.theme/);
  const a = regular();
  assert.deepStrictEqual(run(a).errors, []);
  assert.ok(warned(a, /2026-W47.*沒有 ties/), "這週沒寫 ties");
  a.ledger.weeks["2026-W47"].ties = ["f-page"];
  assert.ok(!warned(a, /2026-W47：帳本的 weeks 裡沒有 ties/));
  const b = withSeason(regular());
  delete b.ledger.seasonal.lines.find(l => l.id === WINTER).chapters[0].ties;
  const r = run(b);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /沒有 ties：季節線是副劇情/.test(w)));
  expectErr(c => { c.ledger.weeks["2026-W47"].main = ""; }, /主線推到哪/);
});
T("舊帳本沒有 seasonal 照常", () => {
  const c = regular();
  delete c.ledger.seasonal;
  c.ledger.lines = c.ledger.lines.filter(l => l.kind !== "season");
  assert.deepStrictEqual(run(c).errors, []);
});
T("新聞的界線：館內選舉、投票、兩岸可以寫；真實的政黨、人名擋", () => {
  const ok = regular();
  ok.files["2026-W47/d1.json"].board = "展品們投票選館長，選票不夠；書架多了 2 本書。";
  ok.files["2026-W47/d1.json"].books[0].pages[0] = "館內選舉開始了。\n兩岸的展廳都寄了信。";
  assert.ok(!has(run(ok), /禁用字/), run(ok).errors.join("\n"));
  expectErr(c => { c.files["2026-W47/d1.json"].board = "民進黨來參觀了；書架多了 2 本書。"; }, /禁用字「民進黨」/);
  expectErr(c => { c.files["2026-W47/d1.json"].board = "國民黨來參觀了；書架多了 2 本書。"; }, /禁用字「國民黨」/);
  expectErr(c => { c.files["2026-W47/d1.json"].board = "賴清德來參觀了；書架多了 2 本書。"; }, /禁用字「賴清德」/);
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
