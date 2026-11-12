// 每天的排程用：幾個旋鈕 → 地下今天多一隻怪物（翊文 11-12：「要設計一套工具，讓每天規劃的排程能夠方便的快速做出有意義的新關卡」）
// 排程只要想「故事」和「這隻怎麼打才有意思」，數字這支工具會算、會調、會檢查。
//
//   npm run level:new -- 規格.json            只印出來看（那一塊、模擬的結果、玩家在地圖上會看到什麼）
//   npm run level:new -- 規格.json --write    寫進 content/weeks/<週>/d<天>.json 的 cellar（那天的檔要先有）
//   npm run level:new -- --styles             列出有哪幾種打法
//   其他：--runs 200（模擬幾場，預設 150）、--no-tune（不自動調壓力）
//
// 規格（用 Write 工具直接寫成 json 檔，不要塞在指令列）：
//   {
//     "week": "2026-W47", "day": 2,        哪一週、第幾天（1＝週一）
//     "floor": 1,                          放在哪一層（玩家要走到過這層才打得到；想讓大家都打得到就放 1）
//     "name": "沒人領的冬衣",               名字，12 字內，用「壹」不用「一」
//     "intro": "袖子自己舉了起來。",         出場的那句，40 字內
//     "mood": "傷心", "color": "紅",        心情（開心／傷心／生氣，或不寫）、顏色（可以不寫）：決定玩家今天帶誰最好打
//     "style": "嚇人",                      打法，見下面 STYLES
//     "hard": 2,                           1 好打、2 普通、3 難打（調整目標勝率；跟地圖上的等級 rank 是兩件事）
//     "rank": 1,                           地圖上顯示的等級 1～3（可以不寫，預設 1）
//     "texts": { "scare": "要把{x}包起來", "grow": "箱子裡還有壹件" },   每一種招的預告；hit、scare 要寫 {x}（被點到的人）
//     "phase2": "袖子全部舉了起來。",        只有 style 是「守門」要寫
//     "card": ["登記卡第壹段。", "第貳段。"], 登記之後寫進《補登的帳》的字，1～3 段，壹段 80 字內
//     "line": "w47-count"                  接這週哪一條劇情線（week.json 的 lines 的 id）
//   }
// 故事怎麼接：照 content/排程說明.md「一之七」和「一之八」。這支只管關卡，不寫故事。
const fs = require("fs"), path = require("path");
const { G, simFoe } = require("../test/sim_fight.cjs");
const ROOT = path.join(__dirname, "..");

// 打法：每一種「玩起來不一樣」，不是只有數字不同。what ＝給排程看的一句話；kinds ＝用到哪幾種招（texts 要寫這幾種）
const STYLES = {
  嚇人: { what: "只扣理智，不會弄倒佩佩。考驗理智，適合理智高的時候打；有人擋、有人安撫就輕鬆", moves: [["scare", 2], ["all", 1]], hp: 1 },
  撲人: { what: "專門弄倒佩佩（倒下會受傷）。要擋、要用棒球帽和斯拉夫蹲；帶兩隻的人比較安全", moves: [["hit", 2], ["scare", 1]], hp: 0.9 },
  越來越多: { what: "壹直回壓力，拖越久越難。要搶快：先看穿再全力推，安撫可以打斷牠", moves: [["grow", 2], ["scare", 2]], hp: 0.85 },
  混合: { what: "什麼都會壹點，最普通的壹種", moves: [["hit", 1], ["scare", 2], ["grow", 1]], hp: 1 },
  守門: { what: "兩個階段的大隻的，適合週五、限時活動，要揪人打。第二階段會全體扣理智", moves: [["hit", 1], ["scare", 2], ["grow", 1]], moves2: [["all", 2], ["hit", 1]], hp: 1, boss: true },
};
// 每一層的基本數字：照內建怪物的平均（CELLAR_FOES）
function floorBase(floor) {
  const reg = G.fightFoesOf(floor), boss = G.fightFoesOf(floor, true)[0];
  if (!reg.length || !boss) throw new Error(`沒有 B${floor} 這一層`);
  const san = reg.flatMap(f => f.moves).filter(m => m.san).map(m => G.maxExpr(m.san));
  const grow = reg.concat([boss]).flatMap(f => f.moves).filter(m => m.n).map(m => m.n);
  return { hp: Math.round(reg.reduce((n, f) => n + f.hp, 0) / reg.length), bossHp: boss.hp, bossHp2: boss.hp2, san: Math.max(...san, 2), grow: Math.round(grow.reduce((a, b) => a + b, 0) / Math.max(1, grow.length)) || 4 };
}
// 難度的目標（一個人、普通的選法）：hard 1 好打、2 普通、3 難打
// 會弄倒佩佩的打法看勝率；不會弄倒佩佩的（嚇人、越來越多）一個人幾乎不會輸，改看「要打幾回合」（越久扣越多理智）
const TARGET = { 1: [0.85, 0.97], 2: [0.68, 0.88], 3: [0.5, 0.72] };
const TARGET_ROUNDS = { 1: [3, 4.5], 2: [4.5, 6.5], 3: [6.5, 8.5] };
const byRounds = foe => !foe.moves.concat(foe.moves2 || []).some(m => m.kind === "hit");

function build(spec) {
  const st = STYLES[spec.style];
  if (!st) throw new Error(`style 要是：${Object.keys(STYLES).join("、")}`);
  if (!/^\d{4}-W\d{2}$/.test(spec.week || "") || !(spec.day >= 1 && spec.day <= 7)) throw new Error("week 要像 2026-W47，day 要是 1～7");
  const L = G.FIGHT_CUSTOM, base = floorBase(spec.floor), texts = spec.texts || {};
  const clampHp = n => Math.max(L.hp[0], Math.min(L.hp[1], Math.round(n)));
  const mk = (list, tag) => list.map(([kind, w]) => {
    if (!texts[kind]) throw new Error(`這個打法會用到「${kind}」，texts.${kind} 要寫牠的預告`);
    const m = { id: `${kind}${tag}`, kind, w, text: texts[kind] };
    if (kind === "scare") m.san = "1D" + Math.min(L.sanMax, base.san);
    if (kind === "all") m.san = "1D" + Math.min(L.sanMax, Math.max(2, base.san - 1));
    if (kind === "grow") m.n = Math.min(L.growMax, base.grow);
    return m;
  });
  const foe = { id: `${spec.week.split("-")[1].toLowerCase()}-d${spec.day}-foe`, name: spec.name, intro: spec.intro, floor: spec.floor, hp: clampHp((st.boss ? base.bossHp : base.hp) * st.hp), mood: spec.mood || null, color: spec.color || null, moves: mk(st.moves, "") };
  if (st.boss) { foe.boss = true; foe.hp2 = clampHp(base.bossHp2 * st.hp); foe.moves2 = mk(st.moves2, "2"); foe.phase2 = spec.phase2; }
  const block = { floor: spec.floor, foe, card: spec.card, line: spec.line };
  if (!st.boss && spec.rank) block.rank = spec.rank;
  return block;
}
// 調壓力：讓「一個人、普通的選法」的勝率落在目標裡。最多試 6 次；調不進去就留最接近的，並說出來
function tune(block, hard, runs) {
  const L = G.FIGHT_CUSTOM, foe = block.foe, ratio = foe.hp2 ? foe.hp2 / foe.hp : 0, rounds = byRounds(foe);
  const [lo, hi] = (rounds ? TARGET_ROUNDS : TARGET)[hard] || (rounds ? TARGET_ROUNDS : TARGET)[2];
  // easy ＝現在太好打（要加壓力）。看回合的：回合太少算太好打；看勝率的：勝率太高算太好打
  const measure = () => { const t = simFoe(foe, 1, runs, block.rank || 1), v = rounds ? t.rounds : t.win; return { t, v, fit: v >= lo && v <= hi, easy: rounds ? v < lo : v > hi }; };
  let low = L.hp[0], high = L.hp[1], note = "", m = measure();
  for (let i = 0; i < 7 && !m.fit; i++) {
    if (m.easy) low = foe.hp; else high = foe.hp;
    const next = Math.round((low + high) / 2);
    if (next === foe.hp) { note = m.easy ? "壓力已經調到上限，還是太好打：換「撲人」或「守門」，或放深壹點的樓層" : "壓力已經調到下限，還是太難打：換「嚇人」，或放淺壹點的樓層"; break; }
    foe.hp = next;
    if (ratio) foe.hp2 = Math.max(L.hp[0], Math.min(L.hp[1], Math.round(next * ratio)));
    m = measure();
  }
  return { ok: m.fit, by: rounds ? "rounds" : "win", win: m.t.win, rounds: m.t.rounds, note: m.fit ? "" : note || "試了幾次還沒進目標，先用最接近的" };
}
const BEATEN_BY = mood => Object.keys(G.MOOD_BEATS).find(k => G.MOOD_BEATS[k] === mood) || null;
function report(block, runs) {
  const foe = block.foe, out = [];
  const pad = (s, n) => String(s).padEnd(n);
  out.push(`「${foe.name}」 B${block.floor}${foe.boss ? "（守門等級，兩個階段）" : `　地圖上的等級 ${block.rank || 1}`}　壓力 ${foe.hp}${foe.hp2 ? "／" + foe.hp2 : ""}`);
  out.push("玩家在地圖上會看到：" + [foe.boss ? null : `等級 ${block.rank || 1}`, foe.mood ? `心情 ${foe.mood}（帶「${BEATEN_BY(foe.mood)}」的佩佩強度兩倍）` : "沒有心情（沒有相剋）", foe.color ? `顏色 ${foe.color}（同色 +1）` : null, "看不到是誰（神祕感）"].filter(Boolean).join("、"));
  out.push("下壹招的預告：" + [...new Set(foe.moves.concat(foe.moves2 || []).map(m => "「" + m.text.split("{x}").join("小明") + "」"))].join(" "));
  out.push("模擬（每格 " + runs + " 場；選法單純、不用招式）：贏 %／回合／每人扣理智／每人倒下");
  [1, 2, 3, 4].forEach(p => { const t = simFoe(foe, p, runs, block.rank || 1); out.push(`  ${p} 人　${pad(Math.round(t.win * 100) + "%", 6)}${pad(t.rounds.toFixed(1), 6)}${pad(t.san.toFixed(1), 6)}${t.downs.toFixed(2)}`); });
  return out;
}

function main(argv) {
  if (argv.includes("--styles")) { Object.entries(STYLES).forEach(([k, v]) => console.log(`${k}：${v.what}（要寫的預告：${[...new Set(v.moves.concat(v.moves2 || []).map(m => m[0]))].join("、")}）`)); return 0; }
  const file = argv.find(a => !a.startsWith("--"));
  if (!file) { console.log("用法：npm run level:new -- 規格.json [--write] [--runs 150] [--no-tune]；npm run level:new -- --styles"); return 1; }
  const runs = +(argv[argv.indexOf("--runs") + 1]) || 150;
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const block = build(spec);
  const bad = G.fightDailyCheck(block);
  if (bad.length) { console.log("規格有問題：\n  " + bad.join("\n  ")); return 1; }
  const t = argv.includes("--no-tune") ? null : tune(block, spec.hard || 2, runs);
  report(block, runs).forEach(l => console.log(l));
  const how = t && (t.by === "rounds" ? `壹個人平均打 ${t.rounds.toFixed(1)} 回合（這種打法不會弄倒佩佩，看回合數）` : `壹個人的勝率 ${Math.round(t.win * 100)}%`);
  if (t) console.log(t.ok ? `難度（hard ${spec.hard || 2}）：${how}，在目標裡` : `難度沒調進目標：${how}。${t.note}`);
  if (!argv.includes("--write")) { console.log("\n要寫進當天的檔加 --write。這壹塊是：\n" + JSON.stringify({ cellar: block }, null, 2)); return t && !t.ok ? 2 : 0; }
  const day = path.join(ROOT, "content", "weeks", spec.week, `d${spec.day}.json`);
  if (!fs.existsSync(day)) { console.log(`還沒有 ${path.relative(ROOT, day)}：先寫今天的檔（書、任務、特展），再跑這支`); return 1; }
  const d = JSON.parse(fs.readFileSync(day, "utf8"));
  d.cellar = block;
  fs.writeFileSync(day, JSON.stringify(d, null, 2) + "\n");
  console.log(`\n寫進 ${path.relative(ROOT, day)} 的 cellar 了。接著跑 node tools/week_check.cjs（字數、禁用字、劇情線）。`);
  return t && !t.ok ? 2 : 0;
}
module.exports = { STYLES, TARGET, TARGET_ROUNDS, build, tune, report, floorBase, byRounds };
if (require.main === module) process.exit(main(process.argv.slice(2)));
