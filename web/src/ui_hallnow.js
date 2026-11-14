// ================================================================
//  展廳現在有幾位、NPC 的即時評價（翊文 11-14；伺服器 PR 418：casino act "peek" 多回 now、reviews）
//  - now：{ hall: 展廳現在幾位 NPC 旅客, names: [名字], around: 館裡的 NPC 共幾位 }，算不出來是 null。
//  - reviews：[{ who, text, stars 1～5, at 毫秒, day }]，新的在前，最多 20 則。
//  - 大廳右欄放壹個小區塊（展廳現在幾人＋最近兩則評價）；展廳的側欄放同壹塊。點「看全部」開完整的 20 則。
//  - 各家店「現在」的人數伺服器刻意不給（會變成館內股的套利訊號），這裡不做。
//  - 資料是 ui_today.js 的 readCasino 讀 peek 時記進 UI.hallNow、UI.reviews；這裡每 90 秒再叫壹次（畫面還在才叫）。
//  - 名字、評語是 NPC 說的話，也當不可信的字：只用 h() 的字串。
// ================================================================
import { matesByRoom } from "../../shared/mates.js";
import { NPC_ROSTER } from "../../shared/npc_roster.js";
import { NET } from "./net_firebase.js";
import { ADDONS, UI, btn, closeOnOutside, every, h, miniLayer } from "./ui_core.js";

const REFRESH_MS = 90000; // 1～2 分鐘壹次（伺服器的建議）；回到畫面時 readCasino 本來就會叫
const agoText = at => {
  const s = Math.max(0, Math.round((Date.now() - Number(at || 0)) / 1000));
  if (!at || s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
};
const starText = n => { const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return "★".repeat(k) + "☆".repeat(5 - k); };
const reviewItem = r => h("li", { class: "hn-rv" },
  h("span", { class: "hn-st", role: "img", "aria-label": `${Math.round(Number(r.stars) || 0)} 顆星` }, starText(r.stars)),
  h("span", { class: "hn-tx" }, String(r.text || "")),
  h("small", { class: "hn-by" }, `${String(r.who || "旅客")}・${agoText(r.at)}`));

// 開發的時候沒登入：用示範資料把畫面畫出來（玩家看不到）
const fake = () => import.meta.env.DEV && !NET.me;
const FAKE_NOW = { hall: 2, names: ["夜班的畫商", "戴帽子的旅客"], around: 5, named: { hall: 2, names: ["夜班的畫商", "戴帽子的旅客"] }, crowd: { n: 15, groups: [{ label: "三位學生", n: 3 }, { label: "旅行團", n: 12 }] }, total: 17 };
const FAKE_POLICY = { name: "兩岸服務業、貨品貿易協定", effect: "門票多一成", day: "2026-11-14", until: "2026-11-15" };
const policyData = () => (UI.policy !== undefined ? UI.policy : fake() ? FAKE_POLICY : null);
// 「2026-11-15」→「11/15」
const mdText = d => { const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(d || "")); return m ? `${+m[2]}/${+m[3]}` : ""; };
const FAKE_RV = () => [{ who: "夜班的畫商", text: "牆上的畫掛得很正，燈也剛好。下次想看看更暗的那一幅。", stars: 4, at: Date.now() - 3 * 60000, day: 1 }, { who: "戴帽子的旅客", text: "走進來就安靜了。", stars: 5, at: Date.now() - 41 * 60000, day: 1 }, { who: "撐傘的人", text: "有點冷。", stars: 2, at: Date.now() - 3 * 3600000, day: 1 }];
const nowData = () => (UI.hallNow !== undefined ? UI.hallNow : fake() ? FAKE_NOW : null);
const reviewData = () => (Array.isArray(UI.reviews) ? UI.reviews : fake() ? FAKE_RV() : null);
// 展廳現在的人：館友（名單裡在展廳的）＋旅客（now.hall）
function counts() {
  const mates = (matesByRoom(NET.roster || []).hall || []);
  const now = nowData();
  // PR 430：now.named（有名字的 NPC）、now.crowd（散客，不具名的團體）、now.total（展廳總人數）；舊的 now.hall／names 只算有名字的
  const named = now && now.named ? now.named : now ? { hall: now.hall, names: now.names } : null;
  const tourists = named ? Math.max(0, Number(named.hall) || 0) : 0;
  const crowd = now && now.crowd ? { n: Math.max(0, Number(now.crowd.n) || 0), groups: Array.isArray(now.crowd.groups) ? now.crowd.groups.map(g => ({ label: String(g.label || "散客"), n: Number(g.n) || 0 })) : [] } : { n: 0, groups: [] };
  const people = now && typeof now.total === "number" ? Math.max(0, now.total) : tourists + crowd.n;
  return { mates, tourists, crowd, names: named && Array.isArray(named.names) ? named.names.map(String) : [], total: mates.length + people, known: !!now };
}
// 散客的描述：label 已經寫了人數（三位學生、一對情侶、2 人）就不再補「N 位」；沒寫的（旅行團、退休的長輩們）才補
const HAS_COUNT = /[0-9０-９一二兩三四五六七八九十壹貳參肆伍陸柒捌玖拾百]|一對/;
export const crowdText = g => (HAS_COUNT.test(g.label) ? g.label : `${g.label} ${g.n} 位`);
function openAll() {
  const c = counts(), list = reviewData() || [];
  const m = miniLayer("展廳的評價", c.known ? `展廳現在有 ${c.total} 位（館友 ${c.mates.length}、旅客 ${c.tourists}、散客 ${c.crowd.n}）。` : "現在算不出展廳的人數。");
  m.card.classList.add("hn-layer");
  m.card.append(
    c.names.length ? h("p", { class: "hn-names" }, h("b", null, "旅客："), c.names.join("、")) : null,
    c.crowd.groups.length ? h("p", { class: "hn-names" }, h("b", null, "散客："), c.crowd.groups.map(crowdText).join("、")) : null,
    c.mates.length ? h("p", { class: "hn-names" }, h("b", null, "館友："), c.mates.map(x => x.nick).join("、")) : null,
    list.length ? h("ul", { class: "hn-list" }, list.map(reviewItem)) : h("p", { class: "hn-empty" }, "還沒有評價。旅客走進展廳的時候，會留一句話。"),
    h("div", { class: "hn-acts" }, btn("知道了", () => m.close(), "primary")));
  closeOnOutside(m);
}

// 小區塊：mode "lobby"（大廳右欄，深色）或 "hall"（展廳側欄，羊皮紙）。回傳節點；畫面還在就每 90 秒重抓
export function hallNowBox(mode) {
  const box = h("section", { class: "hn-box hn-" + mode, "aria-label": "展廳現在、最近的評價" });
  let shown = false; // 第壹次畫的時候還沒掛上畫面，不能拿 isConnected 判斷
  const draw = () => {
    if (shown && !box.isConnected) return; // 換了房間：不再畫（計時器會被 clearTimers 清掉）
    if (box.isConnected) shown = true;
    const c = counts(), all = reviewData(), lobby = true, list = (all || []).slice(0, lobby ? 1 : 2);
    const pol = policyData();
    const more = (all && all.length) || c.names.length || c.mates.length || c.crowd.n ? btn("看全部", openAll, "ghost small hn-more") : null;
    box.replaceChildren(
      h("div", { class: "hn-h" }, h("span", null, c.known ? `展廳現在有 ${c.total} 人` : "展廳現在", c.known ? h("small", { class: "hn-sub", title: c.names.join("、") }, `館友 ${c.mates.length}・旅客 ${c.tourists}${c.crowd.n ? `・散客 ${c.crowd.n}` : ""}`, c.names.length ? `：${c.names.slice(0, 3).join("、")}${c.names.length > 3 ? `…等 ${c.names.length} 位` : ""}` : "") : null), lobby ? more : null),
      !lobby && c.names.length ? h("p", { class: "hn-names" }, h("b", null, "旅客："), c.names.slice(0, 4).join("、"), c.names.length > 4 ? `…等 ${c.names.length} 位` : "") : null,
      lobby ? null : h("div", { class: "hn-h hn-h2" }, "最近的評價"),
      list.length ? h("ul", { class: "hn-list" }, list.map(reviewItem)) : h("p", { class: "hn-empty" }, all ? "還沒有評價。" : "還沒有讀到。"),
      pol ? h("p", { class: "hn-policy", title: `${pol.name}：${pol.effect}` }, h("b", null, "本日政策"), ` ${pol.effect}${mdText(pol.until) ? `・到 ${mdText(pol.until)}` : ""}・${pol.name}`) : null,
      lobby ? null : more);
  };
  ADDONS.hallNowDraw = draw; // 讀到新的 peek：ui_today.js 叫這個，畫著的小區塊就跟著換
  every(() => { if (ADDONS.peekAgain) ADDONS.peekAgain().then(draw); }, REFRESH_MS);
  every(draw, 30000); // 「幾分鐘前」跟著走
  draw();
  return box;
}
ADDONS.hallNowBox = hallNowBox;
ADDONS.hallReviews = side => { side.insertBefore(hallNowBox("hall"), side.children[1] || null); }; // 放在「主題」下面、參觀者留言上面 // 展廳的側欄（ui_screens2.js 的 SCREENS.hall）
// 館友名單有變：展廳的人數也跟著算
NET.on && NET.on("roster", () => { if (ADDONS.hallNowDraw) ADDONS.hallNowDraw(); });

// ---------- 旅客留言簿（圖書館的頁籤，11-14）----------
// 伺服器 casino act "reviews"（PR 421）：{ day, who, limit ≤ 50 } → { ok, day（沒給＝有資料的最新一天；沒資料＝null）, items: [{ id, who, npc, text, stars, at, day }], total, prevDay, nextDay }
// 按日期前後翻（prevDay／nextDay）、可以只看一位旅客；沒登入的開發環境用示範資料
async function loadReviews(gb) {
  if (fake()) {
    const all = FAKE_RV().map(x => Object.assign({ day: "2026-11-14", npc: x.who }, x)).filter(x => !gb.who || x.who === ((NPC_ROSTER.find(n => n.id === gb.who) || {}).name || gb.who));
    return { ok: true, day: all.length ? "2026-11-14" : null, items: all, total: all.length, prevDay: null, nextDay: null };
  }
  const q = { act: "reviews", limit: 50 };
  if (gb.day) q.day = gb.day;
  if (gb.who) q.who = gb.who;
  return NET.call("casino", q);
}
// 選一位 NPC：名單是 shared/npc_roster.js（旅客 visitor、委託人 client；劇情角色 trace 不留評價，不在名單裡，這裡也擋掉）
const npcsOf = kind => NPC_ROSTER.filter(n => n.kind === kind && n.kind !== "trace");
function guestbook() {
  const gb = UI.gb || (UI.gb = { day: null, who: "", data: null, busy: false, failed: false }); // who：NPC 的 id（shared/npc_roster.js）
  const root = h("div", { class: "hn-gb" });
  const go = patch => { Object.assign(gb, patch); fetchIt(); };
  const fetchIt = async () => {
    if (gb.busy) return;
    gb.busy = true; gb.failed = false; draw();
    try {
      const r = await loadReviews(gb);
      if (r && r.ok) { gb.data = r; gb.day = r.day || null; }
      else gb.failed = true;
    } catch (e) { gb.failed = true; }
    gb.busy = false;
    if (root.isConnected || !gb.data) draw();
  };
  const npcChips = (kind, chip) => npcsOf(kind).map(n => chip(n.name, gb.who === n.id, () => go({ who: n.id, day: null })));
  const draw = () => {
    const d = gb.data, items = d && Array.isArray(d.items) ? d.items : [];
    const chip = (label, on, fn) => h("button", { type: "button", class: "hn-chip" + (on ? " on" : ""), "aria-pressed": String(!!on), disabled: gb.busy ? "" : null, onClick: fn }, label);
    const nav = (label, day) => h("button", { type: "button", class: "hn-chip hn-nav", disabled: day && !gb.busy ? null : "", onClick: () => go({ day }) }, label);
    root.replaceChildren(
      h("aside", { class: "hn-gb-side" },
        h("h3", null, "日期"),
        h("div", { class: "hn-daynav" }, nav("‹ 前一天", d && d.prevDay), h("b", { class: "hn-day" }, d && d.day ? String(d.day) : "—"), nav("後一天 ›", d && d.nextDay)),
        h("h3", null, "旅客"),
        h("div", { class: "hn-chips" }, chip("全部", !gb.who, () => go({ who: "", day: null })), npcChips("visitor", chip)),
        h("h3", null, "委託人"),
        h("div", { class: "hn-chips" }, npcChips("client", chip)),
        h("p", { class: "hn-note" }, "按「前一天」「後一天」翻日期；選一位旅客，只看他留的話。")),
      h("section", { class: "hn-gb-main", "aria-label": "旅客留言" },
        h("div", { class: "hn-gb-head" }, h("b", null, "旅客留言簿"), h("small", null, d ? `${d.day || ""}　共 ${Number(d.total) || items.length} 則` : "")),
        gb.busy && !d ? h("p", { class: "hn-empty" }, "翻留言簿中……")
          : gb.failed ? h("p", { class: "hn-empty" }, "現在讀不到留言簿，晚點再來。")
          : items.length ? h("ul", { class: "hn-list hn-gb-list" }, items.map(x => h("li", { class: "hn-rv" },
            h("span", { class: "hn-st", role: "img", "aria-label": `${Math.round(Number(x.stars) || 0)} 顆星` }, starText(x.stars)),
            h("span", { class: "hn-tx" }, String(x.text || "")),
            h("small", { class: "hn-by" }, `${String(x.who || "旅客")}・${agoText(x.at)}`))))
          : h("p", { class: "hn-empty" }, "還沒有旅客留言。旅客走進展廳的時候，會留一句話。")));
  };
  ADDONS.hallNowDraw = () => { if (root.isConnected && !gb.data) fetchIt(); };
  draw();
  fetchIt();
  return root;
}
ADDONS.guestbook = guestbook;
