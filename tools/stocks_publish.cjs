// 把館外股票的每日資料寫進正式資料庫的一份文件 stocksDaily/latest（翊文 11-13 同意「讓伺服器讀」，建議的 (a) 做法）。
// 由 .github/workflows/stocks-daily.yml 最後一步跑；金鑰只在 GitHub Secrets（FIREBASE_SERVICE_ACCOUNT），AI 拿不到。
// 只做這壹件事：整份覆蓋 stocksDaily/latest，內容只有 { updated, days }，且要先通過 stocks_fetch.cjs 的格式檢查。
//   node tools/stocks_publish.cjs 檔案 --dry     只印會寫什麼，不連資料庫
const fs = require("fs"), path = require("path");
const { check } = require("./stocks_fetch.cjs");

function buildDoc(daily) {
  const errs = check(daily);
  if (errs.length) throw new Error("資料格式不對：" + errs.slice(0, 3).join("；"));
  if (!Object.keys(daily.days).length) throw new Error("沒有任何一天的資料");
  return { updated: String(daily.updated || ""), days: daily.days };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("要給 daily.json 的路徑");
  const doc = buildDoc(JSON.parse(fs.readFileSync(file, "utf8")));
  if (process.argv.includes("--dry")) { console.log("會寫 stocksDaily/latest：" + Object.keys(doc.days).length + " 天，最新 " + Object.keys(doc.days).sort().pop()); return; }
  const root = path.join(__dirname, "..", "functions", "node_modules");
  const { initializeApp, applicationDefault } = require(path.join(root, "firebase-admin", "lib", "app", "index.js"));
  const { getFirestore, FieldValue } = require(path.join(root, "firebase-admin", "lib", "firestore", "index.js"));
  const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  if (sa.project_id !== "pepe-museum") throw new Error("金鑰不是 pepe-museum 的");
  initializeApp({ credential: applicationDefault(), projectId: sa.project_id });
  await getFirestore().doc("stocksDaily/latest").set(Object.assign({}, doc, { publishedAt: FieldValue.serverTimestamp() }));
  console.log("寫好 stocksDaily/latest：" + Object.keys(doc.days).length + " 天，最新 " + Object.keys(doc.days).sort().pop());
}
if (require.main === module) main().catch(e => { console.error("沒做成：" + String(e.message || e).split("\n")[0].slice(0, 300)); process.exit(1); });
module.exports = { buildDoc };
