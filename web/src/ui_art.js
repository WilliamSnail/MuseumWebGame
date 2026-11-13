// ================================================================
//  藝術市場第一步（11-14）：畫廊「今日特展」每幅畫下面的「買下」「賣回」，和「我收藏的畫」。
//  規則和錢都在伺服器（functions/art.js、shared/casino_art.js）：這裡只拿報價、按按鈕、畫結果。
//  定位是避險資產（翊文：「畫可以當像富人買用來避險的感覺」）：價錢不閃、不跳、不用紅綠箭頭，安安靜靜寫一個數字。
//  沒登入、連不上伺服器就不顯示（畫廊照常）。介面上的字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../shared/casino.js";
import { CAS_ART } from "../../shared/casino_art.js";
import { NET } from "./net_firebase.js";
import { UI, btn, h, setChips, snd } from "./ui_core.js";
import { reloadSave } from "./ui_login.js";

let data = null; // 最近一次的報價 { items, mine, left, perDay, holdMax, sellPct, chips }；重畫畫廊時先用這份，背景再問一次
let msg = null; // { text, tone } 最近一次買賣的結果
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
        mk("artmarket-name", h("b", null, x.title || x.id), h("small", null, `${x.tierName}　買進 ${casNum(x.paid)}　現價 ${casNum(x.price)}`)),
        btn([CAS_ART.sell, h("small", null, ` ${casNum(x.sellPrice)}`)], () => trade("sell", x.id), "small", { disabled: busy, "aria-label": `${CAS_ART.sell}${x.title}，拿回 ${casNum(x.sellPrice)} 籌碼` })))));
      kids.push(h("p", { class: "hint" }, CAS_ART.rule.replace("{perDay}", data.perDay).replace("{holdMax}", data.holdMax).replace("{sellPct}", data.sellPct)));
    }
    box.replaceChildren(...kids);
  };
  views.add(draw); draw();
  return box;
}
