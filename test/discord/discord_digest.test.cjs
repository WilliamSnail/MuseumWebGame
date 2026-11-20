// 每天 20:00 的 Discord 更新彙整（tools/content/discord_digest.cjs，翊文 11-15：「Discord更新太洗板了」）
const assert = require("assert");
const G = require("../load_shared.cjs").load(), digestText = (...a) => G.dcDigestText(...a); // 組字在 shared/discord/out.js
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const AREAS = ["股票與銀行", "賭場", "其他"], areaOf = n => n.area || "其他";
T("只列今天發布的館方公告、照分段、特展活動不列", () => {
  const s = digestText([{ title: "A", publish: "2026-11-15", area: "賭場" }, { title: "B", publish: "2026-11-14", area: "賭場" }, { title: "C", publish: "2026-11-15", area: "股票與銀行" }, { title: "D", publish: "2026-11-15", cat: "特展活動" }], "2026-11-15", areaOf, AREAS);
  assert.ok(s.startsWith("📰 今天的更新（11/15）"));
  assert.ok(s.indexOf("【股票與銀行】") < s.indexOf("【賭場】"), "照分段順序");
  assert.ok(s.includes("・A") && s.includes("・C") && !s.includes("・B") && !s.includes("・D"));
});
T("今天沒有公告就是空的（不發）", () => assert.strictEqual(digestText([{ title: "B", publish: "2026-11-14" }], "2026-11-15", areaOf, AREAS), ""));
T("太多時不超過 Discord 的長度，寫還有幾則", () => {
  const list = Array.from({ length: 200 }, (_, i) => ({ title: "很長的標題".repeat(4) + i, publish: "2026-11-15", area: "其他" }));
  const s = digestText(list, "2026-11-15", areaOf, AREAS);
  assert.ok(s.length <= 1900, "長度 " + s.length); assert.ok(/・很長/.test(s), "至少列幾則"); assert.ok(/…還有 [0-9]+ 則/.test(s));
});
T("真的發的那則多入館連結；沒有公告就不發", () => {
  const s = G.dcDigestPost([{ title: "A", publish: "2026-11-15", area: "賭場" }], "2026-11-15", areaOf, AREAS);
  assert.ok(s.startsWith("📰 今天的更新") && s.endsWith("🎟 入館：https://pepe-museum.web.app"));
  assert.strictEqual(G.dcDigestPost([], "2026-11-15", areaOf, AREAS), "");
});
T("伺服器排程：每天台灣 20:00、同壹天只寫壹則（outbox 的 id 帶日期）", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "functions", "discord_digest.js"), "utf8");
  assert.ok(/schedule: "0 20 \* \* \*"/.test(src) && /timeZone: "Asia\/Taipei"/.test(src));
  assert.ok(/`digest-\$\{day\}`/.test(src), "id 要是 digest-日期");
  const idx = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "functions", "index.js"), "utf8");
  assert.ok(/export \{ discordDigestTick \}/.test(idx), "index.js 要匯出");
  const yml = require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".github", "workflows", "discord-digest.yml"), "utf8");
  assert.ok(!/^\s*schedule:/m.test(yml), "GitHub 那支不能再定時（不然會發兩則）");
});
console.log(`Discord 彙整：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
