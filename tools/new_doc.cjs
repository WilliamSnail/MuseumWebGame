// 寫維護日誌和決定，一個指令走完（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
// 時間、版本、決定的下一個號碼、日誌索引都自動處理。內容放 JSON 檔（省得在指令列跳脫引號）：
//
//   npm run doc:new -- spec.json
//   {
//     "topic": "活動開跑通知", "type": "新功能",            類型：新功能／修正／平衡／內容／文件／伺服器
//     "scope": ["tools/announce.cjs"], "test": "npm test 全過",
//     "why": ["翊文的原話"], "changed": ["改了什麼"], "checked": ["怎麼確認的"],
//     "todo": ["還沒做的（可以不寫）"], "next": ["給下一個人（可以不寫）"], "related": ["docs/決定/0041-限時活動.md"],
//     "ai": "Claude Opus 5.5（Claude Code）",                可以不寫
//     "decision": { "title": "活動開跑通知", "who": "翊文", "why": ["原話"], "body": "## 決定\n\n1. …" }   可以不寫
//   }
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TYPES = ["新功能", "修正", "平衡", "內容", "文件", "伺服器"];
const list = (a, none) => (Array.isArray(a) && a.length ? a.map(x => `- ${x}`).join("\n") : `- ${none}`);
const quote = a => (a || []).map(x => `> 「${x}」`).join("\n>\n");

// 決定的下一個號碼
function nextDecision(names) {
  const max = names.map(n => (/^(\d{4})-/.exec(n) || [])[1]).filter(Boolean).map(Number).reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(4, "0");
}
const safeName = s => String(s).replace(/[\\/:*?"<>|\s]+/g, "");
function logText(s, now, version) {
  if (!TYPES.includes(s.type)) throw new Error(`類型要是 ${TYPES.join("、")}`);
  if (!s.topic) throw new Error("要有 topic");
  return `---
日期: ${now}
作者: ${s.author || "翊文"}
AI: ${s.ai || "Claude Opus 5.5（Claude Code）"}
類型: ${s.type}
範圍: [${(s.scope || []).join(", ")}]
PR: 無
版本: ${version}
測試: ${s.test || "npm test 全過"}
狀態: 待合併
相關: [${(s.related || []).join(", ")}]
---

## 為什麼要改

${quote(s.why)}

## 改了什麼

${list(s.changed, "（見範圍）")}

## 怎麼確認的

${list(s.checked, "`npm test` 全過。")}

## 還沒做、要注意

${list(s.todo, "無。")}

## 給下一個人

${list(s.next, "無。")}
`;
}
function decisionText(d, num, now) {
  if (!d.title || !d.body) throw new Error("decision 要有 title、body");
  return `# ${num} ${d.title}

- 日期：${now}
- 誰決定：${d.who || "翊文"}
- 狀態：有效

## 背景

翊文：

${quote(d.why)}

${String(d.body).trim()}
`;
}
const versionNow = () => JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).version;
function main() {
  const file = process.argv[2];
  if (!file) throw new Error("用法：npm run doc:new -- spec.json");
  const s = JSON.parse(fs.readFileSync(file, "utf8")), now = spawnSync(process.execPath, ["tools/now.cjs"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const [y, mo, d] = now.slice(0, 10).split("-");
  if (s.decision) {
    const dir = path.join(ROOT, "docs", "決定"), num = nextDecision(fs.readdirSync(dir)), f = path.join(dir, `${num}-${safeName(s.decision.title)}.md`);
    fs.writeFileSync(f, decisionText(s.decision, num, now));
    s.related = [...(s.related || []), `docs/決定/${path.basename(f)}`];
    console.log(path.relative(ROOT, f));
  }
  const log = path.join(ROOT, "維護日誌", y, `${mo}-${d}_${s.author || "翊文"}_${safeName(s.topic)}.md`);
  if (fs.existsSync(log)) throw new Error(`已經有了：${log}`);
  fs.writeFileSync(log, logText(s, now, versionNow()));
  console.log(path.relative(ROOT, log));
  console.log(spawnSync(process.execPath, ["tools/log_index.cjs"], { cwd: ROOT, encoding: "utf8" }).stdout.trim());
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
module.exports = { nextDecision, safeName, logText, decisionText };
