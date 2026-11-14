// ================================================================
//  開館
// ================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { GEN_TEXT } from "../../shared/config.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { FIT_KEY, GEN2_KEY, IMG_KEY, SAVE_KEY, SAVE_KEY_ADV, asList, ensureDay, gameDayNo, isFree, migrateGen2, migrateSave, pad, renameVal, todayStr, visitorArrive } from "../../shared/logic.js";
import { visitorEvery } from "../../shared/logic3.js";
import { nowMs } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { $, planPortrait, FIT, P, PANELS, SAVE, UI, applyHolidayLook, applySettings, buildNav, clearHeld, go, h, motionOff, note, persist, noteRetasked, quirkTick, readJSON, rerender, setImg, setSave, snd, toggleMenu, trackGaze, updateDayClock, updateStatus } from "./ui_core.js";
import { dailyRecovery } from "./ui_screens1.js";
import { visitorCard } from "./ui_screens2.js";
import { netBoot } from "./ui_login.js";
import { ticketPing } from "./ui_ticket.js";

export function normalizeImages(o) {
  const out = {};
  Object.entries(o || {}).forEach(([k, v]) => {
    const l = asList(v).filter(u => typeof u === "string" && u.startsWith("data:image"));
    const slot = renameVal(k); // 第 2 代的「俄國8」那一列搬到「俄國8+9」
    if (l.length) out[slot] = asList(out[slot]).concat(l);
  });
  return out;
}
// 展廳來了壹位（或壹組）：畫面插壹張卡、聲音、狀態列、存檔
function showVisitor(v, key) {
  if (UI.screen === "hall") {
    const box = $("#visitors");
    if (box) { $(".empty", box) && $(".empty", box).remove(); box.insertBefore(visitorCard(v), box.children[1] || null); }
    snd("coin");
  } else P.news.hall = true;
  updateStatus(); persist();
  ticketPing(key); // 參觀者付門票（11-13）：隔一陣子叫伺服器收一次（11-14：夾著看到的 key，領分紅）
}
// 伺服器的展廳時刻表（11-14，翊文：「每 150 秒…接到散客裡」「就不用每 150 秒了」）：每 90 秒左右問壹次（只有在玩、登入的時候），之後每秒看有沒有到了還沒看過的，到了就放人進展廳。
// 有名字的 NPC 壹位算壹次到訪；散客壹組 n 位算 n 次（靈感照人數，visitorArrive 的 entry）。看過的 key 記在存檔（P.hallSeen，今天的），重開網頁不會重發。離線、沒登入：不會來人
let feedAt = 0, feedBusy = false, FEED = [];
async function pollFeed() {
  feedBusy = true;
  try { const r = await NET.call("casino", { act: "hallFeed" }); if (r && r.ok && Array.isArray(r.feed)) { FEED = r.feed; UI.hallIn = r.in || null; feedAt = Date.now(); } } catch (e) { /* 下次再問 */ }
  feedBusy = false;
}
function hallFeedTick() {
  if (!feedBusy && Date.now() - feedAt > 90000) pollFeed();
  const day = todayStr();
  if (!P.hallSeen || P.hallSeen.day !== day) P.hallSeen = { day, keys: [] };
  const t = nowMs();
  for (const e of FEED) {
    if (e.at > t || P.hallSeen.keys.includes(e.key)) continue;
    P.hallSeen.keys.push(e.key); P.hallSeen.keys = P.hallSeen.keys.slice(-80);
    const v = visitorArrive(P, undefined, e);
    if (v) showVisitor(v, e.key);
  }
}
export function tick() {
  if (document.hidden) return;
  applyHolidayLook(); // 節日的外觀：過了 05:00 自己換（11-09，決定 0030）。標題畫面也換，所以放在 P 前面
  if (!P) return;
  const t = todayStr(); // 台灣時間 05:00 換日（決定 0019）
  if (P.day && P.day.date !== t) {
    const nd = ensureDay(P, t); if (nd && nd.retasked) noteRetasked(nd.retasked); UI.pendingRecovery = !isFree(P); UI.pendingGrowth = UI.pendingRecovery; updateStatus();
    snd("bell"); note(`新的壹天：第 ${pad(gameDayNo(P, t), 3)} 天。委託換新了，每天的次數也重新算。`, "good");
    if (UI.screen === "lobby") dailyRecovery().then(() => { if (PANELS.autoSignin) PANELS.autoSignin(); }); // 換日了：今天的簽到卡（11-09）
  }
  quirkTick(); // 怪癖時間到自己消失、剩幾天換字（決定 0027、0046）。照真的時鐘走，沒在玩也算，所以放在下面那行前面
  updateDayClock(); // 「還有 N 小時換日」每秒更新（沒在玩也照走，換日是照時鐘）
  if (Date.now() - UI.lastInput > 60000) return; // 沒在玩就不算時間（展廳的參觀者、這一位玩了幾秒）
  P.activeSec++;
  if (P.visit && typeof P.visit.sec === "number") P.visit.sec++; // 這一位玩了幾秒（多位參觀者，11-08；activeSec 是整間博物館的）
  if (UI.net && NET.loggedIn) hallFeedTick(); // 登入了：展廳的參觀者照伺服器的時刻表來（11-14）
  else if (P.activeSec % visitorEvery(P) === 0) { // 沒登入（單機）：照舊每 150 秒來一位
    const v = visitorArrive(P);
    if (v) showVisitor(v);
  }
  if (P.activeSec % 20 === 0) persist();
}
export function boot() {
  // 測試分頁不出聲（翊文 11-08：「測試的音樂可以都先關掉嗎」）：開發時網址帶 ?user=（多人測試）或 #畫面（開發用的畫面）就靜音、不放布幕。
  // 不改存檔裡的聲音設定。要測聲音：網址加 &sound（例如 ?user=小明&sound）。
  UI.testMute = !!import.meta.env.DEV && (/[?&]user=/.test(location.search) || location.hash.length > 1) && !/[?&]sound/.test(location.search);
  // 第 3 版第一次打開：把進階版的存檔搬過來（進階版的檔案照樣能玩，存檔互不影響）
  const v3 = readJSON(SAVE_KEY);
  setSave(migrateSave(v3 || readJSON(SAVE_KEY_ADV)));
  if (!v3 && readJSON(SAVE_KEY_ADV)) UI.fromAdv = true;
  setImg(normalizeImages(readJSON(IMG_KEY)));
  Object.assign(FIT, readJSON(FIT_KEY) || {});
  const n = migrateGen2(SAVE, readJSON(GEN2_KEY));
  if (n) UI.migrated = n;
  persist();
  document.documentElement.style.setProperty("--sil", `url("data:image/svg+xml;utf8,${encodeURIComponent(ART.silhouette)}")`);
  // 「今天」＝台灣時間 05:00 換日，todayStr() 自己算（決定 0019，11-09 拿掉「壹天多長」）。
  // 「現在」照網路的時間：登入後 net_firebase.js 讀 Firebase 的時間差，setNowClock 換掉（決定 0026）。沒登入之前照電腦的時鐘
  buildNav();
  applySettings();
  document.addEventListener("pointermove", trackGaze, { passive: true });
  ["pointerdown", "keydown", "wheel"].forEach(ev => document.addEventListener(ev, () => { UI.lastInput = Date.now(); }, { passive: true }));
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("button, a, .fp-room")) snd("click"); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (UI.held) { clearHeld(); note("放下了。"); } toggleMenu(false); }
  });
  let rt = null, wasPortrait = planPortrait();
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { const p = planPortrait(); if (p !== wasPortrait) { wasPortrait = p; if (UI.screen === "lobby") rerender(); } }, 250);
  });
  setInterval(tick, 1000);
  netBoot(); // 多人版 M1：看伺服器、上次登入過沒（不等它，布幕先放）
  museumDoor(() => go("title", {}, { action: false }));
}
// ---------- 開館前的布幕（翊文 11-08：音樂壹開始要自動播放） ----------
// 瀏覽器不准網頁在玩家點第壹下之前出聲。先試著自動播放：瀏覽器放行，布幕自己拉開、音樂直接響；
// 不放行，就停在布幕「點壹下 推開館門」，點了布幕拉開、開場音樂和標題動畫壹起開始。
// 測試截圖（__PM_NODOOR__）、測試分頁（testMute）不放布幕。
// 靜音的人也放（翊文 11-11：「原本開啟時主畫面拉布簾的動畫不見了，幫我加回去」；以前靜音的人整個跳過）：不用點，壹下子自己拉開，沒有音樂
export function museumDoor(enter) {
  if (UI.testMute || window.__PM_NODOOR__) { enter(); return; }
  const muted = !!SAVE.settings.muted;
  let opened = false;
  const door = h("div", { class: "m-door", role: "button", tabindex: "0", "aria-label": "點壹下推開館門（開場有音樂）" },
    h("div", { class: "md-half l" }), h("div", { class: "md-half r" }),
    h("div", { class: "md-call" },
      h("div", { class: "md-name" }, GEN_TEXT.museum),
      h("div", { class: "md-orn", "aria-hidden": "true" }),
      h("div", { class: "md-push" }, muted ? "館門開了" : "點壹下　推開館門"),
      h("div", { class: "md-sub" }, muted ? "現在是靜音（右上角的喇叭可以打開）" : "♪ 開場有音樂，建議打開喇叭或戴耳機")));
  const open = () => {
    if (opened) return;
    opened = true;
    document.removeEventListener("keydown", onKey, true);
    enter(); // 標題畫在布幕後面，動畫跟著布幕拉開壹起開始
    door.classList.add("open");
    setTimeout(() => door.remove(), motionOff() ? 500 : 1700);
    const f = document.querySelector("#tName, .t-actions .btn");
    if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* 沒關係 */ } }, 50); // 鍵盤玩家直接在登入的名字框，或第壹個按鈕（「繼續參觀」，沒進度時是「新參觀者」）上
  };
  const onKey = e => { if (["Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return; e.preventDefault(); open(); };
  door.addEventListener("click", open);
  document.addEventListener("keydown", onKey, true);
  document.body.append(door);
  setTimeout(() => { if (!opened) door.focus({ preventScroll: true }); }, 30);
  if (muted) { setTimeout(open, 700); return; } // 靜音：不用試著放音樂，看壹下布幕就拉開
  FX.sound.tryAutoplay().then(ok => { if (ok && !opened) open(); }); // 瀏覽器放行：自己拉開
}
if (typeof document !== "undefined" && typeof window !== "undefined" && !window.__PM_TEST__) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
}
// 第 4 版：Node 測試改成直接讀 shared/ 的模組，這裡不再匯出
