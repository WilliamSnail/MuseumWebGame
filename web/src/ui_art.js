// ================================================================
//  藝術市場第一步（11-14）：畫廊「今日特展」每幅畫下面的「買下」「賣回」，和「我收藏的畫」。
//  規則和錢都在伺服器（functions/art.js、shared/casino_art.js）：這裡只拿報價、按按鈕、畫結果。
//  定位是避險資產（翊文：「畫可以當像富人買用來避險的感覺」）：價錢不閃、不跳、不用紅綠箭頭，安安靜靜寫一個數字。
//  沒登入、連不上伺服器就不顯示（畫廊照常）。介面上的字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../shared/casino.js";
import { CAS_ART } from "../../shared/casino_art.js";
import { NET } from "./net_firebase.js";
import { CAS_AUC } from "../../shared/casino_auction.js";
import { NUM } from "../../shared/config.js";
import { UI, btn, go, h, note, setChips, snd } from "./ui_core.js";
import { reloadSave } from "./ui_login.js";

let data = null; // 最近一次的報價 { items, mine, left, perDay, holdMax, sellPct, chips }；重畫畫廊時先用這份，背景再問一次
let msg = null; // { text, tone } 最近一次買賣的結果
let busy = false, loading = false, failed = false;
const views = new Set(); // 現在畫面上的區塊：資料變了就一起重畫

const ready = () => !!(UI.net && NET.loggedIn);
const DEV = !!import.meta.env.DEV;
const fake = () => DEV && !ready(); // 開發的時候沒登入：用示範資料把畫面畫出來（玩家看不到）
// 「看畫」：收藏裡的畫也能點開來看（ui_story.js 登記，那邊才有畫的內容和看畫的流程：第壹次看拿靈感、可怕的畫要擲理智）
export const ART_HOOKS = { view: null, art: null }; // art(畫的 id) → 這幅畫的 svg 字串（拍賣的畫架上放縮圖用）
export const collectOn = () => ready() || DEV; // 「我收藏的畫」頁籤
export const auctionOn = () => ready() || DEV; // 「拍賣」頁籤：登入了才有；開發沒登入用示範資料
const FAKE_MINE = [
  { id: "d1", title: "歪頭的佩佩", tierName: "珍藏", paid: 120000, price: 131000, sellPrice: 104800, breakEven: 6 },
  { id: "d2", title: "窗邊的黃昏", tierName: "稀有", paid: 480000, price: 452000, sellPrice: 361600, breakEven: 0 },
  { id: "d3", title: "無名的肖像", tierName: "普通", paid: 30000, price: 30500, sellPrice: 24400, breakEven: 2 },
];
FAKE_MINE[0].lock = "au-demo"; // 示範：第壹幅正在拍賣
const FAKE = { items: [], mine: FAKE_MINE, left: 3, perDay: 3, holdMax: 12, sellPct: 80, chips: 660790 };
const fakeItem = id => ({ id, tier: 2, tierName: "珍藏", price: 120000, sellPrice: 96000, owned: false, canBuy: true });
const redraw = () => views.forEach(f => f());
const mk = (cls, ...kids) => h("div", { class: cls }, ...kids);

async function quote() {
  if (fake()) { data = FAKE; redraw(); return; }
  if (!ready() || loading) return;
  loading = true;
  try {
    const r = await NET.call("art", { act: "quote" });
    failed = false;
    if (r && r.ok) { data = r.art || null; if (typeof r.chips === "number") setChips(r.chips); }
  } catch (e) { failed = true; }
  loading = false;
  redraw();
}
// 畫廊每次重畫都叫一次：清掉舊的區塊，背景問報價
export function artMarketOpen() {
  views.clear();
  quote();
}
async function trade(op, id) {
  if (busy || !ready()) return;
  busy = true; redraw();
  try {
    if (NET.flush) await NET.flush(); // 先把存檔送上去，伺服器才看得到最新的
    const r = await NET.call("art", { act: "trade", op, id });
    if (r && r.ok) {
      snd("coin");
      data = r.art || data; msg = { text: (r.lines && r.lines[0]) || "", tone: "good" };
      if (r.wallet && typeof r.wallet.chips === "number") setChips(r.wallet.chips);
      if (r.rev) { try { await reloadSave(r.rev); } catch (e) { /* 下次存的時候會再讀 */ } }
    } else { snd("error"); msg = { text: (r && r.reason) || CAS_ART.bad, tone: "bad" }; }
  } catch (e) { snd("error"); msg = { text: (e && e.message) || CAS_ART.bad, tone: "bad" }; }
  busy = false;
  redraw();
}

// 每幅畫下面的一小塊（id＝畫的 id，跟存檔的 P.story.works 一樣）。館方沒登記這幅（備用週的畫）、還沒問到報價就不畫
export function artMarketRow(id) {
  const box = mk("artmarket-row");
  const draw = () => {
    const it = (data && data.items.find(x => x.id === id)) || (fake() ? fakeItem(id) : null), mineIt = data && data.mine && data.mine.find(x => x.id === id), locked = !!(mineIt && mineIt.lock);
    if ((!ready() && !fake()) || !it) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const why = locked ? CAS_AUC.locked : it.owned ? "" : it.canBuy ? "" : data && data.left <= 0 ? CAS_ART.dayCap.replace("{n}", data.perDay) : data && data.chips < it.price ? CAS_ART.poor : "";
    box.replaceChildren(
      mk("artmarket-info", h("span", { class: "artmarket-tier t" + it.tier }, it.tierName), h("span", { class: "artmarket-price" }, `${CAS_ART.price} ${casNum(it.price)}`), it.owned ? h("span", { class: "artmarket-own" }, CAS_ART.owned) : null),
      it.auction && !it.owned ? mk("artmarket-acts", h("p", { class: "artmarket-why" }, CAS_AUC.direct), btn("去看拍賣", () => go("gallery", { tab: "auction" }, { action: false }), "small primary")) : null,
      it.auction && !it.owned ? null : mk("artmarket-acts",
        btn(CAS_ART.buy, () => trade("buy", id), "small primary", { disabled: busy || !it.canBuy, "aria-label": `${CAS_ART.buy}，${casNum(it.price)} 籌碼` }),
        btn(it.owned ? [CAS_ART.sell, h("small", null, ` ${casNum(it.sellPrice)}`)] : CAS_ART.sell, () => trade("sell", id), "small", { disabled: busy || !it.owned || locked, "aria-label": it.owned ? `${CAS_ART.sell}，拿回 ${casNum(it.sellPrice)} 籌碼` : CAS_ART.sell })),
      why ? h("p", { class: "artmarket-why" }, why) : null);
  };
  views.add(draw); draw();
  return box;
}
// 我收藏的畫＋結果＋規則。沒登入就不畫
export function artMarketShelf() {
  const box = mk("artmarket-shelf");
  const draw = () => {
    if (!ready() && !fake()) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const kids = [h("h2", { class: "artmarket-h" }, CAS_ART.title), h("p", { class: "hint" }, CAS_ART.sub)];
    if (msg) kids.push(h("p", { class: "artmarket-msg " + msg.tone, role: "status" }, msg.text));
    if (!data) kids.push(h("p", { class: "hint" }, failed ? "現在連不上館方的帳，晚點再來。" : "翻帳本中……"));
    else {
      kids.push(h("p", { class: "artmarket-held-h" }, `${CAS_ART.held}（${data.mine.length}／${data.holdMax}）`));
      if (!data.mine.length) kids.push(h("p", { class: "hint" }, CAS_ART.empty));
      else kids.push(h("ul", { class: "artmarket-list" }, data.mine.map(x => h("li", { class: "artmarket-item" },
        mk("artmarket-name", h("b", null, x.title || x.id), h("small", null, `${x.tierName}　買進 ${casNum(x.paid)}　現價 ${casNum(x.price)}`), h("small", { class: "artmarket-be" }, x.breakEven == null ? "" : x.breakEven <= 0 ? CAS_ART.beDone : CAS_ART.be.replace("{n}", x.breakEven))),
        h("div", { class: "artmarket-btns" }, btn("看畫", () => ART_HOOKS.view && ART_HOOKS.view(x.id), "small primary", { "aria-label": `看${x.title}` }), x.lock ? h("span", { class: "artmarket-lock" }, "拍賣中") : btn(CAS_AUC.list, () => { aucForm.listId = x.id; aucForm.reserve = ""; go("gallery", { tab: "auction" }, { action: false }); }, "small", { "aria-label": `${CAS_AUC.list}：${x.title}` }), btn([CAS_ART.sell, h("small", null, ` ${casNum(x.sellPrice)}`)], () => trade("sell", x.id), "small", { disabled: busy || !!x.lock, "aria-label": `${CAS_ART.sell}${x.title}，拿回 ${casNum(x.sellPrice)} 籌碼` }))))));
      kids.push(h("p", { class: "hint" }, CAS_ART.rule.replace("{perDay}", data.perDay).replace("{holdMax}", data.holdMax).replace("{sellPct}", data.sellPct)));
    }
    box.replaceChildren(...kids);
  };
  views.add(draw); draw();
  return box;
}

// ---------- 拍賣（11-14，shared/casino_auction.js、functions/art.js；翊文：封閉式出價、每幅稀有畫壹場、玩家也能拍自己的畫、只公開得標價） ----------
// 資料：NET.call("art", { act: "auctions" }) → { ok, chips, auctions }。動作 bid { id, amt }、list { id: 畫的 id, reserve }、cancel { id: 拍賣的 id } → { ok, lines, chips, rev, view }
// auctions.open[]：{ id, kind, sellerName, work, title, tierName, reserve, ceil, closeAt, bidders, mine, mineSeller, canCancel }；done[]：{ id, sellerName, title, tierName, price（流標是 null）, closedAt }
let auc = null, aucMsg = null, aucBusy = false, aucLoading = false, aucFailed = false;
const aucForm = { bid: {}, listId: "", reserve: "" };
const FAKE_AUC = {
  open: [
    { id: "au1", kind: "house", sellerName: "館方", work: "x1", title: "歪頭的佩佩", tierName: "珍藏", reserve: 400000, ceil: 0, closeAt: Date.now() + 2.2 * 86400000, bidders: 3, mine: 520000, mineSeller: false, canCancel: false },
    { id: "au2", kind: "house", sellerName: "館方", work: "x2", title: "雨夜的窗", tierName: "孤品", reserve: 1200000, ceil: 0, closeAt: Date.now() + 1.1 * 86400000, bidders: 0, mine: null, mineSeller: false, canCancel: false },
    { id: "au3", kind: "player", sellerName: "館友", work: "d1", title: "無名的肖像", tierName: "珍藏", reserve: 350000, ceil: 600000, closeAt: Date.now() + 2.8 * 86400000, bidders: 1, mine: null, mineSeller: true, canCancel: false },
  ],
  done: [{ id: "d1", kind: "house", sellerName: "館方", work: "y1", title: "紅色的晚餐", tierName: "珍藏", price: 610000, closedAt: Date.now() - 86400000 }, { id: "d2", kind: "player", sellerName: "館友", work: "y2", title: "靜物與佩佩", tierName: "孤品", price: null, closedAt: Date.now() - 2 * 86400000 }],
  notes: [], hold: 520000, listLeft: 1, minAge: 3, feePct: 5, floorPct: 80, ceilPct: 150,
};
const fmtWhen = ms => { const t = new Date(ms + 8 * 3600000); return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:00`; };
const leftText = ms => { const l = ms - Date.now(); if (l <= 0) return "收標中"; const d = Math.floor(l / 86400000), hh = Math.floor((l % 86400000) / 3600000); return d ? `還有 ${d} 天 ${hh} 小時` : `還有 ${Math.max(1, hh)} 小時`; };
const aucFill = (str, o) => str.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m));
async function loadAuc() {
  if (fake()) { auc = FAKE_AUC; redraw(); return; }
  if (!ready() || aucLoading) return;
  aucLoading = true;
  try {
    if (NET.flush) await NET.flush();
    const r = await NET.call("art", { act: "auctions" });
    aucFailed = false;
    if (r && r.ok) {
      auc = r.auctions || null; if (typeof r.chips === "number") setChips(r.chips);
      if (auc && auc.notes && auc.notes.length) aucMsg = { text: auc.notes.join("　"), tone: "good" }; // 收標的結果：伺服器叫過就清掉，這裡要留著給玩家看
    }
  } catch (e) { aucFailed = true; }
  aucLoading = false;
  redraw();
}
// 拍賣頁每次重畫都叫一次：清掉舊的區塊，背景問收藏的報價（拿去拍要用）和拍賣目錄
export function auctionOpen() {
  views.clear();
  quote(); loadAuc();
}
async function aucDo(act, body) {
  if (fake()) { note("示範資料：登入之後才能真的出價。"); return; }
  if (aucBusy || !ready()) return;
  aucBusy = true; redraw();
  try {
    if (NET.flush) await NET.flush(); // 先把存檔送上去，伺服器才看得到最新的
    const r = await NET.call("art", Object.assign({ act }, body));
    if (r && r.ok) {
      snd("coin");
      if (r.view) auc = r.view;
      aucMsg = { text: (r.lines && r.lines[0]) || "", tone: "good" };
      if (typeof r.chips === "number") setChips(r.chips);
      if (r.rev && (act === "list" || act === "cancel")) { try { await reloadSave(r.rev); } catch (e) { /* 下次存的時候會再讀 */ } }
      if (act !== "bid") quote(); // 拿去拍、取消會改收藏
    } else { snd("error"); aucMsg = { text: (r && r.reason) || CAS_AUC.bad, tone: "bad" }; }
  } catch (e) { snd("error"); aucMsg = { text: (e && e.message) || CAS_AUC.bad, tone: "bad" }; }
  aucBusy = false;
  redraw();
}
export function auctionPane() {
  const box = mk("gal-auction");
  const draw = () => {
    if (!ready() && !fake()) { box.replaceChildren(mk("gal-empty", h("p", null, "登入之後才看得到拍賣。"))); return; }
    if (!auc) { box.replaceChildren(mk("gal-empty", h("p", null, aucFailed ? "現在連不上拍賣行，晚點再來。" : "翻拍賣目錄中……"))); return; }
    const A = auc, phone = window.innerWidth < 761 || window.innerHeight < 501; // 手機：拍我的畫、收標結果收起來，點開才看（測試 11-14：表單在很下面要捲很遠）
    const lot = l => {
      const own = !!l.mineSeller, art = ART_HOOKS.art ? ART_HOOKS.art(l.work) : null;
      const inp = h("input", { type: "number", inputmode: "numeric", class: "gal-in", min: String(l.reserve), step: String(NUM.auction.unit || 1000), value: aucForm.bid[l.id] != null ? String(aucForm.bid[l.id]) : l.mine != null ? String(l.mine) : String(l.reserve), "aria-label": `出價（底價 ${casNum(l.reserve)}）`, onInput: e => { aucForm.bid[l.id] = e.target.value === "" ? null : Number(e.target.value); } });
      return h("article", { class: "gal-lot" + (l.mine != null ? " has-bid" : "") + (own ? " mine-seller" : "") },
        h("div", { class: "gal-easel", "aria-hidden": "true" }, h("div", { class: "gal-easel-art", html: art || "" })),
        h("div", { class: "gal-lot-info" },
          h("p", { class: "gal-lot-t" }, h("b", null, l.title), h("i", { class: "gal-tier" }, l.tierName), h("i", { class: "gal-self" }, own ? "你的畫" : l.sellerName)),
          h("p", { class: "gal-lot-m" }, `底價 ${casNum(l.reserve)}${l.ceil > 0 ? `・最高 ${casNum(l.ceil)}` : ""}・${CAS_AUC.ends} ${fmtWhen(l.closeAt)}（${leftText(l.closeAt)}）`),
          h("p", { class: "gal-lot-m" }, l.bidders ? aucFill(CAS_AUC.bidders, { n: l.bidders }) : CAS_AUC.none),
          own ? h("div", { class: "gal-bid" }, l.canCancel ? btn(CAS_AUC.cancel, () => aucDo("cancel", { id: l.id }), "small gal-btn", { disabled: aucBusy ? true : null }) : h("small", { class: "gal-lot-m" }, l.bidders ? CAS_AUC.hasBids : "收標前沒有人出價才能取消。"))
            : h("div", { class: "gal-bid" }, inp, btn(l.mine != null ? CAS_AUC.raise : CAS_AUC.bid, () => aucDo("bid", { id: l.id, amt: Number(inp.value) }), "small primary gal-btn", { disabled: aucBusy ? true : null }),
              l.mine != null ? h("small", { class: "gal-sealed" }, `${CAS_AUC.mine} ${casNum(l.mine)}（只有你看得到）`) : null)));
    };
    const mine = ((data && data.mine) || []).filter(x => !x.lock);
    const listId = aucForm.listId && mine.some(x => x.id === aucForm.listId) ? aucForm.listId : "";
    const pick = mine.find(x => x.id === listId);
    // 範圍要跟伺服器一樣（shared/casino_auction.js 的 casAucRange）：下限進位、上限不超過現價加溢價上限、都照 unit 進位（11-14 測試：畫面寫 200.24 萬，伺服器要 200.3 萬）
    const unit = NUM.auction.unit || 1000, prem = A.premiumDay || NUM.auction.premiumDay;
    const lo = pick ? Math.ceil(pick.price * (A.floorPct || 80) / 100 / unit) * unit : 0, hi = pick ? Math.floor(Math.min(pick.price * (A.ceilPct || 150) / 100, pick.price + prem) / unit) * unit : 0;
    const resv = h("input", { type: "number", inputmode: "numeric", class: "gal-in", min: String(lo), step: String(NUM.auction.unit || 1000), placeholder: "底價", value: aucForm.reserve === "" ? "" : String(aucForm.reserve), "aria-label": "底價", onInput: e => { aucForm.reserve = e.target.value === "" ? "" : Number(e.target.value); } });
    const range = h("p", { class: "gal-range" });
    const setRange = () => { range.textContent = pick ? aucFill(CAS_AUC.priceRange, { lo: A.floorPct || 80, hi: A.ceilPct || 150, a: casNum(lo), b: casNum(hi) }) : "先選壹幅收藏的畫。"; };
    setRange();
    const sel = h("select", { class: "gal-in", "aria-label": "選壹幅自己的畫", onChange: e => { aucForm.listId = e.target.value; const m = mine.find(x => x.id === e.target.value); aucForm.reserve = m ? Math.floor(m.price) : ""; rerenderAuc(); } },
      h("option", { value: "" }, mine.length ? "選壹幅自己的畫……" : "沒有可以拍的畫"), mine.map(m => h("option", Object.assign({ value: m.id }, m.id === listId ? { selected: "" } : {}), `${m.title}（${m.tierName}）`)));
    const canList = !!pick && A.listLeft > 0 && aucForm.reserve !== "" && aucForm.reserve >= lo && aucForm.reserve <= hi && !aucBusy;
    if (pick && aucForm.reserve === "") { aucForm.reserve = Math.floor(pick.price); resv.value = String(aucForm.reserve); }
    box.replaceChildren(
      aucMsg && aucMsg.text ? h("p", { class: "gal-msg " + aucMsg.tone, role: "status" }, aucMsg.text) : null,
      h("div", { class: "gal-lots" }, A.open.length ? A.open.map(lot) : h("p", { class: "gal-empty" }, aucFill(CAS_AUC.rule, { days: NUM.auction.closeDays, hour: NUM.auction.closeHour, lo: A.floorPct || 80, hi: A.ceilPct || 150, fee: A.feePct || NUM.auction.feePct, age: A.minAge || NUM.auction.minAge }))),
      h("details", { class: "gal-sell", open: !phone || aucForm.listId ? "" : null },
        h("summary", { class: "gal-h gal-sum" }, "拍我的畫", h("span", { class: "gal-open" }, "點開 ▾"), h("span", { class: "gal-close" }, "收起來 ▴")),
        h("p", { class: "gal-hold" }, `還能同時拍 ${A.listLeft} 幅${A.hold ? `・出價鎖住 ${casNum(A.hold)} 籌碼` : ""}`),
        h("div", { class: "gal-sell-row" }, sel, resv, range, btn(`${CAS_AUC.list}（${NUM.auction.closeDays} 天）`, () => aucDo("list", { id: listId, reserve: Number(aucForm.reserve) }), "small gal-btn primary", { disabled: canList ? null : true }))),
      h("details", { class: "gal-last", open: phone ? null : "" }, h("summary", { class: "gal-h gal-sum" }, "收標結果（只公開得標價）", h("span", { class: "gal-open" }, "點開 ▾"), h("span", { class: "gal-close" }, "收起來 ▴")),
        A.done && A.done.length ? h("ul", null, A.done.map(x => h("li", null, h("b", null, x.title), h("i", { class: "gal-tier" }, x.tierName), x.price != null ? h("span", null, casNum(x.price)) : h("span", { class: "gal-flow" }, "流標"), h("small", null, fmtWhen(x.closedAt).split(" ")[0])))) : h("p", { class: "gal-range" }, "還沒有收標的拍賣。")));
  };
  const rerenderAuc = () => draw();
  views.add(draw); draw();
  return box;
}
