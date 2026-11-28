// ================================================================
//  全館投票（決定 0162、0166；延伸世界 m-you「誰來寫名字」；規劃 docs/規劃/延伸世界深入規劃.md 柒之二）
//  純函式：不讀寫資料庫、不看時鐘（now 由呼叫的人給，毫秒）。伺服器 functions/game/vote.js 用，畫面的假伺服器也可以用。
//  數字和時間在 NUM.story.vote，字在 VOTE_TEXT。
//  兩份資料：
//    全館的（state）：{ counts: {write,blank,return}, late: {…最後 24 小時投的}, result: null | {winner, share, at} }
//    自己的（mine）：null | { choice, name, at, changes（改過幾次）, late }。name 只給本人看，不進統計、不進館史
//  全館的只有票數，沒有「誰投什麼」；統計只給大概的比例（share），不給票數。
// ================================================================
import { NUM } from "../core/config.js";
import { VOTE_TEXT } from "../core/systems_text.js";
import { isHiddenChar } from "../core/logic_base.js";

const vtN = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
const vtBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const vtFill = (s, d) => Object.keys(d).reduce((t, k) => t.split("{" + k + "}").join(String(d[k])), s);
const vtNo = (key, d) => ({ ok: false, why: key, reason: vtFill(VOTE_TEXT.no[key], d || {}) });

export function voteTimes(C = NUM.story.vote) {
  return { opensAt: Date.parse(C.opens), closesAt: Date.parse(C.closes), resultAt: Date.parse(C.result) };
}
// before 還沒開／open 可以投（含截止那壹刻）／counting 截止到公布之間／result 公布了
export function votePhase(now, C = NUM.story.vote) {
  const t = voteTimes(C);
  return now < t.opensAt ? "before" : now <= t.closesAt ? "open" : now < t.resultAt ? "counting" : "result";
}
// 名字：拿掉看不見的字、連續空白變壹個、去頭尾；1～nameMax 個字，不能有禁字和 < >
export function voteName(raw, C = NUM.story.vote) {
  const name = [...String(typeof raw === "string" ? raw : "")].filter(ch => !isHiddenChar(ch)).join("").replace(/\s+/g, " ").trim();
  if (!name) return vtNo("noName");
  if ([...name].length > C.nameMax) return vtNo("longName", { n: C.nameMax });
  const low = name.toLowerCase().split(" ").join("");
  if (low.includes("<") || low.includes(">") || C.banned.some(w => low.includes(w))) return vtNo("badName");
  return { ok: true, name };
}
const vtTally = (C, src) => Object.fromEntries(C.options.map(id => [id, vtN(vtBox(src) ? src[id] : 0)]));
export function voteState(doc, C = NUM.story.vote) {
  const d = vtBox(doc) ? doc : {}, r = vtBox(d.result) && C.options.includes(d.result.winner) ? d.result : null;
  return { counts: vtTally(C, d.counts), late: vtTally(C, d.late), result: r };
}
export function voteMine(doc, C = NUM.story.vote) {
  if (!vtBox(doc) || !C.options.includes(doc.choice)) return null;
  return { choice: doc.choice, name: typeof doc.name === "string" ? doc.name : "", at: vtN(doc.at), changes: vtN(doc.changes), late: !!doc.late };
}
// 投票、改票。回 { ok, changed, state, mine }；擋下來回 { ok: false, why, reason }。state、mine 是新的複本（不改傳進來的）
//   跟現在這票壹模壹樣（按兩次、網路重送）：ok、changed false，不算改票
export function voteCast(stateDoc, mineDoc, input, now, C = NUM.story.vote) {
  const phase = votePhase(now, C);
  if (phase === "before") return vtNo("before");
  if (phase !== "open") return vtNo("closed");
  const choice = input && input.choice;
  if (!C.options.includes(choice)) return vtNo("badChoice");
  let name = "";
  if (choice === C.nameChoice) { const n = voteName(input.name, C); if (!n.ok) return n; name = n.name; }
  const state = voteState(stateDoc, C), mine = voteMine(mineDoc, C);
  if (mine && mine.choice === choice && mine.name === name) return { ok: true, changed: false, state, mine };
  if (mine && mine.changes >= C.changes) return vtNo("noChange", { n: C.changes });
  if (mine) {
    state.counts[mine.choice] = Math.max(0, state.counts[mine.choice] - 1);
    if (mine.late) state.late[mine.choice] = Math.max(0, state.late[mine.choice] - 1);
  }
  // 平手看最後幾小時：只改名字（選項沒變）不算新的壹票，照原本投的時間
  const same = !!mine && mine.choice === choice;
  const late = same ? mine.late : now > voteTimes(C).closesAt - C.tieLateHours * 3600000;
  state.counts[choice] += 1;
  if (late) state.late[choice] += 1;
  return { ok: true, changed: true, state, mine: { choice, name, at: now, changes: mine ? mine.changes + 1 : 0, late } };
}
// 大概的比例：每 shareStep % 壹格，加起來剛好 100（零頭給餘數最大的）；沒有人投就全 0
export function voteShare(counts, C = NUM.story.vote) {
  const total = C.options.reduce((s, id) => s + vtN(counts[id]), 0), units = Math.round(100 / C.shareStep);
  if (!total) return Object.fromEntries(C.options.map(id => [id, 0]));
  const rows = C.options.map((id, i) => { const x = vtN(counts[id]) * units / total; return { id, i, n: Math.floor(x), rest: x - Math.floor(x) }; });
  let left = units - rows.reduce((s, r) => s + r.n, 0);
  for (const r of rows.slice().sort((a, b) => b.rest - a.rest || a.i - b.i)) { if (left <= 0) break; r.n += 1; left -= 1; }
  return Object.fromEntries(rows.map(r => [r.id, r.n * C.shareStep]));
}
// 多數。平手：看平手的那幾個在最後幾小時誰票多；還平（含沒有人投）就是 tieWinner（「不寫」：不改變任何事）
export function voteWinner(stateDoc, C = NUM.story.vote) {
  const s = voteState(stateDoc, C), top = Math.max(...C.options.map(id => s.counts[id]));
  if (!top) return C.tieWinner;
  let tied = C.options.filter(id => s.counts[id] === top);
  if (tied.length > 1) { const lt = Math.max(...tied.map(id => s.late[id])); tied = tied.filter(id => s.late[id] === lt); }
  return tied.length === 1 ? tied[0] : C.tieWinner;
}
// 公布時間到了、還沒結算就結算壹次。回 { state, settled }（settled：這次才算出來的，要寫館史）
export function voteSettle(stateDoc, now, C = NUM.story.vote) {
  const state = voteState(stateDoc, C);
  if (state.result || votePhase(now, C) !== "result") return { state, settled: false };
  state.result = { winner: voteWinner(state, C), share: voteShare(state.counts, C), at: voteTimes(C).resultAt };
  return { state, settled: true };
}
// 館史的壹則（全館看到同壹份；不寫個人名字、不寫票數）
export function voteHistory(result, C = NUM.story.vote) {
  if (!result) return null;
  return { id: C.id, at: result.at, title: VOTE_TEXT.history.title, text: vtFill(VOTE_TEXT.history.text, { choice: VOTE_TEXT.options[result.winner] }), winner: result.winner, share: result.share };
}
// 給畫面的壹整包（公布前不給任何票數、比例）
export function voteView(stateDoc, mineDoc, now, history, C = NUM.story.vote) {
  const t = voteTimes(C), phase = votePhase(now, C), s = voteState(stateDoc, C), m = voteMine(mineDoc, C);
  const result = phase === "result" && s.result ? { winner: s.result.winner, share: s.result.share } : null;
  return {
    phase, now, opensAt: t.opensAt, closesAt: t.closesAt, resultAt: t.resultAt,
    mine: m ? { choice: m.choice, name: m.name, at: m.at } : null,
    changesLeft: m ? Math.max(0, C.changes - m.changes) : C.changes,
    result, history: Array.isArray(history) ? history : [],
  };
}
