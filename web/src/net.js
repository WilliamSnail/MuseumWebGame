// 瀏覽器端的連線模組：登入、讀存檔、存存檔、WebSocket（在線名單）、斷線重連。
// 伺服器在 server/（npm run server）；訊息格式在 server/protocol.md。
//
// 2026-11-08：還沒有任何畫面 import 這個檔（主線在改畫面）。要接的時候照下面做。
// 這個檔不 import 別的檔，畫面檔 import 它不會有循環引用的問題（ui_core.js 也可以 import）。
//
// ── 怎麼用 ─────────────────────────────────────────────
//   import { NET } from "./net.js";
//
//   // 開館時：先看伺服器用哪一種登入，再試著用上次的登入
//   const info = await NET.info();                  // { auth: "dev" | "firebase" | "access", version, … }
//   let me = await NET.restore();                   // 上次登入過、還沒過期就回來 { id, nick, … }，不然 null
//   if (!me) me = await NET.login({ name: "小明" });  // 開發登入（AUTH=dev）
//   //  Firebase（A）：NET.login({ idToken })；Access（B）：NET.login()（Access 已經登入過）
//
//   // 存檔：整份 SAVE
//   const { data } = await NET.loadSave();          // 伺服器沒有就是 null（第一次：把瀏覽器的存檔搬上去）
//   NET.saveSoon(SAVE);                             // 放在 persist() 裡：3 秒內存好幾次只送一次
//   await NET.flush();                              // 馬上送（例如換參觀者、離開房間）
//   NET.on("conflict", ({ rev }) => …);             // 別的分頁或裝置先存了：重新 loadSave()，以伺服器為準
//
//   // 在線名單
//   NET.connect();                                  // 連 WebSocket；斷線會自己重連
//   NET.where("gallery");                           // go() 換房間時呼叫（房間代號：小寫英文，例如 cellar:b2）
//   NET.on("roster", players => …);                 // 每次名單有變：[{ id, nick, status, room, lastSeen, me? }]
//   NET.on("arrive", p => note(`${p.nick}上線了`));  // 有人從離線變在線（剛連上的第一份名單不算）
//   NET.on("leave", p => …);                        // 有人離線
//   NET.on("status", s => …);                       // 連線：{ state: connecting／online／retrying／stopped }
//   NET.on("logout", e => …);                       // 登入過期、被拿掉名單：回登入畫面
//   await NET.updateMe({ invisible: true });        // 隱身（別人看到離線）；也可以改暱稱 { nick }
//
//   - status 是 online（在線）、away（離開：5 分鐘沒動）、offline（離線，看 lastSeen）。
//   - 暱稱是玩家自己打的字：畫面顯示時一律當純文字（textContent），不要塞進 innerHTML。
//   - 「小明上線了」的提示 30 分鐘內同一個人只跳一次，這件事畫面自己記（規劃.md 第三節）。
//   - 測試或 Node 裡用：createNet({ base: "http://127.0.0.1:8787", storage: null, window: null })。
// ───────────────────────────────────────────────────────

const SESSION_KEY = "pepe4.session"; // localStorage：登入的 token
const PROTOCOL_VERSION = 1;          // 跟 server/protocol.js 一樣
// 跟 server/protocol.js 的 CLOSE 對得上：這些關閉碼不自己重連
const NO_RETRY = new Set([1000, 4000, 4001, 4003, 4009]);
const NEED_LOGIN = new Set([4001, 4003]);
const INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];

export class NetError extends Error {
  constructor(status, code, msg, extra = {}) {
    super(msg);
    this.status = status; // HTTP 狀態碼；連不上是 0
    this.code = code;     // 伺服器的錯誤代號，例如 need_login、conflict、not_invited
    this.extra = extra;   // 伺服器回的整包
  }
}

export function createNet(opts = {}) {
  const base = (opts.base || "").replace(/\/$/, "");
  const fetchFn = opts.fetch || ((...a) => globalThis.fetch(...a));
  const retryBaseMs = opts.retryBaseMs || 1000;
  const retryMaxMs = opts.retryMaxMs || 30000;
  const saveDelayMs = opts.saveDelayMs ?? 3000;
  const getWin = () => (opts.window !== undefined ? opts.window : (typeof window !== "undefined" ? window : null));
  const getStorage = () => {
    if (opts.storage !== undefined) return opts.storage;
    try { const w = getWin(); return (w && w.localStorage) || null; } catch { return null; }
  };

  const listeners = new Map();
  let token = null, me = null, rev = 0;
  let ws = null, state = "idle", wanted = false, attempt = 0, retryTimer = null, beatTimer = null, beatEvery = 20000;
  let roster = [], room = null, active = false, winHooked = false;
  let pending = null, saveTimer = null, chain = Promise.resolve();

  function emit(type, payload) {
    for (const fn of listeners.get(type) || []) {
      try { fn(payload); } catch (e) { console.error(`net.js 的 ${type} 處理函式出錯`, e); }
    }
  }
  function setState(s, extra = {}) {
    if (state === s && s !== "retrying") return;
    state = s;
    emit("status", { state: s, ...extra });
  }

  function readToken() {
    if (token) return token;
    try { const s = getStorage(); token = (s && s.getItem(SESSION_KEY)) || null; } catch { token = null; }
    return token;
  }
  function writeToken(t) {
    token = t;
    try {
      const s = getStorage();
      if (!s) return;
      if (t) s.setItem(SESSION_KEY, t); else s.removeItem(SESSION_KEY);
    } catch { /* 不能存就只放在記憶體 */ }
  }

  function wsUrl() {
    if (opts.wsUrl) return opts.wsUrl;
    if (base) return base.replace(/^http/, "ws") + "/ws";
    const loc = getWin().location;
    return (loc.protocol === "https:" ? "wss:" : "ws:") + "//" + loc.host + "/ws";
  }

  // 呼叫 /api/…。失敗丟 NetError。401 代表登入沒了：清掉 token、送 logout 事件。
  async function request(method, path, body, { keepalive = false, timeoutMs = 15000, silent401 = false } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (readToken()) headers.Authorization = "Bearer " + token;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchFn(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive,
        signal: ctl ? ctl.signal : undefined,
      });
    } catch {
      throw new NetError(0, "network", "連不上伺服器");
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json = null;
    try { json = await res.json(); } catch { /* 不是 JSON */ }
    if (!res.ok) {
      const err = new NetError(res.status, (json && json.error) || `http_${res.status}`, (json && json.msg) || "伺服器回了錯誤", json || {});
      if (res.status === 401 && path !== "/api/login") {
        writeToken(null);
        me = null;
        if (!silent401) { stopWs(); emit("logout", err); }
      }
      throw err;
    }
    return json;
  }

  // ── 登入 ──
  async function login(cred = {}) {
    const r = await request("POST", "/api/login", cred);
    writeToken(r.token);
    me = r.me;
    emit("login", me);
    return me;
  }
  async function restore() {
    if (!readToken()) return null;
    try { me = await request("GET", "/api/me", undefined, { silent401: true }); return me; }
    catch (e) { if (e.status === 401) return null; throw e; }
  }
  async function logout() {
    try { await flush(); } catch { /* 存不了也要登出 */ }
    try { if (readToken()) await request("POST", "/api/logout", undefined, { silent401: true }); } catch { /* 已經沒了 */ }
    writeToken(null);
    me = null;
    disconnect();
    emit("logout", { code: "logout" });
  }
  async function updateMe(changes) {
    me = await request("PUT", "/api/me", changes);
    return me;
  }

  // ── 存檔 ──
  async function loadSave() {
    const r = await request("GET", "/api/save");
    rev = r.rev;
    return r;
  }
  // 整份存。回傳 { rev, updatedAt }；別人先存了回傳 { conflict: true, rev }（也會送 conflict 事件）
  async function save(data, { keepalive = false } = {}) {
    try {
      const r = await request("PUT", "/api/save", { data, baseRev: rev }, { keepalive });
      rev = r.rev;
      emit("saved", r);
      return r;
    } catch (e) {
      if (e.code === "conflict") {
        emit("conflict", { rev: e.extra.rev });
        return { conflict: true, rev: e.extra.rev };
      }
      throw e;
    }
  }
  // 過一下再存；這段時間又叫就只存最後那份
  function saveSoon(data, ms = saveDelayMs) {
    pending = data;
    hookWindow();
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush().catch(() => {}); }, ms);
  }
  // 馬上把等著的那份送出去（一次只送一份，照順序）
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!pending) return chain.then(() => {}, () => {}); // 沒有要送的：等正在送的那份送完就好
    const data = pending;
    pending = null;
    chain = chain.catch(() => {}).then(() => save(data)).catch(e => {
      // 連不上：留著等一下再送（中間又有新的就送新的）
      if (e.status === 0 || e.status >= 500 || e.status === 429) {
        if (!pending) pending = data;
        if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush().catch(() => {}); }, 10000);
      }
      emit("saveError", e);
      throw e;
    });
    return chain;
  }

  // ── WebSocket ──
  function sendRaw(msg) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }
  function startBeat() {
    stopBeat();
    beatTimer = setInterval(() => { sendRaw({ t: "beat", active }); active = false; }, beatEvery);
  }
  function stopBeat() { if (beatTimer) { clearInterval(beatTimer); beatTimer = null; } }

  function setRoster(list, baseline) {
    if (!baseline) {
      const before = new Map(roster.map(p => [p.id, p.status]));
      for (const p of list) {
        if (p.me) continue;
        const was = before.get(p.id) || "offline";
        if (was === "offline" && p.status !== "offline") emit("arrive", p);
        if (was !== "offline" && p.status === "offline") emit("leave", p);
      }
    }
    roster = list;
    emit("roster", list);
  }

  function onServer(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.t === "welcome") {
      attempt = 0;
      me = { ...(me || {}), ...msg.me };
      beatEvery = msg.beatEvery || beatEvery;
      startBeat();
      setState("online");
      if (room) sendRaw({ t: "where", room });
      setRoster(msg.roster || [], true); // 剛連上：當成起點，不跳「上線了」
      emit("welcome", msg);
      if (pending) flush().catch(() => {});
    } else if (msg.t === "roster") {
      setRoster(msg.players || [], false);
    } else if (msg.t === "error") {
      emit("error", msg);
    }
    emit("message", msg); // 之後的邀請、招募、合作關卡：NET.on("message", m => m.t === "invite" && …)
  }

  function open() {
    if (!readToken()) { wanted = false; setState("stopped"); emit("logout", { code: "need_login" }); return; }
    setState("connecting");
    let sock;
    try { sock = new (opts.WebSocket || globalThis.WebSocket)(wsUrl()); }
    catch { scheduleRetry(0); return; }
    ws = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, token }));
    sock.onmessage = ev => onServer(typeof ev.data === "string" ? ev.data : String(ev.data));
    sock.onerror = () => { /* 接著會有 close */ };
    sock.onclose = ev => {
      if (ws !== sock) return;
      ws = null;
      stopBeat();
      const code = ev.code;
      if (!wanted) return setState("stopped", { code });
      if (NEED_LOGIN.has(code)) {
        wanted = false;
        writeToken(null);
        me = null;
        setState("stopped", { code });
        emit("logout", { code: `ws_${code}`, reason: ev.reason });
        return;
      }
      if (NO_RETRY.has(code)) { wanted = false; return setState("stopped", { code }); }
      scheduleRetry(code);
    };
  }

  // 1 秒、2 秒、4 秒……最多 30 秒，再加一點亂數（大家不會同時擠回來）
  function scheduleRetry(code) {
    attempt++;
    const ms = Math.round(Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(attempt - 1, 10)) * (0.5 + Math.random() * 0.5));
    setState("retrying", { inMs: ms, attempt, code });
    retryTimer = setTimeout(() => { retryTimer = null; if (wanted) open(); }, ms);
  }
  function retryNow() {
    if (!wanted || ws) return;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    open();
  }
  function stopWs() {
    wanted = false;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    stopBeat();
    if (ws) { const s = ws; ws = null; try { s.close(1000); } catch { /* 已經關了 */ } }
  }

  // 瀏覽器的事件：有動作就算「在線」不算「離開」；網路回來、分頁切回來馬上重連；關分頁前把存檔送出去
  function hookWindow() {
    const w = getWin();
    if (winHooked || !w || !w.addEventListener) return;
    winHooked = true;
    for (const ev of INPUT_EVENTS) w.addEventListener(ev, () => { active = true; }, { passive: true, capture: true });
    w.addEventListener("online", retryNow);
    if (w.document) w.document.addEventListener("visibilitychange", () => { if (w.document.visibilityState === "visible") retryNow(); });
    w.addEventListener("pagehide", () => {
      if (!pending) return;
      const data = pending;
      pending = null;
      // keepalive 的 body 最多 64 KB；太大就只能盡量送
      let small = false;
      try { small = JSON.stringify(data).length < 60000; } catch { /* 算不出來 */ }
      save(data, { keepalive: small }).catch(() => {});
    });
  }

  function connect() {
    wanted = true;
    hookWindow();
    if (ws || retryTimer) return;
    attempt = 0;
    open();
  }
  function disconnect() {
    stopWs();
    setState("stopped");
  }

  return {
    // 事件：status、login、logout、welcome、roster、arrive、leave、error、message、saved、saveError、conflict
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    info: () => request("GET", "/api/health"),
    login,
    restore,
    logout,
    updateMe,
    loadSave,
    save,
    saveSoon,
    flush,
    connect,
    disconnect,
    // 告訴伺服器「我在哪個房間」。斷線時先記著，連上會自己補送。
    where(r) {
      room = r;
      return sendRaw({ t: "where", room: r });
    },
    // 送別種訊息（之後的邀請、招募……，欄位見 server/protocol.md）。沒連上回傳 false。
    send: msg => sendRaw(msg),
    get me() { return me; },
    get state() { return state; },
    get roster() { return roster; },
    get rev() { return rev; },
    get loggedIn() { return !!readToken(); },
  };
}

// 整個遊戲共用這一個。
// 網址帶 ?user=名字（開發用）：登入的 token 放在這個分頁自己的 sessionStorage，
// 一台電腦開幾個分頁就是幾個玩家（localStorage 是所有分頁共用的）。
const perTab = typeof window !== "undefined" && !!window.location && /[?&]user=/.test(window.location.search || "");
// 11-08 改用 Firebase（決定 0021）：畫面改用 web/src/net_firebase.js 的 NET。這一個留著當參考、給 test/server.test.mjs 用。
export const NODE_NET = createNet(perTab ? { storage: window.sessionStorage } : {});
