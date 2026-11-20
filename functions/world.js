// ================================================================
//  世界經濟的每天紀錄（W2，決定 0086，規劃 docs/規劃/世界經濟規劃.md）
//  worldTick：併在每小時的 auctionTick 裡（Cloud Scheduler 免費只有 3 個）。換日（台灣 05:00）後第一次跑才寫，同一天再跑什麼都不寫（冪等）。
//    寫：world/main（世界文件）、worldDays/{日期}（那天的紀錄）。**只讀莊家文件、不改它**（成長還在莊家換日裡算，見 shared/world.js 的說明）。
//  世界文件和每天紀錄的格式、搬錢的規則都在 shared/world.js；這裡只有 Firestore 的讀寫。
//  Firestore 路徑：world/main、worldDays/{日期}（規劃寫的 world/days/{日期} 不是合法路徑，改成 worldDays）。內容都是 { data: JSON 字串, updatedAt }，跟其他文件一樣。
// ================================================================
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { taipeiDay } from "./shared/logic.js";
import { wdTick } from "./shared/world.js";

const db = () => getFirestore();
const worldRef = () => db().doc("world/main");
const dayRef = day => db().doc(`worldDays/${day}`);
const houseRef = () => db().doc("casinoHouse/main");
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const put = (tx, ref, obj) => tx.set(ref, { data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() });

export async function worldTick(t = Date.now()) {
  const day = taipeiDay(t);
  return db().runTransaction(async tx => {
    const [ws, hs] = await Promise.all([tx.get(worldRef()), tx.get(houseRef())]);
    if (!hs.exists) return { skip: true, reason: "莊家文件還沒有" };
    const r = wdTick(parse(ws), parse(hs), day);
    if (r.skip) return { skip: true, day };
    put(tx, worldRef(), r.w);
    put(tx, dayRef(day), r.rec);
    return { skip: false, day, rec: r.rec };
  });
}
