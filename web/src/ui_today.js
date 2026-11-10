// ================================================================
//  「今天」清單（翊文 11-10：「先做『今天』清單」；整合的第 1 步，見 docs/介面整合規劃.md）
//  今天能做、還沒做的事排在壹張清單：簽到、每週劇情的獎勵、Yuga Bot 交代的、每日任務、每週任務、信箱、賭場的大禮包和拚經濟。
//  每項有「前往」，直接帶到那個地方。做完的收到最下面，不見了也沒關係（各自的地方還在，這裡只是捷徑）。
//  資料不另外存：劇情從 ui_story.js（storyToday）、簽到從 ui_signin.js（signinToday）、信箱跟選單的數字同壹份；
//  賭場剩幾次是伺服器的（casino 的 peek 順便回傳 packs、econ），打開時讀壹次，記著給導覽列的數字用。
//  入口：導覽列「公佈欄」右邊的「今天」、右上角選單最上面。ui_core 不能 import 這個檔：這裡把自己登記進 PANELS、ADDONS。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { syncMail, unclaimedCount } from "../../shared/mailbox.js";
import { visibleNotices } from "../../shared/notices.js";
import { isFree, realTodayStr } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, PANELS, btn, h, icon, snd, updateBoardBadges } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { goStep, openStory, storyToday } from "./ui_story.js";
import { signinToday } from "./ui_signin.js";

// 伺服器上的（大禮包、拚經濟剩幾次）：上壹次讀到的。還沒讀過是 null，不算進數字
let CAS = null;
async function readCasino() {
  if (!NET.me || !P || isFree(P)) return null;
  try {
    const r = await NET.call("casino", { act: "peek" });
    if (r && typeof r.packs === "number") CAS = { packs: r.packs, econ: typeof r.econ === "number" ? r.econ : 0, day: realTodayStr() };
  } catch (e) { /* 讀不到就先不列賭場的，下次打開再讀 */ }
  return CAS;
}
const casNow = () => (CAS && CAS.day === realTodayStr() ? CAS : null);
const mailCount = () => {
  if (!P) return 0;
  const today = realTodayStr();
  syncMail(P, visibleNotices(P, today), today);
  return unclaimedCount(P, today) + (ADDONS.mailCount ? ADDONS.mailCount() : 0);
};

// 清單：{ key, ic, title, sub, todo（還沒做）, label, go }
export function todayItems() {
  const out = [];
  if (!P) return out;
  const add = (key, ic, title, sub, todo, label, go) => out.push({ key, ic, title, sub, todo: !!todo, label, go });
  const sg = signinToday();
  if (sg) add("signin", "calendar", sg.done ? "今天簽到了" : "每日簽到", sg.text, !sg.done, sg.done ? "簽到日曆" : "蓋章簽到", () => (sg.done ? PANELS.calendar : PANELS.signin)());
  const st = storyToday();
  if (st) {
    if (st.claim) add("claim", "gift", "每週劇情有獎勵可以領", `${st.claim} 個`, true, "去領", () => openStory());
    st.daily.filter(t => t.yuga && !t.done).forEach(t => add("yuga-" + t.id, "dice", "Yuga Bot 交代", `${t.yuga}（${t.text}，${t.n}／${t.tgt}）`, true, "前往", () => (t.go ? goStep(t.go) : openStory())));
    st.daily.filter(t => !t.yuga || t.done).forEach(t => add("daily-" + t.id, "book", t.done ? (t.claimed ? "每日任務（領過了）" : "每日任務做完了") : "每日任務", `${t.text}（${t.n}／${t.tgt}）`,
      !t.done || !t.claimed, t.done ? (t.claimed ? "看看" : "領獎勵") : "前往", () => (!t.done && t.go ? goStep(t.go) : openStory())));
    add("weekly", "star", "每週任務", `〈${st.title}〉做完 ${st.weekly[0]}／${st.weekly[1]}`, st.weekly[0] < st.weekly[1], "打開每週劇情", () => openStory());
  }
  const mails = mailCount();
  if (mails) add("mail", "mail", "信箱有東西沒領", `${mails} 封`, true, "打開信箱", () => PANELS.mail());
  const c = casNow();
  if (c && PANELS.casino) {
    add("packs", "gift", "Hamachi 賭場的大禮包", c.packs ? `今天還能開 ${c.packs} 包` : "今天的開完了", c.packs > 0, "去開", () => PANELS.casino({ tab: "packs" }));
    add("econ", "hammer", "拚經濟", c.econ ? `今天還能拚 ${c.econ} 次` : "今天的拚完了", c.econ > 0, "去拚", () => PANELS.casino({ tab: "econ" }));
  }
  return out;
}
// 導覽列「今天」上的數字：還沒做的有幾項（updateBoardBadges 每次都叫）
// 賭場的還沒讀過（或換日了）：背景讀壹次，讀到再更新數字。壹天最多試 3 次，不會壹直打伺服器
let tries = { day: null, n: 0 };
ADDONS.todayCount = () => {
  const day = realTodayStr();
  if (!casNow() && NET.me && P && !isFree(P)) {
    if (tries.day !== day) tries = { day, n: 0 };
    if (tries.n < 3 && !tries.busy) { tries.n++; tries.busy = true; readCasino().then(c => { tries.busy = false; if (c) updateBoardBadges(); }); }
  }
  return todayItems().filter(x => x.todo).length;
};

function rowOf(x, m) {
  return h("li", { class: "td-row" + (x.todo ? "" : " done") },
    h("span", { class: "td-ic", "aria-hidden": "true" }, x.todo ? icon(x.ic) : icon("check")),
    h("span", { class: "td-main" }, h("b", null, x.title), x.sub ? h("small", null, x.sub) : null),
    btn([x.label, " ", h("span", { "aria-hidden": "true" }, "→")], () => { m.close(); x.go(); }, x.todo ? "primary small" : "small ghost"));
}
function bodyOf(m) {
  const all = todayItems(), todo = all.filter(x => x.todo), done = all.filter(x => !x.todo);
  if (!all.length) return h("p", { class: "nb-empty" }, isFree(P) ? "自由模式沒有每日的事，隨便逛吧。" : "今天沒有要做的事。");
  return h("div", { class: "td-body" },
    todo.length ? h("ul", { class: "td-list" }, todo.map(x => rowOf(x, m))) : h("p", { class: "td-all" }, icon("sparkle"), " 今天的都做完了。"),
    done.length ? h("details", { class: "td-done", open: !todo.length || undefined }, h("summary", null, `做完的（${done.length}）`), h("ul", { class: "td-list" }, done.map(x => rowOf(x, m)))) : null,
    NET.me && !casNow() ? h("p", { class: "td-note" }, "賭場剩幾次還在讀……") : null);
}
export async function openToday() {
  const m = overlay("nb-today", "今天", "今天要做的事", "calendar");
  const draw = () => { if (m.layer.isConnected) m.surface.replaceChildren(bodyOf(m)); };
  snd("flip");
  draw();
  if (await readCasino()) { draw(); updateBoardBadges(); }
  else if (m.layer.isConnected) { const n = m.surface.querySelector(".td-note"); if (n) n.remove(); }
}
PANELS.today = openToday;
