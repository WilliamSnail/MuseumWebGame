// ================================================================
//  合作地下收藏庫（多人版 M4）的規則：1–4 個人一隊，一起走地下收藏庫
//  翊文 11-08：
//    一隊 2–4 人、每人帶 1–2 隻（隊伍 3–6 隻）；一個人也能下去，館方助手補到至少 3 隻。
//    不限次數，獎勵每天前 3 趟（伺服器算「每天」，這裡只收每位隊員的 rewarded）；第一次過關的獎勵照舊。
//    好玩的機制這次做 1（全隊的理智壓力）；2、4、6 先把位子留好：viewFor（每個人看到的）、ghost（理智歸零的隊員）。
//  純函式、同步（中間沒有 await）：伺服器每一步之前 setRng(這一隊的骰子)，算完換回來（docs/規劃/多人實作.md 第四節）。
//  算法沿用單人的：強度 memberPower、teamPower；技能 skillCheck；理智 sanCheck、applySan；
//    第一次走完一層的獎勵直接叫 cellarAdvance。單人的地下照舊用 systems.js 的函式，這個檔不改它們。
//
//  伺服器怎麼用：
//    members ＝ [{ id: 帳號 id, name: 暱稱, P: 他的存檔（現在那位參觀者）, keys: [帶的佩佩 key，1–2 個], rewarded: 今天還拿不拿獎勵 }]
//    第一個人是隊長（第一間的領隊）。
//    const s = startCoop(members, 層數)          → { ok, run, events } 或 { ok: false, reason, who }
//    Ps ＝ { 隊員 id: 他的 P }                    之後每一步都要傳。run 裡沒有 P，可以直接存、直接送給畫面。
//    coopResolve(run, Ps, votes)                 votes ＝ { 隊員 id: 選項的號碼 或 "retreat" }；開票、擲骰、結果套到每個人
//    coopAdvance(run, Ps)                        走到下一間；整層走完給每個人第一次過關的獎勵
//    coopContinue(run, Ps)                       走完一層之後往下一層（幽靈先回到地面）
//    coopEnd(run, Ps, "retreat")                 撤退或回到地面；回傳每個人這一趟拿了什麼、誰變幽靈
//    coopLeave(run, Ps, id)                      有人中途離隊（斷線太久、掛機）
//    viewFor(run, id)                            送給這位隊員的樣子
//  每一步回傳 { ok, run, events: { 隊員 id: [事件...] } }；不行就 { ok: false, reason }。
//  骰子：伺服器每一步之前 setRng(mulberry32(hashStr(隊伍 id ＋ ":" ＋ run.step)))，算完 setRng(null)。run.step 每一步加一。
//  run 從資料庫讀回來可以直接傳（每一步開頭會先 coopFix 補回 Realtime Database 弄掉的空陣列、空物件）。
//  run.phase：vote（等大家投票）→ result（看結果）→ vote …… → floorDone（這一層走完）→ over（結束，run.over 寫為什麼）
// ================================================================
import { NUM } from "../core/config.js";
import { addDays, addMyth, cellarFloor, fromKey, isFree, limitedHome, maxSan, pickOne, rollExpr, sanCheck } from "../core/logic_base.js";
import { cellarDarkLoss } from "../core/legacy.js";
import { eventRunFix } from "../story/events.js";
import { trialById, trialState, trialWin } from "../core/shop.js";
import { injureDaysOf, limitedFx, skillCheck, teamHas } from "../core/systems.js";
import { COOP, coopActive, coopFinish, coopFix, coopFloorComplete, coopFloorOf, coopMarkDeep, coopMember, coopNewEvents, coopNextLeader, coopPower, coopPressure, coopRoller, coopRoom, coopSanGain, coopSanHit, coopSync, coopTargetOf, coopTeam, coopVoters } from "./base.js";
import { coopCarryDue, coopCheckFun, coopFilterView, coopPlanRoom, coopRoomDone, coopStart } from "./fun.js";
import { fightFoesOf, fightIntentHidden } from "../cellar/fight.js";
import { coopFightStart, coopFightView, coopGateDue, coopRouteBack } from "./fight.js";
import { coopRouteBegin, coopRouteMapView, coopRouteOn } from "./route.js";

// ---------- 小工具 ----------
// 這位隊員帶的佩佩有沒有某個選項（棒球帽、觸手帽是誰的）
export const coopOwns = (run, id, cat, v) => run.team.some(it => it.owner === id && it.pick[cat] === v);

// ---------- 建一趟 ----------
// 檢查。層數看每位自己的 P.cellar.best（每個人都要走過上一層）：
//   鑰匙、禁書、結局是照順序一層一層拿的，跟單人一樣；老手還是可以陪新手走淺的層（老手只拿「再走一次」的靈感）。
export function canStartCoop(members, floor, trial) {
  if (!Array.isArray(members) || !members.length || members.length > COOP.maxPlayers) return { ok: false, reason: `一隊 1–${COOP.maxPlayers} 個人` };
  if (!cellarFloor(floor)) return { ok: false, reason: "這一層還沒開放" };
  const ids = new Set();
  let total = 0;
  if (trial && members.some(m => m && m.guard)) return { ok: false, reason: "試煉房間只有壹間，沒有人留守" };
  if (members.filter(m => m && m.guard).length > 1) return { ok: false, reason: "只能有壹個人留守" };
  if (members.every(m => m && m.guard)) return { ok: false, reason: "要有人下去" };
  for (const m of members) {
    const who = m && m.id;
    if (!m || typeof m.id !== "string" || !m.id || ids.has(m.id)) return { ok: false, reason: "隊員的帳號重複了", who };
    ids.add(m.id);
    const P = m.P, name = m.name || m.id;
    if (!P || !P.pepes || !P.cellar) return { ok: false, reason: `${name} 的存檔讀不到`, who };
    if (isFree(P)) return { ok: false, reason: `${name} 在自由模式，不能一起下去`, who };
    if (!P.day) return { ok: false, reason: `${name} 的存檔還沒有「今天」（伺服器先跑 ensureDay）`, who };
    if (P.sanity <= 0) return { ok: false, reason: `${name} 的理智已經歸零了`, who };
    if (m.guard) continue; // 留守的人不下去：不帶佩佩、也不看他走到哪一層
    if (floor > (P.cellar.best || 0) + 1) return { ok: false, reason: `${name} 要先走過 B${floor - 1}`, who };
    const keys = Array.isArray(m.keys) ? m.keys : [];
    if (keys.length < COOP.eachMin || keys.length > COOP.eachMax || new Set(keys).size !== keys.length) return { ok: false, reason: `${name} 要帶 ${COOP.eachMin}–${COOP.eachMax} 隻不一樣的佩佩`, who };
    for (const k of keys) {
      if (!P.pepes[k] || !fromKey(k)) return { ok: false, reason: `${name} 的收藏裡沒有這隻佩佩`, who };
      if (P.injured[k]) return { ok: false, reason: `${name} 帶的佩佩受傷了，還不能下去`, who };
    }
    total += keys.length;
  }
  if (total > COOP.teamMax) return { ok: false, reason: `隊伍最多 ${COOP.teamMax} 隻（現在 ${total} 隻）` };
  return { ok: true, total, helpers: Math.max(0, COOP.teamMin - total) };
}
// opt.trial：{ id, date }＝走的是試煉房間（決定 0041）：只有那一間，過了每個人各算各的技能成長；opt.today 之外要有 date（算「這週拿過了沒」用的那天）
// opt.event：開始那一刻正在進行的限時活動（events.js 的 eventRunOf；沒有就是 null）。opt.fun：打開好玩的機制（線索、幻覺、證據、留守的地圖、搬東西、報告）；伺服器都開，舊的測試、模擬不開就跟原本一模一樣。opt.id：這一趟的編號
export function startCoop(members, floor, opt = {}) {
  const tr = opt.trial ? trialById(opt.trial.id) : null;
  if (opt.trial && !tr) return { ok: false, reason: "沒有這間試煉房間" };
  if (tr) floor = tr.floor; // 試煉房間在哪一層就在哪一層
  const can = canStartCoop(members, floor, !!tr);
  if (!can.ok) return can;
  const Ps = {};
  const first = members.find(m => !m.guard);
  const run = {
    v: 1, id: opt.id || null, fun: !!opt.fun, gate: !!opt.gate && !tr, gateDone: {}, fight: null, day: opt.day || null, cmap: null, node: null, path: [], chest: null, rest: null, event: eventRunFix(opt.event), trial: null, step: 0, floor, idx: 0, phase: "vote", over: null, next: null,
    leader: first.id, votes: {}, acks: {}, deadline: null, report: null,
    members: members.map(m => {
      Ps[m.id] = m.P;
      return { id: m.id, name: m.name || m.id, keys: m.guard ? [] : m.keys.slice(), rewarded: m.rewarded !== false, job: m.P.job || null, vid: m.P.vid || null, guard: !!m.guard, skips: 0,
        ghost: false, out: null, san: m.P.sanity, max: maxSan(m.P), myth: m.P.myth, startSan: m.P.sanity, used: {},
        got: { insp: 0, sanLoss: 0, sanGain: 0, myth: 0, injured: [], rooms: 0 } };
    }),
    team: [], used: {}, pressure: null, room: null, last: null, log: [], cleared: [],
  };
  if (tr) {
    // 每個人這間試煉現在算不算（開始前先給畫面看：資格不合的人可以陪打，但不拿成長）；過關那一刻會再查一次
    const date = opt.trial.date || (members[0].P.day && members[0].P.day.date);
    run.trial = { id: tr.id, skill: tr.skill, date, elig: {}, fx: null };
    members.forEach(m => { const st = trialState(m.P, tr.id, date); run.trial.elig[m.id] = { state: st.state, reason: st.reason }; });
  }
  run.team = coopTeam(run, Ps);
  if (run.fun) coopStart(run, Ps);
  if (coopRouteOn(run)) coopRouteBegin(run, Ps); // 地下室改版：先選路（coop/route.js）
  members.forEach(m => { if (!m.guard && m.P.visit) m.P.visit.deepest = Math.max(m.P.visit.deepest || 0, floor); }); // 走到地下第幾層（歷任參觀者牆），跟 startCellar 一樣
  coopMarkDeep(run, Ps);
  coopSync(run, Ps);
  return { ok: true, run, events: coopNewEvents(run) };
}

// ---------- 投票 ----------
// votes ＝ { 隊員 id: 選項的號碼（0 開始）或 "retreat"（撤退） }；沒投、投了不存在的選項、幽靈投的，都算棄權。
// 多數決；平手由這一間的領隊決定：tieBreak（伺服器另外問領隊的）→ 領隊自己投的 → 平手裡的「安全」選項 → 平手裡號碼最小的。
// 大家都棄權：所有選項算平手（不會自己撤退）。
export function coopTally(run, votes, tieBreak) {
  const room = coopRoom(run), n = room ? room.choices.length : 0;
  const norm = v => {
    if (v === "retreat") return "retreat";
    const x = typeof v === "string" && /^\d+$/.test(v) ? +v : v;
    return Number.isInteger(x) && x >= 0 && x < n ? x : null;
  };
  const cast = {}, abstain = [], count = new Map();
  coopVoters(run).forEach(m => {
    const v = norm(votes ? votes[m.id] : undefined);
    if (v === null) { abstain.push(m.id); return; }
    cast[m.id] = v; count.set(v, (count.get(v) || 0) + 1);
  });
  const top = Math.max(0, ...count.values());
  let tied = top ? [...count.keys()].filter(v => count.get(v) === top) : room.choices.map((c, i) => i);
  tied = tied.sort((a, b) => (a === "retreat") - (b === "retreat") || a - b);
  let pick, by;
  if (tied.length === 1) { pick = tied[0]; by = "majority"; }
  else {
    const tb = norm(tieBreak), lv = run.leader in cast ? cast[run.leader] : null;
    const safe = tied.find(v => v !== "retreat" && room.choices[v].check.type === "none");
    if (tb !== null && tied.includes(tb)) { pick = tb; by = "leader"; }
    else if (lv !== null && tied.includes(lv)) { pick = lv; by = "leader"; }
    else if (safe !== undefined) { pick = safe; by = "safe"; }
    else { pick = tied[0]; by = "first"; }
  }
  return { votes: cast, abstain, counts: [...count.entries()].map(([v, k]) => ({ v, n: k })), tied: tied.length > 1 ? tied : [], pick, by, leader: run.leader };
}

// ---------- 擲骰 ----------
// 強度：全隊一起擲一次。技能：技能最高的人擲。理智：每個人各自擲（幽靈不擲）。皇冠全隊一層重擲一次。
export function coopCheck(run, Ps, room, ch, bonus = null) {
  const k = ch.check, pr = run.pressure || coopPressure(run);
  const out = { type: k.type, success: true, roll: null, total: null, target: null, rerolled: false, notes: [] };
  if (bonus) out.clue = true;
  const lfx = limitedFx(run.team);
  const crown = () => {
    if (lfx.reroll > (run.used.lre || 0)) { run.used.lre = (run.used.lre || 0) + 1; out.rerolled = true; out.notes.push("皇冠號令：重擲一次"); return true; } // 限定帽子（傳說的金冠）多壹次
    if (run.used.crown || !teamHas(run.team, "帽子", "皇冠")) return false; run.used.crown = true; out.rerolled = true; out.notes.push("皇冠號令：重擲一次"); return true;
  };
  if (k.type === "power") {
    const tp = coopPower(run, Ps, room);
    out.power = tp.total; out.notes = tp.notes.slice(); out.base = k.target;
    out.target = coopTargetOf(run, k.target) - (bonus ? bonus.power : 0);
    if (bonus) out.notes.push(`記號對上了：門檻 −${bonus.power}`);
    out.roll = rollExpr("1D10"); out.total = tp.total + out.roll.total; out.success = out.total >= out.target;
    if (!out.success && crown()) { out.firstRoll = out.roll; out.roll = rollExpr("1D10"); out.total = tp.total + out.roll.total; out.success = out.total >= out.target; }
    out.tentacle = coopVoters(run).filter(m => coopOwns(run, m.id, "帽子", "觸手帽")).map(m => m.id); // 這幾個人要付理智
  } else if (k.type === "skill") {
    const by = coopRoller(run, Ps, k.skill), P = Ps[by];
    const gent = teamHas(run.team, "帽子", "紳士帽") ? NUM.cellarFx.gent : 0, lskill = lfx.skill;
    const mod = (k.mod || 0) + gent + lskill + pr.skill + (bonus ? bonus.skill : 0);
    if (bonus) out.notes.push(`記號對上了：技能 +${bonus.skill}`);
    if (gent) out.notes.push(`紳士帽的禮貌 +${NUM.cellarFx.gent}`);
    if (lskill) out.notes.push(`限定帽子 技能 +${lskill}`);
    if (pr.skill) out.notes.push(`理智壓力 ${pr.skill}`);
    let sc = skillCheck(P, k.skill, mod);
    out.by = by; out.skill = k.skill; out.roll = sc.roll; out.target = sc.target; out.success = !!sc.success;
    if (!out.success && crown()) { out.firstRoll = out.roll; sc = skillCheck(P, k.skill, mod); out.roll = sc.roll; out.success = !!sc.success; }
  } else if (k.type === "san") {
    out.spec = k.spec; out.san = {};
    coopVoters(run).forEach(m => {
      const r = sanCheck(Ps[m.id], k.spec, "cellar:" + room.id);
      if (bonus && r.loss) r.loss = Math.max(0, r.loss - bonus.san); // 記號對上了：少扣一點
      out.san[m.id] = r;
    });
    const rs = Object.values(out.san);
    out.passed = rs.filter(r => r.success).length;
    out.success = rs.length > 0 && out.passed === rs.length; // 記錄用：每個人都過才算「全隊過了」；結果是一個人一個人算的
  }
  return out;
}

// ---------- 扣理智之後的事（單人的畫面 lossFlow 做的，這裡同步做完、收成事件） ----------
// 受傷：斯拉夫蹲全隊一層擋一次 → 還沒用過的棒球帽（帶的人一層一次）擋 → 從 pool 裡挑一隻受傷（館方助手不會受傷）
export function coopInjure(run, Ps, pool, events) {
  const tell = e => coopActive(run).forEach(m => events[m.id].push(e));
  if (teamHas(run.team, "姿勢", "斯拉夫蹲") && !run.used.squat) { run.used.squat = true; const e = { type: "blocked", what: "squat" }; tell(e); return e; }
  const cap = coopActive(run).find(m => !m.used.cap && coopOwns(run, m.id, "帽子", "棒球帽"));
  if (cap) { cap.used.cap = true; const e = { type: "blocked", what: "cap", by: cap.id }; tell(e); return e; }
  const hurt = pickOne(pool.filter(it => !it.helper && it.owner));
  if (!hurt) return null;
  const P = Ps[hurt.owner], m = coopMember(run, hurt.owner);
  const days = injureDaysOf(P), until = addDays(P.day.date, days);
  P.injured[hurt.key] = until;
  m.got.injured.push(hurt.key);
  events[hurt.owner].push({ type: "injured", key: hurt.key, days, until });
  return { type: "injured", owner: hurt.owner, key: hurt.key, days, until };
}

// ---------- 結果套到每個人 ----------
// 強度、技能：全隊同一個結果。理智：每個人照自己擲的結果。
// 每個人：靈感（第一次過這一間拿全部；再走一次拿 NUM.cellarRepeatInsp，rewarded: false 的人不拿）、理智、佩佩神話、
//   第一次走這一間的躺平、毛帽回理智，都記在他自己的 P（P.cellar.won、cleared）。
// 幽靈：還拿靈感、佩佩還會受傷；理智不再變、不拿佩佩神話（參觀者已經不在了，收藏和靈感是博物館的）。
export function coopApply(run, Ps, room, ch, check, events) {
  const src = "cellar:" + room.id, pr = run.pressure || coopPressure(run);
  const fx = { members: {}, injured: [], blocked: [] };
  const pending = [];
  coopActive(run).forEach(m => {
    const P = Ps[m.id], ev = events[m.id];
    const f = { success: null, insp: 0, sanLoss: 0, sanGain: 0, myth: 0, blocked: [], dark: 0, pressure: 0 };
    fx.members[m.id] = f;
    m.got.rooms++;
    let ok = check.success;
    if (check.type === "san") {
      const r = check.san[m.id];
      if (r) {
        ok = r.success;
        ev.push({ type: "sanCheck", spec: r.spec, roll: r.roll, target: P.sanity, success: r.success, fumble: r.fumble, loss: r.loss, expr: r.expr, habituated: r.habituated });
        // 怕黑多扣、探險燈少扣（dark 可能是負的，決定 0032）：先算總共扣幾點，再分成兩次扣
        const extra = !r.success ? pr.failSan : 0, dark = cellarDarkLoss(P, r.loss + extra);
        const total = r.loss + extra + dark, first = Math.min(r.loss, total);
        coopSanHit(P, m, first, src, { check: first }, ev);
        f.pressure = extra; f.dark = dark;
        if (total - first) coopSanHit(P, m, total - first, src, { pressure: extra, dark }, ev);
      }
      if (!r || m.ghost) { f.success = r ? r.success : null; P.cellar.cleared[room.id] = true; return; } // 幽靈沒有擲，也沒有結果
    }
    f.success = ok;
    if (ok && run.trial) m.trialOk = true; // 合作試煉：這一位過關了（走完那一刻照他自己的資格算成長）
    const o = (ok ? ch.success : ch.fail) || {};
    const firstWin = ok && !P.cellar.won[room.id];
    const firstClear = !P.cellar.cleared[room.id];
    if (o.insp) {
      f.insp = firstWin ? o.insp + (limitedHome(P).winInsp || 0) : (m.rewarded ? NUM.cellarRepeatInsp : 0);
      if (f.insp) { P.insp += f.insp; m.got.insp += f.insp; ev.push({ type: "insp", gain: f.insp, first: firstWin, why: firstWin ? "第一次過這一間" : "再走一次" }); }
    }
    if (ok) P.cellar.won[room.id] = true;
    if (!m.ghost) {
      let loss = 0;
      const parts = {};
      if (o.san) {
        const s = String(o.san).trim();
        if (s.startsWith("+")) { if (firstWin) f.sanGain += coopSanGain(P, m, rollExpr(s.slice(1)).total, "room", ev); }
        else {
          let l = rollExpr(s).total; const lfx = limitedFx(run.team);
          if (l > 0 && lfx.sanCut) l = Math.max(1, l - lfx.sanCut); // 限定帽子（黃雨帽）
          if (l > 0 && !m.used.cap && coopOwns(run, m.id, "帽子", "棒球帽")) { m.used.cap = true; f.blocked.push("cap"); ev.push({ type: "blocked", what: "cap", by: m.id }); }
          else if (l > 0 && lfx.block > (m.used.lbl || 0)) { m.used.lbl = (m.used.lbl || 0) + 1; f.blocked.push("cap"); ev.push({ type: "blocked", what: "cap", by: m.id }); } // 限定帽子（鐵鍋帽、三層帽）每個人各擋
          else { loss += l; parts.room = l; }
        }
      }
      if (check.type === "power" && check.tentacle && check.tentacle.includes(m.id)) { const t = rollExpr(COOP.tentacleSan).total; loss += t; parts.tentacle = t; }
      if (!ok && (check.type === "power" || check.type === "skill") && pr.failSan) { loss += pr.failSan; parts.pressure = f.pressure = pr.failSan; } // 理智檢定的房間在上面擲完就加過了
      const dark = cellarDarkLoss(P, loss);
      if (dark) { loss += dark; parts.dark = f.dark = dark; }
      f.sanLoss = loss;
      if (o.myth) { f.myth = o.myth; m.got.myth += o.myth; ev.push({ type: "myth", gain: o.myth }); ev.push(...addMyth(P, o.myth)); }
      // 躺平、毛帽（看整隊）：每一層每個人第一次走的那間各回 1D3
      if (firstClear && !run.trial) {
        if (teamHas(run.team, "姿勢", "躺平") && !m.used.rest) { m.used.rest = true; f.sanGain += coopSanGain(P, m, rollExpr(NUM.cellarRest).total, "躺平", ev); }
        if (teamHas(run.team, "帽子", "毛帽") && !m.used.beanie) { m.used.beanie = true; f.sanGain += coopSanGain(P, m, rollExpr(NUM.cellarRest).total, "毛帽", ev); }
        const lfx = limitedFx(run.team); // 限定帽子（決定 0085）
        if (lfx.rest && !m.used.lrest) { m.used.lrest = true; f.sanGain += coopSanGain(P, m, lfx.rest, "帽子", ev); }
        if (lfx.firstSan && !m.used.lburn) { m.used.lburn = true; f.sanLoss += lfx.firstSan; loss += lfx.firstSan; parts.burn = lfx.firstSan; }
      }
      if (loss) pending.push([P, m, loss, parts, ev]);
    }
    // 理智檢定的房間：誰的結果要受傷，就從他自己的佩佩挑（現在的房間都沒有，先留著）
    if (check.type === "san" && o.injure) {
      const r = coopInjure(run, Ps, run.team.filter(it => it.owner === m.id), events);
      if (r && r.type === "injured") fx.injured.push(r); else if (r) fx.blocked.push(r.what);
    }
    P.cellar.cleared[room.id] = true;
  });
  // 強度、技能：結果要受傷的話，全隊只有一隻受傷（房間的字都是「壓到壹隻佩佩」）
  if (check.type !== "san") {
    const o = (check.success ? ch.success : ch.fail) || {};
    if (o.injure) {
      const r = coopInjure(run, Ps, run.team, events);
      if (r && r.type === "injured") fx.injured.push(r); else if (r) fx.blocked.push(r.what);
    }
  }
  pending.forEach(([P, m, loss, parts, ev]) => coopSanHit(P, m, loss, src, parts, ev));
  // 留守的人：照再走一次算靈感（今天有獎勵才拿）；不扣理智、不受傷、不算走過這一間
  run.members.filter(m => m.guard && !m.out).forEach(m => {
    const o = (check.success ? ch.success : ch.fail) || {};
    if (o.insp && m.rewarded && Ps[m.id]) { Ps[m.id].insp += NUM.cellarRepeatInsp; m.got.insp += NUM.cellarRepeatInsp; events[m.id].push({ type: "insp", gain: NUM.cellarRepeatInsp, first: false, why: "留守" }); }
    m.got.rooms++;
  });
  return fx;
}

// ---------- 一間房：開票 → 擲骰 → 套結果 ----------
// opt.tieBreak ＝平手時伺服器另外問領隊的選項（沒有就照 coopTally 的順序決定）
export function coopResolve(run, Ps, votes, opt = {}) {
  coopFix(run);
  if (!run || run.phase !== "vote") return { ok: false, reason: "現在不是投票的時候" };
  const room = coopRoom(run);
  if (!room) return { ok: false, reason: "找不到這一間" };
  if (coopActive(run).some(m => !Ps[m.id])) return { ok: false, reason: "少了隊員的存檔" };
  const events = coopNewEvents(run);
  run.step++;
  const vote = coopTally(run, votes, opt.tieBreak);
  if (vote.pick === "retreat") {
    run.last = { floor: run.floor, room: room.id, choice: "retreat", vote, check: null, fx: null, events };
    coopFinish(run, "retreat");
    coopSync(run, Ps);
    return { ok: true, run, retreat: true, vote, events };
  }
  const ch = room.choices[vote.pick];
  const check = coopCheck(run, Ps, room, ch, run.fun ? coopCheckFun(run, vote.pick) : null);
  const fx = coopApply(run, Ps, room, ch, check, events);
  run.last = { floor: run.floor, room: room.id, choice: vote.pick, vote, check, fx, events };
  run.log.push({ floor: run.floor, room: room.id, choice: vote.pick, type: check.type, success: check.success });
  if (run.fun) coopRoomDone(run, Ps, room, ch, vote, check, fx, events);
  run.phase = "result";
  if (!coopVoters(run).length) coopFinish(run, "lost"); // 大家都變幽靈了：這一趟到這裡
  coopSync(run, Ps);
  return { ok: true, run, vote, check, fx, events };
}
// ---------- 合作試煉：走完那一間，每個人各算各的 ----------
// 沒過的、變幽靈的不算；過了的人照他自己的資格（樓層走過沒、有沒有技能、技能到上限沒、這週拿過沒）算：
// 合格的才 trialWin（記進他自己的 P.shop.trials，一間一週一次，不會多扣）；不合格的陪打，看得到原因。
// 限時活動（run.event 是 trialBoost）：成長 ×倍率，開始那一刻記下來就照它算到走完。結果寫進 run.trial.fx 給畫面。
export function coopTrialDone(run, Ps, events) {
  const T = run.trial, boost = run.event && run.event.kind === "trialBoost" ? run.event : null;
  T.fx = {};
  run.members.filter(m => !m.out || m.out === "ghost").forEach(m => {
    const P = Ps[m.id];
    if (!P) return;
    if (m.ghost || !m.trialOk) { T.fx[m.id] = { state: m.ghost ? "ghost" : "fail" }; return; }
    const st = trialState(P, T.id, T.date);
    if (st.state !== "open") { T.fx[m.id] = { state: "noGrow", reason: st.reason }; return; }
    const g = trialWin(P, { id: T.id, trial: T.skill, boost }, T.date);
    T.fx[m.id] = g ? { state: "grown", skill: g.skill, before: g.before, after: g.after, boost: !!g.boost } : { state: "noGrow", reason: "這週拿過了" };
    if (g) events[m.id].push({ type: "trial", skill: g.skill, before: g.before, after: g.after });
  });
  run.cleared.push(run.floor);
  run.idx = 0;
  coopFinish(run, "done");
  coopSync(run, Ps);
  return { ok: true, run, floorDone: true, trialDone: true, floor: run.floor, next: null, rewards: {}, events };
}
export function coopAdvance(run, Ps) {
  coopFix(run);
  if (!run || (run.phase !== "result" && run.phase !== "carried")) return { ok: false, reason: "還沒擲完這一間" };
  const events = coopNewEvents(run);
  run.step++;
  const f = coopFloorOf(run);
  if (run.fun && run.phase === "result" && coopCarryDue(run)) { // 這一間有要搬的東西（機制 8）
    run.phase = "carry";
    coopSync(run, Ps);
    return { ok: true, run, carry: true, events };
  }
  if (coopRouteOn(run) && run.cmap) return coopRouteBack(run, Ps, events); // 地下室改版：這一間走完，回到地圖選下一個點
  run.idx++;
  if (run.idx < f.rooms.length) {
    coopNextLeader(run);
    run.phase = "vote";
    if (run.fun) coopPlanRoom(run, Ps);
    coopSync(run, Ps);
    return { ok: true, run, floorDone: false, events };
  }
  if (run.trial) return coopTrialDone(run, Ps, events); // 合作試煉：沒有「第一次走完這一層」的獎勵，只有各人的技能成長
  // 地下室改版（決定 0067）：房間都探索完了，先打這一層的守門；打贏才算走完（coop/fight.js 打贏之後叫 coopFloorComplete）
  if (coopGateDue(run) && coopVoters(run).length) {
    run.idx = f.rooms.length - 1;
    const g = coopFightStart(run, Ps, fightFoesOf(run.floor, true)[0].id, "gate");
    if (g.ok) { Object.keys(g.events).forEach(id => { events[id] = (events[id] || []).concat(g.events[id]); }); return { ok: true, run, fight: true, floorDone: false, events }; }
  }
  return coopFloorComplete(run, Ps, events);
}
// 往下一層：幽靈先回到地面（他的佩佩也跟著上去），隊伍重排、館方助手重補，這一層用過的帽子、姿勢重算
export function coopContinue(run, Ps) {
  coopFix(run);
  if (!run || run.phase !== "floorDone" || !run.next) return { ok: false, reason: "現在不能往下走" };
  const events = coopNewEvents(run);
  run.step++;
  run.members.forEach(m => { if (!m.out && m.ghost) { m.out = "ghost"; events[m.id].push({ type: "surface" }); } });
  if (!coopVoters(run).length) { coopFinish(run, "lost"); coopSync(run, Ps); return { ok: true, run, events }; }
  run.floor = run.next; run.idx = 0; run.next = null; run.used = {};
  run.members.forEach(m => { m.used = {}; });
  coopMarkDeep(run, Ps);
  run.team = coopTeam(run, Ps);
  coopNextLeader(run);
  run.phase = "vote";
  if (run.fun) coopStart(run, Ps);
  if (coopRouteOn(run)) coopRouteBegin(run, Ps); // 地下室改版：新的一層先選路
  coopSync(run, Ps);
  return { ok: true, run, events };
}
// 回到地面、撤退：獎勵照走到的算（每一間的結果已經套進每個人的 P 了；這一層沒走完就沒有過關獎勵）。
// 回傳每個人這一趟拿了什麼；ghosts ＝理智歸零的人，伺服器接著跑理智歸零的流程（結局、換下一位參觀者）。
export function coopEnd(run, Ps, why = "done") {
  if (!run) return { ok: false, reason: "沒有這一趟" };
  coopFix(run);
  if (run.phase !== "over") { coopFinish(run, why); run.step++; }
  coopBagSettle(run, Ps);
  coopSync(run, Ps);
  const summary = run.members.map(m => ({ id: m.id, name: m.name, ghost: m.ghost, out: m.out, startSan: m.startSan, san: m.san, got: m.got }));
  return { ok: true, run, summary, ghosts: run.members.filter(m => m.ghost).map(m => m.id), cleared: run.cleared.slice() };
}
// 背包（地下室改版，規劃第五節；翊文 11-12：「會加背包和撤退的代價」）：這一趟拿到的靈感都算在背包裡（m.got.insp）。
//   大家一起撤、走完回地面：全拿。自己先走（out "left"）：帶著自己的背包回去，不扣。留守的人在地面上，不扣。
//   全隊都倒了（over "lost"）：每個人的背包剩一半，扣掉的從靈感拿回來（不會扣到負的）。第一次走完一層的鑰匙、禁書不扣。
//   只有新的地下室（run.gate）才算；太久沒人動自己結束的（stale）不算倒下。只算一次（run.bagDone）
export function coopBagSettle(run, Ps) {
  if (!run || run.over !== "lost" || !run.gate || run.bagDone) return [];
  run.bagDone = true;
  const out = [];
  run.members.forEach(m => {
    if (m.out === "left" || m.guard) return;
    const P = Ps[m.id], lose = Math.floor((m.got.insp || 0) / NUM.cellarMap.bagKeep);
    if (!P || lose <= 0) return;
    const take = Math.min(lose, Math.max(0, P.insp));
    P.insp -= take; m.got.insp -= take; m.got.bagLost = take;
    out.push({ id: m.id, lost: take });
  });
  return out;
}

// ---------- 送給每個人的樣子 ----------
// 現在大家看到的都一樣（整份狀態）。之後做「每個人看到的不一樣」（線索分開給、理智低的人看到幻覺）就改這裡：
//   這裡是唯一送出去的出口，不該看到的東西在這裡拿掉，打開開發者工具也看不到。
export function viewFor(run, id) {
  if (!run || !coopMember(coopFix(run), id)) return null;
  const v = JSON.parse(JSON.stringify(run));
  v.me = id;
  if (v.last && v.last.events) v.last.events = { [id]: v.last.events[id] || [] }; // 事件只給他自己的
  v.fresh = (run.fresh && run.fresh[id]) || [];
  if (run.fun) coopFilterView(v, run, id); // 不該看到的東西在這裡拿掉：線索、幻覺、地圖（coop/fun.js）
  if (run.phase === "fight" && run.fight) { v.fightKind = run.fightKind || "gate"; v.fightRank = (run.fight && run.fight.rank) || 1; v.fightView = coopFightView(run, id); v.votes = { [id]: (run.votes || {})[id] || null }; } // 打怪物：別人選了什麼結算前看不到，只知道誰選好了（fightView.waiting）
  // 怪物的個性「蓋著布」「看不清楚」：下一招是哪一種（甚至要對誰）不送出去，開發者工具也看不到
  const hid = run.phase === "fight" && run.fight ? fightIntentHidden(run.fight) : null;
  if (hid && v.fight && v.fight.intent) v.fight.intent = hid === "veil" ? { kind: "veil", to: v.fight.intent.to } : { kind: "blur", to: null };
  if (run.cmap) v.cmap = coopRouteMapView(run); // 地圖（地下室改版；v.map 是留守看的房間地圖，不一樣）：只給種類和等級，不寫怪物是誰
  return v;
}
