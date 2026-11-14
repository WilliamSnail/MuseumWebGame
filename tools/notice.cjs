// 加壹則館方公告到 shared/notices.js 的最上面（翊文 11-14：「還有什麼腳本需要寫的」→「四個都做」）
// 以前每次手動插壹大段：id、日期、area、到期日都要自己打，area 打錯就歸到「其他」。
//   npm run notice -- --area 賭場 --title "賭場同桌不用往下滑了" "第壹點" "第二點"
//   選填：--id casino-xxx-2026-11（沒給就用 upd-日期-標題雜湊）  --section 改了什麼（段落名，預設「改了什麼」）
//         --importance low|normal|important|urgent（預設 low）  --cat 館方公告|特展活動  --tag 更新（可以多次）
//         --publish 2026-11-14（預設今天，台灣日期）  --expire 2027-12-31（預設隔年年底）  --dry（只印不寫）
// 句子照第 1 代用「壹」：這裡把「一」換成「壹」以外的字不會動，「一」會提醒（不擋，因為「一起」這類有時就是要用）。
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "shared", "notices.js");

function readList(name) {
  const src = fs.readFileSync(FILE, "utf8"), m = src.match(new RegExp(`export const ${name} = (\\[[^\\]]*\\])`));
  return m ? JSON.parse(m[1]) : [];
}
function taipeiDay(ms = Date.now()) { return new Date(ms + 8 * 3600e3 - 5 * 3600e3).toISOString().slice(0, 10); } // 台灣 05:00 換日，跟 todayStr 壹樣

function parse(argv) {
  const o = { tags: [], lines: [] };
  const one = ["area", "title", "id", "section", "importance", "cat", "publish", "expire"];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") { o.dry = true; continue; }
    if (a === "--tag") { o.tags.push(argv[++i]); continue; }
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (!one.includes(k)) throw new Error(`沒有 --${k} 這個選項`);
      if (argv[i + 1] === undefined) throw new Error(`--${k} 後面要有內容`);
      o[k] = argv[++i]; continue;
    }
    o.lines.push(a);
  }
  return o;
}
// 組出壹則公告（純函式，測試用）
function build(o, { areas, cats, today, existingIds = [] }) {
  if (!o.title || [...o.title].length < 4) throw new Error("要有 --title（兩行以內）");
  if (!areas.includes(o.area)) throw new Error(`--area 要是其中壹個：${areas.join("、")}`);
  if (!o.lines.length) throw new Error("至少要壹句內容（放在選項後面）");
  const cat = o.cat || "館方公告";
  if (!cats.includes(cat)) throw new Error(`--cat 要是其中壹個：${cats.join("、")}`);
  const importance = o.importance || "low";
  if (!["low", "normal", "important", "urgent"].includes(importance)) throw new Error("--importance 要是 low、normal、important、urgent");
  const publish = o.publish || today, expire = o.expire || `${Number(publish.slice(0, 4)) + 1}-12-31`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publish) || !/^\d{4}-\d{2}-\d{2}$/.test(expire)) throw new Error("日期要寫成 2026-11-14");
  const id = o.id || `upd-${publish}-${crypto.createHash("sha1").update(o.title).digest("hex").slice(0, 6)}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("--id 只能用小寫英文、數字、減號");
  if (existingIds.includes(id)) throw new Error(`id「${id}」已經有了：換壹個，或要讓大家重看就改那則的 v`);
  return { id, v: 1, cat, tags: o.tags.length ? o.tags : ["更新"], importance, area: o.area, title: o.title, publish, expire, sections: [[o.section || "改了什麼", o.lines]] };
}
// 寫成跟檔案裡壹樣的樣子
function render(n) {
  const q = s => JSON.stringify(s);
  return `  {
    id: ${q(n.id)}, v: ${n.v}, cat: ${q(n.cat)}, tags: ${q(n.tags).replace(/,/g, ", ")}, importance: ${q(n.importance)}, area: ${q(n.area)},
    title: ${q(n.title)}, publish: ${q(n.publish)}, expire: ${q(n.expire)},
    sections: [
${n.sections.map(([t, ls]) => `      [${q(t)}, [\n${ls.map(l => `        ${q(l)},`).join("\n")}\n      ]],`).join("\n")}
    ],
  },
`;
}
function insert(src, block) {
  const head = "export const NOTICES = [\n";
  if (!src.includes(head)) throw new Error("shared/notices.js 找不到 NOTICES 的開頭");
  return src.replace(head, head + block);
}
const warnOne = lines => lines.some(l => /一/.test(l)) ? "提醒：句子裡有「一」，介面文字照第 1 代用「壹」（「一起」這類可以不改）" : "";

module.exports = { parse, build, render, insert, warnOne, taipeiDay };
if (require.main === module) {
  try {
    const o = parse(process.argv.slice(2)), src = fs.readFileSync(FILE, "utf8");
    const ids = [...src.matchAll(/\bid: "([^"]+)"/g)].map(m => m[1]);
    const n = build(o, { areas: readList("NOTICE_AREAS"), cats: readList("NOTICE_CATS"), today: taipeiDay(), existingIds: ids });
    const block = render(n);
    if (o.dry) { console.log(block); process.exit(0); }
    fs.writeFileSync(FILE, insert(src, block));
    console.log(`✓ 加好公告 ${n.id}（${n.area}，${n.publish}～${n.expire}）`);
    const w = warnOne(o.lines); if (w) console.log(w);
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
