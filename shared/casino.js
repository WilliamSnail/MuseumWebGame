// ================================================================
//  Hamachi 賭場：21 點的規則（決定 0040）。純函式：不碰資料庫、DOM，亂數走 RNG（可以 setRng 固定）。
//  伺服器（functions/casino.js）發牌、算點數、派彩；畫面只拿得到「看得到的牌」。
//  舊的 Discord 21 點（重寫過）：
//    - 贏 1:1、黑傑克 3:2（只有前兩張算；舊的任何一手 21 都算，是 bug）、五張牌沒爆 2:1（馬上贏）、平手退注、
//      21 點平手莊家贏、莊家 16 點以下要牌（A 先當 11，爆了才變 1，所以軟 17 不再要）。
//    - 舊的牌是「每張從 13 種隨便抽」，沒有真的牌組；這裡每一局洗壹副真的 52 張，抽掉就沒有了。
//  牌用 0–51 的整數：點 ＝ 數字 % 13（0 是 A，1–9 是 2–10，10、11、12 是 J、Q、K），花色 ＝ floor(數字 / 13)。
//  理智低的時候，畫面會看錯牌（casWarpCard）：只是顯示，算點數、派彩用真的牌。
// ================================================================
import { NUM } from "./config.js";
import { CAS_TEXT } from "./casino_text.js";
import { RNG, hashStr, isFree, mulberry32 } from "./logic.js";
import { skillOf } from "./logic3.js";

export const CAS_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const CAS_SUITS = ["♠", "♥", "♦", "♣"];
export const casFill = (s, o) => Object.keys(o || {}).reduce((t, k) => t.split("{" + k + "}").join(String(o[k])), String(s));
// 金額（翊文 11-09：「數字太多可以換成中文的比如說 萬 ，億等等的」）：一萬以下照寫，一萬以上換成萬、億，最多兩位小數。無條件捨去，不會把錢寫多
export const casNum = n => {
  const v = Math.round(+n || 0), a = Math.abs(v), sign = v < 0 ? "-" : "";
  const two = x => String(Math.floor(x * 100 + 1e-7) / 100);
  if (a >= 1e8) return `${sign}${two(a / 1e8)} 億`;
  if (a >= 1e4) return `${sign}${two(a / 1e4)} 萬`;
  return v.toLocaleString("en-US");
};
export const casExact = n => Math.round(+n || 0).toLocaleString("en-US"); // 完整的數字（滑鼠停著看）

// ---------- 大禮包的拉霸機：五輪怎麼停（只是演出，結果是伺服器決定的） ----------
// 幾顆星就從左邊停幾個 ★。已經有 2 顆星以上，下壹輪拖長壹點（會不會再中？）；斷了之後剩下的很快停完。
// fast：全開的時候每包很快，不拖。回傳 5 輪 { star, near（沒中，但下面那格是 ★）, tease（拖長）, dur（毫秒）, gap（停完等多久） }
export function casSlotPlan(stars, fast) {
  const n = Math.max(0, Math.min(5, Math.floor(+stars) || 0));
  return Array.from({ length: 5 }, (_, i) => {
    const star = i < n, first = i === n, tease = !fast && i >= 2 && i <= n;
    const dur = fast ? 150 : tease ? 1250 : star ? 620 : first ? 620 : 240;
    return { star, near: first, tease, dur, gap: fast ? 0 : star ? 90 : 0 };
  });
}

// ---------- 牌 ----------
export const casDeck = () => Array.from({ length: 52 }, (_, i) => i);
export function casShuffle(deck) {
  const d = (deck || casDeck()).slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(RNG() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
  return d;
}
export const casRank = c => c % 13;
export const casSuit = c => Math.floor(c / 13);
export const casCardName = c => CAS_RANKS[c % 13] + CAS_SUITS[Math.floor(c / 13)];
export const casIsCard = c => Number.isInteger(c) && c >= 0 && c < 52;
export const casPoint = c => { const r = c % 13; return r === 0 ? 11 : Math.min(10, r + 1); };
// 一手牌：A 先當 11，爆了才一張一張變 1。blackjack ＝ 前兩張就是 21；charlie ＝ 剛好五張沒爆
export function casHand(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += casPoint(c); if (c % 13 === 0) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const n = cards.length;
  return { total, soft: aces > 0, bust: total > 21, n, blackjack: n === 2 && total === 21, charlie: n === 5 && total <= 21 };
}
// 莊家：16 點以下一直要牌（軟 17 不要）。deck 是剩下的牌（從尾巴抽），dealer 會被改
export function casDealerPlay(dealer, deck) {
  while (casHand(dealer).total < 17 && deck.length) dealer.push(deck.pop());
  return dealer;
}

// ---------- 輸贏、賠率 ----------
// 回傳 kind：lose、push、win、blackjack、charlie。why：bust（你爆了）、dealerBust（莊家爆了）、tie21（21 點平手莊家贏）、lower、higher、five、natural
export function casOutcome(player, dealer) {
  const p = casHand(player), d = casHand(dealer);
  if (p.bust) return { kind: "lose", why: "bust" };
  if (p.charlie) return { kind: "charlie", why: "five" };
  if (d.bust) return { kind: p.blackjack ? "blackjack" : "win", why: "dealerBust" };
  if (p.total > d.total) return { kind: p.blackjack ? "blackjack" : "win", why: p.blackjack ? "natural" : "higher" };
  if (p.total < d.total) return { kind: "lose", why: "lower" };
  if (p.total === 21) return { kind: "lose", why: "tie21" };
  return { kind: "push", why: "tie" };
}
export const CAS_PROFIT = { win: [1, 1], blackjack: [3, 2], charlie: [2, 1] }; // 賺的 ＝ 注 × [0]／[1]
// 注 bet、結果 kind、加成 bonusPct（%）→ { payout（拿回的籌碼，含本金）, profit（賺的，沒加成）, bonus（加成多的）, net（淨賺賠） }
export function casPayout(bet, kind, bonusPct = 0) {
  if (kind === "lose") return { payout: 0, profit: 0, bonus: 0, net: -bet };
  if (kind === "push") return { payout: bet, profit: 0, bonus: 0, net: 0 };
  const r = CAS_PROFIT[kind];
  if (!r) throw new Error("不認得的結果 " + kind);
  const profit = Math.floor(bet * r[0] / r[1]);
  const bonus = Math.floor(profit * Math.max(0, +bonusPct || 0) / 100);
  return { payout: bet + profit + bonus, profit, bonus, net: profit + bonus };
}
// 賭徒職業、幸運技能的小加成（%）：贏的那一把，賺的籌碼多這麼多。自由模式沒有職業，沒有加成
export function casBonusPct(P) {
  if (!P || isFree(P) || !P.skills) return 0;
  const b = NUM.casino.bonus;
  const pct = skillOf(P, "幸運") / 100 * b.luckPct + (P.job === "gambler" ? b.gamblerPct : 0);
  return Math.round(pct * 100) / 100;
}

// ---------- 下注（舊的挑剔：你再下一次○○給我試試看） ----------
// text：玩家打的字或數字；chips：現在有多少。回傳 { ok, bet } 或 { ok: false, line }。line 是荷官的話，text 只當純文字
// 看不見的字：控制字元、零寬空白、方向控制、BOM（用字碼判斷，原始碼裡不寫那種跳脫）
function casHidden(ch) {
  const n = ch.codePointAt(0);
  return n < 0x20 || n === 0x7f || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff;
}
export function casBetCheck(text, chips) {
  const C = NUM.casino;
  const raw = typeof text === "number" ? String(text) : String(text == null ? "" : text);
  const typed = [...raw].filter(ch => !casHidden(ch)).join("").replace(/,/g, "").trim().slice(0, 24);
  const unit = /^([0-9]+(?:[.][0-9]+)?)\s*(萬|億)$/.exec(typed); // 也可以打「10萬」「1.5億」
  const t = unit ? String(Math.round(Number(unit[1]) * (unit[2] === "億" ? 1e8 : 1e4))) : typed;
  const shown = [...typed].slice(0, 12).join("");
  if (!t) return { ok: false, line: CAS_TEXT.betWeird };
  if (!/^[-+]?[0-9]+([.][0-9]+)?$/.test(t)) return { ok: false, line: casFill(CAS_TEXT.betNaN, { text: shown }) };
  const n = Number(t);
  if (!(n > 0) || !Number.isInteger(n)) return { ok: false, line: CAS_TEXT.betWeird };
  if (n > chips) return { ok: false, line: casFill(CAS_TEXT.betPoor, { chips: casNum(chips) }) };
  if (n < C.minBet) return { ok: false, line: casFill(CAS_TEXT.betSmall, { min: casNum(C.minBet) }) };
  if (n > C.maxBet) return { ok: false, line: casFill(CAS_TEXT.betBig, { max: casNum(C.maxBet) }) };
  return { ok: true, bet: n };
}

// ---------- 理智低：看錯牌 ----------
export function casWarpP(san) {
  if (!Number.isFinite(san)) return 0;
  const t = NUM.casino.warp.slice().sort((a, b) => a.below - b.below);
  for (const w of t) if (san < w.below) return w.p;
  return 0;
}
// 這張牌在 seed 這個位置，顯示成哪張（真的牌不動）。同一個 seed 永遠看成同一張：重新整理不會換
export function casWarpCard(card, seed, san) {
  const p = casWarpP(san);
  if (!p) return card;
  const rnd = mulberry32(hashStr(String(seed))); // hashStr 相近的字串差很少，再過一次 mulberry32 才散開
  if (rnd() >= p) return card;
  const r = (card % 13 + 1 + Math.floor(rnd() * 12)) % 13; // 跟真的點不一樣
  return Math.floor(card / 13) * 13 + r;
}
// 一手牌顯示給 viewer 看的樣子。state 是 done 就全部翻回真的
export function casShown(cards, seed, san, real) {
  return cards.map((c, i) => (real ? c : casWarpCard(c, `${seed}:${i}`, san)));
}

// ---------- 單人的一局 ----------
// 資料庫裡的一局：{ v, id, state: "playing"｜"done", seq, bet, bonusPct, san, deck（剩下的牌）, player, dealer（[0] 是底牌，暗的；[1] 是明牌）, out }
export function casNewRound({ id, bet, bonusPct = 0, san = 99, deck }) {
  const d = (deck || casShuffle()).slice();
  const player = [], dealer = [];
  player.push(d.pop()); dealer.push(d.pop()); player.push(d.pop()); dealer.push(d.pop());
  const r = { v: 1, id, state: "playing", seq: 0, bet, bonusPct, san, deck: d, player, dealer, out: null };
  if (casHand(player).total === 21) casFinish(r); // 前兩張就 21：不用再問，直接翻牌
  return r;
}
// 結算：莊家照規則補牌（玩家爆了、五張牌不用補），算輸贏、派彩。只能算一次
export function casFinish(r) {
  if (r.state === "done") return r;
  const p = casHand(r.player);
  if (!p.bust && !p.charlie) casDealerPlay(r.dealer, r.deck);
  const o = casOutcome(r.player, r.dealer);
  r.out = Object.assign({ kind: o.kind, why: o.why }, casPayout(r.bet, o.kind, r.bonusPct));
  r.state = "done";
  return r;
}
// 要牌。seq 要對得上（連點兩下，第二下的 seq 是舊的，會被擋）
export function casHit(r, seq) {
  if (r.state !== "playing") return { ok: false, reason: "這壹手已經打完了" };
  if (seq !== r.seq) return { ok: false, reason: "畫面不是最新的，再看壹下" };
  r.seq++;
  r.player.push(r.deck.pop());
  const h = casHand(r.player);
  if (h.bust || h.charlie || h.total === 21) casFinish(r); // 爆了、五張、剛好 21（再要也沒用）
  return { ok: true };
}
export function casStand(r, seq) {
  if (r.state !== "playing") return { ok: false, reason: "這壹手已經打完了" };
  if (seq !== r.seq) return { ok: false, reason: "畫面不是最新的，再看壹下" };
  r.seq++;
  casFinish(r);
  return { ok: true };
}
// 給畫面看的樣子。playing：莊家只有明牌（底牌是 -1）；done：全部翻開。viewerSeed 讓理智低的人看到固定的假牌
export function casRoundView(r, viewerSeed = "") {
  const done = r.state === "done";
  const seedP = `${r.id}:${viewerSeed}:p`, seedD = `${r.id}:${viewerSeed}:d`;
  const player = casShown(r.player, seedP, r.san, done);
  const dealerAll = casShown(r.dealer, seedD, r.san, done);
  const dealer = done ? dealerAll : [-1, dealerAll[1]];
  const slips = [];
  if (done) {
    r.player.forEach((c, i) => { const s = casWarpCard(c, `${seedP}:${i}`, r.san); if (s !== c) slips.push({ who: "player", i, saw: s, real: c }); });
    r.dealer.forEach((c, i) => { const s = casWarpCard(c, `${seedD}:${i}`, r.san); if (s !== c) slips.push({ who: "dealer", i, saw: s, real: c }); });
  }
  const showTotal = cs => casHand(cs.filter(c => c >= 0));
  const ph = showTotal(player), dh = showTotal(dealer);
  return {
    id: r.id, seq: r.seq, state: r.state, bet: r.bet, bonusPct: r.bonusPct,
    player: { cards: player, total: ph.total, soft: ph.soft },
    dealer: { cards: dealer, total: done ? dh.total : null, up: casPoint(dealerAll[1]) },
    warped: !done && (player.some((c, i) => c !== r.player[i]) || dealerAll[1] !== r.dealer[1]),
    out: done ? r.out : null, slips,
  };
}
