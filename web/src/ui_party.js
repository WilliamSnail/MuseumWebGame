// ================================================================
//  邀請、隊伍、兩個人一起融合的畫面（多人版 M3，翊文 11-08：先做「一起融合」）
//  規則在 shared/party.js、shared/logic3.js 的 fuseTogether；伺服器在 functions/party.js。
//  - 館友小卡上「邀請壹起融合」（登記在 ui_core.js 的 FRIEND_ACTIONS）。
//  - 被邀請：右下角一張邀請卡，60 秒倒數，接受／婉拒。
//  - 組好隊：蓋在畫面上的木框（ui_board.js 的 overlay），聽 Realtime Database 的 parties/{pid} 即時更新。
//    各選一隻 → 準備好了 → 隊長按「開始融合」→ 伺服器擲一次骰、兩份存檔一起寫 → 兩個人看到同一隻。
//  - 關掉這個框＝離開隊伍。
// ================================================================
import { describePepe, fromKey, isFree } from "../../shared/logic.js";
import { fusionLeft, fusionPrice } from "../../shared/logic3.js";
import { canStartParty, fixParty, partyMembers } from "../../shared/party.js";
import { NET } from "./net_firebase.js";
import { FRIEND_ACTIONS, P, UI, btn, collectionItems, h, itemHTML, note, snd } from "./ui_core.js";
import { overlay } from "./ui_board.js";

const KIND_TEXT = { fusion: "壹起融合", cellar: "壹起下地下收藏庫" };
const canFuseHere = () => !!P && !isFree(P);

// ---------- 邀請 ----------
async function sendInvite(friend, kind) {
  if (!canFuseHere()) { note("要先用挑戰模式的參觀者進館，才能邀請館友壹起融合。", "bad"); return; }
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("invite", { to: friend.id, kind });
    note(`邀請送出了，等 ${r.toNick} 回覆（60 秒）。`);
  } catch (e) { snd("error"); note(e.message || "邀請送不出去。", "bad"); }
}
FRIEND_ACTIONS.push({ id: "fuse", label: "邀請壹起融合", show: p => p.status !== "offline" && canFuseHere(), run: p => sendInvite(p, "fusion") });

// 被邀請：右下角一張卡
function inviteCard(m) {
  document.querySelectorAll(".inv-card").forEach(x => { if (x.dataset.iid === m.iid) x.remove(); });
  const left = h("span", { class: "inv-left" });
  const card = h("div", { class: "inv-card", role: "alertdialog", "aria-label": `${m.from.nick} 邀請你${KIND_TEXT[m.kind] || ""}`, dataset: { iid: m.iid } },
    h("p", { class: "inv-t" }, h("b", null, m.from.nick), ` 邀請你${KIND_TEXT[m.kind] || ""}`),
    m.kind === "fusion" ? h("p", { class: "inv-sub" }, "兩個人各放壹隻佩佩，做出來的那隻兩個人都拿到；各扣各的靈感和融合次數。") : null,
    h("div", { class: "inv-btns" }, btn("接受", () => reply(true), "primary small"), btn("婉拒", () => reply(false), "small"), left));
  const tick = setInterval(() => {
    const s = Math.max(0, Math.ceil((m.expires - Date.now()) / 1000));
    left.textContent = `還有 ${s} 秒`;
    if (s <= 0) { done(); note(`${m.from.nick} 的邀請過期了。`); }
  }, 250);
  const done = () => { clearInterval(tick); card.remove(); };
  async function reply(accept) {
    done();
    if (accept && m.kind === "fusion" && !canFuseHere()) { note("要先用挑戰模式的參觀者進館，才能壹起融合（這次先婉拒了）。", "bad"); accept = false; }
    try {
      if (accept) await NET.flush().catch(() => {});
      const r = await NET.call("inviteReply", { iid: m.iid, accept });
      if (accept && r.pid) openParty(r.pid);
    } catch (e) { snd("error"); note(e.message || "回覆不了。", "bad"); }
  }
  document.body.append(card);
  snd("bell");
}

// ---------- 隊伍的木框 ----------
let view = null;
export function openParty(pid) {
  if (view && view.pid === pid && view.m.layer.isConnected) return;
  if (view) view.m.close();
  let party = null, gone = false, busy = false, stop = () => {};
  const leave = async () => {
    stop();
    view = null;
    if (gone) return;
    try { await NET.call("partyAction", { pid, act: "leave" }); } catch (e) { /* 隊伍已經不在了 */ }
  };
  const m = overlay("nb-party", "壹起融合", "壹起融合", "users", leave);
  view = { pid, m };
  const act = async (name, extra = {}) => {
    if (busy) return;
    busy = true;
    try { await NET.call("partyAction", Object.assign({ pid, act: name }, extra)); }
    catch (e) { snd("error"); note(e.message || "沒辦法。", "bad"); }
    finally { busy = false; draw(); }
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
    const memberCard = mm => h("div", { class: "pt-member" + (mm.ready ? " ready" : "") + (mm.id === meId ? " me" : "") },
      h("b", { class: "pt-nick" }, mm.nick, mm.id === party.leader ? h("small", null, "隊長") : null),
      mm.pick.length ? pet(mm.pick[0]) : h("div", { class: "pt-pet empty" }, "還沒選"),
      h("span", { class: "pt-name" }, mm.pick.length ? describePepe(fromKey(mm.pick[0])).title : "　"),
      h("span", { class: "pt-state" }, mm.ready ? "準備好了" : "還在選"));
    const members = h("div", { class: "pt-members" }, ms.map(memberCard),
      ms.length < 2 ? h("div", { class: "pt-member wait" }, h("b", null, "等對方加入……")) : null);
    const can = canStartParty(party, meId);
    const isLeader = party.leader === meId;
    const running = party.phase === "running";
    const foot = h("div", { class: "pt-foot" },
      running ? h("p", { class: "pt-hint" }, "融合中……")
        : isLeader ? [can.ok ? null : h("p", { class: "pt-hint" }, can.reason), btn("開始融合", () => act("start"), "primary", { disabled: !can.ok })]
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
    const list = items.length ? h("div", { class: "pt-pick" }, items.map(it => h("button", {
      type: "button", class: "pt-opt" + (it.key === chosen ? " on" : ""), title: describePepe(it.pick).full, "aria-pressed": String(it.key === chosen),
      onClick: () => act("pick", { keys: [it.key] }),
    }, h("span", { class: "pt-opt-art", html: itemHTML(it) }), h("span", { class: "pt-opt-t" }, describePepe(it.pick).title))))
      : h("p", { class: "pt-hint" }, "收藏裡還沒有佩佩：先去手作坊做壹隻。");
    const readyBtn = mine.ready
      ? btn("取消準備", () => act("ready", { ready: false }), "small")
      : btn("準備好了", async () => { await NET.flush().catch(() => {}); act("ready", { ready: true }); }, "primary small", { disabled: !chosen || left <= 0 || P.insp < price });
    return h("div", { class: "pt-mine" },
      h("p", { class: "pt-cost" }, `融合壹次 ${price} 靈感（你有 ${P.insp}）・今天還能融合 ${left} 次`),
      list, h("div", { class: "pt-mine-btns" }, readyBtn));
  };
  const drawResult = (r, meId) => {
    const me = r.a.id === meId ? r.a : r.b, other = r.a.id === meId ? r.b : r.a;
    const key = r.a.key || r.b.key;
    const line = s => s.got ? `拿到了${s.perfect ? "（完美作品！）" : s.failed ? "（失敗作）" : ""}` : "理智用完了，沒拿到";
    const sanLine = s => s.san ? `理智檢定擲 ${s.san.roll}：${s.san.success ? "成功" : "失敗"}，扣 ${s.san.loss}` : "";
    m.setTop(null);
    m.surface.replaceChildren(h("div", { class: "pt-wrap pt-result" },
      h("h3", { class: "pt-result-t" }, r.title ? `配方「${r.title}」！` : "融合好了"),
      key ? h("div", { class: "pt-pet big", html: itemHTML({ kind: "pepe", key, pick: fromKey(key) }) }) : null,
      key ? h("p", { class: "pt-name big" }, describePepe(fromKey(key)).full) : null,
      r.roll != null ? h("p", { class: "pt-hint" }, `稀有度的骰子：${r.roll}（兩個人同壹顆）`) : null,
      r.mutations.length ? h("p", { class: "pt-hint" }, `突變：${r.mutations.join("、")}`) : null,
      h("div", { class: "pt-members" },
        [me, other].map(s => h("div", { class: "pt-member" + (s.id === meId ? " me" : "") }, h("b", { class: "pt-nick" }, s.nick), h("span", { class: "pt-state" }, line(s)), h("span", { class: "pt-name" }, sanLine(s))))),
      h("div", { class: "pt-foot" }, btn("收下了", () => m.close(), "primary"))));
    snd("coin");
  };
  stop = NET.watch(`parties/${pid}`, v => {
    if (v == null) { if (party) gone = true; party = null; } else party = fixParty(v);
    draw();
  });
  draw();
  snd("flip");
}

// ---------- 伺服器送來的通知 ----------
NET.on("message", m => {
  if (!m || !UI.net) return;
  if (m.t === "invited") inviteCard(m);
  else if (m.t === "invite_closed") note(m.reason === "declined" ? `${m.by || "對方"} 婉拒了邀請。` : "邀請結束了。");
  else if (m.t === "party" && m.pid) {
    if (m.joined) note(`${m.joined} 加入了隊伍。`, "good");
    if (m.left) note(`${m.left} 離開了隊伍。`);
    if (!(view && view.pid === m.pid)) openParty(m.pid);
  }
});
