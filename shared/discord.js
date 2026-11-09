// ================================================================
//  Discord 聯動第一步的規則（決定 0051，docs/Discord聯動規劃.md）
//  翊文 11-09：「理想是Yuga bot可以在我們discord channel 跟玩家互動，內容也是跟我們數據庫即時同步的」
//
//  純函式：不碰網路、資料庫、畫面、時鐘（時間由呼叫的人傳進來），亂數由呼叫的人傳函式進來。
//  Functions（functions/discord.js、functions/discord_data.js）讀寫資料庫，這裡只管：
//    - 解析 Discord 送來的 interaction（dcParse）、組回覆（dcReply 和各種 dc…Text）
//    - 綁定碼、自己加入的碼：格式、期限、打錯太多次暫時擋、每天加入上限
//    - 公開的字：只有遊戲暱稱；沒有 email、理智、怪癖、靈感（任何回覆都不放）
//    - 指令清單（dcCommands，tools/discord_commands.cjs 拿去註冊）
//    - 網址帶 ?join=碼 的處理（dcJoinParam、dcStripJoin）
//  所有名字都用 dc／DC 開頭（shared 的五個檔接在一起跑，頂層名字不能重複）。
//  Discord 的回覆是玩家看的，文字照第 1 代用「壹」。文字都是草稿，Yuga 可以改。
// ================================================================
import { NUM } from "./config.js";
import { eventEffect, eventRange, eventsOnDate } from "./events.js";
import { funDaysOf, holidaysOn } from "./holidays.js";
import { boardDiscordNick, boardGroups, boardPeriodText, boardValueText, boardViewOf } from "./board.js";
import { titleName } from "./titles.js";

export const DC_SITE = "https://pepe-museum.web.app";
// 指令名字：全部小寫 pepe- 開頭（Discord 規定小寫），打 /pepe 就會列出全部
export const DC_CMD = { link: "pepe-綁定", unlink: "pepe-解除綁定", join: "pepe-加入", chips: "pepe-籌碼", house: "pepe-莊家", board: "pepe-排行榜", today: "pepe-今日活動", online: "pepe-誰在線" };
export const DC_LINK_OPT = "碼";
export const DC_EPHEMERAL = 64; // flags：只有本人看得到

// 要註冊給 Discord 的指令（guild commands）
export function dcCommands() {
  const cmd = (name, description, options) => Object.assign({ name, description, type: 1 }, options ? { options } : {});
  return [
    cmd(DC_CMD.link, "把你的 Discord 接到遊戲帳號（先在遊戲「我的帳號」拿 6 位數的碼）", [{ type: 3, name: DC_LINK_OPT, description: "遊戲裡拿到的 6 位數綁定碼", required: true, min_length: 6, max_length: 12 }]),
    cmd(DC_CMD.unlink, "拆掉 Discord 和遊戲帳號的連結（獎勵不會再送）"),
    cmd(DC_CMD.join, "還不是館友？拿壹個只有你看得到的加入連結"),
    cmd(DC_CMD.chips, "看你自己的籌碼和稱號（只有你看得到）"),
    cmd(DC_CMD.house, "莊家現在有多少錢、有沒有破產"),
    cmd(DC_CMD.board, "最近壹次的每週排行榜"),
    cmd(DC_CMD.today, "今天的限時活動和小節日"),
    cmd(DC_CMD.online, "現在在館裡的館友（隱身的不列）"),
  ];
}
// 指令名字 → 內部的名字（link、unlink…）；不認得回傳 ""
export function dcCommandKey(name) {
  const k = Object.keys(DC_CMD).find(x => DC_CMD[x] === name);
  return k || "";
}

// ---------- 解析 Discord 送來的 interaction ----------
// 回傳 { kind: "ping"|"command"|"component"|"other", guildId, discordId, discordName, name, key, opts, token }
// 壞資料不丟錯：kind 是 "other"。discordId 只收數字（Discord 的 snowflake）
const dcObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const dcSnow = v => (typeof v === "string" && /^\d{5,25}$/.test(v) ? v : "");
export function dcParse(body) {
  const out = { kind: "other", guildId: "", discordId: "", discordName: "", name: "", key: "", opts: {}, token: "" };
  if (!dcObj(body)) return out;
  if (body.type === 1) { out.kind = "ping"; return out; }
  out.guildId = dcSnow(body.guild_id);
  const user = dcObj(body.member) && dcObj(body.member.user) ? body.member.user : dcObj(body.user) ? body.user : {};
  out.discordId = dcSnow(user.id);
  out.discordName = typeof user.global_name === "string" && user.global_name ? user.global_name : typeof user.username === "string" ? user.username : "";
  out.token = typeof body.token === "string" ? body.token : "";
  if (body.type === 2 && dcObj(body.data) && typeof body.data.name === "string") {
    out.kind = "command";
    out.name = body.data.name;
    out.key = dcCommandKey(out.name);
    (Array.isArray(body.data.options) ? body.data.options : []).forEach(o => {
      if (dcObj(o) && typeof o.name === "string" && (typeof o.value === "string" || typeof o.value === "number")) out.opts[o.name] = String(o.value);
    });
  } else if (body.type === 3) out.kind = "component";
  return out;
}

// ---------- 簽名的時間戳 ----------
// X-Signature-Timestamp 是 Unix 秒。差太多（重送舊的請求）就拒絕
export function dcTimestampOk(ts, nowMs) {
  const s = typeof ts === "string" && /^\d{9,12}$/.test(ts) ? +ts : NaN;
  return Number.isFinite(s) && Number.isFinite(nowMs) && Math.abs(nowMs - s * 1000) <= NUM.discord.skewSec * 1000;
}

// ---------- 碼 ----------
// randInt(a, b)：回傳 [a, b) 的整數。Functions 傳 crypto 的 randomInt；不要用 Math.random
export function dcLinkCodeMake(randInt) { return String(randInt(0, 1000000)).padStart(6, "0"); }
export function dcLinkCodeOf(text) {
  const s = String(text == null ? "" : text).replace(/[\s-]/g, "");
  return /^\d{6}$/.test(s) ? s : "";
}
const DC_JOIN_CHARS = "23456789abcdefghjkmnpqrstuvwxyz"; // 沒有 0 o 1 l i
export function dcJoinCodeMake(randInt) {
  let s = "";
  for (let i = 0; i < 16; i++) s += DC_JOIN_CHARS[randInt(0, DC_JOIN_CHARS.length)];
  return s;
}
export function dcJoinCodeOf(text) {
  const s = String(text == null ? "" : text).trim().toLowerCase();
  return /^[2-9a-hj-km-np-z]{16}$/.test(s) ? s : "";
}
export const dcExpireAt = (nowMs, minutes) => nowMs + minutes * 60000;
export const dcExpired = (exp, nowMs) => !(Number.isFinite(exp) && Number.isFinite(nowMs) && nowMs < exp);

// 打錯太多次暫時擋。rec：{ n, since }（沒有＝還沒錯過）
export function dcTriesState(rec, nowMs) {
  const win = NUM.discord.triesWindowMin * 60000;
  const fresh = !dcObj(rec) || !Number.isFinite(rec.since) || nowMs - rec.since >= win;
  const n = fresh ? 0 : Math.max(0, Math.floor(+rec.n || 0));
  const blocked = n >= NUM.discord.triesMax;
  return { blocked, left: Math.max(0, NUM.discord.triesMax - n), waitMin: blocked ? Math.max(1, Math.ceil((rec.since + win - nowMs) / 60000)) : 0 };
}
// 打錯壹次之後的新紀錄
export function dcTriesFail(rec, nowMs) {
  const win = NUM.discord.triesWindowMin * 60000;
  if (!dcObj(rec) || !Number.isFinite(rec.since) || nowMs - rec.since >= win) return { n: 1, since: nowMs };
  return { n: Math.max(0, Math.floor(+rec.n || 0)) + 1, since: rec.since };
}
// 今天靠 Discord 加入的人數滿了沒
export const dcJoinFull = n => Math.max(0, Math.floor(+n || 0)) >= NUM.discord.joinPerDay;

// Google 登入 token 的 email：要驗證過。照 shared/admin.js 的 adminEmail（那個檔很大，這裡不 import）
export function dcVerifiedEmail(token) {
  if (!dcObj(token) || token.email_verified !== true || typeof token.email !== "string") return null;
  const e = token.email.trim().toLowerCase();
  return e.includes("@") && !e.includes("/") ? e : null;
}

// ---------- 網址的 ?join=碼 ----------
export function dcJoinParam(search) {
  const m = /[?&]join=([^&#]*)/.exec(String(search == null ? "" : search));
  if (!m) return "";
  let v = m[1];
  try { v = decodeURIComponent(v); } catch (e) { return ""; }
  return dcJoinCodeOf(v);
}
// 把 join 參數從 ?a=1&join=x&b=2 拿掉（沒剩的話回空字串；有剩的保留 ?）
export function dcStripJoin(search) {
  const s = String(search == null ? "" : search).replace(/^\?/, "");
  const rest = s.split("&").filter(p => p && !/^join=/.test(p));
  return rest.length ? "?" + rest.join("&") : "";
}
export const dcJoinUrl = code => `${DC_SITE}/?join=${code}`;

// ---------- 公開的字 ----------
// 只放遊戲暱稱，過 boardDiscordNick（拿掉看不見的字、@、markdown 符號）。其他東西（email、理智、怪癖、靈感）不會經過這裡，也不該傳進來
export const dcNick = n => boardDiscordNick(n);
export function dcNum(n) {
  const v = Math.trunc(Number.isFinite(+n) ? +n : 0);
  return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
const dcCap = (s, n = 1900) => (s.length > n ? [...s].slice(0, n - 1).join("") + "…" : s);

// ---------- 回覆 ----------
// 一律不 @ 任何人（allowed_mentions）。ephemeral＝只有本人看得到
export function dcReply(content, ephemeral) {
  return { type: 4, data: { content: dcCap(String(content)), flags: ephemeral ? DC_EPHEMERAL : 0, allowed_mentions: { parse: [] } } };
}
export const dcPong = () => ({ type: 1 });

// ---------- 文字（草稿） ----------
export const DC_TEXT = {
  notHere: "Yuga Bot 只在佩佩博物館的伺服器裡工作。",
  unknown: "R？這個指令我不認得。打 /pepe 看看有哪些。",
  noButton: "這個按鈕還沒開放。",
  oops: "R……櫃檯出了壹點狀況，等壹下再試。",
  linkOk: "R。綁定好了：{nick}，你的 Discord 現在接著這個遊戲帳號。",
  linkBonus: "館方送你 {n} 籌碼（綁定獎勵，每個帳號只送壹次）。",
  linkNoBonus: "（綁定獎勵每個帳號只送壹次，這個帳號領過了。）",
  linkBad: "R？這個碼不對，或是過期了。回遊戲「我的帳號」重新拿壹個。還能試 {left} 次。",
  linkLocked: "打錯太多次了，先休息 {m} 分鐘再試。",
  linkAlready: "這個 Discord 已經綁定壹位館友了。要換的話，先打 /pepe-解除綁定。",
  linkTaken: "這個遊戲帳號已經接著另壹個 Discord 了。請先在遊戲「我的帳號」解除。",
  linkNeedMember: "這個碼對應的帳號不是館友，沒辦法綁。",
  unlinkOk: "解除了。想再綁，到遊戲「我的帳號」拿新的碼（獎勵不會再送）。",
  unlinkNone: "你還沒有綁定，沒有東西可以解除。",
  chipsMe: "{nick} 的籌碼：{chips}",
  chipsTitle: "稱號：〈{title}〉",
  chipsNone: "R，我還不認得你。\n・還不是館友：打 /pepe-加入，我給你壹個加入連結。\n・已經是館友：到遊戲選單「我的帳號」按「綁定 Discord」拿碼，再打 /pepe-綁定 碼。",
  chipsGone: "R？你綁定的遊戲帳號不見了。請在遊戲重新綁定。",
  houseNow: "莊家現在有：{n}",
  houseBroke: "（破產中）",
  houseNone: "莊家還沒開張。",
  boardNone: "榜單還沒有出來。每週壹清晨會算上壹週的。",
  boardEmpty: "上壹週沒有人有進度，榜單是空的。",
  boardHead: "本週榜單　{period}",
  boardFoot: "完整的榜單、建議在遊戲選單「本週榜單」。",
  todayHead: "今天（{day}）",
  todayNone: "今天沒有活動，也沒有小節日。",
  todayEvents: "限時活動",
  todayHol: "節日",
  todayFun: "小節日",
  onlineNone: "館裡現在沒有人在線。",
  onlineSome: "現在在館裡的館友（{n} 位）：{names}",
  joinLink: "R，歡迎來博物館。點這個連結用 Google 登入，就成為館友（{m} 分鐘內有效、只能用壹次，不要轉給別人）：\n{url}",
  joinAlready: "你已經是館友了，不用再加入。",
  joinFull: "今天加入的名額滿了，請找翊文。",
  joinBlocked: "這個 Discord 帳號不能再自己加入了，請找翊文。",
  joinUsed: "這個 Discord 帳號已經換過壹個館友帳號了，沒辦法再換。有問題請找翊文。",
  // 網頁的加入連結（Functions 的 join 丟的錯，畫面原樣顯示；要有「邀請」兩個字，net_firebase.js 才會原樣顯示）
  joinNeedVerified: "你的 Google 帳號 email 還沒驗證過，沒辦法用加入連結。請館長邀請你。",
  joinWebDisabled: "這個帳號的邀請被停用了，沒辦法加入。請找翊文。",
  joinWebUsed: "這個 Discord 帳號已經換過壹個館友帳號了，沒辦法再用連結加入。請找翊文，或請館長邀請你。",
  joinWebFull: "今天靠 Discord 加入的名額滿了，請找翊文邀請你。",
  joinWebBad: "加入連結失效了（過期或已經用過）。回 Discord 再打壹次 /pepe-加入，或請館長邀請你。",
};
const dcFill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
export const dcText = (key, v) => dcFill(DC_TEXT[key] || key, v);

// 一則「連結」文字
export const dcLinkOkText = (nick, bonus) => [dcText("linkOk", { nick: dcNick(nick) }), bonus > 0 ? dcText("linkBonus", { n: dcNum(bonus) }) : dcText("linkNoBonus")].join("\n");
// 籌碼：title 是 RTDB titles/{uid}（{ id, name }），沒有就不寫
export function dcChipsText(nick, chips, title) {
  const t = titleName(title);
  return [dcText("chipsMe", { nick: dcNick(nick), chips: dcNum(chips) })].concat(t ? [dcText("chipsTitle", { title: dcNick(t) })] : []).join("\n");
}
export function dcHouseText(bankroll) {
  if (!Number.isFinite(bankroll)) return DC_TEXT.houseNone;
  return dcText("houseNow", { n: dcNum(bankroll) }) + (bankroll < 0 ? DC_TEXT.houseBroke : "");
}
// 榜單：doc 是 boards/latest。只放名次、暱稱、數字（不放建議、提醒：那些在遊戲裡）
export function dcBoardText(doc) {
  const v = boardViewOf(doc);
  if (!v) return DC_TEXT.boardNone;
  if (v.empty) return DC_TEXT.boardEmpty;
  const lines = [dcText("boardHead", { period: boardPeriodText(v) })];
  v.boards.filter(b => b.rows.length).forEach(b => {
    if (b.all) { lines.push("", `${b.emoji} 【${b.title}】`, b.rows.map(r => dcNick(r.nick)).join("、")); return; }
    lines.push("", `${b.emoji} 【${b.title}】`);
    boardGroups(b.rows).forEach(g => lines.push(`${g.rank}. ${g.nicks.map(dcNick).join("、")}　${boardValueText(b.id, g.value)}`));
  });
  lines.push("", DC_TEXT.boardFoot);
  return lines.join("\n");
}
// 今天的活動：weeksEvents 是 eventsFromWeeks 的結果（Functions 從打包的資料拿）；day 是台灣日期
export function dcTodayText(day, events) {
  const evs = eventsOnDate(events, day), hols = holidaysOn(day), funs = funDaysOf(day);
  if (!evs.length && !hols.length && !funs.length) return DC_TEXT.todayNone;
  const lines = [dcText("todayHead", { day: day.slice(5).replace("-", "/") })];
  if (evs.length) lines.push("", `【${DC_TEXT.todayEvents}】`, ...evs.map(ev => `・${eventRange(ev)}　${ev.title}：${eventEffect(ev)}`));
  if (hols.length) lines.push("", `【${DC_TEXT.todayHol}】`, ...hols.map(h => `・${h.dayName || h.name}`));
  if (funs.length) lines.push("", `【${DC_TEXT.todayFun}】`, ...funs.map(f => `・${f.name}${f.line ? `：${f.line}` : ""}`));
  return lines.join("\n");
}
export function dcOnlineText(nicks) {
  const list = (Array.isArray(nicks) ? nicks : []).map(dcNick);
  return list.length ? dcText("onlineSome", { n: list.length, names: list.join("、") }) : DC_TEXT.onlineNone;
}
