import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Discord 聯動第一步：Yuga Bot 的入口 discordBot（決定 0051，docs/Discord聯動規劃.md）
//  Discord 把指令用 HTTPS 送來（Interactions Endpoint URL），我們驗簽名、當場讀資料庫、回覆。
//    - 簽名：X-Signature-Ed25519、X-Signature-Timestamp，用 Discord 的公鑰（discord_config.js）驗，過不了回 401。時間戳差太多也拒絕。
//    - 沒設定（公鑰、伺服器 ID 還是空的）回 503，其他 Function 不受影響。
//    - 只接受設定的伺服器（Guild）來的指令。
//    - 3 秒內要回：這裡的指令都只讀、寫幾份文件就回，不先回「處理中」再補（Function 回完不保證還能跑）。
//      入口很薄：靜態 import 只有 options、discord_data、shared 的規則；沒有另外開 codebase，也沒設 minInstances（原因和量到的時間見日誌）。
//  回覆裡只有遊戲暱稱：沒有 email、理智、怪癖、靈感。不 @ 任何人。
// ================================================================
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { createPublicKey, verify } from "node:crypto";
import { discordConfig } from "./discord_config.js";
import { linkByCode, linkedUid, startJoin, unlinkByDiscord } from "./discord_data.js";
import { casHouseFix, casWalletFix } from "./shared/casino_wallet.js";
import { eventsFromWeeks } from "./shared/events.js";
import { EVENT_WEEKS } from "./shared/events_data.js";
import { DAY_DATA } from "./shared/day_data.js";
import { NUM } from "./shared/config.js";
import { dcBoardText, dcChipsText, dcHouseText, dcJoinUrl, dcLinkOkText, dcNewsText, dcOnlineText, dcParse, dcPong, dcReply, dcText, dcTimestampOk, dcTodayText, DC_LINK_OPT, DC_NEWS_OPT } from "./shared/discord.js";
import { taipeiDay } from "./shared/logic.js";
import { PLAY_HANDLERS, onComponent } from "./discord_play.js";

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex"); // ed25519 公鑰的 DER 開頭，後面接 32 個位元組
const HEX = /^[0-9a-fA-F]+$/;

// Discord 的簽名：簽的是「時間戳 + 原始的 body」
export function discordSigOk(rawBody, sigHex, ts, pubHex) {
  try {
    if (!Buffer.isBuffer(rawBody) || typeof ts !== "string" || typeof sigHex !== "string" || sigHex.length !== 128 || !HEX.test(sigHex) || typeof pubHex !== "string" || pubHex.length !== 64 || !HEX.test(pubHex)) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pubHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.concat([Buffer.from(ts, "utf8"), rawBody]), key, Buffer.from(sigHex, "hex"));
  } catch (e) { return false; }
}

const parseData = s => (s.exists ? JSON.parse(s.data().data) : null);
const J = (res, code, obj) => res.status(code).type("application/json").send(JSON.stringify(obj));

// ---------- 各個指令：回傳要送回去的 interaction response ----------
async function cmdLink(p, now) {
  const r = await linkByCode(p.discordId, p.opts[DC_LINK_OPT], now);
  if (r.ok) return dcReply(dcLinkOkText(r.nick, r.bonus), true);
  const T = {
    locked: () => dcText("linkLocked", { m: r.waitMin }), already: () => dcText("linkAlready"), taken: () => dcText("linkTaken"), member: () => dcText("linkNeedMember"),
    badcode: () => dcText("linkBad", { left: r.left }),
  };
  return dcReply((T[r.reason] || T.badcode)(), true);
}
async function cmdUnlink(p) {
  const r = await unlinkByDiscord(p.discordId);
  return dcReply(dcText(r.ok ? "unlinkOk" : "unlinkNone"), true);
}
async function cmdJoin(p, now) {
  const r = await startJoin(p.discordId, now);
  if (r.ok) return dcReply(dcText("joinLink", { m: NUM.discord.joinCodeMin, url: dcJoinUrl(r.code) }), true);
  const key = { member: "joinAlready", full: "joinFull", blocked: "joinBlocked", used: "joinUsed" }[r.reason];
  return dcReply(dcText(key || "oops"), true);
}
async function cmdChips(p, now) {
  const uid = await linkedUid(p.discordId);
  if (!uid) return dcReply(dcText("chipsNone"), true);
  const fs = getFirestore();
  const [ms, ws, ts] = await Promise.all([fs.doc(`members/${uid}`).get(), fs.doc(`casinoWallets/${uid}`).get(), getDatabase().ref("titles").child(uid).get()]);
  if (!ms.exists) return dcReply(dcText("chipsGone"), true);
  // 稱號只讀不寫（titles 由賭場寫，test/titles.test.cjs 擋其他檔的寫法，所以這裡用 ref("titles").child(uid)）
  const w = casWalletFix(parseData(ws), taipeiDay(now)); // 沒進過賭場＝開場的數字（跟遊戲裡的 peek 一樣，不建錢包）
  return dcReply(dcChipsText(ms.data().nick, w.chips, ts.val()), true);
}
async function cmdHouse(p, now) {
  const hs = await getFirestore().doc("casinoHouse/main").get();
  return dcReply(dcHouseText(casHouseFix(parseData(hs), taipeiDay(now)).house.bankroll), false);
}
async function cmdBoard() {
  const s = await getFirestore().doc("boards/latest").get();
  return dcReply(dcBoardText(s.exists ? s.data() : null), false);
}
async function cmdToday(p, now) {
  const day = taipeiDay(now); // 遊戲的今天（台灣 05:00 換日），跟今日館訊用同一天
  return dcReply(dcTodayText(day, eventsFromWeeks(EVENT_WEEKS), DAY_DATA[day] || null), false);
}
async function cmdNews(p, now) {
  return dcReply(dcNewsText(taipeiDay(now), p.opts[DC_NEWS_OPT]), false);
}
// 在線的人：照遊戲裡的規則——隱身的人狀態本來就寫成離線；這裡再用 members 的 invisible 擋一次，不比遊戲露得多。只列暱稱
async function cmdOnline() {
  const raw = (await getDatabase().ref("status").get()).val() || {};
  const ids = Object.keys(raw).filter(uid => raw[uid] && (raw[uid].state === "online" || raw[uid].state === "away")).slice(0, 200);
  if (!ids.length) return dcReply(dcOnlineText([]), false);
  const fs = getFirestore();
  const docs = await fs.getAll(...ids.map(uid => fs.doc(`members/${uid}`)));
  const nicks = docs.filter(d => d.exists && d.data().invisible !== true).map(d => d.data().nick);
  return dcReply(dcOnlineText(nicks), false);
}
const HANDLERS = { link: cmdLink, unlink: cmdUnlink, join: cmdJoin, chips: cmdChips, house: cmdHouse, board: cmdBoard, today: cmdToday, online: cmdOnline, news: cmdNews, ...PLAY_HANDLERS };

export const discordBot = onRequest({ cors: false }, async (req, res) => {
  const t0 = Date.now();
  if (req.method !== "POST") { res.set("Allow", "POST"); return J(res, 405, { error: "POST only" }); }
  const cfg = await discordConfig();
  if (!cfg.ok) return J(res, 503, { error: "Discord 聯動還沒設定" });
  const ts = String(req.get("X-Signature-Timestamp") || "");
  if (!discordSigOk(req.rawBody, String(req.get("X-Signature-Ed25519") || ""), ts, cfg.publicKey) || !dcTimestampOk(ts, Date.now())) return J(res, 401, { error: "invalid request signature" });
  let body;
  try { body = JSON.parse(req.rawBody.toString("utf8")); } catch (e) { return J(res, 400, { error: "bad json" }); }
  const p = dcParse(body);
  if (p.kind === "ping") return J(res, 200, dcPong());
  if (p.guildId !== cfg.guildId || !p.discordId) return J(res, 200, dcReply(dcText("notHere"), true));
  if (p.kind !== "command" && p.kind !== "component") return J(res, 200, dcReply(dcText("unknown"), true));
  if (p.kind === "command" && !HANDLERS[p.key]) return J(res, 200, dcReply(dcText("unknown"), true));
  try {
    const out = p.kind === "component" ? await onComponent(p, Date.now()) : await HANDLERS[p.key](p, Date.now());
    console.log("discordBot", p.key || "component", `${Date.now() - t0}ms`); // 指令名和時間，沒有人的資料
    return J(res, 200, out);
  } catch (e) {
    console.error("discordBot：出錯", p.key || "component", e && e.message);
    return J(res, 200, dcReply(dcText("oops"), true));
  }
});
