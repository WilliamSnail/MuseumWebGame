// 每日簽到、每週全簽到、節日（shared/signin.js、shared/holidays.js，決定 0030）：node test/signin.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } finally { G.setNowClock(null); G.setRng(null); } };
const J = x => JSON.parse(JSON.stringify(x));
const tw = s => Date.parse(s + "+08:00"); // 台灣時間 → 毫秒
// 一間新的博物館（挑戰模式）＋一份新的存檔
const fresh = (G, date = "2026-11-09") => {
  const save = G.newSave();
  const P = save.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, date);
  return { save, P };
};
const signDays = (G, save, P, dates) => dates.map(d => { G.ensureDay(P, d); return G.signIn(save, P, d); });
const range = (G, from, n) => Array.from({ length: n }, (_, i) => G.addDays(from, i));
const S = G => G.NUM.signin;

T("簽到：一天只能一次；靈感給博物館、心情給現在這位", G => {
  const { save, P } = fresh(G);
  const i0 = P.insp; P.mood = 40;
  const r = G.signIn(save, P, "2026-11-09");
  assert.ok(r.ok);
  assert.strictEqual(r.n, 1); assert.strictEqual(r.k, 1);
  assert.strictEqual(P.insp, i0 + (S(G).cycle[0].insp || 0));
  assert.strictEqual(P.mood, 40 + (S(G).cycle[0].mood || 0));
  const again = G.signIn(save, P, "2026-11-09");
  assert.strictEqual(again.ok, false); assert.strictEqual(again.already, true);
  assert.strictEqual(save.signin.count, 1);
  assert.strictEqual(G.signedOn(save, "2026-11-09"), true);
  assert.strictEqual(G.signedOn(save, "2026-11-10"), false);
});
T("簽到：台灣時間 05:00 換日（04:59 還是前一天）", G => {
  const { save, P } = fresh(G, "2026-11-09");
  G.setNowClock(() => tw("2026-11-10T04:59:00"));
  const d1 = G.todayStr();
  assert.strictEqual(d1, "2026-11-09");
  assert.ok(G.signIn(save, P, d1).ok);
  assert.strictEqual(G.signIn(save, P, G.todayStr()).ok, false, "04:59 再簽一次：同一天");
  G.setNowClock(() => tw("2026-11-10T05:00:00"));
  const d2 = G.todayStr();
  assert.strictEqual(d2, "2026-11-10");
  G.ensureDay(P, d2);
  const r = G.signIn(save, P, d2);
  assert.ok(r.ok, "05:00 換日了，可以再簽");
  assert.strictEqual(r.n, 2);
});
T("累計第幾次七天一輪：斷掉不歸零，第 8 次回到第 1 天；第 7 次多一點", G => {
  const { save, P } = fresh(G);
  const dates = ["2026-11-09", "2026-11-10", "2026-11-13", "2026-11-20", "2026-11-21", "2026-12-01", "2026-12-05", "2026-12-06"]; // 中間斷了好幾天（都不是節日）
  const rs = signDays(G, save, P, dates);
  assert.deepStrictEqual(rs.map(r => r.k), [1, 2, 3, 4, 5, 6, 7, 1]);
  assert.deepStrictEqual(rs.map(r => r.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  const c = S(G).cycle, total = x => (x.insp || 0) + (x.mood || 0);
  assert.strictEqual(c.length, 7);
  c.slice(0, 6).forEach(x => assert.ok(total(c[6]) > total(x), "第 7 次比前 6 次都多"));
  rs.forEach(r => assert.strictEqual(r.gains.filter(g => g.why === "day" && g.kind === "insp").reduce((a, g) => a + g.n, 0), c[r.k - 1].insp || 0));
});
T("一週：週一到週日；週一 05:00 換週（週一 04:59 還算上一週）", G => {
  assert.deepStrictEqual(J(G.weekDates("2026-11-12")), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.deepStrictEqual(J(G.weekDates("2026-11-15")), J(G.weekDates("2026-11-09")), "週日跟週一同一週");
  G.setNowClock(() => tw("2026-11-16T04:59:00")); // 週一凌晨
  const a = G.todayStr();
  G.setNowClock(() => tw("2026-11-16T05:00:00"));
  const b = G.todayStr();
  assert.strictEqual(a, "2026-11-15");
  assert.strictEqual(G.weekIndex(a), G.weekIndex("2026-11-09"));
  assert.strictEqual(G.weekIndex(b), G.weekIndex("2026-11-09") + 1);
  assert.strictEqual(G.weekDates(b)[0], "2026-11-16");
});
T("全簽到：七天都簽才給這週的特別項目；少一天不給；一週只給一次", G => {
  const { save, P } = fresh(G);
  const week = range(G, "2026-11-09", 7); // 週一到週日
  const rs = signDays(G, save, P, week.slice(0, 6));
  rs.forEach(r => assert.strictEqual(r.weekly, null));
  assert.strictEqual(G.weekProgress(save, "2026-11-14").n, 6);
  assert.strictEqual(G.signPreview(save, P, "2026-11-15").willComplete, true);
  const r7 = signDays(G, save, P, [week[6]])[0];
  assert.ok(r7.weekly, "第 7 天給特別項目");
  assert.strictEqual(r7.weekly.item.id, G.weeklyItem(G.weekIndex("2026-11-09")).id);
  assert.ok(r7.gains.some(g => g.kind === "item" && g.why === "week"));
  assert.strictEqual(G.weekProgress(save, "2026-11-15").claimed.item, r7.weekly.item.id);
  assert.ok(G.ownsLimited(P, r7.weekly.item.id) || r7.weekly.item.kind === "mat");
  // 下一週少簽週三：不給
  const B = fresh(G);
  const next = range(G, "2026-11-16", 7).filter((_, i) => i !== 2);
  const rb = signDays(G, B.save, B.P, next);
  assert.ok(rb.every(r => !r.weekly), "6／7 不給");
  assert.strictEqual(G.weekProgress(B.save, "2026-11-22").n, 6);
});
T("特別項目三種每週輪流：部件 → 裝飾 → 材料，大家同一週同一個；同一種裡面也輪流", G => {
  const w0 = G.weekIndex("2026-11-09");
  const base = w0 - ((w0 % 3) + 3) % 3; // 輪到「部件」的那週
  const kinds = [0, 1, 2, 3, 4, 5].map(i => G.weeklyItem(base + i).kind);
  assert.deepStrictEqual(kinds, ["part", "deco", "mat", "part", "deco", "mat"]);
  assert.notStrictEqual(G.weeklyItem(base).id, G.weeklyItem(base + 3).id, "兩頂帽子輪流");
  assert.notStrictEqual(G.weeklyItem(base + 1).id, G.weeklyItem(base + 4).id, "展台裝飾、名牌框輪流");
  assert.strictEqual(G.weeklyItem(w0).id, G.weeklyItem(w0).id);
  const items = G.LIMITED_ITEMS;
  ["part", "deco", "mat"].forEach(k => assert.ok(items.some(x => x.kind === k), "每一種至少一件：" + k));
});
T("特別項目：帽子打開在手作坊；已經有了換成靈感；材料疊上去", G => {
  const { P } = fresh(G);
  const g = G.grantLimited(P, "hat-curator", "2026-11-15");
  assert.strictEqual(g.dup, false);
  assert.ok(G.isUnlocked(P, "帽子", "館員帽"));
  assert.ok(g.events.some(e => e.type === "unlock" && e.name === "館員帽"));
  const i0 = P.insp;
  const g2 = G.grantLimited(P, "hat-curator", "2026-12-06");
  assert.strictEqual(g2.dup, true);
  assert.strictEqual(P.insp, i0 + S(G).dupInsp);
  G.grantLimited(P, "mat-star", "2026-11-15"); G.grantLimited(P, "mat-star", "2026-11-29");
  assert.strictEqual(G.stockOf(P, "星光絨"), 2 * G.LIMITED_ITEMS.find(x => x.id === "mat-star").n);
});
T("限定的東西不算進全部解鎖、圖鑑：基本選項、格數、抱枕種類都不變", G => {
  assert.ok(!G.baseOpts("帽子").includes("館員帽"));
  assert.ok(!G.baseOpts("帽子").includes("燈籠帽"));
  assert.strictEqual(G.CORE_TOTAL, 1280);
  assert.strictEqual(G.PILLOW_TOTAL, 27);
  const { P } = fresh(G);
  assert.strictEqual(G.unlockState(P, "帽子", "館員帽").state, "limited");
  G.grantLimited(P, "hat-lantern", "2026-11-15");
  const pick = Object.assign({}, G.DEFAULT_PICK, { 帽子: "燈籠帽" });
  G.finishMake(P, pick, { natural: 50 });
  assert.strictEqual(G.codexCount(P), 0, "戴限定帽子的不算圖鑑的格子");
  assert.ok(G.describePepe(Object.assign({}, pick, { 稀有度: "普通" })).no.startsWith("限"));
  assert.deepStrictEqual(J(G.limitedCount(P)), { have: 1, total: G.LIMITED_ITEMS.length });
  // 大成功的免費解鎖不會抽到限定的
  for (let i = 0; i < 30; i++) { const Q = fresh(G).P; G.setRng(() => i / 30); G.freeUnlock(Q); assert.ok(!G.isUnlocked(Q, "帽子", "館員帽") && !G.isUnlocked(Q, "帽子", "燈籠帽")); }
});
T("星光絨：沒有就不能做；做一個用掉一份", G => {
  const { P } = fresh(G);
  P.insp = 50;
  G.finishMake(P, Object.assign({}, G.DEFAULT_PICK), { natural: 50 });
  const print = "p:" + Object.keys(P.pepes)[0];
  const pick = { 尺寸: "標準", 材質: "星光絨", 填充: "剛剛好" };
  assert.strictEqual(G.makePillow(P, pick, print).ok, false);
  G.grantLimited(P, "mat-star", "2026-11-15");
  const n = G.stockOf(P, "星光絨");
  assert.ok(G.makePillow(P, pick, print).ok);
  assert.strictEqual(G.stockOf(P, "星光絨"), n - 1);
  assert.ok(G.makePillow(P, { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, print).ok, "一般材料照舊");
  assert.strictEqual(G.stockOf(P, "星光絨"), n - 1);
});
T("馬上使用：帽子帶到手作坊選好、裝飾換上、材料帶到抱枕工作台", G => {
  const { P } = fresh(G);
  assert.deepStrictEqual(J(G.useTarget("hat-curator")), { room: "workshop", params: { preset: { 帽子: "館員帽" }, tab: "帽子" } });
  assert.deepStrictEqual(J(G.useTarget("mat-star")), { room: "pillow", params: { mat: "星光絨" } });
  assert.strictEqual(G.useTarget("stand-velvet").wear, "stand");
  assert.strictEqual(G.wearDeco(P, "stand-velvet"), false, "還沒有不能換");
  G.grantLimited(P, "stand-velvet", "2026-11-22");
  assert.strictEqual(G.wearDeco(P, "stand-velvet"), true);
  assert.strictEqual(G.wornDeco(P, "stand"), "stand-velvet");
  assert.strictEqual(G.hallView({ profiles: { challenge: P } }).deco, "stand-velvet", "館友來參觀看得到");
  G.wearDeco(P, null, "stand");
  assert.strictEqual(G.wornDeco(P, "stand"), null);
});
T("帳號一份：換參觀者不會多簽一次，簽到紀錄在存檔上", G => {
  G.setRng(G.mulberry32(7));
  const { save, P } = fresh(G);
  assert.ok(G.signIn(save, P, "2026-11-09").ok);
  const r = G.addVisitor(P, "小華", 1);
  assert.ok(r);
  assert.strictEqual(G.signIn(save, P, "2026-11-09").already, true, "換人了還是簽過");
  assert.strictEqual(save.signin.count, 1);
  assert.ok(!("signin" in P), "不在參觀者、博物館身上");
  assert.ok(!G.VISITOR_KEYS.includes("limited"), "限定的東西是博物館的，換人不跟著換");
});
T("自由模式不能簽到", G => {
  const save = G.newSave();
  const F = save.profiles.free = G.newProfile("free");
  G.ensureDay(F, "2026-11-09");
  const r = G.signIn(save, F, "2026-11-09");
  assert.strictEqual(r.ok, false); assert.strictEqual(r.free, true);
  assert.ok(G.isUnlocked(F, "帽子", "館員帽"), "自由模式什麼都打開了（跟禁忌、突變的一樣）");
  assert.strictEqual(G.stockOf(F, "星光絨"), Infinity);
});
T("節日表：已知的日期（兩個來源對過的）", G => {
  const K = d => { const h = G.holidayOf(d); return h ? h.key : null; };
  const known = {
    "2026-01-01": "newyear", "2026-02-16": "spring", "2026-02-17": "spring", "2026-02-21": "spring", "2026-03-03": "lantern", "2026-02-28": "peace",
    "2026-04-04": "children", "2026-04-05": "qingming", "2026-05-01": "labor", "2026-06-19": "duanwu", "2026-08-19": "qixi", "2026-08-27": "ghost",
    "2026-09-25": "midautumn", "2026-09-28": "teacher", "2026-10-10": "national", "2026-10-18": "chongyang", "2026-12-22": "dongzhi", "2026-12-25": "xmas", "2026-12-31": "nye",
    "2027-02-05": "spring", "2027-02-06": "spring", "2027-02-20": "lantern", "2027-04-05": "qingming", "2027-06-09": "duanwu", "2027-08-08": "qixi", "2027-08-16": "ghost",
    "2027-09-15": "midautumn", "2027-10-08": "chongyang", "2027-12-22": "dongzhi",
    "2028-01-25": "spring", "2028-01-26": "spring", "2028-02-09": "lantern", "2028-05-28": "duanwu", "2028-08-26": "qixi", "2028-09-03": "ghost", "2028-10-03": "midautumn", "2028-10-26": "chongyang", "2028-12-21": "dongzhi",
  };
  Object.entries(known).forEach(([d, k]) => assert.strictEqual(K(d), k, d));
  ["2026-02-15", "2026-02-22", "2026-09-24", "2026-09-26", "2027-02-11", "2028-06-28", "2026-11-09"].forEach(d => assert.strictEqual(K(d), null, d + " 不是節日"));
  assert.strictEqual(G.holidayOf("2026-02-16").dayName, "除夕");
  assert.strictEqual(G.holidayOf("2026-02-17").dayName, "初壹");
  assert.strictEqual(G.holidayOf("2027-02-10").dayName, "初五");
  const two = G.holidaysOn("2028-04-04").map(h => h.key);
  assert.deepStrictEqual(J(two), ["children", "qingming"], "2028-04-04 兒童節、清明節同一天");
  assert.strictEqual(G.holidayOf("2026-02-28").reward, null, "紀念日沒有獎勵");
  assert.strictEqual(G.holidayOf("2026-02-28").look, null, "紀念日不換外觀");
  // 每一個節日三年都有日子
  G.HOLIDAY_INFO.forEach(info => G.HOLIDAY_YEARS.forEach(y => assert.ok(G.holidayDates(info, y).length >= 1, info.key + " " + y)));
  // holidayOf 給之後的劇情用：名字、節日的話、藝術品
  const h = G.holidayOf("2026-09-25");
  assert.ok(h.name && h.words && h.art.length === 2 && h.art.every(a => a.title && a.lines.length));
});
T("節日獎勵：節日那天簽到多一份（靈感、心情、星光絨）；紀念日沒有", G => {
  const { save, P } = fresh(G, "2026-09-25");
  P.mood = 30;
  const i0 = P.insp, R = S(G).holiday;
  const r = G.signIn(save, P, "2026-09-25");
  assert.strictEqual(r.holiday.key, "midautumn");
  assert.strictEqual(P.insp, i0 + (S(G).cycle[0].insp || 0) + R.insp);
  assert.strictEqual(P.mood, 30 + (S(G).cycle[0].mood || 0) + R.mood);
  assert.strictEqual(G.stockOf(P, "星光絨"), R.mat);
  assert.strictEqual(save.signin.days["2026-09-25"].hol, "midautumn");
  const B = fresh(G, "2026-02-28");
  const j0 = B.P.insp;
  const rb = G.signIn(B.save, B.P, "2026-02-28");
  assert.strictEqual(rb.holidayGot, null);
  assert.strictEqual(B.P.insp, j0 + (S(G).cycle[0].insp || 0));
});
T("節日公告：節日前兩天貼、最後一天下架；春節一則；紀念日不貼", G => {
  const { P } = fresh(G, "2026-09-23");
  const has = (d, id) => G.visibleNotices(P, d).some(n => n.id === id);
  assert.strictEqual(has("2026-09-22", "hol-midautumn-2026"), false);
  assert.strictEqual(has("2026-09-23", "hol-midautumn-2026"), true);
  assert.strictEqual(has("2026-09-25", "hol-midautumn-2026"), true);
  assert.strictEqual(has("2026-09-26", "hol-midautumn-2026"), false);
  const sp = G.holidayNotices("2026-02-18").filter(n => n.holiday === "spring");
  assert.strictEqual(sp.length, 1);
  assert.strictEqual(sp[0].start, "2026-02-16"); assert.strictEqual(sp[0].end, "2026-02-21");
  assert.strictEqual(G.noticeStatus(sp[0], "2026-02-14"), "快開始");
  assert.strictEqual(G.noticeStatus(sp[0], "2026-02-18"), "進行中");
  assert.strictEqual(G.holidayNotices("2026-02-28").some(n => n.holiday === "peace"), false);
  const n = G.holidayNotices("2026-09-25").find(x => x.holiday === "midautumn");
  ["id", "v", "cat", "tags", "importance", "title", "publish", "expire", "sections", "cta"].forEach(k => assert.ok(k in n, "公告的欄位：" + k));
  assert.ok(G.NOTICE_CATS.includes(n.cat));
});
T("節日的外觀：台灣時間 05:00 前後 class 換掉", G => {
  G.setNowClock(() => tw("2026-09-25T04:59:00"));
  assert.strictEqual(G.holidayClass(G.todayStr()), "", "中秋 04:59 還是前一天");
  G.setNowClock(() => tw("2026-09-25T05:00:00"));
  assert.strictEqual(G.holidayClass(G.todayStr()), "holiday-moon");
  G.setNowClock(() => tw("2026-09-26T04:59:59"));
  assert.strictEqual(G.holidayClass(G.todayStr()), "holiday-moon", "隔天 04:59 還是中秋");
  G.setNowClock(() => tw("2026-09-26T05:00:00"));
  assert.strictEqual(G.holidayClass(G.todayStr()), "", "隔天 05:00 換回來");
  assert.strictEqual(G.holidayClass("2026-02-28"), "", "紀念日不換外觀");
});
T("節日特展：節日當天畫廊看得到、有靈感；隔天收起來", G => {
  const { P } = fresh(G, "2026-09-25");
  const list = G.holidayExhibits("2026-09-25");
  assert.strictEqual(list.length, 2);
  assert.strictEqual(G.holidayExhibits("2026-09-26").length, 0);
  const ex = G.exhibitById(list[0].id);
  assert.strictEqual(ex.holiday, "midautumn");
  assert.ok(G.exhibitOpen(P, ex));
  const i0 = P.insp;
  const v = G.viewExhibit(P, ex);
  assert.strictEqual(v.insp, G.galleryInsp(ex).first);
  assert.strictEqual(P.insp, i0 + v.insp);
  G.ensureDay(P, "2026-09-26");
  assert.strictEqual(G.exhibitOpen(P, ex), false, "隔天就收起來了");
  assert.ok(!G.EXHIBITS.some(e => e.id === ex.id), "不算進一般的展品（畫廊的進度、徽章不變）");
  const ghost = G.exhibitById("hx-ghost-0");
  assert.ok(ghost.san, "中元那幅要擲理智");
});
T("簽到日曆：一個月一頁、週一開頭；簽了的、今天、節日都標出來", G => {
  const { save, P } = fresh(G, "2026-09-21");
  signDays(G, save, P, ["2026-09-21", "2026-09-22", "2026-09-25"]);
  const m = G.signinMonth(save, 2026, 9, "2026-09-25");
  assert.strictEqual(m.cells.length % 7, 0);
  assert.strictEqual(m.cells[0].date, "2026-08-31", "九月一號是週二：前面補週一");
  const c = d => m.cells.find(x => x.date === d);
  assert.strictEqual(c("2026-09-21").signed, true);
  assert.strictEqual(c("2026-09-23").signed, false);
  assert.strictEqual(c("2026-09-25").isToday, true);
  assert.strictEqual(c("2026-09-25").hol[0].key, "midautumn");
  assert.strictEqual(c("2026-09-28").hol[0].key, "teacher");
  assert.strictEqual(c("2026-09-30").future, true);
  assert.strictEqual(m.signedIn, 3);
});
T("舊存檔：沒有簽到、限定欄位的讀得進來；壞掉的欄位補好；設定多了節日外觀", G => {
  const old = { v: 3, current: "challenge", profiles: { challenge: Object.assign({}, G.newProfile("challenge")), free: null }, settings: { font: "l", muted: true } };
  delete old.profiles.challenge.limited;
  delete old.signin;
  const s = G.migrateSave(JSON.parse(JSON.stringify(old)));
  assert.deepStrictEqual(J(s.signin), J(G.newSignin()));
  assert.deepStrictEqual(J(s.profiles.challenge.limited), { got: {}, wear: { stand: null, frame: null }, stock: {} });
  assert.strictEqual(s.settings.holidayLook, true);
  assert.strictEqual(s.settings.font, "l");
  // 壞掉的：日期不對的拿掉、count 至少等於簽過的天數；不認得的東西拿掉
  const bad = G.migrateSave({ profiles: { challenge: Object.assign(G.newProfile("challenge"), { limited: { got: { "hat-curator": "2026-11-15", nope: "x" }, wear: { stand: "frame-vine", frame: "frame-vine" }, stock: { 星光絨: 2, x: -1 } } }) },
    signin: { count: 0, days: { "2026-11-09": { n: 1, k: 1 }, "壞掉": {}, "2026-11-10": { n: 2, k: 2, hol: 5 } }, weeks: { "2914": { item: "hat-curator", got: "2026-11-15" }, x: 1 } } });
  assert.deepStrictEqual(Object.keys(bad.signin.days).sort(), ["2026-11-09", "2026-11-10"]);
  assert.strictEqual(bad.signin.count, 2);
  assert.strictEqual(bad.signin.days["2026-11-10"].hol, null);
  assert.deepStrictEqual(Object.keys(bad.signin.weeks), ["2914"]);
  const L = bad.profiles.challenge.limited;
  assert.deepStrictEqual(Object.keys(L.got), ["hat-curator"]);
  assert.strictEqual(L.wear.stand, null, "名牌框不能掛在展台的位子");
  assert.strictEqual(L.wear.frame, "frame-vine");
  assert.deepStrictEqual(J(L.stock), { 星光絨: 2 });
  // 存檔碼來回一次一樣
  const back = G.importCode(G.exportCode(bad));
  assert.deepStrictEqual(J(back.signin), J(bad.signin));
});

console.log(`\n${pass} passed, ${fail} failed（每日簽到、節日）`);
process.exit(fail ? 1 : 0);
