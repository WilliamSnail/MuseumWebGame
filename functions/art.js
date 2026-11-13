import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  藝術市場第一步（11-14，shared/casino_art.js；規劃 docs/經濟體系規劃.md 2.10 節）：跟館方買賣每日特展的畫。
//  art  act "quote"（只讀：今天特展上能買的畫、現價、我收藏的畫）、"buy"（d.id）、"sell"（d.id）
//  買賣在 casino.js 的 playCore 裡做：錢包、莊家、存檔（P.art）在同一個 Firestore 交易，錢只搬不生（casHouseMove "art"）。
//  畫的登記（id、日期、畫框…）是 tools/copy_shared.cjs 打包進來的 shared/art_data.js，價格和稀有度都在伺服器算，不信瀏覽器。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { casArtBuy, casArtSell, casArtTier, casArtView } from "./shared/casino_art.js";
import { casHouseFix, casWalletFix } from "./shared/casino_wallet.js";
import { ART_WORKS } from "./shared/art_data.js";
import { NUM } from "./shared/config.js";
import { taipeiDay } from "./shared/logic.js";
import { needMember, now } from "./party.js";
import { no, playCore, shape } from "./casino.js";

const db = () => getFirestore();
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const DAY_MS = 86400000;
const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;

// 館方現在賣的畫：登記裡「日期在 shelfDays 天內」的
export function shelfWorks(day, lib = ART_WORKS) {
  const out = [];
  for (const id of Object.keys(lib)) {
    const x = lib[id];
    if (!x || typeof x.date !== "string") continue;
    const age = dayNum(day) - dayNum(x.date);
    if (age >= 0 && age < NUM.art.shelfDays) out.push({ id, date: x.date, tier: casArtTier(x), title: x.title || "" });
  }
  return out;
}
export const workOf = (id, lib = ART_WORKS) => {
  const x = typeof id === "string" && Object.prototype.hasOwnProperty.call(lib, id) ? lib[id] : null;
  return x && typeof x.date === "string" ? { id, date: x.date, tier: casArtTier(x), title: x.title || "" } : null;
};

// 買賣在交易裡做的事
export const actArt = (ctx, d, lib = ART_WORKS) => {
  const op = String((d && d.op) || "");
  let r;
  if (op === "buy") { const wk = workOf(d.id, lib); r = wk ? casArtBuy(ctx.w, ctx.house, ctx.P, wk, ctx.day) : { ok: false, reason: "館方沒有登記這幅畫" }; }
  else if (op === "sell") r = casArtSell(ctx.w, ctx.house, ctx.P, String(d.id || ""), ctx.day);
  else r = { ok: false, reason: "沒有這個動作" };
  if (!r.ok) return no(r);
  ctx.saveDirty = true; // P.art 在存檔裡，同一個交易寫
  return shape(ctx, { lines: r.lines, art: casArtView(ctx.w, ctx.house, ctx.P, shelfWorks(ctx.day, lib), ctx.day) });
};

export const art = onCall(async req => {
  const me = await needMember(req);
  const d = req.data || {}, act = String(d.act || "");
  if (act === "quote") { // 只讀：不建錢包、不寫東西
    const day = taipeiDay(now());
    const [ws, hs, ss] = await Promise.all([db().doc(`casinoWallets/${me.uid}`).get(), db().doc("casinoHouse/main").get(), db().doc(`saves/${me.uid}`).get()]);
    const S = parse(ss), P = S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null;
    const w = casWalletFix(parse(ws), day), house = casHouseFix(parse(hs), day).house;
    return { ok: true, chips: w.chips, art: P ? casArtView(w, house, P, shelfWorks(day), day) : null };
  }
  if (act === "trade") return playCore(me, "", { save: true }, ctx => actArt(ctx, d));
  throw new HttpsError("invalid-argument", "不認得的動作");
});
