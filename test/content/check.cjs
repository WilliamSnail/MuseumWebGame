// Validator for shared/content.js（第 4 版：ES 模組，每個名字是 `export const 名字 = `）. Usage: node check.cjs [path-to-content.js]
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "..", "shared", "content.js");
const raw = fs.readFileSync(file, "utf8");
// 第 4 版：檔案是 ES 模組。內容檔不准 import，只准 `export const`；檢查前先拿掉 export，照舊當成一般程式檢查
if (/^\s*import\b/m.test(raw)) { console.error("content.js 不准 import"); process.exit(1); }
const src = raw.replace(/^export\s+/gm, "");

const NAMES = ["STORY_CHAPTERS", "FORBIDDEN_BOOKS", "NEW_EXHIBITS", "SAN_ASIDES", "COMMISSION_POOL", "CLIENTS",
  "CLIENT_COMMENTS", "VISITOR_COMMENTS", "HALL_THEME_TEXT", "MADNESS_TEXT", "QUIRK_TEXT", "INVOLUNTARY", "ENDINGS",
  "NEXT_VISITOR", "FIND_DIFF_TEXT", "TUTORIAL_TEXT", "ROOM_HINTS", "FAILED_WORK_TEXT", "PERFECT_WORK_TEXT", "HUG_TEXT",
  "MOOD_RECOVER_TEXT", "TITLE_TAGLINE", "FREE_MODE_TEXT"];

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// no imports / exports, plain script
if (/^\s*(import|export)\b/m.test(src)) err("file contains import/export"); // 上面已經拿掉 export，這裡抓的是寫錯位置的
for (const n of NAMES) {
  if (!new RegExp("^const " + n + " = ", "m").test(src)) err("missing top-level `const " + n + " = `");
}
const declared = [...src.matchAll(/^(const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[2]);
for (const d of declared) if (!NAMES.includes(d)) err("extra top-level declaration: " + d);

let C;
try {
  const ctx = vm.createContext({});
  vm.runInContext(src + "\n;globalThis.__C = {" + NAMES.join(",") + "};", ctx, { filename: file });
  C = ctx.__C;
} catch (e) {
  console.error("EVAL FAILED:", e.message);
  process.exit(1);
}

// ---- generic string checks ----
const EMOJI = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}]/u;
// common simplified-only characters (traditional forms differ)
const SIMPLIFIED = "个们这说时会来为发么门头见东还过对开进车书乐写买卖线红绿黄气画图馆长让选项种现样动后吗话认识读谁欢难观览记页题级稀奇传帽乐坐躺赞枕绒软刚硬尺寸材质填充愿运实际经历节点钥匙签灵感创宝贝谢问间级专广场护体锁边轻钟应该号兴准备头脑袋声响电脑网络带东为与么从仅众优伙传伤华单卫叶后听呢园团国场处备复够头夺奋宁宝实宽对导将专尔层岁岛币师帐干并广庆库应开异张弹归当录忆态总恋恶惊惯战户执扩扫扬换据采挥损击扑节苏范荣药获营么术机杀杂权条来极标树样桥梦检楼欧气汉没济灭灵热无爱犹狮猫环现电画畅疗盘睁矿码砖确礼种积称稳穷窗窃竞笔筑签简类级纪约纯纸纹线练组细织终经结给绝统继续维绿编缘网罗罚职联肃胜脑脸节芦苍虽虾见观规视览觉触计认让议讯记讲许论设访证评识诗试话该详语误说请诸课谁调谈谢谱贝负贡财责贤败货质贪购贯费贴贵贸贺资赏赛赢赶趋跃践踪轨轮软轻载较辆辈边达过运还这进远违连迟适选递逻遗邮钱铁银链锁错键长门闪闭问闯闲间闻阅队阳阴阶际陆陈险随隐难雾静须预领频题颜额风飞饭饮饰馆马驾骑骨鱼鸟鸡麦黄齐龙龟";
const SIMP_SET = new Set([...SIMPLIFIED].filter((ch) => !"帽坐躺枕尺寸材填充稀奇硬干并宁范匙感窗准袋伙呢骨".includes(ch)));
const strings = [];
function walk(v, p) {
  if (typeof v === "string") {
    strings.push([p, v]);
    if (!v.trim()) err("empty string at " + p);
    if (EMOJI.test(v)) err("emoji at " + p + ": " + v);
    for (const ch of v) if (SIMP_SET.has(ch)) err("simplified char '" + ch + "' at " + p + ": " + v);
    if (/[着]/.test(v)) err("'着' (use 著) at " + p);
    if (/這里|那里|哪里|心里|家里|夜里|眼里|手里/.test(v)) err("'里' (use 裡) at " + p);
    if (/\{(?!x\}|圖鑑格數\})/.test(v)) err("stray brace placeholder at " + p); // {圖鑑格數}：書裡由程式帶入真正的格數（11-08）
  } else if (Array.isArray(v)) {
    if (v.length === 0) err("empty array at " + p);
    v.forEach((x, i) => walk(x, p + "[" + i + "]"));
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) walk(v[k], p + "." + k);
  } else if (typeof v !== "number") {
    err("unexpected value type at " + p + ": " + typeof v);
  }
}
for (const n of NAMES) walk(C[n], n);

const len = (s) => [...s].length;
const isStr = (s) => typeof s === "string" && s.length > 0;
const keysExactly = (o, keys, p) => {
  if (!o || typeof o !== "object" || Array.isArray(o)) return err(p + " is not an object");
  const ks = Object.keys(o);
  for (const k of keys) if (!(k in o)) err(p + " missing key " + k);
  for (const k of ks) if (!keys.includes(k)) err(p + " has extra key " + k);
};

// ---- STORY_CHAPTERS ----
{
  const S = C.STORY_CHAPTERS;
  if (!Array.isArray(S) || S.length !== 3) err("STORY_CHAPTERS must have 3 chapters");
  const pageCounts = [5, 5, 5]; // 11-08：第壹、二章各多壹頁（起源室的故事線加長）
  (S || []).forEach((ch, i) => {
    const p = "STORY_CHAPTERS[" + i + "]";
    keysExactly(ch, ["id", "title", "spine", "pages"], p);
    if (ch.id !== i + 1) err(p + ".id should be " + (i + 1));
    if (!isStr(ch.title)) err(p + ".title");
    if (!isStr(ch.spine) || len(ch.spine) > 6) err(p + ".spine must be 1-6 chars: " + ch.spine);
    if (!Array.isArray(ch.pages) || ch.pages.length !== pageCounts[i]) err(p + ".pages must have " + pageCounts[i]);
    (ch.pages || []).forEach((pg, j) => {
      const lines = pg.split("\n");
      if (lines.length < 2 || lines.length > 5) err(p + ".pages[" + j + "] should have 2-5 lines, has " + lines.length);
      lines.forEach((l) => { if (!l.trim()) err(p + ".pages[" + j + "] has blank line"); if (len(l) > 30) warn(p + ".pages[" + j + "] line > 30: " + l); });
    });
  });
  const last = S[2].pages[S[2].pages.length - 1];
  if (!/博物館|展廳|館長/.test(last)) err("chapter 3 should end pointing toward curator/own museum");
}

// ---- FORBIDDEN_BOOKS ----
{
  const B = C.FORBIDDEN_BOOKS;
  // 翊文要理智歸零容易出現：禁書的理智檢定調重過（原本 0/1D4、1/1D6、1D3/1D8）
  const want = [["book1", "1/1D6", 2], ["book2", "1D3/1D8", 3], ["book3", "1D4/1D10", 4]];
  if (!Array.isArray(B) || B.length !== 3) err("FORBIDDEN_BOOKS must have 3");
  (B || []).forEach((b, i) => {
    const p = "FORBIDDEN_BOOKS[" + i + "]";
    keysExactly(b, ["id", "title", "spine", "lines", "san", "myth", "successAside", "failAside"], p);
    if (b.id !== want[i][0] || b.san !== want[i][1] || b.myth !== want[i][2]) err(p + " id/san/myth mismatch");
    if (!isStr(b.spine) || len(b.spine) > 6) err(p + ".spine 1-6 chars");
    if (!Array.isArray(b.lines) || b.lines.length !== 3) err(p + ".lines must be 3");
    for (const a of ["successAside", "failAside"]) if (!/^\(.+\)$/.test(b[a])) err(p + "." + a + " must be (…)");
  });
}

// ---- NEW_EXHIBITS ----
{
  const E = C.NEW_EXHIBITS;
  keysExactly(E, ["hidden", "russia8"], "NEW_EXHIBITS");
  for (const k of ["hidden", "russia8"]) {
    const e = E[k], p = "NEW_EXHIBITS." + k;
    keysExactly(e, ["title", "label", "lines", "successAside", "failAside", "lockedHint"], p);
    if (!Array.isArray(e.lines) || e.lines.length < 2 || e.lines.length > 4) err(p + ".lines 2-4");
    for (const a of ["successAside", "failAside"]) if (!/^\(.+\)$/.test(e[a])) err(p + "." + a + " must be (…)");
  }
  if (E.russia8.title !== "俄國8+9 的房間") err("russia8 title must be exactly 俄國8+9 的房間"); // 翊文 11-08：俄國8 改名俄國8+9
  if (E.russia8.lines.length !== 3) err("russia8 lines should be 3");
  if (E.hidden.lines.length !== 2) err("hidden lines should be 2");
  if (!/^觀看/.test(E.hidden.label)) err("hidden.label should start with 觀看");
}

// ---- SAN_ASIDES ----
{
  const A = C.SAN_ASIDES;
  keysExactly(A, ["strange", "statue", "habituated", "bottomedOut"], "SAN_ASIDES");
  keysExactly(A.strange, ["success", "fail"], "SAN_ASIDES.strange");
  keysExactly(A.statue, ["success"], "SAN_ASIDES.statue");
  for (const [p, v] of [["strange.success", A.strange.success], ["strange.fail", A.strange.fail], ["statue.success", A.statue.success], ["habituated", A.habituated], ["bottomedOut", A.bottomedOut]])
    if (!/^\(.+\)$/.test(v)) err("SAN_ASIDES." + p + " must be (…)");
  if (!/壹點/.test(A.statue.success)) err("statue.success should mention 壹點");
  if (/扣拾/.test(A.statue.success)) err("statue.success must not reuse gen-1 扣拾");
}

// ---- COMMISSION_POOL ----
const PEPE = {
  稀有度: ["普通", "稀有", "超稀有", "傳說級稀有", "不可名狀"],
  心情: ["開心", "傷心", "生氣", "俄國8+9"], // 翊文 11-08：俄國8 改名俄國8+9
  顏色: ["紅", "綠", "黃", "黑"],
  帽子: ["沒有", "棒球帽", "巫師帽", "皇冠", "觸手帽"],
  姿勢: ["站著", "坐著", "躺平", "比讚", "斯拉夫蹲"], // 翊文要的第 5 種姿勢
};
const PILLOW = { 尺寸: ["小抱枕", "標準", "等身大"], 材質: ["棉布", "絨毛", "桃皮絨"], 填充: ["軟綿綿", "剛剛好", "硬梆梆"] };
const FORBIDDEN = { 稀有度: "不可名狀", 帽子: "觸手帽" };
const START = { 稀有度: ["普通", "稀有"], 心情: ["開心", "傷心"], 顏色: ["紅", "綠"], 帽子: ["沒有", "棒球帽"], 姿勢: ["站著", "坐著"] };
const forbiddenUse = { 不可名狀: [], 觸手帽: [] };

function valueList(v) {
  if (typeof v === "string") return { mode: "in", list: [v] };
  if (Array.isArray(v)) return { mode: "in", list: v };
  if (v && typeof v === "object" && Object.keys(v).length === 1 && "not" in v) return { mode: "not", list: Array.isArray(v.not) ? v.not : [v.not] };
  return null;
}
function checkNeed(need, cats, p, id) {
  if (!need || typeof need !== "object" || Array.isArray(need) || !Object.keys(need).length) return err(p + " empty/invalid need");
  for (const [k, v] of Object.entries(need)) {
    if (k === "print") {
      if (cats !== PILLOW) { err(p + ".print only allowed on pillows"); continue; }
      checkNeed(v, PEPE, p + ".print", id);
      continue;
    }
    if (!(k in cats)) { err(p + " invalid key " + k); continue; }
    const vl = valueList(v);
    if (!vl || !vl.list.length) { err(p + "." + k + " invalid value shape"); continue; }
    for (const o of vl.list) {
      if (typeof o !== "string" || !cats[k].includes(o)) err(p + "." + k + " invalid option '" + o + "'");
      if (vl.mode === "in" && FORBIDDEN[k] === o) forbiddenUse[o].push(id);
    }
    if (vl.mode === "in" && new Set(vl.list).size !== vl.list.length) err(p + "." + k + " duplicate options");
    if (vl.mode === "not" && cats[k].filter((o) => !vl.list.includes(o)).length === 0) err(p + "." + k + " excludes everything");
  }
}
function solvableWith(need, opts) {
  return Object.entries(need).every(([k, v]) => {
    const vl = valueList(v);
    return opts[k].some((o) => (vl.mode === "in" ? vl.list.includes(o) : !vl.list.includes(o)));
  });
}
{
  const P = C.COMMISSION_POOL;
  const ids = new Set();
  const counts = { vague: 0, riddle: 0, pillow: 0 };
  const range = { vague: [5, 7], riddle: [8, 12], pillow: [8, 15] };
  let startRiddles = [], comboRiddles = [];
  P.forEach((c, i) => {
    const p = "COMMISSION_POOL[" + i + "](" + c.id + ")";
    keysExactly(c, ["id", "kind", "client", "text", "need", "reward", "comment"], p);
    if (ids.has(c.id)) err(p + " duplicate id");
    ids.add(c.id);
    if (!(c.kind in counts)) { err(p + " bad kind"); return; }
    counts[c.kind]++;
    const prefix = { vague: "v", riddle: "r", pillow: "p" }[c.kind];
    if (!c.id.startsWith(prefix)) err(p + " id prefix should be " + prefix);
    const [lo, hi] = range[c.kind];
    if (typeof c.reward !== "number" || c.reward < lo || c.reward > hi) err(p + " reward out of range " + lo + "-" + hi);
    checkNeed(c.need, c.kind === "pillow" ? PILLOW : PEPE, p + ".need", c.id);
    if (c.kind === "pillow" && Object.keys(c.need).filter((k) => k !== "print").length === 0) warn(p + " pillow need has no pillow attribute");
    if (c.kind === "riddle") {
      if (solvableWith(c.need, START)) startRiddles.push(c.id);
      if (Object.keys(c.need).length >= 2) comboRiddles.push(c.id);
    }
    if (len(c.text) > 30) warn(p + ".text > 30: " + c.text);
    if (len(c.comment) > 30) warn(p + ".comment > 30: " + c.comment);
  });
  for (const [o, used] of Object.entries(forbiddenUse)) {
    if (used.length > 1) err("forbidden option " + o + " used by more than one commission: " + used);
    for (const id of used) if (!id.startsWith("r")) err("forbidden option " + o + " used outside a riddle: " + id);
  }
  if (Math.abs(counts.vague - 12) > 1) err("vague count " + counts.vague + " (want ~12)");
  if (counts.riddle !== 16) err("riddle count " + counts.riddle + " (want 16)"); // 第 3 版多了 2 題
  if (counts.pillow !== 6) err("pillow count " + counts.pillow + " (want 6)");
  if (startRiddles.length < 3) err("need >= 3 riddles solvable with starting options, have " + startRiddles.length);
  if (comboRiddles.length < 3) err("need some two-attribute riddles");
  const ex = P.find((c) => c.id === "v1"), r1 = P.find((c) => c.id === "r1"), p1 = P.find((c) => c.id === "p1");
  if (!ex || ex.text !== "要一隻不開心的，什麼顏色都好。") err("v1 text changed");
  if (!r1 || r1.text !== "它看起來很想回家，但家在莫斯科。") err("r1 text changed");
  if (!p1 || p1.text !== "一個絨毛等身大、印傳說級佩佩的抱枕。") err("p1 text changed");
  console.log("commissions:", counts, "riddles solvable at start:", startRiddles.join(","), "| two-attr riddles:", comboRiddles.join(","));
  const vagueStart = P.filter((c) => c.kind === "vague" && solvableWith(c.need, START)).map((c) => c.id);
  console.log("vague solvable at start:", vagueStart.join(","));
}

// ---- CLIENTS / CLIENT_COMMENTS ----
if (!Array.isArray(C.CLIENTS) || C.CLIENTS.length !== 20) err("CLIENTS must be 20");
C.CLIENTS.forEach((c, i) => keysExactly(c, ["name", "note"], "CLIENTS[" + i + "]"));
if (new Set(C.CLIENTS.map((c) => c.name)).size !== C.CLIENTS.length) err("duplicate client names");
if (!Array.isArray(C.CLIENT_COMMENTS) || C.CLIENT_COMMENTS.length !== 20) err("CLIENT_COMMENTS must be 20");
if (new Set(C.CLIENT_COMMENTS).size !== C.CLIENT_COMMENTS.length) err("duplicate client comments");

// ---- VISITOR_COMMENTS ----
const THEMES = ["angry", "rainbow", "hats", "legend", "flat", "pillows", "russia8", "tears", "joy", "failed"];
{
  const V = C.VISITOR_COMMENTS;
  keysExactly(V, ["low", "mid", "high", "themes", "perfect", "eldritch"], "VISITOR_COMMENTS");
  const vc = (arr, n, p) => {
    if (!Array.isArray(arr) || arr.length !== n) return err(p + " must have " + n);
    arr.forEach((x, i) => keysExactly(x, ["who", "text"], p + "[" + i + "]"));
  };
  vc(V.low, 10, "VISITOR_COMMENTS.low");
  vc(V.mid, 10, "VISITOR_COMMENTS.mid");
  vc(V.high, 10, "VISITOR_COMMENTS.high");
  keysExactly(V.themes, THEMES, "VISITOR_COMMENTS.themes");
  for (const t of THEMES) vc(V.themes[t], 3, "VISITOR_COMMENTS.themes." + t);
  vc(V.perfect, 3, "VISITOR_COMMENTS.perfect");
  vc(V.eldritch, 3, "VISITOR_COMMENTS.eldritch");
  const all = [].concat(V.low, V.mid, V.high, V.perfect, V.eldritch, ...THEMES.map((t) => V.themes[t])).map((x) => x.text);
  if (new Set(all).size !== all.length) err("duplicate visitor comment texts");
}

// ---- HALL_THEME_TEXT ----
{
  const H = C.HALL_THEME_TEXT;
  keysExactly(H, THEMES, "HALL_THEME_TEXT");
  const names = { angry: "憤怒之廳", rainbow: "彩虹", hats: "帽子展", legend: "傳說殿堂", flat: "躺平區", pillows: "抱枕沙龍", russia8: "俄國8+9 特展", tears: "淚之廳", joy: "歡樂廳", failed: "失敗作回顧展" };
  for (const t of THEMES) {
    keysExactly(H[t], ["name", "wall"], "HALL_THEME_TEXT." + t);
    if (H[t].name !== names[t]) err("HALL_THEME_TEXT." + t + ".name must be " + names[t]);
  }
}

// ---- MADNESS_TEXT ----
{
  const M = C.MADNESS_TEXT;
  const names = ["失憶", "手抖", "暴走", "偏執", "想看起源", "昏倒", "驚慌逃跑", "情緒失控", "恐懼症", "收藏狂"];
  if (!Array.isArray(M) || M.length !== 10) err("MADNESS_TEXT must be 10");
  M.forEach((m, i) => {
    keysExactly(m, ["name", "start", "end"], "MADNESS_TEXT[" + i + "]");
    if (m.name !== names[i]) err("MADNESS_TEXT[" + i + "].name should be " + names[i]);
    if (i !== 8 && (/\{x\}/.test(m.start) || /\{x\}/.test(m.end))) err("MADNESS_TEXT[" + i + "] has {x} but should not");
  });
  if (!/\{x\}/.test(M[8].start)) err("MADNESS_TEXT[8].start needs {x}");
}

// ---- QUIRK_TEXT ----
{
  const Q = C.QUIRK_TEXT;
  keysExactly(Q, ["phobia", "mania"], "QUIRK_TEXT");
  for (const k of ["phobia", "mania"]) {
    keysExactly(Q[k], ["name", "gain", "cure"], "QUIRK_TEXT." + k);
    for (const f of ["name", "gain", "cure"]) if (!/\{x\}/.test(Q[k][f])) err("QUIRK_TEXT." + k + "." + f + " needs {x}");
  }
  if (Q.phobia.name !== "{x}恐懼症") err("phobia.name must be {x}恐懼症");
  if (Q.mania.name !== "{x}狂") err("mania.name must be {x}狂");
}

// ---- {x} must not appear outside madness[8] and quirks ----
for (const [p, s] of strings) {
  if (/\{x\}/.test(s) && !/^MADNESS_TEXT\[8\]|^QUIRK_TEXT/.test(p)) err("{x} in unexpected place " + p);
}

// ---- INVOLUNTARY ----
keysExactly(C.INVOLUNTARY, ["backout", "swap", "blink", "mumble"], "INVOLUNTARY");

// ---- ENDINGS ----
{
  const E = C.ENDINGS;
  keysExactly(E, ["curator", "russia8", "museum"], "ENDINGS");
  const titles = { curator: "館長", russia8: "俄國8+9 的房間", museum: "你的佩佩博物館" };
  for (const k of Object.keys(titles)) {
    keysExactly(E[k], ["title", "lines"], "ENDINGS." + k);
    if (E[k].title !== titles[k]) err("ENDINGS." + k + ".title must be " + titles[k]);
    if (!Array.isArray(E[k].lines) || E[k].lines.length < 6 || E[k].lines.length > 10) err("ENDINGS." + k + ".lines must be 6-10");
  }
}

// ---- small ones ----
if (!Array.isArray(C.NEXT_VISITOR) || C.NEXT_VISITOR.length !== 2) err("NEXT_VISITOR must be 2");
keysExactly(C.FIND_DIFF_TEXT, ["prompt", "success", "fail"], "FIND_DIFF_TEXT");
if (!Array.isArray(C.TUTORIAL_TEXT) || C.TUTORIAL_TEXT.length !== 3) err("TUTORIAL_TEXT must be 3");
if (!/畫廊/.test(C.TUTORIAL_TEXT[0]) || !/靈感/.test(C.TUTORIAL_TEXT[0])) err("TUTORIAL_TEXT[0] should mention 畫廊 and 靈感");
if (!/靈感/.test(C.TUTORIAL_TEXT[1]) || !/可能性/.test(C.TUTORIAL_TEXT[1])) err("TUTORIAL_TEXT[1] should mention 靈感 and 可能性");
if (!/手作坊/.test(C.TUTORIAL_TEXT[2]) || !/解鎖/.test(C.TUTORIAL_TEXT[2])) err("TUTORIAL_TEXT[2] should mention 手作坊 and 解鎖");
keysExactly(C.ROOM_HINTS, ["gallery", "origin", "workshop", "pillow", "commission", "codex", "hall", "library"], "ROOM_HINTS");
if (!Array.isArray(C.FAILED_WORK_TEXT) || C.FAILED_WORK_TEXT.length !== 5) err("FAILED_WORK_TEXT must be 5");
if (!Array.isArray(C.PERFECT_WORK_TEXT) || C.PERFECT_WORK_TEXT.length !== 3) err("PERFECT_WORK_TEXT must be 3");
if (!Array.isArray(C.HUG_TEXT) || C.HUG_TEXT.length !== 5) err("HUG_TEXT must be 5");
if (C.MOOD_RECOVER_TEXT !== "今天心情不錯") err("MOOD_RECOVER_TEXT must be exactly 今天心情不錯");
for (const n of ["TITLE_TAGLINE", "FREE_MODE_TEXT"]) if (typeof C[n] !== "string") err(n + " must be a string");

// ---- forbidden topics ----
for (const [p, s] of strings) {
  if (/4chan|meme|迷因|Pepe the Frog|川普|政治/i.test(s)) err("forbidden reference at " + p + ": " + s);
}

// ---- length report (placard brevity; story pages checked per line above) ----
for (const [p, s] of strings) {
  if (/^STORY_CHAPTERS.*pages/.test(p)) continue;
  if (len(s) > 30) warn("> 30 chars at " + p + " (" + len(s) + "): " + s);
}

let total = 0;
for (const [, s] of strings) total += len(s);
console.log("strings:", strings.length, "total chars:", total);
if (warns.length) console.log("\nWARNINGS (" + warns.length + "):\n  " + warns.join("\n  "));
if (errors.length) {
  console.log("\nERRORS (" + errors.length + "):\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("\nOK: all checks passed");
