// WebSocket 訊息的格式和限制。說明寫在 server/protocol.md，兩邊要一起改。
// 畫面那邊（web/src/net.js）不 import 這個檔，用到的數字自己抄一份；改這裡記得也改 net.js。

export const PROTOCOL_VERSION = 1;

// 限制：每則訊息多大、送多快
export const LIMITS = {
  maxBytes: 4096,       // 一則訊息最多幾個位元組（超過就斷線，關閉碼 1009）
  burst: 20,            // 一口氣最多送幾則
  perSec: 2,            // 之後每秒補幾則
  strikes: 10,          // 送錯（格式錯、太快）累積幾次就斷線（4008）
  connsPerAccount: 5,   // 同一個帳號最多開幾條（分頁）
  connsTotal: 200,      // 整台伺服器最多幾條
};

// 關閉碼。4000 以上是我們自己定的（WebSocket 規定 4000–4999 給應用程式用）。
// 「重連」那欄給 net.js 看：false 的就不要自己重連。
export const CLOSE = {
  normal:       { code: 1000, retry: false, why: "正常關閉" },
  restart:      { code: 1001, retry: true,  why: "伺服器重開" },
  tooBig:       { code: 1009, retry: true,  why: "訊息太大" },
  badMessage:   { code: 4000, retry: false, why: "協定版本不對或格式錯" },
  needLogin:    { code: 4001, retry: false, why: "沒登入或登入過期" },
  helloTimeout: { code: 4002, retry: true,  why: "連上之後太久沒送 hello" },
  notAllowed:   { code: 4003, retry: false, why: "不在邀請名單上或帳號停用" },
  tooMany:      { code: 4008, retry: true,  why: "送太多、送錯太多次" },
  tooManyConns: { code: 4009, retry: false, why: "同一個帳號開太多條" },
  noBeat:       { code: 4010, retry: true,  why: "太久沒心跳" },
};

// 房間代號：小寫英文開頭，後面可以有英文、數字、_、-、:（例如 gallery、cellar:b2）
export const ROOM_RE = /^[a-z][a-z0-9_:-]{0,31}$/;

// 欄位的型別。名字後面加 ? 是可以不帶。
export const FIELD = {
  token: v => typeof v === "string" && v.length >= 20 && v.length <= 100,
  int: v => Number.isInteger(v),
  bool: v => typeof v === "boolean",
  room: v => typeof v === "string" && ROOM_RE.test(v),
};

// 畫面 → 伺服器 的訊息，每一種有哪些欄位。新的訊息（邀請、招募、合作關卡）照這個加。
// 每一則都可以另外帶 id（字串最多 32 字，或 0 以上的整數），伺服器回錯誤時會用 re 帶回來。
export const CLIENT_MESSAGES = {
  hello: { token: "token", v: "int" },
  beat: { active: "bool?" },
  where: { room: "room" },
};

function idOk(v) { return (typeof v === "string" && v.length <= 32) || (Number.isInteger(v) && v >= 0); }

// 檢查一則訊息。對的回傳 null，錯的回傳說明。
export function checkMessage(msg, table = CLIENT_MESSAGES) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return "訊息要是 JSON 物件";
  if (typeof msg.t !== "string") return "少了 t（訊息種類）";
  const spec = table[msg.t];
  if (!spec) return `不認得的訊息種類「${msg.t}」`;
  if (msg.id !== undefined && !idOk(msg.id)) return "id 要是 32 字以內的字串或整數";
  for (const [k, typ] of Object.entries(spec)) {
    const optional = typ.endsWith("?");
    const check = FIELD[optional ? typ.slice(0, -1) : typ];
    if (msg[k] === undefined) { if (optional) continue; return `少了 ${k}`; }
    if (!check(msg[k])) return `${k} 的格式不對`;
  }
  return null;
}
