// 館門口池子的水位（決定 0132、0133）：印出每日排程要讀的那份公開 JSON。
//   node tools/pool_levels.cjs                 讀 https://pepe-museum.web.app/data/pool.json
//   node tools/pool_levels.cjs --url 網址      換網址（模擬器、預覽站）
//   node tools/pool_levels.cjs --file 檔案     讀本機的 JSON（測試）
//   node tools/pool_levels.cjs --json          印原始 JSON（不整理）
// 不用金鑰；欄位 { day, lv(0～24 格), dir(1 漲／-1 退／0), band(low mid high edge over), night(門檻那晚 18:00～隔天 05:00), trace(最近幾天), hits(到過幾次) }；不寫是誰、不寫淨值。
const fs = require("fs");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
async function main() {
  const file = arg("--file"), url = arg("--url") || "https://pepe-museum.web.app/data/pool.json";
  const j = file ? JSON.parse(fs.readFileSync(file, "utf8")) : await (await fetch(url)).json();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(j, null, 2)); return; }
  if (j.lv == null) { console.log(`${j.day}：池子還沒有水位（文化部資助的那位館友還沒進來）`); return; }
  console.log(`${j.day}：水位 ${j.lv}/24（${j.band}），${j.dir > 0 ? "在漲" : j.dir < 0 ? "在退" : "不動"}；門檻那晚：${j.night ? "是" : "不是"}；到過門檻 ${j.hits} 次`);
  console.log(`最近 ${j.trace.length} 天：${j.trace.map(n => (n > 0 ? "↑" : n < 0 ? "↓" : "·")).join(" ")}`);
}
main().catch(e => { console.error("讀不到：" + e.message); process.exit(1); });
