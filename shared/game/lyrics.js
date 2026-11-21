// 深夜大廳歌曲字幕：這個時間點（歌放到第幾秒）該顯示哪壹句。純函式，字幕畫面在 web/src/fx/ui_lyrics.js，內容在 content/lyrics/lobby-night.json
// lines：[{ t, text?, kind, end? }]，照 t 由小到大；沒寫 end 就到下壹句開始，最長 maxShow 秒；gap（沒有 text）回 null
export function lyricAt(lines, pos, maxShow = 6) {
  if (pos == null || !Array.isArray(lines)) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!(pos >= l.t)) continue;
    const end = l.end != null ? l.end : Math.min(lines[i + 1] ? lines[i + 1].t : l.t + maxShow, l.t + maxShow);
    return pos < end && l.text ? l : null;
  }
  return null;
}
