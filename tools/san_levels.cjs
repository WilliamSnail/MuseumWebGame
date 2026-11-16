// 旅客理智等級（決定 0103）：印出每日排程要讀的那份公開 JSON（週結算的分級、前一次的分級、新走到 edge 的）。
//   node tools/san_levels.cjs                 讀 https://pepe-museum.web.app/data/npc_san.json
//   node tools/san_levels.cjs --url 網址      換網址（模擬器、預覽站）
//   node tools/san_levels.cjs --file 檔案     讀本機的 JSON（測試）
//   node tools/san_levels.cjs --json          印原始 JSON（不整理）
// 不用金鑰；不寫玩家名字、不寫誰造成的。排程說明一之十一之二改讀這份（取代固定動作 world-status）。
const fs = require("fs");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
async function main() {
  const file = arg("--file"), url = arg("--url") || "https://pepe-museum.web.app/data/npc_san.json";
  const j = file ? JSON.parse(fs.readFileSync(file, "utf8")) : await (await fetch(url)).json();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(j, null, 2)); return; }
  console.log(`最近一次週結算：${j.asOf || "（還沒有）"}（第 ${j.seg == null ? "-" : j.seg + 1} 段）`);
  const L = j.levels || {}, ids = Object.keys(L);
  console.log(`追蹤 ${ids.length} 位旅客；崩潰邊緣（還沒走結局）：${(j.edge || []).join("、") || "沒有"}`);
  console.log(`這次新走到崩潰邊緣（前一次已經是不安以上）：${(j.newEdge || []).join("、") || "沒有"}`);
  for (const id of ids) { const x = L[id]; if (x.st !== "steady" || x.now !== "steady") console.log(`  ${id}：這次 ${x.st}（前一次 ${x.prev}）、最近 7 天均線 ${x.now || "資料不夠"}${x.end ? "、已走結局" : ""}${x.since ? "、" + x.since + " 起" : ""}`); }
}
main().catch(e => { console.error("讀不到：" + e.message); process.exit(1); });
