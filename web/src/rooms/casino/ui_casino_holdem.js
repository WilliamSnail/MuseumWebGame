// ================================================================
//  德州撲克 2 人桌的畫面（決定 0150，翊文 11-21；規則 shared/casino/holdem.js、holdem_eval.js；伺服器 functions/casino/holdem.js 的 casinoHoldem）
//  （11-21 晚改成 2～6 人桌：座位圈、SB／BB、邊池、多位贏家、這手先不玩。）
//  館友對館友：隊伍 kind 是 "holdem"（邀請走現有的邀請）。這個檔只畫「伺服器給我的樣子」：牌型、輸贏、抽水、邊界都在伺服器，畫面不算。
//  流程：沒有桌子＝開桌（選盲注級距、買入）→ 邀館友 → 兩人坐下就自動開第壹手 → 輪流（蓋牌／過牌／跟注／加注／全下，每步 30 秒）→ 攤牌看結果 → 下壹手。
//  畫面用 RTDB holdemView/{pid}/{我}（每個動作的回答裡也有 view）；到了 view.deadline 叫壹次 tick，伺服器照時間自動過牌或蓋牌。
//  登記成賭場牌桌頁籤的遊戲（ADDONS.casinoGame）；PARTY_HOOKS.holdem 讓被邀請的人接受後直接進這張桌。動畫只有壹次性的；沒有無限循環。
// ================================================================
import { casNum } from "../../../../shared/casino/core.js";
import { HOLDEM_HAND_NAMES } from "../../../../shared/casino/holdem_eval.js";
import { NUM } from "../../../../shared/core/config.js";
import { NET } from "../../core/net_firebase.js";
import { ADDONS, PANELS, btn, h, note, snd } from "../../core/ui_core.js";
import { tipOn } from "../../core/ui_tip.js";
import { PARTY_HOOKS, sendInvite } from "../../panels/ui_party.js";
import { cardEl, casinoRefresh, casinoState } from "./ui_casino.js";
import { travelerHeard } from "../../panels/ui_traveler_talk.js";
import { gameIntro, howTo } from "./ui_casino_felt.js";
import { openHoldemNpc } from "./ui_casino_holdem_npc.js";

const C = () => NUM.casino.holdem;
const bbOf = lv => C().levels[lv][1];
const buyRange = lv => { const bb = bbOf(lv); return [bb * C().buyMinBB, Math.min(C().buyMax, bb * C().buyMaxBB)]; };

// 這個賭場階段（casinoState 的 S）的狀態
let H = null;
const state = () => {
  const S = casinoState();
  if (!H || H.S !== S) { if (H) stop(H); H = { S, pid: null, view: null, busy: false, lv: 0, buy: "", offs: [], raise: 0, tickFor: null, clock: null, joining: false, resumed: false, said: "" }; }
  return H;
};
function stop(st) { st.offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } }); st.offs = []; clearInterval(st.clock); }
const redraw = () => casinoRefresh();

// 呼叫伺服器：成功回 view 就換；gone（桌子收了）回到開桌畫面
async function call(st, data) {
  if (st.busy) return null;
  st.busy = true; redraw();
  let r = null;
  try {
    await NET.flush().catch(() => {});
    r = await NET.call("casinoHoldem", data);
    if (r && r.gone) { st.pid = null; st.view = null; st.said = r.reason || "那桌已經收了。"; } else if (r && r.ok === false) { snd("error"); note(r.reason || "沒辦法。", "bad"); } else if (r) { if (r.pid) { st.pid = r.pid; watch(st); } if (r.view) take(st, r.view); }
  } catch (e) { snd("error"); note((e && e.message) || "沒辦法。", "bad"); }
  st.busy = false; redraw();
  return r;
}
function take(st, v) {
  const prev = st.view, sitting = v.seats.find(s => s.me);
  if (st.rebuy && sitting && sitting.stack > 0) st.rebuy = false; // 再買入坐下了：回到牌桌畫面
  if (sitting) st.said = "";
  if (prev && prev.seats.some(s => s.me) && !sitting && !st.leaving) { st.said = "連續兩次沒動作，先請你離座，籌碼回錢包了。想玩再坐下。"; note(st.said); } // 被請離座要說壹句（④）
  st.view = v; st.viewAt = Date.now();
  if (st.pid !== v.pid) st.pid = v.pid;
  if (!prev || prev.hand !== v.hand || prev.street !== v.street) { st.raise = 0; st.raiseOpen = false; }
  if (v.res && (!prev || !prev.res || prev.res.hand !== v.res.hand)) { const me = v.seats.find(s => s.me), n = v.res.net && me ? v.res.net[me.uid] : 0; snd(n > 0 ? "coin" : n < 0 ? "error" : "flip"); }
  else if (!prev || prev.toAct !== v.toAct || prev.street !== v.street) snd("flip");
  if (v.phase === "wait" && st.view && !v.seats.length) st.pid = null;
  for (const x of v.talk || []) { const mt = /^npc:([vc]-[a-z0-9-]+)/.exec(String(x.uid || "")); if (mt) travelerHeard(mt[1], x.text, "casino"); } // 旅客說的話記進交談紀錄（11-22）
}
function watch(st) {
  stop(st);
  if (!st.pid || !NET.me) return;
  const pid = st.pid;
  st.offs.push(NET.watch(`holdemView/${pid}/${NET.me.id}`, v => { if (H === st && st.pid === pid && v && v.j) { take(st, JSON.parse(v.j)); redraw(); } }));
  st.clock = setInterval(() => { // 倒數的字、時間到叫壹次 tick
    if (H !== st || !st.view) return;
    const el = document.querySelector(".hd-clock");
    const v = st.view, left = Math.max(0, Math.ceil((v.deadline - (v.now + (Date.now() - (st.viewAt || Date.now())))) / 1000));
    if (el) el.textContent = v.deadline ? `${left} 秒` : "";
    if (v.deadline && left <= 0 && st.tickFor !== v.deadline) { st.tickFor = v.deadline; call2(st, { act: "tick", pid: st.pid }); }
  }, 500);
}
// tick 不顯示忙碌（伺服器自己會推新的 view）
async function call2(st, data) { try { const r = await NET.call("casinoHoldem", data); if (r && r.view) { take(st, r.view); redraw(); } else if (r && r.gone) { st.pid = null; st.view = null; redraw(); } } catch (e) { /* 下次再試 */ } }
// 重新整理、斷線回來：還在德州隊伍裡就接回去
async function resume(st) {
  if (st.resumed || !NET.me) return;
  st.resumed = true;
  try {
    const pid = await NET.read(`partyOf/${NET.me.id}`), p = typeof pid === "string" && pid ? await NET.read(`parties/${pid}`) : null;
    if (p && p.kind === "holdem") { st.pid = pid; watch(st); const r = await NET.call("casinoHoldem", { act: "buyin", pid }); if (r && r.view) take(st, r.view); else if (r && r.gone) st.pid = null; redraw(); }
  } catch (e) { /* 沒有就是沒有 */ }
}

// ---------- 開桌／入座 ----------
function setupPane(st, join) {
  const lv = join && st.view ? st.view.level.lv : st.lv, [mn, mx] = join && st.view ? [st.view.buy.min, st.view.buy.max] : buyRange(lv), chips = (casinoState().w || {}).chips || 0;
  if (!st.buy) st.buy = String(mn);
  const input = h("input", { class: "t-input bj-amt hd-buy", type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": "買入的籌碼", placeholder: "買入" });
  input.value = st.buy;
  input.addEventListener("input", () => { st.buy = input.value; });
  const num = () => Math.floor(Number(String(input.value).replace(/[,，\s]/g, ""))) || 0;
  const set = n => { input.value = String(n); st.buy = input.value; };
  const go = () => { st.buy = input.value; call(st, join ? { act: "buyin", pid: st.pid, buy: num() } : { act: "open", lv, buy: num() }); };
  const levels = C().levels.map((l, i) => {
    const b = h("button", { type: "button", class: "sb-opt" + (i === lv ? " on" : ""), disabled: join || st.busy ? true : null, "aria-pressed": String(i === lv) }, h("b", null, i === 0 ? "入門桌・" : "", `盲注 ${casNum(l[0])}／${casNum(l[1])}`), h("small", null, `買入 ${casNum(buyRange(i)[0])}～${casNum(buyRange(i)[1])}`));
    tipOn(b, { title: "盲注", what: `小盲 ${casNum(l[0])}、大盲 ${casNum(l[1])}：每手開始前兩個人先放的底注。`, how: [`買入最少 ${C().buyMinBB} 個大盲 = ${casNum(buyRange(i)[0])}`, `最多 ${C().buyMaxBB} 個大盲（上限 ${casNum(C().buyMax)}）`] });
    b.addEventListener("click", () => { st.lv = i; st.buy = ""; redraw(); });
    return b;
  });
  return h("div", { class: "hd-setup" },
    join ? h("p", { class: "hd-say" }, st.said || "選買入的籌碼，坐下就加入這桌（第壹次被邀請、離座後想回來都是這裡）。") : h("p", { class: "hd-say" }, st.said || "選盲注級距和買入，開壹桌，再邀館友。"),
    join ? null : h("div", { class: "sb-sec" }, h("h4", null, "盲注"), h("div", { class: "sb-opts" }, levels)),
    h("div", { class: "sb-sec" }, h("h4", null, "買入（錢從錢包搬到桌上，離桌搬回來）"),
      tipOn(h("div", { class: "bj-bet" }, input, btn("最少", () => set(mn), "small ghost"), btn("最多", () => set(Math.min(mx, chips)), "small ghost"), btn(join ? "坐下" : "開桌", go, "primary big bj-deal", { disabled: st.busy ? true : null })),
        { title: "買入", what: `最少 ${casNum(mn)}、最多 ${casNum(mx)}。`, how: ["離桌時桌上剩下的籌碼會回到錢包", "輸光了可以再買入"] }),
      h("p", { class: "cas-hint" }, `最少 ${casNum(mn)}、最多 ${casNum(mx)}。每手底池抽 ${C().rakePct}%，最多 ${C().rakeCapBB} 個大盲，進莊家。`)));
}

// ---------- 牌桌 ----------
const cardOrBack = c => (c < 0 ? cardEl(-1) : cardEl(c));
// 小盲、大盲是誰：2 人時按鈕＝小盲、另壹位大盲；3 人以上小盲是按鈕左邊那位、大盲再左邊（座位順序，不算這手不玩的）
function blindTags(v) {
  const act = v.seats.filter(x => !x.sitOut), bi = act.findIndex(x => x.btn), tags = {};
  if (bi < 0 || act.length < 2) return tags;
  if (act.length === 2) { tags[act[bi].uid] = "SB"; tags[act[(bi + 1) % 2].uid] = "BB"; } else { tags[act[(bi + 1) % act.length].uid] = "SB"; tags[act[(bi + 2) % act.length].uid] = "BB"; }
  return tags;
}
const seatBox = (s, v, compact) => {
  const act = v.phase === "play" && v.toAct === s.uid, tag = blindTags(v)[s.uid];
  const st = s.sitOut ? "・等下壹手" : s.st === "allin" ? "・全下" : s.st === "fold" ? "・蓋牌" : "";
  return h("div", { class: "hd-seat" + (s.me ? " me" : "") + (act ? " turn" : "") + (s.st === "fold" || s.sitOut ? " fold" : "") + (compact ? " compact" : "") },
    // 名字壹行：小章（旅客、D、SB／BB）在名字前面（不疊在名字上）；手機名字最多 4 字加「‥」，全名放 title（11-22 qa：手機整桌要不捲就放得下）
    h("div", { class: "bj-who" }, h("div", { class: "hd-nm" },
      h("b", { title: s.nick }, h("span", { class: "n-full" }, s.nick, s.me ? "（你）" : ""), h("span", { class: "n-short" }, [...s.nick].length > 5 ? [...s.nick].slice(0, 4).join("") + "‥" : s.nick))),
      h("small", null, h("span", { class: "n-full" }, "桌上 "), casNum(s.stack), st),
      (s.npc || s.btn || tag) ? h("span", { class: "hd-tg" }, // 小章在名字下面壹行（旅客、D、SB／BB），不疊在名字上
        s.npc ? h("i", { class: "hd-npc", title: "館裡的旅客" }, "客") : null, s.btn ? h("i", { class: "hd-btn", title: "按鈕" }, "D") : null, tag ? h("i", { class: "hd-blind", title: tag === "SB" ? "小盲" : "大盲" }, tag) : null) : null),
    s.say && !s.sitOut ? h("p", { class: "hd-say-npc", title: s.say }, s.say) : null,
    s.hole && s.hole.length && !s.sitOut ? h("div", { class: "cas-hand" }, s.hole.map(cardOrBack)) : null,
    s.bet > 0 ? h("p", { class: "hd-bet" }, "押 ", h("b", null, casNum(s.bet))) : null);
};
function resultBanner(v) {
  const r = v.res;
  if (!r) return null;
  const me = v.seats.find(s => s.me), net = r.net || {}, inHand = me && Object.prototype.hasOwnProperty.call(net, me.uid), n = inHand ? net[me.uid] || 0 : 0;
  const won = r.winners && me && r.winners.includes(me.uid), winners = (r.winners || []).map(id => (v.seats.find(x => x.uid === id) || {}).nick).filter(Boolean);
  const how = r.how === "fold" ? (won ? "其他人都蓋牌了" : "") : r.names && me && r.names[me.uid] ? `你是${r.names[me.uid]}` : "";
  const pots = Array.isArray(r.pots) && r.pots.length > 1 ? r.pots.map((p, i) => `${i ? "邊池 " + i : "主池"} ${casNum(p.amount)} → ${(p.winners || []).map(id => (v.seats.find(x => x.uid === id) || {}).nick || "").filter(Boolean).join("、")}`) : null;
  return h("div", { class: "cas-result k-" + (!inHand ? "push" : n > 0 ? "win" : n < 0 ? "lose" : "push"), role: "status" },
    h("b", null, !inHand ? "這手你沒參加" : n > 0 ? "你贏了" : n < 0 ? "你輸了" : "平分"),
    h("span", null, inHand ? `${n > 0 ? "+" : n < 0 ? "−" : ""}${casNum(Math.abs(n))}${how ? "・" + how : ""}` : ""),
    winners.length ? h("small", null, `贏家：${winners.join("、")}${winners.length > 1 ? "（平分）" : ""}`) : null,
    r.how === "showdown" && r.names ? h("small", null, v.seats.filter(x => r.names[x.uid]).map(x => `${x.nick}：${r.names[x.uid]}`).join("　")) : null,
    pots ? h("small", null, pots.join("　")) : null,
    r.rake ? h("small", null, `抽水 ${casNum(r.rake)}`) : null);
}
function actions(st, v) {
  const L = v.legal, me = v.seats.find(s => s.me);
  if (!L) return v.phase === "play" ? h("p", { class: "cas-hint hd-wait" }, "等其他人……") : null;
  const send = (a, to) => call(st, { act: "act", pid: st.pid, a, to });
  const minTo = L.minTo, maxTo = L.maxTo, bb = v.level.bb;
  if (!st.raise || st.raise < minTo) st.raise = minTo;
  if (st.raise > maxTo) st.raise = maxTo;
  const slider = L.canRaise && st.raiseOpen ? h("div", { class: "hd-raise" },
    h("input", { type: "range", min: String(minTo), max: String(maxTo), step: String(Math.max(1, Math.floor(bb / 2))), "aria-label": "加注加到多少" }),
    h("b", { class: "hd-raise-n" }, casNum(st.raise)),
    h("div", { class: "hd-quick" }, [["最小", minTo], ["半池", Math.min(maxTo, Math.max(minTo, v.curBet + Math.floor(v.pot / 2)))], ["底池", Math.min(maxTo, Math.max(minTo, v.curBet + v.pot))]].map(([t, n]) => btn(t, () => { st.raise = n; redraw(); }, "small ghost")))) : null;
  if (slider) { const inp = slider.querySelector("input"); inp.value = String(st.raise); inp.addEventListener("input", () => { st.raise = Number(inp.value); slider.querySelector(".hd-raise-n").textContent = casNum(st.raise); }); }
  const dis = st.busy ? true : null;
  let raiseBtn = null;
  if (slider) { const inp = slider.querySelector("input"); inp.addEventListener("input", () => { if (raiseBtn) raiseBtn.textContent = `加注到 ${casNum(st.raise)}`; }); } // 拉滑桿：按鈕字跟著變（要在按鈕建好之後才有 raiseBtn）
  return h("div", { class: "hd-acts bj-sticky" }, slider,
    h("div", { class: "bj-acts" }, btn("蓋牌", () => send("fold"), "big", { disabled: dis }),
      L.check ? btn("過牌", () => send("check"), "big", { disabled: dis }) : btn(`跟注 ${casNum(L.call)}`, () => send("call"), "primary big", { disabled: dis }),
      L.canRaise ? (st.raiseOpen ? (raiseBtn = btn(`加注到 ${casNum(st.raise)}`, () => { st.raiseOpen = false; send("raise", st.raise); }, "primary big", { disabled: dis })) : btn("加注…", () => { st.raiseOpen = true; redraw(); }, "primary big", { disabled: dis, title: "選要加到多少" })) : null,
      me && L.maxTo > 0 ? btn("全下", () => send("allin"), "big", { disabled: dis }) : null));
}
// 輪到我（手機）：貼底的動作列會蓋住公共牌，所以把內文捲到底，動作列回到自己的位置，牌看得全（11-21 qa 實測 ①；11-22 改成畫面畫出來時才捲：畫面重畫會換掉 .cas-body，在收到 view 時捲會被洗掉）
function scrollForTurn(st, v) {
  const me = v.seats.find(x => x.me), key = me && v.phase === "play" && v.toAct === me.uid ? `${v.hand}|${v.street}|${v.toAct}` : "";
  if (!key) { st.scrollKey = ""; return; }
  if (st.scrollKey === key || !window.matchMedia || !window.matchMedia("(max-width: 760px)").matches) return;
  st.scrollKey = key;
  for (const ms of [60, 400]) setTimeout(() => { const b = document.querySelector(".cas-body"); if (b && st.scrollKey === key) b.scrollTo({ top: b.scrollHeight }); }, ms);
}
function tablePane(st) {
  const v = st.view, me = v.seats.find(s => s.me), opps = v.seats.filter(s => !s.me), max = v.seatsMax || 2;
  const board = h("div", { class: "hd-board", "aria-label": "公共牌" }, [0, 1, 2, 3, 4].map(i => (v.board[i] != null ? cardEl(v.board[i]) : h("span", { class: "hd-slot", "aria-hidden": "true" }))));
  const wait = v.phase === "wait", limit = v.pairLeft != null && v.pairLeft <= 0;
  const reason = wait ? (v.seats.length < 2 ? "等館友坐下……" : limit ? "你跟同桌某位今天的輸贏到上限了，這手先坐壹下。" : "有人的籌碼不夠開下壹手。") : me && me.sitOut ? (limit ? "你跟同桌某位今天的輸贏到上限了，這手先坐壹下。" : "你這手先不玩，等下壹手。") : null;
  const stateTip = { title: "底池", what: "這一手大家放進去的籌碼，贏的人全拿（有人全下時會分主池、邊池）。", how: [`每手抽 ${v.rake.pct}%，最多 ${v.rake.capBB} 個大盲（${casNum(v.rake.cap)}），進莊家`, "只有底池超過 2 個大盲才抽"] };
  const empties = Math.max(0, max - v.seats.length);
  scrollForTurn(st, v);
  return [
    h("div", { class: "hd-head" }, h("span", null, `盲注 ${casNum(v.level.sb)}／${casNum(v.level.bb)}・第 ${v.hand} 手・${v.seats.length}／${max} 人`), h("span", { class: "hd-clock", role: "timer" }), btn("離桌", () => leave(st), "small ghost")),
    h("div", { class: "bj-table hd-table" },
      h("div", { class: "hd-opps n" + Math.min(5, opps.length + (wait ? empties : 0)) }, opps.map(o => seatBox(o, v, true)), wait ? Array.from({ length: Math.min(empties, 5 - opps.length) }, () => h("div", { class: "hd-seat empty compact" }, h("p", { class: "bj-empty" }, "空位"))) : null),
      h("div", { class: "hd-mid" }, board, tipOn(h("p", { class: "hd-pot" }, "底池 ", h("b", null, casNum(v.pot))), stateTip), reason ? h("p", { class: "hd-say" }, reason) : null),
      me ? seatBox(me, v, false) : null,
      v.phase === "over" || (wait && v.res) ? resultBanner(v) : null),
    v.seats.length < max ? (v.seats.length < 2 ? invitePane(st) : h("details", { class: "bj-how" }, h("summary", null, `邀更多館友（${v.seats.length}／${max}）`), invitePane(st))) : null,
    me && me.stack <= 0 && !(v.phase === "play" && me.st === "allin") ? h("div", { class: "sb-sec" }, h("h4", null, "籌碼用完了"), btn("再買入", () => { st.view = Object.assign({}, v); st.rebuy = true; redraw(); }, "primary")) : null,
    v.phase === "play" ? actions(st, v) : null,
  ];
}
function invitePane(st) {
  const mates = (NET.roster || []).filter(p => p && !p.me && (p.status === "online" || p.status === "away"));
  return h("div", { class: "sb-sec" }, h("h4", null, "邀館友壹起玩"), h("div", { class: "sb-opts" }, btn([h("span", { "aria-hidden": "true" }, "♠"), " 邀旅客"], () => openHoldemNpc(st, v => { take(st, v); redraw(); }), "small primary", { title: "邀館裡的旅客坐下來打" })), mates.length ? h("div", { class: "sb-opts" }, mates.map(p => btn(p.nick, () => sendInvite(p, "holdem"), "small primary"))) : h("p", { class: "cas-hint" }, "現在沒有別的館友在線。"));
}
async function leave(st) {
  if (!st.pid) return;
  const pid = st.pid;
  st.leaving = true; setTimeout(() => { st.leaving = false; }, 3000);
  stop(st); st.pid = null; st.view = null; st.buy = ""; redraw();
  try { await NET.call("partyAction", { pid, act: "leave" }); } catch (e) { /* 那桌已經收了 */ }
  try { await NET.call("casino", { act: "peek" }); } catch (e) { /* 錢包下次進賭場會更新 */ }
}
export function holdemPane() {
  const st = state();
  gameIntro("holdem");
  if (!NUM.casino.holdem || !NUM.casino.holdem.on) return h("p", { class: "nb-empty" }, "德州撲克現在不開。");
  resume(st);
  let body;
  if (st.pid && st.view && st.view.seats.some(s => s.me) && !st.rebuy) body = tablePane(st);
  else if (st.pid && st.view) body = setupPane(st, true); // 被邀請進來、還沒坐下，或輸光了再買
  else body = setupPane(st, false);
  return [body, howTo([
    "2～6 個人壹桌：每人兩張底牌、桌上五張公共牌（翻牌 3 張、轉牌 1 張、河牌 1 張），用最大的五張比牌型。",
    `牌型由小到大：${HOLDEM_HAND_NAMES.join("、")}（再大的就是同花大順）。`,
    "每輪輪到你：蓋牌（放棄這手）、過牌（沒人加注時不用放籌碼）、跟注（補到對方的注）、加注、全下。每步 30 秒，時間到自動過牌或蓋牌，連續 2 次超時自動離座。",
    `底池抽 ${C().rakePct}%（最多 ${C().rakeCapBB} 個大盲）進莊家；壹天對同壹人淨輸最多 ${casNum(C().pairDay)}，到了就不能再跟他同桌（那壹手你先不玩）。有人全下時，底池會分成主池和邊池。`])];
}
ADDONS.casinoGame({ id: "holdem", name: "德州", ic: "users", pane: holdemPane });
// 被邀請的人接受後：打開賭場、切到德州、入座畫面
PARTY_HOOKS.holdem = {
  open: pid => {
    if (PANELS.casino) PANELS.casino({ tab: "table" });
    setTimeout(() => { const cs = casinoState(); if (!cs) return; const st = state(); cs.game = "holdem"; st.pid = pid; watch(st); call2(st, { act: "buyin", pid }); casinoRefresh(); }, 600);
  },
  isOpen: pid => !!(H && H.pid === pid),
  say: m => { if (m.joined) note(`${m.joined} 坐下來了。`, "good"); if (m.left) note(`${m.left} 離桌了。`); },
};
