// ================================================================
//  合作地下收藏庫的畫面（多人版 M4，翊文 11-08、11-09）
//  規則在 shared/coop.js、shared/coop_flow.js；伺服器在 functions/coop.js。這個檔只畫「伺服器給我的樣子」，什麼都不算。
//  - 入口：地下收藏庫的畫面（ADDONS.cellarTop）、館友小卡（FRIEND_ACTIONS）。邀請卡用 ui_party.js 那一套（PARTY_HOOKS 接回來）。
//  - 木框（overlay）開著的時候：準備區（聽 parties/{pid}）→ 走一趟（聽 coopView/{pid}/{我}）。
//  - 走的時候畫面不存檔（UI.saveHold）：每一步都是伺服器寫存檔，收到 save_changed 重新讀（ui_login.js）。
//  - 重新整理、斷線回來：進館時 PANELS.coopResume 讀 partyOf/{我}，還在隊伍裡就接回去。
//  - 關掉框：準備區＝離開隊伍；走到一半＝不關（要按「離隊」）；走完＝離開隊伍。
// ================================================================
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { NET } from "./net_firebase.js";
import { CELLAR_REWARDS } from "../../shared/config.js";
import { describePepe, fromKey, isFree, migrateSave, nowMs, todayStr } from "../../shared/logic.js";
import { cellarFloor, cellarFloors, memberPower } from "../../shared/logic3.js";
import { COOP } from "../../shared/coop.js";
import { coopTurnsLeft } from "../../shared/coop_flow.js";
import { COOP_OVER_TEXT, COOP_PRESSURE_TEXT } from "../../shared/coop_text.js";
import { PARTY, canStartParty, fixParty, partyMembers } from "../../shared/party.js";
import { ADDONS, FRIEND_ACTIONS, P, PANELS, SAVE, UI, ask, btn, checkEnding, collectionItems, h, icon, itemHTML, note, ptNode, rerender, sanShort, setSave, showEvents, snd, updateStatus, useProfile } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { PARTY_HOOKS, sendInvite } from "./ui_party.js";
import { afterEnter } from "./ui_screens1.js";
import { stageAct, stageProp } from "./ui_screens3.js";

const canPlay = () => !!P && !isFree(P);
const ROLL_HOLD = 1800; // 骰子自己擲（大家看同壹顆，不用等誰按），停多久自己關
const hashOf = s => [...String(s)].reduce((n, c) => (n * 31 + c.codePointAt(0)) >>> 0, 7);

// ---------- 一次只有一隊 ----------
let S = null; // { pid, m, party, view, gone, out, shown, anim, busy, offs, timers, clock, pending, resumed, myVote, tickAt }

async function call(act, data) {
  if (!S) return null;
  return NET.call("coopStep", { pid: S.pid, act, data: data || {} });
}
async function doAct(act, data) {
  const s = S;
  if (!s || s.busy === act) return;
  s.busy = act;
  try { await call(act, data); }
  catch (e) { snd("error"); note(e.message || "沒辦法。", "bad"); }
  finally { if (S === s) { s.busy = null; draw(); } }
}
async function partyAct(act, extra) {
  const s = S;
  if (!s || s.busy === act) return;
  s.busy = act;
  try { await NET.call("partyAction", Object.assign({ pid: s.pid, act }, extra || {})); }
  catch (e) { snd("error"); note(e.message || "沒辦法。", "bad"); }
  finally { if (S === s) { s.busy = null; draw(); } }
}

// ---------- 開、關 ----------
export function openCoop(pid, o = {}) {
  if (S && S.pid === pid) { if (!(S.m && S.m.layer.isConnected)) mount(); return; }
  if (S) endSession(false);
  NET.flush().catch(() => {}); // 手上的先送上去，之後都是伺服器寫（docs/多人實作.md 第二節第 3 條）
  UI.saveHold = true;
  document.body.classList.add("coop-on");
  S = { pid, m: null, party: null, view: null, gone: false, out: null, shown: -1, anim: false, busy: null, offs: [], timers: {}, clock: null, pending: [], resumed: !!o.resumed, myVote: null, tickAt: 0, bestSent: false };
  mount();
  const s = S, meId = NET.me && NET.me.id;
  s.offs.push(NET.watch(`parties/${pid}`, v => {
    if (S !== s) return;
    if (v == null) { if (s.party) s.gone = true; s.party = null; } else s.party = fixParty(v);
    if (s.party && s.party.phase === "lobby") {
      if (s.view) { s.view = null; s.shown = -1; } // 再走壹趟：回到準備區
      if (!s.bestSent && canPlay()) { s.bestSent = true; call("setBest", { best: P.cellar.best || 0 }).catch(() => {}); }
    }
    watchOff();
    draw();
  }));
  s.offs.push(NET.watch(`coopView/${pid}/${meId}`, v => { if (S === s && v && v.j) onView(JSON.parse(v.j)); }));
  s.offs.push(NET.on("roster", () => { if (S === s) { watchOff(); drawSide(); } }));
  s.clock = setInterval(tickClock, 250);
  if (o.resumed) call("resume").catch(() => {});
  draw();
  snd("flip");
}
function mount() {
  S.m = overlay("nb-party nb-coop", "地下收藏庫", "合作地下收藏庫", "stairs", onFrameClose);
}
function runningNow() { return !!(S && S.party && S.party.phase === "running" && !S.gone && !S.out); }
function onFrameClose() {
  if (!S) return;
  if (runningNow()) { // 走到一半不會不小心離隊：框馬上回來，要離隊請按「離隊」
    mount();
    draw();
    note("走到壹半：要離開請按「離隊」。");
    return;
  }
  endSession(true);
}
// 收掉這一隊。leave：要不要告訴伺服器離開隊伍
async function endSession(leave) {
  const s = S;
  if (!s) return;
  S = null;
  s.offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } });
  clearInterval(s.clock);
  Object.values(s.timers).forEach(x => clearTimeout(x.t));
  document.body.classList.remove("coop-on");
  if (s.m && s.m.layer.isConnected) s.m.close();
  if (leave && !s.gone) { try { await NET.call("partyAction", { pid: s.pid, act: "leave" }); } catch (e) { /* 隊伍已經不在了 */ } }
  // 伺服器剛寫過我的存檔：讀最新的，才放開存檔
  try { await reloadSave(); } catch (e) { /* 下次存的時候會碰到衝突，再讀一次 */ }
  UI.saveHold = false;
  if (!P) return;
  await showEvents(s.pending); // 這一趟拿到的解鎖、鑰匙、禁書……（最後會看要不要走結局）
  if (s.resumed) await afterEnter(); else await checkEnding();
}
async function reloadSave() {
  if (!UI.net) return;
  NET.dropPending();
  const r = await NET.loadSave();
  const mode = SAVE.current, playing = !!P;
  setSave(migrateSave(r.data));
  if (playing && mode && SAVE.profiles[mode]) useProfile(mode);
  updateStatus();
  if (P && UI.screen !== "title") rerender();
}

// ---------- 伺服器給了新的樣子 ----------
function onView(v) {
  const s = S;
  if (!s.view) { s.view = v; s.shown = v.step; draw(); return; } // 剛接回來：不重演
  const newStep = v.step > s.shown;
  s.view = v;
  if (v.deadline !== s.lastDeadline) { s.lastDeadline = v.deadline; s.myVote = null; s.tickAt = 0; }
  if (!newStep) { if (!s.anim) draw(); return; }
  s.shown = v.step;
  s.pending.push(...(v.fresh || []).filter(e => ["badge", "unlock", "chapter", "exhibit", "row", "theme", "recipe", "key", "book"].includes(e.type)));
  if (v.phase === "result") playResult(v);
  else if (!s.anim) { if (v.phase === "floorDone") snd("fanfare"); else if (v.phase === "vote") snd("steps"); draw(); }
}
// 擲骰的演出：大家看到同一顆（理智檢定各擲各的）
async function playResult(v) {
  const s = S;
  if (!s || s.anim) { draw(); return; }
  s.anim = true;
  try {
    const l = v.last, c = l.check, me = v.me, nameOf = id => (v.members.find(m => m.id === id) || {}).name || "隊友";
    const stage = s.m.surface.querySelector(".cellar-stage");
    if (stage && c) { stageProp(stage, { type: c.type, skill: c.skill }, ""); await stageAct(stage, { type: c.type, skill: c.skill }); }
    if (c && c.type === "power") {
      snd("drum");
      await FX.rollOverlay({ title: "強度檢定", sub: `全隊強度 ${c.power}，再加擲出的 1～10，要 ≥ ${c.target}（大家看到同壹顆骰子）`, spec: "1D10", result: c.roll, auto: true, hold: ROLL_HOLD,
        outcome: { text: `${c.power} ＋ ${c.roll.total} ＝ ${c.total}　${c.success ? "過了" : "不夠"}${c.rerolled ? "（皇冠號令重擲過）" : ""}`, tone: c.success ? "good" : "bad" } });
    } else if (c && c.type === "skill") {
      await FX.rollOverlay({ title: `${nameOf(c.by)} 擲${c.skill}`, sub: `擲出 ≤ ${c.target} 就成功（大家看到同壹顆骰子）${c.rerolled ? "（皇冠號令重擲過）" : ""}`, spec: "d100", result: c.roll, auto: true, hold: ROLL_HOLD,
        outcome: { text: c.success ? "成功" : "失敗", tone: c.success ? "good" : "bad" } });
    } else if (c && c.type === "san" && c.san && c.san[me]) {
      const r = c.san[me];
      await FX.rollOverlay({ title: "你的理智檢定", sub: "每個人各擲各的，各扣各的", spec: "d100", result: r.roll, auto: true, hold: ROLL_HOLD,
        outcome: { text: r.success ? `成功：扣 ${r.loss}` : `失敗：扣 ${r.loss}`, tone: r.success ? "good" : "bad" } });
    }
    tellEvents(v.fresh || []);
  } finally { if (S === s) { s.anim = false; draw(); } }
}
// 只有自己的事：發作、怪癖、看懂了、幽靈……
function tellEvents(list) {
  list.forEach(e => {
    if (e.type === "sanLoss") { if (e.loss) snd("hurt"); }
    else if (e.type === "ghost") { snd("eerie"); note("你的理智歸零了。你看著自己的手，手是透明的。", "bad", 9000); }
    else if (e.type === "understand" && e.success && e.line) note(`你看懂了：${e.line.text}`, "bad", 9000);
    else if (e.type === "bout") note("你瘋狂發作了。", "bad");
    else if (e.type === "quirk") note("你多了壹個怪癖。", "bad");
    else if (e.type === "injured") note(`你的「${describePepe(fromKey(e.key)).title}」受傷了（${e.days} 天後會好）。`, "bad");
    else if (e.type === "blocked") { snd("block"); note(e.what === "squat" ? "斯拉夫蹲穩住了，沒有佩佩受傷。" : "棒球帽擋下來了。", "good"); }
    else if (e.type === "insp" && e.gain) snd("coin");
  });
}

// ---------- 倒數；時間到了請伺服器看一下（伺服器自己再看一次時間） ----------
function secLeft(v) { return v && v.deadline ? Math.max(0, Math.ceil((v.deadline - nowMs()) / 1000)) : null; }
function tickClock() {
  const s = S;
  if (!s || !s.view || s.view.ended) return;
  const v = s.view, left = secLeft(v);
  if (s.m && s.m.layer.isConnected) s.m.surface.querySelectorAll(".cx-clock").forEach(el => { el.textContent = left == null ? "" : `還有 ${left} 秒`; el.classList.toggle("soon", left != null && left <= 5); });
  if (!v.deadline || s.anim) return;
  // 大家不要同時叫：照隊員順序差一點點；叫過了 4 秒還沒動再叫一次
  const i = Math.max(0, v.members.findIndex(m => m.id === v.me));
  if (nowMs() >= v.deadline + 300 + i * 500 && nowMs() - s.tickAt > 4000) {
    s.tickAt = nowMs();
    call("tick").catch(() => {});
  }
}

// ---------- 隊友斷線 ----------
function offline(id) {
  if (!NET.roster.length) return false;
  const r = NET.roster.find(x => x.id === id);
  return !r || r.status === "offline";
}
function watchOff() {
  const s = S;
  if (!s) return;
  const meId = NET.me && NET.me.id, phase = s.party ? s.party.phase : null;
  const ids = !s.party || s.gone || phase === "done" ? [] : partyMembers(s.party).map(x => x.id).filter(id => id !== meId);
  for (const id of Object.keys(s.timers)) if (!ids.includes(id) || !offline(id)) { clearTimeout(s.timers[id].t); delete s.timers[id]; }
  const wait2 = phase === "running" ? COOP.offlineMs + 2000 : PARTY.offlineWaitMs;
  for (const id of ids) if (offline(id) && !s.timers[id]) s.timers[id] = { t: setTimeout(() => askPrune(id), wait2), tries: 0 };
}
async function askPrune(id) {
  const s = S, x = s && s.timers[id];
  if (!x) return;
  x.tries++;
  let r = null;
  const running = s.party && s.party.phase === "running";
  try { r = running ? await call("prune", { uid: id }) : await NET.call("partyAction", { pid: s.pid, act: "prune", uid: id }); } catch (e) { /* 隊伍不在了 */ }
  if (S === s && s.timers[id] === x && !(r && r.pruned) && x.tries < 3 && offline(id)) x.t = setTimeout(() => askPrune(id), PARTY.offlineWaitMs);
}

// ---------- 畫 ----------
function draw() {
  const s = S;
  if (!s || !s.m || !s.m.layer.isConnected || s.anim) return; // 擲骰演出的時候不換畫面（演完會再畫）
  if (s.out) { drawOut(); return; }
  if (!s.party) {
    s.m.setTop(null);
    s.m.surface.replaceChildren(h("div", { class: "cx-msg" }, h("p", { class: "nb-empty" }, s.gone ? "隊伍解散了。" : "正在連線……"), s.gone ? btn("回去", () => s.m.close(), "primary") : null));
    return;
  }
  const phase = s.party.phase;
  if ((phase === "running" || phase === "done") && s.view) { drawRun(s.view); return; }
  if (phase === "running" || phase === "done") {
    s.m.setTop(null);
    s.m.surface.replaceChildren(h("p", { class: "nb-empty" }, "往下走……"));
    return;
  }
  drawLobby();
}
function drawOut() {
  const s = S;
  s.m.setTop(null);
  s.m.surface.replaceChildren(h("div", { class: "cx-msg" }, h("p", { class: "nb-empty" }, s.out === "afk" ? "你太久沒有動，隊伍先走了。這壹趟拿到的都留著。" : "你斷線太久，隊伍先走了。這壹趟拿到的都留著。"), btn("回去", () => s.m.close(), "primary")));
}

// ---------- 準備區 ----------
function drawLobby() {
  const s = S, party = s.party, meId = NET.me && NET.me.id, ms = partyMembers(party), mine = party.members[meId];
  const isLeader = party.leader === meId;
  const can = canStartParty(party, meId);
  const total = ms.reduce((n, m) => n + m.pick.length, 0);
  const helper = Math.max(0, COOP.teamMin - total);
  const pet = (key, big) => h("div", { class: "pt-pet" + (big ? "" : " cx-mini"), title: describePepe(fromKey(key)).full, html: itemHTML({ kind: "pepe", key, pick: fromKey(key) }) });
  const card = m => {
    const off = m.id !== meId && offline(m.id);
    return h("div", { class: "pt-member cx-member" + (m.ready ? " ready" : "") + (m.id === meId ? " me" : "") + (off ? " off" : "") },
      h("b", { class: "pt-nick" }, m.nick, m.id === party.leader ? h("small", null, "隊長") : null),
      m.guard ? h("div", { class: "cx-guard-mark", html: ART.icon("eye") }) : h("div", { class: "cx-pets" }, m.pick.length ? m.pick.map(k => pet(k)) : h("div", { class: "pt-pet empty cx-mini" }, "還沒選")),
      h("span", { class: "pt-name" }, m.guard ? "留在監視器前" : typeof m.best === "number" ? (m.best ? `走過 B${m.best}` : "還沒下去過") : "　"),
      h("span", { class: "pt-state" }, off ? "不在線……" : m.ready ? "準備好了" : m.guard ? "還沒準備好" : "還在選"));
  };
  const empties = Array.from({ length: Math.max(0, PARTY.maxMembers.cellar - ms.length) }, () => h("div", { class: "pt-member wait cx-member" }, h("b", null, "空位")));
  const members = h("div", { class: "pt-members cx-members" }, ms.map(card), empties);

  // 層數：隊長選；看每個人自己的進度（決定：每個人都要走過上一層）
  const known = ms.map(m => (typeof m.best === "number" ? m.best : null)).filter(x => x != null);
  const reach = known.length ? Math.min(...known) + 1 : 1;
  const floors = h("div", { class: "cx-floors", role: "group", "aria-label": "下到第幾層" }, cellarFloors().map(n => {
    const f = cellarFloor(n), on = party.floor === n, open = n <= reach;
    return h("button", { type: "button", class: "cx-floor" + (on ? " on" : "") + (open ? "" : " locked"), disabled: !isLeader || !open, "aria-pressed": String(on), title: open ? f.name : `隊上有人還沒走過 B${n - 1}`, onClick: () => doAct("setFloor", { floor: n }) },
      h("b", null, `B${n}`), h("span", null, open ? f.name : "還不能去"));
  }));
  const fail = party.fail && party.fail.reason ? h("p", { class: "pt-hint pt-warn" }, `開始不了：${party.fail.reason}`) : null;
  const today = todayStr(), left = canPlay() ? coopTurnsLeft(P, today) : 0;
  const foot = h("div", { class: "pt-foot" }, fail,
    h("p", { class: "pt-hint cx-grow" }, left ? `今天還有 ${left} 趟有獎勵（壹天前 ${COOP.dailyRewarded} 趟）；之後只有好玩，第壹次過關的獎勵照舊。` : "今天的獎勵拿完了，這趟只有好玩；第壹次過關的獎勵照舊。"),
    isLeader ? [can.ok ? null : h("p", { class: "pt-hint" }, can.waitFor === meId ? "等你準備好" : can.reason), btn([icon("stairs"), ` 下到 B${party.floor || 1}`], async () => { await NET.flush().catch(() => {}); doAct("start"); }, "primary", { disabled: !can.ok || s.busy === "start" })]
      : h("p", { class: "pt-hint" }, "等隊長按出發。"));
  s.m.setTop(btn("離開隊伍", () => s.m.close(), "small"));
  const keep = s.m.surface.querySelector(".pt-pick");
  const top = keep ? keep.scrollTop : 0;
  s.m.surface.replaceChildren(h("div", { class: "pt-wrap" },
    h("p", { class: "nb-hint pt-intro" }, `壹隊 1–${COOP.maxPlayers} 個人，每人帶 ${COOP.eachMin}–${COOP.eachMax} 隻（隊伍最多 ${COOP.teamMax} 隻）；不到 ${COOP.teamMin} 隻由${COOP.helperName}補。大家壹起投票，看同壹顆骰子，理智各扣各的。全隊的理智越低，下面越危險。`),
    members,
    h("div", { class: "cx-row" }, h("span", { class: "cx-label" }, "下到"), floors),
    total ? h("p", { class: "pt-hint" }, helper ? `隊伍 ${total} 隻，${COOP.helperName}補 ${helper} 隻。` : `隊伍 ${total} 隻。`, total > COOP.teamMax ? h("b", { class: "pt-warn" }, `　太多了，最多 ${COOP.teamMax} 隻。`) : null) : null,
    mine ? picker(mine, ms) : null,
    inviteBox(ms),
    foot));
  const pick = s.m.surface.querySelector(".pt-pick");
  if (pick && top) pick.scrollTop = top;
}
// 挑佩佩：強度高的先；受傷的不能帶。按一下放進去、再按一下拿下來
function picker(mine, ms) {
  const s = S;
  if (!canPlay()) return h("p", { class: "pt-hint" }, "要用挑戰模式的參觀者才能下去。");
  const chosen = mine.pick;
  const guardBtn = ms.length > 1 ? btn(mine.guard ? "我要下去" : "我留守（看監視器）", () => doAct("setGuard", { on: !mine.guard }), "small", { title: "留在館長室的監視器前：看得到地圖和每間房的危險度，看不到房間裡的細節。不用帶佩佩。" }) : null;
  const readyBtn = mine.ready
    ? btn("取消準備", () => partyAct("ready", { ready: false }), "small")
    : btn("準備好了", async () => { await NET.flush().catch(() => {}); partyAct("ready", { ready: true }); }, "primary small", { disabled: !chosen.length && !mine.guard });
  if (mine.guard) return h("div", { class: "pt-mine" }, h("p", { class: "pt-cost" }, "你留在館長室的監視器前：看得到地圖和每間房的危險度，看不到房間裡的細節。要靠講的。"), h("div", { class: "pt-mine-btns" }, guardBtn, readyBtn));
  const items = collectionItems("pepe").slice().sort((a, b) => (!!P.injured[a.key] - !!P.injured[b.key]) || (memberPower(b, null) - memberPower(a, null))).slice(0, 60);
  const toggle = it => {
    if (P.injured[it.key]) { note("牠受傷了，先休息。", "bad"); return; }
    let next = chosen.includes(it.key) ? chosen.filter(k => k !== it.key) : chosen.concat(it.key);
    if (next.length > COOP.eachMax) next = next.slice(next.length - COOP.eachMax);
    partyAct("pick", { keys: next });
  };
  const list = items.length ? h("div", { class: "pt-pick" }, items.map(it => {
    const hurt = !!P.injured[it.key], on = chosen.includes(it.key);
    return h("button", { type: "button", class: "pt-opt" + (on ? " on" : "") + (hurt ? " cx-hurt" : ""), title: describePepe(it.pick).full, "aria-pressed": String(on), disabled: hurt, onClick: () => toggle(it) },
      h("span", { class: "pt-opt-art", html: itemHTML(it) }), h("span", { class: "pt-opt-t" }, describePepe(it.pick).title), h("span", { class: "cx-pw" }, hurt ? "受傷" : `強度 ${memberPower(it, null)}`));
  })) : h("p", { class: "pt-hint" }, "收藏裡還沒有佩佩：先去手作坊做壹隻。");
  return h("div", { class: "pt-mine" }, h("p", { class: "pt-cost" }, `挑 ${COOP.eachMin}–${COOP.eachMax} 隻（已經挑了 ${chosen.length} 隻）。你的理智 ${P.sanity}。`), list, h("div", { class: "pt-mine-btns" }, guardBtn, readyBtn));
}
// 邀請在線的館友（也可以從館友的小卡邀請）
function inviteBox(ms) {
  if (ms.length >= PARTY.maxMembers.cellar) return null;
  const inTeam = new Set(ms.map(m => m.id));
  const on = NET.roster.filter(p => !p.me && p.status !== "offline" && !inTeam.has(p.id));
  return h("div", { class: "cx-invite" }, h("span", { class: "cx-label" }, "邀請"),
    on.length ? on.map(p => btn(p.nick, () => sendInvite(p, "cellar"), "small")) : h("span", { class: "pt-hint" }, "現在沒有別的館友在線。壹個人也能下去。"));
}

// ---------- 走一趟 ----------
function meOf(v) { return v.members.find(m => m.id === v.me) || {}; }
function roomOf(v) { const f = cellarFloor(v.floor); return f ? f.rooms[v.idx] : null; }
function oddLine(v) {
  const lv = v.pressure ? v.pressure.lv : 0, t = COOP_PRESSURE_TEXT[lv];
  if (!lv || !t) return null;
  return t.odd[hashOf(`${v.id}:${v.floor}:${v.idx}`) % t.odd.length];
}
function drawRun(v) {
  const s = S, me = meOf(v), f = cellarFloor(v.floor), lv = v.pressure ? v.pressure.lv : 0;
  const top = [h("span", { class: "cx-clock" }), v.ended ? null : btn("離隊", leaveRun, "small")];
  s.m.setTop(top);
  const head = h("div", { class: "cx-head" },
    h("h3", null, `B${v.floor}　${f ? f.name : ""}`),
    f ? h("div", { class: "room-dots" }, f.rooms.map((r, i) => h("i", { class: i < v.idx ? "done" : i === v.idx && v.phase !== "floorDone" ? "now" : v.phase === "floorDone" ? "done" : "" }))) : null,
    lv ? h("p", { class: "cx-press lv" + lv }, COOP_PRESSURE_TEXT[lv].hint, h("small", null, `（平均理智 ${v.pressure.avg}）`)) : null);
  const main = h("div", { class: "cx-main" }, head, stage(v), phaseCard(v, me));
  s.m.surface.replaceChildren(h("div", { class: "cx-run pr" + lv }, main, h("aside", { class: "cx-side" }, sideBox(v))));
  tickClock();
}
function drawSide() {
  const s = S;
  if (!s || !s.view || s.anim || !s.m) return;
  const side = s.m.surface.querySelector(".cx-side");
  if (side) side.replaceChildren(sideBox(s.view));
}
async function leaveRun() {
  const yes = await ask("真的要離隊？你拿到的都留著，你的佩佩會先回去。", "離隊", "留下來");
  if (yes && S) { S.gone = true; const s = S; await NET.call("partyAction", { pid: s.pid, act: "leave" }).catch(() => {}); endSession(false); }
}
// 舞台：最多 6 隻，頭上寫是誰的
function stage(v) {
  const room = roomOf(v), st = h("div", { class: "cellar-stage cx-stage" });
  st.append(h("div", { class: "cellar-scene", html: ART.cellarScene ? ART.cellarScene(v.floor) : "" }));
  st.append(h("div", { class: "cs-prop" }, h("div", { class: "cs-p-art" }), h("span", { class: "cs-p-label" })));
  const nameOf = id => (v.members.find(m => m.id === id) || {}).name || "";
  st.append(h("div", { class: "cs-team" }, v.team.map((it, i) => h("div", { class: "cs-frog" + (it.helper ? " cx-helper" : "") + (it.owner === v.me ? " cx-mine" : ""), style: { "--i": i, "--n": v.team.length, "--row": 0 }, dataset: { key: it.key } },
    h("span", { class: "cs-tag" }, it.helper ? COOP.helperName : nameOf(it.owner), room ? `・${memberPower(it, room)}` : ""),
    h("div", { class: "cs-art", html: itemHTML({ kind: "pepe", key: it.key, pick: it.pick, perfect: it.perfect }) }),
    h("div", { class: "cs-pops" })))), h("div", { class: "cs-float" }));
  const odd = oddLine(v);
  if (odd) st.append(h("p", { class: "cx-odd" }, odd));
  return st;
}
function phaseCard(v, me) {
  if (v.phase === "vote") return voteCard(v, me);
  if (v.phase === "result") return resultCard(v, me);
  if (v.phase === "floorDone") return floorCard(v, me);
  return overCard(v, me);
}
const choiceDesc = (o, v) => {
  if (!o) return "";
  if (o.type === "power") return `全隊強度 ${o.power}＋擲 1～10，要 ≥ ${o.target}`;
  if (o.type === "skill") return `${(v.members.find(m => m.id === o.by) || {}).name || ""} 擲${o.skill} ${o.value}%`;
  if (o.type === "san") return `每個人理智檢定：${sanShort(o.spec)}`;
  return "安全";
};
function voteCard(v, me) {
  const room = roomOf(v), pv = v.room;
  if (!room || !pv) return h("p", { class: "nb-empty" }, "……");
  const can = !me.ghost && !me.guard;
  const voted = id => v.votes && v.votes[id] !== undefined;
  const mine = S.myVote != null ? S.myVote : v.votes ? v.votes[v.me] : undefined;
  const namesFor = c => v.members.filter(m => v.votes && v.votes[m.id] === c).map(m => h("span", { class: "cx-v" }, m.name));
  const vote = c => { S.myVote = c; draw(); doAct("vote", { choice: c }); snd("click"); };
  const choices = h("div", { class: "choices cx-choices" }, room.choices.map((c, i) => btn([h("span", null, c.label), h("small", null, choiceDesc(pv.choices[i], v)), h("span", { class: "cx-vs" }, namesFor(i))],
    () => vote(i), (c.check.type === "none" ? "ghost" : "") + (mine === i ? " cx-on" : ""), { disabled: !can, "aria-pressed": String(mine === i) })));
  const leader = v.members.find(m => m.id === v.leader);
  const waiting = v.members.filter(m => !m.out && !m.ghost && !m.guard && !voted(m.id)).map(m => m.name);
  return h("div", { class: "note-card room-card cx-card" + (room.boss ? " boss" : "") },
    h("i", { class: "pin" }),
    h("div", { class: "nc-tags" }, room.mood ? h("span", { class: "tag" }, `房間的心情：${room.mood}`) : null, room.color ? h("span", { class: "tag" }, `房間的顏色：${room.color}`) : null, leader ? h("span", { class: "tag cx-leader" }, `這間的領隊：${leader.name}（平手他決定）`) : null),
    h("h2", { class: "room-title" }, ptNode(room.title)),
    h("div", { class: "nc-text" }, room.lines.map(l => h("p", null, ptNode(l)))),
    choices,
    h("div", { class: "cx-card-foot" },
      can ? btn(["撤退", h("span", { class: "cx-vs" }, namesFor("retreat"))], () => vote("retreat"), "ghost small" + (mine === "retreat" ? " cx-on" : ""), { "aria-pressed": String(mine === "retreat") }) : h("span", { class: "pt-hint" }, me.ghost ? "你已經不能投票了。" : "你在監視器前。"),
      h("span", { class: "pt-hint cx-wait" }, waiting.length ? `等 ${waiting.join("、")}` : "開票中……"), h("span", { class: "cx-clock" })));
}
function resultLines(v) {
  const l = v.last, room = (cellarFloor(l.floor) || { rooms: [] }).rooms.find(r => r.id === l.room);
  const nameOf = id => (v.members.find(m => m.id === id) || {}).name || "隊友";
  const lines = [];
  if (l.choice === "retreat" || !room) return { room, lines, ch: null };
  const ch = room.choices[l.choice];
  lines.push(`全隊選了「${ch.label}」${l.vote.tied && l.vote.tied.length ? (l.vote.by === "leader" ? `（平手，領隊 ${nameOf(l.vote.leader)} 決定）` : "（平手）") : ""}`);
  if (l.vote.abstain && l.vote.abstain.length) lines.push(`${l.vote.abstain.map(nameOf).join("、")} 棄權`);
  return { room, lines, ch };
}
function memberTable(v) {
  const l = v.last, fx = l && l.fx && l.fx.members ? l.fx.members : {};
  return h("div", { class: "cx-table" }, v.members.filter(m => !m.guard && m.out !== "left").map(m => {
    const f = fx[m.id] || {}, r = l && l.check && l.check.san ? l.check.san[m.id] : null, parts = [];
    if (r) parts.push(`擲 ${r.roll.total} ${r.success ? "過" : "沒過"}`);
    const loss = (f.sanLoss || 0) + (r ? r.loss : 0) + (r ? (f.pressure || 0) + (f.dark || 0) : 0);
    if (loss) parts.push(`理智 −${loss}`);
    if (f.sanGain) parts.push(`理智 +${f.sanGain}`);
    if (f.insp) parts.push(`+${f.insp} 靈感`);
    if (f.myth) parts.push(`神話 +${f.myth}`);
    return h("div", { class: "cx-tr" + (m.id === v.me ? " me" : "") + (m.ghost ? " ghost" : "") }, h("b", null, m.name), h("span", null, parts.join("，") || "沒事"), h("span", { class: "cx-san" }, m.ghost ? "幽靈" : `理智 ${m.san}`));
  }));
}
function resultCard(v, me) {
  const l = v.last, { room, lines, ch } = resultLines(v);
  const success = l.check ? (l.check.type === "san" && l.fx && l.fx.members[v.me] ? l.fx.members[v.me].success : l.check.success) : true;
  const text = ch ? ((success ? ch.success : ch.fail) || {}).text : "";
  const acked = v.acks && v.acks[v.me];
  const waiting = v.members.filter(m => !m.out && !(v.acks && v.acks[m.id])).length;
  const hurt = l.fx && l.fx.injured ? l.fx.injured : [];
  const nameOf = id => (v.members.find(m => m.id === id) || {}).name || "隊友";
  return h("div", { class: "note-card room-card cx-card cx-result " + (success ? "ok" : "bad") },
    h("i", { class: "pin" }),
    room ? h("h2", { class: "room-title" }, ptNode(room.title)) : null,
    lines.map(t => h("p", { class: "pt-sub" }, t)),
    text ? h("p", { class: "cx-text" }, ptNode(text)) : null,
    hurt.map(x => h("p", { class: "cx-hurtline" }, `${nameOf(x.owner)} 的「${describePepe(fromKey(x.key)).title}」受傷了（${x.days} 天後會好）。`)),
    memberTable(v),
    h("div", { class: "cx-card-foot" }, btn(acked ? "等大家……" : "繼續", () => doAct("ack"), "primary", { disabled: !!acked }), h("span", { class: "pt-hint cx-wait" }, waiting ? `還有 ${waiting} 個人在看` : ""), h("span", { class: "cx-clock" })));
}
function rewardText(r) {
  if (!r || !r.first) return "";
  const x = r.reward || {}, parts = [];
  if (x.insp) parts.push(`+${x.insp} 靈感`);
  const cr = CELLAR_REWARDS[r.floor];
  if (cr && cr.unlock) parts.push(`新的選項「${cr.unlock[1]}」`);
  if (cr && cr.key) parts.push(cr.key === "bg" ? "「背景」的鑰匙" : "「手上拿的東西」的鑰匙");
  if (cr && cr.book) parts.push("壹本禁書");
  return parts.join("、");
}
function floorCard(v, me) {
  const f = cellarFloor(v.last && v.last.floorDone ? v.last.floorDone : v.floor);
  const r = v.last && v.last.rewards ? v.last.rewards[v.me] : null;
  const rw = rewardText(r && Object.assign({ floor: f.floor }, r));
  const can = !me.ghost && !me.guard, mine = S.myVote != null ? S.myVote : v.votes ? v.votes[v.me] : undefined;
  const namesFor = c => v.members.filter(m => v.votes && v.votes[m.id] === c).map(m => h("span", { class: "cx-v" }, m.name));
  const vote = go => { S.myVote = go; draw(); doAct("floor", { go }); };
  return h("div", { class: "note-card room-card cx-card cx-floor-done" }, h("i", { class: "pin" }),
    h("h2", { class: "room-title" }, `B${f.floor} 走完了`),
    f.clear ? h("p", { class: "cx-text" }, ptNode(f.clear)) : null,
    rw ? h("p", { class: "cx-reward" }, `第壹次走完：${rw}`) : h("p", { class: "pt-sub" }, "這層你走過了。"),
    me.ghost ? h("p", { class: "cx-hurtline" }, "你的參觀者撐到這裡。大家往下走的話，你就回到地面。") : null,
    h("div", { class: "cx-go" },
      v.next ? btn([icon("stairs"), ` 往下到 B${v.next}`, h("span", { class: "cx-vs" }, namesFor("down"))], () => vote("down"), "primary" + (mine === "down" ? " cx-on" : ""), { disabled: !can }) : null,
      btn(["回到地面", h("span", { class: "cx-vs" }, namesFor("up"))], () => vote("up"), "ghost" + (mine === "up" ? " cx-on" : ""), { disabled: !can })),
    h("div", { class: "cx-card-foot" }, h("span", { class: "pt-hint" }, can ? "大家投票；平手領隊決定；沒投就回地面。" : "等大家決定。"), h("span", { class: "cx-clock" })));
}
function overCard(v, me) {
  const s = S, isLeader = s.party && s.party.leader === v.me;
  const sum = v.summary || [];
  return h("div", { class: "note-card room-card cx-card cx-over" }, h("i", { class: "pin" }),
    h("h2", { class: "room-title" }, v.over === "lost" ? "這壹趟到這裡" : "回到地面了"),
    h("p", { class: "cx-text" }, COOP_OVER_TEXT[v.over] || COOP_OVER_TEXT.done),
    h("div", { class: "cx-table" }, sum.map(x => h("div", { class: "cx-tr" + (x.id === v.me ? " me" : "") + (x.ghost ? " ghost" : "") }, h("b", null, x.name),
      h("span", null, `理智 ${x.startSan} → ${x.san}，靈感 +${x.got.insp}${x.got.injured.length ? `，${x.got.injured.length} 隻受傷` : ""}`), h("span", { class: "cx-san" }, x.ghost ? "理智歸零" : x.out === "left" ? "先走了" : "")))),
    h("div", { class: "cx-card-foot" },
      isLeader && !me.ghost && !(P && P.dark) ? btn([icon("stairs"), " 再走壹趟"], () => doAct("again"), "small") : null,
      btn("回去", () => s.m.close(), "primary")));
}
// 右邊：隊員
function sideBox(v) {
  const meId = v.me;
  return h("div", { class: "cx-mates" }, v.members.filter(m => m.out !== "left").map(m => {
    const off = m.id !== meId && offline(m.id), pct = Math.round(100 * Math.max(0, m.san) / Math.max(1, m.max || 99));
    const tags = [m.id === v.leader && v.phase === "vote" ? "領隊" : null, m.guard ? "留守" : null, m.ghost ? "幽靈" : null, m.out === "ghost" ? "回到地面了" : null, off ? "不在線" : null].filter(Boolean);
    const did = v.phase === "vote" || v.phase === "floorDone" ? v.votes && v.votes[m.id] !== undefined : v.phase === "result" ? v.acks && v.acks[m.id] : false;
    return h("div", { class: "cx-mate" + (m.id === meId ? " me" : "") + (off ? " off" : "") + (m.ghost ? " ghost" : "") },
      h("div", { class: "cx-mate-top" }, h("b", null, m.name), did ? h("i", { class: "cx-did", "aria-label": "好了" }, "✓") : null),
      tags.length ? h("div", { class: "cx-tags" }, tags.map(t => h("span", null, t))) : null,
      m.guard ? null : h("div", { class: "cx-bar", role: "img", "aria-label": `理智 ${m.san}` }, h("i", { style: { width: pct + "%" } })),
      m.guard ? null : h("div", { class: "cx-mate-n" }, `理智 ${m.san}`, m.got && m.got.insp ? `・靈感 +${m.got.insp}` : ""));
  }));
}

// ---------- 入口 ----------
async function openNew() {
  if (!canPlay()) { note("要先用挑戰模式的參觀者進館。", "bad"); return; }
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("coopStep", { act: "open" });
    if (r && r.pid) openCoop(r.pid);
  } catch (e) { snd("error"); note(e.message || "開不了隊伍。", "bad"); }
}
// 地下收藏庫的畫面最上面
ADDONS.cellarTop = () => {
  if (!UI.net || !canPlay()) return null;
  return h("div", { class: "cx-entry" }, btn([icon("users"), " 壹起下去"], openNew, "primary"), h("p", null, "找館友壹起（壹個人也可以）：壹起投票、看同壹顆骰子。全隊的理智越低，下面越危險。"));
};
FRIEND_ACTIONS.push({ id: "cellar", label: "邀請壹起打地下收藏庫", show: p => p.status !== "offline" && canPlay(), run: p => sendInvite(p, "cellar") });
PARTY_HOOKS.cellar = {
  open: pid => openCoop(pid),
  isOpen: pid => !!(S && S.pid === pid),
  say: m => {
    if (m.joined) note(`${m.joined} 加入了隊伍。`, "good");
    if (m.left) note(m.why === "offline" ? `${m.left} 斷線了，離開了隊伍。` : m.why === "afk" ? `${m.left} 太久沒有動，離開了隊伍。` : `${m.left} 離開了隊伍。`);
  },
};
// 進館時：還在隊伍裡就接回去（重新整理過、斷線回來）。回傳有沒有接回去
PANELS.coopResume = async () => {
  if (S || !UI.net || !canPlay() || !NET.me) return false;
  const pid = await NET.read(`partyOf/${NET.me.id}`);
  if (typeof pid !== "string" || !pid) return false;
  const p = fixParty(await NET.read(`parties/${pid}`));
  if (!p || p.kind !== "cellar" || !p.members[NET.me.id]) return false;
  openCoop(pid, { resumed: true });
  return true;
};
NET.on("message", m => {
  if (!m || !S || m.t !== "coop_out" || m.pid !== S.pid) return;
  S.out = m.why || "afk";
  draw();
});
NET.on("logout", () => { if (S) { const s = S; S = null; s.offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } }); clearInterval(s.clock); Object.values(s.timers).forEach(x => clearTimeout(x.t)); document.body.classList.remove("coop-on"); UI.saveHold = false; } });
