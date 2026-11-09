// Discord 聯動第二步的規則（shared/discord_out.js，決定 0051）：node test/discord_out.test.cjs（npm test 也會跑）
// 事件的字、冷卻、太舊的不發、送出去的 body 不 @ 任何人；再加原始碼上的檢查（token 不進 repo、部署流程、模擬器不連真的 Discord）。
// 真的寫 outbox、發送、冷卻、失敗的流程要用模擬器測：node tools/discord_fake.cjs（tools/README.md）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x));
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const MIN = 60000;

T("事件的字：每一種都有暱稱、沒有 email 理智 怪癖 靈感；字用「壹」不用「一」", G => {
  const e = {
    broke: G.dcOutEvent("broke", { key: "1" }),
    breaker: G.dcOutEvent("breaker", { nick: "小明", key: "2" }),
    rescued: G.dcOutEvent("rescued", { nick: "小華", key: "3" }),
    join: G.dcOutEvent("join", { nick: "小美", key: "uidabc" }),
    liveOn: G.dcOutEvent("liveOn", { nick: "阿全", key: 7 }),
    donate: G.dcOutEvent("donate", { from: "小明", to: "阿全", n: 123456, key: 9 }),
  };
  assert.ok(e.breaker.text.includes("小明") && e.rescued.text.includes("小華") && e.join.text.includes("小美 加入了博物館") && e.liveOn.text.includes("阿全"));
  assert.ok(e.donate.text.includes("小明") && e.donate.text.includes("阿全") && e.donate.text.includes("123,456"), e.donate.text);
  for (const [k, v] of Object.entries(e)) {
    assert.ok(v && v.kind === k && v.id.startsWith(k + "-"), k);
    assert.ok(!/@|理智|怪癖|靈感/.test(v.text), v.text);
    assert.ok(!v.text.includes("一"), `${k} 的字要用「壹」：${v.text}`);
    assert.ok(v.text.length < 200);
  }
  for (const k of G.DC_OUT_KINDS) assert.ok(G.DC_OUT_TEXT[k], k);
});

T("暱稱是 @everyone、markdown、連結、提及：都弄不出提及", G => {
  const evil = ["@everyone", "＠here", "<@123456789012345678>", "**粗**", "[點我](http://x.tw)", "`code`", "@​everyone", "a".repeat(100)];
  for (const n of evil) {
    for (const ev of [G.dcOutEvent("join", { nick: n, key: "u" }), G.dcOutEvent("donate", { from: n, to: n, n: 5, key: "1" }), G.dcOutEvent("breaker", { nick: n, key: "1" })]) {
      assert.ok(!/@|<|>|\*\*|\]\(|`|:\/\//.test(ev.text), `${n} → ${ev.text}`);
      assert.ok(ev.text.length < 200);
    }
  }
  assert.ok(G.dcOutEvent("join", { nick: "@everyone", key: "u" }).text.includes("everyone")); // 字還在，@ 沒了
  assert.ok(G.dcOutEvent("join", { nick: "", key: "u" }).text.includes("館友")); // 沒有暱稱就叫館友
  assert.ok(G.dcOutEvent("join", { key: "u" }).text.includes("館友"));
});

T("事件的身分：同一件事同一個 id；key 亂寫、kind 不認得就是 null", G => {
  const a = G.dcOutEvent("liveOn", { nick: "甲", key: 12 }), b = G.dcOutEvent("liveOn", { nick: "乙", key: 12 }), c = G.dcOutEvent("liveOn", { nick: "甲", key: 13 });
  assert.strictEqual(a.id, b.id); assert.notStrictEqual(a.id, c.id);
  assert.ok(/^[A-Za-z0-9_-]{1,80}$/.test(G.dcOutEvent("join", { nick: "x", key: "a/b..c" }).id)); // 斜線、點都被拿掉（文件路徑不會被亂改）
  assert.strictEqual(G.dcOutEvent("join", { nick: "x", key: "///" }), null);
  assert.strictEqual(G.dcOutEvent("join", { nick: "x" }), null);
  assert.strictEqual(G.dcOutEvent("nope", { key: "1" }), null);
  assert.strictEqual(G.dcOutEvent("join", null), null);
  assert.strictEqual(G.dcOutEvent(undefined, undefined), null);
});

T("冷卻：預設 10 分鐘最多一則；斗內 1 分鐘；沒發過、時間壞掉都放行；數字讀 NUM", G => {
  const N = G.NUM.discord, t0 = 1e12;
  assert.strictEqual(N.outCooldownMin, 10); assert.strictEqual(N.outDonateMin, 1);
  assert.deepStrictEqual(J(G.dcOutGate(null, "broke", t0)), { send: true, waitMs: 0 });
  assert.deepStrictEqual(J(G.dcOutGate({}, "broke", t0)), { send: true, waitMs: 0 });
  const st = { at: t0 };
  for (const k of ["broke", "breaker", "rescued", "join", "liveOn"]) {
    assert.strictEqual(G.dcOutGate(st, k, t0 + 1).send, false, k);
    assert.strictEqual(G.dcOutGate(st, k, t0 + N.outCooldownMin * MIN - 1).send, false, k);
    assert.strictEqual(G.dcOutGate(st, k, t0 + N.outCooldownMin * MIN).send, true, k);
  }
  assert.strictEqual(G.dcOutGate(st, "donate", t0 + N.outDonateMin * MIN - 1).send, false);
  assert.strictEqual(G.dcOutGate(st, "donate", t0 + N.outDonateMin * MIN).send, true);
  assert.strictEqual(G.dcOutGate(st, "broke", t0 + 3 * MIN).waitMs, (N.outCooldownMin - 3) * MIN);
  assert.strictEqual(G.dcOutGate({ at: "壞" }, "broke", t0).send, true);
  assert.strictEqual(G.dcOutGate(st, "broke", NaN).send, true);
  assert.strictEqual(G.dcOutCooldownMs("donate"), N.outDonateMin * MIN);
});

T("太舊的事件不發；剛好在期限內的發", G => {
  const N = G.NUM.discord, t = 1e12;
  assert.strictEqual(G.dcOutStale(t, t + N.outMaxAgeMin * MIN), false);
  assert.strictEqual(G.dcOutStale(t, t + N.outMaxAgeMin * MIN + 1), true);
  assert.strictEqual(G.dcOutStale(undefined, t), true);
  assert.strictEqual(G.dcOutStale(t, NaN), true);
});

T("送出去的 body：一定 allowed_mentions: { parse: [] }；超過字數會截", G => {
  const b = J(G.dcOutBody("@everyone 大家好"));
  assert.deepStrictEqual(b.allowed_mentions, { parse: [] });
  assert.strictEqual(b.content, "@everyone 大家好"); // 字不動，靠 allowed_mentions 擋；暱稱已經在 dcOutEvent 拿掉 @
  assert.ok([...J(G.dcOutBody("字".repeat(5000))).content].length <= 1900);
  assert.strictEqual(J(G.dcOutBody(undefined)).content, "");
});

// ---------- 原始碼上的檢查 ----------
T("部署流程：token 只寫進 functions/.env、部署完（成不成功）都刪、不印出來、不開 set -x", () => {
  const y = read(".github/workflows/deploy.yml");
  assert.ok(y.includes("secrets.DISCORD_BOT_TOKEN") && y.includes("secrets.DISCORD_CHANNEL_ID"));
  assert.ok(/printf [^\n]*DISCORD_BOT_TOKEN=%s[^\n]*> functions\/\.env/.test(y), "要用 printf 寫 functions/.env");
  assert.ok(/trap '[^']*functions\/\.env[^']*' EXIT/.test(y), "要用 trap 在結束時刪 functions/.env");
  assert.ok(!/set -x|set -o xtrace/.test(y), "不准 set -x");
  assert.ok(!/echo [^\n]*(\$DC_|\$tok|\$chan|\$SA_JSON|secrets\.)/.test(y), "不准 echo 金鑰");
  // 金鑰只出現在 env: 區塊（${{ secrets.… }} 不寫在指令列）
  y.split("\n").filter(l => l.includes("secrets.DISCORD")).forEach(l => assert.ok(/^\s+DC_(TOKEN|CHANNEL): \$\{\{ secrets\.DISCORD_(BOT_TOKEN|CHANNEL_ID) \}\}\s*$/.test(l), l));
  assert.ok(read(".gitignore").split("\n").some(l => l.trim() === ".env"), "functions/.env 要被 .gitignore 擋住");
});

T("Functions 的發送：token 從 process.env 讀、不用 defineSecret、模擬器不連真的 Discord、不重試、不把 token 寫進 log", () => {
  const code = f => read(f).split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n"); // 拿掉註解再檢查
  const s = read("functions/discord_out.js");
  assert.ok(s.includes("process.env.DISCORD_BOT_TOKEN") && s.includes("process.env.DISCORD_CHANNEL_ID"));
  assert.ok(!/defineSecret|defineString|defineJsonSecret/.test(code("functions/discord_out.js")) && !/defineSecret/.test(code("functions/index.js")));
  assert.ok(/if \(EMU\(\)\) \{[\s\S]*?fake: true/.test(s), "模擬器要走假的");
  assert.ok(s.includes('if (EMU()) throw new Error("模擬器不准連真的 Discord")'));
  assert.ok(!/retry\s*:\s*true/.test(s), "不重試");
  assert.ok(!/console\.(log|info|warn)\(/.test(s), "不用 console.log 印東西");
  s.split("\n").filter(l => /console\.error/.test(l)).forEach(l => assert.ok(!/token/i.test(l.replace(/redact\([^)]*\)/g, "")), "log 裡不放 token：" + l));
  assert.ok(/onDocumentCreated\("discordOutbox\/\{id\}"/.test(s));
  assert.ok(!/discord\.com\/api/.test(read("functions/discord.js")), "回覆指令不用 token");
});

T("寫 outbox 在交易之後、不丟錯：呼叫的地方都在交易外面", () => {
  const c = read("functions/casino.js");
  const play = c.slice(c.indexOf("export async function playCore("), c.indexOf("const play = (req"));
  const txEnd = play.indexOf("return Object.assign({}, r, { rev });");
  assert.ok(txEnd > 0 && play.indexOf("outHouse(") > txEnd, "play 裡 outHouse 要在 runTransaction 結束之後");
  const o = read("functions/discord_out.js");
  const put = o.slice(o.indexOf("export async function outboxPut"), o.indexOf("const safe"));
  assert.ok(/try \{[\s\S]*\} catch \(e\) \{[\s\S]*return false;/.test(put) && !/throw /.test(put), "outboxPut 不丟錯");
  assert.ok(o.includes("const safe = async fn => { try"));
});

T("Firestore 規則最後一條仍是一律不准；沒有為 outbox 另外開規則", () => {
  const r = read("firestore.rules");
  assert.ok(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/.test(r));
  assert.ok(!/discordOutbox|discordTest/.test(r));
});

console.log(`${fail ? "✗" : "✓"} Discord 聯動第二步的規則：${pass} 項通過${fail ? `、${fail} 項沒過` : ""}`);
process.exit(fail ? 1 : 0);
