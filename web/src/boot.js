// ================================================================
//  開館
// ================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { GEN_TEXT } from "../../shared/config.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { FIT_KEY, GEN2_KEY, IMG_KEY, SAVE_KEY, SAVE_KEY_ADV, asList, ensureDay, gameDateStr, gameDayNo, isFree, migrateGen2, migrateSave, pad, renameVal, setDayClock, todayStr, visitorArrive } from "../../shared/logic.js";
import { visitorEvery } from "../../shared/logic3.js";
import { $, FIT, P, SAVE, UI, applySettings, buildNav, clearHeld, dayMins, go, h, motionOff, note, persist, readJSON, rerender, setImg, setSave, snd, toggleMenu, trackGaze, updateDayClock, updateStatus } from "./ui_core.js";
import { dailyRecovery } from "./ui_screens1.js";
import { visitorCard } from "./ui_screens2.js";
import { netBoot } from "./ui_login.js";

export function normalizeImages(o) {
  const out = {};
  Object.entries(o || {}).forEach(([k, v]) => {
    const l = asList(v).filter(u => typeof u === "string" && u.startsWith("data:image"));
    const slot = renameVal(k); // 第 2 代的「俄國8」那一列搬到「俄國8+9」
    if (l.length) out[slot] = asList(out[slot]).concat(l);
  });
  return out;
}
export function tick() {
  if (!P || document.hidden) return;
  const t = todayStr();
  if (P.day && P.day.date !== t) {
    ensureDay(P, t); UI.pendingRecovery = !isFree(P); UI.pendingGrowth = UI.pendingRecovery; updateStatus();
    snd("bell"); note(`新的壹天：第 ${pad(gameDayNo(P, dayMins()), 3)} 天。委託換新了，每天的次數也重新算。`, "good");
    if (UI.screen === "lobby") dailyRecovery();
  }
  if (Date.now() - UI.lastInput > 60000) return; // 沒在玩就不算時間
  P.activeSec++;
  if (P.visit && typeof P.visit.sec === "number") P.visit.sec++; // 這一位玩了幾秒（多位參觀者，11-08；activeSec 是整間博物館的）
  updateDayClock(); // 「幾分鐘後換天」每秒更新
  if (P.activeSec % visitorEvery(P) === 0) {
    const v = visitorArrive(P);
    if (v) {
      if (UI.screen === "hall") {
        const box = $("#visitors");
        if (box) { $(".empty", box) && $(".empty", box).remove(); box.insertBefore(visitorCard(v), box.children[1] || null); }
        snd("coin");
      } else P.news.hall = true;
      updateStatus(); persist();
    }
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
  setDayClock(() => P && dayMins() > 0 ? gameDateStr(P, dayMins()) : null); // 「今天」照遊戲裡的天數走
  buildNav();
  applySettings();
  document.addEventListener("pointermove", trackGaze, { passive: true });
  ["pointerdown", "keydown", "wheel"].forEach(ev => document.addEventListener(ev, () => { UI.lastInput = Date.now(); }, { passive: true }));
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("button, a, .fp-room")) snd("click"); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (UI.held) { clearHeld(); note("放下了。"); } toggleMenu(false); }
  });
  let rt = null, wasPortrait = matchMedia("(max-width: 760px)").matches;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { const p = matchMedia("(max-width: 760px)").matches; if (p !== wasPortrait) { wasPortrait = p; if (UI.screen === "lobby") rerender(); } }, 250);
  });
  setInterval(tick, 1000);
  netBoot(); // 多人版 M1：看伺服器、上次登入過沒（不等它，布幕先放）
  museumDoor(() => go("title", {}, { action: false }));
}
// ---------- 開館前的布幕（翊文 11-08：音樂壹開始要自動播放） ----------
// 瀏覽器不准網頁在玩家點第壹下之前出聲。先試著自動播放：瀏覽器放行，布幕自己拉開、音樂直接響；
// 不放行，就停在布幕「點壹下 推開館門」，點了布幕拉開、開場音樂和標題動畫壹起開始。
// 靜音的人、測試截圖（__PM_NODOOR__）不放布幕。
export function museumDoor(enter) {
  if (SAVE.settings.muted || UI.testMute || window.__PM_NODOOR__) { enter(); return; }
  let opened = false;
  const door = h("div", { class: "m-door", role: "button", tabindex: "0", "aria-label": "點壹下推開館門（開場有音樂）" },
    h("div", { class: "md-half l" }), h("div", { class: "md-half r" }),
    h("div", { class: "md-call" },
      h("div", { class: "md-name" }, GEN_TEXT.museum),
      h("div", { class: "md-orn", "aria-hidden": "true" }),
      h("div", { class: "md-push" }, "點壹下　推開館門"),
      h("div", { class: "md-sub" }, "♪ 開場有音樂，建議打開喇叭或戴耳機")));
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
  FX.sound.tryAutoplay().then(ok => { if (ok && !opened) open(); }); // 瀏覽器放行：自己拉開
}
if (typeof document !== "undefined" && typeof window !== "undefined" && !window.__PM_TEST__) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
}
// 第 4 版：Node 測試改成直接讀 shared/ 的模組，這裡不再匯出
