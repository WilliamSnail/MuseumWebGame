// ================================================================
//  第 3 版的新系統：工坊升級、融合室、職業與技能、地下收藏庫、每週特展、交換碼、修復台
//  （一樣只有規則，不碰畫面）
// ================================================================

// ---------- 系統 K：工坊升級 ----------
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { CELLAR_POWER, CELLAR_REWARDS, EXHIBITS, MOOD_BEATS, NUM, PILLOW_PARTS, RECIPES, SKILLS, UPGRADES, WEEKLY_IDS } from "./config.js";
import { settleWeekShow } from "./themeshow.js";
import { BOOK_SEQUELS, CELLAR, JOBS, RECIPE_TEXT, UNDERSTAND_FALLBACK, UNDERSTAND_TEXT } from "./content3.js";
import { CATS, CORE_CATS, CORE_TOTAL, DECO_CATS, KIND_CODE, PILLOW_CATS, PILLOW_TOTAL, RARITY_ORDER, RNG, ROLLED, addDays, addMyth, allChapters, allOpts, applySan, attrsOf, b64d, b64e, clampN, codexCount, dailyCommissions, decoOpen, describePepe, ensureBoardSize, finishMake, fromKey, gainSan, grantOption, hallItem, isFree, isUnlocked, knownTotal, normKey, normPillowKey, num, optOf, parseHallCode, parsePillowKey, partOf, pickOne, possibilities, progressEvents, rarityRank, rollD100, rollExpr, sanCheck, scoreItems, sortUnlocked, specAllows, todayStr, usable } from "./logic.js";
import { cellarDarkLoss, traitHits, traitSum, traitTag } from "./legacy.js";
import { friendTalent, learnFromFriend, trialWin } from "./shop.js";

export const hasUp = (P, id) => !!(P && P.upgrades && P.upgrades[id]);
export function hallSize(P) { return 6 + (hasUp(P, "ped7") ? 1 : 0) + (hasUp(P, "ped8") ? 1 : 0); }
export function visitorEvery(P) { return hasUp(P, "fame") ? NUM.visitorFame : NUM.visitorEvery; }
export function fusionLimit(P) { return NUM.fusionPerDay + (hasUp(P, "forge2") ? 3 : 0); }
export function upgradeState(P, id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return { state: "none" };
  if (hasUp(P, id)) return { state: "owned" };
  if (u.req && !hasUp(P, u.req)) return { state: "req", text: "要先買上一級" };
  return { state: "buy", cost: u.cost, ok: P.insp >= u.cost };
}
export function buyUpgrade(P, id) {
  const st = upgradeState(P, id);
  if (st.state !== "buy") return { ok: false, reason: st.state === "owned" ? "已經有了" : st.text || "還不能買" };
  if (!st.ok) return { ok: false, reason: `靈感不夠（要 ${st.cost}）` };
  P.insp -= st.cost;
  P.upgrades[id] = todayStr();
  if (id === "ped7" || id === "ped8") while (P.hall.length < hallSize(P)) P.hall.push(null);
  if (id === "board") ensureBoardSize(P);
  return { ok: true, events: progressEvents(P) };
}
// 骰子打磨：重擲十位那顆（不算孤注一擲）
export function rerollsLeft(P) { return hasUp(P, "dice") && P.day ? Math.max(0, NUM.diceRerolls - (P.day.rerolls || 0)) : 0; }
export function rerollTens(P, roll) {
  if (!rerollsLeft(P)) return null;
  P.day.rerolls = (P.day.rerolls || 0) + 1;
  const t = Math.floor(RNG() * 10), u = roll.faces[1];
  const total = t === 0 && u === 0 ? 100 : t * 10 + u;
  return { spec: "d100", total, faces: [t, u] };
}

// ---------- 系統 L：職業與技能（CoC：擲 d100 ≤ 技能值就成功） ----------
export const JOB_SKILL = { detective: "偵查", historian: "鑑賞", occultist: "神秘學", gambler: "幸運", artisan: "手工藝", salesman: "說服" };
export function jobInfo(id) {
  const j = typeof JOBS !== "undefined" ? JOBS.find(x => x.id === id) : null;
  return j || { id, name: id, skill: JOB_SKILL[id] };
}
export const jobSkill = id => (jobInfo(id) || {}).skill || JOB_SKILL[id];
export const hasTalent = (P, skill) => !!(P && !isFree(P) && P.job && jobSkill(P.job) === skill);
// 擲一位參觀者的技能：拿手的 56–65，其他 16–25（換人時的候選人先擲好，卡片上看得到；11-08）
export function rollSkills(id) {
  const main = jobSkill(id), out = {};
  SKILLS.forEach(s => { out[s] = s === main ? NUM.skillMainBase + rollExpr(NUM.skillMain).total : NUM.skillOtherBase + rollExpr(NUM.skillBase).total; });
  return out;
}
// skills：已經擲好的技能（候選人用）；沒給就現在擲
export function assignJob(P, id, skills) {
  P.job = id;
  P.skills = skills ? Object.assign({}, skills) : rollSkills(id);
  const main = jobSkill(id);
  P.skillTicks = {};
  const out = { main, value: P.skills[main] };
  // 賭徒：開場的心情擲兩次取高
  if (id === "gambler") {
    const r = rollExpr("3D6"), again = r.total * 5;
    out.moodAgain = { roll: r, value: again, before: P.mood };
    if (again > P.mood) { P.mood = again; P.moodRoll = r.faces; }
  }
  return out;
}
// 技能值：加上穿著的裝備（放大鏡這種，欄位 "skill:偵查"，決定 0032）。成長、傳下去看的是 P.skills 本身，不算裝備
export const skillOf = (P, s) => Math.min(99, ((P && P.skills && P.skills[s]) || 15) + traitSum(P, "skill:" + s));
export function skillCheck(P, s, mod = 0) {
  if (!P || isFree(P)) return { skill: s, success: false, skip: true };
  const target = clampN(skillOf(P, s) + mod, 1, 99);
  const roll = rollD100();
  const success = roll.total <= target;
  if (success) P.skillTicks[s] = true;
  return { skill: s, roll, target, success };
}
// 技能成長（CoC 的經驗檢定）：昨天用成功過的技能，擲 d100 比技能值大就 +1D10
export function skillGrowth(P) {
  if (!P.skills) return [];
  const out = [];
  Object.keys(P.skillTicks || {}).forEach(s => {
    const roll = rollD100();
    const up = roll.total > P.skills[s];
    const rolled = up ? rollExpr("1D10").total : 0;
    // 小優點「學得快」、小缺點「慢熱」（11-08）：成長的時候多長或少長幾點，最少還是 +1
    const adj = up ? traitSum(P, "growth") : 0;
    const before = P.skills[s];
    if (up) P.skills[s] = Math.min(99, before + Math.max(1, rolled + adj));
    const gain = P.skills[s] - before;
    out.push({ skill: s, roll, up, gain, value: P.skills[s], rolled, adj: up ? gain - Math.min(99 - before, rolled) : 0 });
  });
  P.skillTicks = {};
  return out;
}

// ---------- 系統 J：融合室（配種） ----------
export const pairIdOf = (a, b) => [a.kind + ":" + a.key, b.kind + ":" + b.key].sort().join("&");
export function fusionLeft(P) { return isFree(P) ? 99 : Math.max(0, fusionLimit(P) - ((P.day && P.day.fusions) || 0)); }
// 融合一次要幾靈感：小優點「精打細算」少 1、小缺點「坐不住」多 1（11-08）
export function fusionPrice(P) { return isFree(P) ? 0 : Math.max(0, NUM.fusionCost + traitSum(P, "fusion")); }
export function fusionItem(P, item) {
  if (!item) return null;
  if (item.kind === "pepe" && P.pepes[item.key]) return Object.assign({ pick: fromKey(item.key), perfect: !!P.pepes[item.key].perfect }, item);
  return null;
}
export function canFuse(P, a, b) {
  const A = fusionItem(P, a), B = fusionItem(P, b);
  if (!A || !B) return { ok: false, reason: "把兩隻佩佩放上融合台" };
  if (A.key === B.key && (P.pepes[A.key].n || 1) < 2) return { ok: false, reason: "同一隻要有兩隻才能自己跟自己融合（再做一隻一樣的）" };
  if (!isFree(P)) {
    if (!fusionLeft(P)) return { ok: false, reason: `今天的融合次數用完了（一天 ${fusionLimit(P)} 次）` };
    if (P.day.pairs[pairIdOf(A, B)]) return { ok: false, reason: "這一對今天已經融合過了" };
    if (P.insp < fusionPrice(P)) return { ok: false, reason: `靈感不夠（融合一次要 ${fusionPrice(P)}）` };
  }
  return { ok: true, A, B };
}
export function needFits(need, pick) { return Object.keys(need || {}).every(c => specAllows(need[c], pick[c])); }
export function matchRecipe(A, B) {
  for (const r of RECIPES) {
    if (r.same) { if (A.key === B.key) return r; continue; }
    if ((needFits(r.a, A.pick) && needFits(r.b, B.pick)) || (needFits(r.a, B.pick) && needFits(r.b, A.pick))) return r;
  }
  return null;
}
export function fusionChances() { return { a: NUM.inherit, b: NUM.inherit, mutate: Math.max(0, 100 - NUM.inherit * 2) }; }
// 融合分成三步（多人版 M3，11-08 拆開，給「兩個人一起融合」用）：扣靈感和次數 → 算小孩 → 記配方、打開選項。
// 一個人融合（startFusion）照原本的順序叫，亂數用的順序跟以前一樣，模擬結果不變。
export function chargeFusion(P, A, B) {
  if (!isFree(P)) { P.insp -= fusionPrice(P); P.day.fusions = (P.day.fusions || 0) + 1; P.day.pairs[pairIdOf(A, B)] = true; }
}
// 算小孩（不扣東西、不打開選項）。突變沒有專用選項時，從 P 能用的選項裡挑。
export function fusionChild(P, A, B) {
  const recipe = matchRecipe(A, B);
  const child = {}, mutations = [], from = {};
  CATS.filter(c => c !== ROLLED).forEach(c => {
    const r = RNG() * 100;
    if (r < NUM.inherit) { child[c] = A.pick[c]; from[c] = "a"; return; }
    if (r < NUM.inherit * 2) { child[c] = B.pick[c]; from[c] = "b"; return; }
    // 突變：這一類有突變選項就用它，沒有就隨便換一個能用的
    const mut = partOf(c).options.filter(o => o.mutant).map(o => o.name);
    const pool = mut.length ? mut : usable(P, c);
    child[c] = pickOne(pool);
    from[c] = "m";
    mutations.push({ cat: c, name: child[c] });
  });
  let fixed = null, minRarity = null, title = null, san = NUM.fusionSan;
  if (recipe) {
    Object.assign(child, recipe.child || {});
    Object.keys(recipe.child || {}).forEach(c => { from[c] = "r"; });
    if (recipe.same) CATS.filter(c => c !== ROLLED).forEach(c => { child[c] = A.pick[c]; from[c] = "r"; });
    if (recipe.upTier) fixed = RARITY_ORDER[Math.min(rarityRank(A.pick[ROLLED]) + 1, RARITY_ORDER.indexOf("傳說級稀有"))];
    if (recipe.fixed) fixed = recipe.fixed;
    if (recipe.minRarity) minRarity = recipe.minRarity;
    if (recipe.san) san = recipe.san;
    const rt = typeof RECIPE_TEXT !== "undefined" && RECIPE_TEXT[recipe.id];
    title = rt ? rt.name : recipe.id;
  }
  child[ROLLED] = A.pick[ROLLED];
  const blood = [A, B].filter(x => rarityRank(x.pick[ROLLED]) >= 1).length * NUM.blood;
  return { child, from, mutations, recipe, title, fixed, minRarity, blood, san };
}
// 融合的結果記到 P：配方第一次發現；小孩身上出現的突變、配方選項當場打開（以後手作坊也能用）
export function fusionLearn(P, core) {
  const events = [];
  if (core.recipe && !P.recipes[core.recipe.id]) { P.recipes[core.recipe.id] = todayStr(); events.push({ type: "recipe", id: core.recipe.id, name: core.title }); }
  CATS.filter(c => c !== ROLLED).forEach(c => {
    const o = optOf(c, core.child[c]);
    if (o && (o.mutant || isUnlocked(P, c, core.child[c]) === false && (core.from[c] === "r" || core.from[c] === "m"))) events.push(...grantOption(P, c, core.child[c], o.mutant ? "mutant" : "recipe"));
  });
  return events;
}
export function startFusion(P, a, b) {
  const can = canFuse(P, a, b);
  if (!can.ok) return can;
  const { A, B } = can;
  chargeFusion(P, A, B);
  const core = fusionChild(P, A, B);
  const events = fusionLearn(P, core);
  return { ok: true, child: core.child, from: core.from, mutations: core.mutations, recipe: core.recipe ? core.recipe.id : null, title: core.title, fixed: core.fixed, minRarity: core.minRarity, blood: core.blood, san: core.san, roll: core.fixed ? null : rollD100(), events };
}

// ---------- 兩個人一起融合（多人版 M3，翊文 11-08：「好了，可以做多人遊戲模式了」） ----------
// A 是 PA 收藏裡的佩佩、B 是 PB 收藏裡的。對方的佩佩只拿來算，不會被拿走。
// 各自扣自己的靈感和融合次數、各自擲理智；小孩一樣，兩個人都拿到。
// 稀有度的骰子只擲一次（大家看到同一顆），血統自動用掉，不能花心情壓骰子。理智用完的那個人拿不到（跟一個人融合一樣）。
export function canFuseOne(P, item) {
  if (!P || isFree(P)) return { ok: false, reason: "要在挑戰模式才能壹起融合" };
  const A = fusionItem(P, item);
  if (!A) return { ok: false, reason: "這隻佩佩不在收藏裡" };
  if (P.dark) return { ok: false, reason: "燈熄了，什麼都看不到" };
  if (!fusionLeft(P)) return { ok: false, reason: `今天的融合次數用完了（壹天 ${fusionLimit(P)} 次）` };
  if (P.insp < fusionPrice(P)) return { ok: false, reason: `靈感不夠（融合壹次要 ${fusionPrice(P)}）` };
  return { ok: true, A };
}
export function fuseTogether(PA, a, PB, b) {
  const ca = canFuseOne(PA, a), cb = canFuseOne(PB, b);
  if (!ca.ok) return { ok: false, who: "a", reason: ca.reason };
  if (!cb.ok) return { ok: false, who: "b", reason: cb.reason };
  const A = ca.A, B = cb.A;
  if (PA.day.pairs[pairIdOf(A, B)]) return { ok: false, who: "a", reason: "這壹對今天已經融合過了" };
  if (PB.day.pairs[pairIdOf(A, B)]) return { ok: false, who: "b", reason: "這壹對今天已經融合過了" };
  chargeFusion(PA, A, B);
  chargeFusion(PB, A, B);
  const core = fusionChild(PA, A, B);
  const roll = core.fixed ? null : rollD100();
  const fusion = { blood: core.blood, minRarity: core.minRarity, title: core.title, recipe: core.recipe ? core.recipe.id : null, fixed: core.fixed };
  const out = { ok: true, child: core.child, from: core.from, mutations: core.mutations, recipe: fusion.recipe, title: core.title, fixed: core.fixed, roll };
  [[PA, "a"], [PB, "b"]].forEach(([P, side]) => {
    const events = fusionLearn(P, core);
    const sc = sanCheck(P, core.san, "fusion");
    const sanEv = applySan(P, sc.loss, "fusion");
    const made = sanEv.zero ? null : core.fixed
      ? finishMake(P, core.child, { natural: 50, fusion })
      : finishMake(P, core.child, { natural: roll.total, spent: core.blood, pushed: 0, fusion });
    out[side] = { events: events.concat(made ? made.events : []), san: { roll: sc.roll.total, success: sc.success, loss: sanEv.loss, zero: sanEv.zero, indef: sanEv.indef }, made };
  });
  // 跟館友學（決定 0032）：對方拿手的技能比你高，有機會 +1。放在最後：骰子不影響上面算好的小孩、理智。理智用完的人學不到
  // 兩個人比的都是融合之前的技能（同一次 A 學完不會影響 B）
  const ta = friendTalent(PA), tb = friendTalent(PB);
  out.a.learn = out.a.san.zero ? null : learnFromFriend(PA, tb);
  out.b.learn = out.b.san.zero ? null : learnFromFriend(PB, ta);
  return out;
}

// ---------- 系統 M：地下收藏庫 ----------
export const cellarFloor = n => (typeof CELLAR !== "undefined" ? CELLAR : []).find(f => f.floor === n) || null;
export const cellarFloors = () => (typeof CELLAR !== "undefined" ? CELLAR : []).map(f => f.floor);
export function teamItems(P, keys) { return (keys || []).map(k => { const e = P.pepes[k]; return e ? { kind: "pepe", key: k, pick: fromKey(k), perfect: !!e.perfect } : null; }).filter(Boolean); }
export function canStartCellar(P, floor, keys) {
  if (!cellarFloor(floor)) return { ok: false, reason: "這一層還沒開放" };
  if (floor > (P.cellar.best || 0) + 1) return { ok: false, reason: `要先走過 B${floor - 1}` };
  const team = teamItems(P, keys);
  if (team.length !== 3 || new Set(keys).size !== 3) return { ok: false, reason: "要帶 3 隻不一樣的佩佩" };
  const hurt = team.find(t => P.injured[t.key]);
  if (hurt) return { ok: false, reason: `「${describePepe(hurt.pick).title}」受傷了，還不能下去` };
  return { ok: true, team };
}
export function startCellar(P, floor, keys) {
  const can = canStartCellar(P, floor, keys);
  if (!can.ok) return can;
  P.cellar.run = { floor, idx: 0, team: keys.slice(), used: {}, log: [] };
  if (P.visit) P.visit.deepest = Math.max(P.visit.deepest || 0, floor); // 這一位走到地下第幾層（歷任參觀者牆，11-08）
  return { ok: true };
}
export function currentRoom(P) {
  const run = P.cellar.run;
  if (!run) return null;
  if (run.extra) return run.extra; // 每週劇情多出來的一間（shared/story.js 的 startStoryRoom）：只走這一間
  const f = cellarFloor(run.floor);
  return f ? f.rooms[run.idx] || null : null;
}
// 一隻佩佩在這個房間的強度
export function memberPower(it, room) {
  const p = it.pick;
  let s = (CELLAR_POWER[p[ROLLED]] ?? 1) + (it.perfect ? CELLAR_POWER.perfect : 0);
  if (room && room.mood) {
    if (MOOD_BEATS[p.心情] === room.mood) s *= 2;
    else if (MOOD_BEATS[room.mood] === p.心情) s = Math.max(0, s - 1);
  }
  if (room && room.color && p.顏色 === room.color) s += 1;
  if (p.姿勢 === "倒立") s += 1;
  return s;
}
export function teamPower(P, team, room) {
  const parts = team.map(it => ({ it, s: memberPower(it, room) }));
  let total = parts.reduce((n, x) => n + x.s, 0);
  const notes = [];
  if (team.some(it => it.pick.姿勢 === "比讚")) { total += team.length; notes.push("比讚鼓舞全隊 +" + team.length); }
  if (team.some(it => it.pick.帽子 === "巫師帽")) { total += 2; notes.push("巫師帽的魔法 +2"); }
  if (team.some(it => it.pick.帽子 === "觸手帽")) { total += 5; notes.push("觸手帽 +5（要付理智）"); }
  // 小優點「力氣大」、小缺點「沒力氣」（11-08）
  traitHits(P, "power").forEach(t => { total = Math.max(0, total + t.v); notes.push(traitTag(t)); });
  return { total, parts, notes };
}
export const teamHas = (team, cat, v) => team.some(it => it.pick[cat] === v);
// 選一個行動：擲骰、算結果（理智檢定的骰子交給畫面那邊擲，這裡只負責「強度」和「技能」）
export function cellarResolve(P, choiceIdx) {
  const run = P.cellar.run, room = currentRoom(P);
  if (!run || !room) return null;
  const ch = room.choices[choiceIdx];
  if (!ch) return null;
  const team = teamItems(P, run.team);
  const out = { room, choice: ch, type: ch.check.type, success: true, roll: null, total: null, target: null, rerolled: false, notes: [], extraSan: null };
  const once = id => { if (run.used[id]) return false; run.used[id] = true; return true; };
  if (ch.check.type === "power") {
    const tp = teamPower(P, team, room);
    const rollOnce = () => rollExpr("1D10");
    out.roll = rollOnce();
    out.power = tp.total; out.notes = tp.notes;
    out.target = ch.check.target;
    out.total = tp.total + out.roll.total;
    out.success = out.total >= out.target;
    if (!out.success && teamHas(team, "帽子", "皇冠") && once("crown")) {
      out.firstRoll = out.roll; out.roll = rollOnce(); out.total = tp.total + out.roll.total; out.success = out.total >= out.target; out.rerolled = true;
      out.notes.push("皇冠號令：重擲一次");
    }
    if (teamHas(team, "帽子", "觸手帽")) out.extraSan = "1D3";
  } else if (ch.check.type === "skill") {
    const mod = (ch.check.mod || 0) + (teamHas(team, "帽子", "紳士帽") ? 10 : 0);
    const sc = skillCheck(P, ch.check.skill, mod);
    out.roll = sc.roll; out.target = sc.target; out.skill = ch.check.skill; out.success = !!sc.success;
    if (mod !== (ch.check.mod || 0)) out.notes.push("紳士帽的禮貌 +10");
    if (!out.success && teamHas(team, "帽子", "皇冠") && once("crown")) {
      const again = skillCheck(P, ch.check.skill, mod); out.firstRoll = out.roll; out.roll = again.roll; out.success = !!again.success; out.rerolled = true;
      out.notes.push("皇冠號令：重擲一次");
    }
  } else if (ch.check.type === "san") {
    out.sanSpec = ch.check.spec; // 畫面那邊用理智檢定流程擲，結果再交回 cellarApply
  }
  return out;
}
// 套用結果（insp、理智得失、神話、受傷）。sanSuccess：理智檢定類型的成功與否由畫面那邊傳回來
export function cellarApply(P, res, sanSuccess) {
  const run = P.cellar.run, room = res.room;
  const success = res.type === "san" ? !!sanSuccess : res.success;
  const o = (success ? res.choice.success : res.choice.fail) || {};
  const team = teamItems(P, run.team);
  const fx = { success, text: o.text || "", insp: 0, sanLoss: 0, sanGain: 0, myth: 0, injured: null, blocked: [], events: [] };
  const once = id => { if (run.used[id]) return false; run.used[id] = true; return true; };
  const firstWin = success && !P.cellar.won[room.id];
  const firstClear = !P.cellar.cleared[room.id]; // 第一次走這個房間（回理智只算第一次，不能一直下去刷）
  if (o.insp) { fx.insp = firstWin ? o.insp : NUM.cellarRepeatInsp; if (!isFree(P)) P.insp += fx.insp; }
  if (success) P.cellar.won[room.id] = true;
  if (success && room.trial) fx.trial = trialWin(P, room); // 試煉房間過了：技能成長（決定 0032，shared/shop.js）
  if (o.san) {
    const s = String(o.san).trim();
    if (s.startsWith("+")) { fx.sanGain = isFree(P) || !firstWin ? 0 : gainSan(P, rollExpr(s.slice(1)).total); }
    else {
      const loss = rollExpr(s).total;
      if (loss > 0 && teamHas(team, "帽子", "棒球帽") && once("cap")) fx.blocked.push("棒球帽擋下了這一次");
      else fx.sanLoss = isFree(P) ? 0 : loss; // 真正扣理智交給畫面那邊（要跑看懂檢定、怪癖）
    }
  }
  if (res.extraSan && !isFree(P)) fx.sanLoss += rollExpr(res.extraSan).total;
  // 小缺點「怕黑」（11-08）：有扣理智就多扣；裝備「探險燈」（決定 0032）：少扣
  const dark = cellarDarkLoss(P, fx.sanLoss);
  if (dark) { fx.sanLoss += dark; fx.dark = dark; }
  if (o.myth && !isFree(P)) { fx.myth = o.myth; fx.events.push(...addMyth(P, o.myth)); }
  if (o.injure && !isFree(P)) {
    if (teamHas(team, "姿勢", "斯拉夫蹲") && once("squat")) fx.blocked.push("斯拉夫蹲穩住了，沒有人被推倒");
    else if (teamHas(team, "帽子", "棒球帽") && once("cap")) fx.blocked.push("棒球帽擋下了這一次");
    else {
      const hurt = pickOne(team);
      if (hurt) { fx.injureDays = injureDaysOf(P); P.injured[hurt.key] = addDays(P.day.date, fx.injureDays); fx.injured = hurt; }
    }
  }
  // 躺平的、戴毛帽的：每一層第一次走的時候回 1D3 理智（各一次）。試煉房間不算（不能靠它回理智，決定 0032）
  if (!isFree(P) && firstClear && !room.trial) {
    if (teamHas(team, "姿勢", "躺平") && once("rest")) { fx.sanGain += gainSan(P, rollExpr(NUM.cellarRest).total); fx.rested = "躺平"; }
    if (teamHas(team, "帽子", "毛帽") && once("beanie")) { fx.sanGain += gainSan(P, rollExpr(NUM.cellarRest).total); fx.rested = (fx.rested ? fx.rested + "、" : "") + "毛帽"; }
  }
  P.cellar.cleared[room.id] = true;
  run.log.push({ room: room.id, success });
  return fx;
}
// 走到下一個房間；整層走完給獎勵
export function cellarAdvance(P) {
  const run = P.cellar.run;
  if (!run) return null;
  if (run.extra) { P.cellar.run = null; return { floorDone: false, extra: true }; } // 每週劇情多出來的那一間：走完就回地面，不算整層
  run.idx++;
  const f = cellarFloor(run.floor);
  if (run.idx < f.rooms.length) return { floorDone: false };
  const floor = run.floor;
  const first = !P.cellar.floorsDone[floor];
  P.cellar.floorsDone[floor] = P.cellar.floorsDone[floor] || todayStr();
  P.cellar.best = Math.max(P.cellar.best || 0, floor);
  const out = { floorDone: true, floor, first, reward: null, events: [], ending: null, next: cellarFloor(floor + 1) ? floor + 1 : null };
  if (first) {
    const r = CELLAR_REWARDS[floor] || {};
    out.reward = r;
    if (r.insp && !isFree(P)) P.insp += r.insp;
    if (r.unlock) out.events.push(...grantOption(P, r.unlock[0], r.unlock[1], "cellar"));
    if (r.key) {
      P.keys[r.key] = todayStr();
      const before = possibilities(P);
      CATS.forEach(c => partOf(c).options.forEach(o => { if (o.key === r.key && !isUnlocked(P, c, o.name)) { P.unlocked[c].push(o.name); sortUnlocked(P, c); } }));
      out.events.push({ type: "key", key: r.key, from: before, to: possibilities(P), total: knownTotal(P) });
    }
    if (r.book) { P.keys[r.book] = todayStr(); out.events.push({ type: "book", id: r.book }); P.news.origin = true; }
    if (r.ending) out.ending = r.ending;
    if (out.next) out.events.push({ type: "floor", floor: out.next }); // 下壹層開放了（11-08：地下收藏庫的樓層牌子標「新」）
  }
  if (out.next && P.visit) P.visit.deepest = Math.max(P.visit.deepest || 0, out.next); // 接著往下走（歷任參觀者牆，11-08）
  out.events.push(...progressEvents(P));
  P.cellar.run = Object.assign(run, { idx: 0, floor: out.next || floor, used: {} });
  if (!out.next) P.cellar.run = null;
  return out;
}
export function leaveCellar(P) { P.cellar.run = null; }
// 受傷的隊員幾天後自己好：小優點「手腳俐落」早 1 天、小缺點「手滑」晚 1 天，最少 1 天（11-08）
export function injureDaysOf(P) { return Math.max(1, NUM.injureDays + traitSum(P, "injure")); }

// ---------- 大廳導覽圖：每間房的進度（翊文 11-08 選「導覽圖標進度」） ----------
// 回傳 { 房間: { text, pct（0–1，沒有就不畫條）, done, steps（地下收藏庫亮幾階樓梯） } }
export function roomProgress(P) {
  const free = isFree(P), out = {};
  const frac = (a, b, label) => { const done = b > 0 && a >= b; return { text: `${done ? "✓ " : ""}${label} ${num(a)}／${num(b)}`, pct: b ? a / b : 0, done }; };
  out.gallery = frac(EXHIBITS.filter(e => P.seen[e.id]).length, EXHIBITS.length, "看過");
  const chs = [0].concat(allChapters().map(c => c.id));
  out.origin = frac(chs.filter(id => P.chaptersRead[id]).length, chs.length, "讀過");
  if (!free) {
    // 跟手作坊頁籤上的數字一樣算：禁忌選項打開了才算進去
    let a = 0, b = 0;
    CATS.filter(c => !partOf(c).deco || decoOpen(P, c)).forEach(c => {
      const all = allOpts(c).filter(n => !(optOf(c, n).forbidden || optOf(c, n).limited) || isUnlocked(P, c, n)); // 簽到限定的（決定 0030）拿到了才算
      b += all.length; a += all.filter(n => isUnlocked(P, c, n)).length;
    });
    out.workshop = frac(a, b, "選項");
  }
  out.fusion = frac(RECIPES.filter(r => P.recipes && P.recipes[r.id]).length, RECIPES.length, "配方");
  const kinds = new Set(Object.keys(P.pillows).map(k => parsePillowKey(k)).filter(pp => !PILLOW_CATS.some(cc => (PILLOW_PARTS.find(p => p.name === cc).options.find(o => o.name === pp.pick[cc]) || {}).limited)).map(pp => pp.base)); // 星光絨的抱枕不算（PILLOW_TOTAL 不算它，決定 0030）
  out.pillow = frac(kinds.size, PILLOW_TOTAL, "抱枕");
  if (P.day) { const list = dailyCommissions(P, P.day.date); out.commission = frac(list.filter(c => c.done).length, list.length, "今天"); }
  out.hall = frac(P.hall.filter(Boolean).length, hallSize(P), "展台");
  out.codex = frac(codexCount(P), CORE_TOTAL, "收藏");
  if (!free) out.office = frac(UPGRADES.filter(u => hasUp(P, u.id)).length, UPGRADES.length, "升級");
  const best = (P.cellar && P.cellar.best) || 0, floors = cellarFloors().length;
  out.cellar = { text: best ? `${best >= floors ? "✓ " : ""}走到 B${best}／B${floors}` : "還沒下去", pct: null, steps: best, done: best >= floors };
  return out;
}

// ---------- 禁書的續集（翊文 11-08） ----------
export const bookSequels = () => (typeof BOOK_SEQUELS !== "undefined" ? BOOK_SEQUELS : []);
export function sequelCondition(P, s) {
  if (s.need === "gopnikSquat") return Object.keys(P.pepes).some(k => { const p = fromKey(k); return !!p && p.心情 === "俄國8+9" && p.姿勢 === "斯拉夫蹲"; });
  if (s.need === "hallGopnik") return P.hall.length > 0 && P.hall.every(it => it && it.kind === "pepe" && (fromKey(it.key) || {}).心情 === "俄國8+9");
  if (s.need === "cellarEnd") return !!(P.cellar && P.cellar.best >= 5);
  return false; // idleOrigin（在起源室什麼都不做）、codexBeyond（圖鑑最後壹格的下壹格）：畫面那邊直接打開
}
export const sequelOpen = (P, s) => isFree(P) || !!(P.keys && P.keys[s.id]);
export const sequelVisible = (P, s) => isFree(P) || !!P.mythFrom[s.after] || sequelOpen(P, s); // 讀過上壹本，書架上才會出現蓋著的這本
export function unlockSequel(P, id) {
  const s = bookSequels().find(x => x.id === id);
  if (!s || sequelOpen(P, s)) return [];
  P.keys[id] = todayStr(); P.news.origin = true;
  return [{ type: "book", id, title: s.title }];
}
export function sequelEvents(P) {
  if (isFree(P)) return [];
  const ev = [];
  bookSequels().forEach(s => { if (!sequelOpen(P, s) && P.mythFrom[s.after] && sequelCondition(P, s)) ev.push(...unlockSequel(P, s.id)); });
  return ev;
}

// ---------- 修復台（升級後才有） ----------
export function repairFailed(P, key) {
  if (!hasUp(P, "repair")) return { ok: false, reason: "要先在館長室買「修復台」" };
  if (!P.failed[key]) return { ok: false, reason: "收藏裡沒有這件失敗作" };
  if (P.insp < NUM.repairCost) return { ok: false, reason: `靈感不夠（修一件要 ${NUM.repairCost}）` };
  P.insp -= NUM.repairCost;
  const check = skillCheck(P, "手工藝", 20);
  if (isFree(P) || check.success) {
    P.failed[key]--; if (P.failed[key] <= 0) delete P.failed[key];
    P.repaired[key] = (P.repaired[key] || 0) + 1;
    return { ok: true, fixed: true, check, events: progressEvents(P) };
  }
  return { ok: true, fixed: false, check };
}
export function healInjured(P, key) {
  if (!hasUp(P, "repair")) return { ok: false, reason: "要先在館長室買「修復台」" };
  if (!P.injured[key]) return { ok: false, reason: "牠沒有受傷" };
  if (P.insp < NUM.healCost) return { ok: false, reason: `靈感不夠（要 ${NUM.healCost}）` };
  P.insp -= NUM.healCost;
  delete P.injured[key];
  return { ok: true };
}

// ---------- 每週特展 ----------
// 第幾週：從星期一算起。dateStr 是 todayStr() 給的日期（台灣時間 05:00 換日），所以換週是台灣時間週一 05:00（決定 0019）：
// 週一 04:59 還是星期日的日期，算上一週。1970-01-01 是星期四，加 3 天讓 1970-01-05（星期一）變成第 1 週的第一天
export function weekIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 3; // 讓每一週從星期一開始
  return Math.floor(days / 7);
}
export function weeklyTheme(dateStr) { return WEEKLY_IDS[((weekIndex(dateStr) % WEEKLY_IDS.length) + WEEKLY_IDS.length) % WEEKLY_IDS.length]; }
export function weeklyState(P) {
  const date = P.day ? P.day.date : todayStr();
  const w = weekIndex(date);
  if (!P.weekly || P.weekly.w !== w) {
    if (P.weekly && P.weekly.w < w) settleWeekShow(P, P.weekly, date); // 換週：照上週的最高分結算（決定 0035，shared/themeshow.js）
    P.weekly = { w, theme: weeklyTheme(date), slots: [null, null, null, null, null, null], best: 0 };
  }
  return P.weekly;
}
export function weeklyAllows(theme, it) {
  if (!it) return false;
  const a = attrsOf(it);
  const startOpt = (c, v) => !!(optOf(c, v) || {}).start;
  switch (theme) {
    case "start32": return !!a && !a.failed && CORE_CATS.every(c => startOpt(c, a[c])) && DECO_CATS.every(c => a[c] === "沒有");
    case "allBlack": return !!a && a.顏色 === "黑";
    case "allFlat": return !!a && a.姿勢 === "躺平";
    case "failedOnly": return it.kind === "failed";
    case "noHat": return !!a && a.帽子 === "沒有";
    case "noLegend": return !!a && !["傳說級稀有", "不可名狀"].includes(a[ROLLED]);
    case "pillowWeek": return it.kind === "pillow";
    case "gopnikWeek": return !!a && a.心情 === "俄國8+9";
    default: return true;
  }
}
export function placeWeekly(P, idx, item) {
  const W = weeklyState(P);
  const it = hallItem(P, item);
  if (!it) return { ok: false, reason: "收藏裡沒有這件" };
  if (!weeklyAllows(W.theme, it)) return { ok: false, reason: "這件不符合本週特展的規定" };
  W.slots = W.slots.map(s => s && s.kind === item.kind && s.key === item.key ? null : s);
  W.slots[idx] = { kind: item.kind, key: item.key };
  const s = scoreItems(W.slots.map(x => hallItem(P, x)));
  const isBest = s.score > W.best;
  if (isBest) W.best = s.score;
  return { ok: true, score: s.score, best: W.best, isBest };
}
export function weeklyCode(P) {
  const W = weeklyState(P);
  const items = W.slots.map(s => { const it = hallItem(P, s); return it ? [KIND_CODE[it.kind], it.key, it.perfect ? 1 : 0] : 0; });
  return "PEPEWEEK1." + b64e(JSON.stringify({ v: 1, w: W.w, t: W.theme, s: W.best, n: P.visitor, i: items }));
}
export function parseWeeklyCode(code) {
  try {
    const s = String(code).trim();
    if (!s.startsWith("PEPEWEEK1.")) return null;
    const o = JSON.parse(b64d(s.slice(10)));
    if (!o || !Array.isArray(o.i)) return null;
    const hall = parseHallCode("PEPEHALL1." + b64e(JSON.stringify({ v: 1, i: o.i })));
    return hall ? { week: o.w, theme: o.t, best: o.s, items: hall.items } : null;
  } catch (e) { return null; }
}

// ---------- 交換碼：把一件作品變成一串字送人 ----------
export function giftCode(P, item) {
  const it = hallItem(P, item);
  if (!it) return null;
  const id = Math.floor(RNG() * 36 ** 8).toString(36).padStart(8, "0");
  const e = it.kind === "pepe" ? P.pepes[it.key] : null;
  return "PEPEGIFT1." + b64e(JSON.stringify({ v: 1, id, k: KIND_CODE[it.kind], key: it.key, p: it.perfect ? 1 : 0, t: e && e.title || null, from: P.visitor }));
}
export function receiveGift(P, code) {
  try {
    const s = String(code).trim();
    if (!s.startsWith("PEPEGIFT1.")) return { ok: false, reason: "bad" };
    const o = JSON.parse(b64d(s.slice(10)));
    const kinds = { p: "pepe", f: "failed", l: "pillow", r: "repaired" };
    const kind = kinds[o && o.k];
    if (!kind || typeof o.key !== "string" || typeof o.id !== "string") return { ok: false, reason: "bad" };
    if (P.giftsIn[o.id]) return { ok: false, reason: "already" };
    if (kind === "pillow") { if (!parsePillowKey(o.key).pick) return { ok: false, reason: "bad" }; }
    else if (!fromKey(o.key)) return { ok: false, reason: "bad" };
    const key = kind === "pillow" ? normPillowKey(o.key) : normKey(o.key);
    P.giftsIn[o.id] = todayStr();
    if (kind === "pepe") {
      const e = P.pepes[key];
      if (e) { e.n++; if (o.p) e.perfect = true; }
      else P.pepes[key] = Object.assign({ n: 1, perfect: !!o.p, s: ++P.serial, d: todayStr(), gift: true }, o.t ? { title: o.t } : {});
    } else if (kind === "failed") P.failed[key] = (P.failed[key] || 0) + 1;
    else if (kind === "repaired") P.repaired[key] = (P.repaired[key] || 0) + 1;
    else P.pillows[key] = (P.pillows[key] || 0) + 1;
    return { ok: true, kind, key, title: o.t, events: progressEvents(P) };
  } catch (e) { return { ok: false, reason: "bad" }; }
}

// ---------- 看懂檢定：看懂了什麼（翊文 11-08）。文字在 content3.js 的 UNDERSTAND_TEXT ----------
// src：展品 id、"book:書的 id"、"cellar:房間 id"（取第壹個字當層數）、"fusion"、"push"
export function understandId(src) {
  const s = String(src || "");
  if (s.startsWith("book:")) return s.slice(5);
  if (s.startsWith("cellar:")) return "cellar" + s.slice(7, 8);
  return s;
}
export function understandLine(P, src) {
  P.understood = P.understood || {};
  const id = understandId(src), e = UNDERSTAND_TEXT.find(x => x.id === id), total = UNDERSTAND_TEXT.length;
  const count = () => UNDERSTAND_TEXT.filter(x => P.understood[x.id]).length;
  if (!e) return { id: null, from: "", text: pickOne(UNDERSTAND_FALLBACK), isNew: false, n: count(), total };
  const isNew = !P.understood[id];
  if (isNew) P.understood[id] = todayStr();
  if (P.visit) { P.visit.understood = P.visit.understood || {}; P.visit.understood[id] = true; } // 這一位看懂了幾件（歷任參觀者牆，11-08）
  return { id, from: e.from, text: e.text, isNew, n: count(), total };
}
