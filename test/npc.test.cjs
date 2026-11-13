// 館內 NPC 的純函式（shared/npc.js）和網頁用的名單（shared/npc_roster.js）：打包跟上內容、故事線解鎖、抽展廳旅客、展廳留言、委託人名單一致、存檔相容。
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const pack = require("../tools/npc_pack.cjs");
const G = load();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("  ✗", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}（得到 ${JSON.stringify(a)}，要 ${JSON.stringify(b)}）`);
const rngOf = seq => { let i = 0; return () => seq[i++ % seq.length]; };

// 1. 網頁的名單跟 content/npc/ 一致（沒有就要跑 node tools/npc_pack.cjs）、不含劇情角色
const f = path.join(__dirname, "..", "shared", "npc_roster.js");
ok(fs.readFileSync(f, "utf8") === pack.source(pack.roster()), "shared/npc_roster.js 沒跟上 content/npc/（跑 node tools/npc_pack.cjs）");
ok(G.NPC_PEOPLE.length >= 29 && G.NPC_PEOPLE.every(n => n.kind === "visitor" || n.kind === "client"), "名單只有旅客和委託人");
ok(!G.NPC_PEOPLE.some(n => n.kind === "trace" || /^t-/.test(n.id)), "劇情角色不進網頁名單");

// 2. 委託人：CLIENTS（委託的來源）跟 content/npc 的 c-* 名字、note 壹樣（NPC 檔和程式不會各說各的）
const cl = G.NPC_PEOPLE.filter(n => n.kind === "client");
eq(G.CLIENTS.map(c => c.name).sort(), cl.map(c => c.name).sort(), "CLIENTS 的名字 = c-* 的名字");
G.CLIENTS.forEach(c => { const n = G.npcByName(c.name); ok(n && n.note === c.note, `委託人「${c.name}」的 note 跟 NPC 檔壹樣`); });
ok(G.npcByName("老派收藏家") && G.npcByName("數學老師"), "一般評語的 who 有些就是 NPC");

// 3. 故事線解鎖
const T = { id: "x", name: "測試", kind: "client", story: "身分", route: { hall: 2, food: 1 }, likes: ["a"], arc: [
  { step: 1, from: "2026-11-16", text: "一", news: "n1" },
  { step: 2, from: "2026-11-23", need: { metric: "commissions", n: 3 }, text: "二", news: "n2", route: { hall: 0, bank: 5 } },
  { step: 3, from: "2026-12-07", need: { metric: "hallVisits", n: 100 }, text: "三", news: "n3", likes: ["b"] }] };
eq(G.npcArcNow(T, "2026-11-15", null), null, "第 1 段日期沒到＝還沒有");
eq(G.npcArcNow(T, "2026-11-16", null).step, 1, "第 1 段只看日期");
eq(G.npcArcNow(T, "2026-11-16", { commissions: {}, hallVisits: 0 }).step, 1, "第 1 段不看進度");
eq(G.npcArcNow(T, "2026-12-30", null).step, 3, "沒給進度＝只看日期，全部解鎖");
eq(G.npcArcNow(T, "2026-11-30", { commissions: { x: 2 }, hallVisits: 999 }).step, 1, "日期到了但委託次數不夠");
eq(G.npcArcNow(T, "2026-11-30", { commissions: { x: 3 } }).step, 2, "委託次數夠了（照這位的 id 算）");
eq(G.npcArcNow(T, "2026-11-30", { commissions: 3 }).step, 2, "commissions 也可以是壹個數字");
eq(G.npcArcNow(T, "2026-11-30", { commissions: { y: 99 } }).step, 1, "別人的委託次數不算");
eq(G.npcArcNow(T, "2026-12-30", { commissions: { x: 3 }, hallVisits: 99 }).step, 2, "展廳人次不夠，停在第 2 段");
eq(G.npcArcNow(T, "2026-12-30", { commissions: { x: 3 }, hallVisits: 100 }).step, 3, "兩項都夠就到第 3 段");
eq(G.npcArcNow(T, "2026-12-30", { commissions: { x: 2 }, hallVisits: 500 }).step, 1, "前壹段沒到，後面不算");
eq(G.npcArcNow({ ...T, arc: [{ step: 1, from: "2026-11-16", need: { metric: "commissions", n: 9 }, text: "a" }] }, "2026-11-16", { commissions: {} }).step, 1, "第 1 段就算寫了 need 也只看日期");
eq(G.npcArcNow({ ...T, arc: [T.arc[0], { step: 2, from: "2026-11-17", need: { metric: "亂寫", n: 1 }, text: "b" }] }, "2026-12-01", {}).step, 1, "不認得的進度項目不解鎖");
eq(G.npcArcNow({ id: "z", arc: [] }, "2030-01-01", null), null, "沒有故事線");
eq(G.npcArcNow(null, "2030-01-01", null), null, "壞資料不丟錯");
eq(G.npcRouteNow(T, "2026-11-16", null), T.route, "第 1 段沒寫 route＝用最上層的");
eq(G.npcRouteNow(T, "2026-12-30", null), { hall: 0, bank: 5 }, "最新有寫 route 的那壹段蓋掉");
eq(G.npcLikesNow(T, "2026-11-16", null), ["a"], "喜好：最上層");
eq(G.npcLikesNow(T, "2026-12-30", null), ["b"], "喜好：第 3 段蓋掉");

// 4. 現在的名單、新聞
const cur = G.npcCurrent("2026-11-20", null);
ok(cur.length === G.NPC_PEOPLE.length && cur.every(c => c.arc && c.arc.step === 1), "11-20 每位都到第 1 段");
ok(G.npcCurrent("2026-11-14", null).every(c => c.arc === null), "11-14 還沒有人有故事段落");
const nw = G.npcNews("2026-11-20", null, 2);
ok(nw.length === 2 && nw.every(x => x.news), "近況最多 2 則、都有字");
eq(G.npcNews("2026-11-20", null, 2), nw, "同壹天的近況不變");
ok(G.npcNews("2026-11-14", null).length === 0, "故事還沒開始就沒有近況");
ok(G.npcNews("2026-11-20", null, 99).length === cur.filter(c => c.arc.news).length, "max 夠大就全列");

// 5. 抽展廳旅客：照 route.hall 的權重、權重 0 不來、換人
const L = [{ id: "a", name: "甲", kind: "visitor", route: { hall: 3 }, arc: [] }, { id: "b", name: "乙", kind: "client", route: { hall: 1 }, arc: [] }, { id: "c", name: "丙", kind: "visitor", route: { food: 9 }, arc: [] }, { id: "t", name: "痕", kind: "trace", route: { hall: 9 }, arc: [] }];
eq(G.npcPickHall(rngOf([0]), "2026-11-20", null, L).id, "a", "rng 0 → 權重大的第壹位");
eq(G.npcPickHall(rngOf([0.99]), "2026-11-20", null, L).id, "b", "rng 接近 1 → 最後壹位");
const seen = {}; for (let i = 0; i < 400; i++) { const p = G.npcPickHall(rngOf([i / 400]), "2026-11-20", null, L); seen[p.id] = (seen[p.id] || 0) + 1; }
ok(!seen.c && !seen.t, "hall 權重 0 的、劇情角色不會來");
ok(seen.a === 300 && seen.b === 100, `3:1 的權重 → 300:100（得到 ${seen.a}:${seen.b}）`);
eq(G.npcPickHall(rngOf([0]), "2026-11-20", null, L, "a").id, "b", "盡量不跟上壹位同壹個人");
eq(G.npcPickHall(rngOf([0]), "2026-11-20", null, [L[0]], "a").id, "a", "只有壹位就還是他");
eq(G.npcPickHall(rngOf([0]), "2026-11-20", null, [L[2]]), null, "沒有人去展廳就回 null");
eq(G.npcPickHall(rngOf([0]), "2026-11-30", { commissions: { x: 3 } }, [T]), null, "故事線讓他不再來展廳");
for (const d of ["2026-11-14", "2026-11-20", "2027-03-01"]) ok(G.npcPickHall(rngOf([0.3]), d, null), `${d} 真實名單抽得到人`);

// 6. 故事留言
const sl = G.npcStoryLine("c-umbrella", "2026-11-20", null);
ok(sl && sl.who === "賣傘的老闆" && sl.story && sl.npc === "c-umbrella" && sl.step === 1 && sl.text.includes("收攤"), "11-20 說第 1 段");
const sl0 = G.npcStoryLine("c-umbrella", "2026-11-14", null);
ok(sl0 && sl0.step === 0 && sl0.text === G.npcById("c-umbrella").story, "故事還沒開始就說身分");
eq(G.npcStoryLine("t-guard", "2026-11-20", null), null, "劇情角色不留故事留言（也不在名單）");
eq(G.npcStoryLine("nobody", "2026-11-20", null), null, "不認得的 id");

// 7. visitorArrive：有名字、不改靈感上限、舊存檔的紀錄照樣能讀、最多 12 則
const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08");
const r = G.finishMake(P, { 稀有度: "稀有", 心情: "傷心", 顏色: "綠", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 20 });
G.placeInHall(P, 0, { kind: "pepe", key: r.key });
P.visitorLog.push({ who: "舊的參觀者", text: "舊存檔的留言", gain: 1, full: false }); // 沒有 npc 欄
const lines = [];
for (let i = 0; i < 60; i++) {
  const v = G.visitorArrive(P);
  ok(v && typeof v.who === "string" && v.who && v.text, "每位都有名字和字");
  if (v && v.story) ok(v.npc && G.npcById(v.npc) && G.npcById(v.npc).name === v.who, "故事留言的 who 是 NPC 的名字");
  if (v && v.npc) lines.push(v.who);
}
ok(P.visitorLog.length <= 12, "紀錄最多 12 則");
ok(lines.length >= 10, `60 位裡有不少說到 NPC 的（${lines.length}）`);
ok(new Set(lines).size >= 5, "不是同壹位");
eq(G.visitorInspToday(P), G.NUM.visitorInspDay, "靈感每天的上限照舊");
ok(P.hallVisitors === 60, "來了幾位照舊算");

if (fails) { console.log(`NPC 純函式：${fails} 項沒過`); process.exit(1); }
console.log("NPC 純函式（打包、故事線解鎖、抽展廳旅客、展廳留言、委託人一致）全部通過");
