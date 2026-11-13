// ================================================================
//  Hamachi 賭場的畫面（決定 0040；規則在 shared/casino*.js，伺服器在 functions/casino.js）
//  這個檔只畫「伺服器給我的樣子」，什麼都不算：發牌、點數、派彩、錢包都在伺服器。畫面只拿得到看得到的牌，莊家的底牌結算才給。
//  入口：右上角「選單」的「Hamachi 賭場」（ui_core.js 的 buildNav → PANELS.casino）。
//  蓋在畫面上的木框＋綠絨布（ui_board.js 的 overlay）。頁籤：牌桌、本週收藏、大禮包、拚經濟、實況（決定 0053）、餐車、換小獎、成就、財產。
//  「本週收藏」（決定 0042）：這週的收藏品和進度、集滿領週章、讀集滿的故事；畫在 ui_casino_week.js，進度和領獎都是伺服器的。
//  荷官是 Yuga Bot，台詞是舊 Discord 21 點的（shared/casino_text.js）。理智低的時候伺服器給的牌會是假的，結算才翻回真的。
//  籌碼跟靈感分開，沒有真錢。介面文字照第 1 代用「壹」。名字、說明都是草稿，Yuga 可以改。
//  第二階段的館友同桌在 ui_casino_table.js（登記 ADDONS.casinoTable）。
// ================================================================
import { NUM } from "../../shared/config.js";
import { CAS_ACH, CAS_BANK, CAS_BOND, CAS_ECON, CAS_FIND_TEXT, CAS_LIVE, CAS_MENU, CAS_PACKS, CAS_TEXT } from "../../shared/casino_text.js";
import { casCardName, casFill, casHand, casNum } from "../../shared/casino.js";
import { casCleanSouvenirs, casCleanTitle, casFoodWords, casPoorReason } from "../../shared/casino_wallet.js";
import { yugaLine, yugaMarkSaid } from "../../shared/story.js";
import { exchangeUse } from "../../shared/shop.js";
import { isFree, todayStr } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, PANELS, UI, btn, h, holdFor, icon, markText, miniLayer, motionOff, netRoom, note, persist, setChips, snd, wait } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { CAS_WK, setWkView, weekCollection } from "./ui_casino_week.js";
import { loadReport, reportNodes } from "./ui_casino_report.js";
import { eventTagNode, liveEvent } from "./ui_events.js";
import { casinoDefOf, curWeek, weekCasino } from "./ui_story.js";
import { slotMachine } from "./ui_casino_slot.js";
import { LIVE, liveClock, liveNow, liveThanks, onLive } from "./ui_casino_live.js";

const fill = casFill;
const pick = a => a[Math.floor(Math.random() * a.length)]; // 荷官亂說話用，不影響結果（結果在伺服器）
const TABS = [["table", "牌桌", "cards"], ["week", "本週收藏", "star"], ["packs", "大禮包", "gift"], ["econ", "拚經濟", "hammer"], ["live", "實況", "lamp"], ["diner", "餐車", "food"], ["swap", "換小獎", "exchange"], ["ach", "成就", "medal"], ["props", "財產", "gem"]]; // 頁籤的圖示（翊文 11-09）

// ---------- 一張牌 ----------
export function cardEl(c, o = {}) {
  if (c < 0) return h("span", { class: "cas-card back", "aria-label": "蓋著的牌" }, h("i", { "aria-hidden": "true" }));
  const suit = Math.floor(c / 13), red = suit === 1 || suit === 2;
  const name = casCardName(c);
  return h("span", { class: "cas-card" + (red ? " red" : "") + (o.cls ? " " + o.cls : ""), "aria-label": name, role: "img" }, h("b", null, name.slice(0, -1)), h("i", { "aria-hidden": "true" }, name.slice(-1)));
}
export function handEl(cards, o = {}) {
  return h("div", { class: "cas-hand" + (o.warped ? " shaky" : ""), "aria-label": o.label || "牌" }, cards.map((c, i) => cardEl(c, { cls: o.fresh === i ? "fresh" : "" })));
}

// ---------- 狀態 ----------
let S = null; // { m, tab, w, round, house, say, busy, shown（莊家翻開幾張，null＝全部）, shownTotal, last, legacyAsked, packs, dinerLines, ... }

async function call(act, data) {
  const r = await NET.call("casino", Object.assign({ act }, data || {}));
  if (r && r.wallet && typeof r.wallet.chips === "number") setChips(r.wallet.chips); // 狀態列跟著變
  return r;
}
function sync(r) {
  if (!S || !r) return;
  if (r.wallet) { S.w = r.wallet; if (ADDONS.workPeek) ADDONS.workPeek(r.wallet); } // 欠款要送人下去、還清了回來（決定 0064，ui_work.js）
  if ("round" in r) S.round = r.round;
  if (r.house) S.house = r.house;
  if (r.econ && Number.isFinite(r.econ.left)) S.ec = { left: r.econ.left, perDay: r.econ.perDay }; // 拚經濟今天還剩幾次（伺服器算的）
  if (r.wk) { setWkView(r.wk); S.wk = r.wk; } // 每週收藏的進度（伺服器算的）
  if (Array.isArray(r.wkNew) && r.wkNew.length) S.wkNew = (S.wkNew || []).concat(r.wkNew); // 新的收藏品：等牌翻完再告訴他（celebrate）
  if (r.wkDone) S.wkDone = true;
  if (r.reopen) say([r.reopen]);
  if (r.bank) S.bank = r.bank; // Yuga Bot 銀行的活存、定存（伺服器算的，shared/casino_bank.js）
  if (r.bond) S.bond = r.bond; // 館債（shared/casino_bond.js）
  if (Array.isArray(r.bankNotes) && r.bankNotes.length) say(r.bankNotes); // 利息入帳、定存到期
}
function say(lines) {
  if (!S) return;
  for (const l of lines) if (l) S.say.push(String(l));
  S.say = S.say.slice(-8);
}
// 一個動作：送給伺服器、等結果。荷官的挑剔（ok: false，gag）也是荷官在說話，不是錯誤
async function act(name, data, then) {
  const s = S;
  if (!s || s.busy) return null;
  s.busy = true; draw();
  let r = null;
  try {
    r = await call(name, data);
    if (S !== s) return r;
    if (!r.ok) {
      snd("error");
      // 錢不夠（買不起、下注不夠）而且借得到：多說壹句可以借
      const why = (r.reason || "沒辦法。") + (casPoorReason(r.reason) && s.w && s.w.canRelief && !(s.round && s.round.state === "playing") ? "。" + CAS_TEXT.reliefPoor : "");
      if (name === "deal" && r.gag) say([why]); else note(why, "bad");
      s.busy = false; draw();
      return r;
    }
    sync(r);
    if (then) await then(r);
  } catch (e) {
    snd("error"); note((e && e.message) || "沒辦法。", "bad");
  }
  if (S === s) { s.busy = false; draw(); }
  return r;
}

// ---------- 開、關 ----------
export async function openCasino(o) {
  if (!P) return;
  if (!UI.net || !NET.loggedIn) { note("Hamachi 賭場在伺服器上：要登入才進得去。", "bad"); return; }
  // 劇情面板的「去賭場」直接開到「本週收藏」
  const want = o && typeof o.tab === "string" && TABS.some(t => t[0] === o.tab) ? o.tab : null;
  if (S && S.m && S.m.layer.isConnected) { if (want) goTab(want); return; }
  const m = overlay("nb-casino", CAS_TEXT.title, CAS_TEXT.title, "dice", () => { S = null; NET.where(netRoom(UI.screen)); });
  NET.where("casino"); // 大廳導覽圖、館友名單看得到有誰在賭場
  S = { m, tab: want || "table", w: null, round: null, house: null, say: [], busy: true, shown: null, last: null, packs: null, dinerLines: [], lastBet: "10000" };
  const s = S;
  draw();
  snd("flip");
  try {
    await NET.flush().catch(() => {});
    const r = await call("open");
    if (S !== s) return;
    sync(r);
    say([pick(CAS_TEXT.hello), Math.random() < 0.5 ? pick(CAS_ECON.chat) : pick(CAS_TEXT.idle)]); // 荷官的身世壹點壹點露出來（拚經濟）
    if (r.round && r.round.state === "playing") say(["上次那壹手還沒打完，繼續吧。"]);
    // Yuga Bot 交代的任務（今天的每日任務有 giver）：沒做完，荷官說那句話；做完了說 done，只說壹次（記在存檔 P.story.said）
    const yl = yugaLine(P, curWeek());
    if (yl) { say([yl.text]); if (yl.kind === "done") { yugaMarkSaid(P, yl.id, todayStr()); persist(); } }
    s.busy = false; draw();
    if (s.tab === "live") liveLoad();
    if (s.tab === "econ") reportLoad();
    if (r.legacy) legacyCard(r.legacy);
    if (Array.isArray(r.loanNotes) && r.loanNotes.length) { say(r.loanNotes); snd("error"); draw(); } // 到期沒還，Yuga 收走了（決定 0064）
  } catch (e) {
    if (S !== s) return;
    m.surface.replaceChildren(h("p", { class: "nb-empty" }, (e && e.message) || "連不上賭場。"));
    s.busy = false;
  }
}

// ---------- 畫面 ----------
function chipsPill() {
  return h("span", { class: "cas-chips", title: CAS_TEXT.chipsNote }, icon("dice"), " 籌碼 ", h("b", null, casNum(S.w ? S.w.chips : 0)));
}
function draw() {
  if (!S || !S.m.layer.isConnected) return;
  const m = S.m;
  m.setTop(S.w ? chipsPill() : null);
  if (!S.w) { m.surface.replaceChildren(h("p", { class: "nb-empty" }, "正在入座……")); return; }
  const old = m.surface.querySelector(".cas-body"), keepY = old && old.dataset.tab === S.tab ? old.scrollTop : 0;
  const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": CAS_TEXT.title }, TABS.map(([id, name, ic]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(id === S.tab), class: "nb-tab" + (id === S.tab ? " on" : ""), disabled: S.busy ? true : null, onClick: () => goTab(id) }, icon(ic), " ", name)));
  const body = S.tab === "table" ? tablePane() : S.tab === "week" ? weekPane() : S.tab === "packs" ? packsPane() : S.tab === "econ" ? econPane() : S.tab === "live" ? livePane() : S.tab === "diner" ? dinerPane() : S.tab === "swap" ? swapPane() : S.tab === "ach" ? achPane() : propsPane();
  const box = h("div", { class: "cas-body", dataset: { tab: S.tab } }, body);
  // 銀行放在右邊壹欄（翊文 11-11：「可以讓銀行一直顯示在右邊嗎，這樣才不會檔到其他賭場介面」）；窄的畫面照舊放在上面（css 的 order）
  m.surface.replaceChildren(...[tabs, h("div", { class: "cas-row" }, box, reliefBar()), h("p", { class: "cas-foot" }, CAS_TEXT.series)].filter(Boolean));
  box.scrollTop = keepY;
  const sb = box.querySelector(".cas-say"); if (sb) sb.scrollTop = sb.scrollHeight; // 荷官最新的話在最下面
}
const sec = (title, ...kids) => h("section", { class: "cas-sec" }, title ? h("h3", null, title) : null, ...kids);
// 跟 Yuga Bot 借（決定 0064：平常就看得到，每筆有利息、幾天內要還）。規則在 shared/casino_wallet.js 的 casBorrow、casRepay，伺服器 act borrow、repay。
// 每個頁籤上方壹條：還能借多少、借的按鈕；有沒還的就列出來，每筆壹顆「還」。借不了的時候寫原因
function reliefBar() {
  const w = S.w;
  if (!w || !w.loan) return null;
  const L = w.loan, playing = !!(S.round && S.round.state === "playing");
  // 平常收成壹條（翊文 11-13：賭場要能快速切換遊戲和銀行，不要互相擋；「簡易銀行也可以按一個按鈕到完整銀行」）：
  // 存款、未還兩個數字＋「展開」「去銀行」。展開才是下面整塊；完整的在銀行廳（ui_bank.js）
  if (!S.bankOpen) {
    const held = S.bank ? S.bank.save + S.bank.terms.reduce((s, x) => s + x.amt, 0) : 0, owed0 = L.list.reduce((s, x) => s + x.owe, 0);
    const goBank = ADDONS.bankHall && ADDONS.bankOpen ? () => { S.m.close(); ADDONS.bankHall.open(); } : null;
    return h("section", { class: "cas-bank slim" + (w.chips < 0 ? " debt" : ""), "aria-label": CAS_TEXT.bankName },
      h("span", { class: "bk-seal", "aria-hidden": "true" }, "Y"),
      h("span", { class: "bk-slim-t" }, h("b", null, CAS_TEXT.bankName),
        h("small", null, `存款 ${casNum(held)}・未還 ${casNum(owed0)}${L.left >= L.min && !L.why ? `・可借 ${casNum(L.left)}` : ""}`)),
      btn("展開", () => { S.bankOpen = true; draw(); }, "small", { "aria-expanded": "false" }),
      goBank ? btn("去銀行", goBank, "small primary") : null);
  }
  const why = playing ? CAS_TEXT.loanPlaying : L.why;
  const off = S.busy ? true : null;
  const borrow = amt => act("borrow", { amt }, r2 => { say(r2.lines); snd("coin"); celebrate(r2.ach); });
  const opts = why ? [] : L.quick.filter(n => n <= L.left).map(n => btn(casNum(n), () => borrow(n), "small", { disabled: off })).concat(L.left >= L.min ? [btn(`全額 ${casNum(L.left)}`, () => borrow("max"), "primary small", { disabled: off })] : []);
  // 銀行的樣子（翊文 11-10：「介面稍微在更精美一點，像銀行一點」）：行名和狀態、三格數字、借款金額、借款明細（像存摺）
  const debt = w.chips < 0, owed = L.list.reduce((s, x) => s + x.owe, 0);
  const fig = (label, value, sub) => h("div", { class: "bk-fig" }, h("span", { class: "bk-fig-l" }, label), h("b", null, value), sub ? h("small", null, sub) : null);
  const md = s => s.slice(5).replace("-", "/");
  // 借款、存款兩個頁籤（11-13，Yuga Bot 銀行的活存、定存）
  const bt = S.bankTab === "save" && S.bank ? "save" : "loan";
  const btab = (id, name) => h("button", { type: "button", role: "tab", class: "bk-tab" + (bt === id ? " on" : ""), "aria-selected": String(bt === id), onClick: () => { S.bankTab = id; draw(); } }, name);
  const head = h("header", { class: "bk-head" },
    h("span", { class: "bk-seal", "aria-hidden": "true" }, "Y"),
    h("span", { class: "bk-name" }, h("b", null, CAS_TEXT.bankName), h("small", null, CAS_TEXT.bankBranch)),
    h("span", { class: "bk-state " + (debt ? "bad" : L.list.length ? "open" : "good") }, debt ? "欠款中" : L.list.length ? `借款中 ${L.list.length} 筆` : "信用良好"));
  const fold = h("div", { class: "bk-fold" }, btn("收起來", () => { S.bankOpen = false; draw(); }, "small"), ADDONS.bankHall && ADDONS.bankOpen ? btn("去銀行（完整）", () => { S.m.close(); ADDONS.bankHall.open(); }, "small primary") : null);
  const tabsRow = S.bank ? h("div", { class: "bk-tabs", role: "tablist", "aria-label": CAS_TEXT.bankName }, btab("loan", CAS_BANK.tabLoan), btab("save", `${CAS_BANK.tabSave}${S.bank.save + S.bank.terms.reduce((s, x) => s + x.amt, 0) > 0 ? "・" + casNum(S.bank.save + S.bank.terms.reduce((s, x) => s + x.amt, 0)) : ""}`)) : null;
  if (bt === "save") return h("section", { class: "cas-bank", "aria-label": CAS_TEXT.bankName }, head, fold, tabsRow, savePane(fig, md, off));
  return h("section", { class: "cas-bank" + (debt ? " debt" : ""), "aria-label": CAS_TEXT.bankName },
    head, fold, tabsRow,
    h("div", { class: "bk-figs" },
      fig("可借金額", casNum(L.left), `信用額度 ${casNum(L.limit)}`),
      fig("未還本息", casNum(owed), L.list.length ? `最近到期 ${md(L.list[0].due)}` : "沒有借款"),
      fig("利率・期限", `${L.pct}%`, `每筆固定・${NUM.casino.loan.repayAfterMin} 分鐘後可還・${L.days} 天內還清`)),
    h("div", { class: "bk-act" },
      why ? h("p", { class: "bk-why" }, why)
        : [h("span", { class: "bk-act-l" }, "借款金額"), h("span", { class: "bk-act-b" }, opts)]),
    // 在地下室工作的那位（決定 0064 第二部分）
    w.work ? h("div", { class: "bk-work" }, h("span", null, ADDONS.workLine ? ADDONS.workLine() : ""), ADDONS.workCheer ? btn(CAS_TEXT.workCheer, () => ADDONS.workCheer(), "small", { disabled: off }) : null) : null,
    L.list.length ? h("table", { class: "bk-book" },
      h("thead", null, h("tr", null, ["借款日", "本金", "應還本息", "到期日", ""].map(t => h("th", { scope: "col" }, t)))),
      h("tbody", null, L.list.map(x => h("tr", { class: x.today ? "today" : "" },
        h("td", null, md(x.day)), h("td", null, casNum(x.amt)), h("td", null, h("b", null, casNum(x.owe))),
        h("td", null, x.today ? "今天" : md(x.due)),
        h("td", null, x.from && Date.now() < x.from ? h("small", { class: "bk-soon" }, `${new Date(x.from).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" })} 起可還`) : btn("還款", () => act("repay", { id: x.id }, r2 => { say(r2.lines); snd("coin"); }), "small", { disabled: off || playing || w.chips < x.owe ? true : null })))))) : null);
}

// Yuga Bot 銀行的存款頁（活存、定存）。規則在 shared/casino_bank.js，伺服器 act bank（op：put、take、term、break）
function savePane(fig, md, off) {
  const B = S.bank, w = S.w;
  const bank = (op, extra) => act("bank", Object.assign({ op }, extra), r2 => { say(r2.lines); snd("coin"); });
  const can = n => n <= w.chips;
  const puts = B.quick.filter(n => n >= B.min).map(n => btn(casNum(n), () => bank("put", { amt: n }), "small", { disabled: off || !can(n) ? true : null }))
    .concat(w.chips >= B.min ? [btn(`全部 ${casNum(w.chips)}`, () => bank("put", { amt: "max" }), "small", { disabled: off })] : []);
  const takes = B.save > 0 ? [btn(`全部領出 ${casNum(B.save)}`, () => bank("take", { amt: "max" }), "small", { disabled: off })] : [];
  // 定存先挑金額再挑天數（測試 11-13：以前壹按就把手上籌碼全存進去，新手容易誤觸）。預設最少的那壹檔
  const termAmts = [...new Set([B.termMin].concat(B.quick).filter(n => n >= B.termMin && n <= B.termCap))].sort((a, b) => a - b);
  if (!termAmts.includes(S.termAmt)) S.termAmt = termAmts[0];
  const amtBtns = termAmts.map(n => btn(casNum(n), () => { S.termAmt = n; draw(); }, "small" + (S.termAmt === n ? " primary" : ""), { disabled: off || n > w.chips ? true : null, "aria-pressed": String(S.termAmt === n) }));
  const kinds = B.kinds.map(k => {
    const amt = S.termAmt, int = Math.floor(amt * k.pct / 100);
    return btn(`存 ${casNum(amt)}・${k.days} 天 ${k.pct}%（+${casNum(int)}）`, () => bank("term", { amt, kind: k.i }), "small", { disabled: off || amt > w.chips || B.terms.length >= B.termMax ? true : null });
  });
  return h("div", { class: "bk-save" },
    h("div", { class: "bk-figs" },
      fig(CAS_BANK.save, casNum(B.save), `每天 ${B.savePct}%・明天約 +${casNum(B.perDay)}`),
      fig(CAS_BANK.term, casNum(B.terms.reduce((s, x) => s + x.amt, 0)), `${B.terms.length}／${B.termMax} 筆`),
      fig("累計利息", casNum(B.earned), "莊家付的")),
    h("div", { class: "bk-act" }, h("span", { class: "bk-act-l" }, "存活存"), h("span", { class: "bk-act-b" }, puts.length ? puts : h("small", null, CAS_BANK.poor)), takes.length ? h("span", { class: "bk-act-b" }, takes) : null),
    h("div", { class: "bk-act" }, h("span", { class: "bk-act-l" }, "開定存：先挑金額"), h("span", { class: "bk-act-b" }, amtBtns), h("span", { class: "bk-act-b" }, kinds)),
    B.terms.length ? h("table", { class: "bk-book" },
      h("thead", null, h("tr", null, ["期間", "本金", "利息", "到期", ""].map(t => h("th", { scope: "col" }, t)))),
      h("tbody", null, B.terms.map(x => h("tr", null,
        h("td", null, `${x.days} 天`), h("td", null, casNum(x.amt)), h("td", null, h("b", null, "+" + casNum(x.int))),
        h("td", null, x.left ? `${md(x.due)}（${x.left} 天）` : "今天換日"),
        h("td", null, btn("解約", () => bank("break", { id: x.id }), "small", { disabled: off, title: CAS_BANK.termSub })))))) : null,
    h("p", { class: "bk-rule" }, CAS_BANK.rule),
    bondBlock(fig, md, off));
}
// 館債（11-13）：這期的名字、利率、還剩多少、我買了多少；買的按鈕（壹張壹張、或買滿）。銀行廳上線後搬過去
function bondBlock(fig, md, off) {
  const D = S.bond, w = S.w;
  if (!D) return null;
  const buy = amt => act("bank", { op: "bond", amt }, r2 => { say(r2.lines); snd("coin"); });
  const I = D.issue;
  const room = I.open ? Math.max(0, Math.min(I.cap - I.sold, D.perUser - D.mine, w.chips)) : 0;
  const why = !I.open ? CAS_BOND.none : D.young ? casFill(CAS_BOND.young, { n: NUM.casino.bond.minAge }) : null;
  const one = (n, label) => btn(label, () => buy(n), "small", { disabled: off || why || n > room || n <= 0 ? true : null });
  return h("div", { class: "bk-bond" },
    h("div", { class: "bk-act" }, h("span", { class: "bk-act-l" }, CAS_BOND.title), h("small", { class: "bk-bond-sub" }, CAS_BOND.sub)),
    h("div", { class: "bk-figs" },
      fig(I.open ? `這期：${I.name}` : "這期", I.open ? `${I.pct}%` : "暫停", I.open ? `持有到 ${md(D.due)}（還有 ${D.daysLeft} 天）` : ""),
      fig("這期還能買", I.open ? casNum(Math.max(0, I.cap - I.sold)) : "0", `總額 ${I.open ? casNum(I.cap) : "0"}`),
      fig("我持有", casNum(D.list.reduce((s, x) => s + x.amt, 0)), D.iou ? `債權憑證 ${casNum(D.iou)}` : `累計利息 ${casNum(D.earned)}`)),
    h("div", { class: "bk-act" }, why ? h("p", { class: "bk-why" }, why)
      : h("span", { class: "bk-act-b" }, one(D.unit, `買 ${casNum(D.unit)}`), one(D.unit * 10, `買 ${casNum(D.unit * 10)}`), one(Math.floor(room / D.unit) * D.unit, `買滿 ${casNum(Math.floor(room / D.unit) * D.unit)}`))),
    D.list.length ? h("table", { class: "bk-book" },
      h("thead", null, h("tr", null, ["買的日子", "本金", "利率", "到期", "利息"].map(t => h("th", { scope: "col" }, t)))),
      h("tbody", null, D.list.map(x => h("tr", null, h("td", null, md(x.day)), h("td", null, casNum(x.amt)), h("td", null, `${x.pct}%`), h("td", null, md(x.due)), h("td", null, h("b", null, "+" + casNum(x.int))))))) : null,
    h("p", { class: "bk-rule" }, CAS_BOND.rule));
}

// ---------- 牌桌 ----------
function houseLine() {
  return h("p", { class: "cas-house" + (S.house && S.house[1] ? " broke" : "") }, icon("lobby"), " ", (S.house || []).join(" "));
}
function sayBox() {
  return h("div", { class: "cas-say", role: "log", "aria-live": "polite", "aria-label": "荷官的話" },
    S.say.map((l, i) => h("p", { class: i === S.say.length - 1 ? "last" : "" }, i === S.say.length - 1 ? h("b", null, CAS_TEXT.dealer + "：") : null, l)));
}
function tablePane() {
  const r = S.round, w = S.w;
  const playing = r && r.state === "playing";
  const dealerCards = r ? (S.shown == null ? r.dealer.cards : r.dealer.cards.slice(0, Math.max(S.shown, 2)).map((c, i) => (S.shown === 0 && i === 0 ? -1 : c))) : [];
  const dealerTotal = r && r.state === "done" && S.shown == null ? r.dealer.total : null;
  const felt = h("div", { class: "cas-felt" },
    h("div", { class: "cas-seat dealer" }, h("div", { class: "cas-who" }, h("b", null, CAS_TEXT.dealer), r ? h("small", null, dealerTotal != null ? `點數 ${dealerTotal}` : playing || S.shown != null ? `明牌 ${r.dealer.up}` : "") : null),
      r ? handEl(dealerCards, { label: "莊家的牌" }) : h("p", { class: "cas-empty" }, "下注，荷官就發牌。")),
    r ? h("div", { class: "cas-seat me" }, h("div", { class: "cas-who" }, h("b", null, "你"), h("small", null, `點數 ${r.player.total}${r.player.soft && r.player.total < 21 ? "（有 A）" : ""}・注 ${casNum(r.bet)}`, r.bonusPct ? `・加成 +${r.bonusPct}%` : "")),
      handEl(r.player.cards, { warped: r.warped, label: "你的牌", fresh: S.fresh })) : null);
  const parts = [houseLine(), felt, sayBox()];
  if (r && r.state === "done" && r.out) parts.push(resultCard(r));
  if (playing && S.shown == null) {
    parts.push(h("div", { class: "cas-acts" }, h("p", { class: "cas-ask" }, CAS_TEXT.askHit),
      btn("要（加牌）", () => move("hit"), "primary", { disabled: S.busy ? true : null }), btn("不要", () => move("stand"), "", { disabled: S.busy ? true : null })));
    if (r.warped) parts.push(h("p", { class: "cas-warn", role: "note" }, "眼睛有點花……牌好像不太對勁。"));
  } else if (!playing && S.shown == null) parts.push(betBox());
  if (ADDONS.casinoTable) parts.push(ADDONS.casinoTable());
  parts.push(h("p", { class: "cas-rules" }, `規則：贏 1:1・黑傑克（前兩張）3:2・五張牌沒爆 2:1・平手退注・21 點平手莊家贏・莊家 16 點以下要牌。連贏 ${NUM.casino.streak.winN} 把心情 +${NUM.casino.streak.mood}，連輸 ${NUM.casino.streak.loseN} 把理智 −${NUM.casino.streak.san}（平手不算，每天心情最多 +${NUM.casino.streak.moodDay}、理智最多 −${NUM.casino.streak.sanDay}）。`));
  return parts;
}
function resultCard(r) {
  const o = r.out, kinds = { win: "你贏了", blackjack: "黑傑克！", charlie: "五張過關！", push: "平手", lose: "你輸了" };
  const text = o.kind === "lose" ? `輸 ${casNum(r.bet)}` : o.kind === "push" ? `退回 ${casNum(r.bet)}` : `贏 ${casNum(o.net)}${o.bonus ? `（含加成 ${casNum(o.bonus)}）` : ""}`;
  return h("div", { class: "cas-result k-" + o.kind, role: "status" }, h("b", null, kinds[o.kind] || ""), h("span", null, text),
    r.slips && r.slips.length ? h("small", null, `牌翻回來了：你剛剛有 ${r.slips.length} 張牌看錯了。`) : null);
}
function betBox() {
  const w = S.w;
  const input = h("input", { class: "t-input cas-bet", id: "casBet", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "24", "aria-label": "下注的籌碼", placeholder: "輸入下注金額" });
  input.value = S.lastBet;
  input.addEventListener("input", () => { S.lastBet = input.value; });
  const go = () => { S.lastBet = input.value; deal(input.value); };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  const quick = [1000, 10000, 100000, 1000000].filter(n => n <= w.chips && n >= NUM.casino.minBet);
  return h("div", { class: "cas-betbox" },
    h("p", { class: "cas-ask" }, "輸入下注金額："),
    h("div", { class: "cas-betrow" }, input, btn("發牌", go, "primary", { disabled: S.busy ? true : null })),
    h("div", { class: "cas-quick" }, quick.map(n => btn(casNum(n), () => { input.value = String(n); S.lastBet = String(n); }, "small ghost")), btn("全下", () => { input.value = String(Math.min(w.chips, NUM.casino.maxBet)); S.lastBet = input.value; }, "small ghost")),
    h("p", { class: "cas-hint" }, `最少 ${casNum(NUM.casino.minBet)}，最多 ${casNum(NUM.casino.maxBet)}。荷官會挑剔你打的字。`));
}
function celebrate(ach) {
  for (const a of ach || []) { note(`成就「${a.name}」！在「成就」頁籤看、可以當稱號。`, "good"); snd("unlock"); }
  celebrateWk();
}
// 連勝連敗（決定 0049）：伺服器算好的文字；心情、理智已經寫進存檔，狀態列隨 save_changed 更新
function streakNote(lines) {
  for (const t of lines || []) note(t, t.includes("理智") ? "bad" : "good");
}
// 每週收藏有新的（伺服器在同一個交易裡發的）：牌翻完、錢算完才說
function celebrateWk() {
  const s = S;
  if (!s) return;
  const items = s.wkNew || [], done = s.wkDone;
  s.wkNew = []; s.wkDone = false;
  for (const it of items) { note(`收藏品「${it.name}」到手了！到「本週收藏」頁籤看。`, "good"); snd("unlock"); }
  if (done) { note("這週的賭場收藏集滿了！到「本週收藏」領週章、讀集滿的故事。", "good"); snd("unlock"); }
}
async function deal(text) {
  S.shown = null; S.fresh = null;
  await act("deal", { text }, async r => {
    const v = r.round;
    say([CAS_TEXT.dealHole, fill(CAS_TEXT.dealUp, { card: casCardName(v.dealer.cards[1]) })]);
    snd("flip");
    if (v.state === "done") await finish(v, r, { natural: true });
    else if (r.settle) { celebrate(r.settle.ach); streakNote(r.settle.streak); }
  });
}
async function move(kind) {
  const r0 = S.round;
  if (!r0 || r0.state !== "playing") return;
  await act(kind, { seq: r0.seq }, async r => {
    const v = r.round;
    if (kind === "hit") {
      const c = v.player.cards[v.player.cards.length - 1];
      S.fresh = v.player.cards.length - 1;
      say([`您收到壹張明牌：${casCardName(c)}，目前總點數為 ${v.player.total}`]);
      snd("flip");
    }
    if (v.state === "done") await finish(v, r, { stood: kind === "stand" });
  });
}
// 打完了：荷官照順序說話、翻牌（結果早就在伺服器算好，這裡只是演出來）
async function finish(v, r, o) {
  const s = S, out = v.out, real = v.dealer.cards;
  const steps = [];
  const total = n => casHand(real.slice(0, n)).total;
  const bust = out.why === "bust", charlie = out.kind === "charlie";
  if (o.natural) steps.push([CAS_TEXT.blackjack, 0]);
  if (bust) steps.push([CAS_TEXT.bust, null]);
  else if (charlie) steps.push([CAS_TEXT.charlie[0], null], [CAS_TEXT.charlie[1], null]);
  else {
    if (o.stood) steps.push([CAS_TEXT.standLine, 0]);
    steps.push([fill(CAS_TEXT.dealerReveal, { card: casCardName(real[0]), n: total(2) }), 2]);
    for (let i = 2; i < real.length; i++) steps.push([CAS_TEXT.dealerHit, i], [fill(CAS_TEXT.dealerGot, { card: casCardName(real[i]), n: total(i + 1) }), i + 1]);
    if (out.why === "dealerBust") steps.push([CAS_TEXT.dealerBust[0], null], [CAS_TEXT.dealerBust[1], null]);
    else if (out.kind === "win" || out.kind === "blackjack") steps.push([CAS_TEXT.win, null]);
    else if (out.why === "tie21") steps.push([CAS_TEXT.push, null], [CAS_TEXT.push21, null]);
    else if (out.kind === "push") steps.push([CAS_TEXT.push, null]);
    else steps.push([CAS_TEXT.lose, null]);
  }
  s.shown = bust || charlie ? null : 0;
  s.round = v;
  for (const [line, n] of steps) {
    if (S !== s) return;
    say([line]);
    if (n != null) s.shown = n === 0 ? 0 : n;
    draw();
    await wait(n != null && n >= 3 ? 700 : 520);
  }
  s.shown = null;
  if (S !== s) return;
  if (out.kind === "lose") snd("error"); else if (out.kind !== "push") snd("coin");
  if (r.ticket) say([CAS_TEXT.packWon]);
  if (r.settle) { say(r.settle.lines || []); celebrate(r.settle.ach); streakNote(r.settle.streak); }
  say(s.house || []);
  if (v.slips && v.slips.length) say([`牌翻回來了：你剛剛有 ${v.slips.length} 張牌看錯了。`]);
}

// ---------- 本週收藏（決定 0042） ----------
function weekPane() {
  const W = curWeek(), def = weekCasino(W);
  if (!def) return sec("本週收藏", h("p", { class: "cas-note" }, W ? "這週賭場沒有特別的收藏。" : "每週收藏在挑戰模式裡。"));
  const claim = label => act("wkclaim", { week: label }, r => {
    snd("unlock");
    note(`領到了：週章 ${r.claimed.stamps} 枚。集滿的小故事放在圖書館書架的「每週劇情」。`, "good");
  });
  return sec(def.title, weekCollection(def, S.wk || CAS_WK.view, todayStr(), { claim, pastDef: label => casinoDefOf(label), busy: S.busy }));
}

// ---------- 大禮包 ----------
function packsPane() {
  const w = S.w, can = w.packsLeft > 0;
  const rows = CAS_PACKS.map((p, i) => h("li", null, h("span", { class: "cas-stars", "aria-label": `${p.stars} 星` }, "★".repeat(p.stars)), h("b", null, p.name), h("small", null, `${(p.upTo - (i ? CAS_PACKS[i - 1].upTo : 0)) / 10}%`)));
  const boost = liveEvent("casinoBoost");
  // 拉霸（翊文 11-09）：先轉，伺服器回來再壹輪壹輪停。籌碼等停好才變，不然狀態列會先爆雷
  const machine = S.slot || (S.slot = slotMachine({ idle: "拉下拉桿，開壹包", onPull: () => pull(1) }));
  machine.enable(can && !S.busy);
  machine.idle(can ? "拉下拉桿，開壹包" : "今天沒有可以開的了");
  const pull = async n => {
    const s = S;
    if (!s || s.busy || s.w.packsLeft < 1) return;
    s.busy = true;
    s.m.surface.querySelectorAll("button").forEach(b => { b.disabled = true; });
    machine.spin();
    let r = null;
    try {
      [r] = await Promise.all([NET.call("casino", { act: "pack", n }), holdFor(motionOff() ? 0 : 500)]);
      if (!r || !r.ok) { snd("error"); await machine.abort((r && r.reason) || "沒開成，等壹下再試。"); r = null; }
    } catch (e) { snd("error"); await machine.abort((e && e.message) || "沒開成，等壹下再試。"); r = null; }
    if (r) {
      const many = r.packs.length > 1;
      for (let i = 0; i < r.packs.length; i++) {
        if (i > 0) machine.spin();
        if (machine.hurried && i < r.packs.length - 1 && many) continue; // 點了機器：直接跳到最後壹包
        await machine.land(r.packs[i], { fast: many });
        if (many && i < r.packs.length - 1) await holdFor(motionOff() ? 150 : r.packs[i].stars >= 4 ? 900 : 260);
      }
      if (many) machine.say(`開了 ${r.packs.length} 包，共 +${casNum(r.total)}`);
      setChips(r.wallet.chips);
    }
    if (S !== s) return;
    if (r) {
      sync(r);
      S.packs = r.packs;
      const best = r.packs.reduce((a, b) => (b.stars > a.stars ? b : a), r.packs[0]);
      say([r.packs.length === 1 ? `${best.name}：${casNum(best.chips)}` : `開了 ${r.packs.length} 包，共 ${casNum(r.total)}`, fill(CAS_TEXT.packLeft, { n: S.w.packsLeft })]);
      celebrate(r.ach);
    }
    s.busy = false;
    draw();
  };
  const open = n => pull(n);
  return [
    sec("每日大禮包", machine.el, boost ? h("p", { class: "cas-note" }, eventTagNode(boost), ` ${boost.title}：活動時間內多 ${NUM.events.casinoBoost.extraPacks} 包（進來就加好了，沒趕上也不會少什麼）。`) : null, h("p", { class: "cas-note" }, `每天有 ${NUM.casino.dailyPacks} 包免費的（沒開的不累積）；餐車買的、贏牌抽到的券另外算。籌碼是莊家出的。`),
      h("p", { class: "cas-have" }, `今天免費的剩 ${w.packsToday} 包，券 ${w.tickets} 張，共 ${w.packsLeft} 包可以開。`),
      h("div", { class: "cas-acts" }, btn(`開壹包`, () => open(1), "primary", { disabled: !can || S.busy ? true : null }),
        w.packsLeft > 1 ? btn(`全開（${Math.min(w.packsLeft, NUM.casino.maxPacksAtOnce)} 包）`, () => open(w.packsLeft), "", { disabled: S.busy ? true : null }) : null)),
    S.packs ? sec("剛剛開到的", h("ul", { class: "cas-packs" }, S.packs.map(p => h("li", { class: "s" + p.stars }, h("span", { class: "cas-stars" }, "★".repeat(p.stars)), h("b", null, p.name), h("span", null, `+${casNum(p.chips)}`))))) : null,
    sec("機率", h("ul", { class: "cas-odds" }, rows)),
  ];
}

// ---------- 拚經濟（決定 0052） ----------
// 按下去，伺服器擲好、改好莊家和錢包，回來壹串要跳的字；這裡壹行壹行跳出來（減少動態時幾乎立刻跳完）。籌碼和莊家的數字等跳完才變，不然會先爆雷
function econPane() {
  const ec = S.ec || { left: 0, perDay: NUM.casino.econ.perDay }, lines = S.ecLines || [], playing = !!S.ecPlaying;
  const stage = h("div", { class: "cas-say cas-econ-stage" + (S.ecKind ? " k-" + S.ecKind : ""), role: "log", "aria-live": "polite", "aria-label": "拚經濟的過程" },
    lines.length ? lines.map((l, i) => h("p", { class: i === lines.length - 1 ? "last" : "" }, l)) : h("p", null, "按下去，Yuga Bot 就開始拚。"));
  const can = ec.left > 0 && !S.busy && !playing;
  return [
    sec(CAS_ECON.title, h("p", { class: "cas-econ-slogan" }, CAS_ECON.slogan), h("p", { class: "cas-note" }, CAS_ECON.intro), houseLine(), stage,
      h("div", { class: "cas-acts" }, btn(playing ? "拚經濟中……" : "拚經濟", econGo, "primary cas-econ-go", { disabled: can ? null : true }),
        h("span", { class: "cas-have" }, ec.left > 0 ? fill(CAS_ECON.left, { n: ec.left }) : CAS_ECON.none)),
      h("p", { class: "cas-hint" }, CAS_ECON.rule)),
    sec("為什麼要拚", h("p", { class: "cas-note" }, CAS_ECON.why)),
    sec("怎麼拚", h("p", { class: "cas-note" }, CAS_ECON.how.join("、"), "。")),
    sec("Yuga Bot 日報", ...reportNodes()), // 館方的帳（11-13）：莊家、預算池、海底，結算過的
  ];
}
// 跳字區矮的時候（手機橫拿），讓最新壹行留在看得到的地方，不然會看不到結果
function econFollow() {
  const st = S && S.m && S.m.surface.querySelector(".cas-econ-stage"), last = st && st.lastElementChild;
  if (!st || !last) return;
  st.scrollTop = st.scrollHeight;
  last.scrollIntoView({ block: "nearest" });
}
async function econGo() {
  const s = S;
  if (!s || s.busy || s.ecPlaying || !s.ec || s.ec.left < 1) return;
  s.busy = true; s.ecPlaying = true; s.ecLines = []; s.ecKind = "";
  draw();
  let r = null;
  try {
    r = await NET.call("casino", { act: "econ" });
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "沒拚成，等壹下再試。", "bad"); r = null; }
  } catch (e) { snd("error"); note((e && e.message) || "沒拚成，等壹下再試。", "bad"); r = null; }
  if (S !== s) return;
  if (r) {
    const ev = r.econ;
    s.ecKind = ev.win ? "win" : "fail";
    for (let i = 0; i < ev.lines.length; i++) {
      if (S !== s) return;
      s.ecLines.push(ev.lines[i]);
      snd("flip");
      draw();
      econFollow();
      await wait(i < 2 ? 700 : 620);
    }
    if (S !== s) return;
    setChips(r.wallet.chips);
    sync(r);
    snd(ev.win ? "coin" : ev.loot ? "coin" : "error");
    if (ev.rescued) { note("把莊家拚回來了！", "good"); snd("unlock"); }
    celebrate([]);
  }
  s.ecPlaying = false; s.busy = false;
  draw();
  econFollow();
}

// ---------- 實況和斗內（決定 0053） ----------
// 誰在播、到幾點、最近一則感謝來自 ui_casino_live.js（聽 Realtime Database，大家同步）；今天還能斗內幾次、今天收了多少、按下去的結果都是伺服器算的（act live／liveOn／liveOff／donate）
function goTab(id) {
  if (!S) return;
  S.tab = id;
  if (id === "live") liveLoad();
  if (id === "econ") reportLoad();
  draw();
}
// 拚經濟頁籤最下面的日報：進這個頁籤才問伺服器，回來再畫
async function reportLoad() {
  const s = S;
  if (!s) return;
  const p = loadReport();
  draw();
  await p;
  if (S === s && s.tab === "econ" && !s.busy && s.m.layer.isConnected) draw();
}
async function liveLoad() {
  const s = S;
  if (!s || s.lvBusy) return;
  s.lvBusy = true;
  try {
    const r = await call("live");
    if (S === s && r && r.ok) liveTake(r);
  } catch (e) { /* 連不上：畫面照舊 */ }
  if (S !== s) return;
  s.lvBusy = false; s.lvAsked = true;
  if (s.tab === "live" && !s.busy) draw();
}
function liveTake(r) {
  S.lvMy = r.my; S.lvLive = r.live;
  if (typeof r.chips === "number") { if (S.w) S.w.chips = r.chips; setChips(r.chips); }
}
onLive(kind => { if (S && S.tab === "live" && !S.busy && S.m.layer.isConnected) { if (kind === "node") liveLoad(); draw(); } }); // 別人開播、下播、斗內：這一頁跟著變
function liveGo(name) {
  return act(name, null, r => {
    liveTake(r);
    if (name === "donate") { snd("coin"); S.lvSay = r.line; } // 全館的感謝是 Realtime Database 那邊跳的；這裡留壹行在頁面上
    else { snd(name === "liveOn" ? "bell" : "flip"); S.lvSay = null; }
  });
}
function livePane() {
  const my = S.lvMy, c = LIVE.ready ? liveNow() : (S.lvLive && S.lvLive.on && S.lvLive.until > Date.now() ? S.lvLive : null);
  const last = LIVE.node.msg, canDonate = !!c && !c.mine && !!my && my.left > 0 && !S.busy;
  const status = c ? h("p", { class: "cas-live-now on" }, icon("lamp"), " ", h("b", null, c.mine ? CAS_LIVE.you : fill(CAS_LIVE.now, { name: c.nick })), h("span", { class: "cas-live-until" }, fill(CAS_LIVE.until, { t: liveClock(c.until) })))
    : h("p", { class: "cas-live-now" }, CAS_LIVE.noOne);
  const acts = [];
  if (c && c.mine) acts.push(btn(CAS_LIVE.stop, () => liveGo("liveOff"), "cas-live-go", { disabled: S.busy ? true : null }));
  else {
    if (c) acts.push(btn(CAS_LIVE.donate, () => liveGo("donate"), "primary cas-live-go", { disabled: canDonate ? null : true }));
    acts.push(btn(CAS_LIVE.start, () => liveGo("liveOn"), c ? "ghost cas-live-go" : "primary cas-live-go", { disabled: c || S.busy ? true : null, title: c ? fill(CAS_LIVE.taken, { name: c.nick }) : null }));
  }
  const lines = [];
  if (S.lvSay) lines.push(h("p", { class: "last" }, S.lvSay));
  else if (last) lines.push(h("p", null, h("small", null, CAS_LIVE.lastLabel, "："), liveThanks(last)));
  return [
    sec(CAS_LIVE.title, h("p", { class: "cas-note" }, CAS_LIVE.intro), status,
      h("div", { class: "cas-say cas-live-stage", role: "log", "aria-live": "polite", "aria-label": "實況的感謝" }, lines.length ? lines : h("p", null, c ? "按「斗內」試試手氣。" : "還沒有人開播。")),
      h("div", { class: "cas-acts" }, acts,
        my ? h("span", { class: "cas-have" }, my.left > 0 ? fill(CAS_LIVE.left, { n: my.left }) : CAS_LIVE.limit) : h("span", { class: "cas-have" }, S.lvAsked ? "" : "讀取中……")),
      my ? h("p", { class: "cas-hint" }, fill(CAS_LIVE.gotToday, { n: casNum(my.got), cap: casNum(my.cap) }), "　", fill(CAS_LIVE.sentToday, { n: casNum(my.sent) })) : null,
      h("p", { class: "cas-hint" }, fill(CAS_LIVE.rule, { perDay: NUM.casino.live.perDay, cap: casNum(NUM.casino.live.receiveCap) }))),
  ];
}

// ---------- 餐車 ----------
function dinerPane() {
  const w = S.w;
  const buy = it => act("buy", { item: it.n }, r => {
    S.dinerLines = r.lines || [];
    snd("coin");
    if (r.mood) note(`心情 +${r.mood}${r.san ? `，理智 +${r.san}` : ""}`, "good");
    else if (r.san) note(`理智 +${r.san}`, "good");
    celebrate(r.ach);
  });
  return [
    sec("餐車", h("p", { class: "cas-note" }, fill(CAS_TEXT.dinerHello, { name: CAS_TEXT.dealer }), "。", CAS_TEXT.dinerHint, "。"),
      h("p", { class: "cas-note" }, markText(`吃東西會加**心情**，茶還會加**理智**。今天還能加心情 ${w.foodMoodLeft} 點、理智 ${w.foodSanLeft} 點。`)),
      h("p", { class: "cas-have" }, w.opened > 0 ? "今天的大禮包你開過了，吃東西有機會抽到券。" : "今天還沒開大禮包：先到「大禮包」開壹包，吃東西才抽得到券、才買得到券。"),
      h("ul", { class: "cas-menu" }, CAS_MENU.map(it => {
        const lack = w.chips < it.price, locked = it.ticket && !(w.opened > 0);
        return h("li", null, h("span", { class: "cas-n" }, String(it.n)), h("span", { class: "cas-name" }, h("b", null, it.name), h("small", null, it.ticket ? "券" : markText([...casFoodWords(it), `${it.odds}% 機率抽到券`].join("・")))),
          h("span", { class: "cas-price" }, casNum(it.price)),
          btn("買", () => buy(it), "primary small", { disabled: lack || locked || S.busy ? true : null, title: lack ? "籌碼不夠" : locked ? "先開今天的大禮包" : null }));
      })),
      S.dinerLines.length ? h("div", { class: "cas-say" }, S.dinerLines.map(l => h("p", null, l))) : null),
  ];
}

// ---------- 換小獎 ----------
const EX_NAME = { insp: "壹點靈感", canvas: "壹張舊畫布", foil: "壹片金箔" };

function swapPane() {
  const w = S.w;
  return sec("籌碼換小獎", h("p", { class: "cas-note" }, "籌碼只換壹點點小東西，每週有上限（週壹 05:00 重算）。"), h("ul", { class: "cas-menu" }, w.ex.map(x => {
    const lack = w.chips < x.chips;
    return h("li", null, h("span", { class: "cas-name" }, h("b", null, EX_NAME[x.id] || x.id), h("small", null, exchangeUse(x.id)), h("small", null, `這週還能換 ${x.left}／${x.perWeek} 次`)), h("span", { class: "cas-price" }, casNum(x.chips)),
      btn("換", () => act("exchange", { id: x.id }, () => { snd("coin"); note(`換到${EX_NAME[x.id]}了。${exchangeUse(x.id)}`, "good"); }), "primary small", { disabled: lack || !x.left || S.busy ? true : null, title: !x.left ? "這週換完了" : lack ? "籌碼不夠" : null }));
  })), P && P.mode === "free" ? h("p", { class: "cas-warn" }, "自由模式沒有靈感，要用挑戰模式的參觀者才換得到。") : null);
}

// ---------- 成就、稱號 ----------
function achPane() {
  const w = S.w, have = new Map(w.ach.map(a => [a.id, a]));
  const cur = w.title ? w.ach.find(a => a.id === w.title) : null;
  const setTitle = id => act("title", { id }, () => note(id ? "稱號換好了，展廳和館友名單上看得到。" : "拿掉稱號了。", "good"));
  const row = (a, mine) => h("li", { class: mine ? "got" : "lock" },
    h("span", { class: "cas-badge", "aria-hidden": "true" }, icon(mine ? "medal" : "lock")),
    h("span", { class: "cas-name" }, h("b", null, mine ? a.name : "？？？"), h("small", null, mine ? (mine.old ? `${mine.desc}` : a.desc) : a.desc)),
    mine ? (w.title === a.id ? btn("拿掉稱號", () => setTitle(null), "small", { disabled: S.busy ? true : null }) : btn("當稱號", () => setTitle(a.id), "small primary", { disabled: S.busy ? true : null })) : null);
  // wk：每週收藏集滿的稱號（決定 0042）
  const oldOnes = w.ach.filter(a => a.old), wkOnes = w.ach.filter(a => a.wk);
  return [
    sec("稱號", h("p", { class: "cas-note" }, cur ? ["現在的稱號：", h("b", null, cur.name), "。在展廳、館友名單、榜單上，館友都看得到。"] : "還沒有稱號。拿到成就之後，可以選壹個當稱號。"),
      h("p", { class: "cas-have" }, `已經拿到 ${w.ach.length} 個成就。`)),
    sec("在賭場拿得到的", h("ul", { class: "cas-list" }, CAS_ACH.map(a => row(a, have.get(a.id))))),
    wkOnes.length ? sec("每週收藏集滿的稱號", h("ul", { class: "cas-list" }, wkOnes.map(a => row(a, a)))) : null,
    oldOnes.length ? sec("以前拿到的（Discord 21 點）", h("ul", { class: "cas-list" }, oldOnes.map(a => row(a, a)))) : null,
  ];
}

// ---------- 財產（紀念品） ----------
function propsPane() {
  const w = S.w;
  const hang = (p, on) => act("hang", { id: p.id, on }, () => { snd("click"); note(on ? `${p.name} 掛到展廳了。` : `${p.name} 拿下來了。`, "good"); });
  const hungN = w.props.filter(p => p.hung).length;
  return sec("財產（紀念品）", h("p", { class: "cas-note" }, `在餐車買到的、以前帶來的，都是紀念品。可以掛在自己的展廳，來參觀的館友看得到（最多 ${w.hungMax} 件，現在掛了 ${hungN} 件）。`),
    w.props.length ? h("ul", { class: "cas-list" }, w.props.map(p => h("li", { class: "got" },
      h("span", { class: "cas-badge", "aria-hidden": "true" }, icon("star")),
      h("span", { class: "cas-name" }, h("b", null, p.name, p.n > 1 ? ` ×${p.n}` : ""), h("small", null, p.desc)),
      p.hung ? btn("拿下來", () => hang(p, false), "small", { disabled: S.busy ? true : null }) : btn("掛到展廳", () => hang(p, true), "small primary", { disabled: hungN >= w.hungMax || S.busy ? true : null, title: hungN >= w.hungMax ? "展廳掛滿了" : null }))))
      : h("p", { class: "nb-empty" }, "還沒有財產。到餐車買壹份東西，就是第壹件紀念品。"));
}

// ---------- 舊資料認領卡 ----------
function legacyCard(peek) {
  const m = miniLayer(CAS_TEXT.legacyTitle, CAS_TEXT.legacyBody);
  m.layer.classList.add("sp-top");
  const close = () => m.close();
  const list = (title, arr) => arr.length ? h("div", { class: "cas-lg" }, h("b", null, title), h("span", null, arr.slice(0, 12).map(x => (typeof x === "string" ? x : `${x.name}${x.n > 1 ? ` ×${x.n}` : ""}`)).join("、") + (arr.length > 12 ? `……共 ${arr.length}` : ""))) : null;
  const claim = async () => {
    close();
    await act("legacy", {}, r => {
      const c = r.claimed;
      say([fill(CAS_TEXT.legacyDone, { chips: casNum(c.chips), ach: c.ach, props: c.props })]);
      snd("unlock"); note(fill(CAS_TEXT.legacyDone, { chips: casNum(c.chips), ach: c.ach, props: c.props }), "good");
    });
  };
  m.card.append(h("div", { class: "cas-legacy" },
    h("p", { class: "cas-lg" }, h("b", null, "籌碼"), h("span", null, casNum(peek.chips))), list("成就", peek.ach), list("財產", peek.props)),
    h("div", { class: "cas-acts" }, btn("認領", claim, "primary"), btn("先不要", close, "ghost")));
  m.layer.addEventListener("click", e => { if (e.target === m.layer) close(); });
  m.card.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  const f = m.card.querySelector(".btn"); if (f) f.focus();
}

PANELS.casino = openCasino;
// 其他檔（同桌）要借用
export const casinoState = () => S;
export const casinoRefresh = () => { if (S) draw(); };

// ---------- 展廳上的稱號和紀念品（自己的、來參觀的館友看到的） ----------
function shelfEl(title, items) {
  if (!title && !items.length) return null;
  return h("div", { class: "cas-hall" }, h("h3", null, "Hamachi 賭場的紀念品"),
    title ? h("p", { class: "cas-title" }, "稱號：", h("b", null, title.name)) : null,
    items.length ? h("ul", { class: "cas-shelf" }, items.map(x => h("li", null, h("b", null, x.name), x.desc ? h("small", null, x.desc) : null))) : null);
}
ADDONS.hall3 = root => {
  if (!P || P.mode === "free") return;
  const el = shelfEl(casCleanTitle(P.casinoTitle), casCleanSouvenirs(P.hallSouvenirs));
  if (el) root.append(el);
};
ADDONS.casinoShelf = v => shelfEl(v.title || null, v.souvenirs || []);

// 狀態列的籌碼：連上就讀一次（只讀）。登出就清掉
let chipsAsked = false;
async function askChips() {
  if (chipsAsked || !UI.net || !NET.loggedIn) return;
  chipsAsked = true;
  try { const r = await NET.call("casino", { act: "peek" }); if (r && typeof r.chips === "number") setChips(r.chips); if (ADDONS.workPeek) ADDONS.workPeek(r); } // 欠款要送人下去、還清了回來（決定 0064，ui_work.js）
  catch (e) { chipsAsked = false; } // 讀不到就先不顯示，下次連上再試
}
// 走完地下的一個房間（單人：ui_screens3.js 的 resolveFlow；合作：ui_coop.js 的 playResult）：跟伺服器說「我走完這間了」（決定 0047）。
// 有沒有、給多少、一天幾次都是伺服器的事，這裡只照回答跳通知、換狀態列的數字。不等它：離線、沒有 Functions、模擬器沒開，都安靜地算了，探險照走
ADDONS.cellarFind = roomId => {
  let ask;
  try {
    if (!roomId || !P || isFree(P) || !UI.net || !NET.loggedIn) return;
    ask = NET.call("casino", { act: "cellarFind", room: String(roomId) });
  } catch (e) { return; }
  Promise.resolve(ask).then(r => {
    if (!r || !r.ok || !(r.found > 0)) return;
    if (typeof r.chips === "number") setChips(r.chips);
    const lines = CAS_FIND_TEXT.lines;
    note(`${lines[(r.t | 0) % lines.length]}（+${casNum(r.found)} 籌碼${r.bonus > 0 ? `，其中 ${casNum(r.bonus)} 是限時活動多的` : ""}）`, "good");
  }).catch(() => {});
};
// 交了委託（ui_screens2.js：手動交壹張、壹鍵交件交好幾張）：跟伺服器說交了今天的哪幾張（決定 0062）。給多少是伺服器的事；不等它，連不上就算了
ADDONS.chipsOn = () => { try { return !!(P && !isFree(P) && UI.net && NET.loggedIn); } catch (e) { return false; } };
ADDONS.jobChips = ids => {
  let ask;
  try {
    const slots = (ids || []).map(id => String(id).split("#")[1]).filter(Boolean);
    if (!slots.length || !ADDONS.chipsOn()) return;
    ask = NET.call("casino", { act: "job", slots });
  } catch (e) { return; }
  Promise.resolve(ask).then(r => {
    if (!r || !r.ok || !(r.found > 0)) return;
    if (typeof r.chips === "number") setChips(r.chips);
    note(`委託人順手塞了壹點籌碼給你（+${casNum(r.found)} 籌碼）`, "good");
  }).catch(() => {});
};
NET.on("status", () => { if (NET.state === "online") askChips(); });
NET.on("logout", () => { chipsAsked = false; setChips(null); });
