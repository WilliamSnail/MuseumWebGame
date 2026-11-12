// ================================================================
//  合作地下收藏庫：每一層的小地圖、選路（地下室改版，決定 0067；規劃 docs/地下室改版規劃.md 第三節、第九節第 5 步）
//  翊文 11-12：「地圖選路、路上遇到一般怪物、休息、寶箱、背包。……要做」
//  有守門的趟（run.gate，正式版照 NUM.ui.newCellar）才走地圖；試煉、沒開的照舊一間一間走。
//
//  一層的流程：route（大家投下一個點）→ 走到那個點 → 回到 route …… → 最後一排走完 → 守門（gate）
//    探索 explore：就是原本的房間（content3.js CELLAR，文字、選項都不變），走原本的 vote → result → route
//    遭遇 foe：打一隻這一層的一般怪物（coop_fight.js，kind "foe"）。打贏、逃掉、牠走掉都回 route；全隊倒了這一趟結束
//    休息 rest：每個人各選各的：回一點理智（"san"），或治好自己一隻受傷的佩佩（"heal"）。沒選的當回理智
//    寶箱 chest：開出一件小事，有好有壞；全隊平均理智低的時候內容不一樣。看完按繼續（ack）
//    守門 gate：這一層的大怪物；打贏才算走完這一層（coopFloorComplete）
//  地圖每天一張（cmapOfDay，同一天同一層大家一樣）。送給畫面的地圖不寫怪物是誰（coopRouteMapView）。
//  run.cmap ＝今天這一層的地圖（不叫 map：coop_fun.js 給留守看的是 v.map）；run.node ＝現在站的點（還沒出發是 null）；run.path ＝走過的點；run.chest ＝剛開的寶箱
//  純函式；亂數用 RNG()。
// ================================================================
import { NUM } from "./config.js";
import { RNG, pickOne, rollExpr } from "./logic.js";
import { cellarFloor } from "./logic3.js";
import { cmapNext, cmapNode, cmapNodes, cmapOfDay, cmapPeek } from "./cellar_map.js";
import { coopActive, coopArr, coopFinish, coopMember, coopNewEvents, coopNextLeader, coopSanGain, coopSanHit, coopSync, coopVoters } from "./coop.js";
import { coopPlanRoom } from "./coop_fun.js";
import { coopFightStart } from "./coop_fight.js";

// 寶箱、怪事開出來的東西（草稿，Yuga 可以改）。low ＝全隊平均理智低（壓力 2 級以上）的時候看到的
export const COOP_CHEST_TEXT = {
  good: {
    ok: ["箱子裡是壹疊沒拆的參觀券，背面有人畫了壹隻佩佩。", "壹個舊餅乾盒，裡面整整齊齊放著別人留下的速寫。", "箱底壓著壹張館長的便條：「辛苦了，這個給你們。」"],
    low: ["箱子打開的時候，裡面的東西好像已經等很久了。是好東西，但你不太敢多看。", "裡面是壹疊速寫。最後壹張畫的是你們現在的樣子。"],
  },
  odd: {
    ok: ["箱子是空的。蓋子內側寫著日期，是明天。", "裡面只有壹隻手套，跟招領箱裡那隻剛好是壹對。", "打開的時候，樓上傳來壹聲很輕的敲門聲。"],
    low: ["箱子是空的。可是你們都聽見裡面有東西在呼吸。", "裡面是壹面小鏡子。鏡子裡少了壹個人。"],
  },
  bad: {
    ok: ["蓋子彈開，壹陣灰撲了大家壹臉。", "箱子裡塞滿了寫著「不要打開」的紙條。每壹張的字跡都不壹樣。"],
    low: ["箱子裡的東西先看見你們了。", "裡面是你們的名字，壹個壹個寫在帳上，最後壹欄是空的。"],
  },
};

export const coopRouteOn = run => !!(run && run.gate && !run.trial);

// 從資料庫讀回來補欄位（空的陣列會不見、陣列可能變成物件）
export function coopRouteFix(run) {
  if (!run || typeof run !== "object") return run;
  if (run.cmap && typeof run.cmap === "object") {
    const m = run.cmap;
    m.rows = coopArr(m.rows).map(r => coopArr(r));
    if (!m.links || typeof m.links !== "object") m.links = {};
    Object.keys(m.links).forEach(k => { m.links[k] = coopArr(m.links[k]); });
  } else run.cmap = null;
  run.path = coopArr(run.path);
  if (run.node === undefined) run.node = null;
  if (run.chest === undefined) run.chest = null;
  if (run.rest === undefined) run.rest = null;
  return run;
}

// 下樓（第一層或往下一層）：今天這一層的地圖，站在入口，開始選路
export function coopRouteBegin(run, Ps) {
  const events = coopNewEvents(run);
  run.cmap = cmapOfDay(run.floor, run.day || "");
  run.node = null; run.path = []; run.chest = null; run.rest = null; run.room = null;
  run.phase = run.cmap ? "route" : "vote";
  coopSync(run, Ps);
  return { ok: true, run, events };
}

// 現在可以走的下一個點
export const coopRouteOptions = run => (run && run.cmap ? cmapNext(run.cmap, run.node) : []);

// 開票：多數決；平手領隊投的；領隊沒投（或不在平手裡）就選平手裡的探索房，再不然第一個。都沒投：探索房優先
// 也可以投 "retreat"（大家壹起回地面）：要過半才撤，平手不撤
export function coopRouteTally(run, votes) {
  const opts = coopRouteOptions(run), count = {};
  const back = coopVoters(run).filter(m => votes && votes[m.id] === "retreat").length;
  if (back * 2 > coopVoters(run).length) return { pick: "retreat", count: { retreat: back }, tied: false };
  opts.forEach(id => { count[id] = 0; });
  coopVoters(run).forEach(m => { const v = votes && votes[m.id]; if (v in count) count[v]++; });
  const top = Math.max(0, ...Object.values(count));
  const tied = opts.filter(id => count[id] === top);
  const lead = votes && votes[run.leader];
  const explore = tied.find(id => { const n = cmapNode(run.cmap, id); return n && n.kind === "explore"; });
  const pick = tied.includes(lead) ? lead : explore || tied[0] || null;
  return { pick, count, tied: tied.length > 1 };
}

// 走到投出來的點
export function coopRouteGo(run, Ps, votes) {
  if (!run || run.phase !== "route" || !run.cmap) return { ok: false, reason: "現在不是選路的時候" };
  if (coopActive(run).some(m => !Ps[m.id])) return { ok: false, reason: "少了隊員的存檔" };
  const vote = coopRouteTally(run, votes || {});
  if (!vote.pick) return { ok: false, reason: "沒有路可以走" };
  run.step++;
  if (vote.pick === "retreat") { coopFinish(run, "retreat"); coopSync(run, Ps); return { ok: true, run, retreat: true, events: coopNewEvents(run) }; }
  const node = cmapNode(run.cmap, vote.pick);
  run.node = node.id; run.path.push(node.id);
  run.routeLast = { node: node.id, kind: node.kind, count: vote.count };
  let events = coopNewEvents(run);
  const merge = ev => { Object.keys(ev || {}).forEach(id => { events[id] = (events[id] || []).concat(ev[id]); }); };
  coopActive(run).forEach(m => events[m.id].push({ type: "routeGo", node: node.id, kind: node.kind }));
  if (node.kind === "explore") {
    const f = cellarFloor(run.floor), idx = f ? f.rooms.findIndex(r => r.id === node.room) : -1;
    run.idx = Math.max(0, idx);
    coopNextLeader(run);
    run.phase = "vote";
    if (run.fun) coopPlanRoom(run, Ps);
    coopSync(run, Ps);
    return { ok: true, run, events };
  }
  if (node.kind === "foe" || node.kind === "gate") {
    const g = coopFightStart(run, Ps, node.foe, node.kind === "gate" ? "gate" : "foe", node.rank || 1);
    if (g.ok) { merge(g.events); return { ok: true, run, fight: true, events }; }
    return coopRouteBack(run, Ps, events); // 開不了（怪物不見了）：當成路過
  }
  if (node.kind === "rest") {
    run.phase = "rest"; run.rest = { node: node.id };
    coopSync(run, Ps);
    return { ok: true, run, events };
  }
  // 寶箱、怪事
  coopChestOpen(run, Ps, events);
  return { ok: true, run, events };
}

// 這個點做完了：回到選路（大家都倒了就結束）
export function coopRouteBack(run, Ps, events = coopNewEvents(run)) {
  run.room = null; run.rest = null;
  if (!coopVoters(run).length) { coopFinish(run, "lost"); coopSync(run, Ps); return { ok: true, run, events }; }
  run.phase = "route";
  coopSync(run, Ps);
  return { ok: true, run, events };
}

// 休息：picks ＝ { 隊員 id: "san" | "heal" }。治不了（沒有受傷的）就回理智
// 回理智只有今天還有獎勵的趟才有（不能下去壹直刷，界線）
export function coopRest(run, Ps, picks) {
  if (!run || run.phase !== "rest") return { ok: false, reason: "現在不是休息的時候" };
  const events = coopNewEvents(run), M = NUM.cellarMap;
  run.step++;
  const done = {};
  coopVoters(run).forEach(m => {
    const P = Ps[m.id], ev = events[m.id];
    if (!P) return;
    const want = picks && picks[m.id] === "heal" ? "heal" : "san";
    const hurt = want === "heal" ? coopArr(m.got.injured).find(k => P.injured && P.injured[k]) : null; // 只治這一趟受傷的（畫面看得到是哪幾隻）
    if (hurt) { delete P.injured[hurt]; m.got.injured = coopArr(m.got.injured).filter(k => k !== hurt); ev.push({ type: "healed", key: hurt }); done[m.id] = { did: "heal", key: hurt }; return; }
    const g = m.rewarded ? coopSanGain(P, m, M.restSan, "rest", ev) : 0;
    done[m.id] = { did: "san", gain: g };
  });
  run.last = { rest: done };
  return coopRouteBack(run, Ps, events);
}

// 寶箱：開出好的、怪的、壞的。好的：今天還有獎勵的人拿壹點靈感；壞的：每個人扣壹點理智（走原本的 coopSanHit）
export function coopChestOpen(run, Ps, events) {
  const M = NUM.cellarMap, low = !!(run.pressure && run.pressure.lv >= 2);
  const r = RNG(), outcome = r < M.chestOdds[0] ? "good" : r < M.chestOdds[0] + M.chestOdds[1] ? "odd" : "bad";
  const text = pickOne(COOP_CHEST_TEXT[outcome][low ? "low" : "ok"]) || "";
  const got = {};
  coopActive(run).forEach(m => {
    const P = Ps[m.id], ev = events[m.id];
    if (!P) return;
    if (outcome === "good" && m.rewarded && !m.ghost) { P.insp += M.chestInsp; m.got.insp += M.chestInsp; got[m.id] = { insp: M.chestInsp }; }
    else if (outcome === "bad" && !m.ghost && !m.guard) { const loss = rollExpr(M.chestSan).total; coopSanHit(P, m, loss, `cellar:${run.floor}c`, null, ev); got[m.id] = { san: loss }; }
    ev.push({ type: "chest", outcome, text, got: got[m.id] || null });
  });
  run.chest = { outcome, text, low, got };
  run.phase = "chest";
  coopSync(run, Ps);
  return run.chest;
}

// 給畫面的地圖：每個點只給種類（遭遇多給等級、心情、顏色），不寫怪物是誰；走過的、現在站的、下一步能走的
export function coopRouteMapView(run) {
  const m = run && run.cmap;
  if (!m) return null;
  const peek = n => cmapPeek(m, n.id, []);
  return {
    floor: m.floor,
    rows: m.rows.map(row => row.map(peek)),
    gate: peek(m.gate),
    links: m.links,
    at: run.node,
    path: run.path.slice(),
    next: coopRouteOptions(run),
  };
}

// 畫面用：這個點是什麼（白話）
export const COOP_ROUTE_KIND = { explore: "探索", foe: "遭遇", chest: "寶箱", rest: "休息", gate: "守門" };
// 這一層地圖上的點都走完了沒（測試、報告用）
export const coopRouteSeen = run => (run && run.cmap ? cmapNodes(run.cmap).filter(n => run.path.includes(n.id)).length : 0);
// 有沒有在這一趟裡（給 coop_flow 判斷要不要收 route、rest 的動作）
export const coopRouteMember = (run, id) => { const m = coopMember(run, id); return !!(m && !m.out && !m.ghost && !m.guard); };
