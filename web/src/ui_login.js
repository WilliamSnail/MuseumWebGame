// ================================================================
//  登入、存檔放伺服器、館友、我的帳號（多人版 M1）
//  翊文 11-08：「好了，可以開始規劃如何多人遊戲了」「首頁可以改成登入」。做法見 docs/多人實作.md 的 M1。
//  連線在 web/src/net_firebase.js（NET，介面跟 net.js 一樣；決定 0021 改接 Firebase）；資料怎麼放見 docs/Firebase做法.md。
//
//  - 標題畫面（ui_screens1.js 的 SCREENS.title）中間那一塊是 loginArea()：
//      還沒登入 → 登入的框；登入了 → 「歡迎，小明」＋「進館／繼續／自由模式」。
//  - UI.net：登入了、也讀到伺服器的存檔。persist() 看它決定存伺服器還是存這台電腦（ui_core.js）。
//  - UI.localPlay：不連伺服器（開發用的 #畫面、開發時伺服器沒開按「先用這台電腦的存檔玩」）。
//  - 開發時網址帶 ?user=名字：這個分頁自己登入（net.js 把 token 放 sessionStorage），一台電腦開好幾個分頁當不同的人。
// ================================================================
import { SAVE_KEY, migrateSave, nowMs } from "../../shared/logic.js";
import { NET } from "./net_firebase.js"; // 決定 0021：改接 Firebase（介面跟 net.js 一樣）
import { $, ADDONS, FRIEND_ACTIONS, P, PANELS, SAVE, UI, applySettings, ask, btn, go, h, icon, note, persist, readJSON, rerender, roomLabel, setP, setSave, snd, updateNetMenu, useProfile } from "./ui_core.js";
import { overlay } from "./ui_board.js";

const MOVED_KEY = "pepe4.movedTo";  // 這台電腦的舊存檔搬給哪個帳號了（只搬一次，不然兩個帳號會有同一份）
const ARRIVE_GAP = 30 * 60 * 1000;   // 同一個館友 30 分鐘內只提示一次上線（規劃第三節）
const DEV = !!import.meta.env.DEV;
const devName = () => { try { return new URLSearchParams(location.search).get("user"); } catch (e) { return null; } };

// ---------- 開館時（boot.js 叫）：看伺服器用哪一種登入、上次登入過沒 ----------
export async function netBoot() {
  if (window.__PM_NODOOR__) { UI.localPlay = true; return; } // 開發用的 #畫面：不連伺服器
  await checkServer();
}
async function checkServer() {
  UI.netInfo = "checking";
  refreshLogin();
  try { UI.netInfo = await NET.info(); } catch (e) { UI.netInfo = null; }
  if (UI.netInfo) {
    try {
      const me = await NET.restore();
      if (me) await enterAccount(me);
      else if (UI.netInfo.auth === "access") await doLogin({}); // B：Cloudflare Access 已經登入過，不用登入畫面
      else if (UI.netInfo.auth === "dev" && devName()) await doLogin({ name: devName() }); // 開發：網址帶 ?user= 直接登入
    } catch (e) { /* 留在登入畫面 */ }
  }
  refreshLogin();
}

// ---------- 標題畫面中間那一塊 ----------
// actions：登入之後要放的按鈕（「進館／繼續／自由模式」，ui_screens1.js 給）
let titleActions = null;
export function loginArea(actions) {
  titleActions = actions;
  const box = h("div", { class: "t-login-area", id: "tLogin" });
  drawLogin(box);
  return box;
}
export function refreshLogin() { const box = $("#tLogin"); if (box) drawLogin(box); }
function drawLogin(box) {
  const acts = () => (titleActions ? titleActions() : []);
  if (UI.localPlay) {
    box.replaceChildren(...acts(), window.__PM_NODOOR__ ? null : h("p", { class: "t-net-note" }, "開發用：存在這台電腦，沒有連伺服器。"));
    return;
  }
  if (UI.net) {
    const me = NET.me || {};
    const out = h("button", { type: "button", class: "t-link", onClick: () => logout() }, "不是你？登出");
    box.replaceChildren(h("p", { class: "t-hello" }, "歡迎，", h("b", null, me.nick || ""), "。"), ...acts(), h("p", { class: "t-net-note" }, out));
    return;
  }
  if (UI.netInfo === "checking" || UI.netInfo === undefined) { box.replaceChildren(h("p", { class: "t-net-note" }, "正在連伺服器……")); return; }
  if (!UI.netInfo) {
    box.replaceChildren(h("div", { class: "t-login" },
      h("p", { class: "t-login-h" }, "連不上伺服器"),
      h("p", { class: "t-net-note" }, DEV ? "開發時要另外開 Firebase 模擬器：npm run emulators（或 .claude/launch.json 的 pepe4-emulators）。" : "等壹下再試；壹直連不上請告訴館長。"),
      h("div", { class: "t-login-row" }, btn("再試壹次", () => checkServer(), "primary"),
        DEV ? btn("先用這台電腦的存檔玩（開發用）", () => { UI.localPlay = true; refreshLogin(); }, "ghost") : null)));
    return;
  }
  const err = h("p", { class: "t-login-err", role: "alert" });
  if (UI.netInfo.auth === "dev") {
    const input = h("input", { id: "tName", class: "t-input", maxlength: "12", autocomplete: "nickname", placeholder: "例如：小明", value: devName() || "" });
    const form = h("form", { class: "t-login" },
      h("label", { class: "t-login-h", for: "tName" }, "你的名字"),
      h("div", { class: "t-login-row" }, input, h("button", { type: "submit", class: "btn primary" }, "登入")),
      h("p", { class: "t-net-note" }, "開發版：打名字就能進去。之後換成用 Google 登入。"), err);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { err.textContent = "先打壹個名字。"; input.focus(); return; }
      doLogin({ name }, err);
    });
    box.replaceChildren(form);
  } else if (UI.netInfo.auth === "firebase") {
    box.replaceChildren(h("div", { class: "t-login" }, btn("用 Google 登入", () => doLogin({}, err), "primary"), err));
  } else {
    box.replaceChildren(h("div", { class: "t-login" }, h("p", { class: "t-net-note" }, "正在登入……"), err));
  }
}
async function doLogin(cred, err) {
  try {
    const me = await NET.login(cred);
    await enterAccount(me);
    snd("bell");
  } catch (e) {
    if (err) err.textContent = e.code === "not_ready" ? "這種登入還沒做好。" : (e.message || "登入失敗了。");
    snd("error");
  }
  refreshLogin();
}

// ---------- 登入之後：讀伺服器的存檔（沒有就問要不要把這台電腦的搬上去）、連上館友名單 ----------
async function enterAccount(me) {
  const r = await NET.loadSave();
  if (r.data) setSave(migrateSave(r.data));
  else {
    const local = readJSON(SAVE_KEY);
    const has = !!(local && local.profiles && (local.profiles.challenge || local.profiles.free));
    let movedTo = null;
    try { movedTo = localStorage.getItem(MOVED_KEY); } catch (e) { /* 不能讀就當沒搬過 */ }
    const take = has && !movedTo && await ask(`這台電腦有之前的存檔。要搬到「${me.nick}」的帳號嗎？（只能搬給壹個帳號）`, "搬上去", "從頭開始");
    setSave(migrateSave(take ? local : null));
    if (!take && local && local.settings) Object.assign(SAVE.settings, local.settings); // 聲音、字的大小照舊
    if (take) { try { localStorage.setItem(MOVED_KEY, String(me.id)); } catch (e) { /* 只是少了「搬過了」的記號 */ } }
    await NET.save(SAVE);
  }
  UI.net = true;
  setP(null);
  applySettings();
  NET.connect();
  NET.where("title");
  updateNetMenu();
}

// ---------- 登出、登入過期 ----------
export async function logout() {
  await NET.flush().catch(() => {});
  await NET.logout(); // 會送 logout 事件 → 下面接著做
}
NET.on("logout", e => {
  const was = UI.net;
  UI.net = false;
  setP(null);
  setSave(migrateSave(readJSON(SAVE_KEY))); // 回到這台電腦的設定（聲音這些）
  applySettings();
  updateNetMenu();
  document.querySelectorAll(".nb-layer").forEach(l => l.remove());
  document.body.classList.remove("nb-open");
  if (UI.screen !== "title") go("title", {}, { action: false }); else refreshLogin();
  if (was && e && e.code !== "logout") note("登入過期了，請再登入壹次。", "bad");
});

// ---------- 伺服器改了我的存檔（例如一起融合做好了）：重新讀（不提示「衝突」） ----------
NET.on("message", async m => {
  if (!m || m.t !== "save_changed" || !UI.net) return;
  try {
    NET.dropPending(); // 手上還沒送出去的那份是舊的：不丟掉，幾秒後會把伺服器剛寫好的蓋掉（11-09）
    const r = await NET.loadSave();
    const mode = SAVE.current, playing = !!P;
    setSave(migrateSave(r.data));
    if (playing && mode && SAVE.profiles[mode]) useProfile(mode); else setP(null);
    if (P && UI.screen !== "title") rerender();
  } catch (e) { /* 下次存的時候會碰到衝突，再讀一次 */ }
});

// ---------- 別的分頁或裝置先存了：換成伺服器上的那一份 ----------
NET.on("conflict", async () => {
  if (!UI.net) return;
  try {
    const r = await NET.loadSave();
    const mode = SAVE.current, playing = !!P;
    setSave(migrateSave(r.data));
    if (playing && mode && SAVE.profiles[mode]) useProfile(mode); else setP(null);
    note("別的分頁或裝置先存了：換成伺服器上的進度。同壹個帳號開兩個分頁，進度會互相蓋掉。", "bad");
    if (P) rerender(); else go("title", {}, { action: false });
  } catch (e) { /* 下次存的時候再試 */ }
});

// ---------- 連線斷掉、連回來 ----------
let wasOnline = false, warned = false;
const warn = () => {
  if (warned) return;
  warned = true;
  note("連不上伺服器。進度先留在這裡，連回來會自己存；先不要關掉網頁。", "bad");
};
NET.on("status", s => {
  if (!UI.net) return;
  if (s.state === "online") { if (warned) note("連回來了。", "good"); warned = false; wasOnline = true; }
  else if (s.state === "retrying" && wasOnline) warn();
  updateNetMenu();
});
NET.on("saveError", e => { if (UI.net && (e.status === 0 || e.status >= 500)) warn(); });
NET.on("saved", () => { if (warned && NET.state === "online") { warned = false; note("連回來了，進度存好了。", "good"); } });

// ---------- 館友上線的提示（同一個人 30 分鐘一次；「我的帳號」可以關） ----------
const arriveAt = {};
NET.on("arrive", p => {
  if (!UI.net || SAVE.settings.arriveNote === false) return;
  const now = Date.now();
  if (arriveAt[p.id] && now - arriveAt[p.id] < ARRIVE_GAP) return;
  arriveAt[p.id] = now;
  note(`${p.nick} 上線了，${roomLabel(p.room)}。`);
});
let friendsDraw = null;
const redrawLobby = () => { const lb = $("#lobbyFriends"); if (lb) drawLobbyFriends(lb); };
NET.on("roster", () => { updateNetMenu(); if (friendsDraw) friendsDraw(); redrawLobby(); });
NET.on("status", () => { redrawLobby(); if (friendsDraw) friendsDraw(); });

// ---------- 館友（選單 → 館友） ----------
const ago = iso => {
  if (!iso) return "還沒來過";
  const m = Math.max(0, Math.round((nowMs() - Date.parse(iso)) / 60000)); // lastSeen 是伺服器的時間，跟網路的時間比（決定 0026）
  if (m < 2) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  if (m < 60 * 24) return `${Math.round(m / 60)} 小時前`;
  return `${Math.round(m / 1440)} 天前`;
};
const RANK = { online: 0, away: 1, offline: 2 };
// 館友小卡上的按鈕：別的檔登記在 ui_core.js 的 FRIEND_ACTIONS（M2 參觀展廳、送佩佩；M3 邀請一起融合……）
function friendButtons(p, close) {
  const acts = FRIEND_ACTIONS.filter(a => !a.show || a.show(p));
  return acts.length ? h("div", { class: "nf-acts" }, acts.map(a => btn(a.label, () => { close(); a.run(p); }, "small"))) : null;
}
export function openFriends() {
  if (!UI.net) { note("登入之後才看得到館友。"); return; }
  const m = overlay("nb-friends", "館友", "館友", "users");
  const draw = () => {
    if (!m.layer.isConnected) { friendsDraw = null; return; }
    const list = NET.roster.slice().sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0) || RANK[a.status] - RANK[b.status] || String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
    const n = list.filter(p => !p.me && p.status !== "offline").length;
    m.setTop(h("span", { class: "nf-count" }, n ? `${n} 位館友在線` : "現在沒有別的館友在線"));
    const card = p => h("div", { class: `nf-card ${p.status}${p.me ? " me" : ""}` },
      h("span", { class: "nf-dot", "aria-hidden": "true" }),
      h("div", { class: "nf-body" },
        h("b", { class: "nf-nick" + (p.me && ADDONS.frameClass ? ADDONS.frameClass() : "") }, p.nick, p.me ? h("small", null, "（你）") : null), // 名牌框：簽到拿的（11-09）；別人的要等伺服器傳得到（規則還沒改）
        h("span", { class: "nf-where" }, p.status === "offline" ? `離線・${ago(p.lastSeen)}` : p.status === "away" ? `離開壹下・${roomLabel(p.room)}` : roomLabel(p.room))),
      p.me ? null : friendButtons(p, m.close));
    const off = NET.state !== "online";
    m.surface.replaceChildren(
      off ? h("p", { class: "nb-hint nf-off" }, "連線中斷了：下面是斷線前的名單，連回來會自己更新。") : null,
      list.length ? h("div", { class: "nf-list" + (off ? " stale" : "") }, list.map(card)) : h("p", { class: "nb-empty" }, NET.state === "online" ? "館裡還沒有別人。" : "正在連線……"),
      h("p", { class: "nb-hint nf-hint" }, "之後可以參觀館友的展廳、送佩佩、邀請壹起打地下收藏庫。"));
  };
  friendsDraw = draw;
  draw();
  snd("flip");
}

// ---------- 大廳的「館友在線」（翊文 11-08：「大廳要有一個地方顯示目前上線的館友名稱和狀態」） ----------
// 大廳標題、「下壹步」下面一條：在線的館友一人一個小名牌（燈號、暱稱、在哪裡）。名單有變只換這一條，不重畫大廳
const LOBBY_MAX = 6;
export function lobbyFriends() {
  if (!UI.net) return null;
  const box = h("section", { class: "lobby-friends", id: "lobbyFriends", "aria-label": "在線的館友", "aria-live": "polite" });
  drawLobbyFriends(box);
  return box;
}
function drawLobbyFriends(box) {
  if (NET.state !== "online") { // 斷線時名單不會更新：不列舊的，免得以為大家還在
    box.replaceChildren(h("span", { class: "lf-tag" }, icon("users"), "館友在線"), h("span", { class: "lf-none" }, NET.state === "retrying" ? "連線中斷了，等壹下會自己連回來。" : "正在連線……"), btn("全部館友", () => openFriends(), "small lf-all"));
    return;
  }
  const on = NET.roster.filter(p => !p.me && p.status !== "offline").sort((a, b) => RANK[a.status] - RANK[b.status] || String(a.nick).localeCompare(String(b.nick)));
  const where = p => (p.status === "away" ? "離開壹下" : roomLabel(p.room));
  const chip = p => h("button", { type: "button", class: "lf-chip " + p.status, title: `${p.nick}：${where(p)}`, onClick: () => openFriends() },
    h("span", { class: "nf-dot", "aria-hidden": "true" }), h("b", null, p.nick), h("small", null, where(p)));
  box.replaceChildren(
    h("span", { class: "lf-tag" }, icon("users"), "館友在線"),
    on.length ? h("div", { class: "lf-list" }, on.slice(0, LOBBY_MAX).map(chip), on.length > LOBBY_MAX ? h("span", { class: "lf-more" }, `還有 ${on.length - LOBBY_MAX} 位`) : null)
      : h("span", { class: "lf-none" }, NET.state === "online" ? "現在沒有別的館友在線。" : "正在連線……"),
    btn("全部館友", () => openFriends(), "small lf-all"));
}

// ---------- 我的帳號（選單 → 我的帳號）：暱稱、隱身、上線提示、登出 ----------
export function openAccount() {
  if (!UI.net) return;
  const m = overlay("nb-account", "我的帳號", "我的帳號", "user");
  const row = (label, ctl) => h("div", { class: "na-row" }, h("span", { class: "na-l" }, label), ctl);
  const check = (text, on, fn) => {
    const c = h("input", { type: "checkbox" });
    c.checked = on;
    c.addEventListener("change", () => fn(c.checked));
    return h("label", { class: "na-check" }, c, " ", text);
  };
  const draw = () => {
    const me = NET.me || {};
    const err = h("p", { class: "na-err", role: "alert" });
    const nick = h("input", { class: "t-input na-input", maxlength: "12", "aria-label": "暱稱" });
    nick.value = me.nick || "";
    const saveNick = btn("改", async () => {
      const v = nick.value.trim();
      if (!v || v === me.nick) return;
      try { await NET.updateMe({ nick: v }); note("暱稱改好了。", "good"); updateNetMenu(); draw(); }
      catch (e) { err.textContent = e.message || "改不了。"; snd("error"); }
    }, "small");
    m.surface.replaceChildren(h("article", { class: "nb-sheet na-sheet" }, h("i", { class: "nb-pin l", "aria-hidden": "true" }), h("i", { class: "nb-pin r", "aria-hidden": "true" }),
      h("h3", null, me.nick || ""),
      row("暱稱", h("div", { class: "na-nick" }, nick, saveNick)),
      err,
      row("別人看到", check("隱身（館友的名單上你是離線）", !!me.invisible, async v => {
        try { await NET.updateMe({ invisible: v }); note(v ? "隱身了：館友看到你離線。" : "不隱身了。"); }
        catch (e) { note(e.message || "改不了。", "bad"); }
        draw();
      })),
      row("提示", check("館友上線時提示我", SAVE.settings.arriveNote !== false, v => { SAVE.settings.arriveNote = v; persist(); })),
      h("div", { class: "nb-cta" }, btn("登出", () => { m.close(); logout(); }, "small"))));
  };
  draw();
  snd("flip");
}

PANELS.friends = openFriends;
PANELS.account = openAccount;
