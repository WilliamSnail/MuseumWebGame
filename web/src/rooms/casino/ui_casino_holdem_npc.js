// ================================================================
//  德州邀旅客（11-22，數值平衡 PR 956；樣子跟 21 點的「邀旅客」壹套）：小視窗列出現在邀得動的旅客，按「邀他來打」；
//  答應了他就坐進桌子（view.seats[].npc），拒絕就說他的拒絕台詞（30 分鐘內不能再邀）。伺服器 casinoHoldem 的 npcWho、npcInvite。
//  旅客說的話（答應、婉拒、桌上的話）記進交談紀錄的旅客那本（ui_traveler_talk.js）。
// ================================================================
import { NET } from "../../core/net_firebase.js";
import { btn, h, miniLayer, snd } from "../../core/ui_core.js";
import { npcName } from "../../panels/ui_npc_card.js";
import { travelerHeard } from "../../panels/ui_traveler_talk.js";

// st：德州的狀態（要有 pid）；after()：邀成功後重畫（桌子的 view 會自己從 RTDB 進來）
export function openHoldemNpc(st, after) {
  const m = miniLayer("邀旅客壹起打德州", "館裡的旅客，答不答應要看他自己；答應了就坐下來打，贏的輸的都算他自己的。");
  m.layer.classList.add("sp-top");
  m.layer.addEventListener("click", e => { if (e.target === m.layer) m.close(); });
  let who = null, said = null, busy = null, failed = "";
  const draw = () => {
    if (!m.layer.isConnected) return;
    m.card.querySelectorAll(".cas-ni").forEach(e => e.remove());
    m.card.append(
      said ? h("div", { class: "cas-ni cas-ni-say" + (said.ok ? " ok" : "") }, h("b", null, said.reason ? "沒邀成" : said.name + (said.ok ? "答應了" : "拒絕了")), h("p", { class: "cas-bub npc" }, said.reason ? said.line : `${said.name}：${said.line}`)) : null,
      who === null ? h("p", { class: "cas-ni cas-ni-empty" }, "問問看誰在館裡……")
        : who.length ? h("ul", { class: "cas-ni cas-ni-list" }, who.map(x => h("li", null, h("span", null, npcName(x.id, x.name)), btn(busy === x.id ? "邀請中……" : "邀他來打", () => invite(x), "small primary", { disabled: busy ? true : null }))))
          : h("p", { class: "cas-ni cas-ni-empty" }, failed || "現在沒有人邀得動：旅客在館裡的時間有限，今天答應過幾次或額度用完的也不會來。晚點再看看。"),
      h("div", { class: "cas-ni cas-ni-acts" }, btn("關起來", () => m.close(), "ghost")));
  };
  const load = async () => {
    try {
      const r = await NET.call("casinoHoldem", { act: "npcWho", pid: st.pid });
      who = r && r.ok && Array.isArray(r.who) ? r.who : [];
      if (!r || !r.ok) failed = (r && r.reason) || "現在問不到。";
    } catch (e) { who = []; failed = (e && e.message) || "現在問不到。"; }
    draw();
  };
  async function invite(x) {
    if (busy) return;
    busy = x.id; draw();
    try {
      const r = await NET.call("casinoHoldem", { act: "npcInvite", pid: st.pid, npc: x.id });
      if (r && r.ok && r.invite) {
        said = { name: r.invite.name || x.name, line: r.invite.line || "", ok: !!r.invite.accepted };
        travelerHeard(x.id, r.invite.line, "casino");
        who = who.filter(w => w.id !== x.id); // 答應了＝坐下；拒絕＝30 分鐘內不能再邀
        snd(r.invite.accepted ? "coin" : "error");
        if (r.view && after) after(r.view);
      } else { said = { name: x.name, line: (r && r.reason) || "邀不了。", ok: false, reason: true }; snd("error"); }
    } catch (e) { said = { name: x.name, line: (e && e.message) || "邀不了。", ok: false, reason: true }; snd("error"); }
    busy = null; draw();
  }
  draw(); load();
}
