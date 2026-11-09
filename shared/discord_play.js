// ================================================================
//  Discord 聯動第三步：在 Discord 玩（決定 0051，docs/Discord聯動規劃.md「第三步」）的文字和按鈕
//  純函式：不碰網路、資料庫、時鐘。遊戲規則壹個字都沒有重寫：Functions（functions/discord_play.js）呼叫的是 functions/casino.js 的同壹份交易，
//  這裡只把交易的結果排成 Discord 的訊息（文字 + 按鈕 / 選單），再把按鈕的 custom_id 解回來。
//  每壹則回覆都過 dcScrub：不放 email、理智、怪癖、靈感（遊戲裡「理智 -1」這類字會被拿掉）；暱稱過 dcNick。
//  所有名字都用 dc／DC 開頭（shared 的檔接在壹起跑，頂層名字不能重複）。文字是草稿，Yuga 可以改（DC_TEXT 在 discord.js，荷官的話在 casino_text.js 的 CAS_*）。
// ================================================================
import { NUM } from "./config.js";
import { CAS_MENU, CAS_TEXT } from "./casino_text.js";
import { casCardName } from "./casino.js";
import { DC_TEXT, dcNick, dcNum, dcPlain, dcText } from "./discord.js";
import { dcOutBjText } from "./discord_out.js";

// ---------- 把遊戲裡的字弄乾淨：Discord 裡不放 email、理智、怪癖、靈感 ----------
// 「心情 +2，理智 +1」→「心情 +2」；「（理智 -1）」整段拿掉；「心情、理智不會再加了」→「心情不會再加了」；還有這幾個字的整行丟掉
export function dcScrub(lines) {
  const out = [];
  for (const raw of Array.isArray(lines) ? lines : [lines]) {
    let s = String(raw == null ? "" : raw);
    s = s.replace(/（[^（）]*(理智|怪癖|靈感)[^（）]*）/g, "").replace(/[，、]\s*理智\s*[+-]?\d*/g, "").replace(/理智\s*[+-]\d+[，、]?\s*/g, "");
    s = s.replace(/心情、理智/g, "心情").replace(/理智、心情/g, "心情");
    s = s.trim();
    if (!s || /理智|怪癖|靈感|[\w.+-]+@[\w-]+\.[\w.]+/.test(s)) continue;
    out.push(s);
  }
  return out;
}
const dcLines = a => dcScrub(a).join("\n");
// 台灣時間的 HH:mm（Discord 回覆裡的「播到幾點」）
export function dcClock(ms) {
  if (!Number.isFinite(+ms)) return "";
  const d = new Date(+ms + 8 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ---------- 按鈕、選單的 custom_id ----------
// 21 點：bj:hit|stand:{seq}:{Discord ID}。seq 是這一手的步數（連按兩下，第二下的 seq 是舊的，會被擋）；Discord ID 讓別人按不到
// 餐車：food:{Discord ID}
export const dcBjId = (act, seq, discordId) => `bj:${act}:${seq}:${discordId}`;
export const dcFoodId = discordId => `food:${discordId}`;
export function dcCustomParse(id) {
  const s = String(id == null ? "" : id);
  let m = /^bj:(hit|stand):(\d{1,6}):(\d{5,25})$/.exec(s);
  if (m) return { kind: "bj", act: m[1], seq: +m[2], discordId: m[3] };
  m = /^food:(\d{5,25})$/.exec(s);
  if (m) return { kind: "food", discordId: m[1] };
  return null;
}
export const dcBjButtons = (seq, discordId) => [{ type: 1, components: [
  { type: 2, style: 1, label: DC_TEXT.bjHit, custom_id: dcBjId("hit", seq, discordId) },
  { type: 2, style: 2, label: DC_TEXT.bjStand, custom_id: dcBjId("stand", seq, discordId) },
] }];
// 餐車的選單：9 樣餐點，值是餐點的 id（casBuy 認 id）
export function dcFoodMenu(discordId) {
  return [{ type: 1, components: [{ type: 3, custom_id: dcFoodId(discordId), placeholder: DC_TEXT.foodPick, min_values: 1, max_values: 1,
    options: CAS_MENU.map(it => ({ label: `${it.name}（${dcNum(it.price)}）`.slice(0, 100), value: it.id, description: (it.ticket ? "大禮包券，買了壹定拿到" : `抽到大禮包券 ${it.odds}%`).slice(0, 100) })) }] }];
}

// ---------- 21 點 ----------
const cardsText = cs => cs.map(c => (c < 0 ? "？" : casCardName(c))).join(" ");
function dcBjResult(out) {
  const T = CAS_TEXT, k = out.kind, w = out.why;
  if (k === "lose") return w === "bust" ? [T.bust] : w === "tie21" ? [T.lose, T.push21] : [T.lose];
  if (k === "push") return [T.push];
  if (k === "charlie") return T.charlie.slice();
  if (k === "blackjack") return [T.blackjack].concat(w === "dealerBust" ? T.dealerBust : [T.win]);
  return w === "dealerBust" ? T.dealerBust.slice() : [T.win];
}
// 這一手的訊息。v：{ round（casRoundView 的樣子）, settle, ticket, wallet }；o.note：最前面加一行（例如「畫面不是最新的」）
export function dcBjText(v, o = {}) {
  const r = v.round, done = r.state === "done", L = [];
  if (o.note) L.push(o.note);
  L.push(dcText("bjHead", { bet: dcNum(r.bet) }));
  L.push(dcText("bjYou", { cards: cardsText(r.player.cards), total: r.player.total }));
  L.push(done ? dcText("bjDealerDone", { cards: cardsText(r.dealer.cards), total: r.dealer.total }) : dcText("bjDealer", { cards: cardsText(r.dealer.cards) }));
  if (!done && r.warped) L.push(DC_TEXT.bjWarp);
  if (done && r.out) {
    L.push("", ...dcBjResult(r.out));
    if (r.slips && r.slips.length) L.push(dcText("bjSlips", { n: r.slips.length }));
    const net = r.out.net || 0;
    L.push(net > 0 ? dcText("bjWin", { n: dcNum(net) }) + (r.out.bonus > 0 ? dcText("bjWinBonus", { b: dcNum(r.out.bonus) }) : "") : net < 0 ? dcText("bjLose", { n: dcNum(-net) }) : DC_TEXT.bjEven);
    const s = v.settle;
    if (s) {
      L.push(...dcScrub(s.streak || []));
      const names = (s.ach || []).map(a => dcPlain(a && a.name, 12)).filter(Boolean);
      if (names.length) L.push(dcText("bjAch", { names: names.join("、") }));
    }
    if (v.ticket) L.push(CAS_TEXT.packWon);
  }
  if (v.wallet && Number.isFinite(v.wallet.chips)) L.push(dcText("bjChips", { chips: dcNum(v.wallet.chips) }));
  return L.map(x => (x === "" ? "" : dcScrub([x])[0])).filter(x => x !== undefined).join("\n");
}
// 打完在頻道公開的那一行（只有暱稱、輸贏，沒有籌碼餘額）：kind 是 casOutcome 的結果。每人 5 分鐘併成壹則的規則在 discord_out.js
export const dcBjPublic = (nick, kind, net) => dcOutBjText(nick, { hands: 1, wins: kind === "win" || kind === "blackjack" || kind === "charlie" ? 1 : 0, losses: kind === "lose" ? 1 : 0, pushes: kind === "push" ? 1 : 0, net });

// ---------- 餐車 ----------
export function dcFoodText(chips, resultLines) {
  const head = dcText("foodHead", { chips: dcNum(chips) });
  return resultLines && resultLines.length ? dcLines(resultLines) + "\n\n" + head : head;
}

// ---------- 大禮包 ----------
export function dcPackText(nick, res) {
  const rows = (res.packs || []).map(p => dcText("packRow", { name: dcPlain(p.name, 20), n: dcNum(p.chips) }));
  const L = [dcText("packHead", { nick: dcNick(nick) }), ...rows, dcText("packTotal", { total: dcNum(res.total), left: dcNum(res.wallet ? res.wallet.packsLeft : 0) })];
  if (res.ach && res.ach.length) L.push(dcText("bjAch", { names: res.ach.map(a => dcPlain(a && a.name, 12)).filter(Boolean).join("、") }));
  return dcLines(L);
}

// ---------- 拚經濟 ----------
export function dcEconText(nick, res) {
  const e = res.econ || {};
  return dcLines([dcText("econHead", { nick: dcNick(nick) })].concat(e.lines || [], [dcText("econLeft", { n: e.left == null ? 0 : e.left })]));
}

// ---------- 實況、斗內 ----------
export const dcLiveOnText = (nick, until) => dcText("liveOn", { nick: dcNick(nick), t: dcClock(until) });
export const dcLiveOffText = nick => dcText("liveOff", { nick: dcNick(nick) });
export const dcDonateText = res => dcLines([dcText("donateOk", { line: res.line, to: dcNick(res.to) })]);
// 失敗的原因（都是遊戲自己的話）：弄乾淨再說
export const dcReasonText = reason => dcLines([reason]) || DC_TEXT.oops;
