// ================================================================
//  瀏覽器端的連線：Firebase 版（決定 0021，翊文 11-08：「我目前想部屬在Firebase好了」）
//  介面跟 web/src/net.js 的 NET 一模一樣（畫面不用改）：
//    info、login、restore、logout、updateMe、loadSave、save、saveSoon、flush、connect、disconnect、where、send、on、
//    me、state、roster、rev、loggedIn
//  事件：status、login、logout、roster、arrive、leave、message、saved、saveError、conflict
//  資料放哪裡、規則：docs/Firebase做法.md。
//  - 登入：Firebase Auth。模擬器：打名字就登入（模擬器接受假的 Google 憑證，email 是 dev-…@dev.local）。正式：Google 登入。
//    登入後叫 Functions 的 join（檢查邀請名單、建館友）。
//  - 存檔：Firestore 的 saves/{uid}，用交易檢查 rev（別的分頁先存了 → conflict）。
//  - 在線名單：Realtime Database 的 /status；斷線時 onDisconnect 自動改成離線。5 分鐘沒動算「離開」。
//  - 給我的通知：/inbox/{uid}（Functions 寫），收到就送 message 事件、刪掉。
//  - 網址帶 ?user=名字（開發）：登入只放在這個分頁（sessionStorage），一台電腦開幾個分頁就是幾個人。
// ================================================================
import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, getAuth, onAuthStateChanged, setPersistence, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { connectDatabaseEmulator, getDatabase, onChildAdded, onDisconnect, onValue, ref, remove, serverTimestamp as rtdbNow, set } from "firebase/database";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { EMULATOR_PORTS, FIREBASE_PROJECTS, FUNCTIONS_REGION, firebaseTarget } from "./firebase_config.js";
import { NetError } from "./net.js";

const AWAY_MS = 5 * 60 * 1000;     // 5 分鐘沒動算「離開」（跟原本的伺服器一樣）
const ROOM_RE = /^[a-z][a-z0-9_:-]{0,31}$/;

// 看不見的字（控制字元、零寬空白、方向控制、BOM）：用字碼判斷，不在原始碼寫那種跳脫（工具會換成真的換行字元）
const invisible = ch => { const n = ch.codePointAt(0); return n < 0x20 || n === 0x7f || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff; };
const clean = s => [...String(s || "")].filter(ch => !invisible(ch)).join("").trim();
// 名字變成 email 的前半（模擬器用）：UTF-8 的位元組轉成十六進位，中文也可以
const hexOf = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, "0")).join("");

// Firebase 的錯誤 → 跟原本伺服器一樣的 NetError（畫面看 code、message）
function toNetError(e) {
  if (e instanceof NetError) return e;
  const code = String((e && e.code) || "");
  const msg = (e && e.message ? String(e.message).replace(/^Firebase:\s*/, "").replace(/\s*\(.*\)\.?$/, "") : "") || "出錯了";
  if (code.includes("permission-denied")) return new NetError(403, "not_invited", msg.includes("邀請") ? msg : "沒有權限（不在邀請名單上？）");
  if (code.includes("unauthenticated")) return new NetError(401, "need_login", "要先登入");
  if (code.includes("unavailable") || code.includes("network") || code.includes("deadline")) return new NetError(0, "network", "連不上 Firebase");
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return new NetError(400, "cancelled", "登入的視窗關掉了");
  return new NetError(500, code || "firebase", msg);
}

export function createFirebaseNet(opts = {}) {
  const target = opts.target || firebaseTarget();
  const config = FIREBASE_PROJECTS[target];
  const emulator = target === "emulator";
  const listeners = new Map();
  const emit = (type, payload) => { for (const fn of listeners.get(type) || []) { try { fn(payload); } catch (e) { console.error(`net_firebase.js 的 ${type} 處理函式出錯`, e); } } };

  let app = null, auth = null, fs = null, rtdb = null, fns = null, ready = null;
  function boot() {
    if (ready) return ready;
    if (!config) { ready = Promise.reject(new NetError(0, "no_config", `還沒有設定 Firebase 專案（${target}），看 web/src/firebase_config.js`)); ready.catch(() => {}); return ready; }
    app = initializeApp(config);
    auth = getAuth(app);
    fs = getFirestore(app);
    rtdb = getDatabase(app);
    fns = getFunctions(app, FUNCTIONS_REGION);
    if (emulator) {
      connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
      connectFirestoreEmulator(fs, "127.0.0.1", EMULATOR_PORTS.firestore);
      connectDatabaseEmulator(rtdb, "127.0.0.1", EMULATOR_PORTS.database);
      connectFunctionsEmulator(fns, "127.0.0.1", EMULATOR_PORTS.functions);
    }
    const perTab = typeof location !== "undefined" && /[?&]user=/.test(location.search || "");
    ready = setPersistence(auth, perTab ? browserSessionPersistence : browserLocalPersistence).then(() => new Promise(res => {
      const off = onAuthStateChanged(auth, u => { off(); res(u); });
    }));
    onAuthStateChanged(auth, u => { if (!u && me) { me = null; stopPresence(); emit("logout", { code: "need_login" }); } });
    return ready;
  }
  const call = async (name, data = {}) => { try { return (await httpsCallable(fns, name)(data)).data; } catch (e) { throw toNetError(e); } };

  let me = null, rev = 0, state = "idle", roster = [], room = null, wanted = false;
  let pending = null, saveTimer = null, chain = Promise.resolve();
  const saveDelayMs = opts.saveDelayMs ?? 3000;
  function setState(s, extra = {}) { if (state === s && s !== "retrying") return; state = s; emit("status", { state: s, ...extra }); }

  // ── 登入 ──
  async function joinAs(user) {
    const r = await call("join");
    me = { id: user.uid, nick: r.nick, invisible: !!r.invisible, email: user.email || "" };
    return me;
  }
  async function login(cred = {}) {
    try { await boot(); } catch (e) { throw toNetError(e); }
    try {
      if (emulator) {
        const name = clean(cred.name);
        if (!name) throw new NetError(400, "bad_name", "先打壹個名字。");
        if ([...name].length > 12) throw new NetError(400, "bad_name", "名字最多 12 個字。");
        const id = "dev-" + hexOf(name).slice(0, 40);
        const fake = JSON.stringify({ sub: id, email: `${id}@dev.local`, email_verified: true, name });
        await signInWithCredential(auth, GoogleAuthProvider.credential(fake));
      } else {
        await signInWithPopup(auth, new GoogleAuthProvider());
      }
      await joinAs(auth.currentUser);
    } catch (e) {
      const err = toNetError(e);
      if (err.code === "not_invited") { try { await signOut(auth); } catch (x) { /* 已經登出了 */ } }
      throw err;
    }
    emit("login", me);
    return me;
  }
  async function restore() {
    let u;
    try { u = await boot(); } catch (e) { throw toNetError(e); }
    if (!u) return null;
    try { return await joinAs(u); }
    catch (e) {
      const err = toNetError(e);
      if (err.status === 403 || err.status === 401) { try { await signOut(auth); } catch (x) { /* 沒關係 */ } return null; }
      throw err;
    }
  }
  async function logout() {
    try { await flush(); } catch (e) { /* 存不了也要登出 */ }
    await goOffline();
    stopPresence();
    me = null;
    try { if (auth) await signOut(auth); } catch (e) { /* 已經登出了 */ }
    emit("logout", { code: "logout" });
  }
  async function updateMe(changes = {}) {
    if (!me) throw new NetError(401, "need_login", "要先登入");
    const upd = {};
    if (changes.nick !== undefined) {
      const n = clean(changes.nick);
      if (!n || [...n].length > 12) throw new NetError(400, "bad_nick", "暱稱要 1–12 個字。");
      upd.nick = n;
    }
    if (changes.invisible !== undefined) upd.invisible = !!changes.invisible;
    if (!Object.keys(upd).length) return me;
    try { await updateDoc(doc(fs, "members", me.id), upd); } catch (e) { throw toNetError(e); }
    me = { ...me, ...upd };
    writeStatus();
    return me;
  }

  // ── 存檔 ──
  async function loadSave() {
    if (!me) throw new NetError(401, "need_login", "要先登入");
    try {
      const snap = await getDoc(doc(fs, "saves", me.id));
      if (!snap.exists()) { rev = 0; return { data: null, rev: 0, updatedAt: null }; }
      const d = snap.data();
      rev = d.rev;
      return { data: JSON.parse(d.data), rev: d.rev, updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : null };
    } catch (e) { throw toNetError(e); }
  }
  async function save(data) {
    if (!me) throw new NetError(401, "need_login", "要先登入");
    const str = JSON.stringify(data);
    let out;
    try {
      out = await runTransaction(fs, async tx => {
        const r = doc(fs, "saves", me.id);
        const cur = await tx.get(r);
        const curRev = cur.exists() ? cur.data().rev : 0;
        if (curRev !== rev) return { conflict: true, rev: curRev };
        tx.set(r, { data: str, rev: curRev + 1, updatedAt: serverTimestamp() });
        return { conflict: false, rev: curRev + 1 };
      });
    } catch (e) { throw toNetError(e); }
    if (out.conflict) { emit("conflict", { rev: out.rev }); return out; }
    rev = out.rev;
    emit("saved", out);
    return out;
  }
  function saveSoon(data, ms = saveDelayMs) {
    pending = data;
    hookWindow();
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush().catch(() => {}); }, ms);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!pending) return chain.then(() => {}, () => {});
    const data = pending;
    pending = null;
    chain = chain.catch(() => {}).then(() => save(data)).catch(e => {
      if (e.status === 0 || e.status >= 500) {
        if (!pending) pending = data;
        if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush().catch(() => {}); }, 10000);
      }
      emit("saveError", e);
      throw e;
    });
    return chain;
  }

  // ── 在線名單（Realtime Database 的 /status） ──
  let offs = [], lastInput = Date.now(), awayTimer = null, wasAway = false, winHooked = false, baseline = true;
  const statusRef = () => ref(rtdb, `status/${me.id}`);
  function statusNow() {
    const away = Date.now() - lastInput > AWAY_MS;
    return { state: me.invisible ? "offline" : away ? "away" : "online", room: room && ROOM_RE.test(room) ? room : "title", nick: [...me.nick].slice(0, 12).join(""), at: rtdbNow() };
  }
  function writeStatus() { if (me && rtdb && wanted) set(statusRef(), statusNow()).catch(() => {}); }
  async function goOffline() { if (me && rtdb) { try { await set(statusRef(), { state: "offline", room: room && ROOM_RE.test(room) ? room : "title", nick: me.nick, at: rtdbNow() }); } catch (e) { /* 已經斷了 */ } } }
  function setRoster(list) {
    if (!baseline) {
      const before = new Map(roster.map(p => [p.id, p.status]));
      for (const p of list) {
        if (p.me) continue;
        const was = before.get(p.id) || "offline";
        if (was === "offline" && p.status !== "offline") emit("arrive", p);
        if (was !== "offline" && p.status === "offline") emit("leave", p);
      }
    }
    baseline = false;
    roster = list;
    emit("roster", list);
  }
  function connect() {
    wanted = true;
    hookWindow();
    if (!me || offs.length) return;
    setState("connecting");
    baseline = true;
    offs.push(onValue(ref(rtdb, ".info/connected"), snap => {
      if (snap.val() === true) {
        onDisconnect(statusRef()).set({ state: "offline", room: "title", nick: me.nick, at: rtdbNow() }).then(writeStatus, () => {});
        setState("online");
        if (pending) flush().catch(() => {});
      } else if (state === "online") setState("retrying");
    }));
    offs.push(onValue(ref(rtdb, "status"), snap => {
      const v = snap.val() || {};
      setRoster(Object.entries(v).map(([id, s]) => ({ id, nick: s.nick || "館友", status: s.state || "offline", room: s.room || null, lastSeen: s.at ? new Date(s.at).toISOString() : null, me: id === me.id })));
    }, () => setState("retrying")));
    offs.push(onChildAdded(ref(rtdb, `inbox/${me.id}`), snap => {
      const m = snap.val();
      remove(snap.ref).catch(() => {});
      if (m && typeof m === "object") emit("message", m);
    }));
    awayTimer = setInterval(() => {
      const away = Date.now() - lastInput > AWAY_MS;
      if (away !== wasAway) { wasAway = away; writeStatus(); }
    }, 30000);
  }
  function stopPresence() {
    wanted = false;
    offs.forEach(off => { try { off(); } catch (e) { /* 已經關了 */ } });
    offs = [];
    if (awayTimer) { clearInterval(awayTimer); awayTimer = null; }
    setState("stopped");
  }
  function disconnect() { goOffline(); stopPresence(); }
  function hookWindow() {
    if (winHooked || typeof window === "undefined") return;
    winHooked = true;
    ["pointerdown", "keydown", "touchstart", "wheel"].forEach(ev => window.addEventListener(ev, () => {
      lastInput = Date.now();
      if (wasAway) { wasAway = false; writeStatus(); }
    }, { passive: true }));
    window.addEventListener("pagehide", () => { if (pending) { const d = pending; pending = null; save(d).catch(() => {}); } });
  }

  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    // 畫面看 auth：模擬器用打名字的登入框（"dev"），正式用 Google 登入（"firebase"）
    async info() {
      await boot();
      if (emulator) { // 模擬器有沒有開：問一下 Auth 模擬器（沒開就丟錯誤，標題寫「連不上」）
        const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const t = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
        try { await fetch(`http://127.0.0.1:${EMULATOR_PORTS.auth}/`, { signal: ctl ? ctl.signal : undefined }); }
        catch (e) { throw new NetError(0, "network", "Firebase 模擬器沒有開（npm run emulators）"); }
        finally { if (t) clearTimeout(t); }
      }
      return { ok: true, auth: emulator ? "dev" : "firebase", target, emulator };
    },
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
    where(r) { room = r; writeStatus(); return true; },
    // 邀請、隊伍都走 Functions（call）；舊的 send 留著，回傳 false。
    send() { return false; },
    call,
    // 聽 Realtime Database 的一個位置（例如隊伍 parties/{pid}）：有變就 fn(值)；沒權限、斷了 fn(null, 錯誤)。回傳停止的函式
    watch(path, fn) {
      if (!rtdb) return () => {};
      return onValue(ref(rtdb, path), snap => fn(snap.val()), err => fn(null, err));
    },
    get me() { return me; },
    get state() { return state; },
    get roster() { return roster; },
    get rev() { return rev; },
    get loggedIn() { return !!(auth && auth.currentUser); },
  };
}

// 整個遊戲共用這一個
export const NET = createFirebaseNet();
