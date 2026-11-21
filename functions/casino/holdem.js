import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  德州撲克 2 人桌（決定 0150）的伺服器：規則在 shared/casino/holdem.js，這個檔只管讀寫。跟 21 點同桌（casino_table.js）同樣的做法：
//  用現有的隊伍（kind "holdem"，邀請、接受、離開都走 functions/coop/party.js）。放哪裡：
//    Firestore casinoHoldem/{pid}          這一桌完整的狀態（牌組、雙方底牌都在裡面，只有 Functions 碰得到）
//    Firestore casinoHoldemLog/{自動編號}   每手的紀錄（誰、輸贏多少、抽水）給管理介面看串通；只有 Functions 讀寫
//    Realtime Database holdemView/{pid}/{uid}  給這個人看的樣子（casHView，r：第幾版，j：JSON 字串），只有他自己讀得到
//    casinoWallets/{uid}                   錢包（買入、離座在同壹個交易裡搬）
//  每一步：交易裡讀桌子、兩個座位的錢包、莊家 → 先照時間補完（casHAdvance）→ 做這一步 → 一起寫回。交易成功才更新 holdemView。
//  離開隊伍之前（partyHooks.beforeLeave）幫他離座：打牌中當蓋牌，桌上的籌碼回錢包；隊伍解散（partyHooks.closed）把還在桌上的籌碼都退回去再收桌。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { casHAct, casHAdvance, casHBuyin, casHLeave, casHNew, casHStart, casHView } from "../shared/casino/holdem.js";
import { casHouseFix, casWalletFix } from "../shared/casino/wallet.js";
import { NUM } from "../shared/core/config.js";
import { fixParty, newParty } from "../shared/social/party.js";
import { setRng, taipeiDay } from "../shared/core/logic.js";
import { bad, leaveCurrent, ledParty, needMember, newId, now, partyHooks, rtdb } from "../coop/party.js";
import { cryptoRng } from "./casino.js";

const db = () => getFirestore();
const tableRef = pid => db().doc(`casinoHoldem/${pid}`);
const walletRef = uid => db().doc(`casinoWallets/${uid}`);
const houseRef = () => db().doc("casinoHouse/main");
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const put = (tx, ref, obj) => tx.set(ref, { data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() });
const viewPath = (pid, uid) => `holdemView/${pid}/${uid}`;

// 一個交易：讀桌子、座位的錢包（加上 uid 自己的）、莊家 → 補完過期的 → fn → 寫回。fn({ t, ctx, now }) 回傳 { ok, ... }。
// 不 ok 也會把「補完過期的」寫回去（時間早就過了）；fn 說 write: false 而且沒有補完什麼就不寫
async function tableTxn(pid, uid, opts, fn) {
  const t0 = now(), day = taipeiDay(t0);
  setRng(cryptoRng);
  try {
    const out = await db().runTransaction(async tx => {
      const ts = await tx.get(tableRef(pid));
      if (!ts.exists && !opts.create) throw bad("這桌已經收了");
      const t = ts.exists ? parse(ts) : casHNew({ pid, lv: opts.lv, now: t0 });
      const ids = t.order.slice();
      if (uid && !ids.includes(uid)) ids.push(uid);
      const [hs, ...ws] = await Promise.all([tx.get(houseRef()), ...ids.map(id => tx.get(walletRef(id)))]);
      const wallets = {};
      ids.forEach((id, i) => { wallets[id] = casWalletFix(parse(ws[i]), day); });
      const { house } = casHouseFix(parse(hs), day);
      const ctx = { wallets, house, day, hlog: [] };
      const moved = casHAdvance(t, ctx, t0);
      const r = fn({ t, ctx, now: t0 }) || { ok: true };
      if (r.write === false && !moved && !ctx.hlog.length && ts.exists) return Object.assign({}, r, { t, ctx });
      t.rev = (t.rev || 0) + 1; t.at = t0;
      put(tx, tableRef(pid), t); put(tx, houseRef(), house);
      for (const id of ids) put(tx, walletRef(id), wallets[id]);
      for (const h of ctx.hlog) tx.set(db().collection("casinoHoldemLog").doc(), Object.assign({ day, updatedAt: FieldValue.serverTimestamp() }, h));
      return Object.assign({}, r, { t, ctx, wrote: true });
    });
    return out;
  } finally { setRng(null); }
}
const viewFor = (t, uid, ctx) => Object.assign(casHView(t, uid, now(), ctx), { chips: ctx.wallets[uid] ? ctx.wallets[uid].chips : undefined });
// 給每個人看的樣子。兩步差很近時，晚到的舊版不能蓋掉新的
async function publish(t, ctx) {
  const r = t.rev || 0;
  await Promise.all(t.order.map(id => rtdb().ref(viewPath(t.pid, id)).transaction(cur => (cur && cur.r > r ? undefined : { r, j: JSON.stringify(viewFor(t, id, ctx)) }))));
}
async function inParty(pid, uid) {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "holdem" || !p.members[uid]) throw bad("你不在這桌的隊伍裡");
  return p;
}
const answer = (r, uid) => Object.assign({ ok: r.ok !== false, view: viewFor(r.t, uid, r.ctx) }, r.ok === false ? { reason: r.reason } : {});

// ---------- 離座的掛鉤（functions/coop/party.js 的 leaveParty 叫） ----------
partyHooks.beforeLeave.push(async (pid, uid) => {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "holdem") return;
  await rtdb().ref(viewPath(pid, uid)).remove().catch(() => {});
  try {
    const r = await tableTxn(pid, uid, {}, ({ t, ctx, now: t0 }) => casHLeave(t, uid, ctx, t0));
    await publish(r.t, r.ctx);
  } catch (e) { if (!(e instanceof HttpsError)) console.error("德州離座出錯", e); } // 這桌已經收了：照樣離開隊伍
});
// 隊伍解散：還在桌上的籌碼都退回錢包再收桌（不能讓籌碼跟著桌子消失）
async function closeTable(pid) {
  try {
    const t0 = now(), day = taipeiDay(t0);
    await db().runTransaction(async tx => {
      const ts = await tx.get(tableRef(pid));
      if (!ts.exists) return;
      const t = parse(ts), ids = t.order.slice();
      const [hs, ...ws] = await Promise.all([tx.get(houseRef()), ...ids.map(id => tx.get(walletRef(id)))]);
      const wallets = {}; ids.forEach((id, i) => { wallets[id] = casWalletFix(parse(ws[i]), day); });
      const { house } = casHouseFix(parse(hs), day), ctx = { wallets, house, day, hlog: [] };
      setRng(cryptoRng);
      try { for (const id of ids) casHLeave(t, id, ctx, t0); } finally { setRng(null); }
      for (const id of ids) put(tx, walletRef(id), wallets[id]);
      put(tx, houseRef(), house);
      for (const h of ctx.hlog) tx.set(db().collection("casinoHoldemLog").doc(), Object.assign({ day, updatedAt: FieldValue.serverTimestamp() }, h));
      tx.delete(tableRef(pid));
    });
  } catch (e) { console.error("德州收桌退籌碼出錯", pid, e); throw e; } // 退不回去就不要刪桌（下次再試）
  await rtdb().ref(`holdemView/${pid}`).remove().catch(() => {});
}
partyHooks.closed.push(async pid => { if ((await tableRef(pid).get()).exists) await closeTable(pid); });

// ---------- Function ----------
export const casinoHoldem = onCall(async req => {
  const me = await needMember(req);
  const d = req.data || {};
  const { act } = d;
  if (!NUM.casino.holdem.on) throw bad("德州撲克現在不開。");
  // 開壹桌：d.lv ＝盲注級距（0～2）、d.buy ＝買入。已經當隊長的那桌就用那桌
  if (act === "open") {
    let pid;
    const led = await ledParty(me.uid, "holdem");
    if (led) pid = led.pid;
    else {
      await leaveCurrent(me.uid, me.nick);
      pid = newId();
      await rtdb().ref(`parties/${pid}`).set(newParty({ pid, kind: "holdem", leader: me.uid, leaderNick: me.nick, now: now() }));
      await rtdb().ref(`partyOf/${me.uid}`).set(pid);
    }
    const r = await tableTxn(pid, me.uid, { create: true, lv: d.lv }, ({ t, ctx, now: t0 }) => {
      const s = casHBuyin(t, me.uid, me.nick, d.buy, ctx.wallets[me.uid], ctx);
      if (s.ok && t.phase === "wait") casHStart(t, ctx, t0);
      return s;
    });
    if (!r.ok) { if (!led) await rtdb().ref(`parties/${pid}`).remove().catch(() => {}); await rtdb().ref(`partyOf/${me.uid}`).remove().catch(() => {}); throw bad(r.reason); }
    await publish(r.t, r.ctx);
    return Object.assign({ pid }, answer(r, me.uid));
  }
  const pid = d.pid;
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了牌桌的號碼");
  try { await inParty(pid, me.uid); } catch (e) {
    if (!(e instanceof HttpsError)) throw e;
    await rtdb().ref(viewPath(pid, me.uid)).remove().catch(() => {});
    if (!fixParty((await rtdb().ref(`parties/${pid}`).get()).val())) await closeTable(pid).catch(() => {}); // 隊伍整個不在了：退籌碼、收桌
    return { ok: false, gone: true, reason: "那桌已經收了" };
  }
  let r;
  switch (act) {
    // 入座、補籌碼（被邀請接受之後、重新整理、斷線回來、輸光了再買都走這裡）。d.buy ＝買入；已經坐著而 d.buy 沒給＝只是重新拿畫面
    case "buyin": r = await tableTxn(pid, me.uid, { create: true }, ({ t, ctx, now: t0 }) => {
      if (d.buy == null && t.seats[me.uid]) return { ok: true, write: false };
      const s = casHBuyin(t, me.uid, me.nick, d.buy, ctx.wallets[me.uid], ctx);
      if (s.ok && t.phase === "wait") casHStart(t, ctx, t0);
      return s;
    }); break;
    case "act": r = await tableTxn(pid, me.uid, {}, ({ t, ctx, now: t0 }) => casHAct(t, me.uid, String(d.a || ""), d.to, ctx, t0)); break;
    case "tick": r = await tableTxn(pid, me.uid, {}, () => ({ ok: true, write: false })); break;
    default: throw new HttpsError("invalid-argument", "不認得的動作");
  }
  if (r.wrote) await publish(r.t, r.ctx);
  return answer(r, me.uid);
});
