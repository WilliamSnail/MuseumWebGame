// ================================================================
//  Discord 聯動第二步：遊戲大事發到頻道的規則（決定 0051，docs/Discord聯動規劃.md「第二步」）
//  純函式：不碰網路、資料庫、時鐘（時間從參數來）。Functions（functions/discord_out.js）負責寫 discordOutbox、發送。
//  流程：遊戲裡的交易成功之後，把事件寫進 discordOutbox/{id}（只有 Functions 碰得到，firestore.rules 最後壹條擋住瀏覽器）；
//        onDocumentCreated 的 Function 檢查冷卻，發到頻道。Discord 掛掉、沒 token、發失敗，都不影響遊戲。
//  事件（kind）：broke 莊家破產、breaker 有人壹把把莊家打到破產、rescued 莊家被救回來、join 有人靠 /pepe-加入 成為館友、
//               liveOn 實況開播、donate 斗內感謝。（第三步再加 bj：在 Discord 打完的 21 點，每人 5 分鐘併成壹則。）
//  公開的字：只有遊戲暱稱（過 dcNick：沒有 @、markdown、連結）；沒有 email、理智、怪癖、靈感；不公開誰沒錢、誰最後壹名。
//  壹則也不 @ 任何人：送出去的 body 壹定帶 allowed_mentions: { parse: [] }。
//  所有名字都用 dcOut／DC_OUT 開頭（shared 的檔接在壹起跑，頂層名字不能重複）。文字是草稿，Yuga 可以改。
// ================================================================
import { NUM } from "./config.js";
import { dcNick, dcNum } from "./discord.js";

export const DC_OUT_KINDS = ["broke", "breaker", "rescued", "join", "liveOn", "donate", "bj"];
export const DC_OUT_TEXT = {
  broke: "💸 莊家破產了。Yuga 正在翻抽屜找零錢。想幫忙的人，到賭場的「拚經濟」。",
  breaker: "💥 {nick} 壹把把莊家打到破產了！荷官的手在抖。",
  rescued: "🩹 {nick} 把莊家拚回來了！莊家又有錢了，Yuga 鬆了壹口氣。",
  join: "🚪 {nick} 加入了博物館。歡迎！",
  liveOn: "📺 {nick} 開播了！想看的人到賭場的「實況」，也可以斗內。",
  donate: "🎁 感謝 {from} 對 {to} 的斗內：{n} 籌碼！",
  bj: "🃏 {nick} 打了壹手 21 點，{res}（{tail}）",
  bjMany: "🃏 {nick} 連打了 {hands} 手 21 點：{wins} 勝 {losses} 敗 {pushes} 平（{tail}）",
};
const OUT_FILL = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
const OUT_ID = /^[A-Za-z0-9_-]{1,80}$/;

// 組壹個要發的事件：kind 要是上面那幾種；d：{ nick, from, to, n, key }。key 是「這件事」的身分（同壹件事不管叫幾次，文件的名字都壹樣，只會有壹份）。
// 回傳 { id, kind, text } 或 null（kind 不認得、key 不合）。字壹律只有暱稱
export function dcOutEvent(kind, d) {
  if (!DC_OUT_KINDS.includes(kind) || !d || typeof d !== "object") return null;
  const key = String(d.key == null ? "" : d.key).replace(/[^A-Za-z0-9_-]/g, "");
  const id = `${kind}-${key}`;
  if (!key || !OUT_ID.test(id)) return null;
  const v = { nick: dcNick(d.nick), from: dcNick(d.from), to: dcNick(d.to), n: dcNum(d.n) };
  if (kind === "bj") { // 在 Discord 打完的 21 點：同壹個人 5 分鐘內併成壹則（Functions 發的時候併），所以事件要記這手的輸贏
    const b = d.bj && typeof d.bj === "object" ? d.bj : {}, bk = ["win", "blackjack", "charlie", "lose", "push"].includes(b.kind) ? b.kind : "push", net = Math.trunc(Number.isFinite(+b.net) ? +b.net : 0);
    return { id, kind, text: dcOutBjText(d.nick, dcOutBjAdd(null, bk, net)), bj: { kind: bk, net } };
  }
  return { id, kind, text: OUT_FILL(DC_OUT_TEXT[kind], v) };
}
// ---------- 21 點的併單 ----------
// agg：這個人這個 5 分鐘視窗裡累計的 { hands, wins, losses, pushes, net }。dcOutBjAdd 加壹手（agg 是 null 就從零開始），回傳新的，不改原本的
export function dcOutBjAdd(agg, kind, net) {
  const a = agg && typeof agg === "object" ? agg : {}, c = x => Math.max(0, Math.floor(+x || 0));
  const win = kind === "win" || kind === "blackjack" || kind === "charlie";
  return { hands: c(a.hands) + 1, wins: c(a.wins) + (win ? 1 : 0), losses: c(a.losses) + (kind === "lose" ? 1 : 0), pushes: c(a.pushes) + (kind === "push" ? 1 : 0), net: Math.trunc((+a.net || 0) + (Number.isFinite(+net) ? +net : 0)) };
}
// 壹手就說這手，多手就說「連打 N 手」。只有暱稱和輸贏，沒有籌碼餘額
export function dcOutBjText(nick, agg) {
  const net = agg.net || 0, tail = net > 0 ? `淨賺 ${dcNum(net)}` : net < 0 ? `輸了 ${dcNum(-net)}` : "不賺不賠";
  if (agg.hands <= 1) return OUT_FILL(DC_OUT_TEXT.bj, { nick: dcNick(nick), res: agg.wins ? "贏了" : agg.losses ? "輸了" : "平手", tail });
  return OUT_FILL(DC_OUT_TEXT.bjMany, { nick: dcNick(nick), hands: agg.hands, wins: agg.wins, losses: agg.losses, pushes: agg.pushes, tail });
}
// 這個視窗還在嗎：state 是 { since, messageId }。在 outBjMin 分鐘內、而且第壹則已經發出去（有 messageId）才併；沒有 messageId（第壹則還在發）不併
export function dcOutBjWindow(state, nowMs) {
  if (!state || typeof state !== "object" || !Number.isFinite(+state.since) || !Number.isFinite(nowMs)) return "new";
  if (nowMs - +state.since >= NUM.discord.outBjMin * 60000) return "new";
  return typeof state.messageId === "string" && state.messageId ? "merge" : "busy";
}
// 這種事件的冷卻（毫秒）：預設 outCooldownMin 分鐘最多壹則；斗內用 outDonateMin
export function dcOutCooldownMs(kind) {
  const m = kind === "donate" ? NUM.discord.outDonateMin : NUM.discord.outCooldownMin;
  return Math.max(0, +m || 0) * 60000;
}
// 冷卻判斷：state 是 { at }（上次發出的時間，沒有＝沒發過）。回傳 { send, waitMs }
export function dcOutGate(state, kind, nowMs) {
  const at = state && Number.isFinite(+state.at) ? +state.at : null;
  const cd = dcOutCooldownMs(kind);
  if (at == null || !Number.isFinite(nowMs)) return { send: true, waitMs: 0 };
  const left = at + cd - nowMs;
  return left > 0 ? { send: false, waitMs: left } : { send: true, waitMs: 0 };
}
// 太舊的事件不發（Function 被延遲了，半小時前的事不要突然跳出來）
export const dcOutStale = (atMs, nowMs) => !(Number.isFinite(+atMs) && Number.isFinite(nowMs) && nowMs - +atMs <= NUM.discord.outMaxAgeMin * 60000);
// 送給 Discord 的 body：壹定不 @ 任何人
export function dcOutBody(text) {
  const t = String(text == null ? "" : text);
  return { content: [...t].length > 1900 ? [...t].slice(0, 1899).join("") + "…" : t, allowed_mentions: { parse: [] } };
}
