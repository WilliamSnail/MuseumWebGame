// 用某個人的身分直接叫模擬器裡的 Functions，不用開瀏覽器（翊文 11-09：「有各種需要腳本加速…都可以寫來重複利用」）
// 只連 127.0.0.1 的模擬器，碰不到正式的 Firebase。登入方式跟網頁壹樣（emu_lib.cjs），所以 ?user=小明 的瀏覽器和這裡的「小明」是同壹個人。
//   npm run emu:call -- --set 8 --user 小明 casino '{"act":"peek"}'
//   第一次會自動建帳號、叫 join。
const { asUser, emailOf } = require("./emu_lib.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };

async function main() {
  const rest = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").startsWith("--"));
  const [name, json] = rest;
  if (!name) throw new Error("用法：npm run emu:call -- --set 8 --user 小明 casino '{\"act\":\"peek\"}'");
  const u = await asUser(Number(arg("set", 8)), arg("user", "小明"));
  console.log(JSON.stringify(await u.call(name, json ? JSON.parse(json) : {})));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { emailOf };
