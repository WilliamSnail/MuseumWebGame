// ================================================================
//  合作地下收藏庫好玩的機制（翊文 11-09，規劃第三節「讓合作好玩的機制」）。規則的本體在 shared/coop.js，流程在 coop_flow.js。
//  這裡只有開了 run.fun 才會走到（伺服器都開；舊的測試、模擬不開，跟原本一模一樣）。
//  純函式、同步。「擲骰」一律用 RNG；一間房的計畫（記號、誰看到什麼）用 run.seed 算出來的小骰子，不動共用的 RNG：
//    同一趟、同一間算出來永遠一樣（交易重跑也一樣），而且不會改到後面擲骰的順序。
//
//  機制 2 每個人看到的不一樣：run.clue ＝ { truth: [三個真的記號], answer: 選項號碼, marks: { 選項: [三個記號] }, seen: { 隊員: [看到的] }, fake: { 隊員: 不存在的那個 } }
//    這些都只在伺服器（Firestore 的 coopRuns）。送出去一律走 coopFilterView：只留他自己 seen 的那幾個，看不出哪個是假的。
//  機制 4 只用叫聲說話：coopSayBuild 由伺服器變形。沒有打字。
//  機制 6 幽靈：不投票、不說話（coopSayBuild 擋）；看得到真的記號；一間敲一下（coopKnock）。
// ================================================================
import { COOP, coopMember, coopRoom, coopVoters } from "./coop.js";
import { COOP_CALLS, COOP_LETTERS, COOP_SAY, COOP_SYMBOLS } from "./coop_text.js";
import { RNG, hashStr, mulberry32 } from "./logic.js";
import { skillOf } from "./logic3.js";

// ---------- 小骰子 ----------
export const coopLocalRng = (run, tag) => mulberry32(hashStr(`${run.id || ""}:${run.seed}:${tag}`));
function coopShuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- 開始一趟、往下一層 ----------
export function coopStart(run, Ps) {
  if (run.seed == null) run.seed = Math.floor(RNG() * 1e9);
  coopPlanRoom(run, Ps);
}
// 走進一間房：發這一間的記號
export function coopPlanRoom(run, Ps) {
  const rng = coopLocalRng(run, `${run.floor}:${run.idx}`);
  run.clue = coopDealClue(run, Ps, rng);
  run.knocks = {};
}

// ---------- 機制 2：每個人看到的不一樣 ----------
// 理智低的人有多少機率看到幻覺
export function coopHallucChance(san) {
  let c = 0;
  COOP.clue.halluc.forEach(h => { if (san < h.below) c = Math.max(c, h.chance); });
  return c;
}
// 三個記號怎麼分：
//   答案 ＝ {a, b, c}；別的選項 ＝ {a, b, d}、{a, c, e}。所以 a 沒有用，b、c 才分得出來，要拼起來。
//   每個人先分到一個（輪流）；還沒人看到的給偵查最高的人；偵查夠高的再多看到一個。
//   一個人（館方助手補位）：看到兩個，偵查夠高就全部。
//   幻覺：不在答案裡的記號（別的選項上的 d、e），會把人帶到錯的選項。
export function coopDealClue(run, Ps, rng) {
  const room = coopRoom(run);
  const picks = room ? room.choices.map((c, i) => i).filter(i => room.choices[i].check.type !== "none") : [];
  const voters = coopVoters(run);
  if (picks.length < 2 || !voters.length) return null;
  const [a, b, c, d, e] = coopShuffle(COOP_SYMBOLS, rng);
  const truth = [a, b, c];
  const answer = picks[Math.floor(rng() * picks.length)];
  const marks = {};
  marks[answer] = coopShuffle(truth, rng);
  picks.filter(i => i !== answer).forEach((i, n) => { marks[i] = coopShuffle(n === 0 ? [a, b, d] : n === 1 ? [a, c, e] : [b, c, d], rng); });
  const order = coopShuffle(voters.map(m => m.id), rng);
  const left = coopShuffle(truth, rng);
  const seekOf = id => skillOf(Ps[id], "偵查");
  const seen = {};
  order.forEach(id => { seen[id] = []; });
  if (order.length === 1) seen[order[0]].push(left[0], left[1]);
  else order.forEach((id, i) => seen[id].push(left[i % left.length]));
  // 還沒人看到的：給偵查最高的人
  const given = new Set(Object.values(seen).flat());
  if (order.length > 1) left.filter(s => !given.has(s)).forEach(s => {
    const best = order.slice().sort((x, y) => seekOf(y) - seekOf(x))[0];
    seen[best].push(s);
  });
  // 偵查夠高的多看到一個（機制 2：「偵查高的多看到一個」）
  order.forEach(id => {
    if (seekOf(id) < COOP.clue.seekSkill) return;
    const more = left.find(s => !seen[id].includes(s));
    if (more) seen[id].push(more);
  });
  // 幻覺
  const fake = {}, wrong = [d, e].filter(s => Object.values(marks).flat().includes(s));
  order.forEach(id => {
    const P = Ps[id];
    if (P && wrong.length && rng() < coopHallucChance(P.sanity)) {
      fake[id] = wrong[Math.floor(rng() * wrong.length)];
      seen[id].push(fake[id]);
    }
  });
  Object.values(seen).forEach(list => list.sort()); // 照字碼排：看順序看不出哪個是假的
  return { truth, answer, marks, seen, fake };
}
// 選到記號都對上的選項：有好處（coopCheck 用）
export function coopCheckFun(run, pick) {
  return run.clue && run.clue.answer === pick ? COOP.clue : null;
}

// ---------- 一間走完 ----------
// 把真相翻開給大家看（記號是什麼、誰多看到什麼）；過了再多一點靈感
export function coopRoomDone(run, Ps, room, ch, vote, check, fx, events) {
  const c = run.clue;
  if (c) {
    run.last.reveal = { truth: c.truth, answer: c.answer, fake: c.fake, hit: vote.pick === c.answer };
    if (vote.pick === c.answer && check.success) coopVoters(run).forEach(m => {
      const P = Ps[m.id];
      if (!P || !COOP.clue.insp || m.rewarded === false) return;
      P.insp += COOP.clue.insp;
      m.got.insp += COOP.clue.insp;
      events[m.id].push({ type: "insp", gain: COOP.clue.insp, why: "記號對上了" });
    });
  }
}

// ---------- 機制 6：幽靈敲一下 ----------
export function coopKnock(run, id, choice) {
  const m = coopMember(run, id), room = coopRoom(run);
  if (run.phase !== "vote" || !room) return { ok: false, reason: "現在不能敲" };
  if (!m || !m.ghost || m.out) return { ok: false, reason: "只有幽靈能敲" };
  if (!Number.isInteger(choice) || !room.choices[choice]) return { ok: false, reason: "沒有這個選項" };
  run.knocks = run.knocks || {};
  if (run.knocks[id] !== undefined) return { ok: false, reason: "這壹間敲過了" };
  run.knocks[id] = choice;
  return { ok: true };
}

// ---------- 機制 4：說話 ----------
// 結巴：「走這邊」→「走……這邊……？」
function coopStutter(t) {
  const cs = [...t];
  if (cs.length < 2) return `${t}……？`;
  const at = 1 + Math.floor(RNG() * (cs.length - 1));
  return `${cs.slice(0, at).join("")}……${cs.slice(at).join("")}……？`;
}
// san ＝說話的人的理智。回傳 { text, warped }
export function coopWarp(item, x, san) {
  let lv = null;
  COOP.warp.forEach(w => { if (san < w.below) lv = w; });
  const fill = v => item.text.split("{x}").join(v);
  const plain = fill(x);
  if (!lv) return { text: plain, warped: false };
  const roll = RNG();
  if (roll < lv.swap) {
    // 換成別句話；要選東西的句子，換掉選的東西（「我看到 月」→「我看到 骨」）
    if (item.arg === "sym") { const others = COOP_SYMBOLS.filter(s => s !== x); return { text: fill(others[Math.floor(RNG() * others.length)]), warped: true }; }
    if (item.arg === "pick") { const others = COOP_LETTERS.slice(0, 3).filter(s => s !== x); return { text: fill(others[Math.floor(RNG() * others.length)]), warped: true }; }
    if (item.warp && item.warp.length) return { text: item.warp[Math.floor(RNG() * item.warp.length)], warped: true };
  }
  if (roll < lv.swap + lv.stutter) return { text: coopStutter(plain), warped: true };
  return { text: plain, warped: false };
}
// 伺服器：這句話能不能說、變形之後是什麼。data ＝ { say: 短句 id, x: 記號或選項號碼 } 或 { call: 叫聲 id }。沒有打字：只收清單上的
export function coopSayBuild(run, id, data) {
  const m = coopMember(run, id);
  if (!m || m.out) return { ok: false, reason: "你不在這壹趟裡" };
  if (run.ended) return { ok: false, reason: "這壹趟已經結束了" };
  if (m.ghost) return { ok: false, reason: "幽靈不能說話" };
  const d = data || {}, kind = d.call ? "call" : "say";
  const item = kind === "call" ? COOP_CALLS.find(x => x.id === d.call) : COOP_SAY.find(x => x.id === d.say);
  if (!item) return { ok: false, reason: "沒有這句話" };
  let x = "";
  if (item.arg === "sym") {
    if (!COOP_SYMBOLS.includes(d.x)) return { ok: false, reason: "沒有這個記號" };
    x = d.x;
  } else if (item.arg === "pick") {
    if (!COOP_LETTERS.includes(d.x)) return { ok: false, reason: "沒有這個選項" };
    x = d.x;
  }
  const w = coopWarp(item, x, m.san);
  return { ok: true, kind, id: item.id, name: m.name, text: w.text, warped: w.warped, from: item.text.split("{x}").join(x) };
}

// ---------- 送出去之前拿掉不該看到的 ----------
// 這裡是唯一的出口（viewFor 叫）。打開開發者工具也看不到別人的線索、誰的是假的。
export function coopFilterView(v, run, id) {
  const m = coopMember(run, id);
  v.role = m.guard ? "guard" : m.ghost ? "ghost" : "below";
  delete v.seed;
  delete v.clue;
  const c = run.clue;
  if (c && !m.guard) {
    v.clue = { marks: c.marks, seen: m.ghost ? c.truth.slice().sort() : (c.seen[id] || []).slice() };
    if (m.ghost) { v.clue.real = true; v.clue.answer = c.answer; } // 幽靈看得到真正的線索
  }
  // 誰敲了不寫：只有「哪個選項發抖」
  const k = {};
  Object.values(run.knocks || {}).forEach(ch => { k[ch] = (k[ch] || 0) + 1; });
  v.knocked = k;
  v.iKnocked = !!(run.knocks && run.knocks[id] !== undefined);
  delete v.knocks;
  return v;
}
