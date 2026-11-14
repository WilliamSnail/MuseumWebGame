// ================================================================
//  Hamachi 賭場：館友同桌的畫面（第二階段，決定 0040；規則 shared/casino_table.js，伺服器 functions/casino_table.js）
//  這個檔只畫「伺服器給我的樣子」：1–4 人同壹張桌、同壹副牌、同壹個莊家，各下各的注，輪流要牌，有時間限制。
//  - 入口：賭場「牌桌」頁籤下面（ADDONS.casinoTable）、館友小卡「邀請壹起玩 21 點」（FRIEND_ACTIONS）。邀請卡用 ui_party.js 那壹套（PARTY_HOOKS.table 接回來）。
//  - 木框開著：聽 parties/{pid}（誰在桌上）、casinoView/{pid}/{我}（我看到的樣子）、casinoChat/{pid}（桌上說的話）。
//  - 時間到了，畫面叫 tick（每個人錯開壹點時間，伺服器自己看是不是真的到了）；斷線的人超過 PARTY.offlineWaitMs，請伺服器把他移出隊伍（他那壹手當停牌）。
//  - 關掉框＝離桌（離開隊伍）。重新整理、斷線回來：進館時 PANELS.casinoResume 接回去。
//  別人說的話、暱稱壹律當純文字（textContent）。理智低時，牌會看錯（只有自己，結算翻回真的）。
// ================================================================
import { NUM } from "../../shared/config.js";
import { CAS_TEXT } from "../../shared/casino_text.js";
import { casCardName, casFill, casNum } from "../../shared/casino.js";
import { CAS_QUICK } from "../../shared/casino_table.js";
import { nowMs } from "../../shared/logic.js";
import { PARTY, cleanSay, fixParty, partyMembers } from "../../shared/party.js";
import { NET } from "./net_firebase.js";
import { ADDONS, FRIEND_ACTIONS, P, PANELS, UI, btn, closeOnOutside, h, icon, miniLayer, netRoom, note, setChips, snd, titleOfId, titleTag } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { PARTY_HOOKS, sendInvite } from "./ui_party.js";
import { casinoState, handEl } from "./ui_casino.js";
import { CAS_WK } from "./ui_casino_week.js";

const hashOf = s => [...String(s)].reduce((n, c) => (n * 31 + c.codePointAt(0)) >>> 0, 7);
const BUBBLE_MS = 6000; // 座位頭上的泡泡留幾毫秒
let T = null; // { bub, pid, m, view, chips, party, chat, offs, timers, clock, busy, tickKey, said, bet, gone, lastRound }

async function call(act, data) { return NET.call("casinoTable", Object.assign({ pid: T.pid, act }, data || {})); }
async function doAct(act, data) {
  const s = T;
  if (!s || s.busy) return null;
  s.busy = true; draw();
  let r = null;
  try {
    r = await call(act, data);
    if (T !== s) return r;
    if (r.view) onView(r.view);
    if (!r.ok) { snd("error"); if (r.gag) s.gag = r.reason; else note(r.reason || "沒辦法。", "bad"); } else s.gag = null;
  } catch (e) { snd("error"); note((e && e.message) || "沒辦法。", "bad"); }
  if (T === s) { s.busy = false; draw(); }
  return r;
}

// ---------- 開、關 ----------
export function openTable(pid) {
  if (T && T.pid === pid) { if (!T.m.layer.isConnected) mount(); return; }
  if (T) endTable(false);
  T = { who: null, bub: {}, bubFrom: Date.now() - 4000, pid, m: null, view: null, chips: null, party: null, chat: [], offs: [], timers: {}, clock: null, busy: false, tickKey: "", gone: false, bet: "10000", gag: null, noted: "" };
  mount();
  const s = T, meId = NET.me && NET.me.id;
  s.offs.push(NET.watch(`parties/${pid}`, v => {
    if (T !== s) return;
    if (v == null) { if (s.party) s.gone = true; s.party = null; } else s.party = fixParty(v);
    watchOff(); draw();
  }));
  s.offs.push(NET.watch(`casinoView/${pid}/${meId}`, v => { if (T === s && v && v.j) onView(JSON.parse(v.j), true); }));
  s.offs.push(NET.watch(`casinoChat/${pid}`, v => { if (T === s) { s.chat = v ? Object.values(v).sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-NUM.casino.chatKeep) : []; bubbles(s); drawChat(); } }));
  s.offs.push(NET.on("roster", () => { if (T === s) { watchOff(); draw(); } }));
  s.clock = setInterval(tickClock, 250);
  draw();
  snd("flip");
  refreshWho(s);
  // 入座（被邀請、重新整理、斷線回來都是這個）
  call("join").then(r => { if (T === s && r.view) onView(r.view); }).catch(e => { if (T === s) note((e && e.message) || "入座不了。", "bad"); });
}
function mount() {
  T.m = overlay("nb-casino nb-table", "Hamachi 賭場・同桌", "Hamachi 賭場同桌", "dice", (...a) => { NET.where(netRoom(UI.screen)); return onFrameClose(...a); });
  NET.where("casino");
}
function onFrameClose() { if (T) endTable(true); }
async function endTable(leave) {
  const s = T;
  if (!s) return;
  T = null;
  s.offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } });
  clearInterval(s.clock); clearTimeout(s.whoT);
  Object.values(s.timers).forEach(x => clearTimeout(x.t));
  if (s.m && s.m.layer.isConnected) s.m.close();
  if (leave && !s.gone) { try { await NET.call("partyAction", { pid: s.pid, act: "leave" }); } catch (e) { /* 隊伍已經不在了 */ } }
}
// 我看到的樣子有更新（伺服器版本比較大的才算；自己叫的回覆不帶 chips，保留上一次的）
function onView(v, fromWatch) {
  const s = T;
  if (!s) return;
  if (s.view && v.seq < s.view.seq && v.round <= s.view.round) return;
  if (typeof v.chips === "number") { s.chips = v.chips; setChips(v.chips); }
  s.view = v;
  wkNotes(s, v);
  if (v.phase === "result" && s.noted !== v.round + ":" + v.pid) { s.noted = v.round + ":" + v.pid; resultNotes(v); }
  draw();
}
// 每週收藏（決定 0042）：伺服器在結算的那個交易裡發的，跟著給我的樣子一起來（wkNew.k 是第幾版，同一版只說一次）
function wkNotes(s, v) {
  const w = v.wkNew;
  if (!w || !Array.isArray(w.items) || s.wkSeen === w.k) return;
  s.wkSeen = w.k;
  CAS_WK.at = 0; // 賭場和劇情面板的進度過期，下次打開重問伺服器
  w.items.forEach(it => { note(`收藏品「${it.name}」到手了！到賭場的「本週收藏」頁籤看。`, "good"); snd("unlock"); });
  if (w.done) { note("這週的賭場收藏集滿了！到「本週收藏」領週章、讀集滿的故事。", "good"); snd("unlock"); }
}
function resultNotes(v) {
  const me = v.seats.find(x => x.you);
  if (!me || !me.out) return;
  snd(me.out.kind === "lose" ? "error" : me.out.kind === "push" ? "click" : "coin");
  for (const a of me.ach || []) { note(`成就「${a.name}」！在賭場的「成就」頁籤看、可以當稱號。`, "good"); snd("unlock"); }
  if (me.ticket) note(CAS_TEXT.packWon, "good");
}

// ---------- 時間：倒數、時間到叫 tick、斷線的隊友 ----------
const secLeft = d => Math.max(0, Math.ceil((d - nowMs()) / 1000));
function tickClock() {
  const s = T;
  if (!s || !s.view) return;
  const el = s.m.layer.querySelector(".cas-count");
  if (el) el.textContent = countText(s.view);
  const key = `${s.view.deadline}:${s.view.seq}`;
  if (nowMs() >= s.view.deadline && s.tickKey !== key && !s.busy) {
    s.tickKey = key;
    // 每個人錯開 0–1.5 秒：誰先叫都行，伺服器自己看是不是真的到了
    setTimeout(() => { if (T === s && s.view && `${s.view.deadline}:${s.view.seq}` === key) call("tick").then(r => { if (T === s && r.view) onView(r.view); }).catch(() => {}); }, hashOf(NET.me ? NET.me.id : "x") % 1500);
    setTimeout(() => { if (T === s && s.tickKey === key) s.tickKey = ""; }, 4000); // 沒變就再叫一次
  }
}
function countText(v) {
  const n = secLeft(v.deadline);
  if (v.phase === "bet") return `下注時間：還有 ${n} 秒`;
  if (v.phase === "play") { const who = v.seats.find(x => x.uid === v.turn); return who ? `${who.you ? "輪到你" : `輪到 ${who.nick}`}：還有 ${n} 秒` : ""; }
  return `下壹局：還有 ${n} 秒`;
}
const offlineId = id => { if (!NET.roster.length) return false; const s = NET.roster.find(x => x.id === id); return !s || s.status === "offline"; };
function watchOff() {
  const s = T, meId = NET.me && NET.me.id;
  if (!s) return;
  const ids = s.party && !s.gone ? partyMembers(s.party).map(x => x.id).filter(id => id !== meId) : [];
  for (const id of Object.keys(s.timers)) if (!ids.includes(id) || !offlineId(id)) { clearTimeout(s.timers[id].t); delete s.timers[id]; }
  for (const id of ids) if (offlineId(id) && !s.timers[id]) s.timers[id] = { t: setTimeout(() => askPrune(id), PARTY.offlineWaitMs), tries: 0 };
}
async function askPrune(id) {
  const s = T, x = s && s.timers[id];
  if (!x) return;
  x.tries++;
  let r = null;
  try { r = await NET.call("partyAction", { pid: s.pid, act: "prune", uid: id }); } catch (e) { /* 隊伍不在了 */ }
  if (T === s && s.timers[id] === x && !(r && r.pruned) && x.tries < 3 && offlineId(id)) x.t = setTimeout(() => askPrune(id), PARTY.offlineWaitMs);
}

// 現在邀得動幾位（伺服器 npcWho 的名單）。失敗就當不知道（按鈕照常能按，按下去由伺服器說原因）
async function refreshWho(s) {
  clearTimeout(s.whoT);
  try { const r = await NET.call("casinoTable", { act: "npcWho", pid: s.pid }); if (T === s && r && r.ok && Array.isArray(r.who)) { s.who = r.who.length; draw(); } } catch (e) { /* 當不知道 */ }
  if (T === s) s.whoT = setTimeout(() => refreshWho(s), 60000);
}
// 邀旅客的大按鈕：金色主按鈕，圖示＋字＋可邀幾位；沒有人能邀就變灰、寫原因
function inviteBtn(s, v) {
  const none = s.who === 0, full = !!v.full, guests = v.seats.filter(x => x.npc).length >= 2;
  const off = none || full || guests;
  const why = full ? "這桌坐滿了" : guests ? "這桌的客人夠多了（最多 2 位）" : none ? "現在館裡沒有旅客能邀（他們在館裡的時間有限，晚點再來看看）" : "";
  return h("div", { class: "cas-inv" },
    btn([h("span", { class: "cas-inv-ic", "aria-hidden": "true" }, "♠"), " 邀旅客一起玩", s.who ? h("i", { class: "cas-inv-n" }, " " + s.who + " 位可邀") : null], () => openNpcInvite(s.pid), "primary big cas-inv-b", { disabled: off ? true : null, title: why || "邀館裡的旅客、委託人來這桌同桌打 21 點" }),
    why ? h("small", { class: "cas-inv-why" }, why) : null);
}
// 新來的話（比開桌前幾秒新、比上次記的新）在座位頭上冒泡泡，BUBBLE_MS 後收起來
function bubbles(s) {
  let fresh = false;
  for (const x of s.chat) {
    const at = Number(x.at) || 0, key = String(x.by || "");
    if (!key || at <= s.bubFrom || (s.bub[key] && s.bub[key].at >= at)) continue;
    s.bub[key] = { text: String(x.text || ""), at, until: Date.now() + BUBBLE_MS, npc: !!x.npc };
    fresh = true;
    setTimeout(() => { if (T === s && s.bub[key] && s.bub[key].until <= Date.now() + 50) { delete s.bub[key]; draw(); } }, BUBBLE_MS + 100);
  }
  if (fresh) draw();
}
// ---------- 畫面 ----------
function seatCard(s, v) {
  const phaseBet = v.phase === "bet";
  const state = s.gone ? "離桌了，這手當停牌" : s.out ? "" : s.st === "idle" ? (phaseBet ? "還沒下注" : "旁觀") : s.st === "bet" ? "下好注了" : s.st === "play" ? (v.turn === s.uid ? "要牌中……" : "等輪到") : s.st === "done" ? "爆了" : s.timedOut ? "時間到，停牌" : "停牌";
  const kinds = { win: "贏了", blackjack: "黑傑克！", charlie: "五張過關！", push: "平手", lose: "輸了" };
  const bub = T && T.bub && T.bub[s.uid];
  return h("div", { class: "cas-seat tb" + (s.you ? " me" : "") + (s.npc ? " npc" : "") + (v.turn === s.uid ? " turn" : "") + (s.gone ? " gone" : "") },
    bub && bub.until > Date.now() ? h("p", { class: "cas-bub" + (s.npc ? " npc" : ""), role: "status" }, String(bub.text)) : null,
    h("div", { class: "cas-who" }, h("b", null, s.nick, s.you ? "（你）" : ""), s.npc ? h("i", { class: "cas-npc-tag", title: "館內的旅客，不是真人" }, "NPC") : null, titleTag(titleOfId(s.uid), "cas-ttl"), s.bet ? h("small", null, `注 ${casNum(s.bet)}`) : null, s.cards.length ? h("small", null, `點數 ${s.total}`) : null),
    s.cards.length ? handEl(s.cards, { warped: s.warped, label: `${s.nick} 的牌` }) : null,
    s.out ? h("p", { class: "cas-tb-out k-" + s.out.kind }, kinds[s.out.kind] || "", " ", s.out.kind === "lose" ? `輸 ${casNum(s.bet)}` : s.out.kind === "push" ? `退回 ${casNum(s.bet)}` : `贏 ${casNum(s.out.net)}`) : state ? h("small", { class: "cas-tb-st" }, state) : null);
}
function draw() {
  const s = T;
  if (!s || !s.m.layer.isConnected) return;
  const v = s.view;
  s.m.setTop([s.chips != null ? h("span", { class: "cas-chips" }, icon("dice"), " 籌碼 ", h("b", null, casNum(s.chips))) : null, btn("離桌", () => s.m.close(), "small")]);
  if (!v) { s.m.surface.replaceChildren(h("p", { class: "nb-empty" }, s.gone ? "這桌收了。" : "正在入座……")); return; }
  const me = v.seats.find(x => x.you);
  const mem = s.party ? partyMembers(s.party) : [];
  const old = s.m.surface.querySelector(".cas-body"), keep = old ? old.scrollTop : 0;
  const parts = [];
  parts.push(h("div", { class: "cas-tb-head" }, h("span", { class: "cas-count", role: "timer" }, countText(v)), h("small", null, `第 ${v.round + 1} 局・${v.seats.length}／${NUM.casino.seats} 人`)));
  parts.push(h("div", { class: "cas-felt" },
    h("div", { class: "cas-seat dealer" }, h("div", { class: "cas-who" }, h("b", null, CAS_TEXT.dealer), v.dealer.total != null ? h("small", null, `點數 ${v.dealer.total}`) : v.dealer.up != null ? h("small", null, `明牌 ${v.dealer.up}`) : null),
      v.dealer.cards.length ? handEl(v.dealer.cards, { label: "莊家的牌" }) : h("p", { class: "cas-empty" }, "下注，荷官就發牌。")),
    h("div", { class: "cas-tb-seats" }, v.seats.map(x => seatCard(x, v)), !v.full && v.seats.filter(x => x.npc).length < 2 && s.who !== 0 ? h("button", { type: "button", class: "cas-seat tb cas-empty-seat", onClick: () => openNpcInvite(s.pid), "aria-label": "空位：邀旅客一起玩" }, h("b", null, "＋ 邀旅客"), h("small", null, s.who ? `${s.who} 位可邀` : "空位")) : null)),
    inviteBtn(s, v));
  if (v.phase === "result" && me && me.out) parts.push(h("p", { class: "cas-dealer-line" }, h("b", null, CAS_TEXT.dealer + "："), dealerLine(me.out)));
  // 我能做的事
  if (v.phase === "bet" && me && !me.bet) parts.push(betBox(s));
  else if (v.phase === "bet" && me) parts.push(h("p", { class: "cas-hint" }, "下好注了，等其他人（時間到就發牌）。"));
  else if (v.phase === "play" && me && v.turn === me.uid && me.st === "play") parts.push(h("div", { class: "cas-acts" }, h("p", { class: "cas-ask" }, CAS_TEXT.askHit),
    btn("要（加牌）", () => doAct("hit", { seq: v.seq }), "primary", { disabled: s.busy ? true : null }), btn("不要", () => doAct("stand", { seq: v.seq }), "", { disabled: s.busy ? true : null })));
  else if (v.phase === "play" && me && !me.bet) parts.push(h("p", { class: "cas-hint" }, "這局你沒下注，旁觀。下一局再下。"));
  if (me && me.warped) parts.push(h("p", { class: "cas-warn", role: "note" }, "眼睛有點花……牌好像不太對勁。"));
  parts.push(h("div", { class: "cas-tb-chat" }, h("h3", null, "桌上說的話"), h("div", { class: "cas-say cas-chat", role: "log", "aria-live": "polite", "aria-label": "桌上說的話" }), chatForm(s)));
  // 邀請在線的館友（不開館友名單：開別的框會把這個框關掉＝離桌）
  const inTable = new Set(mem.map(x => x.id));
  const online = NET.roster.filter(x => !x.me && x.status !== "offline" && !inTable.has(x.id));
  parts.push(h("div", { class: "cas-invite" }, h("small", { class: "cas-hint" }, mem.length ? `桌上：${mem.map(x => x.nick).join("、")}` : ""),
    online.length && !v.full ? h("div", { class: "cas-quick" }, h("small", { class: "cas-hint" }, "邀請："), online.map(x => btn([icon("users"), " ", x.nick], () => sendInvite(x, "table"), "small ghost"))) : h("small", { class: "cas-hint" }, v.full ? "這桌坐滿了。" : "現在沒有別的館友在線。")));
  parts.push(h("p", { class: "cas-rules" }, "同桌：壹副牌、壹個莊家，照入座的順序輪流；時間到、斷線都當停牌；有人離桌不影響別人。"));
  s.m.surface.replaceChildren(h("div", { class: "cas-body", dataset: { tab: "table" } }, parts), h("p", { class: "cas-foot" }, CAS_TEXT.series));
  const b = s.m.surface.querySelector(".cas-body"); if (b) b.scrollTop = keep;
  drawChat();
}
function dealerLine(o) {
  if (o.why === "bust") return CAS_TEXT.bust;
  if (o.kind === "charlie") return CAS_TEXT.charlie.join("，");
  if (o.why === "dealerBust") return CAS_TEXT.dealerBust.join("，");
  if (o.why === "tie21") return CAS_TEXT.push + "，" + CAS_TEXT.push21;
  if (o.kind === "push") return CAS_TEXT.push;
  return o.kind === "lose" ? CAS_TEXT.lose : CAS_TEXT.win;
}
function betBox(s) {
  const input = h("input", { class: "t-input cas-bet", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "24", "aria-label": "下注的籌碼", placeholder: "輸入下注金額" });
  input.value = s.bet;
  input.addEventListener("input", () => { s.bet = input.value; });
  const go = () => { s.bet = input.value; doAct("bet", { text: input.value }); };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  return h("div", { class: "cas-betbox" }, h("p", { class: "cas-ask" }, "輸入下注金額："),
    h("div", { class: "cas-betrow" }, input, btn("下注", go, "primary", { disabled: s.busy ? true : null })),
    h("div", { class: "cas-quick" }, [1000, 10000, 100000, 1000000].filter(n => s.chips == null || n <= s.chips).map(n => btn(casNum(n), () => { input.value = String(n); s.bet = String(n); }, "small ghost")),
      btn("全下", () => { const n = Math.min(s.chips || 0, NUM.casino.maxBet); input.value = String(n); s.bet = String(n); }, "small ghost")),
    s.gag ? h("p", { class: "cas-warn", role: "alert" }, h("b", null, CAS_TEXT.dealer + "："), s.gag) : null);
}
function drawChat() {
  const s = T;
  if (!s) return;
  const box = s.m.layer.querySelector(".cas-chat");
  if (!box) return;
  box.replaceChildren(...(s.chat.length ? s.chat.map(x => h("p", null, h("b", null, String(x.name || "館友")), "：", String(x.text || ""))) : [h("p", null, "還沒有人說話。")]));
  box.scrollTop = box.scrollHeight;
}
function chatForm(s) {
  const input = h("input", { class: "t-input cas-chat-in", type: "text", maxlength: String(PARTY.sayMax * 2), "aria-label": "跟同桌的人說話", placeholder: "說句話（純文字）" });
  const send = async text => {
    const t = cleanSay(text);
    if (!t) return;
    try { const r = await call("say", { text: t }); if (r && r.ok === false) note(r.reason || "說慢壹點", "bad"); else input.value = ""; } catch (e) { note((e && e.message) || "說不出去。", "bad"); }
  };
  const form = h("form", { class: "cas-chat-form" }, input, h("button", { type: "submit", class: "btn small" }, "說"));
  form.addEventListener("submit", e => { e.preventDefault(); send(input.value); });
  return h("div", null, h("div", { class: "cas-quick" }, CAS_QUICK.map((q, i) => btn(q, async () => { try { const r = await call("say", { quick: i }); if (r && r.ok === false) note(r.reason, "bad"); } catch (e) { note((e && e.message) || "說不出去。", "bad"); } }, "small ghost"))), form);
}

// ---------- 入口 ----------
async function openNew() {
  if (!UI.net || !NET.loggedIn) { note("要登入才能同桌。", "bad"); return; }
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("casinoTable", { act: "open" });
    if (r && r.pid) openTable(r.pid);
  } catch (e) { snd("error"); note((e && e.message) || "開不了桌。", "bad"); }
}
ADDONS.casinoTable = () => {
  const cs = casinoState(), tp = cs && cs.w && cs.w.tablePid;
  return h("div", { class: "cas-sec" }, h("h3", null, "跟館友同桌"),
    h("p", { class: "cas-note" }, "1 到 4 人同壹張桌、同壹副牌、同壹個莊家：各下各的注，輪流要牌，每次有時間限制；斷線、超時當停牌；有人離桌不影響別人。壹個人也可以開。"),
    h("div", { class: "cas-acts" }, tp ? btn("回到牌桌", () => openTable(tp), "primary") : btn([icon("users"), " 開壹桌"], openNew, "primary"),
      h("small", { class: "cas-hint" }, "開好桌之後，在「館友」名單按「邀請同桌」。")));
};
FRIEND_ACTIONS.push({ id: "table", label: "邀請同桌打 21 點", show: p => p.status !== "offline" && !!UI.net, run: p => sendInvite(p, "table") });
PARTY_HOOKS.table = {
  open: pid => openTable(pid),
  isOpen: pid => !!(T && T.pid === pid),
  say: m => {
    if (m.joined) note(`${m.joined} 坐下來了。`, "good");
    if (m.left) note(m.why === "offline" ? `${m.left} 斷線了，離桌了。` : `${m.left} 離桌了。`);
  },
};
// 進館時：還在這一桌的隊伍裡就接回去（重新整理過、斷線回來）。回傳有沒有接回去
PANELS.casinoResume = async () => {
  if (T || !UI.net || !NET.me) return false;
  const pid = await NET.read(`partyOf/${NET.me.id}`);
  if (typeof pid !== "string" || !pid) return false;
  const p = fixParty(await NET.read(`parties/${pid}`));
  if (!p || p.kind !== "table" || !p.members[NET.me.id]) return false;
  openTable(pid);
  return true;
};
NET.on("logout", () => { if (T) { const s = T; T = null; s.offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } }); clearInterval(s.clock); Object.values(s.timers).forEach(x => clearTimeout(x.t)); } });

// ---------- 邀館內的旅客、委託人一起玩（翊文 11-14；伺服器 PR 465，決定 0080）----------
// casinoTable：open（開桌拿 pid）→ npcWho（現在邀得動誰：沒在名單裡的不亮按鈕）→ npcInvite（答應、拒絕都有他說的話，reason 直接顯示）。
// 答應了就坐進這桌（一個人也能開＝私人桌；有館友在桌上＝多人桌）。不在畫面自己擲骰、不猜他答不答應。
async function tablePid() {
  if (T) return T.pid;
  const cs = casinoState(), tp = cs && cs.w && cs.w.tablePid;
  if (tp) return tp;
  await NET.flush().catch(() => {});
  const r = await NET.call("casinoTable", { act: "open" });
  if (!r || !r.pid) throw new Error((r && r.reason) || "開不了桌。");
  return r.pid;
}
export async function openNpcInvite(pidGiven) {
  if (!UI.net || !NET.loggedIn) { note("要登入才能邀請。", "bad"); return; }
  const m = miniLayer("邀旅客一起玩 21 點", "在館裡的旅客和委託人，可以邀他來賭場同桌。他答不答應，要看他自己。");
  m.card.classList.add("cas-npcinv");
  m.layer.classList.add("sp-top"); // 從牌桌裡按「邀旅客一起玩」時，牌桌（z 8800）會蓋住預設的小視窗（z 80）
  closeOnOutside(m);
  let pid = pidGiven || null, who = null, said = null, busy = null, failed = "";
  const load = async () => {
    try {
      if (!pid) pid = await tablePid();
      let r = await NET.call("casinoTable", { act: "npcWho", pid });
      if (!r || !r.ok) { pid = null; pid = await tablePid(); r = await NET.call("casinoTable", { act: "npcWho", pid }); } // 記著的桌子已經收了：重新開一桌
      who = r && r.ok && Array.isArray(r.who) ? r.who : [];
      if (!r || !r.ok) failed = (r && r.reason) || "現在問不到。";
    } catch (e) { who = []; failed = (e && e.message) || "現在問不到。"; }
    draw();
  };
  const invite = async x => {
    if (busy) return;
    busy = x.id; draw();
    try {
      const r = await NET.call("casinoTable", { act: "npcInvite", pid, npc: x.id });
      if (r && r.ok && r.invite) {
        said = { name: r.invite.name || x.name, line: r.invite.line || "", ok: !!r.invite.accepted };
        if (r.invite.accepted) { snd("coin"); busy = null; m.close(); openTable(pid); if (T && T.pid === pid) refreshWho(T); note(`${said.name}：${said.line}`, "good"); return; }
        snd("error");
        who = who.filter(w => w.id !== x.id); // 剛拒絕：30 分鐘內不能再邀
      } else { said = { name: x.name, line: (r && r.reason) || "邀不了。", ok: false, reason: true }; snd("error"); }
    } catch (e) { said = { name: x.name, line: (e && e.message) || "邀不了。", ok: false, reason: true }; snd("error"); }
    busy = null;
    if (m.layer.isConnected) draw();
  };
  const draw = () => {
    if (!m.layer.isConnected) return;
    m.card.querySelectorAll(".cas-ni").forEach(e => e.remove());
    m.card.append(
      said ? h("div", { class: "cas-ni cas-ni-say" + (said.ok ? " ok" : "") }, h("b", null, said.reason ? "沒邀成" : said.name + (said.ok ? "答應了" : "拒絕了")), h("p", { class: "cas-bub npc" }, said.reason ? said.line : `${said.name}：${said.line}`)) : null,
      who === null ? h("p", { class: "cas-ni cas-ni-empty" }, "問問看誰在館裡……")
        : who.length ? h("ul", { class: "cas-ni cas-ni-list" }, who.map(x => h("li", null, h("span", null, x.name), btn(busy === x.id ? "邀請中……" : "邀他去賭場", () => invite(x), "small primary", { disabled: busy ? true : null }))))
        : h("p", { class: "cas-ni cas-ni-empty" }, failed || "現在沒有人邀得動：旅客在館裡的時間有限，今天答應過 3 次或額度用完的也不會來。晚點再看看。"),
      h("div", { class: "cas-ni cas-ni-acts" }, btn("關起來", () => m.close(), "ghost")));
  };
  draw();
  load();
}
ADDONS.npcInvite = openNpcInvite;
