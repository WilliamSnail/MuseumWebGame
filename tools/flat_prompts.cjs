// 把 docs/地下室素材清單.md 的 Prompt 展開成「一段一個框、直接複製貼上」的版本（翊文 11-12：「把prompt做成我好複製直接可以一個一個貼上的」）
//   node tools/flat_prompts.cjs   → 寫 docs/地下室素材Prompt.html（打開就能用：每張有參考圖和兩顆複製鈕；圖片包在檔案裡）
// 做的事：{LAYER}、{THING} 這類照表格換成每一列；【結尾】換成第〇節那段；前面加「照參考圖的風格」那句；第四節的第一批排最前面。
// 清單改了就重跑，不要手改產出的檔。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "docs", "地下室素材清單.md");
// --only 3-6,3-7 --out 檔名.html：只放這幾張（新加的一批另外給翊文，不跟生好的混在一起）
const argOf = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const ONLY = (argOf("--only") || "").split(",").map(x => x.trim()).filter(Boolean);
const OUT = path.join(ROOT, "docs", argOf("--out") || "地下室素材Prompt.html");
const STYLE = "Match the art style of the attached reference image.";

const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
// 共用的結尾：第〇節裡第一個程式框
let ending = "";
{
  const a = lines.findIndex(l => l.startsWith("## 〇"));
  const s = lines.findIndex((l, i) => i > a && l.startsWith("```"));
  const e = lines.findIndex((l, i) => i > s && l.startsWith("```"));
  ending = lines.slice(s + 1, e).join(" ").trim();
}

// 第一～三節的每個 ### 小節：程式框 + 後面的表格
const items = [];
let sec = null, i = 0;
const startAt = lines.findIndex(l => l.startsWith("## 一"));
const stopAt = lines.findIndex(l => l.startsWith("## 四"));
for (i = startAt; i < stopAt; i++) {
  const l = lines[i];
  if (l.startsWith("### ")) { sec = { title: l.slice(4).trim(), id: l.slice(4).trim().split(" ")[0], prompts: [], rows: [], notes: [] }; items.push(sec); continue; }
  if (!sec) continue;
  if (l.startsWith("```")) {
    const body = [];
    for (i++; i < stopAt && !lines[i].startsWith("```"); i++) body.push(lines[i]);
    sec.prompts.push(body.join(" ").trim());
    continue;
  }
  if (/^\|/.test(l) && !/^\|\s*-/.test(l)) {
    const cells = l.split("|").slice(1, -1).map(c => c.trim());
    const val = cells[cells.length - 1];
    if (/^`.*`$/.test(val) && !/^`\{/.test(val)) sec.rows.push({ label: cells.slice(0, -1).join(" "), value: val.slice(1, -1) });
    continue;
  }
  if (/^對應：|^（.*）$/.test(l.trim())) sec.notes.push(l.trim());
}

// 展開成一張一段
const out = [];
for (const s of items) {
  const p = s.prompts[0];
  if (!p) continue;
  const finish = t => [STYLE, t.replace("【結尾】", ending)].join(" ").replace(/\s+/g, " ").trim();
  const hole = /\{[A-Z]+\}/.exec(p);
  if (hole && s.rows.length) {
    s.rows.forEach(r => out.push({ key: `${s.id} ${r.label}`, sec: s, text: finish(p.replace(hole[0], r.value)) }));
  } else out.push({ key: s.id, sec: s, text: finish(p) });
}

// 第一批（第四節）排前面
const FIRST = ["2-1 B1", "2-2 f1a", "2-2 f1b", "2-2 f1g", "3-1", "2-3 推", "2-3 看穿", "2-3 扣理智", "2-3 登記", "1-2", "1-3"];
const isFirst = o => FIRST.some(k => o.key === k || o.key.startsWith(k + " "));
const rank = o => { const n = FIRST.findIndex(k => o.key === k || o.key.startsWith(k + " ")); return n < 0 ? 999 : n; };
const onlyHit = o => ONLY.some(k => o.key === k || o.key.startsWith(k + " "));
const first = ONLY.length ? out.filter(onlyHit) : out.filter(isFirst).sort((a, b) => rank(a) - rank(b)), rest = ONLY.length ? [] : out.filter(o => !isFirst(o));


const fileOf = o => (o.key.startsWith("2-2 ") ? o.key.split(" ").slice(0, 2) : o.key.split(" ")).join("_") + ".png"; // 怪物只用 id（f1a），不用名字

// 每張附哪一張參考圖：地圖零件、介面零件附地下室石板框；舞台、怪物、特效附大廳導覽圖
const REFS = {
  ui: { file: "assets/cellar2/ui-電腦.webp", name: "整張介面（翊文生的）" },
  land: { file: "web/public/lobby/land.webp", name: "大廳導覽圖" },
  stone: { file: "assets/panel-kit/stone-raw.webp", name: "地下室石板框" },
};
// 3-8 以後是打怪介面的零件：附翊文生的整張介面（風格、配色照它）
const refOf = o => (/^3-(8|9|1\d)$/.test(o.key) ? "ui" : /^(1-2|1-3|1-4|2-4|3-)/.test(o.key) ? "stone" : "land");
const dataUrl = f => "data:image/webp;base64," + fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let n = 0;
const card = o => {
  const i = ++n, r = refOf(o);
  return `<article class="c" id="n${i}">
  <header><b>第 ${i} 張</b>　${esc(o.key)}　<small>${esc(o.sec.title.replace(/^\S+\s*/, ""))}</small><label><input type="checkbox" data-done="${i}"> 生好了</label></header>
  <div class="row">
    <figure><img class="ref" data-ref="${r}" src="${dataUrl(REFS[r].file)}" alt="參考圖：${REFS[r].name}"><figcaption>參考圖：${REFS[r].name}</figcaption><button data-img="${r}">① 複製參考圖</button></figure>
    <div class="p"><pre>${esc(o.text)}</pre><button data-txt="${i}">② 複製 Prompt</button></div>
  </div>
  <p class="send">③ 生好傳給 AI 時說「這是第 ${i} 張」（AI 存成 <code>assets/cellar2/${esc(fileOf(o))}</code>）</p>
</article>`;
};
const html = `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>地下室素材：一張一張貼</title>
<style>
body{margin:0;background:#2a1d22;color:#f3e6c8;font:16px/1.6 "Noto Sans TC","Microsoft JhengHei",sans-serif}
main{max-width:980px;margin:0 auto;padding:20px}
h1{font-size:24px;margin:.2em 0}h2{margin:1.6em 0 .4em;color:#d9b45e}
.how{background:#3a2a30;border:1px solid #6b5040;border-radius:10px;padding:12px 16px}
.c{background:#f4ead3;color:#3a2a20;border-radius:12px;padding:14px 16px;margin:14px 0;border:2px solid #b38a3e}
.c.done{opacity:.45}
.c header{font-size:17px;display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}.c header small{color:#7a6050}
.c header label{margin-left:auto;font-size:15px;cursor:pointer}
.row{display:flex;gap:14px;margin-top:8px;flex-wrap:wrap}
figure{margin:0;width:200px;text-align:center}figure img{width:200px;border-radius:6px;border:1px solid #b38a3e}
figcaption{font-size:13px;color:#7a6050}
.p{flex:1;min-width:260px}
pre{white-space:pre-wrap;word-break:break-word;background:#fffaf0;border:1px solid #d8c6a0;border-radius:6px;padding:10px;margin:0 0 8px;font:13px/1.5 Consolas,monospace;max-height:180px;overflow:auto}
button{font:inherit;font-size:16px;padding:10px 16px;min-height:44px;border-radius:8px;border:2px solid #7a2e3a;background:#8e3444;color:#fff;cursor:pointer;width:100%}
button.ok{background:#3c7a4a;border-color:#2c5a36}
.send{margin:8px 0 0;font-size:14px;color:#5a4030}code{font-size:13px}
</style></head><body><main>
<h1>地下室素材：一張一張貼</h1>
<div class="how">每一張照順序做：<b>①</b> 按「複製參考圖」，到 Gemini 貼上（Ctrl+V）；<b>②</b> 按「複製 Prompt」，貼在同一則訊息；送出。<b>③</b> 生好的圖傳給 AI，說「這是第幾張」。一次傳一張，等 AI 回了再傳下一張。<br>勾「生好了」會記在這台電腦上，下次打開還在。</div>
<h2>${ONLY.length ? `這次要生的 ${first.length} 張` : `第一批：先生這 ${first.length} 張（夠做 B1 的打怪畫面）`}</h2>
${first.map(card).join("\n")}
${rest.length ? "<h2>其他（B1 玩過、覺得風格對了再生）</h2>" : ""}
${rest.map(card).join("\n")}
</main>
<script>
const REF = ${JSON.stringify(Object.fromEntries(Object.entries(REFS).map(([k, v]) => [k, dataUrl(v.file)])))};
const TXT = ${JSON.stringify(Object.fromEntries([...first, ...rest].map((o, i) => [i + 1, o.text])))};
document.querySelectorAll("img.ref").forEach(im => { im.src = REF[im.dataset.ref]; });
const flash = (b, t) => { const o = b.textContent; b.textContent = t; b.classList.add("ok"); setTimeout(() => { b.textContent = o; b.classList.remove("ok"); }, 1500); };
async function pngOf(src) { // Gemini 貼得進去的是 PNG：把 webp 畫到 canvas 轉一下
  const im = new Image(); im.src = src; await im.decode();
  const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext("2d").drawImage(im, 0, 0);
  return new Promise(r => cv.toBlob(r, "image/png"));
}
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.txt) { await navigator.clipboard.writeText(TXT[b.dataset.txt]); flash(b, "複製好了，去貼上"); }
    if (b.dataset.img) { await navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(REF[b.dataset.img]) })]); flash(b, "複製好了，去貼上"); }
  } catch (err) { flash(b, "這個瀏覽器不能複製：在圖上按右鍵「複製圖片」"); }
});
const KEY = "cellar2-prompts-done";
const done = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
document.querySelectorAll("[data-done]").forEach(cb => {
  const c = cb.closest(".c"); cb.checked = done.has(cb.dataset.done); c.classList.toggle("done", cb.checked);
  cb.addEventListener("change", () => { cb.checked ? done.add(cb.dataset.done) : done.delete(cb.dataset.done); c.classList.toggle("done", cb.checked); localStorage.setItem(KEY, JSON.stringify([...done])); });
});
</script></body></html>`;
fs.writeFileSync(OUT, html);
console.log(`寫好 ${path.relative(ROOT, OUT)}：第一批 ${first.length} 張、其他 ${rest.length} 張`);
