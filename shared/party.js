// ================================================================
//  邀請、隊伍（多人版 M3，翊文 11-08：「好了，可以做多人遊戲模式了」；先做「一起融合」）
//  純函式：只改傳進來的物件、回傳結果。Functions（functions/index.js）存在 Realtime Database，畫面照同一份畫。
//  一起融合（kind "fusion"）2 個人；之後的合作地下（kind "cellar"）2–4 個人用同一套（決定 0020）。
//  Realtime Database 會把空陣列、null 弄掉：讀回來先 fixParty()。
// ================================================================

export const PARTY = {
  inviteMs: 60000,                     // 邀請卡 60 秒（規劃第三節「直接邀請」）
  maxMembers: { fusion: 2, cellar: 4 },
  minMembers: { fusion: 2, cellar: 1 }, // 地下一個人也能下去（館方助手補位）
  picks: { fusion: 1, cellar: 2 },      // 每人帶幾隻（一起融合 1 隻；地下 1–2 隻，決定 0020）
  sayMax: 50,                           // 自由打字一句幾個字（決定 0020）
  offlineWaitMs: 10000,                 // 隊友斷線多久，畫面才請伺服器把他移出隊伍（11-09）
  offlineMinMs: 5000,                   // 伺服器自己確認：至少斷線這麼久才移（重新整理一下不會被踢）
};
export const PARTY_KINDS = ["fusion", "cellar"];

// 看不見的字：控制字元、零寬空白、方向控制、BOM（用字碼判斷，原始碼裡不寫那種跳脫）
function hidden(ch) {
  const n = ch.codePointAt(0);
  return n < 0x20 || n === 0x7f || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff;
}
// 一句話：拿掉看不見的字、連續空白變一個、去頭尾，最多 PARTY.sayMax 個字
export function cleanSay(s) {
  const t = [...String(s || "")].filter(ch => !hidden(ch)).join("").replace(/\s+/g, " ").trim();
  return [...t].slice(0, PARTY.sayMax).join("");
}

// ---------- 邀請 ----------
export function newInvite({ iid, kind, from, fromNick, to, toNick, now, pid }) {
  return { iid, kind, from, fromNick, to, toNick, at: now, expires: now + PARTY.inviteMs, pid: pid || null, state: "open" };
}
// 這個人現在能不能回這個邀請。可以就回 null，不行回傳原因（畫面直接顯示）
export function inviteProblem(inv, uid, now) {
  if (!inv) return "找不到這個邀請";
  if (inv.to !== uid) return "這不是給你的邀請";
  if (inv.state !== "open") return "這個邀請已經結束了";
  if (now > inv.expires) return "邀請過期了";
  return null;
}
// 這個邀請已經用不到了（回覆過、過期了）：伺服器送新邀請時順手刪掉
export function inviteOver(inv, now) {
  return !inv || inv.state !== "open" || now > inv.expires;
}

// ---------- 隊伍 ----------
export function newParty({ pid, kind, leader, leaderNick, now }) {
  const p = { pid, kind, leader, phase: "lobby", at: now, members: { [leader]: { nick: leaderNick, ready: false, pick: [], joinedAt: now } } };
  if (kind === "cellar") p.floor = 1; // 合作地下：下到第幾層（隊長選，11-09）
  return p;
}
// Realtime Database 讀回來的：補回空陣列、false
export function fixParty(p) {
  if (!p || typeof p !== "object") return null;
  p.members = p.members && typeof p.members === "object" ? p.members : {};
  for (const m of Object.values(p.members)) {
    m.pick = Array.isArray(m.pick) ? m.pick.filter(k => typeof k === "string") : m.pick && typeof m.pick === "object" ? Object.values(m.pick).filter(k => typeof k === "string") : [];
    m.ready = !!m.ready;
    m.guard = !!m.guard; // 合作地下：留在監視器前（好玩的機制 5）
  }
  p.phase = p.phase || "lobby";
  // 融合的結果：沒有突變時 mutations 是空陣列，存進去就不見了
  if (p.result && typeof p.result === "object") {
    const mu = p.result.mutations;
    p.result.mutations = Array.isArray(mu) ? mu : mu && typeof mu === "object" ? Object.values(mu) : [];
  }
  return p;
}
// 隊員照進來的順序
export function partyMembers(p) {
  return Object.entries((p && p.members) || {}).map(([id, m]) => Object.assign({ id }, m)).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}
export function partyJoin(p, uid, nick, now) {
  if (p.phase !== "lobby") return { ok: false, reason: "已經開始了" };
  // 已經在隊伍裡（例如重新整理過、框不見了，又被邀請一次）：當作重新進來，大家重新按準備
  if (p.members[uid]) { Object.values(p.members).forEach(m => { m.ready = false; }); delete p.fail; return { ok: true }; }
  if (Object.keys(p.members).length >= PARTY.maxMembers[p.kind]) return { ok: false, reason: "隊伍滿了" };
  p.members[uid] = { nick, ready: false, pick: [], joinedAt: now };
  delete p.fail; // 人變了：上次「開始不了」的原因不算了
  return { ok: true };
}
// 離開。隊長走了，換最早進來的那位當隊長；沒人了就解散（closed）
export function partyLeave(p, uid) {
  if (!p.members[uid]) return { ok: false, reason: "你不在這個隊伍裡" };
  delete p.members[uid];
  const left = partyMembers(p);
  if (!left.length) { p.phase = "closed"; return { ok: true, closed: true }; }
  if (p.leader === uid) p.leader = left[0].id;
  left.forEach(m => { p.members[m.id].ready = false; }); // 人變了，大家重新按準備
  delete p.fail;
  return { ok: true, closed: false };
}
// 選帶哪幾隻（換了就要重新按準備）
export function partyPick(p, uid, keys) {
  const m = p.members[uid];
  if (!m) return { ok: false, reason: "你不在這個隊伍裡" };
  if (p.phase !== "lobby") return { ok: false, reason: "已經開始了" };
  const list = (Array.isArray(keys) ? keys : []).filter(k => typeof k === "string" && k.length > 0 && k.length <= 120);
  if (new Set(list).size !== list.length) return { ok: false, reason: "同壹隻不能帶兩次" };
  if (list.length > PARTY.picks[p.kind]) return { ok: false, reason: `每人最多帶 ${PARTY.picks[p.kind]} 隻` };
  m.pick = list;
  m.ready = false;
  delete p.fail; // 換了佩佩：上次「開始不了」的原因不算了（p.fail 是伺服器寫的，兩個人都看得到）
  return { ok: true };
}
export function partyReady(p, uid, ready) {
  const m = p.members[uid];
  if (!m) return { ok: false, reason: "你不在這個隊伍裡" };
  if (p.phase !== "lobby") return { ok: false, reason: "已經開始了" };
  if (ready && !m.pick.length && !m.guard) return { ok: false, reason: "先選壹隻佩佩" };
  m.ready = !!ready;
  delete p.fail;
  return { ok: true };
}
// ---------- 合作地下（kind "cellar"，11-09）：選層數、留守、看完之後再走一趟 ----------
// 隊長選層數。層數看每個人自己的進度：這裡不擋，開始時伺服器照存檔再檢查（shared/coop.js 的 canStartCoop）
export function partyFloor(p, uid, floor) {
  if (p.kind !== "cellar" || p.phase !== "lobby") return { ok: false, reason: "現在不能選層數" };
  if (p.leader !== uid) return { ok: false, reason: "要隊長選層數" };
  if (!Number.isInteger(floor) || floor < 1 || floor > 9) return { ok: false, reason: "沒有這壹層" };
  p.floor = floor;
  Object.values(p.members).forEach(m => { m.ready = false; }); // 換層數了，大家重新按準備
  delete p.fail;
  return { ok: true };
}
// 留守：壹隊最多壹個人，而且要有人下去；留守的人不帶佩佩
export function partyGuard(p, uid, on) {
  const m = p.members[uid];
  if (!m) return { ok: false, reason: "你不在這個隊伍裡" };
  if (p.kind !== "cellar" || p.phase !== "lobby") return { ok: false, reason: "現在不能換" };
  if (on) {
    if (Object.keys(p.members).length < 2) return { ok: false, reason: "要有人下去：壹個人不能留守" };
    const other = Object.entries(p.members).find(([id, x]) => id !== uid && x.guard);
    if (other) return { ok: false, reason: `${other[1].nick} 已經留守了` };
  }
  m.guard = !!on;
  if (on) m.pick = [];
  m.ready = false;
  delete p.fail;
  return { ok: true };
}
// 這一趟結束了，隊長想再走一趟：回到準備的樣子
export function partyBack(p, uid) {
  if (p.phase !== "done") return { ok: false, reason: "這壹趟還沒結束" };
  if (p.leader !== uid) return { ok: false, reason: "要隊長決定" };
  p.phase = "lobby";
  Object.values(p.members).forEach(m => { m.ready = false; m.pick = m.pick.slice(); });
  delete p.fail;
  return { ok: true };
}
// 隊長能不能按開始
export function canStartParty(p, uid) {
  if (!p || p.phase !== "lobby") return { ok: false, reason: "現在不能開始" };
  if (p.leader !== uid) return { ok: false, reason: "要隊長按開始" };
  const ms = partyMembers(p);
  if (ms.length < PARTY.minMembers[p.kind]) return { ok: false, reason: p.kind === "fusion" ? "壹起融合要兩個人" : "人不夠" };
  const notReady = ms.find(m => !m.ready || (!m.pick.length && !m.guard));
  if (notReady) return { ok: false, reason: `等 ${notReady.nick} 準備好`, waitFor: notReady.id }; // waitFor：等的是誰（是自己的話，畫面寫「等你準備好」）
  return { ok: true, members: ms };
}
// 隊友斷線了，能不能把他移出隊伍（伺服器在 partyAction 的 prune 用）。可以就回 null，不行回傳原因
// st：Realtime Database 的 /status/{uid}；invisible：他是不是隱身（隱身的人看起來就是離線，看不出來，不移）
export function pruneProblem(st, invisible, now) {
  if (invisible) return "隱身的館友看不出在不在線";
  if (!st) return null;
  if (st.state !== "offline") return "還在線上";
  if (typeof st.at === "number" && now - st.at < PARTY.offlineMinMs) return "剛剛才斷線，再等壹下";
  return null;
}
