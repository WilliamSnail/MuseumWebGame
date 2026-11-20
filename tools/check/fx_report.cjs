// 聲音和畫面特效的總表（翊文 11-16：「做一張聲音和畫面特效的總表，好追蹤和改進，自動產生並檢查」）
//   npm run fx:report            重新產生 docs/素材/音效與特效總表.md（並把新項目補進 content/fx_notes.json）
//   npm run fx:report -- --check 只檢查程式掃得出來、fx_notes.json 每個項目都有，缺了就結束碼 1（npm test 會跑）。總表本身不進 git（.gitignore），要看就跑上面那行
// 全部從程式掃出來：shared/sfx_files.js、web/src/fx/fx_sound.js（R、AMB）、ui_core.js（AMB_OF）、所有 web/src/*.js 的 snd／sndFile／fileOnce／fileLoop、
//   ui_mood.js、css、shared/room_mood.js、地下戰鬥特效。
// 「畫面特效」和「理智規則」是一張清單（下面 VFX、SAN_RULES），每項帶一個「標記」去程式裡找行號；標記找不到就報錯 → 改名或刪掉程式時會被抓到，要回來改這張清單。
// 翊文聽過沒、要不要調：寫在 content/fx_notes.json（不用改程式）。
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DOC = path.join(ROOT, "docs", "素材", "音效與特效總表.md");
const NOTES = path.join(ROOT, "content", "fx_notes.json");
const rd = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const cell = s => String(s === null || s === undefined ? "" : s).replace(/\|/g, "／").replace(/\r?\n/g, " ").trim();

// ---------- 解析小工具（test/tools/fx_report.test.cjs 會測） ----------
// 從 text 的 open（"(" 的位置）找到對應的 ")"，回傳括號裡的字（略過字串裡的括號）
function callArgs(text, open) {
  let depth = 0, q = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === "\\") i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1, open + 200);
}
// 最外層用逗號切開
function splitArgs(s) {
  const out = []; let depth = 0, q = null, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === "\\") { cur += s[++i] || ""; } else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; cur += ch; continue; }
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const strLits = s => [...String(s).matchAll(/(["'])([A-Za-z0-9_-]+)\1/g)].map(m => m[2]);
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

// 找 snd("名字", 音量)：回傳 [{ names, vol, line, dynamic }]（snd(cond ? "a" : "b") 兩個都算；名字不是字面（變數）就 dynamic）
function findSnd(text, known) {
  const out = [];
  for (const m of text.matchAll(/(?<![\w.$])snd\(/g)) {
    const open = m.index + m[0].length - 1, args = splitArgs(callArgs(text, open));
    if (!args.length) continue;
    let names = strLits(args[0]);
    if (known) names = names.filter(n => known.has(n));
    out.push({ names, vol: args[1] || "", line: lineOf(text, m.index), dynamic: !names.length, raw: args[0] });
  }
  return out;
}
// 找 sndFile("id", 音量)、FX.sound.file("id", 音量)
function findSndFile(text) {
  const out = [];
  for (const m of text.matchAll(/(?<![\w$])(?:sndFile|FX\.sound\.file)\(/g)) {
    const open = m.index + m[0].length - 1, args = splitArgs(callArgs(text, open));
    if (!args.length) continue;
    const ids = strLits(args[0]);
    out.push({ ids, vol: args[1] || "", line: lineOf(text, m.index), dynamic: !ids.length, raw: args[0] });
  }
  return out;
}
// 找環境音裡的 fileLoop(c, to, 'id', 音量)／fileOnce(c, to, 'id', 音量)
function findFileCalls(text) {
  const out = [];
  for (const m of text.matchAll(/(?<![\w$])(fileLoop|fileOnce)\(/g)) {
    const open = m.index + m[0].length - 1, args = splitArgs(callArgs(text, open));
    if (args.length < 3) continue;
    const ids = strLits(args[2]);
    out.push({ kind: m[1], ids, vol: args[3] || "", line: lineOf(text, m.index), dynamic: !ids.length || !/^["']/.test(args[2]), raw: args[2] });
  }
  return out;
}
// 這一行在哪個函式裡（往上找縮排比較少的 function／箭頭函式／方法）
function fnAt(lines, i) {
  const ind = s => s.match(/^\s*/)[0].length;
  const base = ind(lines[i]);
  for (let j = i - 1, lim = 0; j >= 0 && lim < 400; j--, lim++) {
    const s = lines[j];
    if (!s.trim() || ind(s) >= base && base > 0) continue;
    let m = s.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/) || s.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/) || s.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{\s*(?:\/\/.*)?$/);
    if (m && !/^(if|for|while|switch|catch|else|return)$/.test(m[1])) return m[1];
    if (ind(s) === 0 && /^\S/.test(s) && base === 0) break;
  }
  return "（頂層）";
}

// ---------- 讀程式 ----------
const webJsDeep = (d, rel = "") => fs.readdirSync(path.join(d, rel), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["css", "assets"].includes(e.name) ? [] : webJsDeep(d, rel ? rel + "/" + e.name : e.name)) : e.name.endsWith(".js") ? [rel ? rel + "/" + e.name : e.name] : []);
function webFiles() { return webJsDeep(path.join(ROOT, "web", "src")).sort(); } // web/src 有子資料夾（core/、fx/、rooms/、panels/）
const SRC = {};
function src(rel) { return SRC[rel] || (SRC[rel] = rd(rel)); }
function locOf(rel, re, what) {
  const lines = src(rel).split("\n");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return rel.replace(/^web\/src\//, "") + ":" + (i + 1);
  throw new Error("找不到標記：" + (what || re) + "（" + rel + "）。程式改名或刪了的話，回 tools/check/fx_report.cjs 改清單。");
}
// 一段註解（連續的 // 行）取第一句當說明
function commentAbove(lines, i) {
  const c = [];
  for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) c.unshift(lines[j].replace(/^\s*\/\/\s?/, ""));
  return c.filter(x => x && !/^[-=─ ]+/.test(x) && !/^-{2,}/.test(x));
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// fx.js 裡 `const R = {`、`const AMB = {` 的每一項（6 個空格開頭的 name(…) {）
function blocks(rel, startRe, endRe, entryRe) {
  const lines = src(rel).split("\n");
  const s = lines.findIndex(l => startRe.test(l)), e = lines.findIndex((l, i) => i > s && endRe.test(l));
  if (s < 0 || e < 0) throw new Error("找不到區塊 " + startRe + "（" + rel + "）");
  const heads = [];
  for (let i = s + 1; i < e; i++) { const m = lines[i].match(entryRe); if (m) heads.push({ name: m[1], i }); }
  return heads.map((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : e;
    // 下一項上面的註解屬於下一項，不算這一項的內容
    let endTrim = end; while (endTrim - 1 > h.i && /^\s*\/\//.test(lines[endTrim - 1])) endTrim--;
    const head = lines[h.i], tail = (head.match(/\{\s*\/\/\s*(.*)$/) || [])[1];
    const above = commentAbove(lines, h.i);
    const desc = tail || above.slice(0, 2).join(" ") || "";
    return { name: h.name, line: h.i + 1, desc: clip(desc, 90) || "（程式沒寫說明）", body: lines.slice(h.i, endTrim).join("\n"), startLine: h.i + 1 };
  });
}

function evalObj(text) { return new Function("return (" + text + ")")(); } // 只吃自己 repo 的程式碼

async function load() {
  const sfx = (await import("../../shared/sfx_files.js")).SFX_FILES;
  const rm = await import("../../shared/room_mood.js");
  const fightSfx = (await import("../../shared/fight_sfx.js")).FIGHT_SFX; // 地下打鬥的聲音表（11-16 補：以前沒掃，skill-reveal、war-drums-hit 被誤判沒人用）
  return { sfx, rm, fightSfx };
}

// ---------- 畫面特效清單（標記在程式裡找行號） ----------
// key＝fx_notes.json 的名字；find＝[檔, 標記 regex]；nums＝門檻在哪一處（說明文字，數字用 live 的）
const VFX = [
  // 房間效果（ui_mood.js 畫、shared/room_mood.js 算）
  { key: "rm-light", group: "房間效果", name: "燈光（暖／冷／暗）", find: ["web/src/fx/ui_mood.js", /rm-warmglow/], css: ["web/src/css/mood.css", /^\.rm-warmglow/], when: "大廳、銀行、賭場。散客氣氛好＝暖金、差＝冷藍；莊家吃緊／景氣差再壓暗", nums: m => `暖冷 RM.warm=${JSON.stringify(m.RM.warm)}；暗度＝吃緊×0.5＋景氣<−0.3 加 0.2，最多 0.7（shared/room_mood.js roomMood）` },
  { key: "rm-crowd", group: "房間效果", name: "人影（剪影小人）", find: ["web/src/fx/ui_mood.js", /silhouette\(/], css: ["web/src/css/mood.css", /^\.rm-crowd\b/], when: "大廳、賭場（銀行不畫）。展廳現在有人才出現，人越多越多", nums: m => `展廳 3～20 人畫 3～7 個、21～60 人 8～16 個、60 人以上 ${m.RM.crowdMax} 個（roomMood 裡）` },
  { key: "rm-bunting", group: "房間效果", name: "旗（政策紅金、活動青米）", find: ["web/src/fx/ui_mood.js", /function buntingSVG/], css: ["web/src/css/mood.css", /^\.rm-bunting\b/], when: "今天有本日政策或限時活動；兩個都有就兩種旗", nums: () => "沒有門檻（有就掛）；旗的種類在 roomMood 的 flags.bunting" },
  { key: "rm-omen", group: "房間效果", name: "怪影子（很淡、出現一下就沒）", find: ["web/src/fx/ui_mood.js", /function omenSVG/], css: ["web/src/css/mood.css", /^\.rm-omens\b/], when: "理智低的 NPC 多、集團人心不安；館友自己有黑影（跟著游標）或自己的理智效果時不出現", nums: m => `出現機率＝sanLow×0.12＋不安×0.08＋動盪×0.18（最多 1），低於 ${m.RM.omenMin} 就不出現；sanLow 指理智低於 ${m.RM.sanLow} 的 NPC` },
  { key: "rm-casino-chips", group: "房間效果", name: "賭場：籌碼塔", find: ["web/src/fx/ui_mood.js", /CAS_FX/], css: ["web/src/css/mood.css", /^\.rm-chips\b/], when: "賭場，跟熱鬧程度（heat 0～3）連動，越熱越高越多", nums: () => "heat 由 stat_view.js 的 crowdMood 分級；換算在 ui_mood.js 的 casinoFx（網址加 ?cas=chips 可單看）" },
  { key: "rm-casino-neon", group: "房間效果", name: "賭場：霓虹招牌", find: ["web/src/fx/ui_mood.js", /rm-neon/], css: ["web/src/css/mood.css", /^\.rm-neon\b/], when: "賭場；越熱閃越快（heat3 一圈 1.2 秒），冷清時一部分字熄掉", nums: () => "ui_mood.js casinoFx；樣式 mood.css .rm-neon" },
  { key: "rm-casino-smoke", group: "房間效果", name: "賭場：煙霧", find: ["web/src/fx/ui_mood.js", /rm-smoke/], css: ["web/src/css/mood.css", /^\.rm-smoke\b/], when: "賭場熱絡以上；畫在牌桌後面不擋介面", nums: () => "ui_mood.js casinoFx；樣式 mood.css .rm-smoke" },
  { key: "rm-casino-dealer", group: "房間效果", name: "賭場：荷官台詞", find: ["web/src/fx/ui_mood.js", /rm-dealer/], css: ["web/src/css/mood.css", /^\.rm-dealer\b/], when: "賭場，台詞依熱鬧程度 4 句（DEALER）", nums: () => "ui_mood.js 的 DEALER 陣列" },
  { key: "rm-chandelier", group: "房間效果", name: "賭場：吊燈／銀行：金色吊燈", find: ["web/src/fx/ui_mood.js", /rm-chandelier|rm-lamps/], css: ["web/src/css/mood.css", /^\.rm-chandelier\b/], when: "賭場、銀行常駐，燈暗（吃緊、景氣差）時壓低", nums: () => "mood.css 的 calc(…--rm-dim…)" },
  { key: "rm-rooms", group: "房間效果", name: "大廳導覽圖的各房間熱絡（外框亮、小人影、人數牌）", find: ["web/src/fx/ui_mood.js", /rm-rglow/], css: ["web/src/css/mood.css", /^\.rm-rglow\b/], when: "大廳導覽圖，每間房現在有幾位館友", nums: m => `房間人數 ${m.RM.roomLv.join("、")} 人＝1、2、3 級；展廳乘 ${m.RM.roomScale.hall}（shared/room_mood.js RM.roomLv、roomScale、roomHeats）` },
  // 館友自己的理智效果
  { key: "san-lights-out", group: "理智效果", name: "熄燈（lights-out）", find: ["web/src/core/ui_core.js", /"lights-out"/], css: ["web/src/css/theme3.css", /^body\.lights-out #lights/], when: "理智歸零（P.dark）：整個畫面變黑，只有游標附近有光；房間效果全部收起", nums: () => "P.dark（ui_core.js applyBodyState）" },
  { key: "san-bout", group: "理智效果", name: "瘋狂發作（bout、暈邊、手抖）", find: ["web/src/core/ui_core.js", /classList\.toggle\("bout"/], css: ["web/src/css/ui.css", /^body\.bout #vignette/], when: "擲到瘋狂發作時：畫面邊緣發暗、發作中顯示晶片、部分類型卡片手抖", nums: () => "boutFlow（ui_core.js）擲 1D10 查表；效果 body.bout、body.bout-N" },
  { key: "san-faint", group: "理智效果", name: "昏倒（faint）", find: ["web/src/core/ui_core.js", /classList\.add\("faint"\)/], css: ["web/src/css/ui.css", /^body\.faint/], when: "發作第 5 種：房間、導覽、狀態列淡出 1.3 秒再回大廳", nums: () => "boutFlow 裡 i === 5" },
  { key: "san-flee", group: "理智效果", name: "逃跑（flee）", find: ["web/src/core/ui_core.js", /classList\.add\("flee"\)/], css: ["web/src/css/ui.css", /^body\.flee/], when: "發作第 6 種：房間往左滑出去再回大廳", nums: () => "boutFlow 裡 i === 6" },
  { key: "san-odd-flip", group: "理智效果", name: "你一轉頭，畫就變了（odd-flipped）", find: ["web/src/rooms/ui_odd.js", /odd-flipped/], css: ["web/src/css/theme3.css", /^.frame.odd-h/], when: "畫廊裡，游標離開畫時 35% 機率左右或上下翻過來", nums: () => `ODD_AT.flip（ui_odd.js）＝${oddAt().flip}：理智低於這個才會發生` },
  { key: "san-odd-follow", group: "理智效果", name: "有東西跟著游標（odd-follower）", find: ["web/src/rooms/ui_odd.js", /odd-follower/], css: ["web/src/css/theme3.css", /^\.odd-follower \{/], when: "壹個淡淡的黑色佩佩影子慢慢追著游標，追上會低語", nums: () => `ODD_AT.follow＝${oddAt().follow}；越低越明顯` },
  { key: "san-odd-talk", group: "理智效果", name: "按鈕在跟你說話（odd talk）", find: ["web/src/rooms/ui_odd.js", /ODD_LINES/], css: ["web/src/css/theme3.css", /^.btn.odd-talking/], when: "游標移到按鈕上，字偶爾亂碼成別句，1.6 秒後變回來（功能照常）", nums: () => `ODD_AT.talk＝${oddAt().talk}` },
  // FX 工具（fx.js）
  { key: "fxt-floatText", group: "畫面工具", name: "飄字（FX.floatText）", find: ["web/src/fx/fx_misc.js", /function floatText/], css: ["web/src/css/fx.css", /^\.fx-float \{/], when: "數字變動時從目標往上飄（好綠、壞紅）", nums: () => "tone：good／bad／neutral" },
  { key: "fxt-rollOverlay", group: "畫面工具", name: "擲骰彈窗（FX.rollOverlay）", find: ["web/src/fx/fx_dice.js", /function rollOverlay/], css: ["web/src/css/fx.css", /^\.fx-roll-title/], when: "所有要擲骰的地方（理智檢定、發作、下一位參觀者…），可帶結果音效 outcome.sound", nums: () => "骰盤 createDiceTray；骰子聲 R.dice" },
  { key: "fxt-goldDust", group: "畫面工具", name: "金粉（FX.goldDust）", find: ["web/src/fx/fx_misc.js", /function goldDust/], css: ["web/src/css/fx.css", /^\.fx-dust/], when: "稀有、傳說的開箱等慶祝處", nums: () => "預設 2.5 秒；顏色 DUST 陣列" },
  { key: "fxt-countTo", group: "畫面工具", name: "數字滾動（FX.countTo、里程表）", find: ["web/src/fx/fx_misc.js", /function countTo/], css: ["web/src/css/fx.css", /^\.fx-odo \{/], when: "金額、分數變動的數字" , nums: () => "" },
  { key: "fxt-toast", group: "畫面工具", name: "提示條（FX.toast）", find: ["web/src/fx/fx_misc.js", /function toast/], css: ["web/src/css/fx.css", /^\.fx-toast \{/], when: "角落的短訊息", nums: () => "" },
  { key: "fxt-spotlight", group: "畫面工具", name: "聚光導覽（FX.spotlight）", find: ["web/src/fx/fx_misc.js", /function spotlight\(/], css: ["web/src/css/fx.css", /^\.fx-spot \{/], when: "新手導覽，把一塊畫面圈亮其餘壓暗", nums: () => "" },
  { key: "fxt-drag", group: "畫面工具", name: "拖放（makeDraggable／makeDropTarget）", find: ["web/src/fx/fx_drag.js", /function makeDraggable/], css: ["web/src/css/fx.css", /^\.fx-ghost/], when: "拖卡片、拖物品", nums: () => "" },
  { key: "fxt-press", group: "畫面工具", name: "按下去的小動作（FX.press）", find: ["web/src/fx/fx_misc.js", /function press\(/], css: ["web/src/css/fx.css", /^\.fx-press/], when: "按鈕按下時微縮", nums: () => "" },
];
let _odd = null;
function oddAt() {
  if (_odd) return _odd;
  const m = src("web/src/rooms/ui_odd.js").match(/export const ODD_AT = (\{[^}]*\})/);
  return (_odd = m ? evalObj(m[1]) : {});
}

// 理智、聲音規則（標記在程式裡找行號）
const SAN_RULES = [
  { key: "snd-heart", name: "心跳", find: ["web/src/fx/fx_sound.js", /const heartGap/], when: "理智 30 以下：心跳，越低越快越大聲（歸零前）", nums: () => "heartGap：>20 每 1050ms、>10 每 780ms、其餘 560ms；heartK 音量 0.45～1（fx.js）" },
  { key: "snd-unease", name: "不安的低鳴", find: ["web/src/core/ui_core.js", /S\.unease\(/], when: "理智 40 以下，越低越明顯", nums: () => "unease＝(40−理智)/40（ui_core.js audioState）" },
  { key: "snd-tinnitus", name: "耳鳴", find: ["web/src/core/ui_core.js", /S\.tinnitus\(/], when: "瘋狂發作中", nums: () => "P.bout（ui_core.js audioState）" },
  { key: "snd-dread", name: "理智低的恐怖音樂（horror-low／horror-edge）", find: ["web/src/core/ui_core.js", /S\.dread\(/], when: "理智 < 45 疊 horror-low；≤ 15（含歸零）換 horror-edge；進 15 以下響一次 pulse-rise", nums: m => `SAN_DREAD＝${JSON.stringify(m.SAN_DREAD)}、sanDread()（shared/room_mood.js）` },
  { key: "snd-whisper", name: "低語層數", find: ["web/src/core/ui_core.js", /export const whisperLayers/], when: "理智越低，低語疊越多層（R.whisper）", nums: () => "50 以上 2 層；40–49：3；30–39：4；20–29：5；10–19：6；1–9：7；0：8（ui_core.js whisperLayers）" },
  { key: "snd-zero", name: "理智歸零的遠處低音鼓", find: ["web/src/core/audio_state.js", /amb = "zero"/], when: "理智歸零（P.dark）時環境音換成 AMB.zero", nums: () => "P.dark" },
  { key: "snd-mix-casino", name: "賭場的熱鬧連動環境音（ambMix）", find: ["web/src/core/ui_core.js", /ambMix\(mix\[1\]\.heat\)/], when: "賭場開著時每 30 秒照熱鬧程度調人聲音量、籌碼聲間隔", nums: m => "AMB_MIX（見 3-5）" },
];

// ---------- 組總表 ----------
function noteCols(notes, key) {
  const n = notes[key] || {};
  return `${n.heard ? cell(n.heard) : ""} | ${n.note ? cell(n.note) : ""}`;
}

async function build(notes) {
  const { sfx, rm, fightSfx } = await load();
  const sfxIds = Object.keys(sfx);
  const files = webFiles().map(f => "web/src/" + f);
  const keys = []; // 這份總表會用到的 fx_notes 名字（給「補新項目」用）

  // --- R（合成音效） ---
  const R = blocks("web/src/fx/fx_sound.js", /^    const R = \{/, /^    \};/, /^      ([A-Za-z_][\w]*)\(t[,)]/);
  const Rnames = new Set(R.map(r => r.name));
  // --- AMB（環境音） ---
  const AMB = blocks("web/src/fx/fx_sound.js", /^    const AMB = \{/, /^    \};/, /^      ([A-Za-z_]\w*)\(c, g(?:, own)?\)/);

  // --- 觸發點 ---
  const T = { snd: {}, file: {}, dynSnd: [], dynFile: [], unreg: [] }; // name → [{file,line,fn,vol,note}]
  const add = (bucket, k, row) => ((bucket[k] = bucket[k] || []).push(row));
  for (const rel of files) {
    const text = src(rel), lines = text.split("\n"), short = rel.replace("web/src/", "");
    const isFx = rel === "web/src/fx/fx_sound.js";
    for (const x of findSnd(text, Rnames)) {
      if (/^\s*export const snd = /.test(lines[x.line - 1])) continue;
      if (x.dynamic) { if (!/^\w+$/.test(x.raw) || x.raw !== "n") T.dynSnd.push({ file: short, line: x.line, fn: fnAt(lines, x.line - 1), raw: x.raw }); continue; }
      for (const n of x.names) add(T.snd, n, { file: short, line: x.line, fn: fnAt(lines, x.line - 1), vol: x.vol });
    }
    for (const x of findSndFile(text)) {
      if (/export const sndFile = /.test(lines[x.line - 1])) continue;
      if (x.dynamic) { T.dynFile.push({ file: short, line: x.line, fn: fnAt(lines, x.line - 1), raw: x.raw }); continue; }
      for (const id of x.ids) { add(T.file, id, { file: short, line: x.line, fn: fnAt(lines, x.line - 1), vol: x.vol }); if (!sfx[id]) T.unreg.push({ id, file: short, line: x.line }); }
    }
    if (isFx) {
      for (const m of text.matchAll(/(?<![\w$.])(?:sound|FX\.sound)\.play\((["'])(\w+)\1/g)) add(T.snd, m[2], { file: short, line: lineOf(text, m.index), fn: fnAt(lines, lineOf(text, m.index) - 1), vol: "", note: "fx.js 內部" });
      for (const m of text.matchAll(/(?<![\w$.])R\.([A-Za-z_]\w*)\(/g)) if (Rnames.has(m[1])) add(T.snd, m[1], { file: short, line: lineOf(text, m.index), fn: fnAt(lines, lineOf(text, m.index) - 1), vol: "", note: "fx.js 內部（R." + m[1] + "）" });
    }
    // sound: "name"（rollOverlay 的結果音）
    for (const m of text.matchAll(/\bsound:\s*(["'])(\w+)\1/g)) if (Rnames.has(m[2])) add(T.snd, m[2], { file: short, line: lineOf(text, m.index), fn: fnAt(lines, lineOf(text, m.index) - 1), vol: "", note: "sound: 結果音" });
  }
  // 地下打鬥聲音表（shared/fight_sfx.js 的 FIGHT_SFX）：file 欄算音效檔的使用處、snd 欄算合成音的使用處
  const fightLines = src("shared/fight_sfx.js").split("\n");
  const fightKeys = Object.keys(fightSfx);
  for (const k of fightKeys) {
    const e = fightSfx[k], at = fightLines.findIndex(l => l.includes(JSON.stringify(k) + ":") || l.startsWith("  " + k + ":")) + 1;
    const row = { file: "shared/fight_sfx.js", line: at, fn: "FIGHT_SFX[" + k + "]", vol: e.g !== undefined ? String(e.g) : "", note: "打鬥聲音表" };
    if (e.file) { add(T.file, e.file, row); if (!sfx[e.file]) T.unreg.push({ id: e.file, file: "shared/fight_sfx.js", line: at }); }
    if (e.snd) { if (Rnames.has(e.snd)) add(T.snd, e.snd, { ...row, vol: "" }); else T.unreg.push({ id: e.snd + "（合成音）", file: "shared/fight_sfx.js", line: at }); }
  }
  // 環境音裡的檔案
  const fxText = src("web/src/fx/fx_sound.js");
  const ambFile = {}; // AMB 名 → [{kind,id,vol}]
  for (const a of AMB) {
    const calls = findFileCalls(a.body), list = [];
    for (const c of calls) {
      if (c.dynamic) continue;
      for (const id of c.ids) { list.push({ kind: c.kind === "fileLoop" ? "循環" : "偶爾", id, vol: c.vol }); add(T.file, id, { file: "fx_sound.js", line: a.startLine + c.line - 1, fn: "AMB." + a.name, vol: c.vol, note: c.kind }); if (!sfx[id]) T.unreg.push({ id, file: "fx_sound.js", line: a.startLine + c.line - 1 }); }
    }
    // 表裡的 id（FLOOR、SUSP、odd 清單這種沒直接呼叫的）
    const seen = new Set(list.map(x => x.id));
    for (const id of strLits(a.body)) if (sfx[id] && !seen.has(id)) { seen.add(id); list.push({ kind: "表裡", id, vol: "" }); add(T.file, id, { file: "fx_sound.js", line: a.startLine, fn: "AMB." + a.name, vol: "", note: "（表裡的 id，音量看表）" }); }
    ambFile[a.name] = list;
  }
  // 環境音以外的 fx.js 檔案呼叫（dreadMusic 等）
  const outAmb = fxText.split("\n");
  for (const m of fxText.matchAll(/(?<![\w$])dreadMusic\(c, (["'])([\w-]+)\1, ([^)]+)\)/g)) {
    const ln = lineOf(fxText, m.index);
    if (sfx[m[2]]) add(T.file, m[2], { file: "fx_sound.js", line: ln, fn: fnAt(outAmb, ln - 1), vol: m[3].trim(), note: "dreadMusic" });
  }
  // 其他檔裡直接引用到的 id（引號字串，且不在上面已經有觸發的）：算「用到」
  const quotedAt = {};
  for (const rel of files) {
    const t = src(rel);
    for (const id of sfxIds) { const re = new RegExp("[\"']" + id.replace(/[-]/g, "\\-") + "[\"']"); if (re.test(t)) (quotedAt[id] = quotedAt[id] || []).push(rel.replace("web/src/", "")); }
  }
  const sfxUsed = id => !!(T.file[id] || quotedAt[id]);
  // R 有沒有人用：直接呼叫，或在 snd／sound／play 的行裡被引用
  const weakR = {};
  for (const rel of files) {
    const lines = src(rel).split("\n");
    lines.forEach((l, i) => { if (!/snd|sound|play|sfx/i.test(l)) return; for (const n of Rnames) if (new RegExp("[\"']" + n + "[\"']").test(l)) (weakR[n] = weakR[n] || []).push(rel.replace("web/src/", "") + ":" + (i + 1)); });
  }
  const rUsed = n => !!(T.snd[n] || weakR[n]);

  const unusedSfx = sfxIds.filter(id => !sfxUsed(id));
  const withNote = id => (notes[id] && notes[id].note ? "（" + cell(notes[id].note) + "）" : "");
  const unusedSfxText = unusedSfx.map(id => id + withNote(id)).join("、");
  const fightTodo = fightKeys.filter(k => fightSfx[k].todo), fightSynth = fightKeys.filter(k => fightSfx[k].snd && !fightSfx[k].file);
  const unusedR = [...Rnames].filter(n => !rUsed(n));
  const unreg = [...new Map(T.unreg.map(x => [x.id + x.file + x.line, x])).values()];

  // --- 計數 ---
  const trigCount = Object.values(T.snd).reduce((s, a) => s + a.length, 0) + Object.values(T.file).reduce((s, a) => s + a.length, 0);
  const vfxRows = VFX.map(v => ({ ...v, where: locOf(...v.find, v.key), cssWhere: v.css ? locOf(v.css[0], v.css[1], v.key + " css") : "" }));
  // 地下戰鬥特效
  const fightCss = src("web/src/css/fight.css").split("\n");
  const fightFx = [];
  fightCss.forEach((l, i) => {
    const m = l.match(/^\.fg-fx\.k-(\w+) \{[^}]*url\(\/cellar2\/(fx-[\w-]+\.webp)\)/);
    if (!m) return;
    const st = l.match(/steps\((\d+)/), ms = l.match(/fg-fx (\d+)ms/);
    const p = path.join(ROOT, "web", "public", "cellar2", m[2]);
    fightFx.push({ kind: m[1], file: m[2], frames: st ? st[1] : "", ms: ms ? ms[1] : "", line: i + 1, kb: fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1024) : null });
  });
  const FIGHT_USE = {
    push: "推（把怪推開）", see: "看穿", san: "理智受衝擊", stamp: "印記（完美招式）", calm: "安撫", guard: "擋", brave: "鼓舞（膽量）", grow: "成長", flee: "逃跑／撤退", phase: "守門進第二階段",
  };
  const fightUse = locOf("web/src/rooms/ui_fight.js", /export const fightFx/, "fightFx");
  const fightFxNames = new Set(); fightFx.forEach(x => fightFxNames.add(x.kind));
  const fightFxInJs = (src("web/src/rooms/ui_fight.js").match(/const FX_ART = (\{[^}]*\})/) || [])[1];
  const fightArt = fightFxInJs ? evalObj(fightFxInJs) : {};
  const fxToolNames = [...((src("web/src/fx/fx.js").match(/Object\.assign\(api, \{([\s\S]*?)\n\}\);/) || [, ""])[1].matchAll(/^  (\w+)\s*[:,]/gm))].map(m => m[1]);

  // --- 環境音表 ---
  const floorLines = src("web/src/fx/fx_sound.js").split("\n");
  const fs0 = floorLines.findIndex(l => /^\s*const FLOOR = \{/.test(l)), fe0 = floorLines.findIndex((l, i) => i > fs0 && /^\s*\};/.test(l));
  const FLOOR = [];
  for (let i = fs0 + 1; i < fe0; i++) {
    const m = floorLines[i].match(/^\s*(\w+): (\{.*\}),?\s*(?:\/\/\s*(.*))?$/);
    if (m) FLOOR.push({ floor: m[1], o: evalObj(m[2]), note: m[3] || "", line: i + 1 });
  }
  const modeLine = floorLines.findIndex(l => /^\s*const MODE = /.test(l));
  const MODE = evalObj(floorLines[modeLine].replace(/^\s*const MODE = /, "").replace(/;\s*(\/\/.*)?$/, ""));
  const modeNote = { map: "看地圖、選路", explore: "房間探索", fight: "遇到怪物", gate: "守門", gate2: "守門第二階段", rest: "休息點" };
  const ambOfSrc = (src("web/src/core/ui_core.js").match(/export const AMB_OF = \{([\s\S]*?)\};/) || [, ""])[1];
  const AMB_OF = [...ambOfSrc.matchAll(/(\w+): ("[^"]*"|null)/g)].map(m => [m[1], m[2] === "null" ? "（不放）" : m[2].slice(1, -1)]);
  const ambRules = [];
  src("web/src/core/ui_core.js").split("\n").forEach((l, i, a) => { if (/\bamb = /.test(l) && /(let|if|\b)\s*amb = /.test(l) && i > 380 && i < 440) ambRules.push({ line: i + 1, text: clip(l.trim().replace(/\s*\/\/.*$/, ""), 170) }); });

  // --- 銀行空檔（ui_bank.js 的 bankSfx） ---
  const bankLines = src("web/src/rooms/bank/ui_bank.js").split("\n");
  const bankSets = {};
  bankLines.forEach((l, i) => { const m = l.match(/^const (BANK_SFX_\w+) = new Set\(\[(.*)\]\)/); if (m) bankSets[m[1]] = { items: [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]), line: i + 1, note: (l.match(/\/\/\s*(.*)$/) || [])[1] || "" }; });
  const bankSlots = [];
  bankLines.forEach((l, i) => { const m = l.match(/(BANK_SFX_\w+)\.has\(k\)\) sndFile\((["'])([\w-]+)\2, ([\d.]+)\)/); if (m) bankSlots.push({ set: m[1], id: m[3], vol: m[4], line: i + 1 }); });

  // --- 輸出 ---
  const o = [];
  const sec = (t) => o.push("", t, "");
  const nCols = " 翊文聽過 | 要調 |";
  const Rrows = R.length, Arows = AMB.length;
  const fxNeed = [];

  o.push("# 聲音和畫面特效總表", "",
    "> 這份是 `npm run fx:report` 產生的，**不要手改**。聽過了沒、要調什麼，寫在 `content/fx_notes.json`（格式見下面），下次跑 `npm run fx:report` 會進表。",
    "> 這份**不進 git**（.gitignore）：要看就在本機跑 `npm run fx:report`。`npm test` 只檢查「程式掃得出來、`content/fx_notes.json` 每一項都有」（`npm run fx:report -- --check`），缺了就跑一次 `npm run fx:report`。", "");

  // 摘要
  const heardN = (ks) => ks.filter(k => notes[k] && notes[k].heard).length;
  o.push("## 白話摘要", "",
    `- 音效檔（Pixabay 錄音，\`web/public/sfx/\`）：**${sfxIds.length}** 個；循環的 ${sfxIds.filter(i => sfx[i].loop).length} 個。`,
    `- 合成音效（程式即時合成，沒有檔案）：**${Rrows}** 種。`,
    `- 環境音／背景樂：**${Arows}** 個房間（${AMB.map(a => a.name).join("、")}）；地下另外照 ${FLOOR.length} 種樓層 × ${Object.keys(MODE).length} 種狀態換聲音。`,
    `- 觸發點：**${trigCount}** 處（合成音 ${Object.values(T.snd).reduce((s, a) => s + a.length, 0)} 處、音效檔 ${Object.values(T.file).reduce((s, a) => s + a.length, 0)} 處），另有 ${T.dynSnd.length + T.dynFile.length} 處名字放在變數裡（動態，見後面）。`,
    `- 畫面特效：**${vfxRows.length}** 項（房間效果 ${vfxRows.filter(v => v.group === "房間效果").length}、理智效果 ${vfxRows.filter(v => v.group === "理智效果").length}、畫面工具 ${vfxRows.filter(v => v.group === "畫面工具").length}），另有地下戰鬥特效 ${fightFx.length} 種。`,
    `- **沒人用的**：音效檔 ${unusedSfx.length} 個${unusedSfx.length ? "（" + unusedSfxText + "）" : ""}；合成音 ${unusedR.length} 種${unusedR.length ? "（" + unusedR.join("、") + "）" : ""}。`,
    `- **還在用合成音、之後要找錄音的：${fightTodo.length} 項**（地下打鬥的聲音，見第 7 節；royalty free 找到後放進 FIGHT_SFX 的 file 欄）。`,
    `- **用了卻沒登記的** 音效檔 id：${unreg.length} 個${unreg.length ? "（" + [...new Set(unreg.map(x => x.id))].join("、") + "）" : ""}。`,
    "", "### 加新音效", "",
    "從 Pixabay 下載 mp3 後，一個指令做完壓縮、登記、備份原檔（細節看 `tools/assets/sfx_add.cjs` 最上面）：", "",
    "```", 'npm run sfx:add -- "<下載的 mp3 路徑>" --id <英文id> --use "用在哪" [--loop] [--trim 起:迄秒] [--fadeout 秒] [--lufs -24] [--kbps 80] [--stereo] [--url <Pixabay 網址>] [--name "原名"] [--by 作者]', "```", "",
    "跑完照它印的提示在程式裡呼叫 `sndFile(\"<id>\", 音量)`（畫面）或 `fileLoop`／`fileOnce`（環境音，在 `web/src/fx/fx_sound.js`），最後 `npm run fx:report`。", "",
    "### 聽過／要調怎麼記", "",
    "`content/fx_notes.json`：`{ \"<音效檔 id、合成音名字、房間名或畫面特效名>\": { \"heard\": \"2026-11-16\" 或 null, \"note\": \"太大聲…\" 或 null } }`。每個項目已經先放好（null）。",
    `目前翊文聽過：音效檔 ${heardN(sfxIds)}／${sfxIds.length}、合成音 ${heardN([...Rnames])}／${Rrows}、房間背景 ${heardN(AMB.map(a => "amb:" + a.name))}／${Arows}。有寫「要調」的：${Object.entries(notes).filter(([, v]) => v && v.note).length} 項。`);

  // 1 音效檔
  sec("## 1. 音效檔（Pixabay）");
  o.push("來源：`shared/sfx_files.js`（人看的版本在 `web/public/sfx/來源.md`）。「呼叫處」是第 4 節觸發點裡找得到的處數；環境音表裡引用的算在「環境音」。", "",
    "| id | 原名 | 作者 | 用在 | 循環 | 大小 KB | 呼叫處 | 環境音 |" + nCols, "|---|---|---|---|---|---|---|---|---|---|");
  for (const id of sfxIds) {
    keys.push(id);
    const x = sfx[id], p = path.join(ROOT, "web", "public", "sfx", id + ".mp3");
    const kb = fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1024) : "（檔案不在）";
    const calls = (T.file[id] || []).filter(r => !/^AMB\./.test(r.fn) && r.note !== "dreadMusic");
    const amb = [...new Set((T.file[id] || []).filter(r => /^AMB\./.test(r.fn) || r.note === "dreadMusic").map(r => r.fn === "(頂層)" || !/^AMB\./.test(r.fn) ? "dread" : r.fn.replace("AMB.", "")))];
    o.push(`| ${id} | [${cell(x.name)}](${x.url}) | ${cell(x.by)} | ${cell(x.use)} | ${x.loop ? "循環" : ""} | ${kb} | ${calls.length} | ${cell(amb.join("、") || (quotedAt[id] && !calls.length ? "（引號字串）" : ""))} | ${noteCols(notes, id)} |`);
  }

  // 2 合成
  sec("## 2. 合成音效（`web/src/fx/fx_sound.js` 的 `const R`）");
  o.push("全部程式即時合成，沒有檔案。用 `snd(\"名字\")` 呼叫。「呼叫處」是第 4 節找得到的處數。", "",
    "| 名字 | 說明（程式註解） | 在 | 呼叫處 |" + nCols, "|---|---|---|---|---|---|");
  for (const r of R) { keys.push(r.name); o.push(`| ${r.name} | ${cell(r.desc)} | fx_sound.js:${r.line} | ${(T.snd[r.name] || []).length}${!T.snd[r.name] && weakR[r.name] ? "（字串引用）" : ""} | ${noteCols(notes, r.name)} |`); }

  // 3 環境音
  sec("## 3. 環境音／背景樂");
  o.push("### 3-1. 各房間（`web/src/fx/fx_sound.js` 的 `const AMB`）", "",
    "「用到的檔」＝ `fileLoop`（一直循環）／`fileOnce`（偶爾播一次）的 id 和音量；「間隔」＝ 程式裡 `rand(a, b)` 排程的秒數；其他（和弦、人聲、腳步）是合成的。", "",
    "| 房間 | 說明 | 在 | 用到的檔（音量） | 間隔（秒） |" + nCols, "|---|---|---|---|---|---|---|");
  for (const a of AMB) {
    keys.push("amb:" + a.name);
    const fl = ambFile[a.name].map(x => `${x.kind} ${x.id}${x.vol ? " " + x.vol.replace(/\s+/g, "") : ""}`);
    const iv = [...a.body.matchAll(/\(\)\s*=>\s*rand\((\d+),\s*(\d+)\)/g)].map(m => `${+m[1] / 1000}～${+m[2] / 1000}`);
    o.push(`| ${a.name} | ${cell(a.desc)} | fx_sound.js:${a.line} | ${cell(fl.join("；"))} | ${cell([...new Set(iv)].join("；"))} | ${noteCols(notes, "amb:" + a.name)} |`);
  }
  o.push("", "### 3-2. 哪個畫面放哪一個（`web/src/core/ui_core.js` 的 `AMB_OF`）", "", "| 畫面 | 環境音 |", "|---|---|");
  for (const [k, v] of AMB_OF) o.push(`| ${k} | ${v} |`);
  o.push("", "換環境音的規則（`ui_core.js` audioState，原文）：", "");
  for (const r of ambRules) o.push(`- ui_core.js:${r.line}：\`${r.text.replace(/`/g, "'")}\``);
  o.push("", "### 3-3. 地下收藏庫：每層（`fx.js` 的 `FLOOR`）", "",
    "bed＝三～四條底音的音量（wind 風、basement 地下室、sewer 下水道、cave 洞穴滴水、waves 水波、void 虛空）；odd＝偶爾冒的音效檔；gap＝幾秒冒一次；drip＝滴水錄音的音量倍數。", "",
    "| 層 | 底音 bed | 偶爾冒 odd | gap（秒） | drip | 有人來了 | 說明 | 在 |", "|---|---|---|---|---|---|---|---|");
  for (const f of FLOOR) o.push(`| ${f.floor === "base" ? "選樓層（base）" : "B" + f.floor} | ${cell(Object.entries(f.o.bed).map(([k, v]) => k + " " + v).join("、"))} | ${cell([...new Set(f.o.odd)].join("、"))} | ${(f.o.gap || []).join("～")} | ${f.o.drip} | ${f.o.coming ? "會" : ""} | ${cell(f.note)} | fx_sound.js:${f.line} |`);
  o.push("", "### 3-4. 地下收藏庫：在做什麼（`fx.js` 的 `MODE`）", "",
    "bed＝底音乘幾倍；gapK＝偶爾冒的間隔乘幾倍（0＝不冒）；dripK＝滴水。背景音樂另在 `applyMusic`：戰鬥 ready-fight、守門 stairs-boss／horror-gate、B1～B5 平常 suspense-*。", "",
    "| 狀態 | 說明 | bed | gapK | dripK | 其他 |", "|---|---|---|---|---|---|");
  for (const [k, v] of Object.entries(MODE)) o.push(`| ${k} | ${modeNote[k] || ""} | ${v.bed} | ${v.gapK} | ${v.dripK} | ${v.wind !== undefined ? "wind " + v.wind : ""} |`);
  o.push("", "### 3-5. 賭場的熱鬧連動（`shared/room_mood.js` 的 `AMB_MIX`）", "",
    "| 熱鬧程度 heat | 人聲音量 | 籌碼聲間隔（ms） | 一次最多幾下 |", "|---|---|---|---|");
  rm.AMB_MIX.forEach((m, i) => o.push(`| ${i}（${["冷清", "平常", "熱絡", "沸騰"][i]}） | ${m.crowd} | ${m.chipMin}～${m.chipMax} | ${m.chipN} |`));

  o.push("", "### 3-6. 理智和狀態的聲音規則", "", "| 名字 | 什麼時候 | 數字在哪一處 | 在 |" + nCols, "|---|---|---|---|---|---|");
  for (const r of SAN_RULES) { keys.push(r.key); o.push(`| ${r.name} | ${cell(r.when)} | ${cell(r.nums(rm))} | ${locOf(...r.find, r.key)} | ${noteCols(notes, r.key)} |`); }
  o.push("", "### 3-7. 銀行的「空檔」音效 slot（`web/src/rooms/bank/ui_bank.js` 的 `bankSfx`）", "",
    "銀行動作（act:op）分幾組，每組一個音效檔；新音效要掛在銀行，先看這幾組有沒有適合的。", "", "| 組 | 動作 | 音效檔（音量） | 說明 |", "|---|---|---|---|");
  for (const s of bankSlots) { const set = bankSets[s.set] || { items: [] }; o.push(`| ${s.set.replace("BANK_SFX_", "")} | ${cell(set.items.join("、"))} | ${s.id} ${s.vol} | ${cell(set.note)} |`); }
  const bankUsedSets = new Set(bankSlots.map(s => s.set));
  const bankFree = Object.keys(bankSets).filter(k => !bankUsedSets.has(k));
  if (bankFree.length) o.push("", `沒接上音效的組：${bankFree.join("、")}`);
  const bankSnd = findSnd(src("web/src/rooms/bank/ui_bank.js"), Rnames).filter(x => !x.dynamic);
  o.push("", `銀行畫面其他的合成音：${bankSnd.map(x => x.names.join("／") + "（ui_bank.js:" + x.line + "）").join("、") || "無"}`);

  // 4 觸發點
  sec("## 4. 觸發點（誰在什麼地方響）");
  o.push("掃 `web/src/*.js` 的 `snd(\"名字\"…)`、`sndFile(\"id\", 音量)`、`fx.js` 的 `fileLoop`／`fileOnce`。位置是「檔:行 函式 音量」，按音效分組。", "",
    "### 4-1. 合成音效", "");
  for (const r of R) {
    const t = T.snd[r.name];
    o.push(`- **${r.name}**（${cell(r.desc).slice(0, 40)}）：` + (t ? "" : (weakR[r.name] ? "（沒有直接呼叫；字串出現在 " + weakR[r.name].slice(0, 3).join("、") + "）" : "**沒人用**")));
    for (const x of t || []) o.push(`  - ${x.file}:${x.line} ${x.fn}${x.vol ? " 音量 " + x.vol : ""}${x.note ? "（" + x.note + "）" : ""}`);
  }
  o.push("", "### 4-2. 音效檔", "");
  for (const id of sfxIds) {
    const t = T.file[id];
    o.push(`- **${id}**：` + (t ? "" : (quotedAt[id] ? "（沒有直接呼叫；字串出現在 " + quotedAt[id].join("、") + "）" : "**沒人用**" + withNote(id))));
    for (const x of t || []) o.push(`  - ${x.file}:${x.line} ${x.fn}${x.vol ? " 音量 " + x.vol.replace(/\s+/g, "") : ""}${x.note ? "（" + x.note + "）" : ""}`);
  }
  o.push("", "### 4-3. 名字放在變數裡的呼叫（動態，沒辦法對到單一音效）", "");
  for (const x of T.dynSnd) o.push(`- snd(${cell(x.raw).slice(0, 60)}) ${x.file}:${x.line} ${x.fn}`);
  for (const x of T.dynFile) o.push(`- sndFile(${cell(x.raw).slice(0, 60)}) ${x.file}:${x.line} ${x.fn}`);
  if (!T.dynSnd.length && !T.dynFile.length) o.push("（沒有）");

  sec("## 5. 沒人用的、沒登記的");
  o.push("**沒人用的音效檔**（登記了、檔案在，程式裡找不到呼叫也沒引號字串）：" + (unusedSfx.length ? unusedSfxText : "無"), "",
    "**沒人用的合成音**（`R` 裡有、程式裡找不到呼叫）：" + (unusedR.length ? unusedR.join("、") : "無"), "",
    "**用了卻沒登記的音效檔 id**（呼叫了但 `shared/sfx_files.js` 沒有）：" + (unreg.length ? unreg.map(x => `${x.id}（${x.file}:${x.line}）`).join("、") : "無"));

  // 6 畫面特效
  sec("## 6. 畫面特效");
  for (const g of ["房間效果", "理智效果", "畫面工具"]) {
    o.push(`### 6-${["房間效果", "理智效果", "畫面工具"].indexOf(g) + 1}. ${g}`, "",
      g === "房間效果" ? "狀態（暖冷、暗、人影、旗、怪影子）只由 `shared/room_mood.js` 的 `roomMood` 算，`web/src/fx/ui_mood.js` 畫，樣式在 `web/src/css/mood.css`（`rm-` 開頭）。" : g === "理智效果" ? "館友自己的理智效果比房間效果大：有熄燈、昏倒、逃跑、發作就把房間效果收起來。" : "`web/src/fx/fx_sound.js` 匯出的 `FX` 工具，樣式在 `web/src/css/fx.css`。", "",
      "| 名字 | 什麼時候出現 | 門檻或數字在哪一處 | 程式 | 樣式 |" + nCols, "|---|---|---|---|---|---|---|");
    for (const v of vfxRows.filter(x => x.group === g)) { keys.push(v.key); o.push(`| ${cell(v.name)} | ${cell(v.when)} | ${cell(v.nums(rm))} | ${v.where} | ${v.cssWhere ? v.cssWhere : ""} | ${noteCols(notes, v.key)} |`); }
    o.push("");
  }
  o.push("### 6-4. 地下戰鬥特效（`web/public/cellar2/fx-*.webp`）", "",
    `畫面層 \`${fightUse}\` 的 \`fightFx(kind)\`（\`FX_ART\` 的格數要跟 \`fight.css\` 的 \`steps(N)\` 一樣）；樣式 \`web/src/css/fight.css\` 的 \`.fg-fx.k-<名>\`。`, "",
    "| 名字 | 檔案 | KB | 格數（css） | 格數（FX_ART） | 時間 ms | 用在 | 樣式 |" + nCols, "|---|---|---|---|---|---|---|---|---|---|");
  for (const f of fightFx) { const k = "fight-fx:" + f.kind; keys.push(k); o.push(`| ${f.kind} | ${f.file} | ${f.kb === null ? "（檔案不在）" : f.kb} | ${f.frames} | ${fightArt[f.kind] === undefined ? "（FX_ART 沒登記）" : fightArt[f.kind]}${fightArt[f.kind] !== undefined && String(fightArt[f.kind]) !== f.frames ? "（對不上）" : ""} | ${f.ms} | ${FIGHT_USE[f.kind] || "（未寫）"} | fight.css:${f.line} | ${noteCols(notes, k)} |`); }
  o.push("", "### 6-5. FX 工具清單（`fx.js` 匯出）", "", "`" + fxToolNames.join("`、`") + "`", "");

  o.push("### 6-6. 門檻速查（shared/room_mood.js、ui_odd.js 目前的值）", "", "```",
    "RM = " + JSON.stringify(rm.RM), "SAN_DREAD = " + JSON.stringify(rm.SAN_DREAD), "ODD_AT = " + JSON.stringify(oddAt()), "```", "");
  o.push("## 7. 地下打鬥的聲音（`shared/fight_sfx.js` 的 FIGHT_SFX）", "",
    "事件 → 聲音。畫面在 `web/src/rooms/ui_fight.js`，沒有在表裡的事件照舊響通用的「受傷／喀」。**現在**欄有「錄音」＝已經是音效檔；「合成」＝程式即時合成的，`todo` 是之後要找的 royalty free 聲音。", "",
    "| 事件 key | 現在用什麼 | todo（之後要找的聲音） |", "|---|---|---|");
  for (const k of fightKeys) { const e = fightSfx[k]; o.push(`| ${cell(k)} | ${e.file ? "錄音 " + e.file + (e.g !== undefined ? "（音量 " + e.g + "）" : "") : e.snd ? "合成 " + e.snd : "（無）"} | ${cell(e.todo || "")} |`); }
  o.push("", `共 ${fightKeys.length} 個事件；錄音 ${fightKeys.filter(k => fightSfx[k].file).length} 個、合成音 ${fightSynth.length} 個；還在用合成音、之後要找錄音的：**${fightTodo.length} 項**。`, "");
  return { text: o.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n", keys, unusedSfx, unusedR, unreg, counts: { fightTodo: fightTodo.length, sfx: sfxIds.length, R: Rrows, AMB: Arows, trig: trigCount, vfx: vfxRows.length, fight: fightFx.length } };
}

function readNotes() { try { return JSON.parse(fs.readFileSync(NOTES, "utf8")); } catch (e) { return {}; } }
const EOL = s => s.replace(/\r\n/g, "\n");

async function main() {
  const check = process.argv.includes("--check");
  const notes = readNotes();
  const r = await build(notes);
  const missing = r.keys.filter(k => !(k in notes));
  if (check) {
    if (missing.length) { console.error(`fx_notes.json 缺 ${missing.length} 個項目（${missing.slice(0, 5).join("、")}…）：跑 npm run fx:report`); process.exit(1); }
    // 11-16 起總表不進 git（docs/素材/音效與特效總表.md 由 npm run fx:report 在本機產生，給人看）：這裡只檢查「程式掃得出來、fx_notes.json 每一項都有」，不比對檔案
    console.log("音效與特效總表：程式掃得出來，fx_notes.json 跟得上");
    return;
  }
  if (missing.length) { for (const k of missing) notes[k] = { heard: null, note: null }; writeNotes(notes, r.keys); }
  fs.writeFileSync(DOC, r.text);
  console.log(`寫好 docs/素材/音效與特效總表.md：音效檔 ${r.counts.sfx}、合成音 ${r.counts.R}、房間背景 ${r.counts.AMB}、觸發點 ${r.counts.trig}、畫面特效 ${r.counts.vfx}（地下戰鬥 ${r.counts.fight}）；還在用合成音要找錄音 ${r.counts.fightTodo}；沒人用 音效檔 ${r.unusedSfx.length}／合成音 ${r.unusedR.length}；沒登記 ${r.unreg.length}` + (missing.length ? `；fx_notes.json 補了 ${missing.length} 個新項目` : ""));
}
function writeNotes(notes, order) {
  const out = {}; for (const k of order) if (k in notes) out[k] = notes[k];
  for (const k of Object.keys(notes)) if (!(k in out)) out[k] = notes[k];
  fs.writeFileSync(NOTES, "{\n" + Object.keys(out).map(k => " " + JSON.stringify(k) + ": " + JSON.stringify(out[k])).join(",\n") + "\n}\n");
}

module.exports = { callArgs, splitArgs, findSnd, findSndFile, findFileCalls, fnAt, build };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
