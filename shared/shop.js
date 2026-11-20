// ================================================================
//  兌換所和技能成長（決定 0032；草稿 docs/規劃/每週劇情.md 第十一節）
//  翊文 11-09：「每周任務集滿後可以換更高級的裝備，並且提升技能」
//             「6個職業的技能選好後要怎麼能增加也要想辦法」→ 選了四種：讀技能書（story.js）、委託櫃台上課、跟館友學、地下的試煉房間
//             「每一天就按著這個線繼續找方法加入遊戲內機制，例如某曾加入新的可以找的東西，限定版頭飾等等的」
//
//  放哪裡：
//    週章       P.story.stamps（story.js 的，不會過期）。
//    裝備       P.shop.gear = { 裝備 id: 買到的日期 }：博物館的，換人還在。
//    穿了什麼   P.gear = [裝備 id, …]：這一位的（在 VISITOR_KEYS 裡）。三位參觀者各穿各的，同一件可以都穿（一次只有一位在場）。
//               理智歸零、退休換人（nextVisitor）：同一個位子的下一位接著穿，不用再穿一次。空位子新來的一位從沒穿開始。
//    試煉房間   P.shop.trials = { 房間 id: { w: 週的號碼, n: 這週拿了幾次 } }：博物館的（換人不會多拿）。
//    每天的次數 P.day.lessons（今天上了幾堂）、P.day.learned（今天跟館友學會幾次）：跟融合次數一樣是博物館的。
//    限定頭飾   照 signin.js 的 LIMITED_ITEMS 那一套（P.limited、P.unlocked）。
//  效果：裝備的欄位跟小優缺點一樣，legacy.js 的 traitsOf 把穿著的裝備一起算進 traitSum（不用到處加判斷）。自由模式沒有裝備。
//  純函式：只改傳進來的 P，亂數用 RNG（rollExpr 裡），「今天」由呼叫的人傳（不傳就 todayStr()）。
//  數字在 config.js 的 NUM.shop、GEAR_ITEMS、LIMITED_ITEMS；文字在 systems_text.js 的 GEAR_TEXT、LIMITED_TEXT、SHOP_TEXT、TRIAL_ROOMS。
// ================================================================
import { LIMITED_ITEMS, NUM, SKILLS } from "./config.js";
import { GEAR_TEXT, SHOP_TEXT, TRIAL_ROOMS } from "./systems_text.js";
import { asList, canStartCellar, cellarFloor, gearItem, isFree, ownsGear, parseDice, rollExpr, shopObj, shopState, todayStr, weekIndex, wornGear } from "./logic_base.js";
import { jobSkill } from "./legacy.js";
import { grantLimited, limitedInfo, ownsLimited } from "./signin.js";
import { eventRunFix, eventScale } from "./events.js";
import { STORY_ITEMS, itemDesc, storyState } from "./story_state.js";

// ---------- 存檔 ----------
// 穿的清單整理乾淨：認得、有買、不重複、不超過上限
function cleanWorn(P, list) {
  const own = shopState(P).gear, out = [];
  asList(list).forEach(id => { if (gearItem(id) && own[id] && !out.includes(id) && out.length < NUM.shop.gearWorn) out.push(id); });
  return out;
}
// 舊存檔補欄位（fixProfile 最後叫）：沒有 P.shop、P.gear 的補空的；壞掉的、不認得的裝備拿掉
export function fixShop(P) {
  const S = shopState(P);
  Object.keys(S.gear).forEach(id => { if (!gearItem(id)) delete S.gear[id]; });
  Object.keys(S.trials).forEach(id => { const t = S.trials[id]; if (!shopObj(t) || !Number.isInteger(t.w) || !Number.isInteger(t.n)) delete S.trials[id]; });
  P.gear = cleanWorn(P, P.gear);
  asList(P.visitors).forEach(v => { if (shopObj(v)) v.gear = cleanWorn(P, v.gear); });
  return P;
}

// ---------- 技能：幾種成長都走這裡 ----------
// 骰子的範圍（畫面寫「+1～5」用）
export function rangeWords(spec) { const p = parseDice(spec); return p.m ? `${p.n}～${p.n * p.m}` : String(p.flat); }
// 指定一個技能加一個骰子（最多到 cap）。沒有技能（還沒選職業）回傳 null
// boost：限時活動（events.js 的 eventRunOf），有的話骰出來的點數乘上倍率（決定 0041）
export function growSkill(P, skill, spec, cap, boost) {
  if (!P || !P.skills || !SKILLS.includes(skill)) return null;
  const before = P.skills[skill] || 0, roll = rollExpr(spec), gain = eventScale(boost, roll.total);
  P.skills[skill] = Math.max(before, Math.min(cap, before + gain));
  return { skill, before, after: P.skills[skill], roll, boost: boost && gain !== roll.total ? boost : null };
}
// 價錢表：照現在的技能值找「低於 below」的第一列（最後一列當上限以上的）
function priceRow(table, value) { return table.find(r => value < r.below) || table[table.length - 1]; }

// ---------- 裝備 ----------
export function gearInfo(id) {
  const it = gearItem(id);
  if (!it) return null;
  const T = GEAR_TEXT[id] || {}, v = Object.values(it).find(x => typeof x === "number") || 0;
  return Object.assign({}, it, { name: T.name || id, desc: String(T.desc || "").split("{n}").join(String(Math.abs(v))), tierName: SHOP_TEXT.tiers[it.tier] || "", price: NUM.shop.gearPrice[it.tier] });
}
export const isWorn = (P, id) => wornGear(P).some(g => g.id === id);
// 買
export function buyGear(P, id, today = todayStr()) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式沒有裝備" };
  const it = gearInfo(id);
  if (!it) return { ok: false, reason: "沒有這件裝備" };
  if (ownsGear(P, id)) return { ok: false, reason: "已經有了" };
  const S = storyState(P);
  if (S.stamps < it.price) return { ok: false, reason: `週章不夠（要 ${it.price} 枚，你有 ${S.stamps} 枚）` };
  S.stamps -= it.price;
  shopState(P).gear[id] = today;
  return { ok: true, id, price: it.price };
}
// 穿上、脫下來
export function wearGear(P, id) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式沒有裝備" };
  if (!ownsGear(P, id)) return { ok: false, reason: "還沒有這件" };
  if (isWorn(P, id)) return { ok: true, already: true };
  if (wornGear(P).length >= NUM.shop.gearWorn) return { ok: false, reason: `最多穿 ${NUM.shop.gearWorn} 件，先脫下壹件` };
  P.gear = wornGear(P).map(g => g.id).concat(id);
  return { ok: true };
}
export function takeOffGear(P, id) {
  if (!P || !isWorn(P, id)) return { ok: false, reason: "沒有穿這件" };
  P.gear = wornGear(P).map(g => g.id).filter(x => x !== id);
  return { ok: true };
}

// ---------- 提升技能（花週章） ----------
const skillCapAll = () => NUM.story.skillCap; // 跟技能書同一個上限（決定 0032）
export const skillUpPrice = value => priceRow(NUM.shop.skillUpPrice, value).stamps;
// 現在能不能提升：{ ok, reason, value, cap, price }
export function skillUpState(P, skill) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式不用提升" };
  if (!P.skills || !SKILLS.includes(skill)) return { ok: false, reason: "這位參觀者還沒有技能（先選職業）" };
  const value = P.skills[skill] || 0, cap = skillCapAll(), price = skillUpPrice(value), have = storyState(P).stamps;
  if (value >= cap) return { ok: false, full: true, reason: `${skill}已經 ${cap} 了，再來要靠實戰`, value, cap, price };
  if (have < price) return { ok: false, reason: `週章不夠（要 ${price} 枚，你有 ${have} 枚）`, value, cap, price, short: price - have };
  return { ok: true, value, cap, price };
}
export function buySkillUp(P, skill) {
  const st = skillUpState(P, skill);
  if (!st.ok) return st;
  storyState(P).stamps -= st.price;
  return Object.assign({ ok: true, price: st.price }, growSkill(P, skill, NUM.shop.skillUp, st.cap));
}

// ---------- 委託櫃台上課（花靈感，一天一堂） ----------
export const lessonPrice = value => priceRow(NUM.shop.lessonPrice, value).insp;
export function lessonLeft(P) { return P && P.day && !isFree(P) ? Math.max(0, NUM.shop.lessonPerDay - (P.day.lessons || 0)) : 0; }
export function lessonState(P, skill) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式不用上課" };
  if (!P.skills || !SKILLS.includes(skill)) return { ok: false, reason: "這位參觀者還沒有技能（先選職業）" };
  const value = P.skills[skill] || 0, cap = NUM.shop.lessonCap, price = lessonPrice(value);
  if (value >= cap) return { ok: false, full: true, reason: `${skill}已經 ${cap} 了，櫃台教不了你更多`, value, cap, price };
  if (!lessonLeft(P)) return { ok: false, used: true, reason: `今天的課上完了（壹天 ${NUM.shop.lessonPerDay} 堂），明天 05:00 再來`, value, cap, price };
  if (P.insp < price) return { ok: false, reason: `靈感不夠（要 ${price}，你有 ${P.insp}）`, value, cap, price, short: price - P.insp };
  return { ok: true, value, cap, price };
}
export function takeLesson(P, skill) {
  const st = lessonState(P, skill);
  if (!st.ok) return st;
  P.insp -= st.price;
  P.day.lessons = (P.day.lessons || 0) + 1;
  return Object.assign({ ok: true, price: st.price }, growSkill(P, skill, NUM.shop.lessonSkill, st.cap));
}

// ---------- 地下的試煉房間 ----------
export const trialRooms = () => TRIAL_ROOMS.filter(r => cellarFloor(r.floor));
export const trialById = id => TRIAL_ROOMS.find(r => r.id === id) || null;
const dateOf = P => (P && P.day && P.day.date) || todayStr();
function trialUsed(P, id, date) { const t = shopState(P).trials[id]; return t && t.w === weekIndex(date) ? t.n : 0; }
// 這一間現在怎樣：{ state, reason, left }。state：open 可以挑戰、done 這週拿過了、locked 樓層還沒走過、full 技能到上限了、nojob 還沒有技能
export function trialState(P, id, date = dateOf(P)) {
  const r = trialById(id);
  if (!r || !P || isFree(P)) return { state: "none", reason: "沒有這間", left: 0 };
  const left = Math.max(0, NUM.shop.trialPerWeek - trialUsed(P, id, date));
  if (!((P.cellar && P.cellar.best) >= r.floor)) return { state: "locked", reason: `要先走過 B${r.floor}`, left };
  if (!P.skills) return { state: "nojob", reason: "這位參觀者還沒有技能（先選職業）", left };
  if ((P.skills[r.skill] || 0) >= skillCapAll()) return { state: "full", reason: `${r.skill}已經 ${skillCapAll()} 了，這間教不了你`, left };
  if (!left) return { state: "done", reason: "這週過了，下週壹 05:00 再來", left };
  return { state: "open", reason: "", left };
}
// 走進去：借單人地下收藏庫的流程走一間（P.cellar.run.extra，跟 story.js 的 startStoryRoom 一樣）
// boost：走進去這一刻正在進行的試煉活動（events.js 的 eventRunOf）；記在這一間裡，過關時照它算到走完
export function startTrial(P, id, keys, date = dateOf(P), boost = null) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式不下去" };
  const r = trialById(id), st = trialState(P, id, date);
  if (!r || st.state !== "open") return { ok: false, reason: st.reason || "沒有這間" };
  const can = canStartCellar(P, r.floor, keys);
  if (!can.ok) return can;
  const extra = { id: r.id, title: r.title, lines: asList(r.lines), mood: r.mood || null, color: r.color || null, choices: asList(r.choices), intro: r.intro || null, trial: r.skill, boost: boost && boost.kind === "trialBoost" ? eventRunFix(boost) : null };
  P.cellar.run = { floor: r.floor, idx: 0, team: keys.slice(), used: {}, log: [], extra };
  return { ok: true };
}
// 過關（systems.js 的 cellarApply 叫）：room.trial ＝哪個技能。給成長、記這週的次數。這週拿過了回傳 null
export function trialWin(P, room, date = dateOf(P)) {
  if (!P || isFree(P) || !room || !room.trial || trialUsed(P, room.id, date) >= NUM.shop.trialPerWeek) return null;
  const grown = growSkill(P, room.trial, NUM.shop.trialSkill, skillCapAll(), eventRunFix(room.boost));
  if (!grown) return null;
  shopState(P).trials[room.id] = { w: weekIndex(date), n: trialUsed(P, room.id, date) + 1 };
  return grown;
}

// ---------- 跟館友學 ----------
// 對方拿手的技能和他現在的值（技能本身，不算裝備）：{ skill, value }。還沒選職業回傳 null
export function friendTalent(F) {
  if (!F || !F.job || !F.skills) return null;
  const skill = jobSkill(F.job), value = F.skills[skill];
  return skill && typeof value === "number" ? { skill, value } : null;
}
// 一起融合完成時叫（systems.js 的 fuseTogether）。之後「參觀展廳」做好了，也叫這個：把館友的 friendTalent 傳進來就好（維護日誌寫了）。
// friend ＝ { skill, value }：對方這個技能比你高才有機會，機率 NUM.shop.learnChance，一天最多學會 NUM.shop.learnPerDay 次。
// 回傳 { skill, value（對方的）, from, to, gained, capped（今天學夠了）}；對方沒有比你高、自由模式回傳 null
export function learnFromFriend(P, friend) {
  if (!P || isFree(P) || !P.skills || !P.day || !friend || !SKILLS.includes(friend.skill)) return null;
  const from = P.skills[friend.skill] || 0;
  if (!(friend.value > from) || from >= skillCapAll()) return null;
  const out = { skill: friend.skill, value: friend.value, from, to: from, gained: false, capped: false };
  if ((P.day.learned || 0) >= NUM.shop.learnPerDay) { out.capped = true; return out; }
  // RNG 只在真的有機會時才擲，骰子的順序才不會影響別的事
  if (rollExpr("1D100").total > NUM.shop.learnChance) return out;
  P.skills[friend.skill] = out.to = Math.min(skillCapAll(), from + NUM.shop.learnGain);
  P.day.learned = (P.day.learned || 0) + 1;
  out.gained = true;
  return out;
}

// 跟館友學的那一句話（一起融合的結果、參觀展廳都用這句）。l ＝ learnFromFriend 的回傳、who ＝對方的暱稱
export function learnText(l, who) {
  if (l.gained) return `跟 ${who} 學了壹招：${l.skill} ${l.from} → ${l.to}`;
  if (l.capped) return `${who} 的${l.skill}比你高，可是今天學夠了（壹天 ${NUM.shop.learnPerDay} 次）。`;
  return `${who} 的${l.skill}比你高（${l.value}）。你在旁邊看，這次沒學會。`;
}

// ---------- 這週上架的限定頭飾 ----------
export const shopLimitedIds = () => LIMITED_ITEMS.filter(x => x.shop).map(x => x.id);
// W ＝這週（story.js 的 storyWeek，週包寫了 shop 就用它；沒有週包傳 null）。沒指定的週照週號輪流
export function shopOnSale(W, today = todayStr()) {
  const all = shopLimitedIds();
  const named = W ? asList(W.shop).filter(id => all.includes(id)) : [];
  if (named.length) return [...new Set(named)].slice(0, NUM.shop.limitedMax);
  if (!all.length) return [];
  const n = Math.min(NUM.shop.limitedRotate, all.length), wk = weekIndex(today), mod = (a, b) => ((a % b) + b) % b;
  return Array.from({ length: n }, (_, i) => all[mod(wk * n + i, all.length)]);
}
export function limitedPrice(id) { const it = LIMITED_ITEMS.find(x => x.id === id); return it && it.shop ? it.price : null; }
// 買這週上架的那幾件（onSale ＝ shopOnSale 的結果）。回傳 { ok, reason, id, price, events（解鎖選項的事件） }
export function buyLimited(P, id, onSale, today = todayStr()) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式什麼都打開了" };
  const price = limitedPrice(id);
  if (price == null) return { ok: false, reason: "兌換所沒有賣這個" };
  if (!asList(onSale).includes(id)) return { ok: false, reason: "這週沒有上架" };
  if (ownsLimited(P, id)) return { ok: false, reason: "已經有了" };
  const S = storyState(P);
  if (S.stamps < price) return { ok: false, reason: `週章不夠（要 ${price} 枚，你有 ${S.stamps} 枚）` };
  S.stamps -= price;
  const g = grantLimited(P, id, today);
  return { ok: true, id, price, events: g.events };
}
// 給公告用：「黃雨帽、廚師帽」
export function limitedNames(ids) { return asList(ids).map(id => (limitedInfo(id) || { name: id }).name).join("、"); }

// 賭場「換小獎」換到的東西要做什麼（翊文 11-09：「然後要說明用途」）。背包的東西用背包的說明，份數才不會寫兩份
export function exchangeUse(id) {
  const x = NUM.casino.exchange.find(e => e.id === id), r = x && x.reward;
  if (!r) return "";
  if (r.bag) return `放進背包。${itemDesc(r.bag)}`;
  return r.insp ? "馬上加到靈感，手作和上課都用得到。" : "";
}

// ---------- 材料換週章 ----------
export function matCount(P) {
  const bag = storyState(P).bag;
  return Object.keys(bag).filter(id => STORY_ITEMS[id] && STORY_ITEMS[id].kind === "material").reduce((n, id) => n + (bag[id] || 0) * (STORY_ITEMS[id].worth || 1), 0);
}
// 這次要用掉哪幾個（純函式，測試用）：bag ＝ { id: 個數 }，worth(id) ＝ 算幾份。
// 先找「剛好湊滿 need 份」的組合；湊不剛好才用超過最少的。同樣份數的材料，先用最多的那種。回傳 { id: 用幾個 } 或 null（不夠）
// 11-15 玩家回報「換週章的材料兩份的沒算」：以前壹個壹個挑最多的，2 張畫布＋1 片金箔（4 份）會先拿 2 張畫布、再拿金箔補 1 份，金箔的 2 份白白少算 1 份
export function matPick(bag, worth, need) {
  const ids = Object.keys(bag).filter(id => bag[id] > 0);
  let best = null;
  const walk = (i, left, take) => {
    if (left <= 0) { const over = -left, n = Object.values(take).reduce((a, b) => a + b, 0); if (!best || over < best.over || (over === best.over && n < best.n)) best = { over, n, take: Object.assign({}, take) }; return; }
    if (i >= ids.length) return;
    const id = ids[i], w = worth(id), max = Math.min(bag[id], Math.ceil(left / w));
    for (let k = max; k >= 0; k--) { if (k) take[id] = k; else delete take[id]; walk(i + 1, left - k * w, take); }
    delete take[id];
  };
  // 同樣份數的，最多的排前面（壹樣好的組合會先用它）
  ids.sort((a, b) => worth(a) - worth(b) || bag[b] - bag[a]);
  walk(0, need, {});
  return best ? best.take : null;
}
// 用掉 NUM.shop.matToStamp 份，拿壹枚週章。金箔壹個算 2 份；能剛好就剛好，只剩金箔湊不剛好時不找零
export function tradeMats(P) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式用不到" };
  const need = NUM.shop.matToStamp;
  if (matCount(P) < need) return { ok: false, reason: `材料不夠（要 ${need} 份）` };
  const S = storyState(P), bag = {};
  Object.keys(S.bag).filter(id => STORY_ITEMS[id] && STORY_ITEMS[id].kind === "material").forEach(id => { bag[id] = S.bag[id] || 0; });
  const take = matPick(bag, x => STORY_ITEMS[x].worth || 1, need);
  if (!take) return { ok: false, reason: `材料不夠（要 ${need} 份）` };
  for (const id of Object.keys(take)) { S.bag[id] -= take[id]; if (!S.bag[id]) delete S.bag[id]; }
  S.stamps += 1;
  return { ok: true, stamps: S.stamps, used: take };
}
