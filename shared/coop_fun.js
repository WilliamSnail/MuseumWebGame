// ================================================================
//  合作地下收藏庫好玩的機制（翊文 11-09，規劃第三節「讓合作好玩的機制」）。規則的本體在 shared/coop.js，流程在 coop_flow.js。
//  這裡只有開了 run.fun 才會走到（伺服器都開；舊的測試、模擬不開，跟原本一模一樣）。
//  純函式、同步。「擲骰」一律用 RNG；一間房的計畫（記號、誰看到什麼）用 run.seed 算出來的小骰子，不動共用的 RNG：
//    同一趟、同一間算出來永遠一樣（交易重跑也一樣），而且不會改到後面擲骰的順序。
//
//  機制 2 每個人看到的不一樣：run.clue ＝ { truth: [三個真的記號], answer: 選項號碼, marks: { 選項: [三個記號] }, seen: { 隊員: [看到的] }, fake: { 隊員: 不存在的那個 } }
//    這些都只在伺服器（Firestore 的 coopRuns）。送出去一律走 coopFilterView：只留他自己 seen 的那幾個，看不出哪個是假的。
//  機制 4 叫聲、短句、自由打字（翊文 11-09 回答「要」，決定 0020、0036）：coopSayBuild 由伺服器變形，畫面做不了手腳。
//    打的字用 cleanSay 清過（最多 PARTY.sayMax 個字），只當資料：畫面一律當純文字。送太快會擋（coopSayGap）。可以檢舉（coopReportProblem）。
//  機制 6 幽靈：不投票、不說話（coopSayBuild 擋）；看得到真的記號；一間敲一下（coopKnock）。
//  機制 3 湊證據：run.truth ＝ { id: 住客（祕密）, found: [{ kind, by, room, fake }], done, guess, right }。湊齊三個，走完這一層才猜（coopGuess）。
//  機制 5 留守：run.hazard ＝這一間哪個選項有東西（祕密）；地圖、危險度只有留守的人的畫面有（coopFilterView）。
//  機制 8 一起搬：run.carry ＝ { idx: 第幾間之後, item, picks, done, result }。
//  機制 9 報告：run.stats 收集，走完 coopMakeReport，存進每個人的 P.coopReports（博物館的，不跟著參觀者換）。
// ================================================================
import { COOP, coopActive, coopFinish, coopFloorOf, coopMember, coopNewEvents, coopPresent, coopRoom, coopSanHit, coopSync, coopVoters } from "./coop.js";
import { COOP_CALLS, COOP_CARRY_TEXT, COOP_EVIDENCE, COOP_ITEMS, COOP_LETTERS, COOP_REPORT_TEXT, COOP_RESIDENTS, COOP_SAY, COOP_SYMBOLS, COOP_WARP_WORDS } from "./coop_text.js";
import { cleanSay } from "./party.js";
import { eventScale, eventTag } from "./events.js";
import { trialById } from "./shop.js";
import { RNG, hashStr, maxExpr, mulberry32, rollD100, rollExpr, sanCheck, splitSan, todayStr } from "./logic.js";
import { skillOf } from "./logic3.js";

// ---------- 小骰子 ----------
export const coopLocalRng = (run, tag) => mulberry32(hashStr(`${run.id || ""}:${run.seed}:${tag}`));
function coopShuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 這一趟的限時活動裡「合作地下」那一種的加成（試煉的活動只管技能成長，不動靈感）
export const coopBoostOf = run => (run && run.event && run.event.kind === "coopBoost" ? run.event : null);

// ---------- 開始一趟、往下一層 ----------
export function coopStart(run, Ps) {
  if (run.seed == null) run.seed = Math.floor(RNG() * 1e9);
  if (!run.stats) run.stats = { rooms: [], halluc: {}, fakes: [], saves: [], carry: [], truth: [], ghosts: [] };
  // 這一層住的是什麼、哪一間之後有要搬的東西
  if (run.trial) { run.truth = null; run.carry = null; coopPlanRoom(run, Ps); return; } // 合作試煉（決定 0041）：只有那一間，沒有證據要猜、沒有東西要搬
  const rng = coopLocalRng(run, `floor:${run.floor}`), f = coopFloorOf(run);
  const res = COOP_RESIDENTS[Math.floor(rng() * COOP_RESIDENTS.length)];
  run.truth = { id: res.id, order: coopShuffle(res.ev, rng), found: [], done: false, guess: null, right: null };
  run.carry = { idx: f ? Math.floor(rng() * f.rooms.length) : 0, item: COOP_ITEMS[(run.floor - 1) % COOP_ITEMS.length], picks: {}, done: false, result: null };
  coopPlanRoom(run, Ps);
}
// 走進一間房：發這一間的記號
export function coopPlanRoom(run, Ps) {
  const rng = coopLocalRng(run, `${run.floor}:${run.idx}`);
  run.clue = coopDealClue(run, Ps, rng);
  run.knocks = {};
  // 房間裡有東西：哪個選項（只有留守的人看得到）
  const room = coopRoom(run), risky = room ? room.choices.map((c, i) => i).filter(i => room.choices[i].check.type !== "none") : [];
  run.hazard = risky.length ? risky[Math.floor(rng() * risky.length)] : null;
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
// 把真相翻開給大家看（記號是什麼、誰多看到什麼）；過了再多一點靈感；房間裡的東西；掉證據；記到報告裡
export function coopRoomDone(run, Ps, room, ch, vote, check, fx, events) {
  const c = run.clue;
  run.woken = 0; // 吵醒的東西只影響這一間
  const src = "cellar:" + room.id;
  // 房間裡有東西：選到又沒過，多扣
  if (run.hazard === vote.pick) {
    run.last.hazard = true;
    coopActive(run).forEach(m => {
      const f = fx.members[m.id];
      if (!f || f.success !== false || m.ghost) return;
      const n = rollExpr(COOP.hazard.san).total;
      f.hazard = n;
      coopSanHit(Ps[m.id], m, n, src, { hazard: n }, events[m.id]);
    });
  }
  const ev = coopDropEvidence(run, Ps, vote, check);
  if (ev) run.last.evidence = { kind: ev.kind, by: ev.by };
  coopReportRoom(run, Ps, room, vote, check, fx);
  if (c) {
    run.last.reveal = { truth: c.truth, answer: c.answer, fake: c.fake, hit: vote.pick === c.answer };
    if (vote.pick === c.answer && check.success) {
      const gain = eventScale(coopBoostOf(run), COOP.clue.insp); // 限時活動：靈感變多（決定 0041）
      coopVoters(run).forEach(m => {
        const P = Ps[m.id];
        if (!P || !COOP.clue.insp || m.rewarded === false) return;
        P.insp += gain;
        m.got.insp += gain;
        events[m.id].push({ type: "insp", gain, why: "記號對上了" });
      });
    }
  }
}

// ---------- 機制 3：湊證據猜真相 ----------
// 這一間掉一個證據嗎。過了一定掉；沒過一半一半；選安全的什麼都沒碰，不掉。
// 誰找到的：擲骰的人（強度、理智檢定就是領隊）。他理智低的話，找到的可能是假的（不屬於這位住客）。
export function coopDropEvidence(run, Ps, vote, check) {
  const t = run.truth;
  if (!t || t.done || check.type === "none") return null;
  const rng = coopLocalRng(run, `ev:${run.floor}:${run.idx}`);
  const hit = !!(run.clue && vote.pick === run.clue.answer);
  if (rng() >= (check.success || hit ? COOP.truth.win : COOP.truth.lose)) return null;
  const by = check.by || (coopVoters(run).find(m => m.id === run.leader) || coopVoters(run)[0] || {}).id;
  if (!by) return null;
  const res = COOP_RESIDENTS.find(x => x.id === t.id), have = new Set(t.found.map(x => x.kind));
  const P = Ps[by];
  let kind = null, fake = false;
  if (P && P.sanity < COOP.truth.fakeBelow && rng() < COOP.truth.fakeChance) {
    const others = Object.keys(COOP_EVIDENCE).filter(k => !res.ev.includes(k) && !have.has(k));
    if (others.length) { kind = others[Math.floor(rng() * others.length)]; fake = true; }
  }
  if (!kind) kind = t.order.find(k => !have.has(k));
  if (!kind) return null;
  const e = { kind, by, room: coopRoom(run) ? coopRoom(run).id : null, fake };
  t.found.push(e);
  return e;
}
export const coopCanGuess = run => !!(!run.trial && run.truth && !run.truth.done && run.truth.found.length >= COOP.truth.need);
// 開票：多數；平手領隊的；都沒投就是沒猜。猜對全隊拿靈感、記進《看懂的事》；猜錯全隊（還在地下的）擲理智
export function coopGuess(run, Ps, votes) {
  if (run.phase !== "guess" || !run.truth) return { ok: false, reason: "現在不用猜" };
  const t = run.truth, events = coopNewEvents(run), res = COOP_RESIDENTS.find(x => x.id === t.id);
  run.step++;
  const count = {};
  coopVoters(run).forEach(m => { const v = votes[m.id]; if (COOP_RESIDENTS.some(x => x.id === v)) count[v] = (count[v] || 0) + 1; });
  const ids = Object.keys(count), top = Math.max(0, ...Object.values(count));
  const tied = ids.filter(i => count[i] === top);
  const pick = !ids.length ? null : tied.length === 1 ? tied[0] : tied.includes(votes[run.leader]) ? votes[run.leader] : tied.sort()[0];
  t.done = true; t.guess = pick; t.right = pick ? pick === t.id : null;
  const floor = run.last && run.last.floorDone ? run.last.floorDone : run.floor;
  if (pick === t.id) {
    const n = eventScale(coopBoostOf(run), COOP.truth.insp + floor * COOP.truth.perFloor); // 限時活動：靈感變多（決定 0041）
    coopPresent(run).forEach(m => {
      const P = Ps[m.id];
      if (!P) return;
      if (m.rewarded) { P.insp += n; m.got.insp += n; events[m.id].push({ type: "insp", gain: n, why: "猜對了" }); }
      P.understood = P.understood || {};
      const isNew = !P.understood[res.understand];
      if (isNew) P.understood[res.understand] = todayStr();
      if (P.visit) { P.visit.understood = P.visit.understood || {}; P.visit.understood[res.understand] = true; }
      events[m.id].push({ type: "truth", id: res.id, isNew });
    });
  } else if (pick) {
    coopVoters(run).forEach(m => {
      const P = Ps[m.id];
      if (!P) return;
      const r = sanCheck(P, COOP.truth.wrongSan, null);
      events[m.id].push({ type: "sanCheck", spec: r.spec, roll: r.roll, target: P.sanity, success: r.success, loss: r.loss, why: "猜錯了" });
      coopSanHit(P, m, r.loss, "cellar:guess", { guess: r.loss }, events[m.id]);
    });
  }
  run.stats.truth.push({ floor, id: t.id, guess: pick, right: t.right });
  coopNoteGhosts(run, coopRoom(run), null);
  run.last = Object.assign({}, run.last, { truth: { id: t.id, guess: pick, right: t.right, fakes: t.found.filter(x => x.fake).map(x => ({ kind: x.kind, by: x.by })) } });
  if (!coopVoters(run).length) coopFinish(run, "lost");
  else if (!run.next) coopFinish(run, "done");
  else run.phase = "floorDone";
  coopSync(run, Ps);
  return { ok: true, run, events };
}

// ---------- 機制 8：兩個人一起才搬得動 ----------
export const coopCarryDue = run => !!(run.carry && !run.carry.done && run.carry.idx === run.idx && coopVoters(run).length > 0);
export function coopCarryPick(run, id, side) {
  const m = coopMember(run, id);
  if (!m || m.out || m.ghost || m.guard) return { ok: false, reason: "你現在不能搬" };
  if (side !== "L" && side !== "R" && side !== "skip") return { ok: false, reason: "要抬哪壹邊" };
  run.carry.picks[id] = side;
  return { ok: true };
}
// 不手滑的機率：60 ＋手工藝 ÷ 3（COOP.carry）
export const coopCarryChance = P => Math.min(95, COOP.carry.base + Math.floor(skillOf(P, "手工藝") / COOP.carry.skillDiv));
// 開抬。左右都有人：兩個人各擲；有一個手滑就碎、吵醒東西。都抓同一邊：撞在一起，也碎。只有一個人：抬不動。一個人（館方助手補位）：助手抬另一邊。
export function coopCarryDo(run, Ps) {
  const c = run.carry, voters = coopVoters(run), events = coopNewEvents(run);
  run.step++;
  const L = voters.filter(m => c.picks[m.id] === "L"), R = voters.filter(m => c.picks[m.id] === "R");
  const solo = voters.length === 1 && coopActive(run).length === 1;
  const res = { kind: "left", who: [], rolls: [] };
  let pair = null;
  if (solo && L.length + R.length === 1) pair = [(L[0] || R[0]), null];
  else if (L.length && R.length) pair = [L[0], R[0]];
  else if (L.length + R.length > 1) { res.kind = "bump"; res.who = [...L, ...R].map(m => m.id); }
  else if (L.length + R.length === 1) { res.kind = "alone"; res.who = [(L[0] || R[0]).id]; }
  if (pair) {
    res.who = pair.filter(Boolean).map(m => m.id);
    pair.forEach(m => {
      const target = m ? coopCarryChance(Ps[m.id]) : COOP.carry.helper, roll = rollD100();
      res.rolls.push({ id: m ? m.id : null, roll: roll.total, target, ok: roll.total <= target });
    });
    res.kind = res.rolls.every(r => r.ok) ? "ok" : "slip";
  }
  c.done = true; c.result = res;
  if (res.kind === "ok") {
    const n = eventScale(coopBoostOf(run), COOP.carry.insp + run.floor); // 限時活動：靈感變多（決定 0041）
    coopPresent(run).forEach(m => { if (m.rewarded && Ps[m.id]) { Ps[m.id].insp += n; m.got.insp += n; events[m.id].push({ type: "insp", gain: n, why: "搬回來了" }); } });
    res.insp = n;
  } else if (res.kind === "slip" || res.kind === "bump") {
    run.woken = COOP.carry.wake;
    res.woke = true;
    coopActive(run).forEach(m => {
      if (m.ghost) return;
      const n = rollExpr(COOP.carry.breakSan).total;
      coopSanHit(Ps[m.id], m, n, "cellar:carry", { carry: n }, events[m.id]);
    });
  }
  run.stats.carry.push({ floor: run.floor, item: c.item, kind: res.kind, who: res.who });
  coopNoteGhosts(run, coopRoom(run), null);
  run.phase = coopVoters(run).length ? "carried" : "over";
  if (run.phase === "over") coopFinish(run, "lost");
  coopSync(run, Ps);
  return { ok: true, run, events };
}
export function coopCarryLine(run) {
  const c = run.carry, r = c && c.result;
  if (!r) return "";
  const names = r.who.map(id => (coopMember(run, id) || {}).name || "").filter(Boolean);
  const who = names.join("和") || COOP.helperName;
  return COOP_CARRY_TEXT[r.kind].split("{x}").join(c.item).split("{who}").join(who);
}

// ---------- 機制 5：留守 ----------
// 選項的危險度：0 安全、1 低、2 中、3 高（看失敗會扣多少、會不會受傷）
export function coopChoiceDanger(c) {
  if (c.check.type === "none") return 0;
  const fail = c.fail || {};
  let n = 0;
  if (fail.san && !String(fail.san).startsWith("+")) n += maxExpr(fail.san);
  if (fail.injure) n += 2;
  if (c.check.type === "san") n += maxExpr(splitSan(c.check.spec)[1]);
  return n <= 2 ? 1 : n <= 4 ? 2 : 3;
}
export const coopRoomDanger = room => Math.max(0, ...room.choices.map(coopChoiceDanger));
// 監視器的畫面：整層的地圖（每間的危險度）、這一間每個選項的危險度和哪個有東西。房間的字一個都沒有
export function coopGuardMap(run) {
  const f = coopFloorOf(run);
  if (!f) return null;
  const room = run.phase === "vote" ? coopRoom(run) : null;
  return {
    rooms: f.rooms.map((r, i) => ({ i, danger: coopRoomDanger(r), now: i === run.idx && run.phase !== "floorDone", done: i < run.idx || run.phase === "floorDone" })),
    options: room ? room.choices.map((c, i) => ({ i, danger: coopChoiceDanger(c), hazard: i === run.hazard })) : [],
  };
}

// ---------- 機制 9：探險報告 ----------
function coopReportRoom(run, Ps, room, vote, check, fx) {
  const s = run.stats;
  if (!s) return;
  let heat = 0;
  Object.entries(fx.members).forEach(([id, f]) => { heat += (f.sanLoss || 0) + (f.hazard || 0) + (check.san && check.san[id] ? check.san[id].loss : 0) + (check.san ? (f.pressure || 0) + (f.dark || 0) : 0); });
  s.rooms.push({ floor: run.floor, title: room.title, heat, type: check.type, success: check.success, margin: check.total != null && check.target != null ? check.total - check.target : null });
  // 誰看到幻覺
  if (run.clue) Object.entries(run.clue.fake).forEach(([id, sym]) => { s.halluc[id] = (s.halluc[id] || 0) + 1; s.fakes.push({ id, sym, floor: run.floor }); });
  // 誰救了誰：過了一個失敗會出事的選項，隊上有人理智很低
  const ch = room.choices[vote.pick];
  if ((check.type === "power" || check.type === "skill") && check.success && ch && ch.fail && (ch.fail.san || ch.fail.injure)) {
    const low = coopVoters(run).find(m => m.san <= COOP.report.lowSan && m.id !== check.by);
    if (low) s.saves.push({ by: check.by || null, who: low.id, san: low.san });
  }
  // 幽靈敲了一下，大家跟著選，過了
  Object.entries(run.knocks || {}).forEach(([id, c]) => { if (c === vote.pick && check.success) s.saves.push({ by: id, knock: true }); });
  coopNoteGhosts(run, room, vote.pick);
}
// 誰在這裡倒下（報告、最後的影子用）。choice ＝全隊最後選了哪個（搬東西、猜的時候倒下的沒有）
function coopNoteGhosts(run, room, choice) {
  const s = run.stats;
  if (!s || !room) return;
  run.members.filter(m => m.ghost && !s.ghosts.some(g => g.id === m.id)).forEach(m => s.ghosts.push({ id: m.id, room: room.title, roomId: room.id, choice, floor: run.floor }));
}
// warps ＝ [{ name, from, to }]：說話變形的紀錄（只有伺服器有）。today：哪一天（不給就用 todayStr）
export function coopMakeReport(run, warps, today) {
  const s = run.stats || { rooms: [], halluc: {}, fakes: [], saves: [], carry: [], truth: [], ghosts: [] };
  const T = COOP_REPORT_TEXT, rng = coopLocalRng(run, "report");
  const nameOf = id => (coopMember(run, id) || {}).name || "館友";
  const fill = (t, o) => Object.entries(o).reduce((x, [k, v]) => x.split(`{${k}}`).join(String(v)), t);
  const lines = [];
  if (run.event) lines.push({ k: "event", t: fill(T.event, { title: run.event.title, tag: eventTag(run.event) }) }); // 限時活動中走的
  if (run.trial && run.trial.fx) lines.push({ k: "trial", t: fill(T.trial, { title: (trialById(run.trial.id) || {}).title || "", list: run.members.filter(m => run.trial.fx[m.id]).map(m => { const x = run.trial.fx[m.id]; return `${m.name}：${x.state === "grown" ? `${x.skill} ${x.before} → ${x.after}` : x.state === "noGrow" ? "陪打，沒有成長" : "沒過"}`; }).join("、") }) }); // 合作試煉
  // 誰救了誰
  const save = s.saves[s.saves.length - 1];
  if (save) lines.push({ k: "save", t: save.knock ? fill(T.knock, { by: nameOf(save.by) }) : fill(T.save, { who: nameOf(save.who), san: save.san, by: save.by ? nameOf(save.by) : "全隊" }) });
  // 誰看到幻覺
  const hs = Object.entries(s.halluc).sort((a, b) => b[1] - a[1]);
  if (hs.length) {
    const [id, n] = hs[0], one = s.fakes.find(x => x.id === id);
    lines.push({ k: "halluc", t: n > 1 ? fill(T.halluc, { who: nameOf(id), n }) : fill(T.hallucOne, { who: nameOf(id), sym: one ? one.sym : "" }) });
  }
  // 最驚險的一間
  const hot = s.rooms.slice().sort((a, b) => b.heat - a.heat)[0];
  lines.push({ k: "scary", t: hot && hot.heat > 0 ? fill(T.scary, { room: hot.title, n: hot.heat }) : T.calm });
  // 誰倒下了
  s.ghosts.forEach(g => lines.push({ k: "ghost", t: fill(T.ghost, { who: nameOf(g.id), room: g.room }) }));
  // 真相、搬的東西
  s.truth.forEach(x => { if (x.guess) lines.push({ k: "truth", t: fill(x.right ? T.truthOk : T.truthNo, { floor: x.floor, x: (COOP_RESIDENTS.find(r => r.id === x.id) || {}).name || "" }) }); });
  s.carry.filter(c => c.kind === "ok").forEach(c => lines.push({ k: "carry", t: fill(T.carryOk, { who: c.who.map(nameOf).join("和") || COOP.helperName, item: c.item }) }));
  // 搞笑的一刻：換句話的變形 → 摔碎 → 結巴 → 沒有
  const swap = warps.filter(w => !w.to.includes("……") && w.from !== w.to), any = warps.filter(w => w.from !== w.to);
  const slip = s.carry.find(c => c.kind === "slip" || c.kind === "bump");
  let funny = null;
  if (swap.length) { const w = swap[Math.floor(rng() * swap.length)]; funny = fill(T.warp, { who: w.name, from: w.from, to: w.to }); }
  else if (slip) funny = fill(T.carrySlip, { item: slip.item, floor: slip.floor });
  else if (any.length) { const w = any[Math.floor(rng() * any.length)]; funny = fill(T.warp, { who: w.name, from: w.from, to: w.to }); }
  lines.push({ k: "funny", t: funny || T.funnyNone });
  const guard = run.members.find(m => m.guard);
  if (guard) lines.push({ k: "guard", t: fill(T.guard, { who: guard.name }) });
  return {
    id: run.id || String(run.seed), date: today || todayStr(), floors: [...new Set(s.rooms.map(r => r.floor))], over: run.over, title: T.title[run.over] || T.title.done,
    members: run.members.map(m => ({ name: m.name, ghost: !!m.ghost, guard: !!m.guard, left: m.out === "left", san0: m.startSan, san1: m.san, insp: m.got.insp })),
    lines,
  };
}
// 存進存檔（博物館的，換參觀者不會不見）。最多留幾張，舊的掉出去；掛在展廳的那張留著
export function coopSaveReport(P, report) {
  if (!P || !report) return;
  const list = Array.isArray(P.coopReports) ? P.coopReports.filter(r => r && r.id !== report.id) : [];
  list.unshift(report);
  while (list.length > COOP.report.keep) {
    const i = list.map(r => r.id).lastIndexOf(list.slice().reverse().find(r => r.id !== P.hallReport).id);
    list.splice(i, 1);
  }
  P.coopReports = list;
}

// ---------- 機制 6：幽靈敲一下 ----------
export function coopKnock(run, id, choice) {
  const m = coopMember(run, id), room = coopRoom(run);
  if (run.phase !== "vote" || !room) return { ok: false, reason: "現在不能敲" };
  if (!m || !m.ghost || m.out) return { ok: false, reason: "只有名牌空白的人能敲" };
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
// 打的字變形：結巴（「等我一下」→「等我……一下……？」），或後半變成別的話（「這裡安全」→「這裡……牠在後面」）。san ＝打字的人的理智
export function coopWarpText(text, san) {
  let lv = null;
  COOP.warp.forEach(w => { if (san < w.below) lv = w; });
  if (!lv) return { text, warped: false };
  const roll = RNG();
  if (roll < lv.swap) {
    const cs = [...text], keep = Math.ceil(cs.length / 2);
    return { text: `${cs.slice(0, keep).join("")}……${COOP_WARP_WORDS[Math.floor(RNG() * COOP_WARP_WORDS.length)]}`, warped: true };
  }
  if (roll < lv.swap + lv.stutter) return { text: coopStutter(text), warped: true };
  return { text, warped: false };
}
// 送太快會擋。last ＝ { at: 上一句（什麼都算）, typed: 上一句打的字 }；kind ＝ "say"、"call"、"text"。回傳 { ok, next: 要存回去的 }
export function coopSayGap(last, kind, now) {
  const l = last && typeof last === "object" ? last : {};
  if (l.at && now - l.at < COOP.sayGapMs) return { ok: false };
  if (kind === "text" && l.typed && now - l.typed < COOP.typeGapMs) return { ok: false };
  return { ok: true, next: { at: now, typed: kind === "text" ? now : l.typed || null } };
}
// 檢舉：只檢舉打的字（短句、叫聲是清單上的）；不能檢舉自己。可以回 null，不行回傳原因
export function coopReportProblem(msg, uid) {
  if (!msg) return "找不到這句話";
  if (msg.k !== "text") return "這句是固定的短句，不用檢舉";
  if (msg.by === uid) return "這是你自己說的";
  return null;
}
// 伺服器：這句話能不能說、變形之後是什麼。data ＝ { say: 短句 id, x: 記號或選項號碼 }、{ call: 叫聲 id } 或 { text: 打的字 }
export function coopSayBuild(run, id, data) {
  const m = coopMember(run, id);
  if (!m || m.out) return { ok: false, reason: "你不在這壹趟裡" };
  if (run.ended) return { ok: false, reason: "這壹趟已經結束了" };
  if (m.ghost) return { ok: false, reason: "名牌空白的人不能說話" };
  const d = data || {};
  if (d.text !== undefined) { // 自由打字：清過才算；只當資料
    if (typeof d.text !== "string") return { ok: false, reason: "要打字" };
    const t = cleanSay(d.text);
    if (!t) return { ok: false, reason: "先打字" };
    const w = coopWarpText(t, m.san);
    return { ok: true, kind: "text", id: null, name: m.name, text: w.text, warped: w.warped, from: t };
  }
  const kind = d.call ? "call" : "say";
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
  // 地圖、哪個選項有東西：只有留守的人看得到；他看不到房間裡的細節
  delete v.hazard;
  delete v.stats;
  if (m.guard) {
    v.map = coopGuardMap(run);
    v.room = null;
    if (v.last) { v.last = { floor: v.last.floor, choice: v.last.choice, vote: v.last.vote, check: v.last.check ? { type: v.last.check.type, success: v.last.check.success } : null, fx: v.last.fx, hazard: v.last.hazard || false, evidence: v.last.evidence, floorDone: v.last.floorDone, rewards: v.last.rewards, truth: v.last.truth, events: v.last.events }; }
  }
  v.hasGuard = run.members.some(x => x.guard && !x.out);
  // 證據：大家看得到找到什麼、誰找到的；哪個是假的、住的是什麼，猜完才知道
  if (run.truth) {
    const t = run.truth;
    v.truth = { found: t.found.map(x => ({ kind: x.kind, by: x.by, room: x.room })), done: t.done, guess: t.guess, right: t.right, need: COOP.truth.need };
    if (t.done) { v.truth.id = t.id; v.truth.fakes = t.found.filter(x => x.fake).map(x => x.kind); }
  }
  if (run.carry) v.carry = run.phase === "carry" || run.phase === "carried" ? { item: run.carry.item, picks: run.carry.picks, result: run.carry.result, line: coopCarryLine(run), chance: null } : null;
  return v;
}
