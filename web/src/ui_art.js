// ================================================================
//  藝術市場第一步（11-14）：畫廊「今日特展」每幅畫下面的「買下」「賣回」，和「我收藏的畫」。
//  規則和錢都在伺服器（functions/art.js、shared/casino_art.js）：這裡只拿報價、按按鈕、畫結果。
//  定位是避險資產（翊文：「畫可以當像富人買用來避險的感覺」）：價錢不閃、不跳、不用紅綠箭頭，安安靜靜寫一個數字。
//  沒登入、連不上伺服器就不顯示（畫廊照常）。介面上的字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../shared/casino.js";
import { CAS_ART } from "../../shared/casino_art.js";
import { CAS_AUC } from "../../shared/casino_auction.js";
import { NET } from "./net_firebase.js";
import { UI, btn, h, setChips, snd } from "./ui_core.js";
import { reloadSave } from "./ui_login.js";

let data = null; // 最近一次的報價 { items, mine, left, perDay, holdMax, sellPct, chips }；重畫畫廊時先用這份，背景再問一次
let msg = null; // { text, tone } 最近一次買賣的結果
let auc = null; // 拍賣（11-14 第二步，functions/art.js 的 auctions）：{ open, done, notes, hold, listLeft, … } 見規劃 2.10b
let busy = false, loading = false, failed = false;
const views = new Set(); // 現在畫面上的區塊：資料變了就一起重畫

const ready = () => !!(UI.net && NET.loggedIn);
const redraw = () => views.forEach(f => f());
const mk = (cls, ...kids) => h("div", { class: cls }, ...kids);

async function quote() {
  if (!ready() || loading) return;
  loading = true;
  try {
    const r = await NET.call("art", { act: "quote" });
    failed = false;
    if (r && r.ok) { data = r.art || null; if (typeof r.chips === "number") setChips(r.chips); }
  } catch (e) { failed = true; }
  try { const a = await NET.call("art", { act: "auctions" }); if (a && a.ok) { auc = a.auctions || null; if (typeof a.chips === "number") setChips(a.chips); } } catch (e) { /* 拍賣連不上就不顯示，不影響買賣 */ }
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

// 拍賣的動作（bid、list、cancel）。bid 用 amt、list 用 reserve
async function aucDo(act, extra) {
  if (busy || !ready()) return;
  busy = true; redraw();
  try {
    if (NET.flush) await NET.flush();
    const r = await NET.call("art", Object.assign({ act }, extra));
    if (r && r.ok) {
      snd("coin"); msg = { text: (r.lines && r.lines[0]) || "", tone: "good" };
      if (r.view) auc = r.view;
      if (typeof r.chips === "number") setChips(r.chips);
      if (r.rev) { try { await reloadSave(r.rev); } catch (e) { /* 下次存的時候會再讀 */ } }
      quote();
    } else { snd("error"); msg = { text: (r && r.reason) || CAS_AUC.bad, tone: "bad" }; }
  } catch (e) { snd("error"); msg = { text: (e && e.message) || CAS_AUC.bad, tone: "bad" }; }
  busy = false;
  redraw();
}
const when = ms => { const t = new Date(ms + 8 * 3600000); return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:00`; };
// 拍賣區：開放中的拍賣（出價框）、最近收標的得標價。別人的出價看不到
function aucBlock() {
  const kids = [h("p", { class: "artmarket-held-h" }, CAS_AUC.title), h("p", { class: "hint" }, CAS_AUC.sub)];
  (auc.notes || []).forEach(s => kids.push(h("p", { class: "artmarket-msg good", role: "status" }, s)));
  if (!auc.open.length) kids.push(h("p", { class: "hint" }, "現在沒有開放的拍賣。"));
  else kids.push(h("ul", { class: "artmarket-list" }, auc.open.map(a => {
    const inp = h("input", { type: "number", class: "artmarket-bid", min: a.reserve, step: 1000, inputmode: "numeric", value: a.mine || a.reserve, "aria-label": `「${a.title}」的出價` });
    return h("li", { class: "artmarket-item artmarket-auc" },
      mk("artmarket-name", h("b", null, a.title || a.work), h("small", null, `${a.tierName}　${a.sellerName}　底價 ${casNum(a.reserve)}${a.ceil ? "　最高 " + casNum(a.ceil) : ""}`), h("small", null, `${CAS_AUC.ends} ${when(a.closeAt)}　${a.bidders ? CAS_AUC.bidders.replace("{n}", a.bidders) : CAS_AUC.none}`), a.mine ? h("small", { class: "artmarket-own" }, `${CAS_AUC.mine} ${casNum(a.mine)}`) : null),
      a.mineSeller ? (a.canCancel ? btn(CAS_AUC.cancel, () => aucDo("cancel", { id: a.id }), "small", { disabled: busy }) : h("small", { class: "hint" }, "你的畫"))
        : [inp, btn(a.mine ? CAS_AUC.raise : CAS_AUC.bid, () => aucDo("bid", { id: a.id, amt: Math.floor(+inp.value) }), "small primary", { disabled: busy, "aria-label": `${a.mine ? CAS_AUC.raise : CAS_AUC.bid}「${a.title}」` })]);
  })));
  if (auc.done.length) {
    kids.push(h("p", { class: "artmarket-held-h" }, "最近收標"));
    kids.push(h("ul", { class: "artmarket-list" }, auc.done.map(x => h("li", { class: "artmarket-item" }, mk("artmarket-name", h("b", null, x.title || x.work), h("small", null, `${x.tierName}　${x.sellerName}　${x.price == null ? "流標" : "得標價 " + casNum(x.price)}`))))));
  }
  return kids;
}

// 每幅畫下面的一小塊（id＝畫的 id，跟存檔的 P.story.works 一樣）。館方沒登記這幅（備用週的畫）、還沒問到報價就不畫
export function artMarketRow(id) {
  const box = mk("artmarket-row");
  const draw = () => {
    const it = data && data.items.find(x => x.id === id);
    if (!ready() || !it) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const why = it.owned ? "" : it.canBuy ? "" : data.left <= 0 ? CAS_ART.dayCap.replace("{n}", data.perDay) : data.chips < it.price ? CAS_ART.poor : "";
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
    if (!ready()) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const kids = [h("h2", { class: "artmarket-h" }, CAS_ART.title), h("p", { class: "hint" }, CAS_ART.sub)];
    if (msg) kids.push(h("p", { class: "artmarket-msg " + msg.tone, role: "status" }, msg.text));
    if (!data) kids.push(h("p", { class: "hint" }, failed ? "現在連不上館方的帳，晚點再來。" : "翻帳本中……"));
    else {
      kids.push(h("p", { class: "artmarket-held-h" }, `${CAS_ART.held}（${data.mine.length}／${data.holdMax}）`));
      if (!data.mine.length) kids.push(h("p", { class: "hint" }, CAS_ART.empty));
      else kids.push(h("ul", { class: "artmarket-list" }, data.mine.map(x => h("li", { class: "artmarket-item" },
        mk("artmarket-name", h("b", null, x.title || x.id), h("small", null, `${x.tierName}　買進 ${casNum(x.paid)}　現價 ${casNum(x.price)}`), h("small", { class: "artmarket-be" }, x.breakEven == null ? "" : x.breakEven <= 0 ? CAS_ART.beDone : CAS_ART.be.replace("{n}", x.breakEven))),
        x.lock ? h("small", { class: "hint" }, CAS_AUC.locked) : [btn([CAS_ART.sell, h("small", null, ` ${casNum(x.sellPrice)}`)], () => trade("sell", x.id), "small", { disabled: busy, "aria-label": `${CAS_ART.sell}${x.title}，拿回 ${casNum(x.sellPrice)} 籌碼` }),
          auc && auc.listLeft > 0 ? btn(CAS_AUC.list, () => { const v = prompt(`「${x.title}」的底價（館方價 ${casNum(x.price)} 的 ${auc.floorPct}%～${auc.ceilPct}%）`, String(x.price)); if (v != null && v !== "") aucDo("list", { id: x.id, reserve: Math.floor(+v) }); }, "small", { disabled: busy }) : null]))));
      if (auc) kids.push(...aucBlock());
      kids.push(h("p", { class: "hint" }, CAS_ART.rule.replace("{perDay}", data.perDay).replace("{holdMax}", data.holdMax).replace("{sellPct}", data.sellPct)));
    }
    box.replaceChildren(...kids);
  };
  views.add(draw); draw();
  return box;
}
