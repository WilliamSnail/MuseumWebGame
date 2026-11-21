import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  找 NPC 一起下地下收藏庫（決定 0149）的伺服器端。規則在 shared/npc/coop.js（誰邀得動、機率、禮物錢）和 shared/coop/npc.js（他在趟裡）。
//  放哪裡：NPC 掛在隊伍 /parties/{pid}/npcs（準備區，還不是隊員）；開始時才變成 run 的隊員（functions/coop/coop.js 的 startRun）。
//  錢：邀請的禮物 gift 籌碼從邀請人的錢包搬到已知世界（casWorldIn，來源 npcGift），答應了才收；NPC 沒有錢包。
//  一個交易：邀請人的錢包＋莊家文件（NPC 今天陪了幾趟、現在在哪一隊）；隊伍的改動在交易成功之後（失敗就把錢和 NPC 還回去）。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { NUM } from "../shared/core/config.js";
import { NPC_LIST } from "../shared/npc_list_data.js";
import { npcCounters } from "../shared/npc/core.js";
import { npcCoopRefund, npcCoopAccept, npcCoopAsk, npcCoopChance, npcCoopCool, npcCoopCoolLeft, npcCoopDone, npcCoopGift, npcCoopInfo, npcCoopInvitable, npcCoopLine, npcCoopOk, npcCoopRoll } from "../shared/npc/coop.js";
import { casHouseFix, casWalletFix } from "../shared/casino/wallet.js";
import { fixParty, partyNpcAdd, partyNpcRemove } from "../shared/social/party.js";
import { taipeiDay } from "../shared/core/logic.js";
import { twSecret } from "../stock/stock_tw.js";
import { bad, changeParty, needMember, now, rtdb } from "./party.js";

const db = () => getFirestore();
const walletRef = uid => db().doc(`casinoWallets/${uid}`);
const houseRef = () => db().doc("casinoHouse/main");
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const put = (tx, ref, obj) => tx.set(ref, { data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() });

const needLobby = async (me, pid) => {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || !p.members || !p.members[me.uid]) throw bad("你不在這個隊伍裡");
  if (p.kind !== "cellar" || p.phase !== "lobby") throw bad("現在不能邀旅客");
  return p;
};

// 現在邀得動誰（只讀）
async function who(me, pid) {
  await needLobby(me, pid);
  const t = now(), day = taipeiDay(t), secret = await twSecret();
  const { house } = casHouseFix(parse(await houseRef().get()), day);
  return { ok: true, gift: NUM.casino.coopNpc.gift, max: NUM.casino.coopNpc.maxNpc, list: npcCoopInvitable(house, day, t, secret, NPC_LIST, npcCounters(house.npcc), me.uid) };
}

// 邀一位。gift：true ＝送禮物（答應率 +giftP，答應了才收）
async function invite(me, pid, npcId, gift) {
  const p = await needLobby(me, pid);
  const C = NUM.casino.coopNpc;
  if (!C.on) throw bad("現在不能邀旅客下去");
  if (typeof npcId !== "string" || !npcId) throw new HttpsError("invalid-argument", "要說邀誰");
  if (Object.keys(p.npcs || {}).length >= C.maxNpc) throw bad(`每隊最多帶 ${C.maxNpc} 位旅客`);
  const t = now(), day = taipeiDay(t), secret = await twSecret();
  // 順序（審查 11-21 第 9 點）：①交易 A 擲骰、留他給這一隊（不碰錢）②加進隊伍 ③交易 B 才收禮物。②失敗只要把他放回去，錢還沒動，不用退
  const out = await db().runTransaction(async tx => {
    const [hs, ws] = await Promise.all([tx.get(houseRef()), tx.get(walletRef(me.uid))]);
    const { house } = casHouseFix(parse(hs), day), w = casWalletFix(parse(ws), day);
    const n = NPC_LIST.find(x => x && x.id === npcId);
    if (!n || !npcCoopOk(n, day)) throw bad("他不能陪人下去");
    const list = npcCoopInvitable(house, day, t, secret, NPC_LIST, npcCounters(house.npcc), me.uid);
    if (!list.some(x => x.id === npcId)) throw bad("他現在不在館裡，或今天已經陪不動了");
    const left = npcCoopCoolLeft(house, day, me.uid, npcId, t);
    if (left > 0) throw bad(`他剛剛婉拒了你，${Math.ceil(left / 60000)} 分鐘後再問問看`);
    if (gift && w.chips < C.gift) throw bad("籌碼不夠送禮物");
    const k = npcCoopAsk(house, day, npcId), roll = npcCoopRoll(secret, day, me.uid, npcId, k), chance = npcCoopChance(n, !!gift);
    const info = npcCoopInfo(n);
    if (roll >= chance) { // 被拒絕：記冷卻
      npcCoopCool(house, day, me.uid, npcId, t);
      put(tx, houseRef(), house);
      return { accepted: false, line: npcCoopLine(n, "refuse", `${secret}|${day}|${me.uid}|${npcId}|r${k}`), chance, info };
    }
    npcCoopAccept(house, day, n, pid, me.uid, t);
    put(tx, houseRef(), house);
    return { accepted: true, line: npcCoopLine(n, "accept", `${secret}|${day}|${me.uid}|${npcId}|a${k}`), chance, info };
  });
  if (!out.accepted) return { ok: true, accepted: false, line: out.line, name: out.info.name };
  try {
    await changeParty(pid, q => partyNpcAdd(q, me.uid, out.info, C.maxNpc, 4));
  } catch (e) { // 隊伍加不進去（滿了、已開始）：把他放回去（還沒收錢）
    await npcRelease(npcId, day).catch(err => console.error("找 NPC 下地下：邀請失敗，放回去也失敗", err));
    throw e;
  }
  let chips;
  if (gift) {
    try {
      chips = await db().runTransaction(async tx => { // 答應了才收禮物
        const [hs, ws] = await Promise.all([tx.get(houseRef()), tx.get(walletRef(me.uid))]);
        const { house } = casHouseFix(parse(hs), day), w = casWalletFix(parse(ws), day);
        if (w.chips < C.gift) throw bad("籌碼不夠送禮物");
        npcCoopGift(w, house);
        put(tx, houseRef(), house); put(tx, walletRef(me.uid), w);
        return w.chips;
      });
    } catch (e) { // 兩次交易之間錢被花掉了：他先離開隊伍（沒收錢，不用退）
      await changeParty(pid, q => partyNpcRemove(q, npcId)).catch(() => {});
      await npcRelease(npcId, day).catch(err => console.error("找 NPC 下地下：收禮物失敗，放回去也失敗", err));
      throw e;
    }
  }
  return { ok: true, accepted: true, line: out.line, name: out.info.name, chips, gifted: !!gift };
}
// 把他放回去：不再留給任何隊，今天陪的趟數退壹（邀請沒成）
async function npcRelease(npcId, day) {
  await db().runTransaction(async tx => {
    const { house } = casHouseFix(parse(await tx.get(houseRef())), day);
    npcCoopRefund(house, day, npcId);
    put(tx, houseRef(), house);
  });
}
// 隊伍解散了（沒開始、或趟被清掉）：留給這一隊的旅客都放走，不用等停留時間到
export async function coopNpcRelease(pid) {
  await db().runTransaction(async tx => {
    const day = taipeiDay(now()), { house } = casHouseFix(parse(await tx.get(houseRef())), day);
    const c = house.npcCoop;
    if (!c || !c.at) return;
    const mine = Object.keys(c.at).filter(id => c.at[id] && c.at[id].pid === pid);
    if (!mine.length) return;
    mine.forEach(id => npcCoopRefund(house, day, id, pid)); // 沒出發的才會留在這裡（出發過的趟已由 coopNpcEnd 收尾）：趟數退壹
    put(tx, houseRef(), house);
  });
}

// 把 NPC 請走（準備區）：禮物不退
async function dismiss(me, pid, npcId) {
  await needLobby(me, pid);
  await changeParty(pid, q => partyNpcRemove(q, npcId));
  await db().runTransaction(async tx => {
    const hs = await tx.get(houseRef()), day = taipeiDay(now());
    const { house } = casHouseFix(parse(hs), day);
    npcCoopRefund(house, day, npcId, pid); // 沒出發就請走：趟數退壹，禮物不退
    put(tx, houseRef(), house);
  }).catch(() => {});
  return { ok: true };
}

export const coopNpc = onCall(async req => {
  const me = await needMember(req);
  const { pid, act, npc, gift } = req.data || {};
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了隊伍的號碼");
  if (act === "who") return who(me, pid);
  if (act === "invite") return invite(me, pid, npc, !!gift);
  if (act === "dismiss") return dismiss(me, pid, npc);
  throw new HttpsError("invalid-argument", "不認得的動作");
});

// 趟結束：NPC 剩下的理智寫回 house.npcw.san、記壹次「壹起下去」、從隊裡拿掉（functions/coop/coop.js 的 afterStep 叫）
export async function coopNpcEnd(run) {
  const npcs = (run.members || []).filter(m => m.npc);
  if (!npcs.length) return;
  const day = taipeiDay(now());
  await db().runTransaction(async tx => {
    const hs = await tx.get(houseRef());
    const { house } = casHouseFix(parse(hs), day);
    npcs.forEach(m => npcCoopDone(house, day, m.npc, m.san));
    put(tx, houseRef(), house);
  });
}
