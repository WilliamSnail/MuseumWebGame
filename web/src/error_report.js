// ================================================================
//  前端錯誤回報（決定 0125，翊文 11-17：「加」）：網頁出了錯，把清乾淨的壹筆（訊息、位置、stack 前 5 行、畫面 id、版本、視窗大小）丟給伺服器 clientError。
//  不送存檔、名字、uid、email、網址的 ? 和 #（shared/client_error.js 的 clientErrClean 清；伺服器再清壹次）。
//  每次開頁最多 5 筆、同樣的不重複送；開發時（npm run dev）不送。送不出去（還沒連上、離線）就算了，不重試超過壹次。
//  reportClientError(err, where)：畫面自己 try/catch 抓到的錯也用它報（例如委託櫃台的側欄）。
// ================================================================
import { CLIENT_ERR, clientErrAllow, clientErrClean } from "../../shared/client_error.js";
import { NET } from "./net_firebase.js";

const sent = [];
const IGNORE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection/i;
const fromOurs = f => !f || f.startsWith(location.origin) || f.startsWith("/"); // 瀏覽器外掛、別的網站的 script 出的錯不管
function send(c, tries) {
  if (!NET || !NET.call) return;
  NET.call("clientError", c).catch(() => { if (tries < 1) setTimeout(() => send(c, tries + 1), 4000); }); // 還沒連上：4 秒後再試壹次
}
export function reportClientError(err, where) {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) return;
    const e = err && typeof err === "object" ? err : { message: String(err) };
    const body = document && document.body, ds = body && body.dataset ? body.dataset.screen : "";
    const c = clientErrClean({ msg: (where ? "[" + where + "] " : "") + (e.message || String(err)), src: e.filename ? e.filename + ":" + (e.lineno || 0) : "", stack: e.stack || "",
      screen: ds || "", ver: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "", vw: window.innerWidth, vh: window.innerHeight });
    if (!c || IGNORE.test(c.msg) || !clientErrAllow(sent, c)) return;
    send(c, 0);
  } catch (x) { /* 回報本身不能再出錯 */ }
}
window.addEventListener("error", ev => { if (fromOurs(ev.filename)) reportClientError({ message: ev.message, filename: ev.filename, lineno: ev.lineno, stack: ev.error && ev.error.stack }); });
window.addEventListener("unhandledrejection", ev => { const r = ev.reason; reportClientError(r && typeof r === "object" ? { message: r.message || "未處理的 Promise 錯誤", stack: r.stack } : { message: "未處理的 Promise 錯誤：" + String(r) }); });
export const CLIENT_ERR_PER_PAGE = CLIENT_ERR.perPage;
