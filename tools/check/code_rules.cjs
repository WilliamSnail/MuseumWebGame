// 程式的規矩（11-20，翊文：「把約束寫進程式碼，不是文件」）。npm test 會跑，違規就失敗。
// 以前這些規矩只寫在 AGENTS.md，AI 看過也會漏；現在寫成檢查，漏了 CI 就紅。
//   1. shared/ 是純函式：不准 Math.random、new Date()（現在）、Date.now、document、window、localStorage、sessionStorage。
//      亂數走 RNG()、今天走 todayStr()、現在走 nowMs()（shared/logic_base.js）。有參數的 new Date(ms)／new Date(Date.UTC(…)) 是日期算術，不擋。
//   2. web/src/css 的 infinite：只准白名單裡的（氣氛動畫，45 秒沒操作 web/src/core/rest.js 會停）。提醒用的閃爍閃 3 下就停，不寫 infinite。
//   3. .replace("字串", "字串")（第二個參數是字串）：`$$`、`$&` 會被當成特殊符號，改用函式 .replace("a", () => "b")、split/join。web/src、shared、tools、functions。
//   4. 畫面文字用「壹」：只看這次新加的行（git diff），出現「一個、一天、一次、一張、一起…」就報；舊的不擋。
//   5. 名字只放一處：改過名的餐車品項、交代人，舊名不准再出現在現役的程式和說明（維護 RENAMES）。
// 用法：node tools/check/code_rules.cjs [--base origin/main] [--only 1,2,3,4,5]
//   --base：第 4 項拿哪個版本當基準（CI 用 origin/main）；沒給就自動用 origin/main 和 HEAD 的共同祖先，找不到就跳過第 4 項。
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const acorn = require("acorn");
const ROOT = path.join(__dirname, "..", "..");

// ---------- 白名單（每一條都要寫原因；新加的要有理由，不是為了讓檢查過） ----------
// 1. shared/ 純函式：「檔案|寫法」→ 原因
const PURE_ALLOW = {
  "shared/logic_base.js|Math.random": "RNG 的預設實作（RNG = Math.random）；其他地方一律用 RNG()",
  "shared/logic_base.js|Date.now": "nowMs() 的預設時鐘；其他地方一律用 nowMs()",
  "shared/casino/wallet.js|Math.random": "沒傳 rng 時的備援（o.rng ? o.rng() : Math.random()）；測試和伺服器都有傳 rng",
};
// 2. 無限動畫：「css 檔名」→ { names: 動畫名字, why }。全部都被 rest.js 在 45 秒沒操作時停掉。
const INFINITE_ALLOW = {
  "casino.css": { names: ["cas-shake", "slTease", "slChase", "live-pulse"], why: "賭場的氣氛：緊張的牌在抖、拉霸機的燈和「直播中」的紅點" },
  "coop.css": { names: ["cxThrob", "cxShake", "cxTremble"], why: "合作地下的壓力提示（壓力越高越抖），壹離開那個畫面就沒了" },
  "fight.css": { names: ["fg-breathe", "fg-blink", "fg-beat", "fg-ants"], why: "打怪物：怪物呼吸、眨眼、倒數心跳、瞄準線的螞蟻線" },
  "fx.css": { names: ["fx-bob"], why: "等你擲骰時骰子輕輕上下浮動" },
  "landscape.css": { names: ["orTurn", "orFade"], why: "「請轉方向」的示意動畫（只在提示畫面）" },
  "mood.css": { names: ["rm-sway", "rm-stkbob", "rm-roll", "rm-neon", "rm-smoke", "rm-smoke-bg", "rm-glowpulse"], why: "房間氣氛效果（旗幟、霓虹、煙、光暈），這是整個氣氛系統的本體" },
  "onescreen.css": { names: ["fusion-orb"], why: "融合祭壇的光球" },
  "route.css": { names: ["rt-march", "rt-bob"], why: "地下地圖：可走的路在流動、棋子輕輕浮動" },
  "theme3.css": { names: ["tipsy", "hueSpin", "wiggle", "twinkle", "idleStir", "dkBlink"], why: "收藏品和佩佩的小動作（醉、彩虹、搖、閃星、書脊騷動、眼睛眨）" },
  "ui.css": { names: ["wobble", "breathe", "blink", "spin", "shakehand"], why: "低理智的晃動、佩佩呼吸眨眼、轉盤、手抖（bout）" },
};
// 5. 改名對照：舊名 → 新名。新名要在 table（CAS_MENU 的品項名／TASK_GIVERS 的名字）裡找得到。改名時加壹行。
const RENAMES = [
  { old: "冰涼麥茶", neu: "冰涼啤酒", table: "CAS_MENU", when: "11-20 餐車三樣飲料改回酒" },
  { old: "珍藏茶", neu: "海軍上將白蘭地", table: "CAS_MENU", when: "11-20 餐車三樣飲料改回酒（舊名：海軍上將珍藏茶）" },
  { old: "葡萄汁", neu: "堂主推薦葡萄酒", table: "CAS_MENU", when: "11-20 餐車三樣飲料改回酒（舊名：堂主推薦葡萄汁）" },
];

// ---------- 小工具 ----------
function gitFiles() {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  return r.stdout.split("\0").filter(Boolean);
}
const defaultRead = f => fs.readFileSync(path.join(ROOT, f), "utf8");
function parse(src) {
  for (const sourceType of ["module", "script"]) {
    try { return acorn.parse(src, { ecmaVersion: "latest", sourceType, locations: true, allowHashBang: true, allowReturnOutsideFunction: true }); } catch (e) { /* 換另壹種試 */ }
  }
  return null;
}
function walk(n, f) {
  if (!n || typeof n.type !== "string") return;
  f(n);
  for (const k in n) {
    if (k === "loc") continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === "string") walk(x, f); } else if (v && typeof v.type === "string") walk(v, f);
  }
}
const isJs = f => /\.(js|cjs|mjs)$/.test(f);
const isStr = n => n && ((n.type === "Literal" && typeof n.value === "string") || n.type === "TemplateLiteral");

// ---------- 1. shared/ 純函式 ----------
const BROWSER_NAMES = new Set(["document", "window", "localStorage", "sessionStorage"]);
function pureFindings(src) {
  const ast = parse(src), out = [];
  if (!ast) return out;
  walk(ast, n => {
    if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier") {
      const o = n.object.name, p = n.property.name;
      if (o === "Math" && p === "random") out.push({ what: "Math.random", line: n.loc.start.line });
      else if (o === "Date" && p === "now") out.push({ what: "Date.now", line: n.loc.start.line });
      else if (BROWSER_NAMES.has(o)) out.push({ what: o, line: n.loc.start.line });
    } else if (n.type === "NewExpression" && n.callee.type === "Identifier" && n.callee.name === "Date" && n.arguments.length === 0) {
      out.push({ what: "new Date()", line: n.loc.start.line });
    }
  });
  return out;
}
const PURE_HINT = { "Math.random": "亂數用 RNG()", "new Date()": "現在用 nowMs()、今天用 todayStr()", "Date.now": "現在用 nowMs()" };
function checkPure(files, read = defaultRead, allow = PURE_ALLOW) {
  const bad = [], used = new Set();
  for (const f of files) {
    if (!/^shared\/.*\.js$/.test(f) || /^shared\/notices_data\.js$/.test(f)) continue;
    for (const x of pureFindings(read(f))) {
      const key = f + "|" + x.what;
      if (allow[key]) { used.add(key); continue; }
      bad.push(`${f}:${x.line}：shared/ 是純函式，不准用 ${x.what}（${PURE_HINT[x.what] || "畫面的事放 web/src，shared/ 不碰 DOM、不碰存檔"}；真的有理由才加進 tools/check/code_rules.cjs 的 PURE_ALLOW）`);
    }
  }
  for (const k of Object.keys(allow)) if (files.includes(k.split("|")[0]) && !used.has(k)) bad.push(`PURE_ALLOW 的「${k}」已經沒有用到了，從 tools/check/code_rules.cjs 拿掉`);
  return bad;
}

// ---------- 2. 無限動畫 ----------
const CSS_WORDS = /^(ease|ease-in|ease-out|ease-in-out|linear|infinite|alternate|alternate-reverse|reverse|normal|both|forwards|backwards|none|running|paused|step-start|step-end)$/;
function infiniteNames(css) {
  const out = [], t = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of t.matchAll(/animation(-name|-iteration-count)?\s*:\s*([^;}]*)/g)) {
    if (!/infinite/.test(m[2])) continue;
    if (m[1] === "-iteration-count") { out.push("(animation-iteration-count)"); continue; }
    for (const part of m[2].split(/,(?![^()]*\))/)) {
      if (!/infinite/.test(part)) continue;
      out.push(part.trim().split(/\s+/).find(x => /^[a-zA-Z_][\w-]*$/.test(x) && !CSS_WORDS.test(x)) || "(沒名字)");
    }
  }
  return out;
}
function checkInfinite(files, read = defaultRead, allow = INFINITE_ALLOW) {
  const bad = [];
  for (const f of files) {
    const m = f.match(/^web\/src\/css\/([^/]+\.css)$/);
    if (!m) continue;
    const okNames = (allow[m[1]] || {}).names || [];
    for (const name of new Set(infiniteNames(read(f)))) {
      if (!okNames.includes(name)) bad.push(`${f}：動畫 ${name} 用了 infinite（無限循環的動畫會讓手機壹直畫、發熱）。提醒用的閃爍改成閃 3 下就停；氣氛動畫才可以，要加進 tools/check/code_rules.cjs 的 INFINITE_ALLOW 並寫原因`);
    }
  }
  for (const [file, v] of Object.entries(allow)) {
    const f = "web/src/css/" + file;
    if (!files.includes(f)) { bad.push(`INFINITE_ALLOW 的 ${file} 已經沒有這個檔了，拿掉`); continue; }
    const have = new Set(infiniteNames(read(f)));
    for (const n of v.names) if (!have.has(n)) bad.push(`INFINITE_ALLOW 的 ${file}／${n} 已經沒有 infinite 了，從白名單拿掉`);
  }
  return bad;
}

// ---------- 3. .replace("字串", "字串") ----------
function replaceFindings(src) {
  const ast = parse(src), out = [];
  if (!ast) return out;
  walk(ast, n => {
    if (n.type !== "CallExpression" || n.callee.type !== "MemberExpression" || n.callee.computed || n.callee.property.name !== "replace" || n.arguments.length !== 2) return;
    const [a, b] = n.arguments;
    if (isStr(a) && isStr(b)) out.push({ line: n.loc.start.line, start: b.start });
  });
  return out;
}
function checkReplace(files, read = defaultRead) {
  const bad = [];
  for (const f of files) {
    if (!isJs(f) || !/^(web\/src|shared|tools|functions)\//.test(f) || /^functions\/(shared|node_modules)\//.test(f)) continue;
    for (const x of replaceFindings(read(f))) bad.push(`${f}:${x.line}：.replace(字串, 字串) 的第二個字串裡 $$、$& 會變成別的意思；改成 .replace("a", () => "b") 或 split/join`);
  }
  return bad;
}
// 修正用：第二個參數前面加 () =>（行為不變，只是不再把 $ 當特殊符號）。回傳新的原始碼和改了幾處
function fixReplace(src) {
  const xs = replaceFindings(src).sort((p, q) => q.start - p.start);
  let s = src;
  for (const x of xs) s = s.slice(0, x.start) + "() => " + s.slice(x.start);
  return { src: s, n: xs.length };
}

// ---------- 4. 畫面文字用「壹」（只看新加的行） ----------
const YI_WORDS = "個|天|次|張|起|些|下|點|種|隻|位|半|句|份|件|條|場|把|套|邊|面|樣|直|定";
const YI_RE = new RegExp(`(?<![十二三四五六七八九〇零百千萬壹貳參])一(?:${YI_WORDS})`, "g");
const YI_SKIP = "壹檢查略過"; // 那壹行裡有這幾個字就不查
// 哪些檔的新加行算「畫面文字」。公告（content/notices）不查：公告壹直是用一般的「一」寫的，查了每次上線都紅；帳本（content/story）是內部筆記。
const YI_JSON = /^content\/(weeks|npc|map)\/.*\.json$/;
const YI_JS = /^(shared\/(?:[^/]*\/)*(?:content|text|[a-z_]*_text)\.js|web\/src\/(?!css\/|assets\/).*\.js)$/;
const yiHits = s => [...new Set([...String(s).matchAll(YI_RE)].map(m => m[0]))];
function checkYi(added, read = defaultRead) { // added：Map 檔名 → 新加的行號 Set
  const bad = [];
  for (const [f, lines] of added) {
    const fmt = (ln, ws) => `${f}:${ln}：畫面文字要用「壹」，不是「一」（${ws.join("、")} → ${ws.map(w => w.replace("一", "壹")).join("、")}）；真的要保留就在那壹行加「${YI_SKIP}」`;
    if (YI_JSON.test(f)) {
      const arr = read(f).split("\n");
      for (const ln of [...lines].sort((a, b) => a - b)) { const t = arr[ln - 1] || ""; if (!t.includes(YI_SKIP) && yiHits(t).length) bad.push(fmt(ln, yiHits(t))); }
    } else if (YI_JS.test(f)) {
      const src = read(f), ast = parse(src), arr = src.split("\n");
      if (!ast) continue;
      const seen = new Set();
      const test = (value, loc) => {
        const ws = yiHits(value);
        if (!ws.length) return;
        for (let ln = loc.start.line; ln <= loc.end.line; ln++) {
          if (!lines.has(ln) || seen.has(ln) || (arr[ln - 1] || "").includes(YI_SKIP)) continue;
          seen.add(ln); bad.push(fmt(ln, ws)); break;
        }
      };
      walk(ast, n => {
        if (n.type === "Literal" && typeof n.value === "string") test(n.value, n.loc);
        else if (n.type === "TemplateElement") test(n.value.cooked || n.value.raw, n.loc);
      });
    }
  }
  return bad;
}
const git = args => spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
function parseDiff(text) { // git diff -U0 → Map 檔名 → Set(新加的行號)
  const m = new Map();
  let file = null;
  for (const l of text.split("\n")) {
    const f = l.match(/^\+\+\+ b\/(.+)$/);
    if (f) { file = f[1]; continue; }
    if (l.startsWith("+++ ")) { file = null; continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && file) { const s = +h[1], n = h[2] === undefined ? 1 : +h[2]; if (!m.has(file)) m.set(file, new Set()); for (let i = 0; i < n; i++) m.get(file).add(s + i); }
  }
  return m;
}
function resolveBase(base) {
  if (base) { const r = git(["rev-parse", "--verify", "-q", base + "^{commit}"]); return r.status === 0 ? r.stdout.trim() : null; }
  const o = git(["rev-parse", "--verify", "-q", "origin/main^{commit}"]);
  if (o.status !== 0) return null;
  const mb = git(["merge-base", "origin/main", "HEAD"]);
  return mb.status === 0 ? mb.stdout.trim() : null;
}
function addedLines(base) { // 回傳 Map，或 null（找不到基準）
  const b = resolveBase(base);
  if (!b) return null;
  const map = parseDiff(git(["diff", "-U0", "--no-color", "--no-renames", b]).stdout);
  for (const f of git(["ls-files", "-o", "--exclude-standard"]).stdout.split("\n").filter(Boolean)) { // 還沒 add 的新檔：整份都是新的
    try { const n = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length; map.set(f, new Set(Array.from({ length: n }, (_, i) => i + 1))); } catch (e) { /* 讀不到就略過 */ }
  }
  return map;
}

// ---------- 5. 名字只放一處 ----------
function tableNames(readText, table) {
  if (table === "CAS_MENU") {
    const m = readText("shared/casino/text.js").match(/export const CAS_MENU = \[([\s\S]*?)\n\];/);
    return m ? [...m[1].matchAll(/name: "([^"]+)"/g)].map(x => x[1]) : [];
  }
  if (table === "TASK_GIVERS") {
    const m = readText("shared/story.js").match(/export const TASK_GIVERS = \{([^}]*)\}/);
    return m ? [...m[1].matchAll(/:\s*"([^"]+)"/g)].map(x => x[1]) : [];
  }
  return [];
}
const NAME_SCOPE = f => /^(shared|web\/src|functions|tools|test)\/.*\.(js|cjs|mjs)$/.test(f) && !/^functions\/(shared|node_modules)\//.test(f) && !/^(tools\/check\/code_rules\.cjs|test\/tools\/code_rules\.test\.cjs)$/.test(f)
  || /^(AGENTS|README)\.md$/.test(f) || /^docs\/(?!決定\/).*\.md$/.test(f)
  || /^content\/[^/]*\.(md|json)$/.test(f) || /^content\/(npc|map|world|stocks)\//.test(f);
function checkNames(files, read = defaultRead, renames = RENAMES) {
  const bad = [];
  for (const r of renames) {
    const cur = tableNames(read, r.table);
    if (!cur.length) bad.push(`改名對照的表「${r.table}」讀不到（${r.old} → ${r.neu}）`);
    else if (!cur.some(n => n.includes(r.neu))) bad.push(`改名對照的新名「${r.neu}」不在 ${r.table} 裡了（又改名了？更新 tools/check/code_rules.cjs 的 RENAMES）`);
    if (cur.some(n => n.includes(r.old))) bad.push(`改名對照的舊名「${r.old}」又出現在 ${r.table} 裡了，從 RENAMES 拿掉`);
  }
  for (const f of files) {
    if (!NAME_SCOPE(f)) continue;
    const lines = read(f).split("\n");
    lines.forEach((l, i) => { for (const r of renames) if (l.includes(r.old)) bad.push(`${f}:${i + 1}：「${r.old}」已經改名叫「${r.neu}」（${r.when}）；名字只從 ${r.table} 來，不要在別處寫死舊名`); });
  }
  return bad;
}

// ---------- 主程式 ----------
const CHECKS = {
  1: { name: "shared/ 是純函式", run: (files, o) => checkPure(files, o.read) },
  2: { name: "無限動畫要在白名單", run: (files, o) => checkInfinite(files, o.read) },
  3: { name: ".replace(字串, 字串)", run: (files, o) => checkReplace(files, o.read) },
  4: { name: "新加的畫面文字用「壹」", run: (files, o) => { const a = addedLines(o.base); if (!a) { console.log("  （找不到 origin/main，第 4 項跳過；CI 會跑）"); return []; } return checkYi(a, o.read); } },
  5: { name: "名字只放一處（改名對照）", run: (files, o) => checkNames(files, o.read) },
};
function runAll(opts = {}) {
  const files = opts.files || gitFiles(), only = opts.only || Object.keys(CHECKS).map(Number), bad = [];
  for (const k of only) {
    const r = CHECKS[k].run(files, { read: opts.read || defaultRead, base: opts.base });
    console.log(`${r.length ? "✗" : "✓"} ${k}. ${CHECKS[k].name}${r.length ? `：${r.length} 個問題` : ""}`);
    bad.push(...r);
  }
  return bad;
}
if (require.main === module) {
  const a = process.argv.slice(2), val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const only = val("--only") ? val("--only").split(",").map(Number) : null;
  const bad = runAll({ base: val("--base"), only });
  if (bad.length) { bad.forEach(b => console.log("✗ " + b)); console.log(`${bad.length} 個問題`); process.exit(1); }
  console.log("程式的規矩：都對");
}
module.exports = { checkPure, checkInfinite, checkReplace, fixReplace, checkYi, checkNames, parseDiff, infiniteNames, yiHits, runAll, PURE_ALLOW, INFINITE_ALLOW, RENAMES, YI_RE };
