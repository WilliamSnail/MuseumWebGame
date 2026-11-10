// ================================================================
//  有新版本的提示（翊文 11-10：館友證的新頁籤「我怎麼沒看到」→「好，加提示」）
//  合併就會自動部署，可是還開著的網頁跑的是舊程式，要重新整理才會換。
//  這裡每隔壹段時間、切回這個分頁時，去拿壹次 index.html（firebase.json 設了 no-cache），
//  看裡面的程式檔名（/assets/index-xxxx.js）跟現在跑的是不是同壹個。不壹樣就在畫面上方跳壹條「館裡更新了」。
//  判斷在 shared/notices.js 的 buildScript、buildChanged；這裡只負責去拿和演出來。
//  開發時（npm run dev）程式是 /src/main.js，沒有檔名可以比，不檢查。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { buildChanged, buildScript } from "../../shared/notices.js";
import { NET } from "./net_firebase.js";
import { UI, h, persist } from "./ui_core.js";

const EVERY = 10 * 60 * 1000; // 多久檢查壹次
const AGAIN = 60 * 1000; // 切回分頁時，離上次至少隔多久才再檢查
const LATER = 30 * 60 * 1000; // 按「等壹下」之後多久再提醒

const mine = buildScript([...document.scripts].map(s => s.getAttribute("src") || "").join("\n"));
let last = 0, snoozeUntil = 0, bar = null;

async function check() {
  if (!mine || bar || Date.now() < snoozeUntil) return;
  last = Date.now();
  try {
    const r = await fetch("/index.html", { cache: "no-store" });
    if (!r.ok) return;
    if (buildChanged(await r.text(), mine)) show();
  } catch (e) { /* 離線或伺服器沒回：下次再試 */ }
}

function show() {
  if (bar) return;
  // 先存：登入的人等伺服器存好（最多等 3 秒），再重新整理
  const reload = async e => {
    if (e && e.currentTarget) e.currentTarget.disabled = true;
    try {
      persist();
      if (UI.net && NET.flush) await Promise.race([NET.flush(), new Promise(r => setTimeout(r, 3000))]);
    } catch (err) { /* 存不了也照樣重新整理：存檔本來就隨時在存 */ }
    location.reload();
  };
  const later = () => { snoozeUntil = Date.now() + LATER; bar.remove(); bar = null; };
  bar = h("div", { class: "upd-bar", role: "status" },
    h("span", null, h("b", null, "館裡更新了。"), "重新整理就能看到新的東西，存檔不會不見。"),
    h("button", { type: "button", class: "btn primary small", onClick: reload }, "重新整理"),
    h("button", { type: "button", class: "btn ghost small", onClick: later }, "等壹下"));
  document.body.append(bar);
}

if (mine) {
  setInterval(check, EVERY);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - last > AGAIN) check(); });
  window.addEventListener("focus", () => { if (Date.now() - last > AGAIN) check(); });
}
