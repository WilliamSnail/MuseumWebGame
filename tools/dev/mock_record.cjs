// 錄「假伺服器」的假資料（翊文 11-22：「賭場要登入才打得開，有沒有辦法不用登入」；web/src/core/mock_net.js 用）。
// 對本機模擬器的 Functions 真的叫一次 web/src/core/mock/calls.json 列的每個呼叫，加上德州桌、21 點同桌各開一桌，
// 把回應存進 web/src/core/mock/fixtures.json。這樣假資料的形狀就是伺服器真的回的，不是手寫的。
//   npm run mock:record -- --set 6               重錄（會改 fixtures.json）
//   npm run mock:record -- --set 6 --check       不寫檔，只比對「現在的伺服器回的形狀」跟 fixtures.json 一不一樣（伺服器改了欄位就會報）
// 只連 127.0.0.1 的模擬器，碰不到正式的 Firebase。用 DEV 帳號「假館友」，結束後 uid、暱稱換成固定的假名字，檔案裡沒有真人資料。
const fs = require("fs"), path = require("path");
const { asUser } = require("./emu_lib.cjs");
const ROOT = path.join(__dirname, "..", "..");
const CALLS = path.join(ROOT, "web", "src", "core", "mock", "calls.json"), OUT = path.join(ROOT, "web", "src", "core", "mock", "fixtures.json");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const NICK = "假館友", FAKE_UID = "mock-me", FAKE_NICK = "測試館友";

const keyOf = (fn, d) => [fn, d && d.act, d && d.op].filter(Boolean).join(":");
// 形狀比對：只比「兩邊都有值」的地方（null、空陣列是這一刻的狀態，不算形狀）。回差異清單：
//   伺服器多了欄位、假資料有的欄位伺服器沒了、同一個欄位型別不一樣。陣列只看第一個。裝了很多不同名字的字典（id 當 key，超過 40 個）不比 key。
function shapeDiff(a, b, p = "", out = []) {
  if (a === null || b === null || a === undefined || b === undefined) return out;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (Array.isArray(a) !== Array.isArray(b)) out.push(`${p}：型別不一樣（陣列／非陣列）`);
    else if (a.length && b.length) shapeDiff(a[0], b[0], p + "[]", out);
    return out;
  }
  if (typeof a !== typeof b) { out.push(`${p}：型別不一樣（假資料 ${typeof a}、伺服器 ${typeof b}）`); return out; }
  if (typeof a === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length > 40 || kb.length > 40) return out;
    for (const k of ka) { if (!(k in b)) out.push(`${p}.${k}：伺服器沒有了`); else shapeDiff(a[k], b[k], `${p}.${k}`, out); }
    for (const k of kb) if (!(k in a)) out.push(`${p}.${k}：伺服器新增的`);
  }
  return out;
}
// 錄到的東西裡有真的 uid、暱稱：換成固定的假名字
const scrub = (obj, uid) => JSON.parse(JSON.stringify(obj).split(uid).join(FAKE_UID).split(`"${NICK}"`).join(`"${FAKE_NICK}"`));

async function main() {
  const set = Number(arg("set", 6)), check = process.argv.includes("--check");
  const spec = JSON.parse(fs.readFileSync(CALLS, "utf8"));
  const me = await asUser(set, NICK);
  const responses = {};
  const rec = async (fn, d, key) => {
    let r;
    try { const x = await me.call(fn, d); r = x.result !== undefined ? x.result : x; } catch (e) { r = { ok: false, reason: String(e.message || e) }; }
    if (r && r.error) r = { ok: false, reason: r.error.message || "伺服器回錯誤" };
    responses[key || keyOf(fn, d)] = r;
    return r;
  };
  // 先把存檔放好（賭場、銀行有些畫面要存檔在）
  for (const c of spec.calls) await rec(c.fn, c.data);
  // 21 點同桌、德州桌：各開一桌（回的 view 是桌子的畫面資料）
  await rec("casinoTable", { act: "open" });
  await rec("casinoHoldem", { act: "open", lv: 0, buy: 40000 });
  // 開桌留下的隊伍，錄完離開
  const pids = [responses["casinoTable:open"], responses["casinoHoldem:open"]].map(r => r && r.pid).filter(Boolean);
  for (const pid of pids) { try { await me.call("partyAction", { pid, act: "leave" }); } catch (e) { /* 離不開就算了，模擬器是丟掉的 */ } }
  const out = { _說明: "tools/dev/mock_record.cjs 錄的伺服器回應（不要手改；重錄：npm run mock:record -- --set 6）。", responses: scrub(responses, me.uid) };
  if (check) {
    const old = JSON.parse(fs.readFileSync(OUT, "utf8")).responses, bad = [];
    for (const k of Object.keys(out.responses)) {
      if (!(k in old)) { bad.push(`${k}：fixtures.json 沒有這個（要重錄）`); continue; }
      const d = shapeDiff(old[k], out.responses[k]);
      if (d.length) bad.push(`${k}：${d.slice(0, 6).join("；")}${d.length > 6 ? `（還有 ${d.length - 6} 處）` : ""}`);
    }
    if (bad.length) { console.log("✗ 假資料的形狀跟伺服器對不上：\n  " + bad.join("\n  ") + "\n重錄：npm run mock:record -- --set " + set); process.exit(1); }
    console.log(`✓ 假資料的形狀跟模擬器伺服器一致（${Object.keys(out.responses).length} 個呼叫）`); return;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`錄好了：${Object.keys(out.responses).length} 個呼叫 → web/src/core/mock/fixtures.json`);
  for (const [k, r] of Object.entries(out.responses)) console.log(`  ${r && r.ok === false ? "✗" : "✓"} ${k}${r && r.ok === false ? "：" + r.reason : ""}`);
}
if (require.main === module) main().catch(e => { console.error("✗", e.message); process.exit(1); });
module.exports = { keyOf, shapeDiff, scrub };
