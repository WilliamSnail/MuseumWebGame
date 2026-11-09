// 動畫減量（設定頁）：靠動畫才出現的東西，減量時不能變成永遠看不到（翊文 11-09：揭曉的佩佩沒顯示）
// @keyframes fadein 只寫 from，結束時回到元素自己的 opacity：元素本來是 opacity 0，就是從 0 淡到 0
const assert = require("assert");
const fs = require("fs"), path = require("path");

const dir = path.join(__dirname, "..", "web", "src", "css");
const rules = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".css"))) {
  const s = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ f, sel: m[1].trim(), body: m[2] });
}
const zeroOpacity = /(^|[;\s])opacity:\s*0\s*(;|$)/;
const hiddenClasses = new Set();
for (const r of rules) {
  if (!zeroOpacity.test(r.body) || /reduce-motion/.test(r.sel)) continue;
  for (const one of r.sel.split(",")) {
    const m = /^\.([\w-]+)$/.exec(one.trim()); // 只看「.名字 { opacity: 0 }」這種本來就藏著的
    if (m) hiddenClasses.add(m[1]);
  }
}

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + e.message); } };

T("減量時用 fadein 的元素，本來不能是 opacity 0（除非同一條規則把 opacity 補回來）", () => {
  const bad = [];
  for (const r of rules) {
    if (!/reduce-motion/.test(r.sel) || !/\bfadein\b/.test(r.body)) continue;
    if (/(^|[;\s])opacity:\s*(1|\.\d|0\.\d)/.test(r.body)) continue;
    for (const c of r.sel.match(/\.[\w-]+/g) || []) {
      if (c !== ".reduce-motion" && hiddenClasses.has(c.slice(1))) bad.push(`${r.f}：${r.sel}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});
T("揭曉的佩佩：本來藏著、靠 rise 出現；減量時要補 opacity: 1", () => {
  assert.ok(hiddenClasses.has("rv-frog"), "這個測試假設 .rv-frog 本來是 opacity 0");
  const r = rules.find(x => /body\.reduce-motion \.rv-frog\.rise/.test(x.sel));
  assert.ok(r && /opacity:\s*1/.test(r.body), "body.reduce-motion .rv-frog.rise 要有 opacity: 1");
});

T("預設關；舊存檔統一關一次，之後自己打開要留著（翊文：預設都要關閉，所有人）", () => {
  const G = require("./load_shared.cjs").load();
  assert.strictEqual(G.newSave().settings.reduceMotion, false, "新存檔是關的");
  const old = G.migrateSave({ settings: { reduceMotion: true, font: "l" } });
  assert.strictEqual(old.settings.reduceMotion, false, "舊存檔開著的關掉");
  assert.strictEqual(old.settings.font, "l", "別的設定不動");
  old.settings.reduceMotion = true; // 之後玩家自己打開
  const again = G.migrateSave(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(again.settings.reduceMotion, true, "自己打開的不會每次被關");
  assert.strictEqual(G.migrateSave({}).settings.reduceMotion, false, "沒有設定的舊存檔");
  const fresh = G.newSave(); fresh.settings.reduceMotion = true;
  assert.strictEqual(G.migrateSave(JSON.parse(JSON.stringify(fresh))).settings.reduceMotion, true, "新存檔自己打開也留著");
});

console.log(`${pass} passed, ${fail} failed（動畫減量）`);
process.exit(fail ? 1 : 0);
