// ================================================================
//  大廳導覽圖上的館友（11-09）：在線名單 → 每間房有誰。純規則，不碰畫面。
//  畫面在 web/src/ui_mates.js；測試在 test/mates.test.cjs。
//  room 是玩家寫進資料庫的字串：只認白名單，不認得的一律不顯示。
// ================================================================

// 導覽圖上有的房間（跟 web/src/art.js 的 PLAN 對得上）
export const MATE_ROOMS = ["lobby", "origin", "gallery", "codex", "office", "workshop", "pillow", "commission", "cellar", "hall", "library", "fusion"];
// 不在圖上、但可以寫「在別處」的：門口、設定
export const MATE_ELSEWHERE = { title: "在門口", settings: "在設定" };

// 這個 room 對到導覽圖上的哪一格：房間代號、"elsewhere"（圖旁邊那一行）、或 null（不顯示）
// reveal（揭曉）是手作坊裡的流程；cellar:b2 這種是地下收藏庫某一層。
// ending（結局）、darkroom（黑房間）是隱藏內容，不能讓別人看到有人在那裡，所以不顯示（界線：不破梗）
export function mateSpot(room) {
  if (typeof room !== "string") return null;
  if (MATE_ROOMS.includes(room)) return room;
  if (room === "reveal") return "workshop";
  if (/^cellar:[a-z0-9_:-]{1,24}$/.test(room)) return "cellar";
  if (Object.prototype.hasOwnProperty.call(MATE_ELSEWHERE, room)) return "elsewhere";
  return null;
}

// 名單 → { 房間: [{ id, nick, status }], elsewhere: [{ id, nick, status, where }] }
// 只算 online、away；自己（me）和 offline 不算。同一個人（id）只算一次。
// 每一格：在線的排前面，暱稱同樣的照 id 排，每次排出來順序都一樣（換房間時不會別人也跳來跳去）
export function matesByRoom(roster) {
  const out = { elsewhere: [] };
  for (const k of MATE_ROOMS) out[k] = [];
  const seen = new Set();
  for (const p of Array.isArray(roster) ? roster : []) {
    if (!p || p.me || (p.status !== "online" && p.status !== "away")) continue;
    const id = String(p.id ?? ""), nick = String(p.nick ?? "").trim();
    if (!id || !nick || seen.has(id)) continue;
    const spot = mateSpot(p.room);
    if (!spot) continue;
    seen.add(id);
    const m = { id, nick, status: p.status };
    if (spot === "elsewhere") out.elsewhere.push(Object.assign(m, { where: MATE_ELSEWHERE[p.room] }));
    else out[spot].push(m);
  }
  const cmp = (a, b) => (a.status === b.status ? 0 : a.status === "online" ? -1 : 1) || (a.nick < b.nick ? -1 : a.nick > b.nick ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const k of Object.keys(out)) out[k].sort(cmp);
  return out;
}

// 一格放不下那麼多：list 裡的人，每個人要的寬度 widths[i]，一排只有 cap 寬、「+N」要 moreW。
// 回傳 { shown: 顯示的人, more: 沒顯示的人數 }。放不下的就算進 more；連第 1 個人都放不下時 shown 是空的（畫面要自己把暱稱縮短）。
export function fitMates(list, widths, cap, moreW, gap = 4) {
  const shown = [];
  let used = 0;
  for (let i = 0; i < list.length; i++) {
    const left = list.length - i - 1; // 這個人之後還剩幾個
    const w = widths[i] + (shown.length ? gap : 0);
    const need = used + w + (left ? gap + moreW : 0);
    if (need > cap) break;
    shown.push(list[i]); used += w;
  }
  return { shown, more: list.length - shown.length };
}
