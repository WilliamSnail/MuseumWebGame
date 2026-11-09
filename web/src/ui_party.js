// ================================================================
//  邀請、隊伍、兩個人一起融合的畫面（多人版 M3，翊文 11-08：先做「一起融合」）
//  規則在 shared/party.js、shared/logic3.js 的 fuseTogether；伺服器在 functions/party.js。
//  - 館友小卡上「邀請壹起融合」（登記在 ui_core.js 的 FRIEND_ACTIONS）。
//  - 邀請卡排在右下角（.inv-stack）：送出去的在上面倒數；收到的在下面，60 秒倒數，接受／婉拒。
//    同時收到好幾個，一次只顯示最早的那張，卡上寫「還有 N 個邀請」（11-09：原本疊在一起，下面那張看不到）。
//  - 組好隊：蓋在畫面上的木框（ui_board.js 的 overlay），聽 Realtime Database 的 parties/{pid} 即時更新。
//    各選一隻 → 準備好了 → 隊長按「開始融合」→ 伺服器擲一次骰、兩份存檔一起寫 → 兩個人看到同一隻。
//  - 關掉這個框＝離開隊伍。隊友斷線超過 PARTY.offlineWaitMs，請伺服器把他移出去（伺服器自己再確認一次）。
// ================================================================
import { NUM } from "../../shared/config.js";
import { describePepe, fromKey, isFree, nowMs } from "../../shared/logic.js";
import { canFuseOne, fusionLeft, fusionPrice } from "../../shared/logic3.js";
import { PARTY, canStartParty, fixParty, partyMembers } from "../../shared/party.js";
import { NET } from "./net_firebase.js";
import { FRIEND_ACTIONS, P, UI, btn, collectionItems, h, itemHTML, note, snd } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { learnText } from "../../shared/shop.js";

const KIND_TEXT = { fusion: "壹起融合", cellar: "壹起下地下收藏庫", table: "壹起玩 21 點" };
// 別種隊伍的框（合作地下在 ui_coop.js 登記）：{ cellar: { open(pid), isOpen(pid), say(m) } }。這個檔不 import 它，不然會繞圈
export const PARTY_HOOKS = {};
const canFuseHere = () => !!P && !isFree(P);
// 邀請的期限是伺服器的時間：跟網路的時間（nowMs）比，不跟這台電腦的時鐘比
const secLeft = exp => Math.max(0, Math.ceil((exp - nowMs()) / 1000));

// ---------- 右下角的邀請卡 ----------
const incoming = [];        // 收到的，照收到的順序：{ m, card, more }
const outgoing = new Map(); // 我送出去、還沒回覆的：iid → { toNick, expires }
let stackEl = null, outCard = null, ticker = null;
function invStack() {
  if (!stackEl || !stackEl.isConnected) { stackEl = h("div", { class: "inv-stack" }); document.body.append(stackEl); }
  return stackEl;
}
function drawInvites() {
  const box = invStack();
  if (outgoing.size) {
    const rows = [...outgoing.values()].map(o => h("p", { class: "inv-out-row" },
      h("span", null, "等 ", h("b", null, o.toNick), " 回覆"), h("span", { class: "inv-left", dataset: { exp: String(o.expires) } }, `還有 ${secLeft(o.expires)} 秒`)));
    const kinds = new Set([...outgoing.values()].map(o => o.kind)); // 通常只有一種；兩種都有就只寫「邀請送出了」
    const card = h("div", { class: "inv-card inv-out", role: "status" }, h("p", { class: "inv-sub" }, kinds.size === 1 ? `${KIND_TEXT[[...kinds][0]] || ""}的邀請送出了` : "邀請送出了"), rows);
    if (outCard && outCard.isConnected) outCard.replaceWith(card); else box.prepend(card);
    outCard = card;
  } else if (outCard) { outCard.remove(); outCard = null; }
  incoming.forEach((x, i) => { x.card.hidden = i > 0; if (!x.card.isConnected) box.append(x.card); });
  if (incoming.length) { const n = incoming.length - 1; incoming[0].more.textContent = n ? `還有 ${n} 個邀請` : ""; }
  if (!outgoing.size && !incoming.length) {
    if (ticker) { clearInterval(ticker); ticker = null; }
    box.remove();
    return;
  }
  if (!ticker) ticker = setInterval(tickInvites, 250);
  tickInvites();
}
// 每 0.25 秒：換倒數的字；到期的收掉、跳提示
function tickInvites() {
  let changed = false;
  for (const [iid, o] of outgoing) if (secLeft(o.expires) <= 0) { outgoing.delete(iid); note(`${o.toNick} 沒有回應，邀請過期了。`); changed = true; }
  for (const x of incoming.slice()) if (secLeft(x.m.expires) <= 0) { dropIncoming(x.m.iid); note(`${x.m.from.nick} 的邀請過期了。`); changed = true; }
  if (changed) { drawInvites(); return; }
  if (stackEl) stackEl.querySelectorAll(".inv-left[data-exp]").forEach(s => { s.textContent = `還有 ${secLeft(+s.dataset.exp)} 秒`; });
}
function dropIncoming(iid) {
  const i = incoming.findIndex(x => x.m.iid === iid);
  if (i >= 0) { incoming[i].card.remove(); incoming.splice(i, 1); }
}
function dropOutgoing(iid) { if (iid && outgoing.delete(iid)) drawInvites(); }

// ---------- 邀請 ----------
export async function sendInvite(friend, kind) {
  if (kind !== "table" && !canFuseHere()) { note(`要先用挑戰模式的參觀者進館，才能邀請館友${KIND_TEXT[kind] || ""}。`, "bad"); return; } // table：賭場同桌，只要登入
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("invite", { to: friend.id, kind });
    outgoing.set(r.iid, { toNick: r.toNick, expires: r.expires, kind });
    drawInvites();
  } catch (e) { snd("error"); note(e.message || "邀請送不出去。", "bad"); }
}
FRIEND_ACTIONS.push({ id: "fuse", label: "邀請壹起融合", show: p => p.status !== "offline" && canFuseHere(), run: p => sendInvite(p, "fusion") });

// 被邀請：右下角一張卡
function inviteCard(m) {
  if (incoming.some(x => x.m.iid === m.iid)) return;
  const more = h("p", { class: "inv-more" });
  const card = h("div", { class: "inv-card inv-in", role: "alertdialog", "aria-label": `${m.from.nick} 邀請你${KIND_TEXT[m.kind] || ""}`, dataset: { iid: m.iid } },
    h("p", { class: "inv-t" }, h("b", null, m.from.nick), ` 邀請你${KIND_TEXT[m.kind] || ""}`),
    m.kind === "fusion" ? h("p", { class: "inv-sub" }, "兩個人各放壹隻佩佩，做出來的那隻兩個人都拿到；各扣各的靈感和融合次數。") : null,
    m.kind === "cellar" ? h("p", { class: "inv-sub" }, "每個人帶 1–2 隻佩佩，壹起投票、看同壹顆骰子；理智各扣各的。") : null,
    m.kind === "table" ? h("p", { class: "inv-sub" }, "Hamachi 賭場：同壹張桌、同壹副牌，各下各的注，輪流要牌。") : null,
    h("div", { class: "inv-btns" }, btn("接受", () => reply(true), "primary small"), btn("婉拒", () => reply(false), "small"),
      h("span", { class: "inv-left", dataset: { exp: String(m.expires) } }, `還有 ${secLeft(m.expires)} 秒`)),
    more);
  async function reply(accept) {
    dropIncoming(m.iid);
    drawInvites();
    if (accept && m.kind !== "table" && !canFuseHere()) { note(`要先用挑戰模式的參觀者進館，才能${KIND_TEXT[m.kind] || "壹起玩"}（這次先婉拒了）。`, "bad"); accept = false; }
    try {
      if (accept) await NET.flush().catch(() => {});
      const r = await NET.call("inviteReply", { iid: m.iid, accept });
      if (accept && r.pid) { if (PARTY_HOOKS[m.kind]) PARTY_HOOKS[m.kind].open(r.pid); else openParty(r.pid); }
    } catch (e) { snd("error"); note(e.message || "回覆不了。", "bad"); }
  }
  incoming.push({ m, card, more });
  drawInvites();
  snd("bell");
}

// ---------- 隊伍的木框 ----------
let view = null;
export function openParty(pid) {
  if (view && view.pid === pid && view.m.layer.isConnected) return;
  if (view) view.m.close();
  let party = null, gone = false, busy = false, coined = false;
  const timers = {}; // 斷線的隊友：id → { t: 計時器, tries: 問過伺服器幾次 }
  let offs = [];
  const stop = () => {
    offs.forEach(f => { try { f(); } catch (e) { /* 已經停了 */ } });
    offs = [];
    Object.values(timers).forEach(x => clearTimeout(x.t));
  };
  const leave = async () => {
    stop();
    if (view && view.pid === pid) view = null;
    if (gone) return;
    try { await NET.call("partyAction", { pid, act: "leave" }); } catch (e) { /* 隊伍已經不在了 */ }
  };
  const m = overlay("nb-party", "壹起融合", "壹起融合", "users", leave);
  view = { pid, m, stop, phase: () => (party ? party.phase : null) };
  const act = async (name, extra = {}) => {
    if (busy) return;
    busy = true;
    try { await NET.call("partyAction", Object.assign({ pid, act: name }, extra)); }
    catch (e) { snd("error"); note(e.message || "沒辦法。", "bad"); }
    finally { busy = false; draw(); }
  };
  // 隊友在不在線：看館友名單（/status）。斷線超過 PARTY.offlineWaitMs 才請伺服器移出去；伺服器說還不能移，再等一輪，最多問 3 次
  const offline = id => {
    if (!NET.roster.length) return false; // 名單還沒讀到：先當作在線
    const s = NET.roster.find(x => x.id === id);
    return !s || s.status === "offline";
  };
  const watchGone = () => {
    const meId = NET.me && NET.me.id;
    const ids = party && !gone ? partyMembers(party).map(x => x.id).filter(id => id !== meId) : [];
    for (const id of Object.keys(timers)) if (!ids.includes(id) || !offline(id)) { clearTimeout(timers[id].t); delete timers[id]; }
    for (const id of ids) if (offline(id) && !timers[id]) timers[id] = { t: setTimeout(() => askPrune(id), PARTY.offlineWaitMs), tries: 0 };
  };
  const askPrune = async id => {
    const x = timers[id];
    if (!x) return;
    x.tries++;
    let r = null;
    try { r = await NET.call("partyAction", { pid, act: "prune", uid: id }); } catch (e) { /* 隊伍不在了 */ }
    if (timers[id] === x && !(r && r.pruned) && x.tries < 3 && offline(id)) x.t = setTimeout(() => askPrune(id), PARTY.offlineWaitMs);
  };
  const pet = key => h("div", { class: "pt-pet", html: itemHTML({ kind: "pepe", key, pick: fromKey(key) }) });
  const draw = () => {
    if (!m.layer.isConnected) return;
    const meId = NET.me && NET.me.id;
    if (!party) {
      m.setTop(null);
      m.surface.replaceChildren(h("p", { class: "nb-empty" }, gone ? "隊伍解散了。" : "正在連線……"));
      return;
    }
    const ms = partyMembers(party), mine = party.members[meId];
    if (party.phase === "done" && party.result) return drawResult(party.result, meId);
    const memberCard = mm => {
      const off = mm.id !== meId && offline(mm.id);
      return h("div", { class: "pt-member" + (mm.ready ? " ready" : "") + (mm.id === meId ? " me" : "") + (off ? " off" : "") },
        h("b", { class: "pt-nick" }, mm.nick, mm.id === party.leader ? h("small", null, "隊長") : null),
        mm.pick.length ? pet(mm.pick[0]) : h("div", { class: "pt-pet empty" }, "還沒選"),
        h("span", { class: "pt-name" }, mm.pick.length ? describePepe(fromKey(mm.pick[0])).title : "　"),
        h("span", { class: "pt-state" }, off ? "不在線……" : mm.ready ? "準備好了" : "還在選"));
    };
    const members = h("div", { class: "pt-members" }, ms.map(memberCard),
      ms.length < 2 ? h("div", { class: "pt-member wait" }, h("b", null, "等對方加入……")) : null);
    const can = canStartParty(party, meId);
    const isLeader = party.leader === meId;
    const running = party.phase === "running";
    // 上次按開始沒成功的原因（伺服器寫在 party.fail，兩個人都看得到；換佩佩、有人進出就拿掉）
    const fail = !running && party.fail && party.fail.reason ? h("p", { class: "pt-hint pt-warn" }, `開始不了：${party.fail.reason}`) : null;
    const foot = h("div", { class: "pt-foot" }, fail,
      running ? h("p", { class: "pt-hint" }, "融合中……")
        : isLeader ? [can.ok ? null : h("p", { class: "pt-hint" }, can.waitFor === meId ? "等你準備好" : can.reason), btn("開始融合", () => act("start"), "primary", { disabled: !can.ok })]
          : h("p", { class: "pt-hint" }, "等隊長按「開始融合」。"));
    m.setTop(btn("離開隊伍", () => m.close(), "small"));
    m.surface.replaceChildren(h("div", { class: "pt-wrap" },
      h("p", { class: "nb-hint pt-intro" }, "兩個人各放壹隻佩佩。做出來的那隻兩個人都拿到；靈感和融合次數各扣各的，理智各擲各的。對方的佩佩只拿來算，不會被拿走。"),
      members,
      mine && !running ? picker(mine) : null,
      foot));
  };
  // 我的收藏裡選壹隻（最新的在前面）
  const picker = mine => {
    if (!canFuseHere()) return h("p", { class: "pt-hint" }, "要用挑戰模式的參觀者才能放佩佩。");
    const items = collectionItems("pepe").slice(0, 60);
    const price = fusionPrice(P), left = fusionLeft(P);
    const chosen = mine.pick[0] || null;
    // 靈感、今天的次數夠不夠（跟伺服器用同一個 canFuseOne 判斷）：不夠就寫出來，「準備好了」按不下去
    const check = items.length ? canFuseOne(P, { kind: "pepe", key: chosen || items[0].key }) : null;
    const why = check && !check.ok ? check.reason : null;
    const list = items.length ? h("div", { class: "pt-pick" }, items.map(it => h("button", {
      type: "button", class: "pt-opt" + (it.key === chosen ? " on" : ""), title: describePepe(it.pick).full, "aria-pressed": String(it.key === chosen),
      onClick: () => act("pick", { keys: [it.key] }),
    }, h("span", { class: "pt-opt-art", html: itemHTML(it) }), h("span", { class: "pt-opt-t" }, describePepe(it.pick).title))))
      : h("p", { class: "pt-hint" }, "收藏裡還沒有佩佩：先去手作坊做壹隻。");
    const readyBtn = mine.ready
      ? btn("取消準備", () => act("ready", { ready: false }), "small")
      : btn("準備好了", async () => { await NET.flush().catch(() => {}); act("ready", { ready: true }); }, "primary small", { disabled: !chosen || !!why });
    return h("div", { class: "pt-mine" },
      h("p", { class: "pt-cost" }, `融合壹次 ${price} 靈感（你有 ${P.insp}）・今天還能融合 ${left} 次`),
      list, h("div", { class: "pt-mine-btns" }, why ? h("p", { class: "pt-hint pt-warn" }, why) : null, readyBtn));
  };
  const drawResult = (r, meId) => {
    const me = r.a.id === meId ? r.a : r.b, other = r.a.id === meId ? r.b : r.a;
    const key = r.a.key || r.b.key;
    const muts = r.mutations || [];
    const line = s => s.got ? `拿到了${s.perfect ? "（完美作品！）" : s.failed ? "（失敗作）" : ""}` : "理智用完了，沒拿到";
    const sanLine = s => s.san ? `理智檢定擲 ${s.san.roll}：${s.san.success ? "成功" : "失敗"}，扣 ${s.san.loss}` : "";
    m.setTop(null);
    m.surface.replaceChildren(h("div", { class: "pt-wrap pt-result" },
      h("h3", { class: "pt-result-t" }, r.title ? `配方「${r.title}」！` : "融合好了"),
      key ? h("div", { class: "pt-pet big", html: itemHTML({ kind: "pepe", key, pick: fromKey(key) }) }) : null,
      key ? h("p", { class: "pt-name big" }, describePepe(fromKey(key)).full) : null,
      r.roll != null ? h("p", { class: "pt-hint" }, `稀有度的骰子：${r.roll}（兩個人同壹顆）`) : null,
      muts.length ? h("p", { class: "pt-hint" }, `突變：${muts.join("、")}`) : null,
      h("div", { class: "pt-members" },
        [me, other].map(s => h("div", { class: "pt-member" + (s.id === meId ? " me" : "") }, h("b", { class: "pt-nick" }, s.nick), h("span", { class: "pt-state" }, line(s)), h("span", { class: "pt-name" }, sanLine(s))))),
      me.learn ? h("p", { class: "pt-hint pt-learn" + (me.learn.gained ? " got" : "") }, learnText(me.learn, other.nick)) : null, // 跟館友學（決定 0032）
      h("div", { class: "pt-foot" }, btn("收下了", () => m.close(), "primary"))));
    if (!coined) { coined = true; snd("coin"); } // 對方按「收下了」離開時會重畫：聲音只響一次
  };
  offs.push(NET.watch(`parties/${pid}`, v => {
    if (v == null) { if (party) gone = true; party = null; } else party = fixParty(v);
    watchGone();
    draw();
  }));
  offs.push(NET.on("roster", () => { watchGone(); draw(); }));
  draw();
  snd("flip");
}

// ---------- 伺服器送來的通知 ----------
// 隊伍有變：開著這一隊的框就跳提示；沒開著，先確認隊伍還在、自己還是隊員才打開（離線時累積的舊通知、已經解散的隊伍都不理）
async function partyNotice(m) {
  dropOutgoing(m.iid);
  const hookOpen = Object.values(PARTY_HOOKS).find(k => k.isOpen(m.pid));
  if (hookOpen) { hookOpen.say(m); return; } // 別種隊伍的框開著這一隊：它自己提示
  const say = () => {
    if (m.joined) note(`${m.joined} 加入了隊伍。`, "good");
    if (m.left) note(m.why === "offline" ? `${m.left} 斷線了，離開了隊伍。` : `${m.left} 離開了隊伍。`);
  };
  if (view && view.pid === m.pid) { if (view.phase() !== "done") say(); return; } // 融合好了，大家按「收下了」各自離開：不用再提示
  const meId = NET.me && NET.me.id;
  const p = fixParty(await NET.read(`parties/${m.pid}`));
  if (!p || p.phase === "closed" || !meId || !p.members[meId]) return;
  if (view && view.pid === m.pid) return; // 讀的時候已經打開了
  // 在門口（還沒選參觀者）、自由模式：放不了佩佩，就退出這一隊，隊友會看到我離開了（不然他會一直等）
  if (p.kind !== "table" && !canFuseHere()) { NET.call("partyAction", { pid: m.pid, act: "leave" }).catch(() => {}); return; }
  say();
  if (PARTY_HOOKS[p.kind]) PARTY_HOOKS[p.kind].open(m.pid); else openParty(m.pid);
}
NET.on("message", m => {
  if (!m || !UI.net) return;
  if (m.t === "invited") inviteCard(m);
  else if (m.t === "invite_closed") {
    dropOutgoing(m.iid);
    note(m.reason === "declined" ? `${m.by || "對方"} 婉拒了邀請。` : m.reason === "full" ? `${m.by || "對方"} 想加入，可是隊伍滿了。` : "邀請結束了。");
  } else if (m.t === "party" && m.pid) partyNotice(m).catch(() => {});
});
// 登出：卡片、隊伍的框都收掉（不用通知伺服器，登出了也叫不動）
NET.on("logout", () => {
  incoming.splice(0).forEach(x => x.card.remove());
  outgoing.clear();
  drawInvites();
  if (view) { view.stop(); view = null; }
});
