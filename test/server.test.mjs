// 遊戲伺服器的測試（npm test 會跑）：在 Node 裡開伺服器（暫存的資料庫、隨便一個 port）→ dev 登入
// → 存存檔、讀回來 → 兩個 WebSocket 假玩家看在線名單 → 斷線、心跳逾時 → 訊息的大小和次數
// → 邀請名單、正式環境不准 dev 登入 → 資料表搬家 → web/src/net.js 在 Node 裡跑一遍。
// 時間都改短（心跳逾時 1.5 秒），整支大約幾秒。暫存的資料庫最後會刪掉。
// 需要 Node 22.13 以上（node:sqlite）。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

try {
  await import("node:sqlite");
} catch {
  console.log(`0 passed, 0 failed（跳過：Node ${process.version} 沒有 node:sqlite，伺服器要 Node 22.13 以上）`);
  process.exit(0);
}

const { default: WebSocket } = await import("ws");
const { readConfig } = await import("../server/config.js");
const { startServer } = await import("../server/app.js");
const { openDb, listMigrations, addOnlyProblems, MIGRATIONS_DIR } = await import("../server/db.js");
const { createDevAuth } = await import("../server/auth/dev.js");
const { createNet } = await import("../web/src/net.js");

const tmp = mkdtempSync(join(tmpdir(), "pepe4-server-test-"));
const servers = [];
const sockets = [];
let passed = 0, failed = 0;

async function ok(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; console.log(`✗ ${name}\n    ${String(e && e.stack || e).split("\n").slice(0, 6).join("\n    ")}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 測試用的設定：時間都改短
function testConfig(env = {}, over = {}) {
  return {
    ...readConfig({ NODE_ENV: "test", PORT: "0", DB_PATH: join(tmp, "main.db"), SNAPSHOT_KEEP: "3", SNAPSHOT_GAP_MIN: "0", SAVE_MAX_KB: "64", ...env }),
    quiet: true,
    beatEveryMs: 200,
    beatTimeoutMs: 1500,
    sweepMs: 100,
    offlineGraceMs: 0,
    helloTimeoutMs: 600,
    rosterDelayMs: 20,
    loginPerMin: 1000,
    ...over,
  };
}
async function serve(cfg) { const s = await startServer(cfg); servers.push(s); return s; }

async function api(srv, method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
  if (token) h.authorization = "Bearer " + token;
  const res = await fetch(srv.url + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  let json = null;
  try { json = await res.json(); } catch { /* 不是 JSON */ }
  return { status: res.status, json };
}
async function devLogin(srv, name) {
  const r = await api(srv, "POST", "/api/login", { body: { name } });
  assert.equal(r.status, 200, `登入 ${name}：${JSON.stringify(r.json)}`);
  return r.json;
}

// 假玩家：用 ws 套件連。會自己送心跳（stopBeat() 停掉）。
function player(srv, { autoBeat = true } = {}) {
  const ws = new WebSocket(srv.url.replace(/^http/, "ws") + "/ws");
  sockets.push(ws);
  const inbox = [], all = [], waiters = new Set();
  let closed = null, beat = null;
  const wake = () => { for (const w of [...waiters]) w(); };
  ws.on("message", d => { const m = JSON.parse(d.toString()); inbox.push(m); all.push(m); wake(); });
  ws.on("close", (code, reason) => { closed = { code, reason: reason.toString() }; if (beat) clearInterval(beat); wake(); });
  ws.on("error", () => { /* close 會接著來 */ });
  const opened = new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  const p = {
    ws, all,
    opened,
    send(obj) { ws.send(typeof obj === "string" ? obj : JSON.stringify(obj)); },
    async hello(token) {
      await opened;
      p.send({ t: "hello", v: 1, token });
      const w = await p.next(m => m.t === "welcome", "welcome");
      if (autoBeat) beat = setInterval(() => { if (ws.readyState === 1) p.send({ t: "beat", active: true }); }, 150);
      return w;
    },
    stopBeat() { clearInterval(beat); beat = null; },
    // 等到一則符合條件的訊息；它和它前面的都拿掉（不會被舊的訊息騙）
    next(pred, label = "", ms = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const i = inbox.findIndex(pred);
          if (i < 0) return;
          const m = inbox[i];
          inbox.splice(0, i + 1);
          done(); resolve(m);
        };
        const t = setTimeout(() => { done(); reject(new Error(`等不到：${label}；最後收到 ${JSON.stringify(inbox.slice(-3))}`)); }, ms);
        const done = () => { clearTimeout(t); waiters.delete(check); };
        waiters.add(check);
        check();
      });
    },
    closedWith(ms = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => { if (closed) { done(); resolve(closed); } };
        const t = setTimeout(() => { done(); reject(new Error("等不到斷線")); }, ms);
        const done = () => { clearTimeout(t); waiters.delete(check); };
        waiters.add(check);
        check();
      });
    },
    close() { p.stopBeat(); ws.close(); },
  };
  return p;
}
const rosterOf = m => (m.t === "roster" ? m.players : m.t === "welcome" ? m.roster : null);
const rowOf = (m, id) => (rosterOf(m) || []).find(r => r.id === id);
const sees = (id, pred) => m => { const r = rosterOf(m) && rowOf(m, id); return !!r && pred(r); };

// 像遊戲的 SAVE（v、current、profiles、settings），中文、巢狀都有
function fakeSave(n = 1) {
  return {
    v: 3, current: "challenge",
    profiles: { challenge: { insp: 30 + n, sanity: 64, pepes: { "普通|開心|綠|毛帽|站|無|無": { n: 2, perfect: false } }, hall: ["a", "b"] }, free: null },
    settings: { font: "m", reduceMotion: false, muted: false, dayMin: 15 },
    tutorialDone: true,
  };
}

let srv, A, B, C;
try {
  srv = await serve(testConfig());

  await ok("健康檢查：/api/health 不用登入，回版本和登入方式", async () => {
    const r = await api(srv, "GET", "/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.auth, "dev");
    assert.match(r.json.version, /^\d{4}\.\d{2}\.\d{2}-\d+$/);
  });

  await ok("沒登入（或 token 不對）不能讀存檔、不能看自己", async () => {
    assert.equal((await api(srv, "GET", "/api/save")).status, 401);
    assert.equal((await api(srv, "GET", "/api/save", { token: "x".repeat(43) })).status, 401);
    const r = await api(srv, "GET", "/api/me");
    assert.equal(r.status, 401);
    assert.equal(r.json.error, "need_login");
  });

  await ok("dev 登入：header、網址、body 都能帶名字；同一個名字是同一個帳號", async () => {
    const h = await api(srv, "POST", "/api/login", { headers: { "x-dev-user": encodeURIComponent("小明") } });
    assert.equal(h.status, 200);
    assert.equal(h.json.me.nick, "小明");
    assert.equal(h.json.me.email, "小明@dev.local");
    assert.ok(h.json.token.length >= 40);
    A = { token: h.json.token, id: h.json.me.id };
    const u = await api(srv, "POST", "/api/login?user=" + encodeURIComponent("小華"));
    assert.equal(u.status, 200);
    B = { token: u.json.token, id: u.json.me.id };
    const b = await devLogin(srv, "test_c");
    C = { token: b.token, id: b.me.id };
    assert.notEqual(A.id, B.id);
    const again = await devLogin(srv, "小明");
    assert.equal(again.me.id, A.id);
    assert.notEqual(again.token, A.token);
  });

  await ok("dev 登入：沒帶名字、名字有空白會被擋", async () => {
    const none = await api(srv, "POST", "/api/login");
    assert.equal(none.status, 400);
    assert.equal(none.json.error, "need_name");
    const bad = await api(srv, "POST", "/api/login", { body: { name: "a b" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, "bad_name");
  });

  await ok("存檔：一開始是空的；存了讀得回來，rev 加 1", async () => {
    const empty = await api(srv, "GET", "/api/save", { token: A.token });
    assert.equal(empty.status, 200);
    assert.equal(empty.json.data, null);
    assert.equal(empty.json.rev, 0);
    const put = await api(srv, "PUT", "/api/save", { token: A.token, body: { data: fakeSave(1), baseRev: 0 } });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    assert.equal(put.json.rev, 1);
    const got = await api(srv, "GET", "/api/save", { token: A.token });
    assert.deepEqual(got.json.data, fakeSave(1));
    assert.equal(got.json.rev, 1);
  });

  await ok("存檔：拿舊的 rev 存會被擋（409，別的分頁先存了）", async () => {
    const r = await api(srv, "PUT", "/api/save", { token: A.token, body: { data: fakeSave(9), baseRev: 0 } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error, "conflict");
    assert.equal(r.json.rev, 1);
    const got = await api(srv, "GET", "/api/save", { token: A.token });
    assert.deepEqual(got.json.data, fakeSave(1)); // 沒被蓋掉
  });

  await ok("存檔：格式不對、沒帶 rev、太大、不是 JSON 都會被擋", async () => {
    const put = body => api(srv, "PUT", "/api/save", { token: A.token, body });
    assert.equal((await put({ data: [], baseRev: 1 })).status, 400);
    assert.equal((await put({ data: null, baseRev: 1 })).status, 400);
    assert.equal((await put({ data: {} })).status, 400);
    const big = await put({ data: { junk: "x".repeat(70 * 1024) }, baseRev: 1 });
    assert.equal(big.status, 413);
    assert.equal(big.json.error, "too_big");
    assert.equal((await api(srv, "PUT", "/api/save", { token: A.token, body: "{bad", headers: { "content-type": "application/json" } })).status, 400);
    assert.equal((await api(srv, "PUT", "/api/save", { token: A.token, body: "{}", headers: { "content-type": "text/plain" } })).status, 415);
  });

  await ok("存檔：被蓋掉的留快照，只留最近 3 份", async () => {
    for (let n = 2; n <= 5; n++) {
      const r = await api(srv, "PUT", "/api/save", { token: A.token, body: { data: fakeSave(n), baseRev: n - 1 } });
      assert.equal(r.json.rev, n);
    }
    const snaps = srv.store.snapshots(A.id);
    assert.deepEqual(snaps.map(s => s.rev), [4, 3, 2]);
    assert.ok(snaps.every(s => s.reason === "auto"));
  });

  await ok("存檔：各存各的，別人的讀不到", async () => {
    const r = await api(srv, "GET", "/api/save", { token: B.token });
    assert.equal(r.json.data, null);
  });

  await ok("暱稱：空的、太長、看不見的字會被擋；改了就變", async () => {
    assert.equal((await api(srv, "PUT", "/api/me", { token: A.token, body: { nick: "  " } })).status, 400);
    assert.equal((await api(srv, "PUT", "/api/me", { token: A.token, body: { nick: "長".repeat(13) } })).status, 400);
    assert.equal((await api(srv, "PUT", "/api/me", { token: A.token, body: { nick: "小​明" } })).status, 400);
    const r = await api(srv, "PUT", "/api/me", { token: A.token, body: { nick: "小明明" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.nick, "小明明");
  });

  let pa, pb;
  await ok("在線名單：A 連上收到 welcome；B 上線，A 收到名單更新", async () => {
    pa = player(srv);
    const w = await pa.hello(A.token);
    assert.equal(w.me.id, A.id);
    assert.equal(w.me.nick, "小明明");
    assert.equal(w.v, 1);
    assert.ok(w.beatEvery > 0);
    const self = rowOf(w, A.id);
    assert.equal(self.me, true);
    assert.equal(self.status, "online");
    assert.equal(rowOf(w, B.id).status, "offline");
    pb = player(srv);
    await pb.hello(B.token);
    const m = await pa.next(sees(B.id, r => r.status === "online"), "A 看到 B 在線");
    assert.equal(rowOf(m, B.id).nick, "小華");
    assert.equal(rowOf(m, B.id).lastSeen, null);
  });

  await ok("在線名單：B 說在畫廊，A 看得到 B 在哪裡", async () => {
    pb.send({ t: "where", room: "gallery" });
    await pa.next(sees(B.id, r => r.room === "gallery"), "A 看到 B 在畫廊");
    pb.send({ t: "where", room: "cellar:b2" });
    await pa.next(sees(B.id, r => r.room === "cellar:b2"), "A 看到 B 在 B2");
  });

  await ok("隱身：A 看到 B 離線、看不到在哪裡；B 自己看得到自己在線", async () => {
    const r = await api(srv, "PUT", "/api/me", { token: B.token, body: { invisible: true } });
    assert.equal(r.json.invisible, true);
    const m = await pa.next(sees(B.id, r => r.status === "offline"), "A 看到 B 離線");
    assert.equal(rowOf(m, B.id).room, null);
    assert.equal(typeof rowOf(m, B.id).lastSeen, "string");
    await pb.next(sees(B.id, r => r.me && r.invisible && r.status === "online"), "B 看到自己隱身");
    await api(srv, "PUT", "/api/me", { token: B.token, body: { invisible: false } });
    await pa.next(sees(B.id, r => r.status === "online" && r.room === "cellar:b2"), "B 不隱身了");
  });

  await ok("名單裡沒有任何人的 email", async () => {
    for (const m of [...pa.all, ...pb.all]) assert.ok(!JSON.stringify(m).includes("@"), JSON.stringify(m));
  });

  await ok("斷線：B 關掉，A 看到 B 離線，有最後上線的時間", async () => {
    pb.close();
    const m = await pa.next(sees(B.id, r => r.status === "offline"), "A 看到 B 離線");
    const seen = Date.parse(rowOf(m, B.id).lastSeen);
    assert.ok(Date.now() - seen < 5000, "最後上線是剛剛");
  });

  await ok("心跳：太久沒心跳（測試 1.5 秒）就斷線（4010），別人看到離線", async () => {
    const pc = player(srv, { autoBeat: false });
    await pc.hello(C.token);
    await pa.next(sees(C.id, r => r.status === "online"), "A 看到 C 在線");
    const c = await pc.closedWith(4000);
    assert.equal(c.code, 4010);
    await pa.next(sees(C.id, r => r.status === "offline"), "A 看到 C 離線");
  });

  await ok("訊息檢查：不是 JSON、不認得的種類、欄位不對都回 error（id 帶回來）", async () => {
    const pd = player(srv);
    await pd.hello(C.token);
    pd.send("not json");
    assert.equal((await pd.next(m => m.t === "error", "bad_json")).code, "bad_json");
    pd.send({ t: "nope" });
    assert.equal((await pd.next(m => m.t === "error", "unknown")).code, "bad_message");
    pd.send({ t: "where", room: "Bad Room!", id: 7 });
    const e = await pd.next(m => m.t === "error", "bad room");
    assert.equal(e.code, "bad_message");
    assert.equal(e.re, 7);
    pd.send({ t: "hello", v: 1, token: C.token });
    assert.equal((await pd.next(m => m.t === "error", "already")).code, "already_hello");
    pd.close();
  });

  await ok("訊息檢查：一則超過 4 KB 就斷線（1009）", async () => {
    const pe = player(srv);
    await pe.hello(C.token);
    pe.send({ t: "where", room: "a" + "b".repeat(5000) });
    assert.equal((await pe.closedWith()).code, 1009);
  });

  await ok("訊息檢查：送太快先回 rate_limited，再一直送就斷線（4008）", async () => {
    const pf = player(srv, { autoBeat: false });
    await pf.hello(C.token);
    for (let i = 0; i < 40; i++) pf.send({ t: "beat" });
    assert.equal((await pf.next(m => m.t === "error", "rate")).code, "rate_limited");
    assert.equal((await pf.closedWith()).code, 4008);
  });

  await ok("WebSocket 登入：不送 hello（4002）、token 不對（4001）、先送別的（4001）、版本不對（4000）", async () => {
    const quiet = player(srv);
    await quiet.opened;
    assert.equal((await quiet.closedWith()).code, 4002);
    const bad = player(srv);
    await bad.opened;
    bad.send({ t: "hello", v: 1, token: "z".repeat(43) });
    assert.equal((await bad.closedWith()).code, 4001);
    const early = player(srv);
    await early.opened;
    early.send({ t: "beat" });
    assert.equal((await early.closedWith()).code, 4001);
    const old = player(srv);
    await old.opened;
    old.send({ t: "hello", v: 2, token: C.token });
    assert.equal((await old.closedWith()).code, 4000);
  });

  await ok("net.js：在 Node 裡登入、讀存檔、存檔（含 saveSoon、別人先存的 conflict）", async () => {
    const net = createNet({ base: srv.url, storage: null, window: null, saveDelayMs: 20 });
    const info = await net.info();
    assert.equal(info.auth, "dev");
    assert.equal(await net.restore(), null);
    const me = await net.login({ name: "net_a" });
    assert.equal(me.nick, "net_a");
    assert.equal(net.loggedIn, true);
    const first = await net.loadSave();
    assert.equal(first.data, null);
    assert.equal((await net.save(fakeSave(1))).rev, 1);
    net.saveSoon(fakeSave(2));
    net.saveSoon(fakeSave(3)); // 合成一次
    await net.flush();
    assert.equal(net.rev, 2);
    assert.deepEqual((await net.loadSave()).data, fakeSave(3));
    // 另一個裝置先存了
    const other = await devLogin(srv, "net_a");
    await api(srv, "PUT", "/api/save", { token: other.token, body: { data: fakeSave(4), baseRev: 2 } });
    let conflict = null;
    net.on("conflict", e => { conflict = e; });
    const r = await net.save(fakeSave(5));
    assert.equal(r.conflict, true);
    assert.equal(conflict.rev, 3);
  });

  await ok("net.js：連線、where、別人上線下線的事件、被切斷會自己重連", async () => {
    const n1 = createNet({ base: srv.url, storage: null, window: null, retryBaseMs: 50 });
    const n2 = createNet({ base: srv.url, storage: null, window: null, retryBaseMs: 50 });
    const me1 = await n1.login({ name: "net_b" });
    const me2 = await n2.login({ name: "net_c" });
    const until = (net, type, pred = () => true, ms = 3000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error(`net.js 等不到 ${type}`)); }, ms);
      const off = net.on(type, e => { if (pred(e)) { clearTimeout(t); off(); resolve(e); } });
    });
    // 名單：現在的已經對了就不用等（同一份名單可能已經先到了）
    const rosterIs = (net, pred) => (pred(net.roster) ? Promise.resolve(net.roster) : until(net, "roster", pred));
    let w = until(n1, "welcome");
    n1.connect();
    await w;
    assert.equal(n1.state, "online");
    assert.ok(n1.roster.some(p => p.id === me1.id && p.me));
    const arrive = until(n1, "arrive", p => p.id === me2.id);
    n2.connect();
    n2.where("lobby");
    await arrive;
    await rosterIs(n1, list => list.some(p => p.id === me2.id && p.room === "lobby"));
    // 伺服器那邊把 n1 的連線切掉：n1 會自己重連，房間也會補送
    n1.where("gallery");
    w = until(n1, "welcome");
    srv.gateway.terminateAccount(me1.id);
    await w;
    assert.equal(n1.state, "online");
    // 重連後伺服器那邊房間是空的，要等 net.js 自己補送 where 才會是 gallery
    let row = null;
    for (let i = 0; i < 100 && !(row && row.room === "gallery" && row.status === "online"); i++) {
      await sleep(20);
      row = srv.presence.roster(me2.id).find(p => p.id === me1.id);
    }
    assert.equal(row.room, "gallery", "重連後有補送房間");
    await rosterIs(n2, list => list.some(p => p.id === me1.id && p.room === "gallery" && p.status === "online"));
    const leave = until(n1, "leave", p => p.id === me2.id);
    n2.disconnect();
    await leave;
    n1.disconnect();
    assert.equal(n1.state, "stopped");
  });

  await ok("邀請名單：不在名單上不能登入；加進去就可以；停用之後 token 也失效", async () => {
    const s2 = await serve(testConfig({ DB_PATH: join(tmp, "invite.db"), DEV_OPEN: "0" }));
    const no = await api(s2, "POST", "/api/login", { body: { name: "小美" } });
    assert.equal(no.status, 403);
    assert.equal(no.json.error, "not_invited");
    s2.store.addInvite("小美@dev.local", "測試");
    const yes = await devLogin(s2, "小美");
    assert.equal((await api(s2, "GET", "/api/me", { token: yes.token })).status, 200);
    assert.equal(s2.store.disableInvite("小美@dev.local"), true);
    assert.equal((await api(s2, "GET", "/api/me", { token: yes.token })).status, 401);
    assert.equal((await api(s2, "POST", "/api/login", { body: { name: "小美" } })).status, 403);
    assert.equal(s2.store.invite("小美@dev.local").note, "測試"); // 停用不是刪掉
  });

  await ok("登入試太多次會被擋（429）", async () => {
    const s3 = await serve(testConfig({ DB_PATH: join(tmp, "limit.db") }, { loginPerMin: 10 }));
    let blocked = 0;
    for (let i = 0; i < 12; i++) if ((await api(s3, "POST", "/api/login", { body: { name: "spam" } })).status === 429) blocked++;
    assert.ok(blocked >= 2, `12 次裡擋了 ${blocked} 次`);
  });

  await ok("正式環境：不准 dev 登入；預設照入口選 Firebase／Access（還沒做，回 501）", async () => {
    const prod = { NODE_ENV: "production", DB_PATH: join(tmp, "prod.db") };
    assert.throws(() => readConfig({ ...prod, AUTH: "dev" }), /不能用 AUTH=dev/);
    assert.throws(() => readConfig({ NODE_ENV: "production" }), /DB_PATH/);
    assert.throws(() => createDevAuth({ production: true }), /正式環境/);
    assert.equal(readConfig(prod).auth, "firebase");
    assert.equal(readConfig({ ...prod, ENTRY: "tunnel" }).auth, "access");
    assert.equal(readConfig(prod).devOpen, false);
    await assert.rejects(() => startServer({ ...testConfig(), production: true, auth: "dev" }), /正式環境/);
    const s4 = await serve({ ...testConfig(), ...readConfig({ ...prod, PORT: "0", SERVE_DIST: "0" }), quiet: true });
    const r = await api(s4, "POST", "/api/login", { body: { name: "小明" }, headers: { "x-dev-user": "x" } });
    assert.equal(r.status, 501);
    assert.equal(r.json.error, "not_ready");
  });

  await ok("資料表搬家：照編號跑、記下來、跑過的不再跑", async () => {
    const list = listMigrations();
    assert.ok(list.length >= 2);
    const rows = srv.db.prepare("SELECT id, name FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(rows.map(r => r.name), list.map(m => m.name));
    const again = openDb(join(tmp, "main.db"));
    assert.deepEqual(again.migrated, []);
    again.close();
  });

  await ok("資料表搬家：跑過的檔被改了就不開；跳號、DROP 會被擋", async () => {
    const dir = join(tmp, "mig");
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const file = join(tmp, "mig.db");
    const d1 = openDb(file, { migrationsDir: dir });
    assert.equal(d1.migrated.length, listMigrations().length);
    d1.close();
    const first = listMigrations(dir)[0].name;
    appendFileSync(join(dir, first), "\n-- 偷改\n");
    assert.throws(() => openDb(file, { migrationsDir: dir }), /被改了/);
    const dir2 = join(tmp, "mig2");
    cpSync(MIGRATIONS_DIR, dir2, { recursive: true });
    const next = String(listMigrations(dir2).length + 1).padStart(4, "0");
    writeFileSync(join(dir2, `${next}_刪掉.sql`), "DROP TABLE saves;");
    assert.throws(() => openDb(join(tmp, "mig2.db"), { migrationsDir: dir2 }), /DROP/);
    rmSync(join(dir2, `${next}_刪掉.sql`));
    writeFileSync(join(dir2, "0099_跳號.sql"), "CREATE TABLE x (a);");
    assert.throws(() => listMigrations(dir2), /連著排/);
  });

  await ok("db/ 的每個搬家檔都只加不刪", async () => {
    for (const m of listMigrations()) assert.deepEqual(addOnlyProblems(m.name, m.sql), [], m.name);
    assert.equal(addOnlyProblems("x", "-- DROP 寫在註解裡沒關係\nCREATE TABLE t (a TEXT DEFAULT 'drop');").length, 0);
    assert.equal(addOnlyProblems("x", "ALTER TABLE t RENAME TO u;").length, 1);
  });

  await ok("關伺服器：連著的 WebSocket 收到 1001（畫面會重連），在線的人記下最後上線", async () => {
    const before = srv.store.account(A.id).last_seen_at;
    await sleep(5);
    const closing = pa.closedWith();
    await srv.close();
    assert.equal((await closing).code, 1001);
    const db = openDb(join(tmp, "main.db"));
    const after = db.prepare("SELECT last_seen_at FROM accounts WHERE id = ?").get(A.id).last_seen_at;
    db.close();
    assert.ok(after > before, "最後上線有更新");
  });
} catch (e) {
  failed++;
  console.log("✗ 測試整個停下來了：" + (e && e.stack || e));
} finally {
  for (const ws of sockets) { try { ws.terminate(); } catch { /* 已經關了 */ } }
  for (const s of servers) { try { await s.close(); } catch { /* 已經關了 */ } }
  try { rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.log("暫存的資料庫刪不掉：" + tmp + "（" + e.message + "）"); }
}

console.log(`${passed} passed, ${failed} failed（伺服器）`);
process.exit(failed ? 1 : 0);
