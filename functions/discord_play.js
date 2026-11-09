import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Discord 聯動第三步：在 Discord 玩（決定 0051，docs/Discord聯動規劃.md「第三步」）
//  /pepe-21點、/pepe-大禮包、/pepe-餐車、/pepe-拚經濟、/pepe-實況、/pepe-斗內。要先綁定（沒綁定的人收到怎麼綁定或加入）。
//  **規則只有壹套**：這裡呼叫的是 functions/casino.js 的 playCore 和 actDeal／actHitStand／actPack／actBuy／actEcon／liveAct，
//  遊戲（casino 這個 Function）呼叫的是同壹批。次數、上限、籌碼、存檔都跟遊戲共用，不會因為換到 Discord 多拿壹份。
//  **3 秒**：每壹個動作當場把交易做完就回，不先回再繼續做（Function 回完不保證還能跑），也不編輯訊息演出：結果壹次排好回完。
//  公開與否：21 點的牌局、餐車只有本人看得到（ephemeral）；大禮包、拚經濟、實況、斗內回在頻道。
//    21 點打完，頻道另外有壹行結果（走 outbox，同壹個人 5 分鐘內連打併成壹則：shared/discord_out.js 的 dcOutBjAdd，functions/discord_out.js 的 processBj）。
//  按鈕：custom_id 是「bj:hit|stand:{seq}:{Discord ID}」；seq 擋掉連按兩下和過期的按鈕，Discord ID 擋掉別人按（再驗 interaction 的使用者）。
//  存檔：21 點（連勝連敗的心情、理智）和餐車（吃了加心情）會改存檔，跟遊戲壹樣在同壹個交易裡寫、rev 加壹、事後通知 save_changed（見 casino.js 的 playCore）。
//    改的是存檔裡「挑戰模式」的那位參觀者（profiles.challenge），跟遊戲裡的賭場壹樣；沒有存檔或沒有挑戰模式的人，只算籌碼，沒有心情、理智的變化。
//  回覆壹律過 dcScrub：不放 email、理智、怪癖、靈感；暱稱過 dcNick；不 @ 任何人。
// ================================================================
import { getFirestore } from "firebase-admin/firestore";
import { casWalletFix } from "./shared/casino_wallet.js";
import { CAS_MENU } from "./shared/casino_text.js";
import { DC_BET_OPT, DC_PACK_OPT, DC_LIVE_OPT, DC_CMD, DC_TEXT, dcReply, dcText, dcUpdate } from "./shared/discord.js";
import { dcBjButtons, dcBjText, dcCustomParse, dcDonateText, dcEconText, dcFoodMenu, dcFoodText, dcLiveOffText, dcLiveOnText, dcPackText, dcReasonText, dcScrub } from "./shared/discord_play.js";
import { taipeiDay } from "./shared/logic.js";
import { actBuy, actDeal, actEcon, actHitStand, actPack, cryptoRng, liveAct, no, playCore, shape } from "./casino.js";
import { linkedUid } from "./discord_data.js";
import { outBj } from "./discord_out.js";

const db = () => getFirestore();

// 這個 Discord 帳號綁著的館友：{ uid, nick }。沒綁、或遊戲帳號不見了（不是館友）回 null
export async function playerOf(discordId) {
  const uid = await linkedUid(discordId);
  if (!uid) return null;
  const ms = await db().doc(`members/${uid}`).get();
  return ms.exists ? { uid, nick: ms.data().nick } : null;
}
const NONE = () => dcReply(dcText("chipsNone"), true); // 還沒綁定：怎麼綁定、怎麼加入
const reasonReply = r => dcReply(dcReasonText(r && r.reason), true);
async function chipsOf(uid, now) {
  const s = await db().doc(`casinoWallets/${uid}`).get();
  return casWalletFix(s.exists ? JSON.parse(s.data().data) : null, taipeiDay(now)).chips;
}

// ---------- 21 點 ----------
// 回覆：文字 + 按鈕（還在打）或沒有按鈕（打完）。update＝按了按鈕，把原本那則換掉
function bjReply(p, r, update, note) {
  const text = dcBjText(r, { note }), rd = r.round;
  const comps = rd && rd.state === "playing" ? dcBjButtons(rd.seq, p.discordId) : [];
  return update ? dcUpdate(text, comps) : dcReply(text, true, comps);
}
// 這一步把這一手打完了（r.settle 是 null＝沒結算，不重複發）：頻道多壹行結果
async function bjFinished(me, r) {
  const rd = r && r.round;
  if (r && r.ok !== false && r.settle && rd && rd.state === "done" && rd.out) await outBj(me.uid, me.nick, rd.id, rd.out.kind, rd.out.net);
}
async function cmdBj(p) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const text = p.opts[DC_BET_OPT];
  // 壹個交易：還有壹手沒打完（遊戲裡開的也一樣）就接著打；沒有才用下注的金額發牌
  const r = await playCore(me, "", { save: true }, ctx => {
    if (ctx.round && ctx.round.state === "playing") return shape(ctx, { resumed: true });
    if (text == null || !String(text).trim()) return { ok: false, reason: DC_TEXT.bjNoBet };
    return actDeal(ctx, { text });
  });
  if (!r.ok) return reasonReply(r);
  await bjFinished(me, r);
  return bjReply(p, r, false, r.resumed ? DC_TEXT.bjResume : "");
}
async function onBj(p, c) {
  if (c.discordId !== p.discordId) return dcReply(DC_TEXT.bjNotYours, true); // 別人的按鈕
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const r = await playCore(me, "", { save: true }, ctx => actHitStand(c.act, ctx, { seq: c.seq }));
  if (!r.ok) { // seq 對不上（連按兩下、過期的訊息）或這一手早就打完了：什麼都沒改，把訊息換成現在的牌局
    const cur = await playCore(me, "", {}, ctx => (ctx.round ? shape(ctx) : no({ reason: DC_TEXT.bjNoBet })));
    if (!cur.ok || !cur.round) return dcUpdate(dcReasonText(r.reason), []);
    return bjReply(p, cur, true, DC_TEXT.bjStale);
  }
  await bjFinished(me, r);
  return bjReply(p, r, true);
}

// ---------- 大禮包 ----------
async function cmdPack(p) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const n = p.opts[DC_PACK_OPT] == null ? 1 : Math.floor(+p.opts[DC_PACK_OPT]);
  const r = await playCore(me, "", {}, ctx => actPack(ctx, { n }));
  return r.ok ? dcReply(dcPackText(me.nick, r), false) : reasonReply(r);
}

// ---------- 餐車：選單 ----------
async function cmdFood(p, now) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  return dcReply(dcFoodText(await chipsOf(me.uid, now)), true, dcFoodMenu(p.discordId));
}
async function onFood(p, c, now) {
  if (c.discordId !== p.discordId) return dcReply(DC_TEXT.foodNotYours, true);
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const item = p.values[0];
  if (!CAS_MENU.some(it => it.id === item)) return dcUpdate(dcFoodText(await chipsOf(me.uid, now)), dcFoodMenu(p.discordId));
  const r = await playCore(me, "", { save: true }, ctx => actBuy(ctx, { item }));
  if (!r.ok) return dcUpdate(dcFoodText(await chipsOf(me.uid, now), dcScrub([r.reason])), dcFoodMenu(p.discordId));
  const lines = (r.lines || []).concat((r.ach || []).map(a => `🏅 ${a.name}`));
  return dcUpdate(dcFoodText(r.wallet.chips, lines), dcFoodMenu(p.discordId));
}

// ---------- 拚經濟 ----------
async function cmdEcon(p) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const r = await playCore(me, "", {}, actEcon);
  return r.ok ? dcReply(dcEconText(me.nick, r), false) : reasonReply(r);
}

// ---------- 實況、斗內（Discord 的回覆本身就是公開的，所以不另外寫 outbox：liveAct 的 out: false） ----------
async function cmdLive(p) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const off = p.opts[DC_LIVE_OPT] === "off";
  const r = await liveAct(me, off ? "liveOff" : "liveOn", cryptoRng, { out: false });
  if (!r.ok) return reasonReply(r);
  return dcReply(off ? dcLiveOffText(me.nick) : dcLiveOnText(me.nick, r.live && r.live.until), false);
}
async function cmdDonate(p) {
  const me = await playerOf(p.discordId);
  if (!me) return NONE();
  const r = await liveAct(me, "donate", cryptoRng, { out: false });
  return r.ok ? dcReply(dcDonateText(r), false) : reasonReply(r);
}

export const PLAY_HANDLERS = { bj: cmdBj, pack: cmdPack, food: cmdFood, econ: cmdEcon, live: cmdLive, donate: cmdDonate };
export const PLAY_COMMANDS = [DC_CMD.bj, DC_CMD.pack, DC_CMD.food, DC_CMD.econ, DC_CMD.live, DC_CMD.donate];

// 按鈕、選單。認不得的（過期的舊版、亂寫的）說已經過期
export async function onComponent(p, now) {
  const c = dcCustomParse(p.customId);
  if (!c) return dcReply(dcText("noButton"), true);
  if (c.kind === "bj" && p.componentType === 2) return onBj(p, c);
  if (c.kind === "food" && p.componentType === 3) return onFood(p, c, now);
  return dcReply(dcText("noButton"), true);
}
