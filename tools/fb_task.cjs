// Firebase 的固定動作（決定 0038，翊文 11-09：「好，加固定動作」）。
// 由 .github/workflows/firebase-task.yml 跑；金鑰只在 GitHub Secrets，AI 拿不到。AI 只有翊文要求時才能按。
// 只做得到這幾件事，其他一律不做：
//   invite     把一個 Gmail 加進邀請名單（可以帶名字）；之前被停用的會恢復
//   admin-on   設成管理員      admin-off  取消管理員
//   disable    停用邀請（還沒加入的進不來、管理員失效；已經加入的還進得去，踢人要另外做）
//   enable     恢復邀請
//   stats      看大家合起來的數字（只有數字，沒有 email、名字）
//   stock-reroll  清掉莊家「今天調過股價了」的記號，下壹個進賭場的人會重新照當天的行情算壹次。
//                 只動 casinoHouse/main 的 stk.day，不碰股價、不碰任何人的錢包。
//                 什麼時候用：調價那天算錯了（例如 11-14 七支全變 9,996），修好之後要當天就重算，不想等隔天換日。
//   house-ledger  只讀：莊家、預算池、海底、館方帳現在多少；莊家每個來源累計進出多少；
//                 每個錢包的籌碼、借款、憑空和消失的來源。不印名字、uid、email，錢包用 #1、#2 代替（照籌碼排）。
//                 什麼時候用：莊家的錢對不上要查錢流去哪（11-14 莊家 −8.3 億）。
//   stock-status  只讀：台股、美股盤中的伺服器紀錄（有沒有抓到開盤價、錯誤訊息、落後幾分鐘、哪幾支沒新行情）。不讀亂數祕密。
//   econ-status   只讀：casinoHouse/main 和最新壹份日報 casinoReport/日期 裡「經濟用到的欄位」（白名單：錢、債、外面世界的池子、NPC 花費、館方投資、每個來源的累計），
//                 印成兩行 JSON（ECON_HOUSE_JSON、ECON_REPORT_JSON），直接存成檔餵 node tools/econ_check.cjs --ledger。不印名字、uid、email、亂數祕密、錢包。
// 紀錄裡不印 email、名字：--mask 那一步先遮起來，輸入值從事件檔讀，不經過環境變數。
const fs = require("fs"), path = require("path");

const ACTIONS = ["invite", "admin-on", "admin-off", "disable", "enable", "stats", "stock-reroll", "house-ledger", "stock-status", "econ-status"];

// 只讀：台股、美股盤中的伺服器紀錄（stocksTw/latest、stocksUs/latest）。不讀亂數祕密，什麼都不寫
//   什麼時候用：股票沒更新、整天休市，要知道是抓不到行情還是別的原因（11-13 美股第壹晚整天休市）
async function stockStatus(db) {
  const short = v => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + "…" : s; };
  for (const [name, p] of [["台股", "stocksTw/latest"], ["美股", "stocksUs/latest"]]) {
    const s = await db.doc(p).get();
    if (!s.exists) { console.log(name + "：還沒有紀錄"); continue; }
    const d = s.data() || {};
    const at = d.updatedAt ? new Date(d.updatedAt).toISOString() : "-";
    console.log(name + "：日期 " + (d.day || "-") + "　開盤第幾分鐘 " + (d.openIdx == null ? "沒開" : d.openIdx) + "　休市 " + !!d.closed + "　第幾段 " + (d.k == null ? "-" : d.k) + "　最後更新 " + at);
    console.log("  錯誤：" + (d.err || "（沒有）"));
    console.log("  落後分鐘：" + (short(d.lag) || "-"));
    console.log("  沒新行情的：" + (short(d.stale) || "-"));
    const log = Array.isArray(d.log) ? d.log.slice(-15) : [];
    console.log("  最近的紀錄：" + (log.length ? "" : "（沒有）"));
    log.forEach(l => console.log("    " + (typeof l === "string" ? l : short(l))));
    console.log("  有哪些天：" + Object.keys(d.days || {}).sort().join("、"));
  }
}

// 只讀：經濟用到的欄位（白名單，不是整份文件）。格式給 tools/econ_check.cjs --ledger 吃
function econPick(h) {
  const o = {}, nz = v => (Number.isFinite(+v) ? Math.floor(+v) : 0), obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  for (const k of ["bankroll", "budget", "museum", "sea", "world", "loansOut", "cultureLate"]) if (h[k] != null) o[k] = nz(h[k]);
  if (typeof h.day === "string") o.day = h.day;
  const d = obj(h.debt); o.debt = { budget: nz(d.budget), culture: nz(d.culture), world: nz(d.world) };
  if (h.cul) o.cul = { paid: nz(obj(h.cul).paid), late: nz(obj(h.cul).late), day: obj(h.cul).day || null };
  if (h.npcs) o.npcs = { day: obj(h.npcs).day || null, ticket: nz(obj(h.npcs).ticket), shop: nz(obj(h.npcs).shop), total: nz(obj(h.npcs).total), people: nz(obj(h.npcs).people) };
  const sum = obj(obj(h.inv).sum); if (Object.keys(sum).length) o.inv = { sum: { hold: (Array.isArray(sum.hold) ? sum.hold : []).map(x => ({ name: String(obj(x).name || "").slice(0, 20), n: nz(obj(x).n) })), pnl: Number.isFinite(+sum.pnl) ? Math.floor(+sum.pnl) : 0 } };
  const w = obj(obj(h.led).world); o.led = { world: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, nz(v)])) };
  return o;
}
async function econStatus(db) {
  const hs = await db.doc("casinoHouse/main").get();
  const h = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  console.log("ECON_HOUSE_JSON " + JSON.stringify(econPick(h)));
  const q = await db.collection("casinoReport").orderBy("day", "desc").limit(1).get();
  if (q.empty) { console.log("ECON_REPORT_JSON null"); return; }
  const r = JSON.parse(q.docs[0].data().data || "{}"), sh = (r.snap && r.snap.house) || {};
  const pick = econPick(Object.assign({}, sh, { led: { world: sh.wflow || {} }, cultureLate: sh.culLate, inv: sh.inv }));
  console.log("ECON_REPORT_JSON " + JSON.stringify({ day: r.day || null, gap: Number.isFinite(+r.gap) ? Math.floor(+r.gap) : null, opening: Number.isFinite(+r.opening) ? Math.floor(+r.opening) : null, house: pick }));
}

// 只讀：看錢流去哪。什麼都不寫
async function houseLedger(db) {
  const nz = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
  const fmt = n => nz(n).toLocaleString("en-US");
  const list = o => Object.entries(o || {}).filter(([, v]) => nz(v)).sort((a, b) => Math.abs(nz(b[1])) - Math.abs(nz(a[1]))).map(([k, v]) => `    ${k}：${fmt(v)}`);
  const hs = await db.doc("casinoHouse/main").get();
  const h = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  console.log(`莊家 ${fmt(h.bankroll)}　預算池 ${fmt(h.budget)}　海底 ${fmt(h.sea)}　館方帳 ${fmt(h.museum)}　莊家記的日子 ${h.day || "-"}`);
  const led = h.led || {};
  console.log("莊家每個來源累計（正＝進莊家，負＝出莊家）：");
  (list(led.flow).length ? list(led.flow) : ["    （沒有）"]).forEach(l => console.log(l));
  console.log("莊家憑空多的（重開）：");
  (list(led.mint).length ? list(led.mint) : ["    （沒有）"]).forEach(l => console.log(l));
  const ws = await db.collection("casinoWallets").get();
  const rows = ws.docs.map(d => { try { return JSON.parse(d.data().data || "{}"); } catch (e) { return {}; } })
    .map(w => ({ chips: nz(w.chips), loan: (w.loan && Array.isArray(w.loan.list) ? w.loan.list : []).reduce((s, x) => s + nz(x && x.owe), 0),
      limit: nz(w.loan && w.loan.limit), mint: (w.led && w.led.mint) || {}, burn: (w.led && w.led.burn) || {} }))
    .sort((a, b) => b.chips - a.chips);
  console.log(`錢包 ${rows.length} 個，籌碼合計 ${fmt(rows.reduce((s, r) => s + r.chips, 0))}`);
  rows.forEach((r, i) => {
    console.log(`  #${i + 1}　籌碼 ${fmt(r.chips)}　沒還的借款 ${fmt(r.loan)}　借款額度 ${fmt(r.limit)}`);
    const m = list(r.mint), b = list(r.burn);
    if (m.length) { console.log("    憑空多的："); m.forEach(l => console.log("  " + l)); }
    if (b.length) { console.log("    消失的："); b.forEach(l => console.log("  " + l)); }
  });
}
const NEEDS_EMAIL = ["invite", "admin-on", "admin-off", "disable", "enable"];
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/.]+$/;

// 清掉「今天調過股價了」的記號。只改 casinoHouse/main 的 stk.day，股價、持股、錢包都不動
async function stockReroll(db) {
  const ref = db.doc("casinoHouse/main");
  const snap = await ref.get();
  if (!snap.exists) { console.log("莊家的文件還不存在，不用清"); return; }
  const h = JSON.parse(snap.data().data || "{}");
  if (!h.stk || !h.stk.day) { console.log("本來就沒有「今天調過了」的記號，不用清"); return; }
  const was = h.stk.day;
  delete h.stk.day;
  await ref.set({ data: JSON.stringify(h) }, { merge: true });
  console.log(`清掉了：本來記著 ${was} 調過價。下壹個進賭場的人會重算壹次。`);
}
// 整理輸入。不合規矩丟錯誤（錯誤訊息不含 email）
function parseTask(inputs) {
  const o = inputs || {};
  const action = String(o.action || "").trim();
  if (!ACTIONS.includes(action)) throw new Error("沒有這個動作");
  if (!NEEDS_EMAIL.includes(action)) return { action };
  const email = String(o.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw new Error("email 的格式不對");
  const name = Array.from(String(o.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 20).join("");
  return { action, email, name };
}

// 這個動作要怎麼改那一筆。exists、data ＝ invites/{email} 現在的樣子。回傳 { write: 要 merge 的欄位或 null, remove: 要刪的欄位, message }
function planTask(task, exists, data) {
  const d = data || {};
  switch (task.action) {
    case "invite":
      return { write: Object.assign({ disabled: false }, task.name ? { name: task.name } : exists ? {} : { name: "" }), remove: [], message: exists ? "這個人本來就在邀請名單上，資料更新了。" : "邀請名單多了壹位。" };
    case "admin-on":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上，先邀請才能設管理員。沒有改任何東西。", fail: true };
      return { write: { admin: true }, remove: [], message: d.admin === true ? "這個人本來就是管理員。" : "設成管理員了。" };
    case "admin-off":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { admin: false }, remove: [], message: "取消管理員了。" };
    case "disable":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { disabled: true }, remove: [], message: "停用了：還沒加入的進不來、管理員失效。已經加入的還進得去。" };
    case "enable":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { disabled: false }, remove: [], message: "恢復了。" };
    default:
      throw new Error("沒有這個動作");
  }
}

const readEvent = () => {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) throw new Error("這支要在 GitHub Actions 裡跑");
  return (JSON.parse(fs.readFileSync(p, "utf8")).inputs) || {};
};

// 看大家合起來的數字
async function stats(db) {
  const count = async q => (await q.count().get()).data().count;
  const inv = db.collection("invites");
  const dayAgo = new Date(Date.now() - 86400000), weekAgo = new Date(Date.now() - 7 * 86400000);
  const rows = [
    ["邀請名單", await count(inv)],
    ["其中管理員", await count(inv.where("admin", "==", true))],
    ["其中停用", await count(inv.where("disabled", "==", true))],
    ["館友（登入過）", await count(db.collection("members"))],
    ["有存檔的", await count(db.collection("saves"))],
    ["最近 24 小時有存檔", await count(db.collection("saves").where("updatedAt", ">=", dayAgo))],
    ["最近 7 天有存檔", await count(db.collection("saves").where("updatedAt", ">=", weekAgo))],
  ];
  rows.forEach(([k, v]) => console.log(`${k}：${v}`));
}

async function main() {
  const inputs = readEvent();
  if (process.argv.includes("--mask")) { // 這一步在最前面：之後的紀錄都會把它們遮掉
    for (const v of [inputs.email, inputs.name]) { const s = String(v || "").trim(); if (s) { console.log(`::add-mask::${s}`); console.log(`::add-mask::${s.toLowerCase()}`); } }
    return;
  }
  const task = parseTask(inputs);
  const root = path.join(__dirname, "..", "functions", "node_modules");
  const { initializeApp, applicationDefault } = require(path.join(root, "firebase-admin", "lib", "app", "index.js"));
  const { getFirestore, FieldValue } = require(path.join(root, "firebase-admin", "lib", "firestore", "index.js"));
  const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  if (sa.project_id !== "pepe-museum") throw new Error("金鑰不是 pepe-museum 的");
  initializeApp({ credential: applicationDefault(), projectId: sa.project_id });
  const db = getFirestore();
  if (task.action === "stats") { await stats(db); return; }
  if (task.action === "stock-reroll") { await stockReroll(db); return; }
  if (task.action === "house-ledger") { await houseLedger(db); return; }
  if (task.action === "stock-status") { await stockStatus(db); return; }
  if (task.action === "econ-status") { await econStatus(db); return; }
  const ref = db.doc(`invites/${task.email}`);
  const snap = await ref.get();
  const plan = planTask(task, snap.exists, snap.data());
  if (plan.write) await ref.set(Object.assign({}, plan.write, { taskAt: FieldValue.serverTimestamp() }), { merge: true });
  console.log(plan.message);
  if (plan.fail) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error("沒做成：" + String(e.message || e).split("\n")[0].slice(0, 300)); process.exit(1); });
module.exports = { ACTIONS, parseTask, planTask, econPick };
