// 德州撲克（館友對館友）的模擬：node test/sim/sim_holdem.cjs [手數，預設 60000] [種子]
// 規劃：docs/規劃/新牌桌遊戲規劃.md 第 2 節。不載入 shared/（還沒有程式）。
// 看什麼：①抽水（rake）收多少、玩家每 100 手付多少 ②「沒翻牌不抽」會不會被拿來洗錢（preflop 丟牌轉帳）③串通壹天最多搬多少 ④NPC 補位的輸贏。
// 簡化（只為了量抽水和轉帳，不是做 AI）：固定下注大小、最多壹次加注；以「有效籌碼」為上限（沒有邊池）；機器人用手牌強度決定。
const HANDS = Number(process.argv[2]) || 60000;
let s = (Number(process.argv[3]) || 20261121) >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- 牌力：7 張取最好的牌型，回傳可比大小的數字（類別 × 15^5 ＋ 踢腳） ----------
const enc = (cat, arr) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (arr[i] || 0); return v; };
function straightHi(rs) { const has = new Array(14).fill(false); rs.forEach(r => { has[r + 1] = true; if (r === 12) has[0] = true; }); for (let h = 13; h >= 4; h--) if (has[h] && has[h - 1] && has[h - 2] && has[h - 3] && has[h - 4]) return h - 1; return -1; }
function score(cards) { // 0..51，rank = c%13（0＝2 … 12＝A），suit = floor(c/13)
  const cnt = new Array(13).fill(0), suits = [[], [], [], []];
  for (const c of cards) { cnt[c % 13]++; suits[Math.floor(c / 13)].push(c % 13); }
  const fs = suits.find(a => a.length >= 5);
  if (fs) { const h = straightHi(fs); if (h >= 0) return enc(8, [h]); }
  const g = []; for (let r = 12; r >= 0; r--) if (cnt[r]) g.push([cnt[r], r]);
  g.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = (skip, n) => g.filter(x => !skip.includes(x[1])).map(x => x[1]).slice(0, n);
  if (g[0][0] === 4) return enc(7, [g[0][1]].concat(kick([g[0][1]], 1)));
  if (g[0][0] === 3 && g[1] && g[1][0] >= 2) return enc(6, [g[0][1], g[1][1]]);
  if (fs) return enc(5, fs.slice().sort((a, b) => b - a).slice(0, 5));
  const sh = straightHi(cards.map(c => c % 13)); if (sh >= 0) return enc(4, [sh]);
  if (g[0][0] === 3) return enc(3, [g[0][1]].concat(kick([g[0][1]], 2)));
  if (g[0][0] === 2 && g[1] && g[1][0] === 2) return enc(2, [g[0][1], g[1][1]].concat(kick([g[0][1], g[1][1]], 1)));
  if (g[0][0] === 2) return enc(1, [g[0][1]].concat(kick([g[0][1]], 3)));
  return enc(0, g.slice(0, 5).map(x => x[1]));
}
const catOf = sc => Math.floor(sc / Math.pow(15, 5));
// 起手牌強度 0~1（粗略：對子、高牌、同花、連牌）
function preflop(a, b) { const r1 = Math.max(a % 13, b % 13), r2 = Math.min(a % 13, b % 13), suited = Math.floor(a / 13) === Math.floor(b / 13); let v = r1 / 12 * 0.5 + r2 / 12 * 0.2; if (r1 === r2) v = 0.55 + r1 / 12 * 0.45; if (suited) v += 0.06; if (r1 - r2 <= 2 && r1 !== r2) v += 0.04; return Math.min(1, v); }
const post = sc => [0.1, 0.35, 0.6, 0.72, 0.8, 0.85, 0.92, 0.97, 1][catOf(sc)] || 0.1;
// 機器人性格：play 起手牌強度門檻、bet 下注門檻、call 跟注門檻。maniac 亂加注、station 愛跟
const STYLE = { rock: { play: 0.66, bet: 0.72, call: 0.5, raise: 0.85 }, station: { play: 0.5, bet: 0.95, call: 0.3, raise: 2 }, maniac: { play: 0.45, bet: 0.6, call: 0.3, raise: 0.55 }, tight: { play: 0.6, bet: 0.66, call: 0.45, raise: 0.8 } };

// 壹手牌。players: [{ id, style, stack }]（stack 會被改）；cfg: { bb, rake: { pct, cap（BB 的倍數）, noFlopNoDrop }, dump: { from, to } 丟牌轉帳 }
function playHand(players, cfg, button) {
  const n = players.length, bb = cfg.bb, deck = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hole = players.map((_, i) => [deck[i * 2], deck[i * 2 + 1]]), board = deck.slice(20, 25);
  const inPot = players.map(() => 0), alive = players.map(() => true);
  const eff0 = Math.min(...players.map(p => p.stack));
  const put = (i, amt) => { const a = Math.max(0, Math.min(amt, eff0 - inPot[i])); inPot[i] += a; return a; };
  const sb = (button + 1) % n, bbp = (button + 2) % n;
  put(sb, bb / 2); put(bbp, bb);
  let street = 0, flop = false, ended = false;
  if (cfg.dump) { // A 全下、B 跟、A 棄牌（preflop 就結束）
    const d = players.findIndex(p => p.id === cfg.dump.from), r = players.findIndex(p => p.id === cfg.dump.to);
    inPot[d] = eff0; inPot[r] = eff0; alive.fill(false); alive[r] = true; ended = true;
  }
  while (!ended && street < 4) {
    if (street === 1) flop = true;
    const act = []; for (let k = 1; k <= n; k++) { const i = (street === 0 ? bbp + k : button + k) % n; if (alive[i]) act.push(i); }
    const cards = street === 0 ? null : board.slice(0, 2 + street);
    const strength = i => (street === 0 ? preflop(hole[i][0], hole[i][1]) : post(score(hole[i].concat(cards))));
    let top = Math.max(...inPot), bets = 0;
    const pot = () => inPot.reduce((a, b) => a + b, 0);
    for (const i of act) {
      if (!alive[i]) continue;
      if (alive.filter(Boolean).length === 1) break;
      const st = STYLE[players[i].style], v = strength(i), toCall = top - inPot[i], r = rnd();
      if (street === 0 && toCall > 0 && v < st.play && !(players[i].style === "maniac" && r < 0.2)) { alive[i] = false; continue; }
      if (street > 0 && toCall > 0 && v < st.call && !(players[i].style === "maniac" && r < 0.4)) { alive[i] = false; continue; }
      const wantsBet = street === 0 ? v >= st.raise : (v >= st.bet && r < 0.7) || (players[i].style === "maniac" && r < 0.18);
      if (bets < 1 && wantsBet) { const sz = street === 0 ? bb * 3 : Math.max(bb, Math.floor(pot() * 0.5)); put(i, top + sz - inPot[i]); top = Math.max(top, inPot[i]); bets++; continue; }
      if (toCall > 0) put(i, toCall);
    }
    alive.forEach((a, i) => { if (a && inPot[i] < top) put(i, top - inPot[i]); }); // 還活著的補到同額
    street++;
    if (alive.filter(Boolean).length === 1) ended = true;
  }
  const live = alive.map((a, i) => (a ? i : -1)).filter(i => i >= 0), total = inPot.reduce((a, b) => a + b, 0);
  let winner = live[0];
  if (live.length > 1) { let bs = -1; live.forEach(i => { const sc = score(hole[i].concat(board)); if (sc > bs) { bs = sc; winner = i; } }); }
  let rake = 0;
  if (cfg.rake && cfg.rake.pct > 0 && (flop || !cfg.rake.noFlopNoDrop) && total > bb * 2) rake = Math.min(Math.floor(total * cfg.rake.pct / 100), cfg.rake.cap * bb);
  inPot.forEach((x, i) => { players[i].stack -= x; });
  players[winner].stack += total - rake;
  return { rake, pot: total, flop };
}
const money = x => (x / 1e4).toFixed(1) + "萬";

console.log(`=== 德州撲克模擬：${HANDS.toLocaleString()} 手 ===`);
// ① 抽水：4 人桌（rock、station、maniac、tight），每人 100 BB（BB＝10 萬，買入 1,000 萬），低於 20 BB 重買到 100 BB
function table(cfg, styles, hands, bb = 1e5) {
  const P = styles.map((st, i) => ({ id: "p" + i, style: st, stack: 100 * bb, net: 0 })), out = { rake: 0, pot: 0, flopHands: 0 };
  let btn = 0;
  for (let h = 0; h < hands; h++) {
    P.forEach(p => { p.start = p.stack; });
    const r = playHand(P, Object.assign({ bb }, cfg), btn); btn = (btn + 1) % P.length;
    P.forEach(p => { p.net += p.stack - p.start; if (p.stack < 20 * bb) p.stack = 100 * bb; });
    out.rake += r.rake; out.pot += r.pot; if (r.flop) out.flopHands++;
  }
  out.P = P; return out;
}
const sty = ["rock", "station", "maniac", "tight"], bb = 1e5;
for (const [label, rake] of [["不抽水", null], ["5%、封頂 3 BB、沒翻牌不抽", { pct: 5, cap: 3, noFlopNoDrop: true }], ["5%、封頂 3 BB、每手都抽（含沒翻牌）", { pct: 5, cap: 3, noFlopNoDrop: false }], ["3%、封頂 2 BB、每手都抽", { pct: 3, cap: 2, noFlopNoDrop: false }], ["8%、封頂 4 BB、每手都抽", { pct: 8, cap: 4, noFlopNoDrop: false }]]) {
  const o = table({ rake }, sty, HANDS);
  const perPl = o.rake / HANDS / 4 * 100 / bb;
  console.log(`\n① ${label}：有翻牌的手 ${(o.flopHands / HANDS * 100).toFixed(0)}%｜每手平均池 ${(o.pot / HANDS / bb).toFixed(1)} BB｜抽水每手 ${(o.rake / HANDS / bb).toFixed(2)} BB（${money(o.rake / HANDS)}）｜每人每 100 手付 ${perPl.toFixed(1)} BB（占買入 100 BB 的 ${perPl.toFixed(1)}%）`);
  console.log("   各性格每 100 手輸贏(BB)：" + o.P.map(p => `${p.style} ${(p.net / HANDS * 100 / bb).toFixed(1)}`).join("｜") + "（總和＝−抽水）");
}
// ② 丟牌轉帳：A 全下 1,000 萬、B 跟、A 棄牌（2 人桌，preflop 就結束）
console.log("\n② 丟牌轉帳（A 每手全下 1,000 萬、B 跟、A 棄牌）：");
for (const [label, rake] of [["沒翻牌不抽（5%、封頂 3 BB）", { pct: 5, cap: 3, noFlopNoDrop: true }], ["每手都抽 5%、封頂 3 BB", { pct: 5, cap: 3, noFlopNoDrop: false }], ["每手都抽 5%、封頂 50 BB", { pct: 5, cap: 50, noFlopNoDrop: false }], ["每手都抽 5%、不封頂（cap 9999）", { pct: 5, cap: 9999, noFlopNoDrop: false }]]) {
  const P = [{ id: "A", style: "rock", stack: 1e7 }, { id: "B", style: "rock", stack: 1e7 }], r = playHand(P, { bb, rake, dump: { from: "A", to: "B" } }, 0);
  console.log(`  ${label.padEnd(30)}搬 ${money(1e7)}：抽水 ${money(r.rake)}（${(r.rake / 1e7 * 100).toFixed(2)}%）；B 淨拿 ${money(P[1].stack - 1e7)}`);
}
// ③ 串通壹天最多搬多少（算術）：每手 15 秒、玩 8 小時＝1,920 手
console.log("\n③ 串通壹天最多搬多少（壹手 15 秒、玩 8 小時＝1,920 手）：");
for (const [label, buy, pairCap] of [["沒有任何限制（只受買入上限 1,000 萬）", 1e7, Infinity], ["壹天對同壹人淨輸上限 2,000 萬", 1e7, 2e7], ["壹天對同壹人淨輸上限 500 萬", 1e7, 5e6], ["上限 500 萬＋買入上限 200 萬", 2e6, 5e6]]) {
  const per = Math.min(buy, pairCap), hands = 1920, moved = pairCap === Infinity ? per * hands : Math.min(per * hands, pairCap);
  console.log(`  ${label.padEnd(36)}壹對帳號壹天最多搬 ${money(moved)}${pairCap === Infinity ? "（每手 " + money(per) + "，1,920 手；實際上 B 的錢包有多少就搬多少）" : ""}`);
}
console.log("  開 N 個小帳（新帳號起始 1,000 萬）灌給主帳：壹天 ≈ N × min(1,000 萬, 對同壹人上限)。所以「新帳號／館齡太短不能坐德州」才是真正的鎖，對同壹人上限只管朋友之間。");

// ④ NPC 補位：NPC 用 tight，跟 3 位真人（rock／station／maniac 各壹位）。每手都抽 5%、封頂 3 BB
{
  const o = table({ rake: { pct: 5, cap: 3, noFlopNoDrop: false } }, ["tight", "rock", "station", "maniac"], HANDS), npc = o.P[0], perDay = 60 * 8;
  console.log(`\n④ NPC(tight) 補位，3 位真人（rock／station／maniac）、每手都抽 5%：NPC 每 100 手 ${(npc.net / HANDS * 100 / bb).toFixed(1)} BB`);
  console.log(`   壹天坐 8 小時（每小時 60 手＝${perDay} 手）：NPC 期望 ${money(npc.net / HANDS * perDay)}，買入 1,000 萬的 ${(npc.net / HANDS * perDay / 1e7 * 100).toFixed(1)}%（現有 npcCas：壹位 NPC 壹天輸 ≤ 8%、贏 ≤ 15%，全館壹天淨輸贏 ≤ 30 萬）`);
  const o2 = table({ rake: { pct: 5, cap: 3, noFlopNoDrop: false } }, ["tight", "tight", "rock", "station"], HANDS);
  console.log(`   對照：2 位 NPC(tight) 加 rock、station：NPC 每 100 手 ${(o2.P[0].net / HANDS * 100 / bb).toFixed(1)}、${(o2.P[1].net / HANDS * 100 / bb).toFixed(1)} BB`);
}
