// Firebase 的固定動作（決定 0038，翊文 11-09：「好，加固定動作」）。
// 由 .github/workflows/firebase-task.yml 跑；金鑰只在 GitHub Secrets，AI 拿不到。AI 只有翊文要求時才能按。
// 只做得到這幾件事，其他一律不做：
//   invite     把一個 Gmail 加進邀請名單（可以帶名字）；之前被停用的會恢復
//   admin-on   設成管理員      admin-off  取消管理員
//   disable    停用邀請（還沒加入的進不來、管理員失效；已經加入的還進得去，踢人要另外做）
//   enable     恢復邀請
//   stats      看大家合起來的數字（只有數字，沒有 email、名字）
// 紀錄裡不印 email、名字：--mask 那一步先遮起來，輸入值從事件檔讀，不經過環境變數。
const fs = require("fs"), path = require("path");

const ACTIONS = ["invite", "admin-on", "admin-off", "disable", "enable", "stats"];
const NEEDS_EMAIL = ["invite", "admin-on", "admin-off", "disable", "enable"];
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/.]+$/;

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
  const ref = db.doc(`invites/${task.email}`);
  const snap = await ref.get();
  const plan = planTask(task, snap.exists, snap.data());
  if (plan.write) await ref.set(Object.assign({}, plan.write, { taskAt: FieldValue.serverTimestamp() }), { merge: true });
  console.log(plan.message);
  if (plan.fail) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error("沒做成：" + String(e.message || e).split("\n")[0].slice(0, 300)); process.exit(1); });
module.exports = { ACTIONS, parseTask, planTask };
