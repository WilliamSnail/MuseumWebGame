// ================================================================
//  實況和斗內的畫面（決定 0053；規則 shared/casino_live.js，伺服器 functions/casino.js 的 live／liveOn／liveOff／donate）
//  這個檔放全館共用的部分：
//    聽 Realtime Database 的 casinoLive（Functions 寫、館友讀）：現在誰在實況、最近一則感謝。有人斗內，在線的人都跳一則「○○ 斗內了 N！實況主感謝 ○○ 的斗內～」，
//    收到斗內的人（msg.toUid 是自己）順便重讀籌碼，狀態列的數字跟著變。剛連上那一刻已經在那裡的舊訊息不跳。
//    大廳的一小行「○○ 正在實況」（ADDONS.lobbyLive），點了開賭場的「實況」頁籤。
//  賭場裡的「實況」頁籤在 ui_casino.js（要用賭場的 act、draw）。這裡什麼都不算：誰在播、到期、離線算下播，都用 shared/casino_live.js 的 liveActive，跟伺服器同一份規則；伺服器是準的。
//  文字界線：只顯示遊戲暱稱。動畫：這裡沒有動畫；跳的字用現有的 toast（不擋畫面）。介面上的字用「壹」。
// ================================================================
import { CAS_LIVE } from "../../shared/casino_text.js";
import { casFill, casNum } from "../../shared/casino.js";
import { liveActive, liveFix } from "../../shared/casino_live.js";
import { nowMs } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, PANELS, UI, btn, every, h, icon, note, setChips, snd } from "./ui_core.js";

// 最後聽到的 casinoLive（liveFix 整理過）。ready：已經讀到過（沒讀到＝連不上或規則還沒放，賭場頁籤改用伺服器的回答）
export const LIVE = { node: liveFix(null), ready: false };
const subs = new Set();
// 訂閱：fn("node") 是 casinoLive 變了（要重讀伺服器的數字），fn("roster") 只是館友名單變了（實況主上線、離線，重畫就好）
export const onLive = fn => { subs.add(fn); return () => subs.delete(fn); };
const tell = kind => subs.forEach(fn => { try { fn(kind); } catch (e) { console.error("ui_casino_live.js：訂閱的函式出錯", e); } });

// 現在有人在播就回 { uid, nick, until, mine }，沒有就 null。實況主在館友名單裡離線超過寬限也算下播（跟伺服器同一個規則）
export function liveNow() {
  const s = LIVE.node;
  if (!s.uid) return null;
  const p = NET.roster.find(x => x.id === s.uid);
  const presence = p ? { state: p.status, at: p.lastSeen ? Date.parse(p.lastSeen) : NaN } : null;
  if (!liveActive(s, nowMs(), presence)) return null;
  return { uid: s.uid, nick: s.nick, until: s.until, mine: !!(NET.me && NET.me.id === s.uid) };
}
// 幾點下播（台灣時間）
export const liveClock = ms => new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(new Date(ms));
export const liveThanks = m => casFill(CAS_LIVE.thanks, { from: m.from, n: casNum(m.n) });

// ---------- 聽 casinoLive、跳感謝 ----------
let off = null, first = true, seenId = null;
async function refreshChips() {
  try { const r = await NET.call("casino", { act: "peek" }); if (r && typeof r.chips === "number") setChips(r.chips); } catch (e) { /* 下次進賭場會更新 */ }
}
function onNode(raw) {
  const s = liveFix(raw), m = s.msg;
  LIVE.node = s; LIVE.ready = true;
  if (first) { first = false; seenId = m ? m.id : null; } // 剛連上：已經在那裡的訊息是舊的，不跳
  else if (m && m.id !== seenId) {
    seenId = m.id;
    if (m.toUid && NET.me && m.toUid === NET.me.id) refreshChips(); // 我收到斗內：籌碼變了
    if (nowMs() - m.at < 30000 && UI.net && P && !document.hidden) { snd("coin"); note(liveThanks(m), "good", 7000); }
  }
  tell("node");
}
function stop() {
  if (off) { try { off(); } catch (e) { /* 已經停了 */ } off = null; }
  first = true; seenId = null; LIVE.node = liveFix(null); LIVE.ready = false;
  tell("node");
}
NET.on("status", () => {
  if (NET.state === "online" && !off) off = NET.watch("casinoLive", (v, err) => onNode(err ? null : v));
  else if (NET.state === "stopped") stop();
});
NET.on("logout", stop);
NET.on("roster", () => tell("roster")); // 實況主上線、離線：大廳那一行跟著變

// ---------- 大廳的一小行 ----------
// 一直放著這個盒子（沒人在播就藏起來）：大廳開著的時候有人開播，也會自己出現
function lobbyLive() {
  if (!UI.net) return null;
  const box = h("section", { class: "live-bar", "aria-label": "實況", hidden: true });
  let last = null, started = false, timer = null, unsub = null;
  const draw = () => {
    if (started && !box.isConnected) { if (timer) clearInterval(timer); if (unsub) unsub(); return; } // 換了房間：停掉
    const c = liveNow(), key = c ? c.uid + (c.mine ? "m" : "") : "";
    if (key === last) return; // 沒變就不動，不會閃
    last = key;
    box.hidden = !c;
    if (!c) { box.replaceChildren(); return; }
    box.replaceChildren(
      h("span", { class: "live-dot", "aria-hidden": "true" }),
      h("span", { class: "live-text" }, icon("lamp"), " ", h("b", null, c.mine ? CAS_LIVE.you : casFill(CAS_LIVE.now, { name: c.nick }))),
      btn(c.mine ? "去看看" : CAS_LIVE.lobbyGo, () => { if (PANELS.casino) PANELS.casino({ tab: "live" }); }, "small"));
  };
  timer = every(draw, 5000);
  unsub = onLive(draw);
  draw();
  started = true;
  return box;
}
ADDONS.lobbyLive = lobbyLive;
