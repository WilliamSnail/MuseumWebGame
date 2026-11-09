// 看、改模擬器 Firestore 裡的資料，測「莊家破產」「隱身」「次數歸零」這種難走到的情況（翊文 11-09：「需要腳本的也寫好」）。
// **只連 127.0.0.1**，碰不到正式的 Firebase。賭場的文件把內容放在 data 這個 JSON 字串裡，直接改欄位不會生效，要用 data 指令。
//
//   npm run emu:doc -- --set 8 list members                         列出文件的 id 和欄位
//   npm run emu:doc -- --set 8 get casinoHouse/main                 看一份（data 會解開）
//   npm run emu:doc -- --set 8 data casinoHouse/main bankroll=-500000   改 data 裡的欄位
//   npm run emu:doc -- --set 8 data casinoWallets/@小明 ec.n=0        @暱稱 會換成那個人的 uid
//   npm run emu:doc -- --set 8 field members/@小明 invisible=true     改一般欄位
const firestorePort = set => 8180 + 1000 * set; // 跟 tools/emulators.cjs 一樣
const PROJECT = "demo-pepe4";

const toValue = s => { try { return JSON.parse(s); } catch (e) { return s; } };
// a.b=1 → 改巢狀欄位（中間沒有就建）
function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let o = obj;
  keys.slice(0, -1).forEach(k => { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
  return obj;
}
function pairs(list) {
  if (!list.length) throw new Error("要寫 欄位=值");
  return list.map(p => { const at = p.indexOf("="); if (at < 1) throw new Error(`要寫成 欄位=值：${p}`); return [p.slice(0, at), toValue(p.slice(at + 1))]; });
}
// JS 值 ⇄ Firestore 的 REST 格式
function toFs(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: typeof v === "string" ? v : JSON.stringify(v) };
}
function fromFs(f) {
  if ("stringValue" in f) return f.stringValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("timestampValue" in f) return f.timestampValue;
  if ("nullValue" in f) return null;
  return f;
}
const plain = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFs(v)]));

async function main() {
  const argv = process.argv.slice(2), at = argv.indexOf("--set");
  const set = at >= 0 ? Number(argv.splice(at, 2)[1]) : 8;
  const [cmd, target, ...rest] = argv;
  if (!["list", "get", "data", "field"].includes(cmd) || !target) throw new Error("用法看檔案開頭：list、get、data、field");
  const base = `http://127.0.0.1:${firestorePort(set)}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };
  const req = async (url, o) => { const r = await fetch(url, Object.assign({ headers: H }, o)); const j = await r.json(); if (!r.ok) throw new Error(`${r.status}：${JSON.stringify(j).slice(0, 200)}`); return j; };
  // @暱稱 → uid
  const resolve = async p => {
    const m = /(^|\/)@([^/]+)/.exec(p);
    if (!m) return p;
    const list = (await req(`${base}/members`)).documents || [], d = list.find(x => plain(x).nick === m[2]);
    if (!d) throw new Error(`沒有暱稱「${m[2]}」的館友`);
    return p.replace(`@${m[2]}`, d.name.split("/").pop());
  };
  const path = await resolve(target);
  if (cmd === "list") {
    for (const d of (await req(`${base}/${path}`)).documents || []) console.log(d.name.split("/").pop(), Object.keys(d.fields || {}).join(","));
    return;
  }
  if (cmd === "get") {
    const p = plain(await req(`${base}/${path}`));
    if (typeof p.data === "string") { try { p.data = JSON.parse(p.data); } catch (e) { /* 不是 JSON 就照原樣 */ } }
    console.log(JSON.stringify(p, null, 2));
    return;
  }
  if (cmd === "data") {
    const data = JSON.parse(plain(await req(`${base}/${path}`)).data);
    pairs(rest).forEach(([k, v]) => setPath(data, k, v));
    await req(`${base}/${path}?updateMask.fieldPaths=data`, { method: "PATCH", body: JSON.stringify({ fields: { data: toFs(JSON.stringify(data)) } }) });
  } else {
    const list = pairs(rest), mask = list.map(([k]) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    await req(`${base}/${path}?${mask}`, { method: "PATCH", body: JSON.stringify({ fields: Object.fromEntries(list.map(([k, v]) => [k, toFs(v)])) }) });
  }
  console.log(`改好 ${path}：${rest.join(" ")}`);
}

if (require.main === module) main().catch(e => { console.error(`✗ ${e.message}${/fetch failed/.test(e.message) ? "（模擬器開著嗎？npm run local）" : ""}`); process.exit(1); });
module.exports = { firestorePort, setPath, pairs, toFs, fromFs };
