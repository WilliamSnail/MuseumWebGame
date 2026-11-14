// ================================================================
//  參觀者門票（11-13；規則和錢 shared/casino_ticket.js、伺服器 functions/casino.js 的 tickets）
//  展廳的參觀者在瀏覽器裡來（boot.js 的 visitorArrive）；這個檔只負責「來了幾位之後，隔一陣子叫伺服器收一次門票」。
//  不算錢、不顯示金額：伺服器照存檔的展廳評分算，展廳主分紅進錢包，狀態列的籌碼跟著更新。沒登入、連不上就算了，下次再收（伺服器看累計來了幾位）。
// ================================================================
import { NET } from "./net_firebase.js";
import { UI, setChips } from "./ui_core.js";

const EVERY = 3, GAP_MS = 120000; // 至少看到 3 個到訪、離上次領超過 2 分鐘才叫（11-14：參觀者來自伺服器的時刻表，key 夾在這裡回報領分紅）
let seen = 0, last = 0, busy = false, pending = [];
async function claim() {
  busy = true;
  try {
    if (NET.flush) await NET.flush(); // 先把存檔（P.hallVisitors）送上去，伺服器才看得到最新的
    const keys = pending.slice(0, 40);
    const r = await NET.call("casino", { act: "tickets", keys });
    if (r && r.ok) { pending = pending.filter(k => !keys.includes(k)); seen = 0; last = Date.now(); if (typeof r.chips === "number") setChips(r.chips); }
  } catch (e) { /* 連不上、存檔衝突：下次再收 */ }
  busy = false;
}
// 每來一位參觀者叫一次
export function ticketPing(key) {
  if (!UI.net || !NET.loggedIn) return;
  if (typeof key === "string" && !pending.includes(key)) pending.push(key);
  seen++;
  if (!busy && seen >= EVERY && Date.now() - last >= GAP_MS) claim();
}
