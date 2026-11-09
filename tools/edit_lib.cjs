// 一次改很多檔的小工具（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
// 寫一支一次性的改檔腳本時用：要改的字找不到、或不只一處，就丟錯，不會默默改錯地方。
//   const { editor } = require("./tools/edit_lib.cjs");
//   const f = editor("shared/config.js");
//   f.edit("舊的字", "新的字");            // 一定要剛好一處
//   f.cut("從這裡", "到這裡之前");          // 刪掉一段
//   f.re(/正規表示式/, m => "新的字");      // 一定要比對得到
//   f.append("加在最後\n");
//   f.save();
const fs = require("fs");

function editorOf(text, name = "（文字）") {
  let s = text;
  return {
    edit(a, b) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${name}：找到 ${n} 處：${String(a).slice(0, 70)}`); s = s.split(a).join(b); return this; },
    cut(from, to) { const i = s.indexOf(from), j = s.indexOf(to, i); if (i < 0 || j < 0) throw new Error(`${name}：cut 找不到：${String(from).slice(0, 50)}`); s = s.slice(0, i) + s.slice(j); return this; },
    re(r, fn) { if (!r.test(s)) throw new Error(`${name}：比對不到 ${r}`); r.lastIndex = 0; s = s.replace(r, fn); return this; }, // fn 用函式，字裡的 $ 才不會被吃掉
    append(t) { s += t; return this; },
    text: () => s,
  };
}
function editor(file) {
  const e = editorOf(fs.readFileSync(file, "utf8"), file);
  e.save = () => { fs.writeFileSync(file, e.text()); return e; };
  return e;
}
module.exports = { editor, editorOf };
