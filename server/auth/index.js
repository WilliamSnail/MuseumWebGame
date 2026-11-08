// 登入轉接層：照設定的 AUTH 挑一種。
// 每一種都長這樣：
//   { mode: "dev" | "firebase" | "access",
//     async verify(req, body) → { email, name } }   // 失敗就丟 AuthError
// 只回傳 email 和名字，後面的程式（邀請名單、帳號、session）每一種都一樣。
// 所以從 A（Firebase）換到 B（Access），帳號、存檔都不用搬（規劃.md 第五節「程式怎麼同時支援兩種」）。
import { createDevAuth } from "./dev.js";
import { createFirebaseAuth } from "./firebase.js";
import { createAccessAuth } from "./access.js";

export function createAuth(cfg) {
  if (cfg.auth === "dev") return createDevAuth(cfg);
  if (cfg.auth === "firebase") return createFirebaseAuth(cfg);
  if (cfg.auth === "access") return createAccessAuth(cfg);
  throw new Error(`不認得的登入方式 AUTH=${cfg.auth}`);
}
