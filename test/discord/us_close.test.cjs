// 美股晨間行情（11-27，翊文：每天早上在 Discord 發美股收盤的漲跌，遊戲風格、實際數字、英文代號、每支壹行）：node test/discord/us_close.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
const A = require("../../tools/content/announce.cjs");
const G = load();
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const NAMES = Object.fromEntries(G.OUT_STOCKS.map(s => [s.id, s.name]));
const SYMS = { nightindex: "QQQ", greeneye: "NVDA", redclaw: "AMD", oldgamestore: "GME", bluefireyard: "AR" };
const doc = o => Object.assign({ day: "2026-11-25", openIdx: 0, closed: false, fx: 32.93,
  R: { nightindex: { px: 633.93 }, greeneye: { px: 149.3 }, redclaw: { px: 406.03 }, oldgamestore: { px: 26.97 }, bluefireyard: { px: 37.13 } },
  prevReal: { nightindex: 638.4, greeneye: 155.38, redclaw: 400, oldgamestore: 27.5, bluefireyard: 37.13 } }, o);

(async () => {
  await T("組字：遊戲名＋代號、漲跌、美元價（前面加 $，11-28）；指數另外壹行；漲跌各列在自己的行；家數；週五寫下週壹", () => {
    const t = G.dcUsCloseText(doc({ day: "2026-11-27" }), NAMES, G.US_IDS, true, SYMS);
    assert.ok(t.includes("晨間行情") && t.includes("美東 11-27，提早收盤"), t);
    assert.ok(t.includes(`📊 ${NAMES.nightindex} QQQ　$633.93（▼0.7%）`), t);
    assert.ok(/📈 漲得最兇：\n.+AMD ▲1\.5%（\$406\.03）/.test(t), t);
    assert.ok(/📉 跌得最深：\n.+NVDA ▼3\.9%（\$149\.30）\n.+GME ▼1\.9%（\$26\.97）/.test(t), t);
    assert.ok(t.includes("4 支裡，漲 1 支、跌 2 支、平 1 支。價格是美元；館內匯率 32.93。"), t);
    assert.ok(t.includes("下週壹傍晚盤前"), "11-27 是週五");
    assert.ok(!/一/.test(t), "用壹不用一");
  });
  await T("沒開盤、休市、沒有匯率、資料太少：回空字串（不發）", () => {
    assert.strictEqual(G.dcUsCloseText(doc({ openIdx: null }), NAMES, G.US_IDS), "");
    assert.strictEqual(G.dcUsCloseText(doc({ closed: true }), NAMES, G.US_IDS), "");
    assert.strictEqual(G.dcUsCloseText(doc({ fx: null, fxLast: null }), NAMES, G.US_IDS), "");
    assert.strictEqual(G.dcUsCloseText(doc({ R: { greeneye: { px: 1 } } }), NAMES, G.US_IDS), "");
    assert.ok(G.dcUsCloseText(doc({ fx: null, fxLast: 33 }), NAMES, G.US_IDS).includes("匯率 33"), "今天沒匯率用昨天的");
  });
  await T("今日館訊那邊：同壹個時間、排在後面；抓到今天的字就發，日期不對或空字串就不發", async () => {
    const e = A.usCloseEntry("2026-11-28", G.addDays);
    assert.strictEqual(e.id, "usclose-2026-11-28"); assert.ok(e.isDay);
    const fake = body => async () => ({ ok: true, json: async () => body });
    assert.strictEqual(await A.usCloseText("2026-11-28", fake({ day: "2026-11-28", text: "行情" })), "行情");
    assert.strictEqual(await A.usCloseText("2026-11-28", fake({ day: "2026-11-27", text: "舊的" })), "");
    assert.strictEqual(await A.usCloseText("2026-11-28", fake({ day: "2026-11-28", text: "" })), "");
    await assert.rejects(A.usCloseText("2026-11-28", async () => ({ ok: false, status: 500 })));
  });
  await T("runDue：make 是非同步的也行；空字串記成發過、不送出", async () => {
    const sent = [], entries = [{ id: "a", atMs: 0, until: 1e15, make: async () => "" }, { id: "b", atMs: 0, until: 1e15, make: async () => "有字" }];
    const r = await A.runDue(entries, [], 1000, async t => { sent.push(t); return true; });
    assert.deepStrictEqual(sent, ["有字"]); assert.ok(r.posted.includes("a") && r.posted.includes("b"));
  });
  await T("排程寫的 usTalk 換掉預設評語；沒寫、讀不到就照舊", () => {
    const fs = require("fs"), path = require("path"), d = require("../tmp_dir.cjs").tmpDir("ustalk-"), f = path.join(d, "d6.json");
    fs.writeFileSync(f, JSON.stringify({ usTalk: "照新聞寫的評語" }));
    const J = (...a) => a.join("\n");
    assert.strictEqual(A.usCloseWithTalk(J("頭", "💬 預設", "尾"), f), J("頭", "💬 照新聞寫的評語", "尾"));
    fs.writeFileSync(f, JSON.stringify({}));
    assert.strictEqual(A.usCloseWithTalk(J("頭", "💬 預設"), f), J("頭", "💬 預設"));
    assert.strictEqual(A.usCloseWithTalk(J("頭", "💬 預設"), path.join(d, "沒有.json")), J("頭", "💬 預設"));
    assert.strictEqual(A.usCloseWithTalk("", f), "");
  });
  console.log(`${pass} passed, ${fail} failed（美股晨間行情）`);
  process.exit(fail ? 1 : 0);
})();
