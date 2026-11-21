// ================================================================
//  QA 用的小手把（11-21 測試 session）：只在 npm run dev／模擬器的網頁掛 window.__qa，正式的 dist/ 不載入（main.js 用 import.meta.env.DEV 才 import）。
//  為什麼：以前每次實測都要在瀏覽器 console 手動 (1) 用 performance.getEntriesByType 找模組網址再 import 才拿得到 NET、setNowClock，
//  (2) 一步步點「繼續參觀」、關職業視窗、點「知道了」、關公佈欄、再點房間，(3) 換帳號時 ?user= 不會換（這個分頁已登入就還是那個人）。
//  用法（javascript_tool 裡）：
//    await __qa.enter("銀行")                進挑戰存檔（沒有就自由模式）、關掉擋路的視窗、進那個房間（不給房間就停在大廳）
//    await __qa.as("聊乙")                   換成另壹個人（清掉這個分頁的登入、重新載入）；載入完再叫 __qa.enter
//    await __qa.casino({ act: "giver", op: "info" })   以目前的人叫 casino Function（會先 flush 存檔）；回 result
//    __qa.date(1)                            前端的「今天」往後撥 1 天（伺服器時間撥不動）；__qa.date(0) 還原
//    __qa.NET、__qa.me()                     網路層、目前登入的人
// ================================================================
import { NOW_CLOCK } from "../../../shared/core/logic_base.js";
import { setNowClock } from "../../../shared/core/logic.js";
import { NET } from "./net_firebase.js";

const W = ms => new Promise(r => setTimeout(r, ms));
const vis = el => el.getBoundingClientRect().width > 0;
const btn = t => [...document.querySelectorAll("button")].filter(vis).find(b => b.textContent.trim().startsWith(t));
async function until(f, ms = 15000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { const x = f(); if (x) return x; await W(250); } return null; }

async function enter(room, mode) {
  const first = await until(() => btn(mode || "繼續參觀") || btn("自由模式") || document.querySelector(".l2-room"));
  if (first && !document.querySelector(".l2-room")) { first.click(); await W(1500); }
  const jm = document.querySelectorAll(".job-modal button"); // 「你是誰？」選職業：選最後壹個再按「知道了」
  if (jm.length) { jm[Math.min(3, jm.length - 1)].click(); await W(600); const ok = btn("知道了"); if (ok) ok.click(); await W(500); }
  for (let i = 0; i < 4; i++) { const x = [...document.querySelectorAll(".nb-x")].find(vis); if (!x) break; x.click(); await W(500); } // 公佈欄、簽到
  if (!room) return !!document.querySelector(".l2-room");
  const rm = await until(() => [...document.querySelectorAll(".l2-room")].find(e => (e.getAttribute("aria-label") || "").startsWith(room)) || btn(room));
  if (!rm) return false;
  rm.click(); await W(1800);
  return true;
}
function as(name) { try { sessionStorage.clear(); } catch (e) { /* 沒關係 */ } location.href = `${location.pathname}?user=${encodeURIComponent(name)}`; }
async function casino(data) { try { await NET.flush(); } catch (e) { /* 沒存檔要送 */ } const r = await NET.call("casino", data); return r; }
let REAL = null; // 撥之前的時鐘（登入後是伺服器時間）：撥日期是在它上面加，不會自己呼叫自己
function date(days) {
  if (!REAL) REAL = NOW_CLOCK || (() => performance.timeOrigin + performance.now());
  const off = (Number(days) || 0) * 86400000, real = REAL;
  setNowClock(days ? () => real() + off : real);
}

window.__qa = { NET, enter, as, casino, date, me: () => NET.me };
