// ================================================================
//  藝術市場第一步（11-14）：畫廊「今日特展」每幅畫下面的「買下」「賣回」，和「我收藏的畫」。
//  規則和錢都在伺服器（functions/art.js、shared/casino_art.js）：這裡只拿報價、按按鈕、畫結果。
//  定位是避險資產（翊文：「畫可以當像富人買用來避險的感覺」）：價錢不閃、不跳、不用紅綠箭頭，安安靜靜寫一個數字。
//  沒登入、連不上伺服器就不顯示（畫廊照常）。介面上的字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../shared/casino.js";
import { CAS_ART } from "../../shared/casino_art.js";
import { NET } from "./net_firebase.js";
import { ART } from "./art.js";
import { UI, btn, h, note, setChips, snd } from "./ui_core.js";
import { reloadSave } from "./ui_login.js";

let data = null; // 最近一次的報價 { items, mine, left, perDay, holdMax, sellPct, chips }；重畫畫廊時先用這份，背景再問一次
let msg = null; // { text, tone } 最近一次買賣的結果
let busy = false, loading = false, failed = false;
const views = new Set(); // 現在畫面上的區塊：資料變了就一起重畫

const ready = () => !!(UI.net && NET.loggedIn);
const DEV = !!import.meta.env.DEV;
const fake = () => DEV && !ready(); // 開發的時候沒登入：用示範資料把畫面畫出來（玩家看不到）
// 「看畫」：收藏裡的畫也能點開來看（ui_story.js 登記，那邊才有畫的內容和看畫的流程：第壹次看拿靈感、可怕的畫要擲理智）
export const ART_HOOKS = { view: null };
export const collectOn = () => ready() || DEV; // 「我收藏的畫」頁籤
export const auctionOn = () => DEV; // 「拍賣」頁籤：伺服器還沒做，先只有開發看得到
const FAKE_MINE = [
  { id: "d1", title: "歪頭的佩佩", tierName: "珍藏", paid: 120000, price: 131000, sellPrice: 104800, breakEven: 6 },
  { id: "d2", title: "窗邊的黃昏", tierName: "稀有", paid: 480000, price: 452000, sellPrice: 361600, breakEven: 0 },
  { id: "d3", title: "無名的肖像", tierName: "普通", paid: 30000, price: 30500, sellPrice: 24400, breakEven: 2 },
];
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
    const it = (data && data.items.find(x => x.id === id)) || (fake() ? fakeItem(id) : null);
    if ((!ready() && !fake()) || !it) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const why = it.owned ? "" : it.canBuy ? "" : data && data.left <= 0 ? CAS_ART.dayCap.replace("{n}", data.perDay) : data && data.chips < it.price ? CAS_ART.poor : "";
    box.replaceChildren(
      mk("artmarket-info", h("span", { class: "artmarket-tier t" + it.tier }, it.tierName), h("span", { class: "artmarket-price" }, `${CAS_ART.price} ${casNum(it.price)}`), it.owned ? h("span", { class: "artmarket-own" }, CAS_ART.owned) : null),
      mk("artmarket-acts",
        btn(CAS_ART.buy, () => trade("buy", id), "small primary", { disabled: busy || !it.canBuy, "aria-label": `${CAS_ART.buy}，${casNum(it.price)} 籌碼` }),
        btn(it.owned ? [CAS_ART.sell, h("small", null, ` ${casNum(it.sellPrice)}`)] : CAS_ART.sell, () => trade("sell", id), "small", { disabled: busy || !it.owned, "aria-label": it.owned ? `${CAS_ART.sell}，拿回 ${casNum(it.sellPrice)} 籌碼` : CAS_ART.sell })),
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
        h("div", { class: "artmarket-btns" }, btn("看畫", () => ART_HOOKS.view && ART_HOOKS.view(x.id), "small primary", { "aria-label": `看${x.title}` }), btn([CAS_ART.sell, h("small", null, ` ${casNum(x.sellPrice)}`)], () => trade("sell", x.id), "small", { disabled: busy, "aria-label": `${CAS_ART.sell}${x.title}，拿回 ${casNum(x.sellPrice)} 籌碼` }))))));
      kids.push(h("p", { class: "hint" }, CAS_ART.rule.replace("{perDay}", data.perDay).replace("{holdMax}", data.holdMax).replace("{sellPct}", data.sellPct)));
    }
    box.replaceChildren(...kids);
  };
  views.add(draw); draw();
  return box;
}

// ---------- 拍賣（示範資料版；翊文 11-14：封閉式出價、每幅稀有畫壹場 3 天、玩家也能拍自己的畫、只公開得標價） ----------
// 規則和欄位還沒定（子代理在做規則和伺服器），下面的欄位是我假設的，伺服器好了再對齊：
//   A = { lots: [{ id, title, tierName, seller: "館方"|"你", start, left, bid }], last: [{ title, tierName, price, day }], mine: [{ id, title, tierName, floor }] }
//   start 起標價；left 還剩多久；bid 你出過的價（沒出過是 null，只有你自己看得到）。動作 art act "auction"：op bid／withdraw／list（待定）
const DEMO_AUC = {
  lots: [
    { id: "a1", title: "歪頭的佩佩", tierName: "稀有", seller: "館方", start: 400000, left: "還有 2 天 5 小時", bid: 520000 },
    { id: "a2", title: "雨夜的窗", tierName: "超稀有", seller: "館方", start: 1200000, left: "還有 1 天 3 小時", bid: null },
    { id: "a3", title: "無名的肖像", tierName: "稀有", seller: "你", start: 350000, left: "還有 2 天 20 小時", bid: null },
  ],
  last: [{ title: "紅色的晚餐", tierName: "稀有", price: 610000, day: "11-13" }, { title: "靜物與佩佩", tierName: "超稀有", price: 1450000, day: "11-12" }],
  mine: [{ id: "d1", title: "歪頭的佩佩", tierName: "珍藏", floor: 120000 }, { id: "d2", title: "窗邊的黃昏", tierName: "稀有", floor: 480000 }],
};
const aucForm = { bid: {}, list: "", floor: "" };
export function auctionPane() {
  const A = DEMO_AUC;
  if (!fake() && !(data && data.auction)) return mk("gal-empty", h("p", null, "拍賣還在準備，開放時館方公告會說。"));
  const box = mk("gal-auction");
  const lot = l => {
    const mineLot = l.seller === "你";
    const inp = h("input", { type: "number", inputmode: "numeric", class: "gal-in", min: String(l.start), step: "10000", value: aucForm.bid[l.id] != null ? String(aucForm.bid[l.id]) : l.bid != null ? String(l.bid) : "", "aria-label": `出價（起標 ${casNum(l.start)}）`, onInput: e => { aucForm.bid[l.id] = e.target.value === "" ? null : Number(e.target.value); } });
    return h("article", { class: "gal-lot" + (l.bid != null ? " has-bid" : "") },
      h("div", { class: "gal-easel", "aria-hidden": "true" }, h("div", { class: "gal-easel-art", html: ART.exhibit("frog") })),
      h("div", { class: "gal-lot-info" },
        h("p", { class: "gal-lot-t" }, h("b", null, l.title), h("i", { class: "gal-tier" }, l.tierName), mineLot ? h("i", { class: "gal-self" }, "你的畫") : null),
        h("p", { class: "gal-lot-m" }, `起標 ${casNum(l.start)}・${l.left}`),
        mineLot ? h("p", { class: "gal-lot-m" }, "這幅是你送來拍的：結束後得標價扣手續費給你。")
          : h("div", { class: "gal-bid" }, inp, btn(l.bid != null ? "改價" : "出價", () => note("示範資料：還不能真的出價。"), "small primary gal-btn"), l.bid != null ? btn("撤回", () => { aucForm.bid[l.id] = null; inp.value = ""; }, "small gal-btn") : null),
        l.bid != null && !mineLot ? h("p", { class: "gal-sealed" }, `你出了 ${casNum(l.bid)}（只有你看得到）`) : null));
  };
  box.append(h("div", { class: "gal-lots" }, A.lots.map(lot)),
    h("div", { class: "gal-sell" },
      h("h3", { class: "gal-h" }, "拍我的畫"),
      h("div", { class: "gal-sell-row" },
        h("select", { class: "gal-in", "aria-label": "選壹幅自己的畫", onChange: e => { aucForm.list = e.target.value; } }, h("option", { value: "" }, "選壹幅自己的畫……"), A.mine.map(m => h("option", { value: m.id }, `${m.title}（${m.tierName}）`))),
        h("input", { type: "number", inputmode: "numeric", class: "gal-in", min: "0", step: "10000", placeholder: "起標價", "aria-label": "起標價", onInput: e => { aucForm.floor = e.target.value; } }),
        btn("送去拍賣（3 天）", () => note("示範資料：還不能真的送拍。"), "small gal-btn primary"))),
    h("div", { class: "gal-last" }, h("h3", { class: "gal-h" }, "上壹場得標價"), h("ul", null, A.last.map(x => h("li", null, h("b", null, x.title), h("i", { class: "gal-tier" }, x.tierName), h("span", null, casNum(x.price)), h("small", null, x.day))))));
  return box;
}
