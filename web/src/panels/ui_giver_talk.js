// ================================================================
//  交代人互動的畫面（決定 0151，11-21 翊文；規劃 docs/規劃/交代人互動規劃.md）：點他閒聊、熟識度、不在時的字條、臨時拜託、送佩佩。
//  規則在伺服器（casino act "giver"，shared/social/giver.js）：這裡只問「現在的樣子」（op info）、做動作（tap／ask／askDone／gift）、把聽過的句子 id 交給伺服器記（heard）。
//  句子挑哪壹句由畫面決定（台詞在 shared/npc/givers.js）；伺服器只記 id，圖書館的「交談紀錄」（ui_giver_log.js）再從 id 查字。
//  零件：giverTalk(id)＝壹張互動卡（giverNote 把它接在交代的那句後面）；giverLvTag(id)＝任務板用的壹小格熟識度。
//  句子 id：<交代人>:chat.<時段|annoyed|lowSan|named>:<序>、<交代人>:away.<時段>:<序>、<交代人>:errands:<k>:ask|done、<交代人>:gift.<love|ok|off>:<序>。
//  樣式在 css/tasks.css（前綴 gv-）。動畫都是壹次性的。
// ================================================================
import { GIVERS } from "../../../shared/npc/givers.js";
import { nowMs, todayStr } from "../../../shared/core/logic_base.js";
import { NET } from "../core/net_firebase.js";
import { ADDONS, P, PANELS, btn, h, note, snd } from "../core/ui_core.js";
import { tipOn } from "../core/ui_tip.js";

export const GV_LV = ["陌生", "認得", "熟悉", "信得過"];
const ANNOYED_AT = 4, TAP_MAX = 8; // 要跟 NUM.npcRel.tapAnnoyed、tapMax 壹樣（伺服器為準；這裡只決定畫面說哪壹句）
const TIP = { title: "熟識度", what: "做他交代的事、來看他、聊天、送他佩佩，都會讓他更認得你。只換說的話和稱號，不給籌碼。" };

// 時段（台灣時間）：早 5～11、午 11～17、晚 17～23、深夜 23～5
export function giverSlot(ms = nowMs()) {
  const hr = (Math.floor(ms / 3600000) + 8) % 24;
  return hr >= 5 && hr < 11 ? "morning" : hr >= 11 && hr < 17 ? "noon" : hr >= 17 && hr < 23 ? "evening" : "night";
}
export const giverDayNo = () => Math.max(0, Math.floor((Date.parse(todayStr() + "T00:00:00Z") - Date.parse("2026-01-01T00:00:00Z")) / 86400000)) || 0;
const nick = () => (NET.me && NET.me.nick) || "館友";
export const giverFill = s => String(s).split("{name}").join(nick());
// 他現在不在嗎：這個時段沒有閒聊、但有字條
export function giverAway(id, slot = giverSlot()) {
  const G = GIVERS[id];
  return !!G && !((G.chat && G.chat[slot]) || []).length && !!((G.away && G.away[slot]) || []).length;
}
// 挑壹句：{ text, sid }。n＝今天點了幾下（伺服器回的）
export function giverPickLine(id, n, lv) {
  const G = GIVERS[id], slot = giverSlot(), day = giverDayNo();
  if (!G) return null;
  const from = (path, arr) => { const a = arr || []; if (!a.length) return null; const i = (day + n * 2 + id.length) % a.length; return { text: giverFill(a[i]), sid: `${id}:${path}:${i}` }; };
  if (giverAway(id, slot)) return from(`away.${slot}`, G.away[slot]);
  if (n >= ANNOYED_AT) return from("chat.annoyed", G.chat.annoyed);
  if (typeof P.sanity === "number" && P.sanity < 30 && n % 3 === 1) { const r = from("chat.lowSan", G.chat.lowSan); if (r) return r; }
  if (lv >= 1 && n % 3 === 2) { const r = from("chat.named", G.chat.named); if (r) return r; }
  return from(`chat.${slot}`, G.chat[slot]) || from("chat.morning", G.chat.morning);
}

// ---------- 伺服器 ----------
let INFO = null, loading = null;
const cards = new Set();
export const giverWatch = el => { cards.add(el); return el; }; // 讀回來要重畫的元素（要有 paint）
const paintAll = () => cards.forEach(c => (c.isConnected ? c.paint() : cards.delete(c)));
export function giverLoad(force) {
  if (!NET.loggedIn) return null;
  if (INFO && !force) return INFO;
  if (!loading) loading = NET.call("casino", { act: "giver", op: "info" }).then(r => { const g = r && r.ok && (r.giver || r); if (g) INFO = g; }).catch(() => {}).then(() => { loading = null; paintAll(); });
  return INFO;
}
async function ask(data) {
  try { await NET.flush().catch(() => {}); const r = await NET.call("casino", Object.assign({ act: "giver" }, data)); return r && r.giver ? Object.assign({}, r.giver, { ok: r.ok, rev: r.rev }) : r; } catch (e) { return { ok: false, reason: (e && e.message) || "沒辦法。" }; }
}
export const giverHeard = (id, ids) => { const l = ids.filter(Boolean); if (l.length && NET.loggedIn) NET.call("casino", { act: "giver", op: "heard", id, ids: l }).catch(() => {}); };
const view = id => INFO && (INFO.givers || []).find(g => g.id === id);
const offerOf = id => INFO && (INFO.offers || []).find(o => o.id === id);

// 熟識度：四格（目前那格依這級已經漲了多少塗滿壹部分）＋級名＋「再 N 點」（11-21 qa：看不出同級內有漲）
const LV_FROM = [0, 10, 50, 140]; // 要跟 NUM.npcRel.giver.lv 壹樣
function pips(v) {
  const lv = v ? v.lv : 0, frac = v && v.next ? Math.max(0, Math.min(1, ((v.xp | 0) - LV_FROM[lv]) / Math.max(1, v.next - LV_FROM[lv]))) : 0;
  return h("span", { class: "gv-lv", title: v && v.next ? `再 ${v.left} 點到「${GV_LV[Math.min(3, lv + 1)]}」` : "" },
    [0, 1, 2, 3].map(i => h("i", { class: i < lv ? "on" : i === lv ? "cur" : "", style: i === lv && frac ? `--f:${Math.round(frac * 100)}%` : null })), h("small", null, GV_LV[lv] || GV_LV[0]),
    v && v.next ? h("small", { class: "gv-left" }, `再 ${v.left} 點`) : null);
}
export function giverLvTag(id) {
  const el = h("span", { class: "gv-lvtag" });
  el.paint = () => el.replaceChildren(pips(view(id)));
  cards.add(el); el.paint(); tipOn(el, TIP); giverLoad();
  return el;
}

// ---------- 互動卡 ----------
export function giverTalk(id) {
  const G = GIVERS[id];
  if (!G) return null;
  const box = h("div", { class: "gv-talk" });
  let said = null, busy = false;
  const paint = () => {
    const v = view(id), away = giverAway(id), over = !!v && v.taps >= TAP_MAX, off = away || over || !NET.loggedIn;
    const of = offerOf(id), er = of && G.errands && G.errands[of.k];
    const rows = [h("div", { class: "gv-talk-r" },
      h("span", { class: "gv-lvwrap" }, pips(v)),
      away ? h("small", { class: "gv-away" }, "他現在不在，留了字條") : null,
      h("span", { class: "gv-acts" },
        btn(over ? "改天再聊" : away ? "看字條" : "聊聊", () => chat(), "small gv-b", { disabled: (over || !NET.loggedIn || busy) ? true : null, title: over ? "今天聊夠了" : "點他說說話" }),
        btn("送佩佩", () => gift(), "small gv-b", { disabled: !NET.loggedIn || busy || (v && v.gifted) ? true : null, title: v && v.gifted ? "今天已經送過他了" : "送他壹隻佩佩" })))];
    if (said) rows.push(h("p", { class: "gv-say", role: "status" }, said));
    else if (away) rows.push(h("p", { class: "gv-say gv-note", role: "status" }, giverFill(((G.away || {})[giverSlot()] || [""])[0])));
    if (of && er) rows.push(h("div", { class: "gv-ask" + (of.done ? " done" : "") },
      h("span", null, h("b", null, "臨時拜託："), giverFill(of.done ? er.done : er.ask)),
      of.done ? h("small", null, "做完了") : of.accepted ? btn("做完了", () => askDone(of), "small primary", { disabled: busy ? true : null }) : btn("接下", () => take(of), "small primary", { disabled: busy ? true : null })));
    box.replaceChildren(...rows);
  };
  const stat = r => { if (r && r.ok && r.up) note(`${G.name}更認得你了：${GV_LV[r.lv] || ""}。`, "good"); };
  const reload = () => { INFO = null; return giverLoad(true); };
  async function chat() {
    if (busy) return;
    busy = true; paint();
    const r = await ask({ op: "tap", id });
    busy = false;
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "現在聊不了。", "bad"); reload(); return; }
    if (r.over) { said = "改天再聊吧。"; reload(); return; }
    snd("flip");
    const pick = giverPickLine(id, r.n | 0, r.lv | 0);
    if (pick) { said = pick.text; giverHeard(id, [pick.sid]); }
    stat(r); reload();
  }
  async function take(of) {
    busy = true; paint();
    const r = await ask({ op: "ask", id });
    busy = false;
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "沒辦法。", "bad"); } else { snd("flip"); giverHeard(id, [`${id}:errands:${of.k}:ask`]); }
    reload();
  }
  async function askDone(of) {
    busy = true; paint();
    const r = await ask({ op: "askDone", id });
    busy = false;
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "還沒做完。", "bad"); } else { snd("coin"); giverHeard(id, [`${id}:errands:${of.k}:done`]); stat(r); }
    reload();
  }
  function gift() {
    if (!PANELS.giftTo) { note("現在送不了。", "bad"); return; }
    PANELS.giftTo({ id, nick: G.name, intro: `${G.name}收下就不還了（壹天壹隻）。他喜歡什麼，自己猜。`, noAct: true, via: async item => {
      const r = await ask({ op: "gift", id, item });
      if (!r || !r.ok) throw new Error((r && r.reason) || "送不出去。");
      const key = r.react === "like" ? "love" : r.react === "off" ? "off" : "ok", list = (G.gift && G.gift[key]) || [], i = list.length ? (giverDayNo() + id.length) % list.length : 0;
      if (list.length) { said = giverFill(list[i]); giverHeard(id, [`${id}:gift.${key}:${i}`]); }
      stat(r); reload();
      return { rev: r.rev, text: (said || "收下了").replace(/。+$/, ""), close: true };
    } });
  }
  box.paint = paint; cards.add(box); paint(); giverLoad();
  return box;
}
ADDONS.giverTalk = giverTalk;
ADDONS.giverLvTag = giverLvTag;
