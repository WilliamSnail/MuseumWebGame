// ================================================================
//  找旅客（NPC）一起下地下收藏庫：準備區的「旅客」那一塊（決定 0149，翊文 11-21；伺服器 functions/coop/coop_npc.js 的 coopNpc）
//  - 誰邀得動：coopNpc who → [{ id, name, role, chance, giftChance, san, cool }]；邀請：invite（答應才扣禮物錢，回話直接顯示）；請走：dismiss
//  - 隊伍裡的旅客：/parties/{pid}/npcs ＝ { id: { name, role, style } }，不是真人隊員、不用按準備；座位 ＝ 真人 ＋ 旅客，最多 4
//  - 理智只顯示分級，不寫數字（決定 0090）；說話的字最多 30 字，直接用伺服器給的 line
//  這個檔不 import ui_coop.js（不准繞圈）；要重畫準備區，由 ui_coop.js 把 draw 傳進來。
// ================================================================
import { NET } from "../core/net_firebase.js";
import { NUM } from "../../../shared/core/config.js";
import { NPC_COOP_ROLE_TEXT } from "../../../shared/npc/coop.js";
import { UI, btn, h, icon, note, setChips, snd } from "../core/ui_core.js";
import { npcName } from "../panels/ui_npc_card.js";

const SEATS = 4;
const ROLE_NOTE = { carry: "搬東西時能幫上忙", lead: "走到岔路會帶路", calm: "有人慌的時候能壯膽" };
const roleText = r => (r && NPC_COOP_ROLE_TEXT[r]) || "沒有特別的專長";
const roleNote = r => (r && ROLE_NOTE[r]) || "跟著走，幫忙投票";
const sanWord = n => (n >= 70 ? "精神很好" : n >= 55 ? "精神還可以" : "有點累");
const coolText = ms => `約 ${Math.max(1, Math.ceil(ms / 60000))} 分鐘後再問`;

let N = null; // { pid, who, max, gift, said, busy, useGift, failed }
const fresh = pid => ({ pid, who: null, max: NUM.casino.coopNpc.maxNpc, gift: NUM.casino.coopNpc.gift, said: null, busy: null, useGift: false, failed: "" });
export const npcOn = () => !!(NUM.casino.coopNpc && NUM.casino.coopNpc.on);
export const npcCount = party => Object.keys((party && party.npcs) || {}).length;
export function npcReset() { N = null; }

// 準備區的隊員格：旅客（跟真人格同一個樣子，加「旅客」小標記，沒有準備鈕）
export function npcCards(party) {
  const list = Object.entries((party && party.npcs) || {});
  return list.map(([id, n]) => h("div", { class: "pt-member cx-member cx-npc-card" },
    h("b", { class: "pt-nick" }, npcName(id, n.name), h("small", { class: "cx-npc-tag" }, "旅客")),
    h("div", { class: "cx-npc-face", "aria-hidden": "true" }, String(n.name || "旅").slice(0, 1)),
    h("span", { class: "pt-name" }, roleText(n.role)),
    h("span", { class: "pt-state" }, "跟你們下去")));
}

async function load(pid, redraw) {
  const s = N;
  try {
    const r = await NET.call("coopNpc", { pid, act: "who" });
    if (N !== s) return;
    if (r && r.ok) { s.who = Array.isArray(r.list) ? r.list : []; s.max = r.max != null ? r.max : s.max; s.gift = r.gift != null ? r.gift : s.gift; s.failed = ""; }
    else { s.who = []; s.failed = "現在問不到。"; }
  } catch (e) { if (N !== s) return; s.who = []; s.failed = (e && e.message) || "現在問不到。"; }
  redraw();
}
async function invite(x, redraw) {
  const s = N;
  if (!s || s.busy) return;
  s.busy = x.id; redraw();
  try {
    const r = await NET.call("coopNpc", { pid: s.pid, act: "invite", npc: x.id, gift: !!s.useGift });
    if (N !== s) return;
    const name = (r && r.name) || x.name;
    if (r && r.ok) {
      s.said = { name, line: r.line || "", ok: !!r.accepted };
      s.who = (s.who || []).filter(w => w.id !== x.id); // 答應了＝在隊裡；拒絕了＝一陣子不能再問
      if (r.accepted) { snd("coin"); if (typeof r.chips === "number") setChips(r.chips); } else snd("error");
    } else { s.said = { name, line: (r && r.reason) || "邀不了。", ok: false, reason: true }; snd("error"); }
  } catch (e) { if (N !== s) return; s.said = { name: x.name, line: (e && e.message) || "邀不了。", ok: false, reason: true }; snd("error"); }
  s.busy = null; redraw();
}
async function dismiss(id, redraw) {
  const s = N;
  if (!s || s.busy) return;
  s.busy = "dismiss:" + id; redraw();
  try { await NET.call("coopNpc", { pid: s.pid, act: "dismiss", npc: id }); s.said = null; s.who = null; }
  catch (e) { snd("error"); note((e && e.message) || "沒辦法。", "bad"); }
  if (N !== s) return;
  s.busy = null; redraw(); load(s.pid, redraw);
}

// 準備區的「旅客」區塊。seatsUsed：現在隊上真人＋旅客共幾個座位；canBring：試煉房間、留守的隊帶不了（原因 reason）
export function npcBox(party, pid, o) {
  if (!npcOn() || !UI.net || !NET.loggedIn) return null;
  if (!N || N.pid !== pid) N = fresh(pid);
  const s = N, redraw = o.redraw, inTeam = Object.entries(party.npcs || {}), have = inTeam.length;
  if (s.who === null && !s.busy && !s._loading) { s._loading = true; load(pid, () => { s._loading = false; redraw(); }); }
  const seatsLeft = SEATS - o.seatsUsed, room = Math.min(s.max - have, seatsLeft);
  const chips = typeof UI.chips === "number" ? UI.chips : null, poor = chips != null && chips < s.gift;
  const giftP = NUM.casino.coopNpc.giftP;
  const sayBox = s.said ? h("div", { class: "cx-npc-say" + (s.said.ok ? " ok" : "") },
    h("b", null, s.said.reason ? "沒邀成" : `${s.said.name}${s.said.ok ? "答應了" : "婉拒了"}`),
    h("p", null, s.said.reason ? s.said.line : `「${s.said.line}」`)) : null;
  const mine = inTeam.length ? h("ul", { class: "cx-npc-list" }, inTeam.map(([id, n]) => h("li", { class: "in" },
    h("span", { class: "cx-npc-who" }, h("b", null, npcName(id, n.name), h("small", { class: "cx-npc-tag" }, "旅客")), h("small", null, `${roleText(n.role)}：${roleNote(n.role)}`)),
    btn(s.busy === "dismiss:" + id ? "請他回去……" : "請他回去", () => dismiss(id, redraw), "small", { disabled: s.busy ? true : null, title: "送他的心意不會退回來" })))) : null;
  let list;
  if (o.blocked) list = h("p", { class: "pt-hint" }, o.blocked);
  else if (room <= 0) list = h("p", { class: "pt-hint" }, have >= s.max ? `這隊已經帶了 ${have} 位旅客，最多 ${s.max} 位。` : "隊伍滿了，沒有空位。");
  else if (s.who === null) list = h("p", { class: "pt-hint" }, "問問看誰在館裡……");
  else if (!s.who.length) list = h("p", { class: "pt-hint" }, s.failed || "現在沒有旅客邀得動：他們在館裡的時間有限，今天陪過人的、剛婉拒你的也不會來。晚點再看看。");
  else list = h("ul", { class: "cx-npc-list" }, s.who.map(x => {
    const p = s.useGift ? x.giftChance : x.chance, cool = x.cool > 0;
    return h("li", { class: cool ? "cool" : "" },
      h("span", { class: "cx-npc-who" }, h("b", null, npcName(x.id, x.name), h("small", { class: "cx-npc-tag" }, "旅客")), h("small", null, `${roleText(x.role)}：${roleNote(x.role)}`), h("small", { class: "cx-npc-san" }, sanWord(x.san))),
      h("span", { class: "cx-npc-chance" }, cool ? "剛婉拒了你" : h("span", null, "答應率 ", h("b", null, `${p}%`))),
      btn(cool ? "等壹下再問" : s.busy === x.id ? "邀請中……" : "邀他壹起下去", () => invite(x, redraw), "small primary", { disabled: cool || s.busy ? true : null, title: cool ? coolText(x.cool) : "" }));
  }));
  const giftRow = !o.blocked && room > 0 && s.who && s.who.length ? h("label", { class: "cx-npc-gift" + (poor ? " off" : "") },
    h("input", { type: "checkbox", checked: s.useGift && !poor ? true : null, disabled: poor ? true : null, onChange: e => { s.useGift = !!e.target.checked; redraw(); } }),
    h("span", null, `送他壹點心意：${s.gift.toLocaleString("en-US")} 籌碼，答應率 +${giftP}%`, h("small", null, poor ? "　籌碼不夠" : "　答應了才收，婉拒不收"))) : null;
  return h("div", { class: "cx-npc" }, h("div", { class: "cx-npc-h" }, h("span", { class: "cx-label" }, icon("users"), " 旅客"), h("small", null, `館裡的旅客可以陪你們下去（每隊最多 ${s.max} 位，佔 1 個座位；他不拿獎勵）`)),
    mine, sayBox, list, giftRow);
}
