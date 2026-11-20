// 用某個人的身分直接叫模擬器裡的 Functions，不用開瀏覽器（翊文 11-09：「有各種需要腳本加速…都可以寫來重複利用」）
// 只連 127.0.0.1 的模擬器，碰不到正式的 Firebase。
//   npm run emu:call -- --set 8 --user 小明 casino '{"act":"peek"}'
//   第一次會自動建帳號、叫 join。
const http = require("http");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const SET = Number(arg("set", 8)), USER = arg("user", "小明");
const add = 1000 * SET, AUTH = 9099 + add, FN = 5101 + add;

function post(port, path, body, token) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const q = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: Object.assign({ "content-type": "application/json", "content-length": Buffer.byteLength(data) }, token ? { authorization: `Bearer ${token}` } : {}) }, r => {
      let s = ""; r.setEncoding("utf8"); r.on("data", d => { s += d; });
      r.on("end", () => { try { res(JSON.parse(s)); } catch (e) { rej(new Error(`回的不是 JSON（${r.statusCode}）：${s.slice(0, 200)}`)); } });
    });
    q.on("error", rej);
    q.end(data);
  });
}
const emailOf = user => `dev-${Buffer.from(user).toString("hex")}@dev.local`;
async function login(user) {
  const email = emailOf(user), key = "/identitytoolkit.googleapis.com/v1/accounts";
  let r = await post(AUTH, `${key}:signInWithPassword?key=demo-key`, { email, password: "emulator-only", returnSecureToken: true });
  if (!r.idToken) r = await post(AUTH, `${key}:signUp?key=demo-key`, { email, password: "emulator-only", displayName: user, returnSecureToken: true });
  if (!r.idToken) throw new Error(`登入不了：${JSON.stringify(r).slice(0, 200)}`);
  return r.idToken;
}
const callFn = (name, data, token) => post(FN, `/demo-pepe4/asia-east1/${name}`, { data }, token);

async function main() {
  const rest = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").startsWith("--"));
  const [name, json] = rest;
  if (!name) throw new Error("用法：npm run emu:call -- --set 8 --user 小明 casino '{\"act\":\"peek\"}'");
  const token = await login(USER);
  await callFn("join", { nick: USER }, token);
  console.log(JSON.stringify(await callFn(name, json ? JSON.parse(json) : {}, token)));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { emailOf };
