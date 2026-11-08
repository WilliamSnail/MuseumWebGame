// A（ASUS DDNS）用的登入：Firebase Authentication 的 Google 登入。還沒做，現在一律回錯誤（501）。
//
// 之後要做的（規劃.md 第五節 A6、A7）：
//   1. 瀏覽器用 Firebase 的 Google 登入拿到 ID token，POST /api/login，body 帶 { idToken }。
//   2. 這裡驗證 ID token（JWT，RS256）：
//      - 公鑰：https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com
//        （照回應的 Cache-Control 快取；用 node:crypto 驗，不一定要裝 firebase-admin）
//      - aud ＝ FIREBASE_PROJECT_ID；iss ＝ https://securetoken.google.com/<FIREBASE_PROJECT_ID>
//      - exp 還沒過、iat 不在未來、sub 不是空的、email_verified 是 true
//   3. 回傳 { email, name }（name 用 token 的 name，沒有就空字串）。
//   - FIREBASE_PROJECT_ID 放環境變數，不寫死。Firebase 的「公開設定」給畫面用，不是秘密，但也放設定檔。
//   - 要有自動測試：用自己產生的金鑰簽假 token 測（不連 Google）。
import { AuthError } from "./error.js";

export function createFirebaseAuth(cfg) {
  return {
    mode: "firebase",
    async verify() {
      throw new AuthError(501, "not_ready", "Firebase 登入還沒做（規劃.md 第五節 A6、A7）");
    },
  };
}
