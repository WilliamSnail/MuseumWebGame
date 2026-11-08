// B（網域＋Cloudflare Tunnel＋Access）用的登入。還沒做，現在一律回錯誤（501）。
//
// 之後要做的（規劃.md 第五節 B3、B4）：
//   1. 玩家連到網頁前，Cloudflare Access 已經讓他登入了（Google 或 email 驗證碼）。
//      Access 會在每個請求加 header「Cf-Access-Jwt-Assertion」（JWT，RS256）。
//   2. 畫面 POST /api/login（body 可以是空的），這裡驗證那個 header：
//      - 公鑰：https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs（照 kid 挑，快取起來）
//      - aud 包含 ACCESS_AUD（Access 應用程式的 AUD 標籤）；iss ＝ https://<ACCESS_TEAM_DOMAIN>
//      - exp 還沒過；email 不是空的
//   3. 回傳 { email, name }（Access 的 token 通常沒有名字，name 給空字串，暱稱讓玩家自己取）。
//   - 只信 header，不信 cookie（CF_Authorization cookie 是給 Access 自己用的）。
//   - ACCESS_TEAM_DOMAIN、ACCESS_AUD 放環境變數，不寫死。
//   - 之後可以考慮每個請求都驗一次 header，Access 名單拿掉人就馬上生效。
import { AuthError } from "./error.js";

export function createAccessAuth(cfg) {
  return {
    mode: "access",
    async verify() {
      throw new AuthError(501, "not_ready", "Cloudflare Access 登入還沒做（規劃.md 第五節 B3、B4）");
    },
  };
}
