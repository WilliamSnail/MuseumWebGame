// 趣味節日（shared/holidays.js 的 funDaysOf，決定 0044）：node test/funday.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const { dayMessage } = require("../tools/discord_post.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const names = (G, d) => Array.from(G.funDaysOf(d).map(x => x.key)); // vm 裡出來的陣列不同 realm，用 Array.from 轉成這邊的
const same = (a, b, m) => assert.deepStrictEqual(Array.from(a), Array.from(b), m);
const pad = n => String(n).padStart(2, "0");

T("固定日期：圓周率、漢堡、博物館、青蛙、擁抱、帽子", G => {
  const want = { "03-14": "pi", "05-28": "hamburger", "05-18": "museum", "03-20": "frog", "01-21": "hugday", "01-15": "hatday" };
  for (const y of [2026, 2027, 2028, 2031]) for (const [md, k] of Object.entries(want)) assert.ok(names(G, `${y}-${md}`).includes(k), `${y}-${md} ${k}`);
});
T("第幾個星期幾：2026 年 4 月第壹個週六是 4/4，2027 是 4/3，2028 是 4/1（枕頭大戰）", G => {
  assert.strictEqual(G.funNthDate(2026, 4, 1, 6), "2026-04-04");
  assert.strictEqual(G.funNthDate(2027, 4, 1, 6), "2027-04-03");
  assert.strictEqual(G.funNthDate(2028, 4, 1, 6), "2028-04-01");
  assert.ok(names(G, "2026-04-04").includes("pillow"));
  assert.ok(!names(G, "2026-04-11").includes("pillow"), "第二個週六不是");
  assert.ok(!names(G, "2026-04-03").includes("pillow"), "週五不是");
  for (const d of ["2027-04-03", "2028-04-01"]) assert.ok(names(G, d).includes("pillow"), d);
});
T("第幾個星期幾：跨月（月初是週日、第 5 個沒有）", G => {
  assert.strictEqual(G.funNthDate(2026, 2, 1, 6), "2026-02-07"); // 2 月 1 日是週日，第壹個週六是 7
  assert.strictEqual(G.funNthDate(2026, 3, 1, 0), "2026-03-01"); // 3 月 1 日剛好是週日
  assert.strictEqual(G.funNthDate(2026, 2, 5, 6), null, "2026 年 2 月沒有第 5 個週六");
  assert.strictEqual(G.funNthDate(2028, 2, 5, 2), "2028-02-29", "2028 年 2 月第 5 個週二是 29 日");
  assert.strictEqual(G.funNthDate(2026, 6, 1, 5), "2026-06-05"); // 甜甜圈：6 月第壹個週五
  assert.ok(names(G, "2026-06-05").includes("doughnut"));
  assert.strictEqual(G.funNthDate(2026, 10, 1, 5), "2026-10-02"); // 微笑日
  assert.ok(names(G, "2026-10-02").includes("smile"));
  assert.strictEqual(G.funNthDate(2026, 7, 3, 0), "2026-07-19"); // 冰淇淋日：7 月第三個週日
  assert.ok(names(G, "2026-07-19").includes("icecream"));
  assert.ok(names(G, "2027-09-18").includes("redpanda"), "9 月第三個週六");
  assert.ok(!names(G, "2027-09-11").includes("redpanda"));
});
T("閏日只有閏年才有", G => {
  same(names(G, "2028-02-29"), ["leap"]);
  same(G.funDaysOf("2027-02-29"), [], "不是真的日期");
  same(G.funDaysOf("2026-02-29"), []);
  for (const y of [2026, 2027]) assert.ok(!Object.values(G.funDaysInMonth(y, 2)).flat().some(x => x.key === "leap"), String(y));
  assert.ok(Object.values(G.funDaysInMonth(2028, 2)).flat().some(x => x.key === "leap"));
  assert.ok(names(G, "2032-02-29").includes("leap"));
});
T("壹天可以有好幾個；沒有就是空陣列", G => {
  same(names(G, "2026-01-21"), ["hugday", "squirrel"], "擁抱日＋松鼠日，照表的順序");
  assert.ok(names(G, "2026-03-20").length >= 3, "青蛙＋快樂＋麻雀");
  same(G.funDaysOf("2026-01-02"), []);
  same(G.funDaysOf("壞的"), []);
  same(G.funDaysOf(""), []);
  same(G.funDaysOf(null), []);
});
T("每壹個回傳的欄位；有呼應房間的幾個", G => {
  const f = G.funDaysOf("2026-03-14")[0];
  assert.strictEqual(f.key, "pi"); assert.strictEqual(f.id, "fun-pi-2026"); assert.strictEqual(f.kind, "趣味");
  assert.strictEqual(f.name, "圓周率日"); assert.ok(f.line.length > 5);
  assert.strictEqual(f.hint, "");
  assert.ok(G.funDaysOf("2026-04-04").find(x => x.key === "pillow").hint.includes("抱枕工作台"));
  assert.ok(G.funDaysOf("2026-05-28").find(x => x.key === "hamburger").hint.includes("餐車"));
  assert.ok(G.funDaysOf("2026-05-18").find(x => x.key === "museum").hint.includes("大廳"));
  assert.ok(G.funDaysOf("2026-01-21").find(x => x.key === "hugday").hint.includes("抱枕"));
  assert.ok(G.funDaysOf("2026-01-15").find(x => x.key === "hatday").hint.includes("帽子"));
});
T("funDaysInMonth 跟逐天算的壹樣", G => {
  for (const [y, m] of [[2026, 3], [2026, 4], [2028, 2], [2027, 10]]) {
    const mon = G.funDaysInMonth(y, m), len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= len; d++) {
      const date = `${y}-${pad(m)}-${pad(d)}`;
      same((mon[date] || []).map(x => x.key), names(G, date), date);
    }
  }
});
T("大節日的結果沒有變（趣味節日不碰 holidayOf／holidaysOn／公告／外觀）", G => {
  assert.strictEqual(G.holidayOf("2026-03-14"), null, "圓周率日不是大節日");
  assert.strictEqual(G.holidayOf("2026-05-28"), null);
  assert.strictEqual(G.holidayClass("2026-03-14"), "");
  same(G.holidayExhibits("2026-03-14"), []);
  assert.strictEqual(G.holidayOf("2026-10-10").key, "national");
  assert.strictEqual(G.holidayOf("2026-10-10").reward.insp, G.NUM.signin.holiday.insp);
  assert.strictEqual(G.holidayOf("2026-12-25").look, "xmas");
  assert.strictEqual(G.holidayOf("2028-05-28").key, "duanwu", "2028 的端午剛好是 5/28：端午是那天的節日，漢堡日另外列");
  assert.ok(names(G, "2028-05-28").includes("hamburger"));
  assert.strictEqual(G.holidaysOn("2028-05-28").length, 1);
  assert.strictEqual(G.HOLIDAY_INFO.length, 17);
  assert.strictEqual(G.HOLIDAY_DAYS.length, 66, "大節日的天數跟 main 上一樣");
  // 公告只有大節日：沒有趣味節日的 id
  for (const d of ["2026-03-12", "2026-05-26", "2026-04-02"]) assert.ok(G.holidayNotices(d).every(n => !/^hol-(pi|hamburger|pillow)/.test(n.id)), d);
  assert.ok(G.holidayNotices("2026-10-08").some(n => n.id === "hol-national-2026"));
});
T("趣味節日不發獎勵：簽到那天拿的跟平常壹樣", G => {
  const save = G.newSave(), P = save.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, "2026-03-14");
  const pv = G.signPreview(save, P, "2026-03-14");
  assert.ok(!pv.holiday, "圓周率日不是節日簽到");
  const i0 = P.insp, r = G.signIn(save, P, "2026-03-14");
  assert.ok(r.ok); assert.ok(!r.holiday);
  assert.strictEqual(P.insp - i0, G.NUM.signin.cycle[0].insp || 0);
});
T("id 不重複、規則都對、每壹個都有文字", G => {
  const ids = G.FUN_INFO.map(x => x.key);
  assert.strictEqual(new Set(ids).size, ids.length, "key 重複");
  const hol = new Set(G.HOLIDAY_INFO.map(x => x.key));
  ids.forEach(k => assert.ok(!hol.has(k), "跟大節日撞名：" + k));
  assert.ok(G.FUN_INFO.length >= 100 && G.FUN_INFO.length <= 400, "數量：" + G.FUN_INFO.length);
  G.FUN_INFO.forEach(x => {
    const ok = x.fixed ? /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(x.fixed) : x.nth.length === 3 && x.nth[0] >= 1 && x.nth[0] <= 12 && x.nth[1] >= 1 && x.nth[1] <= 4 && x.nth[2] >= 0 && x.nth[2] <= 6;
    assert.ok(ok, "規則不對：" + x.key);
    const t = G.FUN_TEXT[x.key];
    assert.ok(t && t.name && t.line, "沒有文字：" + x.key);
    assert.ok(t.name.length <= 12 && t.line.length <= 60 && (!t.hint || t.hint.length <= 40), "太長：" + x.key);
    if (x.fixed) assert.strictEqual(new Date(Date.UTC(2028, +x.fixed.slice(0, 2) - 1, +x.fixed.slice(3))).toISOString().slice(5, 10), x.fixed, "不是真的日期：" + x.key);
  });
  Object.keys(G.FUN_TEXT).forEach(k => assert.ok(ids.includes(k), "多餘的文字：" + k));
});
T("文字：沒有禁用字、品牌、英文字母（數字可以）；用「壹」不用「一」", G => {
  const BAD = /4chan|meme|迷因|Pepe the Frog|川普|政治|選舉|政黨|adidas|愛迪達|伏特加|啤酒|酒|菸|毒|死|戰爭|疫|癌|病|宗教|星際大戰|毛巾|電影|小說|麥當勞|可口可樂|肯德基|星巴克|迪士尼|樂高|芭比/;
  Object.entries(G.FUN_TEXT).forEach(([k, t]) => [t.name, t.line, t.hint || ""].forEach(s => {
    assert.ok(!BAD.test(s), `${k} 有禁用字或品牌：${s}`);
    assert.ok(!/[A-Za-z]/.test(s), `${k} 有英文字母：${s}`);
    assert.ok(!/一/.test(s), `${k} 用了「一」，畫面文字要用「壹」：${s}`);
  }));
});
T("每個月都有趣味節日；每年有幾週碰不到（印出來）", G => {
  for (let m = 1; m <= 12; m++) assert.ok(Object.keys(G.funDaysInMonth(2027, m)).length >= 4, m + " 月太少");
  const out = [];
  for (const y of [2026, 2027, 2028]) {
    let miss = 0, weeks = 0;
    const first = new Date(Date.UTC(y, 0, 1)).getUTCDay();
    for (let d = G.addDays(`${y}-01-01`, (8 - first) % 7); G.addDays(d, 6).startsWith(String(y)); d = G.addDays(d, 7)) {
      weeks++;
      if (!Array.from({ length: 7 }, (_, i) => G.funDaysOf(G.addDays(d, i)).length).some(Boolean)) miss++;
    }
    out.push(`${y}：${weeks} 週裡 ${miss} 週碰不到`);
  }
  console.log("    （一年有幾週碰不到，週壹到週日算壹週）" + out.join("；"));
});
T("Discord 今日館訊：有趣味節日多壹行【今日冷知識】，沒有就不寫，大節日照舊", G => {
  const w = { title: "換季的失物招領", summary: ["立冬剛過。"] };
  const fun = G.funDaysOf("2026-03-14");
  const m = dayMessage(w, { board: "x" }, 2, null, undefined, fun);
  assert.ok(m.includes("【今日冷知識】圓周率日："), m);
  assert.ok(!dayMessage(w, { board: "x" }, 2, null, undefined, []).includes("今日冷知識"));
  assert.ok(!dayMessage(w, { board: "x" }, 2, null).includes("今日冷知識"));
  const both = dayMessage(w, { board: "x" }, 2, { name: "中秋節", words: "看月亮。" }, undefined, G.funDaysOf("2026-01-21"));
  assert.ok(both.includes("【本日節慶】中秋節。看月亮。") && both.includes("擁抱日：") && both.includes("松鼠日："), "壹天好幾個都列");
  assert.ok(dayMessage(w, { board: "x" }, 1, null, undefined, fun).includes("【今日館訊】"), "週壹也行");
  assert.ok(m.length <= 2000, "不超過 Discord 的上限");
});
console.log(`${pass} 項通過、${fail} 項失敗（趣味節日）`);
process.exit(fail ? 1 : 0);
