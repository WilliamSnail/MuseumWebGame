// 假的 Discord：用測試金鑰簽假的 interaction，打模擬器裡的 discordBot，走完 Discord 聯動第一步（決定 0051）。
// 不連真的 Discord、不連正式的 Firebase（只連 127.0.0.1）。每次跑都產生新的金鑰組，放進模擬器的 discordTest/config
// （functions/discord_config.js 只在模擬器讀它；正式環境永遠用 repo 裡的常數），所以 repo 裡沒有任何金鑰。
//
//   npm run local -- --set 5 --port 5285      先開模擬器（放背景）
//   node tools/discord_fake.cjs --set 5       跑全部檢查，印每一項過沒過、回應時間；有沒過的就 exit 1
//   node tools/discord_fake.cjs --set 5 --cmd 'pepe-莊家'                   只送壹個指令，印回覆（開頭的 / 可以不寫：Git Bash 會把 /pepe… 當路徑改掉）
//   node tools/discord_fake.cjs --set 5 --cmd 'pepe-綁定 123456' --user 11111  --user 是 Discord 的 ID（數字）
// 每次跑會把「今天靠 Discord 加入的人數」歸零，所以同壹天可以重複跑。
const crypto = require("crypto"), http = require("http");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const SET = Number(arg("set", 5)), add = 1000 * SET;
const PORT = { auth: 9099 + add, fs: 8180 + add, rtdb: 9100 + add, fn: 5101 + add };
const PROJECT = "demo-pepe4", REGION = "asia-east1";

// ---------- 小工具 ----------
function req(port, method, path, body, headers = {}) {
  return new Promise((res, rej) => {
    const data = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
    const q = http.request({ host: "127.0.0.1", port, path, method, headers: Object.assign({ "content-type": "application/json" }, data != null ? { "content-length": Buffer.byteLength(data) } : {}, headers) }, r => {
      let s = ""; r.setEncoding("utf8"); r.on("data", d => { s += d; });
      r.on("end", () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* 不是 JSON */ } res({ status: r.statusCode, body: s, json: j }); });
    });
    q.on("error", rej);
    if (data != null) q.write(data);
    q.end();
  });
}
const OWNER = { Authorization: "Bearer owner" }; // 模擬器的管理者身分：不受規則限制
const FSBASE = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const enc = v => v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : typeof v === "number" ? { doubleValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = f => "stringValue" in f ? f.stringValue : "integerValue" in f ? Number(f.integerValue) : "doubleValue" in f ? f.doubleValue : "booleanValue" in f ? f.booleanValue : "nullValue" in f ? null
  : "timestampValue" in f ? f.timestampValue : "mapValue" in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : "arrayValue" in f ? (f.arrayValue.values || []).map(dec) : null;
const fsSet = (path, obj) => req(PORT.fs, "PATCH", `${FSBASE}/${path}`, { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, enc(v)])) }, OWNER);
const fsDel = path => req(PORT.fs, "DELETE", `${FSBASE}/${path}`, null, OWNER);
async function fsGet(path) {
  const r = await req(PORT.fs, "GET", `${FSBASE}/${path}`, null, OWNER);
  if (r.status === 404 || !r.json || !r.json.fields) return null;
  return Object.fromEntries(Object.entries(r.json.fields).map(([k, x]) => [k, dec(x)]));
}
const rtdbSet = (path, obj) => req(PORT.rtdb, "PUT", `/${path}.json?ns=${PROJECT}`, obj, OWNER);
const randId = () => String(Math.floor(1e17 + Math.random() * 9e17));
const taipeiDay = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // 台灣時間 05:00 換日 ＝ UTC+8 再減 5 小時

// ---------- 簽名 ----------
const KEYS = crypto.generateKeyPairSync("ed25519");
const PUB_HEX = KEYS.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const GUILD = randId();
function sign(bodyStr, ts, key = KEYS.privateKey) { return crypto.sign(null, Buffer.concat([Buffer.from(ts), Buffer.from(bodyStr)]), key).toString("hex"); }
const timings = [];
async function bot(body, o = {}) {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  const ts = o.ts || String(Math.floor(Date.now() / 1000));
  const headers = o.noHeaders ? {} : { "X-Signature-Ed25519": o.sig || sign(s, ts, o.key), "X-Signature-Timestamp": ts };
  const t0 = Date.now();
  const r = await req(PORT.fn, o.method || "POST", `/${PROJECT}/${REGION}/discordBot`, s, headers);
  r.ms = Date.now() - t0;
  timings.push(r.ms);
  return r;
}
// 打壹個斜線指令：text 像 "/pepe-綁定 123456"
function interaction(text, discordId, guild = GUILD, name = "測試員") {
  const m = /^\/?(\S+)(?:\s+(.*))?$/.exec(text);
  const data = { name: m[1] };
  const OPT = { "pepe-更新": ["幾則", 4], "pepe-21點": ["下注", 3], "pepe-大禮包": ["幾包", 4], "pepe-實況": ["動作", 3] }; // 指令 → [選項名, Discord 的型別（3 字串、4 整數）]
  const o = OPT[m[1]] || ["碼", 3];
  if (m[2]) data.options = [{ name: o[0], type: o[1], value: o[1] === 4 ? Number(m[2]) : m[2] }];
  return { type: 2, id: randId(), token: "tk", guild_id: guild, member: { user: { id: discordId, username: name, global_name: name } }, data };
}
const said = [];
async function say(text, discordId, guild) {
  const r = await bot(interaction(text, discordId, guild));
  const d = r.json && r.json.data;
  if (d) said.push(d.content + JSON.stringify(d.components || []));
  return { r, text: d ? d.content : "", flags: d ? d.flags : null, ms: r.ms, type: r.json && r.json.type, comps: (d && d.components) || [] };
}
// 按按鈕（元件型別 2）或選選單（型別 3，values 是選的值）。discordId 是按的人
async function press(customId, discordId, o = {}) {
  const body = { type: 3, id: randId(), token: "tk", guild_id: o.guild || GUILD, member: { user: { id: discordId, username: "按的人", global_name: "按的人" } }, data: { custom_id: customId, component_type: o.menu ? 3 : 2, values: o.values } };
  const r = await bot(body), d = r.json && r.json.data;
  if (d) said.push(d.content + JSON.stringify(d.components || []));
  return { r, text: d ? d.content : "", flags: d ? d.flags : null, ms: r.ms, type: r.json && r.json.type, comps: (d && d.components) || [] };
}

// ---------- 遊戲這邊的帳號（模擬器的 Google 登入） ----------
async function gameUser(name, o = {}) {
  const email = o.email || `${name.replace(/[^A-Za-z0-9]/g, "x").toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.example`;
  const cred = JSON.stringify({ sub: o.sub || "g-" + crypto.randomBytes(6).toString("hex"), email, email_verified: o.verified !== false, name });
  const r = await req(PORT.auth, "POST", "/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key", { requestUri: "http://localhost", returnSecureToken: true, returnIdpCredential: true, postBody: `id_token=${encodeURIComponent(cred)}&providerId=google.com` });
  if (!r.json || !r.json.idToken) throw new Error("模擬器登入不了：" + r.body.slice(0, 200));
  const u = { name, email, uid: r.json.localId, token: r.json.idToken };
  u.call = async (fn, data) => { const x = await req(PORT.fn, "POST", `/${PROJECT}/${REGION}/${fn}`, { data: data == null ? {} : data }, { Authorization: `Bearer ${u.token}` }); return x.json && x.json.result !== undefined ? { ok: true, result: x.json.result } : { ok: false, message: x.json && x.json.error ? x.json.error.message : x.body.slice(0, 200), status: x.status }; };
  return u;
}
// 館友：@dev.local 的帳號在模擬器不用邀請（開發用），join 一次就是館友
const member = async name => { const u = await gameUser(name, { email: `dev-${crypto.randomBytes(10).toString("hex")}@dev.local` }); const r = await u.call("join"); if (!r.ok) throw new Error("建館友失敗：" + r.message); return u; };

// ---------- 檢查 ----------
const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log(`✓ ${name}`); }
  catch (e) { results.push([false, name]); console.log(`✗ ${name}\n    ${(e && e.message || e)}`); }
}
const assert = require("assert");
const has = (s, ...parts) => parts.forEach(p => assert.ok(String(s).includes(p), `應該有「${p}」：${String(s).slice(0, 200)}`));
const hasNot = (s, ...parts) => parts.forEach(p => assert.ok(!String(s).includes(p), `不該有「${p}」：${String(s).slice(0, 200)}`));
const walletOf = async uid => { const d = await fsGet(`casinoWallets/${uid}`); return d ? JSON.parse(d.data) : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(150); } };
async function fsList(col) {
  const r = await req(PORT.fs, "GET", `${FSBASE}/${col}?pageSize=300`, null, OWNER);
  return ((r.json && r.json.documents) || []).map(d => Object.assign({ id: d.name.split("/").pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, dec(x)]))));
}
// ---- 第二步（outbox）的測試工具：模擬器的 Function 絕不連真的 Discord，「會發的訊息」寫進 discordTestSent；discordTest/out 控制有沒有 token、發送會不會失敗 ----
const OUT_KINDS = ["broke", "breaker", "rescued", "join", "liveOn", "donate", "bj"];
async function outClear() {
  for (const col of ["discordOutbox", "discordTestSent"]) for (const d of await fsList(col)) await fsDel(`${col}/${d.id}`);
  for (const k of OUT_KINDS) await fsDel(`discordOutboxState/${k}`);
}
const outSetup = async o => { await outClear(); await fsSet("discordTest/out", o); };
const outDocs = async prefix => (await fsList("discordOutbox")).filter(d => d.id.startsWith(prefix + "-"));
const sentDocs = async () => fsList("discordTestSent");
const setHouse = bankroll => fsSet("casinoHouse/main", { data: JSON.stringify({ v: 1, bankroll, hands: 0, day: taipeiDay(), reopened: 0 }) });
const houseNow = async () => JSON.parse((await fsGet("casinoHouse/main")).data).bankroll;

async function single() {
  const text = arg("cmd"), id = arg("user", randId());
  await fsSet("discordTest/config", { publicKey: PUB_HEX, guildId: GUILD });
  const r = await say(text, id);
  console.log(`${r.r.status}（${r.ms}ms，flags=${r.flags}）\n${r.text || r.r.body}`);
}

async function all() {
  const t0 = Date.now();
  await fsSet("discordTest/config", { publicKey: PUB_HEX, guildId: GUILD });
  const day = taipeiDay();
  await fsSet(`discordJoinDay/${day}`, { n: 0 });
  const cfg = require("../shared/../test/load_shared.cjs").load().NUM.discord;
  const BONUS = cfg.linkBonus, START = require("../test/load_shared.cjs").load().NUM.casino.startChips;

  // ---- 入口：簽名、PING、設定、伺服器 ----
  let firstMs = null;
  await check("PING 回 PONG（這是冷啟動後的第一個請求）", async () => {
    const r = await bot({ type: 1 }); firstMs = r.ms;
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json, { type: 1 });
  });
  await check("簽名錯回 401（用別把金鑰簽）", async () => {
    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    const r = await bot({ type: 1 }, { key: other }); assert.strictEqual(r.status, 401);
  });
  await check("內容被改過回 401（簽的是 A，送的是 B）", async () => {
    const ts = String(Math.floor(Date.now() / 1000)), sig = sign(JSON.stringify({ type: 1 }), ts);
    const r = await bot(interaction("/pepe-莊家", "111111"), { sig, ts }); assert.strictEqual(r.status, 401);
  });
  await check("沒有簽名的標頭、簽名不是十六進位，都回 401", async () => {
    assert.strictEqual((await bot({ type: 1 }, { noHeaders: true })).status, 401);
    assert.strictEqual((await bot({ type: 1 }, { sig: "zz".repeat(64) })).status, 401);
    assert.strictEqual((await bot({ type: 1 }, { sig: "ab" })).status, 401);
  });
  await check("時間戳差太多（10 分鐘前，簽名本身是對的）回 401", async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 600); const r = await bot({ type: 1 }, { ts }); assert.strictEqual(r.status, 401);
  });
  await check("不是 POST 回 405", async () => { assert.strictEqual((await bot({ type: 1 }, { method: "GET" })).status, 405); });
  await check("別的伺服器來的指令不理，只回本人看得到的一句", async () => {
    const r = await say("/pepe-莊家", "222222", randId()); assert.strictEqual(r.flags, 64); has(r.text, "只在佩佩博物館");
  });
  await check("不認得的指令、按鈕：本人看得到的提示，不當機", async () => {
    const r = await bot({ type: 2, guild_id: GUILD, member: { user: { id: "333333" } }, data: { name: "別的指令" } }); has(r.json.data.content, "不認得");
    const b = await bot({ type: 3, guild_id: GUILD, member: { user: { id: "333333" } } }); assert.strictEqual(b.json.data.flags, 64);
  });

  // ---- 準備幾位館友 ----
  const alice = await member("Alice"), bob = await member("Bob"), carol = await member("Carol");
  const D = { a: randId(), b: randId(), c: randId(), lock: randId(), x: randId() };

  // ---- 沒綁定 ----
  await check("沒綁定的人打 /pepe-籌碼：本人看得到，教他怎麼綁定或加入", async () => {
    const r = await say("/pepe-籌碼", D.x); assert.strictEqual(r.flags, 64); has(r.text, "/pepe-加入", "/pepe-綁定");
  });
  await check("沒綁定的人打 /pepe-解除綁定：說沒有綁定", async () => { has((await say("/pepe-解除綁定", D.x)).text, "還沒有綁定"); });
  await check("沒綁定的人可以看公開的（莊家、今日活動、排行榜、誰在線）", async () => {
    for (const c of ["/pepe-莊家", "/pepe-今日活動", "/pepe-排行榜", "/pepe-誰在線", "/pepe-更新"]) { const r = await say(c, D.x); assert.strictEqual(r.flags, 0, c); assert.ok(r.text.length > 0, c); }
  });
  await check("/pepe-今日活動：今天有館訊（打包的 DAY_DATA）就列「今日館訊」；沒有現實消息就沒有那一塊（不編）", async () => {
    const dd = JSON.parse(/DAY_DATA = (\{.*\});/.exec(require("fs").readFileSync(require("path").join(__dirname, "..", "functions", "shared", "day_data.js"), "utf8"))[1]);
    const r = await say("/pepe-今日活動", D.x), info = dd[day];
    assert.strictEqual(r.flags, 0);
    if (info) { has(r.text, "今日館訊", info.title); if (!info.real.length) hasNot(r.text, "現實世界"); else has(r.text, "今天的現實世界", info.real[0].slice(0, 6)); }
    else hasNot(r.text, "現實世界");
    hasNot(r.text, "@everyone");
  });
  await check("/pepe-更新：預設 5 則、有日期標題和遊戲連結；給 2 就 2 則；全頻道看得到", async () => {
    const r = await say("/pepe-更新", D.x); assert.strictEqual(r.flags, 0);
    has(r.text, "最近的館方更新", "pepe-museum.web.app"); assert.strictEqual(r.text.split("\n").filter(l => l.startsWith("・")).length, 5);
    const r2 = await say("/pepe-更新 2", D.x); assert.strictEqual(r2.text.split("\n").filter(l => l.startsWith("・")).length, 2);
    assert.ok(r.text.length < 2000);
    const r10 = await say("/pepe-更新 10", D.x); assert.strictEqual(r10.text.split("\n").filter(l => l.startsWith("・")).length, 10); hasNot(r10.text, "怪癖"); assert.ok(r10.text.length < 2000);
  });

  // ---- 綁定：碼 ----
  let aliceCode;
  await check("遊戲裡拿綁定碼：先看狀態，再拿 6 位數、10 分鐘", async () => {
    const st = await alice.call("discordLinkState"); assert.ok(st.ok && st.result.configured === true && st.result.linked === false, JSON.stringify(st));
    const r = await alice.call("discordLinkCode"); assert.ok(r.ok, r.message);
    aliceCode = r.result.code; assert.ok(/^\d{6}$/.test(aliceCode)); assert.ok(Math.abs(r.result.exp - (Date.now() + 10 * 60000)) < 30000);
    const st2 = await alice.call("discordLinkState"); assert.strictEqual(st2.result.code, aliceCode);
  });
  await check("不是館友拿不到綁定碼", async () => { const g = await gameUser("路人"); const r = await g.call("discordLinkCode"); assert.ok(!r.ok); });
  await check("再拿壹個新的，舊的作廢", async () => {
    const old = aliceCode; aliceCode = (await alice.call("discordLinkCode")).result.code;
    if (old !== aliceCode) has((await say(`/pepe-綁定 ${old}`, D.x)).text, "不對");
  });
  await check("錯碼：說不對、剩幾次；打錯太多次暫時擋，連對的碼也不收", async () => {
    let r;
    for (let i = 1; i <= cfg.triesMax; i++) { r = await say("/pepe-綁定 000000", D.lock); has(r.text, "不對"); assert.strictEqual(r.flags, 64); }
    has(r.text, "還能試 0 次");
    r = await say(`/pepe-綁定 ${aliceCode}`, D.lock); has(r.text, "休息", "分鐘");
    assert.ok(await fsGet(`discordCodes/L${aliceCode}`), "擋住的時候碼不能被用掉");
  });
  await check("過期的碼：說不對（直接在資料庫放壹個過期的碼）", async () => {
    await fsSet("discordCodes/L654321", { uid: alice.uid, exp: Date.now() - 1000 }); has((await say("/pepe-綁定 654321", D.x)).text, "不對");
  });

  // ---- 綁定：成功和獎勵 ----
  await check("綁定成功：本人看得到、說暱稱、送 100 萬；Alice 沒進過賭場，錢包開場籌碼 + 獎勵", async () => {
    assert.strictEqual(await walletOf(alice.uid), null, "還沒有錢包");
    const r = await say(`/pepe-綁定 ${aliceCode}`, D.a, GUILD); assert.strictEqual(r.flags, 64);
    has(r.text, "綁定好了", "Alice", "1,000,000");
    const w = await walletOf(alice.uid); assert.strictEqual(w.chips, START + BONUS, "開場籌碼沒被蓋掉、獎勵沒遺失");
    assert.strictEqual((await fsGet(`discordLinks/${D.a}`)).uid, alice.uid); assert.strictEqual((await fsGet(`discordUids/${alice.uid}`)).discordId, D.a);
    assert.ok(await fsGet(`discordBonus/${alice.uid}`));
    assert.strictEqual(await fsGet(`discordCodes/L${aliceCode}`), null, "碼用掉了");
  });
  await check("同一個碼不能再用", async () => { has((await say(`/pepe-綁定 ${aliceCode}`, D.b)).text, "不對"); });
  await check("同一個 Discord 帳號不能再綁壹個（要先解除）", async () => {
    const c = (await bob.call("discordLinkCode")).result.code; has((await say(`/pepe-綁定 ${c}`, D.a)).text, "已經綁定");
    assert.ok(await fsGet(`discordCodes/L${c}`), "沒被用掉");
  });
  await check("遊戲這邊看狀態：已綁定，不給新碼", async () => {
    const st = await alice.call("discordLinkState"); assert.strictEqual(st.result.linked, true);
    assert.ok(!(await alice.call("discordLinkCode")).ok);
  });
  await check("Bob 先進過賭場（有錢包）再綁定：籌碼 = 原本 + 100 萬，不是被蓋掉", async () => {
    const o = await bob.call("casino", { act: "open" }); assert.ok(o.ok, o.message);
    const before = (await walletOf(bob.uid)).chips; assert.ok(before > 0);
    const c = (await bob.call("discordLinkCode")).result.code;
    has((await say(`/pepe-綁定 ${c}`, D.b)).text, "綁定好了", "1,000,000");
    assert.strictEqual((await walletOf(bob.uid)).chips, before + BONUS);
    const pk = await bob.call("casino", { act: "peek" }); assert.strictEqual(pk.result.chips, before + BONUS, "賭場讀得到");
  });
  await check("/pepe-籌碼：本人看得到、有暱稱和籌碼；沒有 email", async () => {
    const r = await say("/pepe-籌碼", D.a); assert.strictEqual(r.flags, 64); has(r.text, "Alice", "2,000,000"); hasNot(r.text, "@", "test.example", "dev.local");
  });
  await check("有戴稱號的人 /pepe-籌碼 也顯示稱號（titles/{uid}）", async () => {
    await rtdbSet(`titles/${alice.uid}`, { id: "bj", name: "天生壹對" });
    has((await say("/pepe-籌碼", D.a)).text, "天生壹對");
  });
  await check("解除綁定：兩邊都清掉；錢包和「領過獎勵」的紀錄還在", async () => {
    const before = (await walletOf(alice.uid)).chips;
    has((await say("/pepe-解除綁定", D.a)).text, "解除了");
    assert.strictEqual(await fsGet(`discordLinks/${D.a}`), null); assert.strictEqual(await fsGet(`discordUids/${alice.uid}`), null);
    assert.ok(await fsGet(`discordBonus/${alice.uid}`)); assert.strictEqual((await walletOf(alice.uid)).chips, before);
    has((await say("/pepe-籌碼", D.a)).text, "/pepe-加入");
  });
  await check("解除再綁：獎勵不再發（同一個 Discord）", async () => {
    const before = (await walletOf(alice.uid)).chips, c = (await alice.call("discordLinkCode")).result.code;
    const r = await say(`/pepe-綁定 ${c}`, D.a); has(r.text, "綁定好了", "領過了"); hasNot(r.text, "1,000,000 籌碼");
    assert.strictEqual((await walletOf(alice.uid)).chips, before);
  });
  await check("換 Discord 帳號再綁：獎勵還是不再發", async () => {
    const before = (await walletOf(alice.uid)).chips;
    const u = await alice.call("discordUnlink"); assert.ok(u.ok && u.result.ok);
    const c = (await alice.call("discordLinkCode")).result.code; has((await say(`/pepe-綁定 ${c}`, D.c)).text, "領過了");
    assert.strictEqual((await walletOf(alice.uid)).chips, before);
    assert.ok(!(await fsGet(`discordLinks/${D.a}`)), "舊的 Discord 沒有綁著");
  });
  await check("兩邊都唯一：Alice 已經接著 D.c，另一個 Discord 拿同壹個遊戲帳號的碼綁不上", async () => {
    assert.ok(!(await alice.call("discordLinkCode")).ok, "已綁定不給碼");
    await fsSet("discordCodes/L777001", { uid: alice.uid, exp: Date.now() + 60000 });
    has((await say("/pepe-綁定 777001", randId())).text, "已經接著另壹個 Discord");
  });

  // ---- 公開的指令 ----
  await check("/pepe-莊家：全頻道看得到，有數字", async () => { const r = await say("/pepe-莊家", D.x); assert.strictEqual(r.flags, 0); has(r.text, "莊家現在有"); });
  await check("/pepe-排行榜：沒有榜單就老實說；有榜單只列名次暱稱數字，不放建議、提醒", async () => {
    await fsDel("boards/latest"); has((await say("/pepe-排行榜", D.x)).text, "還沒有出來");
    await fsSet("boards/latest", { week: "2026-W45", from: "2026-11-02", to: "2026-11-08", first: false, empty: false, posted: true, boards: [{ id: "codex", title: "本週新收藏", rows: [{ rank: 1, nick: "榜首", value: 12 }] }], tips: ["秘密建議"], nudges: [{ nick: "墊底", text: "秘密提醒" }] });
    const r = await say("/pepe-排行榜", D.x); assert.strictEqual(r.flags, 0); has(r.text, "榜首", "12 格", "11/02～11/08"); hasNot(r.text, "秘密建議", "秘密提醒", "墊底");
    await fsDel("boards/latest");
  });
  await check("/pepe-今日活動：有回答，不編造", async () => { const r = await say("/pepe-今日活動", D.x); assert.strictEqual(r.flags, 0); has(r.text, "今天"); });
  await check("/pepe-誰在線：列在線和離開的館友；隱身的、離線的、不是館友的不列；沒有 email、房間", async () => {
    await rtdbSet("status", "null"); // 先清空：別人（例如開著的瀏覽器分頁）的在線狀態會混進來
    await rtdbSet(`status/${alice.uid}`, { state: "online", room: "lobby", nick: "Alice", at: Date.now() });
    await rtdbSet(`status/${bob.uid}`, { state: "away", room: "hall", nick: "Bob", at: Date.now() });
    await rtdbSet(`status/${carol.uid}`, { state: "online", room: "lobby", nick: "Carol", at: Date.now() }); // 狀態沒寫成離線，但 members 標了隱身
    await fsSet(`members/${carol.uid}`, { nick: "Carol", invisible: true });
    await rtdbSet("status/ghost", { state: "online", room: "lobby", nick: "鬼", at: Date.now() });
    const r = await say("/pepe-誰在線", D.x); assert.strictEqual(r.flags, 0);
    has(r.text, "Alice", "Bob"); hasNot(r.text, "Carol", "鬼", "@", "lobby", "大廳");
    await rtdbSet(`status/${alice.uid}`, { state: "offline", room: "lobby", nick: "Alice", at: Date.now() });
    await rtdbSet(`status/${bob.uid}`, { state: "offline", room: "hall", nick: "Bob", at: Date.now() });
    has((await say("/pepe-誰在線", D.x)).text, "沒有人在線");
    await rtdbSet("status/ghost", "null");
  });

  // ---- 自己加入 ----
  const J = { d1: randId(), d2: randId(), d3: randId(), d4: randId(), d5: randId(), d6: randId(), d7: randId() };
  const codeOf = text => { const m = /join=([a-z0-9]{16})/.exec(text); assert.ok(m, "應該有連結：" + text); return m[1]; };
  let code1, erin;
  await check("沒帶碼的 join 行為不變：沒邀請的人進不來、有邀請的進得來", async () => {
    const stranger = await gameUser("陌生人"); const r = await stranger.call("join"); assert.ok(!r.ok && r.status === 403 && /邀請/.test(r.message), JSON.stringify(r));
    const inv = await gameUser("被邀請的"); await fsSet(`invites/${inv.email}`, { name: "被邀請的" });
    const r2 = await inv.call("join"); assert.ok(r2.ok && r2.result.nick, JSON.stringify(r2));
    const r3 = await inv.call("join"); assert.ok(r3.ok, "已經是館友再 join 還是回暱稱");
  });
  await check("/pepe-加入：回只有本人看得到的連結（30 分鐘、16 字的碼）；連結沒有 email", async () => {
    const r = await say("/pepe-加入", J.d1); assert.strictEqual(r.flags, 64); has(r.text, "https://pepe-museum.web.app/?join=", "30 分鐘"); hasNot(r.text, "@");
    code1 = codeOf(r.text); const doc = await fsGet(`discordCodes/J${code1}`); assert.strictEqual(doc.discordId, J.d1); assert.ok(Math.abs(doc.exp - (Date.now() + 30 * 60000)) < 30000);
  });
  await check("再打壹次 /pepe-加入：新連結，舊的作廢", async () => {
    const r = await say("/pepe-加入", J.d1); const c2 = codeOf(r.text); assert.notStrictEqual(c2, code1);
    assert.strictEqual(await fsGet(`discordCodes/J${code1}`), null); code1 = c2;
  });
  await check("Google email 沒驗證過的人，帶了有效的碼也進不來（碼不會被用掉）", async () => {
    const u = await gameUser("沒驗證", { verified: false }); const r = await u.call("join", { code: code1 });
    assert.ok(!r.ok && /邀請/.test(r.message), JSON.stringify(r)); assert.strictEqual((await fsGet(`discordCodes/J${code1}`)).used, false);
  });
  await check("亂寫的碼、格式不對的碼：當作沒帶，沒邀請照樣進不來", async () => {
    const u = await gameUser("亂寫"); for (const c of ["abcdefghjkmnpqrs", "xx", "<script>"]) { const r = await u.call("join", { code: c }); assert.ok(!r.ok && /邀請/.test(r.message), c + JSON.stringify(r)); }
  });
  await check("有效的碼：成為館友、建 invites（source: discord）、順便綁定、發 100 萬、碼標記用掉、今天人數 +1", async () => {
    erin = await gameUser("Erin"); const r = await erin.call("join", { code: code1 }); assert.ok(r.ok, r.message); assert.strictEqual(r.result.nick, "Erin");
    assert.ok(await fsGet(`members/${erin.uid}`)); assert.strictEqual((await fsGet(`invites/${erin.email}`)).source, "discord");
    assert.strictEqual((await fsGet(`discordLinks/${J.d1}`)).uid, erin.uid); assert.strictEqual((await fsGet(`discordUids/${erin.uid}`)).discordId, J.d1);
    assert.strictEqual((await walletOf(erin.uid)).chips, START + BONUS);
    const c = await fsGet(`discordCodes/J${code1}`); assert.strictEqual(c.used, true);
    assert.strictEqual((await fsGet(`discordJoinDay/${day}`)).n, 1);
    const rt = await req(PORT.rtdb, "GET", `/members/${erin.uid}.json?ns=${PROJECT}`, null, OWNER); assert.strictEqual(rt.json, true, "Realtime Database 的 members 也要有");
    const pk = await erin.call("casino", { act: "peek" }); assert.strictEqual(pk.result.chips, START + BONUS);
  });
  await check("碼用過了就不能再用（另壹個人拿同壹個碼）", async () => {
    const f = await gameUser("Frank"); const r = await f.call("join", { code: code1 }); assert.ok(!r.ok && /邀請/.test(r.message), JSON.stringify(r)); assert.strictEqual(await fsGet(`members/${f.uid}`), null);
  });
  await check("並發：同壹個碼同時兩個人用，只有壹個人成功", async () => {
    const c = codeOf((await say("/pepe-加入", J.d2)).text); const [g1, g2, g3] = await Promise.all([gameUser("並發甲"), gameUser("並發乙"), gameUser("並發丙")]);
    const rs = await Promise.all([g1, g2, g3].map(g => g.call("join", { code: c })));
    assert.strictEqual(rs.filter(r => r.ok).length, 1, JSON.stringify(rs.map(r => r.ok)));
    const ok = [g1, g2, g3][rs.findIndex(r => r.ok)]; assert.strictEqual((await fsGet(`discordLinks/${J.d2}`)).uid, ok.uid);
  });
  await check("已經是館友的人打 /pepe-加入：回「你已經是館友」", async () => {
    has((await say("/pepe-加入", J.d1)).text, "已經是館友"); has((await say("/pepe-加入", D.c)).text, "已經是館友");
  });
  await check("已經是館友的人帶著碼 join：碼不會被用掉", async () => {
    const c = codeOf((await say("/pepe-加入", J.d3)).text); const r = await erin.call("join", { code: c }); assert.ok(r.ok);
    assert.strictEqual((await fsGet(`discordCodes/J${c}`)).used, false);
  });
  await check("同壹個 Discord 帳號只能換壹個館友帳號（已經用過，資料庫裡有紀錄但館友不見了）", async () => {
    await fsSet(`discordJoins/${J.d4}`, { uid: "ghost-uid", email: "ghost@test.example", at: Date.now() });
    has((await say("/pepe-加入", J.d4)).text, "已經換過");
    await fsSet(`discordCodes/Jmmmmmmmmmmmmmmmm`, { discordId: J.d4, exp: Date.now() + 60000, used: false });
    const g = await gameUser("貪心"); const r = await g.call("join", { code: "mmmmmmmmmmmmmmmm" }); assert.ok(!r.ok && /邀請/.test(r.message), JSON.stringify(r)); assert.strictEqual(await fsGet(`members/${g.uid}`), null);
  });
  await check("被管理員停用的人回不來：連結進不來、那個 Discord 帳號之後也不能再用 /pepe-加入", async () => {
    const c = codeOf((await say("/pepe-加入", J.d5)).text); const hank = await gameUser("Hank"); await fsSet(`invites/${hank.email}`, { disabled: true });
    const r = await hank.call("join", { code: c }); assert.ok(!r.ok && /停用/.test(r.message), JSON.stringify(r)); assert.strictEqual(await fsGet(`members/${hank.uid}`), null);
    has((await say("/pepe-加入", J.d5)).text, "不能再自己加入");
    assert.ok(!(await hank.call("join")).ok, "沒帶碼也進不來");
  });
  await check("停用的人就算帶著連結，也不能用 @dev.local 的模擬器後門進來", async () => {
    const c = codeOf((await say("/pepe-加入", J.d6)).text); const dev = await gameUser("停用的開發者", { email: `dev-stop${Date.now()}@dev.local` }); await fsSet(`invites/${dev.email}`, { disabled: true });
    const r = await dev.call("join", { code: c }); assert.ok(!r.ok && /停用/.test(r.message), JSON.stringify(r));
  });
  await check("靠 Discord 加入之後才被停用：那個 Discord 帳號不能再用 /pepe-加入", async () => {
    await fsSet(`invites/${erin.email}`, { source: "discord", disabled: true });
    has((await say("/pepe-加入", J.d1)).text, "不能再自己加入"); await fsSet(`invites/${erin.email}`, { source: "discord" });
  });
  await check("每天最多 5 人：滿了 /pepe-加入 回「今天名額滿了，請找翊文」，已發出去的連結也不能用", async () => {
    const c = codeOf((await say("/pepe-加入", J.d7)).text); await fsSet(`discordJoinDay/${day}`, { n: cfg.joinPerDay });
    has((await say("/pepe-加入", randId())).text, "名額滿了", "翊文");
    const g = await gameUser("太晚"); const r = await g.call("join", { code: c }); assert.ok(!r.ok && /名額/.test(r.message), JSON.stringify(r)); assert.strictEqual(await fsGet(`members/${g.uid}`), null);
    await fsSet(`discordJoinDay/${day}`, { n: 0 });
    const ok = await gameUser("剛好"); assert.ok((await ok.call("join", { code: c })).ok, "名額回來就能用");
  });
  await check("帶了無效的碼、但本來就在邀請名單上的人：照原本的邀請名單進得來", async () => {
    const ivy = await gameUser("Ivy"); await fsSet(`invites/${ivy.email}`, { name: "Ivy" }); const r = await ivy.call("join", { code: "abcdefghjkmnpqrs" }); assert.ok(r.ok, JSON.stringify(r));
  });
  await check("不在 Firestore 規則裡開放：瀏覽器的身分讀不到 discord* 的集合", async () => {
    for (const p of [`discordLinks/${D.c}`, `discordCodes/J${code1}`, `discordBonus/${alice.uid}`]) {
      const r = await req(PORT.fs, "GET", `${FSBASE}/${p}`, null, { Authorization: `Bearer ${alice.token}` }); assert.ok(r.status === 403 || r.status === 401, p + " " + r.status);
    }
  });

  // ---- 沒設定 ----
  // ---- 第二步：遊戲大事發到頻道 ----
  const NUMS = require("../test/load_shared.cjs").load().NUM;
  const joinViaDiscord = async name => { // 一個新的人靠 /pepe-加入 的連結成為館友
    await fsSet(`discordJoinDay/${day}`, { n: 0 });
    const r = await say("/pepe-加入", randId()); const c = /join=([a-z0-9]{16})/.exec(r.text)[1];
    const g = await gameUser(name); const j = await g.call("join", { code: c }); assert.ok(j.ok, j.message); return g;
  };
  await check("發頻道：有人靠 /pepe-加入 成為館友 → 寫 outbox → 發到頻道（只有暱稱、不 @ 任何人）", async () => {
    await outSetup({ token: true });
    const g = await joinViaDiscord("Frank");
    const o = await waitFor(async () => { const d = (await outDocs("join")).find(x => x.id === `join-${g.uid}` && x.status === "sent"); return d; });
    assert.ok(o, "outbox 應該是 sent：" + JSON.stringify(await outDocs("join")));
    const s = (await sentDocs()).find(x => x.id === `join-${g.uid}`); assert.ok(s, "應該有發");
    has(s.content, "Frank 加入了博物館"); hasNot(s.content, "@", g.email, "test.example"); assert.strictEqual(s.mentions, JSON.stringify({ parse: [] }));
    assert.ok((await fsGet("discordOutboxState/join")).at > 0);
  });
  await check("暱稱是 @everyone 也不能 tag：字裡沒有 @，body 帶 allowed_mentions parse []", async () => {
    await outSetup({ token: true });
    const g = await joinViaDiscord("@everyone");
    const o = await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${g.uid}` && x.status === "sent"));
    assert.ok(o, JSON.stringify(await outDocs("join")));
    const s = (await sentDocs()).find(x => x.id === `join-${g.uid}`); hasNot(s.content, "@"); has(s.content, "everyone"); assert.strictEqual(s.mentions, JSON.stringify({ parse: [] }));
  });
  await check("冷卻：同一種事件 10 分鐘內第二個不發（標 skipped: cooldown）；冷卻過了（把紀錄改舊）又發", async () => {
    await outSetup({ token: true });
    const a = await joinViaDiscord("Gina"); assert.ok(await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${a.uid}` && x.status === "sent")));
    const b = await joinViaDiscord("Henry");
    const ob = await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${b.uid}` && x.status !== "pending"));
    assert.ok(ob && ob.status === "skipped" && ob.reason === "cooldown", JSON.stringify(ob));
    assert.ok(!(await sentDocs()).some(x => x.id === `join-${b.uid}`), "冷卻中不能發");
    await fsSet("discordOutboxState/join", { at: Date.now() - (NUMS.discord.outCooldownMin * 60000 + 1000) });
    const c = await joinViaDiscord("Iris");
    assert.ok(await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${c.uid}` && x.status === "sent")), "冷卻過了應該發");
  });
  await check("沒 token：不發、不報錯、不佔冷卻（標 skipped: no-token），遊戲照常", async () => {
    await outSetup({ token: false });
    const g = await joinViaDiscord("Jack"); assert.ok((await fsGet(`members/${g.uid}`)));
    const o = await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${g.uid}` && x.status !== "pending"));
    assert.ok(o && o.status === "skipped" && o.reason === "no-token", JSON.stringify(o));
    assert.strictEqual((await sentDocs()).length, 0); assert.strictEqual(await fsGet("discordOutboxState/join"), null);
    assert.ok((await g.call("casino", { act: "peek" })).ok, "賭場照常");
  });
  await check("發送失敗：記 failed 和原因、不重試；加入照樣成功，賭場照常", async () => {
    await outSetup({ token: true, fail: true });
    const g = await joinViaDiscord("Kate"); assert.ok(await fsGet(`members/${g.uid}`), "加入沒被影響");
    const o = await waitFor(async () => (await outDocs("join")).find(x => x.id === `join-${g.uid}` && x.status === "failed"));
    assert.ok(o && /發送失敗/.test(o.error) && !/token/i.test(o.error), JSON.stringify(o));
    await sleep(2500); assert.strictEqual((await fsGet(`discordOutbox/join-${g.uid}`)).status, "failed", "不重試、不改回去");
    assert.strictEqual((await sentDocs()).length, 0);
    assert.ok((await g.call("casino", { act: "open" })).ok, "賭場照常");
  });
  await check("同一個事件只發一次：outbox 已經有這件事（同名文件），遊戲照常、不會再寫、不會再發", async () => {
    await outSetup({ token: true });
    const g = await gameUser("Lena");
    await fsSet(`discordOutbox/join-${g.uid}`, { kind: "join", text: "舊的那則", status: "sent", at: Date.now() });
    await fsSet(`discordJoinDay/${day}`, { n: 0 });
    const r = await say("/pepe-加入", randId()); const c = /join=([a-z0-9]{16})/.exec(r.text)[1];
    assert.ok((await g.call("join", { code: c })).ok);
    await sleep(1500); const d = await fsGet(`discordOutbox/join-${g.uid}`);
    assert.strictEqual(d.text, "舊的那則"); assert.strictEqual((await sentDocs()).length, 0);
  });
  await check("太舊的事件（寫進去超過 30 分鐘還沒發）不發", async () => {
    await outSetup({ token: true });
    await fsSet("discordOutbox/join-oldone", { kind: "join", text: "很久以前", status: "pending", at: Date.now() - 40 * 60000 });
    const o = await waitFor(async () => { const d = await fsGet("discordOutbox/join-oldone"); return d && d.status !== "pending" ? d : null; });
    assert.ok(o && o.status === "skipped" && o.reason === "old", JSON.stringify(o)); assert.strictEqual((await sentDocs()).length, 0);
  });
  const econUser = async () => { const u = await member("拚" + Math.random().toString(36).slice(2, 6)); return u; };
  await check("莊家破產（拚經濟失敗把莊家拚到負的）→ 頻道發一則「莊家破產了」", async () => {
    await outSetup({ token: true }); await setHouse(0);
    let broke = false;
    for (let i = 0; i < 6 && !broke; i++) { const u = await econUser(); for (let k = 0; k < NUMS.casino.econ.perDay && !broke; k++) { await setHouse(0); const r = await u.call("casino", { act: "econ" }); assert.ok(r.ok, r.message); broke = (await houseNow()) < 0; } }
    assert.ok(broke, "試了很多次都沒拚到破產");
    const o = await waitFor(async () => (await outDocs("broke")).find(x => x.status === "sent")); assert.ok(o, JSON.stringify(await outDocs("broke")));
    has((await sentDocs()).find(x => x.id === o.id).content, "莊家破產了");
  });
  await check("莊家被救回來（拚經濟 rescued）→ 頻道發「○○ 把莊家拚回來了」", async () => {
    await outSetup({ token: true }); await setHouse(-1000);
    let who = null;
    for (let i = 0; i < 10 && !who; i++) { const u = await econUser(); for (let k = 0; k < NUMS.casino.econ.perDay && !who; k++) { const r = await u.call("casino", { act: "econ" }); assert.ok(r.ok, r.message); if (r.result.econ.rescued) who = u; else if ((await houseNow()) >= 0) break; } }
    assert.ok(who, "沒有人把莊家拚回來");
    const o = await waitFor(async () => (await outDocs("rescued")).find(x => x.status === "sent")); assert.ok(o, JSON.stringify(await outDocs("rescued")));
    has((await sentDocs()).find(x => x.id === o.id).content, who.name, "把莊家拚回來了");
  });
  const handStand = async u => { // 下最小注，要到 17 點以上就停；回傳最後一次的結果
    let r = await u.call("casino", { act: "deal", text: String(NUMS.casino.minBet) }); assert.ok(r.ok && r.result.ok !== false, JSON.stringify(r));
    for (let i = 0; i < 8 && r.result.round && r.result.round.state === "playing"; i++) {
      const rd = r.result.round, act = rd.player.total >= 17 ? "stand" : "hit";
      r = await u.call("casino", { act, seq: rd.seq }); assert.ok(r.ok, r.message);
    }
    return r;
  };
  await check("有人把莊家打到破產的那一把（莊家 0、玩家贏）→ 頻道發「○○ 壹把把莊家打到破產了」，有暱稱", async () => {
    await outSetup({ token: true });
    const u = await member("打手" + Math.random().toString(36).slice(2, 5)); await u.call("casino", { act: "open" });
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) { await setHouse(0); await handStand(u); hit = (await houseNow()) < 0; }
    assert.ok(hit, "60 手都沒贏過？");
    const o = await waitFor(async () => (await outDocs("breaker")).find(x => x.status === "sent")); assert.ok(o, JSON.stringify(await outDocs("breaker")));
    has((await sentDocs()).find(x => x.id === o.id).content, u.name, "打到破產");
  });
  await check("實況開播 → 頻道發一則；斗內 → 發感謝（有兩人暱稱和金額），斗內冷卻是 1 分鐘（第二筆馬上來被擋，改舊後可以發）", async () => {
    await outSetup({ token: true }); await fsDel("casinoLive/main");
    const s = await member("主播Ann"), d = await member("路人Bo"), d2 = await member("路人Cy");
    for (const u of [s, d, d2]) await u.call("casino", { act: "open" });
    const on = await s.call("casino", { act: "liveOn" }); assert.ok(on.ok && on.result.ok !== false, JSON.stringify(on));
    const o1 = await waitFor(async () => (await outDocs("liveOn")).find(x => x.status === "sent")); assert.ok(o1, JSON.stringify(await outDocs("liveOn")));
    has((await sentDocs()).find(x => x.id === o1.id).content, "主播Ann", "開播");
    const dn = await d.call("casino", { act: "donate" }); assert.ok(dn.ok && dn.result.ok !== false, JSON.stringify(dn));
    const o2 = await waitFor(async () => (await outDocs("donate")).find(x => x.status === "sent")); assert.ok(o2, JSON.stringify(await outDocs("donate")));
    has((await sentDocs()).find(x => x.id === o2.id).content, "路人Bo", "主播Ann", "斗內", "籌碼");
    const dn2 = await d2.call("casino", { act: "donate" }); assert.ok(dn2.ok && dn2.result.ok !== false, JSON.stringify(dn2));
    const o3 = await waitFor(async () => (await outDocs("donate")).find(x => x.id !== o2.id && x.status !== "pending")); assert.ok(o3 && o3.status === "skipped" && o3.reason === "cooldown", JSON.stringify(o3));
    await s.call("casino", { act: "liveOff" });
  });
  await check("發出去的每一則（模擬器的 discordTestSent）：沒有 email、理智、怪癖、靈感，全都不 @ 任何人", async () => {
    await outSetup({ token: true });
    const g = await joinViaDiscord("Mia"); assert.ok(await waitFor(async () => (await sentDocs()).find(x => x.id === `join-${g.uid}`)));
    for (const s of await sentDocs()) { assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+|@/.test(s.content), s.content); assert.ok(!/理智|怪癖|靈感/.test(s.content), s.content); assert.strictEqual(s.mentions, JSON.stringify({ parse: [] })); }
  });
  // ---- 第三步：在 Discord 玩 ----
  await outSetup({ token: true });
  const bindNew = async name => { // 一個新的館友，綁好 Discord（拿到 100 萬獎勵）
    const u = await member(name), cr = await u.call("discordLinkCode"); if (!cr.ok) throw new Error("拿不到綁定碼：" + cr.message); const code = cr.result.code; u.did = randId();
    has((await say(`/pepe-綁定 ${code}`, u.did)).text, "綁定好了"); return u;
  };
  const roundOf = async u => { const d = await fsGet(`casinoRounds/${u.uid}`); return d ? JSON.parse(d.data) : null; };
  const btns = r => (r.comps[0] ? r.comps[0].components.map(c => c.custom_id) : []);
  const startHand = async (u, bet = "1000") => { // 開一手，要拿到還在打（有按鈕）的；前兩張剛好 21 點直接打完的就再來一手
    for (let i = 0; i < 40; i++) { const r = await say(`/pepe-21點 ${bet}`, u.did); assert.strictEqual(r.flags, 64, r.text); if (r.comps.length) return r; }
    throw new Error("40 手都是壹開始就 21 點？");
  };
  const finishHand = async (u, r) => { // 一直停牌到打完；回傳最後一則
    for (let i = 0; i < 6 && r.comps.length; i++) r = await press(btns(r)[1], u.did);
    return r;
  };
  const OUTCOME = /淨賺 \+|輸了 |不賺不賠/;
  await check("沒綁定的人用六個遊戲指令和按鈕：都只有本人看得到，教他怎麼綁定或加入", async () => {
    const x = randId();
    for (const c of ["/pepe-21點 1000", "/pepe-大禮包", "/pepe-餐車", "/pepe-拚經濟", "/pepe-實況", "/pepe-斗內"]) { const r = await say(c, x); assert.strictEqual(r.flags, 64, c); has(r.text, "/pepe-加入", "/pepe-綁定"); }
    const b = await press(`bj:hit:0:${x}`, x); assert.strictEqual(b.flags, 64); has(b.text, "/pepe-綁定");
    const f = await press(`food:${x}`, x, { menu: true, values: ["tea"] }); assert.strictEqual(f.flags, 64); has(f.text, "/pepe-綁定");
  });
  await check("21 點整手：下注 → 按鈕要牌／停牌 → 打完；牌局只有本人看得到；seq 重按被擋、別人的按鈕被擋、什麼都沒改", async () => {
    const u = await bindNew("牌手阿花"); let r = await startHand(u);
    has(r.text, "21 點", "下注 1,000", "你的牌", "莊家"); hasNot(r.text, "理智", "@");
    assert.deepStrictEqual(r.comps[0].components.map(c => c.label), ["要牌", "停牌"]);
    const ids = btns(r); has(ids[0], "bj:hit:0:" + u.did); has(ids[1], "bj:stand:0:" + u.did);
    const before = await roundOf(u); assert.strictEqual(before.state, "playing"); const walletBefore = (await walletOf(u.uid)).chips;
    // 別人的按鈕
    const other = await press(ids[1], randId()); assert.strictEqual(other.type, 4); assert.strictEqual(other.flags, 64); has(other.text, "不是你的");
    assert.deepStrictEqual(await roundOf(u), before, "別人按了之後牌局沒變");
    // 要牌 (seq 0 → 1)
    const hit = await press(ids[0], u.did); assert.strictEqual(hit.type, 7, JSON.stringify(hit.r.json).slice(0, 200)); has(hit.text, "你的牌");
    const afterHit = await roundOf(u); assert.strictEqual(afterHit.player.length, before.player.length + 1);
    // 同一顆按鈕再按一次（seq 過期）：被擋，牌局不變，訊息換成現在的樣子
    const again = await press(ids[0], u.did); assert.strictEqual(again.type, 7); has(again.text, "不是最新的");
    assert.deepStrictEqual(await roundOf(u), afterHit, "重按之後牌局沒變（沒有多要一張）");
    // 打完
    const done = await finishHand(u, hit); assert.strictEqual(done.comps.length, 0, "打完就沒有按鈕了");
    has(done.text, "你現在有"); assert.ok(OUTCOME.test(done.text), done.text); hasNot(done.text, "理智");
    const fin = await roundOf(u); assert.strictEqual(fin.state, "done");
    // 打完之後再按舊的按鈕：不會重複結算
    const w1 = (await walletOf(u.uid)).chips; const stale = await press(ids[1], u.did); assert.strictEqual(stale.type, 7); assert.strictEqual((await walletOf(u.uid)).chips, w1, "不重複派彩");
    // 錢包的數字跟 Discord 說的一樣（共用）
    const said1 = Number(/你現在有 ([\d,]+) 籌碼/.exec(done.text)[1].replace(/,/g, "")); assert.strictEqual(said1, w1);
    assert.strictEqual((await u.call("casino", { act: "peek" })).result.chips, w1, "遊戲讀到的籌碼一樣");
  });
  await check("打完自動在頻道公開一行結果（只有暱稱和輸贏）；同一個人 5 分鐘內連打併成同一則（編輯第壹則）", async () => {
    await outSetup({ token: true });
    const u = await bindNew("牌手小明");
    for (let i = 0; i < 2; i++) { const r = await startHand(u); await finishHand(u, r); }
    const docs = (await outDocs("bj")).filter(d => d.uid === u.uid).sort((a, b) => a.at - b.at);
    const ok = await waitFor(async () => { const ds = (await outDocs("bj")).filter(d => d.uid === u.uid); return ds.length >= 2 && ds.every(d => d.status !== "pending" && d.status !== "sending") ? ds : null; });
    assert.ok(ok, "outbox：" + JSON.stringify(await outDocs("bj")));
    const sorted = ok.sort((a, b) => a.at - b.at); assert.strictEqual(sorted[0].status, "sent"); assert.ok(sorted.slice(1).every(d => d.status === "merged"), JSON.stringify(sorted.map(d => d.status)));
    const first = (await sentDocs()).find(s => s.id === sorted[0].id); assert.ok(first, "第壹則有發");
    has(first.content, "牌手小明"); hasNot(first.content, "@", "籌碼餘額", "你現在有"); assert.strictEqual(first.mentions, JSON.stringify({ parse: [] }));
    assert.strictEqual((await sentDocs()).filter(s => sorted.some(d => d.id === s.id)).length, 1, "這個人只有壹則訊息（其餘是編輯）");
    has(first.content, `連打了 ${sorted.length} 手 21 點`); assert.strictEqual(first.edits, sorted.length - 1);
    assert.strictEqual(docs.length, sorted.length);
  });
  await check("沒 token 的時候打完 21 點：遊戲照常、頻道不發、不報錯", async () => {
    await outSetup({ token: false });
    const u = await bindNew("牌手無名"); const r = await startHand(u); const d = await finishHand(u, r); assert.ok(OUTCOME.test(d.text));
    const o = await waitFor(async () => (await outDocs("bj")).find(x => x.uid === u.uid && x.status !== "pending")); assert.ok(o && o.status === "skipped" && o.reason === "no-token", JSON.stringify(o));
    assert.strictEqual((await sentDocs()).length, 0);
  });
  await check("發送失敗的時候打完 21 點：遊戲照常（結果、籌碼都算）", async () => {
    await outSetup({ token: true, fail: true });
    const u = await bindNew("牌手倒楣"); const r = await startHand(u); const d = await finishHand(u, r); assert.ok(OUTCOME.test(d.text), d.text);
    const o = await waitFor(async () => (await outDocs("bj")).find(x => x.uid === u.uid && x.status === "failed")); assert.ok(o && /發送失敗/.test(o.error), JSON.stringify(o));
    assert.strictEqual((await roundOf(u)).state, "done");
    await outSetup({ token: true });
  });
  await check("遊戲開一半的牌，可以到 Discord 打完（不下注、直接 /pepe-21點）；Discord 開一半的，遊戲也能打完，Discord 的舊按鈕被擋", async () => {
    const u = await bindNew("牌手兩邊跑");
    // (a) 遊戲開、Discord 打完
    let g = null; for (let i = 0; i < 40 && !g; i++) { const r = await u.call("casino", { act: "deal", text: "1000" }); assert.ok(r.ok, r.message); if (r.result.round && r.result.round.state === "playing") g = r.result; }
    assert.ok(g, "遊戲開不出還在打的牌");
    const r = await say("/pepe-21點", u.did); assert.strictEqual(r.flags, 64); has(r.text, "接著打", "你的牌"); assert.ok(r.comps.length, "有按鈕");
    has(btns(r)[1], `bj:stand:${g.round.seq}:${u.did}`);
    const done = await finishHand(u, r); assert.ok(OUTCOME.test(done.text), done.text);
    const view = (await u.call("casino", { act: "wk" })).result; assert.strictEqual(view.round.state, "done", "遊戲這邊也是打完了"); assert.strictEqual(view.round.out.kind, (await roundOf(u)).out.kind);
    assert.strictEqual(view.wallet.chips, (await walletOf(u.uid)).chips);
    // (b) Discord 開、遊戲停牌，Discord 的舊按鈕被擋
    const r2 = await startHand(u); const ids = btns(r2);
    const st = await u.call("casino", { act: "stand", seq: Number(ids[1].split(":")[2]) }); assert.ok(st.ok && st.result.ok !== false, JSON.stringify(st));
    const w1 = (await walletOf(u.uid)).chips; const late = await press(ids[1], u.did); assert.strictEqual(late.type, 7); has(late.text, "不是最新的"); assert.strictEqual(late.comps.length, 0, "已經打完，不再有按鈕");
    assert.strictEqual((await walletOf(u.uid)).chips, w1, "不會多結算");
    // 遊戲裡打完的那手，不會在頻道公開（只有在 Discord 打完的才公開）
    const rid = (await roundOf(u)).id;
    assert.ok(!(await outDocs("bj")).some(d => d.id === `bj-${rid}`), "在遊戲裡打完的不公開");
  });
  await check("下注不合規則：照遊戲的挑剔話回本人（沒下注、不是數字、太少、太多、錢不夠）；沒有牌局被開出來", async () => {
    const u = await bindNew("牌手挑剔"); const before = await roundOf(u);
    for (const [bet, re] of [["", /要下多少/], ["abc", /再下壹次abc/], ["5", /最少要下/], ["999999999999", /(最多只能下|你才沒那麼有錢)/], ["2000萬", /(最多只能下|你才沒那麼有錢)/]]) {
      const r = await say(bet ? `/pepe-21點 ${bet}` : "/pepe-21點", u.did); assert.strictEqual(r.flags, 64, bet); assert.ok(re.test(r.text), `${bet} → ${r.text}`); assert.strictEqual(r.comps.length, 0);
    }
    assert.deepStrictEqual(await roundOf(u), before);
    const ok = await say("/pepe-21點 1萬", u.did); has(ok.text, "下注 10,000");  // 「10萬」「1萬」這種寫法也行
    await finishHand(u, ok);
  });
  await check("次數和上限跟遊戲共用：拚經濟壹天 3 次（遊戲 2 次 + Discord 1 次），第 4 次兩邊都被擋", async () => {
    const u = await bindNew("拚經濟共用"); const per = NUMS.casino.econ.perDay;
    for (let i = 0; i < per - 1; i++) assert.ok((await u.call("casino", { act: "econ" })).result.ok !== false);
    const r = await say("/pepe-拚經濟", u.did); assert.strictEqual(r.flags, 0, r.text); has(r.text, "拚了壹次經濟", "拚 經濟，做 就對了", "今天還能拚 0 次"); hasNot(r.text, "理智", "@");
    const r2 = await say("/pepe-拚經濟", u.did); assert.strictEqual(r2.flags, 64); has(r2.text, "今天拚夠了");
    const g = await u.call("casino", { act: "econ" }); assert.ok(g.result.ok === false, "遊戲這邊也被擋");
    assert.strictEqual((await walletOf(u.uid)).ec.n, per);
  });
  await check("大禮包：Discord 開、遊戲開，壹天的包數共用；開完回本人「沒有可以開的」；全頻道看得到", async () => {
    const u = await bindNew("禮包共用");
    assert.ok((await u.call("casino", { act: "pack", n: 1 })).result.ok !== false);
    const r = await say("/pepe-大禮包", u.did); assert.strictEqual(r.flags, 0, r.text); has(r.text, "開大禮包", "禮包", "合計 +", "剩下"); hasNot(r.text, "理智");
    let refused = null; for (let i = 0; i < 15 && !refused; i++) { const x = await say("/pepe-大禮包", u.did); if (x.flags === 64) refused = x; }
    assert.ok(refused && /沒有可以開的大禮包/.test(refused.text), refused && refused.text);
    assert.ok((await u.call("casino", { act: "pack", n: 1 })).result.ok === false, "遊戲這邊也沒有了");
    const w = await walletOf(u.uid); assert.ok(w.pk.opened >= 2);
    const multi = await bindNew("禮包兩包"); const m2 = await say("/pepe-大禮包 2", multi.did); assert.strictEqual((m2.text.match(/・/g) || []).length, 2, m2.text);
  });
  await check("餐車：選單（9 樣、只有本人看得到）→ 選壹樣 → 扣籌碼、不顯示理智；別人的選單被擋", async () => {
    const u = await bindNew("餐車客人"); const m = await say("/pepe-餐車", u.did);
    assert.strictEqual(m.flags, 64); has(m.text, "餐車", "籌碼"); const sel = m.comps[0].components[0]; assert.strictEqual(sel.type, 3); assert.strictEqual(sel.options.length, 9); has(sel.custom_id, "food:" + u.did);
    assert.ok(sel.options.every(o => o.label.length <= 100 && o.value && o.description.length <= 100));
    const other = await press(sel.custom_id, randId(), { menu: true, values: ["tea"] }); assert.strictEqual(other.flags, 64); has(other.text, "不是你的");
    const w0 = (await walletOf(u.uid)).chips; const buy = await press(sel.custom_id, u.did, { menu: true, values: ["tea"] });
    assert.strictEqual(buy.type, 7); has(buy.text, "冰涼麥茶", "謝謝"); hasNot(buy.text, "理智"); assert.strictEqual(buy.comps[0].components[0].type, 3, "選單還在，可以再買");
    assert.strictEqual((await walletOf(u.uid)).chips, w0 - 1750);
    const poor = await press(sel.custom_id, u.did, { menu: true, values: ["admiral"] }); // 200 萬，買得起（100 萬 + 獎勵）？買不起就會說錢不夠
    assert.strictEqual(poor.type, 7);
    const bad = await press(sel.custom_id, u.did, { menu: true, values: ["不存在的"] }); assert.strictEqual(bad.type, 7);
  });
  await check("存檔：餐車加心情要改存檔 → rev 加壹、寫在同壹個交易、事後通知 save_changed；舊 rev 的分頁寫不進去（不會把伺服器的蓋掉）", async () => {
    const u = await bindNew("存檔測試"); const G = require("../test/load_shared.cjs").load(); const P = JSON.parse(JSON.stringify(G.newProfile("challenge"))); P.mood = 50; P.sanity = 60;
    await fsSet(`saves/${u.uid}`, { data: JSON.stringify({ profiles: { challenge: P }, current: "challenge" }), rev: 7 });
    const m = await say("/pepe-餐車", u.did), sel = m.comps[0].components[0];
    const buy = await press(sel.custom_id, u.did, { menu: true, values: ["chicken"] }); assert.strictEqual(buy.type, 7); has(buy.text, "烤雞肉", "心情 +"); hasNot(buy.text, "理智");
    const s = await fsGet(`saves/${u.uid}`); const S2 = JSON.parse(s.data);
    assert.strictEqual(s.rev, 8, "rev 加壹"); assert.ok(S2.profiles.challenge.mood > 50, "心情真的加了：" + S2.profiles.challenge.mood);
    const inbox = (await req(PORT.rtdb, "GET", `/inbox/${u.uid}.json?ns=${PROJECT}`, null, OWNER)).json || {};
    assert.ok(Object.values(inbox).some(x => x.t === "save_changed" && x.rev === 8), "有通知遊戲分頁重讀：" + JSON.stringify(inbox));
    // 遊戲分頁用舊的 rev 7 存檔：遊戲的 save() 是「現在的 rev 不等於手上的 rev 就不寫」——這裡照同樣的規則用 REST 的前置條件模擬
    const cur = (await fsGet(`saves/${u.uid}`)).rev; assert.notStrictEqual(cur, 7, "伺服器已經是新的 rev，舊分頁的 save() 會碰到 conflict，不會寫");
  });
  await check("理智低的人打 21 點：看錯牌照算，但所有回覆都不寫「理智」；連輸的提示也不寫；沒有存檔的人只算籌碼", async () => {
    const u = await bindNew("牌手眼花"); const G = require("../test/load_shared.cjs").load(); const P = JSON.parse(JSON.stringify(G.newProfile("challenge"))); P.mood = 50; P.sanity = 5;
    await fsSet(`saves/${u.uid}`, { data: JSON.stringify({ profiles: { challenge: P }, current: "challenge" }), rev: 1 });
    let warped = false, streak = false;
    for (let i = 0; i < 60 && !(warped && streak); i++) {
      const r = await say("/pepe-21點 100", u.did); hasNot(r.text, "理智"); if (/眼睛有點花/.test(r.text)) warped = true;
      const d = r.comps.length ? await finishHand(u, r) : r; hasNot(d.text, "理智"); if (/看錯了|眼睛有點花/.test(d.text)) warped = true; if (/手心冒汗/.test(d.text)) streak = true;
    }
    assert.ok(warped, "60 手都沒有看錯過牌？"); // 理智 5：每張牌看錯的機率很高
    const plain = await bindNew("牌手沒存檔"); const r = await startHand(plain); const d = await finishHand(plain, r); assert.ok(OUTCOME.test(d.text));
  });
  await check("實況和斗內：Discord 開播（全頻道、不另外寫 outbox）→ 別人斗內（全頻道感謝）→ 下播；沒人在播、斗內自己、重複開播都回本人", async () => {
    await outSetup({ token: true }); await fsDel("casinoLive/main");
    const s = await bindNew("主播小花"), d = await bindNew("斗內小明");
    const none = await say("/pepe-斗內", d.did); assert.strictEqual(none.flags, 64); has(none.text, "沒有人在實況");
    const on = await say("/pepe-實況", s.did); assert.strictEqual(on.flags, 0, on.text); has(on.text, "主播小花 開播了", "播到");
    const again = await say("/pepe-實況", s.did); assert.strictEqual(again.flags, 64); has(again.text, "已經在實況了");
    const taken = await say("/pepe-實況", d.did); assert.strictEqual(taken.flags, 64); has(taken.text, "主播小花 正在實況");
    const me = await say("/pepe-斗內", s.did); assert.strictEqual(me.flags, 64); has(me.text, "不能斗內給自己");
    const w0 = (await walletOf(s.uid)).chips, dw0 = (await walletOf(d.uid)).chips;
    const dn = await say("/pepe-斗內", d.did); assert.strictEqual(dn.flags, 0, dn.text); has(dn.text, "斗內小明", "斗內", "實況主：主播小花");
    const got = (await walletOf(s.uid)).chips - w0; assert.ok(got >= 20000 && got <= 260000, "金額隨機 2 萬～26 萬：" + got); assert.strictEqual(dw0 - (await walletOf(d.uid)).chips, got, "守恆");
    const v = (await d.call("casino", { act: "live" })).result; assert.ok(v.live.on && v.live.nick === "主播小花", "遊戲這邊看得到同一位實況主");
    const off = await say("/pepe-實況 off", s.did); assert.strictEqual(off.flags, 0); has(off.text, "主播小花 下播了");
    const notYou = await say("/pepe-實況 off", s.did); assert.strictEqual(notYou.flags, 64);
    await sleep(1200); assert.strictEqual((await outDocs("liveOn")).length + (await outDocs("donate")).length, 0, "Discord 開的播、斗內的回覆本身就是公開的，不再寫 outbox");
  });
  await fsDel("discordTest/out"); await outClear();
  await check("拿掉模擬器的測試設定：改用 repo 裡的正式常數（Application ID 等 11-09 已填），測試金鑰簽的請求回 401；常數若是空的則回 503；不影響別的 Function", async () => {
    await fsDel("discordTest/config"); const r = await bot({ type: 1 });
    const filled = /publicKey: "[0-9a-f]{64}"/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "functions", "discord_config.js"), "utf8"));
    assert.strictEqual(r.status, filled ? 401 : 503);
    assert.ok((await alice.call("discordLinkState")).result.configured === filled);
    assert.ok((await alice.call("casino", { act: "peek" })).ok, "賭場照常");
    await fsSet("discordTest/config", { publicKey: PUB_HEX, guildId: GUILD });
  });

  // ---- 全部的回覆：不能有 email、理智、怪癖、靈感 ----
  await check(`所有回覆（${said.length} 則）都沒有 email、理智、怪癖、靈感`, async () => {
    for (const s of said) { assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(s), "有 email：" + s); assert.ok(!/理智|怪癖|靈感/.test(s), "有不該說的：" + s); }
  });

  if (process.argv.includes("--show")) { // 印幾則新指令的回覆，看長什麼樣子（含按鈕的 JSON）
    for (const re of [/下注 [\d,]+\n你的牌/, /開大禮包/, /餐車/, /拚了壹次/, /開播了/, /斗內了/, /連打了/]) { const s = said.find(x => re.test(x)); if (s) console.log("\n----------\n" + s); }
  }
  const bad = results.filter(r => !r[0]).length;
  const sorted = timings.slice().sort((a, b) => a - b), p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  console.log(`\n${results.length - bad}／${results.length} 項通過${bad ? `，${bad} 項沒過` : ""}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
  console.log(`模擬器的回應時間：第壹個請求（冷啟動）${firstMs}ms；${timings.length} 個請求的中位數 ${p(0.5)}ms、第 90 百分位 ${p(0.9)}ms、最慢 ${sorted[sorted.length - 1]}ms。這是模擬器，正式環境還沒量。`);
  return bad;
}

(async () => {
  try { process.exitCode = arg("cmd") ? await single() || 0 : await all() ? 1 : 0; }
  catch (e) { console.error(e && e.stack || e); process.exitCode = 1; }
})();
