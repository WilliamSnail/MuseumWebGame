// 連線的錯誤（11-20 從舊的 web/src/net.js 搬出來；舊的 Node 伺服器 server/ 已經刪掉，畫面只用 net_firebase.js）
export class NetError extends Error {
  constructor(status, code, msg, extra = {}) {
    super(msg);
    this.status = status; // HTTP 狀態碼；連不上是 0
    this.code = code;     // 伺服器的錯誤代號，例如 need_login、conflict、not_invited
    this.extra = extra;   // 伺服器回的整包
  }
}
