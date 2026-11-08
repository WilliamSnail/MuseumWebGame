// =====================================================================
//  理智低的時候才會發生的怪事（翊文 11-08：「除了牠們在看你以外，還有什麼更多奇特的方式，可以多加三項嗎」）
//  1. 你壹轉頭，畫就變了（理智 < 35）：游標離開畫廊的畫，畫偶爾左右翻過來或倒過來
//  2. 有東西跟著游標（理智 < 25）：壹個淡淡的佩佩黑影慢慢跟在游標後面，追上時會低語
//  3. 按鈕在跟你說話（理智 < 30）：游標移到按鈕上，字偶爾亂碼壹下、變成別的話，1.6 秒後變回來（功能照常）
//  每壹種第壹次出現，會跳壹句旁白（記在 P.oddSeen，壹位參觀者壹次）。自由模式、理智歸零（燈熄了）時都不會發生。
// =====================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { ART } from "./art.js";
import { isFree, pickOne, todayStr } from "../../shared/logic.js";
import { P, UI, h, later, motionOff, note, persist, snd } from "./ui_core.js";

export const ODD_AT = { flip: 35, follow: 25, talk: 30 }; // talk 原本 20，翊文說不明顯，提早到 30
export const oddOn = k => !!(P && !isFree(P) && !P.dark && P.sanity < ODD_AT[k]);
export function oddFirst(k, text) {
  P.oddSeen = P.oddSeen || {};
  if (P.oddSeen[k]) return;
  P.oddSeen[k] = todayStr(); persist();
  later(() => note(text, "bad"), 700);
}

// ---------- 1. 你壹轉頭，畫就變了 ----------
document.addEventListener("pointerout", e => {
  if (UI.screen !== "gallery" || !oddOn("flip")) return;
  const ex = e.target && e.target.closest && e.target.closest(".exhibit:not(.locked)");
  if (!ex || (e.relatedTarget && ex.contains(e.relatedTarget))) return;
  const frame = ex.querySelector(".frame:not(.covered)");
  if (!frame || frame.classList.contains("odd-flipped") || Math.random() > 0.35) return;
  frame.classList.add("odd-flipped", Math.random() < 0.5 ? "odd-h" : "odd-v");
  oddFirst("flip", "(你覺得那幅畫，剛剛不是這樣的)");
});

// ---------- 2. 有東西跟著游標 ----------
export const ODD_F = { el: null, x: -200, y: -200, mx: -200, my: -200, raf: 0, touchT: 0 };
document.addEventListener("pointermove", e => { ODD_F.mx = e.clientX; ODD_F.my = e.clientY; }, { passive: true });
export function oddFollowTick() {
  ODD_F.raf = 0;
  const on = oddOn("follow");
  if (!on) { if (ODD_F.el) { ODD_F.el.remove(); ODD_F.el = null; } return; }
  if (!ODD_F.el) {
    ODD_F.el = h("div", { class: "odd-follower", "aria-hidden": "true", html: ART.frog({ 稀有度: "普通", 心情: "開心", 顏色: "黑", 帽子: "沒有", 姿勢: "站著", 背景: "沒有", 手上拿的東西: "沒有" }, { silhouette: true }) });
    document.body.append(ODD_F.el);
    ODD_F.x = ODD_F.mx - 160; ODD_F.y = ODD_F.my + 120;
    oddFirst("follow", "(有什麼東西，壹直跟在你的游標後面)");
  }
  const k = motionOff() ? 1 : 0.025; // 很慢地跟
  ODD_F.x += (ODD_F.mx - ODD_F.x) * k; ODD_F.y += (ODD_F.my - ODD_F.y) * k;
  ODD_F.el.style.transform = `translate(${(ODD_F.x - 30).toFixed(1)}px, ${(ODD_F.y - 30).toFixed(1)}px)`;
  ODD_F.el.style.opacity = String(Math.min(0.5, 0.18 + (ODD_AT.follow - P.sanity) / ODD_AT.follow * 0.4));
  const near = Math.hypot(ODD_F.mx - ODD_F.x, ODD_F.my - ODD_F.y) < 26;
  if (near && Date.now() - ODD_F.touchT > 9000) { ODD_F.touchT = Date.now(); snd("whisper"); ODD_F.el.classList.remove("touch"); ODD_F.el.getBoundingClientRect(); ODD_F.el.classList.add("touch"); }
  ODD_F.raf = requestAnimationFrame(oddFollowTick);
}
setInterval(() => { if (!ODD_F.raf && oddOn("follow")) ODD_F.raf = requestAnimationFrame(oddFollowTick); }, 1000);

// ---------- 3. 按鈕在跟你說話 ----------
export const ODD_LINES = ["不要按", "牠在後面", "你確定？", "再看壹次", "回頭", "已經太遲了", "8+9", "牠們在聽", "別走", "你也在圖鑑裡"];
export const ODD_GLYPH = "牠眼你看在後門鏡佩▓▒░";
export let oddTalkSnd = 0;
document.addEventListener("pointerover", e => {
  if (!oddOn("talk")) return;
  const b = e.target && e.target.closest && e.target.closest(".btn");
  if (!b || b.dataset.oddTalk || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  const first = !(P.oddSeen && P.oddSeen.talk);
  if (!first && Math.random() > 0.35) return; // 第壹次壹定發生，之後 35%
  b.dataset.oddTalk = "1";
  const html = b.innerHTML, w = b.offsetWidth;
  b.style.minWidth = w + "px"; // 字變了，按鈕的寬度不要跳
  b.classList.add("odd-talking");
  const line = pickOne(ODD_LINES);
  const scramble = n => [...line].map(() => ODD_GLYPH[Math.floor(Math.random() * ODD_GLYPH.length)]).join("").slice(0, Math.max(2, n));
  let k = 0;
  const tick = setInterval(() => { b.textContent = scramble(line.length); if (++k >= 4) { clearInterval(tick); b.textContent = line; } }, 60);
  if (Date.now() - oddTalkSnd > 6000) { oddTalkSnd = Date.now(); snd("whisper"); }
  setTimeout(() => {
    clearInterval(tick);
    if (b.isConnected) { b.innerHTML = html; b.classList.remove("odd-talking"); b.style.minWidth = ""; }
    delete b.dataset.oddTalk;
  }, 1600);
  oddFirst("talk", "(按鈕剛剛好像寫著別的字)");
});
