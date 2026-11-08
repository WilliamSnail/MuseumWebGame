// 登入失敗時丟的錯誤。status 是 HTTP 狀態碼，code 給程式看，msg 給人看。
export class AuthError extends Error {
  constructor(status, code, msg) {
    super(msg);
    this.status = status;
    this.code = code;
  }
}
