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
T("今天的現實世界 real：最多 3 則、50 字、照新聞的禁用字；備用的一天不能寫", () => {
  const good = regular(); good.files["2026-W47/d2.json"].real = ["台北市立美術館有壹個光影展。", "宜蘭海邊有壹場風箏節。"];
  assert.deepStrictEqual(run(good).errors, []);
  expectErr(c => { c.files["2026-W47/d2.json"].real = "台北有展覽"; }, /real.*陣列/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["壹", "貳", "參", "肆"]; }, /最多 3 則/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["壹".repeat(51)]; }, /太長了/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = [""]; }, /要有字/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = [3]; }, /要有字/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["總統出席了開幕。"]; }, /禁用字「總統」/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["現場發生車禍。"]; }, /禁用字「車禍」/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["在 Taipei 有展覽。"]; }, /英文字母/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["今天有一場展覽。"]; }, /用「壹」/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["展覽網址 http://x.tw"]; }, /英文字母|連結/);
  expectErr(c => { c.files["2026-W47/d2.json"].real = ["壹樣的", "壹樣的"]; }, /重複/);
  expectErr(c => { c.files["備用/一天/插曲1.json"].real = ["台北有展覽。"]; }, /備用的一天不能寫 real/);
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
// ---------- 今日特展的新畫（works[].svg） ----------
const DRAW = "<svg viewBox='0 0 240 300'><rect width='240' height='300' fill='#222'/></svg>";
const withSvg = (c, svg) => { const w = c.files["2026-W47/d1.json"].show.works[1]; delete w.art; delete w.variant; w.svg = svg; return c; };
T("新畫：用 svg 畫的過得了；跟舊畫混著；art 和 svg 只能寫一個", () => {
  assert.deepStrictEqual(run(withSvg(regular(), DRAW)).errors, []);
  assert.deepStrictEqual(run(withSvg(regular(), [DRAW.slice(0, 30), DRAW.slice(30)])).errors, [], "字串的陣列也可以");
  expectErr(c => { withSvg(c, DRAW); c.files["2026-W47/d1.json"].show.works[1].art = "portrait"; }, /art 和 svg 只能寫一個/);
  expectErr(c => { delete c.files["2026-W47/d1.json"].show.works[1].svg; }, /art 只能是/);
});
T("新畫：擋 script、foreignObject、image、on 事件、外部網址、style、太大、沒有 viewBox", () => {
  const X = s => "<svg viewBox='0 0 1 1'>" + s + "</svg>";
  expectErr(c => withSvg(c, X("<script>alert(1)</script>")), /不准用 <script>/);
  expectErr(c => withSvg(c, X("<foreignObject/>")), /不准用 <foreignObject>/);
  expectErr(c => withSvg(c, X("<image href='a.png'/>")), /不准用 <image>/);
  expectErr(c => withSvg(c, X("<a href='#b'/>")), /不准用 <a>/);
  expectErr(c => withSvg(c, X("<rect onclick='x()'/>")), /不准用事件屬性 onclick/);
  expectErr(c => withSvg(c, X("<use href='https://x.y/z#a'/>")), /不能連到外面/);
  expectErr(c => withSvg(c, X("<rect fill='url(http://x.y/z)'/>")), /不能連到外面/);
  expectErr(c => withSvg(c, X("<rect style='fill:red'/>")), /不准用 style/);
  expectErr(c => withSvg(c, X("<rect/>".repeat(3000))), /太大了/);
  expectErr(c => withSvg(c, "<svg><rect/></svg>"), /要有 viewBox/);
});
T("新畫：畫裡的字也算遊戲文字（壹、禁用字、英文字母）", () => {
  const X = s => "<svg viewBox='0 0 1 1'><text>" + s + "</text></svg>";
  assert.deepStrictEqual(run(withSvg(regular(), X("待領壹張"))).errors, []);
  expectErr(c => withSvg(c, X("待領一張")), /用「壹」/);
  expectErr(c => withSvg(c, X("民進黨")), /禁用字「民進黨」/);
  expectErr(c => withSvg(c, X("Pepe")), /英文字母/);
});
T("新畫：正式週那天一幅新畫都沒有：警告（不擋）；11-09 已經上線的不算", () => {
  const c = regular();
  const r = run(c);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /2026-W47\/d2\.json\.show：今天的特展沒有新畫/.test(w)), r.warnings.join("\n"));
  assert.ok(!r.warnings.some(w => /2026-W47\/d1\.json\.show：今天的特展沒有新畫/.test(w)), "d1 複製的那幅有新畫");
});
T("禁用字：戰爭、宗教這些拿掉了；中共、解放軍留著", () => {
  const ok = regular();
  ok.files["2026-W47/d1.json"].books[0].pages[0] = "展品們的戰爭，用抱枕打。\n宗教、軍隊、飛彈都是紙糊的。";
  assert.ok(!has(run(ok), /禁用字/), run(ok).errors.join("\n"));
  expectErr(c => { c.files["2026-W47/d1.json"].board = "中共來參觀了；書架多了 2 本書。"; }, /禁用字「中共」/);
  expectErr(c => { c.files["2026-W47/d1.json"].board = "解放軍來參觀了；書架多了 2 本書。"; }, /禁用字「解放軍」/);
});
// ---------- 限時活動（決定 0041） ----------
const EV1 = { id: "e1", kind: "coopBoost", date: "2026-11-18", from: "20:00", to: "22:00", title: "招領夜", words: "邀館友壹起下去翻箱底。" };
const withEvents = (...evs) => { const c = regular(); c.files["2026-W47/week.json"].events = evs.map(clone); return c; };
T("活動：寫對的過；沒有 events 的週照常（舊週）", () => {
  assert.deepStrictEqual(run(withEvents(EV1, Object.assign({}, EV1, { id: "e2", kind: "trialBoost", date: "2026-11-21", from: "14:00", to: "16:00" }))).errors, []);
  assert.deepStrictEqual(run(regular()).errors, []);
});
T("活動：日期不在這週、日期壞掉、時間格式、from 晚於 to、早於 05:00、太短太長", () => {
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { date: "2026-11-23" })]; }, /這週之內/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { date: "2026-11-08" })]; }, /這週之內/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { date: "明天" })]; }, /date/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { from: "8pm" })]; }, /from 要寫成/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { to: "26:00" })]; }, /to 要寫成/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { from: "22:00", to: "20:00" })]; }, /晚於 from/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { from: "03:00", to: "06:00" })]; }, /早於 05:00/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { from: "20:00", to: "20:10" })]; }, /太短/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { from: "06:00", to: "23:00" })]; }, /太長/);
});
T("活動：kind 不認得、id 重複、同一天重疊、一週太多場、不是陣列、備用週不能寫", () => {
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { kind: "doubleXp" })]; }, /kind 只能是/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [EV1, Object.assign({}, EV1, { from: "10:00", to: "11:00" })]; }, /id「e1」重複/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [EV1, Object.assign({}, EV1, { id: "e2", from: "21:00", to: "23:00" })]; }, /重疊/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [1, 2, 3, 4].map(i => Object.assign({}, EV1, { id: "e" + i, from: `1${i}:00`, to: `1${i}:30` })); }, /一週最多/);
  expectErr(c => { c.files["2026-W47/week.json"].events = EV1; }, /要寫成陣列/);
  expectErr(c => { c.files["備用/常青1/week.json"].events = [EV1]; }, /備用週不寫 events/);
});
T("活動：名字、文字長度、畫面用「壹」、禁用字、英文字母", () => {
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { title: "這個名字太長了太長了太長了太長了太長了" })]; }, /title 太長/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { words: "字".repeat(80) })]; }, /words 太長/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { words: "一起下去翻箱底。" })]; }, /用「壹」/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { title: "總統來參觀" })]; }, /禁用字「總統」/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { words: "Come and see" })]; }, /英文字母/);
  expectErr(c => { c.files["2026-W47/week.json"].events = [Object.assign({}, EV1, { title: "" })]; }, /title 要有字/);
});
// ---------- 賭場的每週收藏（決定 0042） ----------
const CAS = () => regular().files["2026-W47/week.json"].casino;
const casW = mutate => { const c = regular(); mutate(c.files["2026-W47/week.json"].casino, c); return c; };
T("賭場收藏：寫對的過；沒有 casino 的舊週照常；複製的備用週帶著 casino 也過", () => {
  assert.ok(CAS() && CAS().items.length >= 3);
  const c = regular(); delete c.files["2026-W47/week.json"].casino;
  assert.deepStrictEqual(run(c).errors, []);
  assert.ok(!run(regular()).errors.length);
});
T("賭場收藏：件數 3～5、條件要認得、n 的範圍、meal 要指是哪樣、id 不重複", () => {
  expectErr(c => { c.files["2026-W47/week.json"].casino.items = c.files["2026-W47/week.json"].casino.items.slice(0, 2); }, /要 3～5 件/);
  expectErr(c => { const it = c.files["2026-W47/week.json"].casino.items; while (it.length < 6) it.push(Object.assign(clone(it[0]), { id: "z" + it.length })); }, /要 3～5 件/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = { type: "lottery", n: 1 }; }, /when.type 只能是/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = { type: "wins", n: 0 }; }, /when.n 要是/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = { type: "wins", n: 999 }; }, /when.n 要是/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = { type: "meal", n: 1 }; }, /when.meal/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = { type: "meal", meal: "ticket1", n: 1 }; }, /when.meal/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].when = "贏三手"; }, /when 要寫成/);
  expectErr(c => { const it = c.files["2026-W47/week.json"].casino.items; it[1].id = it[0].id; }, /用過了/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].id = "壞 id"; }, /id 只能用/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].reward = { insp: 50 }; }, /不認得「reward」/);
});
T("賭場收藏：字數、「壹」、英文字母、禁用字", () => {
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].name = "名字長到超過十二個字的收藏品"; }, /name.*太長/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].desc = "字".repeat(60); }, /desc.*太長/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].desc = "一條圍巾。"; }, /用「壹」/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].name = "Casino"; }, /英文字母/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.items[0].desc = "掛在炸彈旁邊。"; }, /禁用字/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.title = ""; }, /要有字/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.intro = "字".repeat(70); }, /intro.*太長/);
});
T("賭場收藏：集滿的獎勵要有稱號、紀念品、小故事；不能自己寫靈感、週章；故事頁數和字數", () => {
  expectErr(c => { delete c.files["2026-W47/week.json"].casino.reward; }, /reward.*要寫成/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.insp = 50; }, /不認得「insp」/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.stamps = 5; }, /不認得「stamps」/);
  expectErr(c => { delete c.files["2026-W47/week.json"].casino.reward.souvenir; }, /souvenir.*要寫成/);
  expectErr(c => { delete c.files["2026-W47/week.json"].casino.reward.story; }, /story.*要寫成/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.story.pages = []; }, /要 1～3 頁/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.story.pages = ["壹", "壹", "壹", "壹"]; }, /要 1～3 頁/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.story.pages = ["字".repeat(130)]; }, /pages\[0\].*太長/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.title = "名字長到超過十二個字的稱號稱號"; }, /reward.title.*太長/);
  expectErr(c => { c.files["2026-W47/week.json"].casino.reward.souvenir.name = ""; }, /souvenir.name/);
});
T("賭場收藏：每天加一件或多一段話；加碼的 id 不能跟這週的重複；備用的一天不能放", () => {
  const ok = regular(); ok.files["2026-W47/d3.json"].casino = { note: "今天多壹段話。", item: { id: "extra3", name: "加碼的收藏", desc: "第 3 天多的壹件。", when: { type: "hands", n: 4 } } };
  assert.deepStrictEqual(run(ok).errors, []);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = { note: "字".repeat(60) }; }, /note.*太長/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = { item: { id: c.files["2026-W47/week.json"].casino.items[0].id, name: "重複", desc: "重複的 id。", when: { type: "hands", n: 4 } } }; }, /用過了/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = { item: { id: "x", name: "壞條件", desc: "條件壞掉。", when: { type: "wins", n: 99 } } }; }, /when.n/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = {}; }, /item 或 note/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = { note: "一段話。" }; }, /用「壹」/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = { note: "好", bonus: 1 }; }, /不認得「bonus」/);
  expectErr(c => { c.files["2026-W47/d3.json"].casino = 5; }, /要寫成/);
  expectErr(c => { delete c.files["2026-W47/week.json"].casino; c.files["2026-W47/d3.json"].casino = { note: "沒有主段。" }; }, /week.json 沒有 casino/);
  const spare = Object.keys(base.files).find(k => /^備用\/一天\//.test(k));
  expectErr(c => { c.files[spare].casino = { note: "備用的一天不放。" }; }, /備用的一天不放賭場/);
});
T("賭場收藏：帳本的 weeks 沒寫 casino 只警告（不擋）", () => {
  const c = regular(); const r = run(c);
  assert.ok(r.warnings.some(w => /沒有 casino/.test(w)));
  c.ledger.weeks["2026-W47"].casino = ["接 w47-lost：賭場的招領櫃檯"];
  assert.ok(!run(c).warnings.some(w => /沒有 casino/.test(w)));
  const none = regular(); delete none.files["2026-W47/week.json"].casino;
  assert.ok(!run(none).warnings.some(w => /沒有 casino/.test(w)), "這週沒有收藏就不提醒");
});
T("賭場收藏：casino.line 要在這週的 lines 裡；沒寫 line 的正式週只警告；賭場活動 casinoBoost 認得", () => {
  expectErr(c => { c.files["2026-W47/week.json"].casino.line = "不存在的線"; }, /不在這週的 lines/);
  const c = regular(); const r = run(c);
  assert.ok(r.warnings.some(w => /沒有 line/.test(w)));
  c.files["2026-W47/week.json"].casino.line = "w47-lost";
  assert.ok(!run(c).warnings.some(w => /沒有 line/.test(w)));
  assert.deepStrictEqual(run(c).errors, []);
  c.files["2026-W47/week.json"].events = [{ id: "cn", kind: "casinoBoost", date: "2026-11-18", from: "20:00", to: "22:00", title: "招領櫃檯夜", words: "賭場多開壹個小窗口。" }];
  assert.deepStrictEqual(run(c).errors, []);
});
// ---------- 線索和看懂（shared/clues.js） ----------
const withClues = c => {
  c.files["2026-W47/d1.json"].books[0].clue = "c-hand-one";

  c.files["2026-W47/d2.json"].show.works[0].clue = "c-work-two";
  c.files["2026-W47/d2.json"].understand = [{ id: "u-first", need: ["c-hand-one", "c-work-two"], from: "招領箱的帳", text: "他沒有離開。", hint: "還有壹條在畫廊" }];
  return c;
};
T("線索和看懂：寫對的過；備用週、舊內容不受影響", () => {
  assert.deepStrictEqual(run(withClues(regular())).errors, []);
});
T("線索：id 格式、重複、放錯地方、備用週都擋", () => {
  expectErr(c => { c.files["2026-W47/d1.json"].books[0].clue = "線索壹"; }, /clue「線索壹」寫法不對/);
  expectErr(c => { c.files["2026-W47/d1.json"].books[0].clue = "C-Big"; }, /寫法不對/);
  expectErr(c => { withClues(c); c.files["2026-W47/d3.json"].books[0].clue = "c-hand-one"; }, /已經用在/);
  expectErr(c => { c.files["2026-W47/d1.json"].daily[0].clue = "c-daily"; }, /每日任務的 clue 遊戲還不會算/);
  expectErr(c => { c.files["2026-W47/d1.json"].casino = { note: "賭場今天很安靜。", clue: "c-casino" }; }, /賭場的 clue 遊戲還不會算/);
  expectErr(c => { c.files["備用/常青1/d1.json"].books[0].clue = "c-spare"; }, /備用週不能寫 clue/);
  expectErr(c => { const k = Object.keys(c.files).find(x => x.startsWith("備用/一天/")); c.files[k].books[0].clue = "c-spare"; }, /備用的一天不能寫 clue/);
});
T("看懂：id、need、text、from、hint 的格式", () => {
  const u = c => c.files["2026-W47/d2.json"].understand[0];
  expectErr(c => { withClues(c); u(c).id = "壹"; }, /id「壹」寫法不對/);
  expectErr(c => { withClues(c); u(c).id = "book1"; }, /寫法不對/);
  expectErr(c => { withClues(c); u(c).need = []; }, /need/);
  expectErr(c => { withClues(c); delete u(c).need; }, /need/);
  expectErr(c => { withClues(c); u(c).need = ["c-hand-one", "c-hand-one"]; }, /有重複的線索/);
  expectErr(c => { withClues(c); delete u(c).hint; }, /hint/);
  expectErr(c => { withClues(c); delete u(c).from; }, /from/);
  expectErr(c => { withClues(c); u(c).text = "他沒有離開。".repeat(20); }, /太長/);
  expectErr(c => { withClues(c); u(c).text = "你看懂了：他沒有離開。"; }, /不用寫「你看懂了：」/);
  expectErr(c => { withClues(c); u(c).text = "那是一個人。"; }, /用「壹」/);
  expectErr(c => { withClues(c); u(c).text = "總統來了。"; }, /禁用字/);
  expectErr(c => { withClues(c); u(c).hint = "look here"; }, /英文字母/);
  expectErr(c => { withClues(c); c.files["2026-W47/d2.json"].understand.push(clone(u(c)), clone(u(c))); }, /壹天最多/);
  expectErr(c => { withClues(c); c.files["2026-W47/d3.json"].understand = [clone(u(c))]; }, /已經用在/);
});
T("看懂：need 的線索要在同一天或更早，找不到、還沒出現都擋", () => {
  expectErr(c => { withClues(c); c.files["2026-W47/d2.json"].understand[0].need = ["c-nowhere"]; }, /線索「c-nowhere」找不到/);
  expectErr(c => { withClues(c); c.files["2026-W47/d1.json"].understand = [clone(c.files["2026-W47/d2.json"].understand[0])]; delete c.files["2026-W47/d2.json"].understand; }, /要到 .* 才出現，還沒到/);
  const c = withClues(regular()); // 同一天也可以
  c.files["2026-W47/d2.json"].books[0].clue = "c-same-day"; c.files["2026-W47/d2.json"].understand[0].need = ["c-hand-one", "c-same-day"];
  assert.deepStrictEqual(run(c).errors, []);
});
T("帳本 mysteries：closeBy 過了還沒收要警告，收了就不警告，答案不印出來", () => {
  const c = regular();
  c.ledger.mysteries = { list: [{ id: "m-test", q: "測試", closeBy: "2026-W46", status: "open", truth: "測試用的謎底不能出現在輸出", clues: [] }, { id: "m-done", q: "收了", closeBy: "2026-W46", status: "closed" }, { id: "m-later", q: "還沒到", closeBy: "2027-W20", status: "open" }] };
  const r = run(c);
  assert.ok(r.warnings.some(w => /m-test.*到期了還沒收/.test(w)));
  assert.ok(!r.warnings.some(w => /m-done|m-later/.test(w)));
  assert.ok(!JSON.stringify(r).includes("測試用的謎底"));
});

// ---------- Yuga Bot 交代的任務（giver、says、done） ----------
const giver = (extra, day = 3, idx = 0) => c => { Object.assign(c.files[`2026-W47/d${day}.json`].daily[idx], { giver: "yuga", says: "R，我剛想到壹件事。B2 那邊你幫我數壹下。" }, extra || {}); };
T("Yuga 交代的任務：寫對的過（R 可以寫，done 選填）", () => {
  const c = regular(); giver({ done: "R。我就知道。" })(c);
  const r = run(c); assert.deepStrictEqual(r.errors, []);
});
T("Yuga 交代的任務：giver 只能是 yuga", () => expectErr(giver({ giver: "boss" }), /giver 只能是/));
T("Yuga 交代的任務：says 必填", () => expectErr(giver({ says: undefined }), /says.*要有字/));
T("Yuga 交代的任務：says 太長（超過 40 字）", () => expectErr(giver({ says: "壹".repeat(41) }), /says.*太長/));
T("Yuga 交代的任務：done 太長", () => expectErr(giver({ done: "壹".repeat(41) }), /done.*太長/));
T("Yuga 交代的任務：says 的「一」要寫「壹」", () => expectErr(giver({ says: "R，我想到一件事。" }), /says.*壹/));
T("Yuga 交代的任務：done 的「一」要寫「壹」", () => expectErr(giver({ done: "R，一下就好。" }), /done.*壹/));
T("Yuga 交代的任務：禁用字", () => expectErr(giver({ says: "R，總統來過。" }), /says.*禁用字/));
T("Yuga 交代的任務：R 以外的英文字母擋", () => expectErr(giver({ says: "R，叫 Pepe 來。" }), /says.*英文字母/));
T("Yuga 交代的任務：一天最多一個", () => expectErr(c => { giver()(c); giver({}, 3, 1)(c); }, /壹天最多壹個/));
T("Yuga 交代的任務：只有 says／done 沒有 giver 會擋", () => expectErr(c => { c.files["2026-W47/d3.json"].daily[0].says = "R，測試。"; }, /要寫 giver/));
T("Yuga 交代的任務：備用週不能放", () => {
  const c = regular(); Object.assign(c.files["備用/常青1/d2.json"].daily[0], { giver: "yuga", says: "R，測試。" });
  assert.ok(has(run(c), /備用週、備用的壹天不能讓 Yuga Bot 交任務/));
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
