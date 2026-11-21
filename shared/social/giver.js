// ================================================================
//  交代人互動的規則（決定 0151；數字見 docs/規劃/交代人互動_數值和存檔.md）：閒聊、來訪、臨時拜託、送禮、交談紀錄。
//  純函式：伺服器（functions/casino/casino.js 的 act "giver"）在 play 的交易裡叫 giverRun，只改傳進來的 ctx（錢包 w、存檔 P、莊家 house）。
//  熟識度只換文字和稱號，不給籌碼、不給靈感。台詞在 content/givers/*.json（打包成 shared/npc/givers.js），伺服器只認：喜好的五個欄位、拜託的動作種類。
//  ctx：{ w, P, house, day, uid, saveDirty }；acts：今天伺服器看到的動作（taskAct：{ visit, food, casino, bank, gift }），給拜託做完的證據用
// ================================================================
import { NUM } from "../core/config.js";
import { GIVERS } from "../npc/givers.js";
import { describePepe, fromKey, hashStr, mulberry32, normKey } from "../core/logic_base.js";
import { giftCount, takeGift } from "./gifts.js";
import { NPC_REL_GIVERS, npcRelAdd, npcRelFix, npcRelView } from "./npcrel.js";

export const GIVER_TITLES = { yuga: "牌桌的熟面孔", hall: "餐車的常客", postman: "收信人", clerk: "大夜班的幫手", scale: "秤得出的人", number: "聽得懂叫號的人" };
const GV_GIFT_CATS = ["稀有度", "心情", "顏色", "帽子", "姿勢"]; // 喜好只認這五個欄位（content/givers 的 gift.likes／dislikes）
const GV_EVIDENCE = { visit: "visit", eat: "food" }; // 拜託的動作種類 → 伺服器看得到的證據（taskAct）；其他種類只有熟識度 +3，不給任何東西，所以信客戶端的
export const GIVER_LOG_ID = /^[a-z0-9:.\-]{1,60}$/;
const gvBox = o => !!o && typeof o === "object" && !Array.isArray(o);
const gvNo = reason => ({ ok: false, reason });
const gvDayNo = day => Math.max(0, Math.floor((Date.parse(day + "T00:00:00Z") - Date.parse("2026-01-01T00:00:00Z")) / 86400000)) || 0;

// 今天的送禮計數（換日重設）
function gvDay(w, day) {
  npcRelFix(w);
  if (w.npcDay.day !== day) w.npcDay = { day, g: 0, t: 0 };
  return w.npcDay;
}
// 送他的這隻他怎麼反應："like"（喜歡）、"ok"（普通）、"off"（不太對）。只看五個欄位：稀有度（失敗作算「失敗作」）、心情、顏色、帽子、姿勢
export function giverReact(id, item) {
  const g = GIVERS[id] && GIVERS[id].gift, pick = item && fromKey(normKey(item.key));
  if (!g || !pick) return "ok";
  const d = describePepe(pick, { failed: item.kind === "failed" }), val = { 稀有度: d.rarity, 心情: pick.心情, 顏色: pick.顏色, 帽子: pick.帽子, 姿勢: pick.姿勢 };
  const hit = m => gvBox(m) && GV_GIFT_CATS.some(c => Array.isArray(m[c]) && m[c].includes(val[c]));
  return hit(g.likes) ? "like" : hit(g.dislikes) ? "off" : "ok";
}
// 今天出現的臨時拜託：Lv1 起、壹位壹天 askP% 的機會（用 hash 決定，同壹天重整畫面結果壹樣），六位合計最多 askMax 件；接下的永遠算（排在前面）。回傳 [{ id, k, kind, to }]
export function giverOffers(w, day, uid) {
  const C = NUM.npcRel, rows = [];
  for (const id of NPC_REL_GIVERS) {
    const G = GIVERS[id], errands = G && Array.isArray(G.errands) ? G.errands : [];
    if (!errands.length) continue;
    const v = npcRelView(w, id, day), asked = gvBox(v.today.errand) ? v.today.errand : null;
    const roll = mulberry32(hashStr(`${uid}|${day}|${id}|ask`))() * 100;
    if (!asked && (v.lv < 1 || roll >= C.askP[v.lv - 1])) continue;
    const k = asked ? asked.k : Math.floor(mulberry32(hashStr(`${uid}|${day}|${id}|errand`))() * errands.length);
    rows.push({ id, k, kind: errands[k] ? errands[k].kind : null, to: errands[k] && errands[k].to ? errands[k].to : null, accepted: !!asked, done: !!(asked && asked.done), roll });
  }
  rows.sort((a, b) => (b.accepted - a.accepted) || a.roll - b.roll);
  return rows.slice(0, Math.max(C.askMax, rows.filter(r => r.accepted).length)).map(({ roll, ...r }) => r);
}
function gvViewOf(w, ctx, id) {
  const v = npcRelView(w, id, ctx.day), h = ctx.house && gvBox(ctx.house.givers) && gvBox(ctx.house.givers[id]) ? ctx.house.givers[id] : null;
  return { id, lv: v.lv, xp: v.xp, next: v.next, left: v.left, dayLeft: v.dayLeft, taps: Math.min(NUM.npcRel.tapMax, v.today.tap | 0), gifted: (v.today.gift | 0) > 0, visited: (v.today.visit | 0) > 0, recent: h && Array.isArray(h.recent) ? h.recent.slice(-NUM.npcRel.recent) : [] };
}
const gvSum = (w, ctx) => { const nd = gvDay(w, ctx.day); return { ok: true, givers: NPC_REL_GIVERS.map(id => gvViewOf(w, ctx, id)), offers: giverOffers(w, ctx.day, ctx.uid), gifts: { used: nd.g, max: NUM.npcRel.giftDay.giver } }; };

// 壹個動作。d：{ op, id, item?, k? }
export function giverRun(ctx, d, acts = {}) {
  const w = ctx.w, id = String(d.id || ""), op = String(d.op || "");
  npcRelFix(w);
  if (op === "info") return gvSum(w, ctx);
  if (!NPC_REL_GIVERS.includes(id) || !GIVERS[id]) return gvNo("沒有這位交代人。");
  const add = (src, o) => npcRelAdd(w, id, ctx.day, src, Object.assign({ title: GIVER_TITLES[id] }, o));
  const out = (r, extra) => Object.assign({ ok: true, id, xp: r.xp, lv: r.lv, up: !!r.up, title: r.title || null, gained: r.gained | 0 }, extra);
  if (op === "tap") { // 點他閒聊：前 3 次加熟識度、第 4 次起不耐煩、壹天最多 tapMax 下
    const t = add("tap", { xp: 0 });
    if (t.why === "src_max") return Object.assign({ ok: true, id, over: true, n: NUM.npcRel.tapMax }, gvViewOf(w, ctx, id));
    const n = npcRelView(w, id, ctx.day).today.tap | 0, r = add("chat");
    return out(r, { n, annoyed: n >= NUM.npcRel.tapAnnoyed, over: false });
  }
  if (op === "visit") return out(add("visit"));
  if (op === "ask") { // 接下今天的臨時拜託
    const o = giverOffers(w, ctx.day, ctx.uid).find(x => x.id === id);
    if (!o) return gvNo("他今天沒有拜託你的事。");
    const e = w.npcRel[id] || (w.npcRel[id] = { xp: 0, lv: 0, day: ctx.day, today: { xp: 0 } });
    if (e.day !== ctx.day) { e.day = ctx.day; e.today = { xp: 0 }; }
    if (!gvBox(e.today.errand)) e.today.errand = { k: o.k, done: 0 };
    return Object.assign({ ok: true, id, k: e.today.errand.k, kind: o.kind, to: o.to, done: !!e.today.errand.done });
  }
  if (op === "askDone") { // 做完回報：有伺服器看得到的證據的種類要有證據；傳話要今天跟對方聊過
    const v = npcRelView(w, id, ctx.day), a = v.today.errand;
    if (!gvBox(a)) return gvNo("他今天沒有拜託你的事。");
    if (a.done) return gvNo("這件事你做完了。");
    const er = GIVERS[id].errands[a.k], need = er && GV_EVIDENCE[er.kind];
    if (need && !acts[need]) return gvNo("伺服器還沒看到你做這件事。");
    if (er && er.kind === "tell" && !(npcRelView(w, er.to, ctx.day).today.chat | 0)) return gvNo("還沒去找他說話。");
    const r = add("ask"); w.npcRel[id].today.errand.done = 1;
    return out(r, { kind: er ? er.kind : null });
  }
  if (op === "gift") { // 送他壹隻佩佩（從存檔拿走，不退還）
    const item = gvBox(d.item) ? { kind: String(d.item.kind || ""), key: String(d.item.key || "") } : null, nd = gvDay(w, ctx.day);
    if (!item || !["pepe", "failed"].includes(item.kind)) return gvNo("只能送佩佩或失敗作。");
    if (!ctx.P) return gvNo("要用挑戰模式的參觀者進館才能送。");
    if (nd.g >= NUM.npcRel.giftDay.giver) return gvNo("今天已經送夠了，明天再送。");
    if (npcRelView(w, id, ctx.day).today.gift) return gvNo("今天已經送過他了。");
    const cnt = giftCount(ctx.P, item.kind, item.key), e = item.kind === "pepe" && ctx.P.pepes ? ctx.P.pepes[item.key] : null;
    if (e && (e.perfect || e.title) && cnt < 2) return gvNo("這隻是完美作品或取了名字：要先有第二隻才能送。");
    const react = giverReact(id, item), tk = takeGift(ctx.P, item);
    if (!tk.ok) return gvNo(tk.reason || "沒辦法送。");
    ctx.saveDirty = true;
    const r = add("gift", { xp: NUM.npcRel.react[react] });
    nd.g++;
    if (!gvBox(ctx.house.givers)) ctx.house.givers = {};
    const h = gvBox(ctx.house.givers[id]) ? ctx.house.givers[id] : (ctx.house.givers[id] = { recent: [] });
    h.recent = (Array.isArray(h.recent) ? h.recent : []).concat([{ kind: item.kind, key: tk.gift.key }]).slice(-NUM.npcRel.recent);
    return out(r, { react, recent: h.recent.slice() });
  }
  return gvNo("不認得的動作。");
}

// ---------- 交談紀錄（圖書館）：casinoNpcLog/{uid} = { v: 1, g: { 交代人id: [[天數, "句子 id"], ...] } }（舊的在前）----------
export const giverLogNew = () => ({ v: 1, g: {} });
export function giverLogFix(doc) {
  const out = giverLogNew();
  if (!gvBox(doc) || !gvBox(doc.g)) return out;
  for (const id of NPC_REL_GIVERS) {
    const a = Array.isArray(doc.g[id]) ? doc.g[id] : [], seen = new Set();
    out.g[id] = a.filter(x => Array.isArray(x) && Number.isInteger(x[0]) && typeof x[1] === "string" && GIVER_LOG_ID.test(x[1]) && !seen.has(x[1]) && seen.add(x[1])).map(x => [x[0], x[1]]).slice(-NUM.npcRel.logMax);
  }
  return out;
}
// 記聽過的句子：id 要是六位之壹、每句要符合格式、同壹句不重複、壹次最多 logIds 句、每位最多 logMax 句（超過丟最舊的）。回傳 { doc, added }；added 是 0 就不用寫
export function giverLogAdd(doc, id, ids, day) {
  const fixed = giverLogFix(doc);
  if (!NPC_REL_GIVERS.includes(id) || !Array.isArray(ids)) return { doc: fixed, added: 0 };
  const list = fixed.g[id] || (fixed.g[id] = []), have = new Set(list.map(x => x[1])), d = gvDayNo(day);
  let added = 0;
  for (const s of ids.slice(0, NUM.npcRel.logIds)) {
    if (typeof s !== "string" || !GIVER_LOG_ID.test(s) || have.has(s)) continue;
    list.push([d, s]); have.add(s); added++;
  }
  if (list.length > NUM.npcRel.logMax) list.splice(0, list.length - NUM.npcRel.logMax);
  return { doc: fixed, added };
}
