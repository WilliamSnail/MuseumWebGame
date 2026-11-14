import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Hamachi 賭場：館友同桌（第二階段，決定 0040）。規則在 shared/casino_table.js；這個檔只管讀寫。
//  用現有的隊伍（kind "table"，1–4 人，隊伍一直是 lobby：隨時有人進出）。放哪裡：
//    Firestore casinoTables/{pid}        這一桌完整的狀態（data：JSON 字串）：牌組、莊家底牌都在裡面，只有 Functions 碰得到
//    Realtime Database casinoView/{pid}/{uid}  給這個人看的樣子（casTView，r：第幾版，j：JSON 字串），只有他自己讀得到
//    Realtime Database casinoChat/{pid}  桌上說的話（短句、打的字），隊員讀得到，隊伍解散就清
//    casinoWallets/{uid}                 每個人的籌碼（跟單人同一個錢包）
//  每一步：Firestore 交易裡讀桌子、每個座位的錢包、莊家（要下注就讀存檔）→ 先照時間補完（casTAdvance）→ 做這一步 → 一起寫回。
//  交易成功才更新 /casinoView。時間到了誰都可以叫 tick；沒人叫，下次有人一碰就補完。
//  離桌、斷線：離開隊伍之前掛鉤（partyHooks.beforeLeave）幫他離桌：下注前退注；打牌中這一手當停牌、照樣結算。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { casBonusPct } from "./shared/casino.js";
import { CAS_QUICK, casTAct, casTAdvance, casTBet, casTLeave, casTNew, casTNpcDrop, casTNpcInvite, casTNpcWho, casTSeats, casTSit, casTView } from "./shared/casino_table.js";
import { NPC_LIST } from "./shared/npc_list_data.js";
import { npcCounters } from "./shared/npc.js";
import { twSecret } from "./stock_tw.js";
import { casHouseFix, casWalletFix } from "./shared/casino_wallet.js";
import { casWkSync } from "./shared/casino_week.js";
import { NUM } from "./shared/config.js";
import { cleanSay, fixParty, newParty } from "./shared/party.js";
import { isFree, setRng, taipeiDay } from "./shared/logic.js";
import { bad, leaveCurrent, ledParty, needMember, newId, now, partyHooks, rtdb } from "./party.js";
import { cryptoRng, wkDefOf } from "./casino.js";
import { outHouse } from "./discord_out.js";

const db = () => getFirestore();
const tableRef = pid => db().doc(`casinoTables/${pid}`);
const walletRef = uid => db().doc(`casinoWallets/${uid}`);
const houseRef = () => db().doc("casinoHouse/main");
const saveRef = uid => db().doc(`saves/${uid}`);
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const put = (tx, ref, obj, extra) => tx.set(ref, Object.assign({ data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() }, extra || {}));
const viewPath = (pid, uid) => `casinoView/${pid}/${uid}`;

// 一個交易：讀桌子、座位的錢包、莊家（opts.save：還要這個人的存檔）→ 補完過期的 → fn → 寫回。
// fn({ t, ctx, now, P }) 回傳 { ok, ... }。不 ok 也會把「補完過期的」寫回去（時間早就過了）；fn 說 write: false 而且沒有補完什麼就不寫
async function tableTxn(pid, uid, opts, fn) {
  const t0 = now(), day = taipeiDay(t0), secret = await twSecret(); // 祕密種子：NPC 答不答應、說什麼都用它（玩家算不出來）
  setRng(cryptoRng);
  let t = null, hb = null, ha = null, says = []; // 莊家的錢在這個交易前後（Discord：桌上有人把莊家打到破產）；says：這壹步 NPC 說的話
  try {
    const out = await db().runTransaction(async tx => {
      const ts = await tx.get(tableRef(pid));
      if (!ts.exists && !opts.create) throw bad("這桌已經收了");
      t = ts.exists ? parse(ts) : casTNew({ pid, now: t0 });
      const ids = t.order.filter(id => !(t.seats[id] && t.seats[id].npc)); // NPC 沒有錢包
      if (uid && !ids.includes(uid)) ids.push(uid);
      const [hs, ss, ...ws] = await Promise.all([tx.get(houseRef()), opts.save && uid ? tx.get(saveRef(uid)) : null, ...ids.map(id => tx.get(walletRef(id)))]);
      const wallets = {};
      ids.forEach((id, i) => { wallets[id] = casWalletFix(parse(ws[i]), day); });
      const { house } = casHouseFix(parse(hs), day);
      const S = ss && ss.exists ? parse(ss) : null;
      const P = S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null;
      says = [];
      const ctx = { wallets, house, day, secret, npcList: NPC_LIST, counters: npcCounters(house.npcc), says, now: t0 };
      hb = house.bankroll;
      const moved = casTAdvance(t, ctx, t0);
      const r = fn({ t, ctx, now: t0, P, uid }) || { ok: true };
      ha = house.bankroll;
      if (r.write === false && !moved && !says.length && ts.exists) { hb = ha = null; return Object.assign({}, r, { wallets }); }
      t.rev = (t.rev || 0) + 1;
      // 每週收藏（決定 0042）：這一步結算了誰，誰的統計就多了；同一個交易裡看每個人有沒有新的收藏品。同桌和單人用同一份規則
      const wkNew = {};
      for (const id of ids) {
        const s = casWkSync(wallets[id], wkDefOf(wallets[id]), day);
        if (s.newItems.length || s.completed) wkNew[id] = { k: t.rev, items: s.newItems.map(x => ({ id: x.id, name: x.name })), done: s.completed };
      }
      put(tx, tableRef(pid), t);
      put(tx, houseRef(), house);
      for (const id of ids) put(tx, walletRef(id), wallets[id]);
      return Object.assign({}, r, { wrote: true, wallets, wkNew });
    });
    await pushSays(t.pid, says); // NPC 說的話進桌上的聊天（交易成功之後才寫；寫不進去不影響打牌）
    await outHouse({ before: hb, after: ha, t: t0 }); // 同桌沒有「是誰」：只說莊家破產了（沒寫東西的步驟 hb、ha 是 null，不會發）
    return Object.assign({ t }, out, { wallets: out.wallets || null });
  } finally { setRng(null); }
}
// 給每個人看的樣子。兩步差很近時，晚到的舊版不能蓋掉新的
async function publish(t, wallets, wkNew = null, t0 = now()) {
  const r = t.rev || 0;
  await Promise.all(t.order.map(id => {
    if (t.seats[id] && (t.seats[id].gone || t.seats[id].npc)) return null; // NPC 沒有畫面要送
    const chips = wallets && wallets[id] ? wallets[id].chips : undefined; // 他自己的籌碼（別人的不給）
    return rtdb().ref(viewPath(t.pid, id)).transaction(cur => (cur && cur.r > r ? undefined : { r, j: JSON.stringify(Object.assign(casTView(t, id, t0), { chips, wkNew: wkNew && wkNew[id] ? wkNew[id] : undefined })) }));
  }));
}
async function inParty(pid, uid) {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "table" || !p.members[uid]) throw bad("你不在這桌的隊伍裡");
  return p;
}
const viewOf = (r, uid) => Object.assign(casTView(r.t, uid, now()), { chips: r.wallets && r.wallets[uid] ? r.wallets[uid].chips : undefined });
const answer = (r, uid) => Object.assign({ ok: r.ok !== false, view: viewOf(r, uid) }, r.ok === false ? { reason: r.reason, gag: !!r.gag } : {}, r.who ? { who: r.who } : {}, r.invite ? { invite: r.invite } : {}, r.refund ? { refund: r.refund } : {}, r.wkNew && r.wkNew[uid] ? { wkNew: r.wkNew[uid] } : {});

// ---------- 離桌的掛鉤（functions/party.js 的 leaveParty 叫） ----------
partyHooks.beforeLeave.push(async (pid, uid) => {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "table") return;
  await rtdb().ref(viewPath(pid, uid)).remove().catch(() => {});
  try {
    const r = await tableTxn(pid, uid, {}, ({ t, ctx, now: t0 }) => casTLeave(t, uid, ctx, t0));
    await publish(r.t, r.wallets);
  } catch (e) { if (!(e instanceof HttpsError)) console.error("賭場離桌出錯", e); } // 這桌已經收了：照樣離開隊伍
});
async function closeTable(pid) {
  try { await tableTxn(pid, null, {}, ({ t, ctx }) => { casTNpcDrop(t, ctx); return { ok: true }; }); } catch (e) { if (!(e instanceof HttpsError)) console.error("賭場收桌退 NPC 的注出錯", e); } // 還沒結算的 NPC 注退回外面世界、NPC 從「在賭場」名單拿掉
  await rtdb().ref().update({ [`casinoView/${pid}`]: null, [`casinoChat/${pid}`]: null, [`casinoChatAt/${pid}`]: null }).catch(() => {});
  await tableRef(pid).delete().catch(() => {});
}
partyHooks.closed.push(closeTable);
// 錢包記著一張桌子、可是那桌的隊伍已經不在（或他已經不在隊伍裡）：把記錄清掉。隊伍整個不在了，桌子也順手收掉（NPC 的注退回去）
async function dropStale(uid, pid) {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "table") await closeTable(pid);
  await rtdb().ref(viewPath(pid, uid)).remove().catch(() => {});
  await db().runTransaction(async tx => {
    const ws = await tx.get(walletRef(uid));
    const w = parse(ws);
    if (w && w.tablePid === pid) { w.tablePid = null; put(tx, walletRef(uid), w); }
  });
}

// ---------- 說話：快速短句、自由打字（純文字、清過、有間隔） ----------
async function say(me, pid, d) {
  await inParty(pid, me.uid);
  const text = Number.isInteger(d.quick) && CAS_QUICK[d.quick] ? CAS_QUICK[d.quick] : cleanSay(d.text);
  if (!text) throw bad("先寫壹句話");
  const t = now();
  let tooFast = false;
  await rtdb().ref(`casinoChatAt/${pid}/${me.uid}`).transaction(cur => { tooFast = typeof cur === "number" && t - cur < NUM.casino.sayGapMs; return tooFast ? undefined : t; });
  if (tooFast) return { ok: false, reason: "說慢壹點" };
  await rtdb().ref(`casinoChat/${pid}`).push({ by: me.uid, name: me.nick, text, at: t });
  await trimChat(pid);
  return { ok: true };
}
async function trimChat(pid) {
  const all = (await rtdb().ref(`casinoChat/${pid}`).get()).val() || {};
  const old = Object.keys(all).sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, Math.max(0, Object.keys(all).length - NUM.casino.chatKeep));
  if (old.length) await rtdb().ref(`casinoChat/${pid}`).update(Object.fromEntries(old.map(k => [k, null])));
}
// NPC 說的話（casino_table.js 的 ctx.says）：進桌上的聊天，跟館友說的壹樣，多壹個 npc: true（沒有說話間隔的限制，壹局最多 2 句由規則擋）
async function pushSays(pid, says) {
  if (!Array.isArray(says) || !says.length) return;
  try {
    const t = now();
    for (let i = 0; i < says.length; i++) await rtdb().ref(`casinoChat/${pid}`).push({ by: says[i].by, name: says[i].name, npc: true, text: String(says[i].text).slice(0, 60), at: t + i });
    await trimChat(pid);
  } catch (e) { console.warn("NPC 說話寫不進聊天", e && e.message); }
}

// ---------- Function ----------
export const casinoTable = onCall(async req => {
  const me = await needMember(req);
  const d = req.data || {};
  const { act } = d;
  // 開壹桌（壹個人也能開）：已經當隊長的那桌就用那桌
  if (act === "open") {
    let pid;
    const led = await ledParty(me.uid, "table");
    if (led) pid = led.pid;
    else {
      await leaveCurrent(me.uid, me.nick);
      pid = newId();
      await rtdb().ref(`parties/${pid}`).set(newParty({ pid, kind: "table", leader: me.uid, leaderNick: me.nick, now: now() }));
      await rtdb().ref(`partyOf/${me.uid}`).set(pid);
    }
    const r = await tableTxn(pid, me.uid, { create: true }, ({ t }) => casTSit(t, me.uid, me.nick));
    if (!r.ok) throw bad(r.reason);
    await publish(r.t, r.wallets, r.wkNew);
    return { ok: true, pid, view: viewOf(r, me.uid) };
  }
  const pid = d.pid;
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了牌桌的號碼");
  if (act === "say") return say(me, pid, d);
  try { await inParty(pid, me.uid); } catch (e) {
    if (!(e instanceof HttpsError)) throw e;
    await dropStale(me.uid, pid); // 那桌已經收了：不要讓畫面以為還在桌上（畫面看到 gone 就改開新桌）
    return { ok: false, gone: true, reason: "那桌已經收了" };
  }
  let r;
  switch (act) {
    // 入座（被邀請、重新整理、斷線回來都走這裡）
    case "join": r = await tableTxn(pid, me.uid, { create: true }, ({ t, ctx }) => { const s = casTSit(t, me.uid, me.nick); if (s.ok) ctx.wallets[me.uid].tablePid = pid; return s; }); break;
    case "bet": r = await tableTxn(pid, me.uid, { save: true }, ({ t, ctx, now: t0, P }) => casTBet(t, me.uid, d.text, { san: P && !isFree(P) ? P.sanity : 99, bonusPct: casBonusPct(P) }, ctx, t0)); break;
    case "hit": case "stand": r = await tableTxn(pid, me.uid, {}, ({ t, ctx, now: t0 }) => casTAct(t, me.uid, act, Number.isInteger(d.seq) ? d.seq : -1, ctx, t0)); break;
    case "tick": r = await tableTxn(pid, me.uid, {}, () => ({ ok: true, write: false })); break;
    // 邀請在場的 NPC（決定 0080）：npcWho ＝ 現在邀得動誰（只讀）；npcInvite ＝ 邀 d.npc 壹起玩（答應了他就坐進這桌，說的話進聊天；被拒絕他的拒絕台詞在 line，30 分鐘後才能再邀）
    case "npcWho": r = await tableTxn(pid, me.uid, {}, ({ ctx, now: t0 }) => ({ ok: true, write: false, who: casTNpcWho(ctx, t0, me.uid) })); break;
    case "npcInvite": r = await tableTxn(pid, me.uid, {}, ({ t, ctx, now: t0 }) => { const x = casTNpcInvite(t, ctx, me.uid, String(d.npc || ""), t0); return x.ok ? Object.assign({}, x, { invite: { accepted: x.accepted, name: x.name, line: x.line } }) : Object.assign({ write: false }, x); }); break;
    default: throw new HttpsError("invalid-argument", "不認得的動作");
  }
  if (r.wrote) await publish(r.t, r.wallets, r.wkNew);
  return answer(r, me.uid);
});
