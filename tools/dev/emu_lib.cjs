// 模擬器的共用小零件（11-21 測試 session 合併）：連接埠、登入、叫 Functions。
// emu_call、qa_user、qa_giver 都從這裡拿；以前 emu_call 自己用「email＋密碼」註冊，瀏覽器卻是用假的 Google 憑證登入，
// 同壹個名字會變成兩個帳號（emu_call 報 EMAIL_EXISTS、登不進去）。現在兩邊都用假 Google 憑證，同名字就是同壹個 uid。
// 只連 127.0.0.1 的模擬器，碰不到正式的 Firebase。
const http = require("http");

const ports = set => ({ auth: 9099 + 1000 * set, fn: 5101 + 1000 * set, fs: 8180 + 1000 * set, rtdb: 9100 + 1000 * set });
// 網頁 net_firebase.js 的 hexOf（名字轉 16 進位，最多 40 字元）要壹樣
const idOf = name => "dev-" + Buffer.from(name).toString("hex").slice(0, 40);
const emailOf = name => `${idOf(name)}@dev.local`;

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
// 登入（跟網頁壹樣：假的 Google 憑證）。回 { token, uid }
async function login(set, name) {
  const id = idOf(name), fake = JSON.stringify({ sub: id, email: emailOf(name), email_verified: true, name });
  const r = await post(ports(set).auth, "/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key",
    { postBody: `id_token=${encodeURIComponent(fake)}&providerId=google.com`, requestUri: "http://localhost", returnIdpCredential: true, returnSecureToken: true });
  if (!r.idToken) throw new Error(`登入不了：${JSON.stringify(r).slice(0, 200)}`);
  return { token: r.idToken, uid: r.localId };
}
const callFn = (set, name, data, token) => post(ports(set).fn, `/demo-pepe4/asia-east1/${name}`, { data }, token);
// 登入、join（沒有帳號會自動建）、叫壹個 Function。回整個回應
async function asUser(set, name) {
  const { token, uid } = await login(set, name);
  await callFn(set, "join", { nick: name }, token);
  return { token, uid, call: (fn, data) => callFn(set, fn, data || {}, token) };
}
module.exports = { ports, idOf, emailOf, post, login, callFn, asUser };
