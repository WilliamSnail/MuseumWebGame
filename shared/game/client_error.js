// ================================================================
//  前端錯誤回報（翊文 11-17：「加」；決定 0125）：網頁出了沒人看到的錯，玩家端的 console 我們看不到。
//  這個檔是純函式：把一筆錯誤清乾淨（不含個資）、每個網頁最多送幾筆、每個人每分鐘最多幾筆。
//  網頁（web/src/core/error_report.js）和伺服器（functions/game/client_error.js）都用同壹份，測試在 test/game/client_error.test.cjs。
//  只留：訊息（前 300 字）、檔名:行號、stack 前 5 行、畫面 id、版本號、視窗大小。
//  不留：存檔、名字、uid、email、網址的 ? 和 # 後面、網域。
// ================================================================
export const CLIENT_ERR = { perPage: 5, msgMax: 300, lineMax: 200, stackLines: 5, perMinute: 5, dayCap: 400, ttlDays: 7 };

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UIDLIKE = /\b[A-Za-z0-9]{28}\b/g;
const URLISH = /https?:\/\/[^\s/)]+/g;
const QUERY = /[?#][^\s)]*/g;
// 壹行字清乾淨：email、像 uid 的、網域、網址的 ? # 後面都拿掉；多個空白併成壹個；最多 max 字
export function clientErrText(s, max) {
  const t = String(s == null ? "" : s).replace(EMAIL, () => "（email）").replace(UIDLIKE, () => "（uid）").replace(URLISH, () => "").replace(QUERY, () => "").replace(/\s+/g, " ").trim();
  return [...t].slice(0, max || CLIENT_ERR.lineMax).join("");
}
const tokenOf = (v, re) => (typeof v === "string" && re.test(v) ? v : "");
const intOf = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 20000 ? n : 0; };
// 傳進來的任何東西 → 乾淨的壹筆；訊息是空的就回 null（不送）
export function clientErrClean(raw) {
  if (!raw || typeof raw !== "object") return null;
  const msg = clientErrText(raw.msg, CLIENT_ERR.msgMax);
  if (!msg) return null;
  const stack = String(raw.stack == null ? "" : raw.stack).split("\n").map(x => clientErrText(x, CLIENT_ERR.lineMax)).filter(Boolean).slice(0, CLIENT_ERR.stackLines).join("\n");
  return { msg, src: clientErrText(raw.src, 120), stack, screen: tokenOf(raw.screen, /^[A-Za-z0-9_:-]{1,30}$/), ver: tokenOf(raw.ver, /^[\w.-]{1,20}$/), vw: intOf(raw.vw), vh: intOf(raw.vh) };
}
// 同壹天、同樣的訊息和位置算同壹筆（伺服器用它當文件名，次數加壹）
export function clientErrKey(c, day) {
  let h = 2166136261; const s = c.msg + "|" + c.src;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return String(day) + "_" + h.toString(16).padStart(8, "0");
}
// 網頁壹次開頁最多送幾筆；同樣的不重複送。sent 是已經送過的 key 陣列，回傳 true＝可以送（並記下）
export function clientErrAllow(sent, c) {
  const k = c.msg + "|" + c.src;
  if (sent.includes(k) || sent.length >= CLIENT_ERR.perPage) return false;
  sent.push(k); return true;
}
// 每個人（雜湊過的 IP）每分鐘最多 perMinute 筆：rec ＝ { w: 第幾分鐘, n: 這分鐘幾筆 } 或 null；回傳 { ok, rec }
export function clientErrQuota(rec, nowMs) {
  const w = Math.floor(nowMs / 60000);
  const cur = rec && rec.w === w ? rec.n : 0;
  if (cur >= CLIENT_ERR.perMinute) return { ok: false, rec: { w, n: cur } };
  return { ok: true, rec: { w, n: cur + 1 } };
}
