// ================================================================
//  歌詞對時工具（開發用；翊文 11-21：「時間軸先估，做對時工具讓我按空白鍵校」）
//  用法：npm run dev，開 http://localhost:5173/?lyrics-tap#lobby → 按「開始播」→ 每句歌詞「開始唱」的那壹刻按空白鍵。
//  畫面上亮著的是「下壹個要按的那句」；按錯了按 Backspace 退回上壹句；R 重來。按完最後壹句（或按 Enter）會印出新的 lines，按「複製」貼回 content/lyrics/lobby-night.json。
//  用壹個獨立的 Audio 放 web/public/sfx/lobby-night.mp3（不經過遊戲的靜音，所以網址不用加 &sound）。只在 npm run dev 載入（debug_boot.js）。說明：docs/操作/歌詞對時.md
// ================================================================
import LYRICS from "../../../content/lyrics/lobby-night.json";
import { h } from "./ui_core.js";

if (/(^|[?&#])lyrics-tap/.test(location.search + location.hash)) {
  window.addEventListener("load", () => setTimeout(start, 600));
}
function start() {
  const lines = LYRICS.lines.filter(l => l.text); // gap 不用按（它沒有字）
  const got = []; // 每句的秒數
  const audio = new Audio("/sfx/lobby-night.mp3");
  const list = h("ol", { class: "ly-tap-list" }, lines.map(l => h("li", null, h("span", { class: "ly-tap-t" }, "—"), l.text)));
  const out = h("textarea", { class: "ly-tap-out", rows: 8, readonly: true, "aria-label": "新的 lines" });
  const clock = h("b", { class: "ly-tap-clock" }, "0.0");
  const go = h("button", { type: "button", class: "btn primary", onClick: () => { got.length = 0; mark(); audio.currentTime = 0; audio.play(); } }, "開始播");
  const copy = h("button", { type: "button", class: "btn", onClick: () => { out.select(); navigator.clipboard && navigator.clipboard.writeText(out.value); } }, "複製");
  const box = h("div", { class: "ly-tap", role: "dialog", "aria-label": "歌詞對時" },
    h("p", null, "每句開始唱的那壹刻按空白鍵；Backspace 退回壹句；R 重來；Enter 結束印出。"), h("div", null, go, " ", copy, " 現在：", clock, " 秒"), list, out);
  document.body.append(box);
  function mark() {
    [...list.children].forEach((li, i) => { li.classList.toggle("now", i === got.length); li.firstChild.textContent = got[i] != null ? got[i].toFixed(1) : "—"; });
  }
  function finish() {
    // 沒按到的句子（和 gap）照原本的時間；有按的換成新的。gap 的 t 跟著前壹句的移動量平移
    const next = []; let k = 0, shift = 0;
    for (const l of LYRICS.lines) {
      if (l.text) { const t = got[k++]; if (t != null) shift = t - l.t; next.push(Object.assign({}, l, { t: +(t != null ? t : l.t + shift).toFixed(1) })); }
      else next.push(Object.assign({}, l, { t: +(l.t + shift).toFixed(1) }));
    }
    out.value = JSON.stringify(next, null, 2); console.log("lobby-night lines:", out.value);
  }
  setInterval(() => { clock.textContent = audio.currentTime.toFixed(1); }, 100);
  window.addEventListener("keydown", e => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); if (!audio.paused && got.length < lines.length) { got.push(audio.currentTime); mark(); if (got.length === lines.length) finish(); } }
    else if (e.key === "Backspace") { got.pop(); mark(); }
    else if (e.key === "r" || e.key === "R") { got.length = 0; audio.currentTime = 0; mark(); }
    else if (e.key === "Enter") finish();
  });
  mark();
}
