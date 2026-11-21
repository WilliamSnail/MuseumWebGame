// ================================================================
//  找 NPC 一起下地下收藏庫：NPC 當隊員（決定 0149，翊文 11-21「NPC 像真人隊友」）
//  NPC 是一位真的隊員：有理智、帶 1 隻佩佩、會投票、算進人數加成；沒有帳號、沒有存檔，所以 P 是每一步照他的資料現做的（coopNpcP），
//  不寫回任何存檔；他的靈感、傷勢都不記（rewarded ＝ false）。投票用簡單規則（coopNpcTurn），照他的性格 style 和專長 role。
//  誰邀得動、答不答應、錢：shared/npc/coop.js。這個檔只管「他在一趟裡」。
//  成員格式（run.members[]）：{ id: "npc:v-lantern", npc: "v-lantern", style, role, name, ... } 其他欄位跟真人一樣。
// ================================================================
import { NUM, SKILLS } from "../core/config.js";
import { fullPick, hashStr, mulberry32, pepeKey, setRng } from "../core/logic_base.js";
import { ensureDay, newProfile } from "../core/logic.js";
import { fightCanAct, fightSeatOf } from "../cellar/fight.js";
import { cmapNode } from "../cellar/map.js";
import { COOP, coopFix, coopLeave, coopRoom } from "./base.js";
import { coopRouteOptions } from "./route.js";
import { COOP_RESIDENTS } from "./text.js";

export const COOP_NPC_ROLES = ["carry", "lead", "calm"]; // 搬運、帶路、壯膽（content/npc/<id>.json 的 cellar.role）
export const coopNpcMemberId = id => "npc:" + id;
export const coopIsNpc = m => !!(m && m.npc);
export const coopNpcHumans = run => run.members.filter(m => !m.npc && !m.out);

// 專長變成技能數字（NPC 的 P 照這個做；搬運看手工藝、帶路看偵查、壯膽看說服；其他技能 35）
const ROLE_SKILL = { carry: { 手工藝: 90 }, lead: { 偵查: 60 }, calm: { 說服: 70 } };

// 這位 NPC 的 P（每一步現做，不存）。san ＝他現在的理智；day ＝今天。要在 setRng 之前叫（裡面自己設種子、用完還原）
export function coopNpcP(info, floor, san, day, hurt) {
  setRng(mulberry32(hashStr("npcP:" + info.npc)));
  let P;
  try { P = newProfile("challenge"); ensureDay(P, day); } finally { setRng(null); }
  const key = coopNpcKey(info.npc);
  P.pepes = { [key]: { n: 1, s: 1, perfect: false } }; P.injured = {};
  (Array.isArray(hurt) ? hurt : []).forEach(k => { P.injured[k] = 1; }); // 這一趟前面受傷的（run 上記的 m.got.injured）：每一步重做，傷不能被清掉
  P.sanity = Math.max(1, Math.round(san)); if (P.day) P.day.startSan = P.sanity; P.myth = 0; P.insp = 0;
  P.job = null; P.vid = null;
  const sk = Object.assign({}, ROLE_SKILL[info.role] || {});
  P.skills = {}; SKILLS.forEach(s => { P.skills[s] = sk[s] != null ? sk[s] : 35; }); // 一般技能 35，專長那一項拉高
  P.cellar.best = Math.max(P.cellar.best || 0, floor - 1);
  return P;
}
// 他帶的那隻：館方助手那一批（稀有、俄國8+9）裡照他的 id 挑一隻
export function coopNpcKey(npc) {
  const h = COOP.helpers[hashStr("npcKey:" + npc) % COOP.helpers.length];
  return pepeKey(fullPick(h));
}
// 給 startCoop 的成員（P 是上面做的）
export function coopNpcMember(info, floor, san, day) {
  const P = coopNpcP(info, floor, san, day, []);
  return { id: coopNpcMemberId(info.npc), npc: info.npc, name: info.name, style: info.style || "basic", role: info.role || null, P, keys: [coopNpcKey(info.npc)], rewarded: false };
}

// ---------- 投票 ----------
const rnd = (run, m, tag) => mulberry32(hashStr(`${run.id || ""}|${run.step}|${run.phase}|${m.id}|${tag}`))();
const ch = c => ({ ok: c.success || {}, bad: c.fail || {}, t: c.check && c.check.type });
// 房間的選項：careful 先看有沒有安全的（不用檢定）；basic 看靈感、扣掉會受傷的和理智檢定；bold 只看靈感；wild 亂選
function pickChoice(run, m) {
  const room = coopRoom(run), L = room && room.choices ? room.choices : [];
  if (!L.length) return 0;
  const r = rnd(run, m, "vote"), style = m.style || "basic";
  if (style === "wild") return Math.min(L.length - 1, Math.floor(r * L.length));
  let best = 0, bs = -1e9;
  L.forEach((c, i) => {
    const x = ch(c), insp = x.ok.insp || 0;
    let s = style === "bold" ? insp * 2 : insp - (x.ok.injure || x.bad.injure ? 2 : 0) - (x.t === "san" ? 1 : 0);
    if (style === "careful" && x.t === "none") s += 100;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
function pickNode(run, m) {
  const opts = coopRouteOptions(run);
  if (!opts.length) return null;
  const kind = id => { const n = cmapNode(run.cmap, id); return n ? n.kind : "explore"; };
  const want = (m.style === "careful" ? ["rest", "chest", "explore", "foe", "gate"] : m.style === "bold" ? ["foe", "gate", "explore", "chest", "rest"] : ["explore", "chest", "rest", "foe", "gate"]);
  const sorted = opts.slice().sort((a, b) => want.indexOf(kind(a)) - want.indexOf(kind(b)));
  return m.style === "wild" ? opts[Math.min(opts.length - 1, Math.floor(rnd(run, m, "node") * opts.length))] : sorted[0];
}
function pickGuess(run) {
  const found = ((run.truth && run.truth.found) || []).map(x => x.kind);
  return COOP_RESIDENTS.slice().sort((x, y) => y.ev.filter(k => found.includes(k)).length - x.ev.filter(k => found.includes(k)).length)[0].id;
}

// 這一步做完之後叫一次（開始、每個動作之後）：NPC 離隊的條件、他在這個階段的投票／確認。人類投完就能結算，所以他要先投好
export function coopNpcTurn(run, Ps) {
  coopFix(run);
  if (!run || run.phase === "over") return false;
  const C = NUM.casino.coopNpc;
  let changed = false;
  for (const m of run.members.filter(x => x.npc && !x.out)) {
    const P = Ps && Ps[m.id];
    if (P && !m.ghost && m.san < C.leaveSan && run.phase !== "fight") { // 理智太低：說一句話離隊（館方助手補位）
      m.leftWhy = "san"; run.log.push({ npcLeave: m.npc, name: m.name }); coopLeave(run, Ps, m.id); changed = true; if (run.phase === "over") return true; continue;
    }
    if (m.ghost) continue;
    const v = run.votes, id = m.id;
    if (run.phase === "vote" && v[id] === undefined) { v[id] = pickChoice(run, m); changed = true; }
    else if (run.phase === "route" && v[id] === undefined) { const n = pickNode(run, m); if (n) { v[id] = n; changed = true; } }
    else if (run.phase === "rest" && v[id] === undefined) { v[id] = "san"; changed = true; }
    else if (run.phase === "fight" && run.fight && v[id] === undefined) {
      const seat = fightSeatOf(run.fight, id);
      if (seat && !seat.out && fightCanAct(seat)) { v[id] = { act: m.style === "careful" ? "guard" : "push", for: null, tap: 0 }; changed = true; }
    }
    else if (run.phase === "guess" && v[id] === undefined) { v[id] = pickGuess(run); changed = true; }
    else if (run.phase === "floorDone" && v[id] === undefined) { v[id] = "down"; changed = true; }
    else if ((run.phase === "result" || run.phase === "carried" || run.phase === "chest") && !run.acks[id]) { run.acks[id] = true; changed = true; }
    else if (run.phase === "carry" && run.carry && run.carry.picks && run.carry.picks[id] === undefined) { run.carry.picks[id] = "skip"; changed = true; } // 搬東西：他不抬（抬壞了不好說話），手工藝高的專長照樣讓助手那一份穩
  }
  return changed;
}
