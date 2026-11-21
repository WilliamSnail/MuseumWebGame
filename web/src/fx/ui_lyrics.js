// ================================================================
//  深夜大廳歌曲的字幕（翊文 11-21：「晚上 11:30 播的大廳音樂能夠也在大廳顯示歌詞嗎」）
//  歌詞和時間軸在 content/lyrics/lobby-night.json；歌放到第幾秒由 fx_sound.js 的 nightPos() 告訴我們（歌真的在放、有聲音才有值）。
//  像館內廣播的字幕：壹次壹行，淡入淡出，不擋操作（pointer-events: none）。靜音、換了曲子、不在大廳＝不顯示。
//  大廳畫面（ui_screens1.js）呼叫 ADDONS.lobbyLyrics()；這裡不動 DOM 以外的東西。時間軸還沒人聽過對時：用 ?lyrics-tap#lobby（web/src/core/lyrics_tap.js）。
// ================================================================
import LYRICS from "../../../content/lyrics/lobby-night.json";
import { lyricAt } from "../../../shared/game/lyrics.js";
import { FX } from "./fx.js";
import { ADDONS, every, h } from "../core/ui_core.js";

const LINES = LYRICS.lines;
ADDONS.lobbyLyrics = () => {
  const box = h("div", { class: "ly-box", "aria-hidden": "true" }, h("p", { class: "ly-line" }));
  const line = box.firstChild;
  let shown = null;
  every(() => {
    const l = lyricAt(LINES, FX.sound.nightPos ? FX.sound.nightPos() : null);
    if (l === shown) return;
    shown = l;
    if (l) { line.textContent = l.text; line.className = "ly-line on " + l.kind; box.dataset.kind = l.kind; } else line.classList.remove("on");
  }, 250);
  return box;
};
