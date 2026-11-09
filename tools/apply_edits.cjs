// 照純文字檔改很多處，不用跳脫（翊文 11-09：「修補腳本因為跳脫字元失敗，有沒有辦法以後不要發生」）
//   要改的文字放純文字檔，逐字比對、逐字換，反引號、$、引號、反斜線都不用管。
//   先全部檢查，有壹處找不到或不只壹處，就壹個檔都不寫，告訴你是哪壹段。
//
//   node tools/apply_edits.cjs 計畫檔 [--check]      --check 只檢查，不寫
//
// 計畫檔的格式（標記要獨佔壹行）：
//   @@@ 檔案 docs/現況.md
//   @@@ 舊
//   原本的文字（可以很多行）
//   @@@ 新
//   換成的文字
//   @@@ 完
//   @@@ 舊
//   同壹個檔的下壹段……
//   @@@ 新
//   ……
//   @@@ 完
//   @@@ 檔案 新的檔.md
//   @@@ 整檔
//   整個檔的內容（新建或蓋掉）
//   @@@ 完
const fs = require("fs"), path = require("path");

// 把計畫檔拆成 [{ file, kind: "edit", old, new } | { file, kind: "whole", text }]。格式錯就丟錯，並說第幾行
function parsePlan(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let file = null, kind = null, buf = null, old = null, start = 0;
  const bad = (i, m) => { throw new Error(`計畫檔第 ${i + 1} 行：${m}`); };
  lines.forEach((line, i) => {
    const m = /^@@@ (檔案 (.+)|舊|新|完|整檔)\s*$/.exec(line);
    if (!m) {
      if (buf) buf.push(line);
      else if (line.trim()) bad(i, `這行不在任何區塊裡：${line.slice(0, 40)}`);
      return;
    }
    const tag = m[1];
    if (tag.startsWith("檔案")) {
      if (buf) bad(i, "上壹段還沒有「@@@ 完」");
      file = m[2].trim();
    } else if (tag === "舊") {
      if (!file) bad(i, "前面要先有「@@@ 檔案」");
      if (buf) bad(i, "上壹段還沒有「@@@ 完」");
      kind = "edit"; buf = []; start = i;
    } else if (tag === "整檔") {
      if (!file) bad(i, "前面要先有「@@@ 檔案」");
      if (buf) bad(i, "上壹段還沒有「@@@ 完」");
      kind = "whole"; buf = []; start = i;
    } else if (tag === "新") {
      if (kind !== "edit" || old !== null) bad(i, "「@@@ 新」要接在「@@@ 舊」後面");
      old = buf.join("\n"); buf = [];
      if (!old) bad(start, "舊的文字是空的");
    } else {
      if (!buf) bad(i, "「@@@ 完」前面沒有內容");
      if (kind === "edit" && old === null) bad(i, "缺「@@@ 新」");
      out.push(kind === "edit" ? { file, kind, old, new: buf.join("\n"), line: start + 1 } : { file, kind, text: buf.join("\n") + "\n", line: start + 1 });
      kind = null; buf = null; old = null;
    }
  });
  if (buf) throw new Error("計畫檔結束了，最後壹段還沒有「@@@ 完」");
  if (!out.length) throw new Error("計畫檔裡沒有要改的東西");
  return out;
}
// 不碰硬碟：read(file) 給內容（沒有回 null）。回傳 { files: {檔: 新內容}, errors: [] }
function planResult(steps, read) {
  const files = {}, errors = [];
  for (const s of steps) {
    if (s.kind === "whole") { files[s.file] = s.text; continue; }
    const cur = s.file in files ? files[s.file] : read(s.file);
    if (cur === null) { errors.push(`${s.file}（第 ${s.line} 行）：沒有這個檔`); continue; }
    const crlf = cur.includes("\r\n");
    const from = crlf ? s.old.replace(/\n/g, "\r\n") : s.old, to = crlf ? s.new.replace(/\n/g, "\r\n") : s.new;
    const n = cur.split(from).length - 1;
    if (n !== 1) { errors.push(`${s.file}（第 ${s.line} 行）：找到 ${n} 處，要剛好壹處：${s.old.slice(0, 50)}`); continue; }
    files[s.file] = cur.split(from).join(to);
  }
  return { files, errors };
}

function main() {
  const args = process.argv.slice(2), plan = args.find(a => !a.startsWith("--"));
  if (!plan) throw new Error("用法：node tools/apply_edits.cjs 計畫檔 [--check]");
  const read = f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
  const { files, errors } = planResult(parsePlan(fs.readFileSync(plan, "utf8")), read);
  if (errors.length) throw new Error(`壹個檔都沒改：\n${errors.join("\n")}`);
  if (args.includes("--check")) { console.log(`檢查過了，會改 ${Object.keys(files).length} 個檔`); return; }
  for (const [f, t] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, t);
    console.log(`改好 ${f}`);
  }
}
if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
module.exports = { parsePlan, planResult };
