// 參觀者一位接一位：roguelike 的繼承（shared/legacy.js）：node test/legacy.test.cjs（npm test 也會跑）
// A 前任的遺物、C 選職業再抽小優缺點（決定 0028；以前是 3 位候選人）、D 歷任參觀者牆的紀錄、舊存檔補欄位。數字一律讀 NUM、LEGACY、PERKS、FLAWS。
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const d100 = N => { const t = N === 100 ? 0 : Math.floor(N / 10), u = N === 100 ? 0 : N % 10; return [(t + 0.5) / 10, (u + 0.5) / 10]; };
const dN = (v, n) => (v - 0.5) / n; // 讓 1Dn 擲出 v
function seq(...vals) { const q = vals.flat(); return () => q.length ? q.shift() : 0.5; }
function fresh(mode = "challenge") { const P = G.newProfile(mode); G.ensureDay(P, "2026-11-08"); return P; }
const unlockAll = P => { G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if (!o.forbidden && !o.mutant && !o.gift && !o.key && !P.unlocked[c].includes(o.name)) P.unlocked[c].push(o.name); })); };
const P3 = () => { const P = fresh(); unlockAll(P); P.insp = 500; return P; };
const mk = (P, o, nat = 50) => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: nat });
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const S = x => JSON.stringify(x);
// 直接給這位參觀者一個優缺點（測效果用）
const withTrait = (P, id) => { if (G.PERKS.some(t => t.id === id)) P.perk = id; else P.flaw = id; return P; };
// 固定骰子：讓 chooseJob 抽到指定的小優點、小缺點。rollTraits 先抽優點、再抽缺點，各用一次 RNG（照 notJob、同一類不配的規則先篩）；後面擲技能都是 0.5
function drawSeq(job, perkId, flawId) {
  const okJob = t => !(t.notJob || []).includes(job);
  const perks = G.PERKS.filter(okJob), perk = G.traitById(perkId);
  const flaws = G.FLAWS.filter(t => okJob(t) && !G.traitsClash(t, perk));
  const pi = perks.findIndex(t => t.id === perkId), fi = flaws.findIndex(t => t.id === flawId);
  if (pi < 0 || fi < 0) throw new Error(`${job} 抽不到 ${perkId}／${flawId}`);
  return seq((pi + 0.5) / perks.length, (fi + 0.5) / flaws.length);
}
const chooseWith = (P, job, perkId, flawId) => { G.setRng(drawSeq(job, perkId, flawId)); const r = G.chooseJob(P, job); G.setRng(null); return r; };
// 技能全擲 0.5 時的起點（chooseWith 擲出來的就是這個，再加減優缺點、前一位留下的）
const baseSkills = job => { G.setRng(seq()); const s = J(G.rollSkills(job)); G.setRng(null); return s; };
const jobIds = () => G.JOBS.map(j => j.id);
const saveOf = P => { const s = G.newSave(); s.profiles.challenge = P; s.current = "challenge"; return s; };

// ---------- 預設、存檔 ----------
T("新的參觀者：優缺點、候選人、遺物櫃、這一位的統計都有預設", () => {
  const P = fresh();
  assert.strictEqual(P.perk, null); assert.strictEqual(P.flaw, null); assert.strictEqual(P.cands, null); assert.strictEqual(P.legacy, null);
  assert.deepStrictEqual(J(P.relics), []);
  assert.strictEqual(P.visit.made0, 0); assert.strictEqual(P.visit.deepest, 0); assert.deepStrictEqual(J(P.visit.understood), {});
});
T("舊存檔：沒有 P.visit 的，起點用上一位離開時累計做了幾隻；壞掉的欄位補好", () => {
  const old = J(fresh());
  delete old.visit; delete old.perk; delete old.flaw; delete old.cands; delete old.legacy; delete old.relics;
  old.visitor = 3; old.stats.made = 12;
  old.history = [{ n: 2, job: "detective", made: 9, endedBy: "russia8", d: "2026-11-08" }, { n: 1, job: "gambler", made: 4, endedBy: "russia8", d: "2026-11-07" }];
  const P = G.fixProfile(old, "challenge");
  assert.strictEqual(P.visit.made0, 9); assert.strictEqual(P.visit.from, null);
  assert.strictEqual(P.perk, null); assert.strictEqual(P.cands, null); assert.deepStrictEqual(J(P.relics), []);
  assert.strictEqual(G.visitorRecord(P, "russia8").madeThis, 3);
  // 壞掉的
  const bad = Object.assign(J(fresh()), { perk: "沒有這個", cands: [null, { job: 1 }], legacy: "x", relics: [{ kind: "pepe" }, { kind: "pepe", key: "普通|開心|紅|沒有|站著" }] });
  const Q = G.fixProfile(bad, "challenge");
  assert.strictEqual(Q.perk, null); assert.strictEqual(Q.cands, null); assert.strictEqual(Q.legacy, null);
  assert.strictEqual(Q.relics.length, 1); assert.strictEqual(Q.relics[0].key, G.normKey("普通|開心|紅|沒有|站著"));
});
T("選好職業之後存檔再讀一次：職業、優缺點、技能都一樣；已經選過的不能再選（重新整理不能重抽）", () => {
  const P = fresh();
  G.setRng(G.mulberry32(7)); const r = G.chooseJob(P, "occultist"); G.setRng(null);
  assert.ok(r && P.perk && P.flaw);
  const back = G.migrateSave(J(saveOf(P))).profiles.challenge;
  assert.strictEqual(S([back.job, back.perk, back.flaw, back.skills, back.mood, back.sanity]), S([P.job, P.perk, P.flaw, P.skills, P.mood, P.sanity]));
  const before = S(back);
  assert.strictEqual(G.chooseJob(back, "occultist"), null); assert.strictEqual(G.chooseJob(back, "gambler"), null);
  assert.strictEqual(S(back), before);
});

// ---------- C. 選職業，再抽小優點、小缺點（決定 0028） ----------
T("第一位參觀者：6 個職業都能自己選；選好抽到一個小優點、一個小缺點；回傳的跟 P 上的一樣", () => {
  assert.strictEqual(S(jobIds().slice().sort()), S(Object.keys(G.JOB_SKILL).sort())); // JOBS 和 JOB_SKILL 對得上
  jobIds().forEach(job => {
    const P = fresh();
    assert.strictEqual(P.visitor, 1); assert.strictEqual(P.job, null); assert.strictEqual(P.perk, null); assert.strictEqual(P.flaw, null);
    const r = G.chooseJob(P, job);
    assert.ok(r, job);
    assert.strictEqual(P.job, job);
    const perk = G.traitById(P.perk), flaw = G.traitById(P.flaw);
    assert.ok(G.PERKS.includes(perk) && G.FLAWS.includes(flaw), P.perk + "/" + P.flaw);
    assert.strictEqual(r.perk, P.perk); assert.strictEqual(r.flaw, P.flaw); assert.strictEqual(r.job, job);
    assert.strictEqual(r.main, G.jobSkill(job)); assert.strictEqual(r.value, P.skills[r.main]);
    assert.strictEqual(S(r.skills), S(P.skills)); assert.strictEqual(r.mood, P.mood); assert.strictEqual(r.sanity, P.sanity);
  });
});
T("第 2 位以後也一樣：換人不再擲候選人；6 個職業都能選，抽到一個小優點、一個小缺點", () => {
  jobIds().forEach(job => {
    const P = fresh(); G.chooseJob(P, "detective");
    const r = G.nextVisitor(P, "russia8", null);
    assert.strictEqual(P.cands, null); assert.ok(!("cands" in r));
    assert.strictEqual(P.job, null); assert.strictEqual(P.perk, null); assert.strictEqual(P.flaw, null);
    assert.ok(G.chooseJob(P, job), job);
    assert.strictEqual(P.visitor, 2); assert.strictEqual(P.job, job);
    assert.ok(G.traitById(P.perk) && G.traitById(P.flaw));
  });
});
T("固定骰子：同一個種子，抽到的優缺點、技能、心情、理智都一樣；骰子指定抽到哪一個", () => {
  const run = job => { G.setRng(G.mulberry32(42)); const P = fresh(); G.chooseJob(P, job); G.setRng(null); return S([P.perk, P.flaw, P.skills, P.mood, P.sanity]); };
  jobIds().forEach(job => assert.strictEqual(run(job), run(job), job));
  const P = fresh();
  const r = chooseWith(P, "detective", "thrifty", "darkfear");
  assert.strictEqual(P.perk, "thrifty"); assert.strictEqual(P.flaw, "darkfear"); assert.strictEqual(r.perk, "thrifty");
  assert.strictEqual(S(P.skills), S(baseSkills("detective"))); // 這兩個不改技能
});
T("200 個種子 × 6 個職業：notJob 抽不到（抱枕職人不會是「手巧」）、同一類不配在一起；每一種優缺點都抽得到", () => {
  const seenP = new Set(), seenF = new Set();
  for (let seed = 1; seed <= 200; seed++) jobIds().forEach(job => {
    G.setRng(G.mulberry32(seed)); const P = fresh(); G.chooseJob(P, job); G.setRng(null);
    const perk = G.traitById(P.perk), flaw = G.traitById(P.flaw);
    assert.ok(!(perk.notJob || []).includes(job) && !(flaw.notJob || []).includes(job), seed + ":" + job + P.perk);
    assert.ok(!G.traitsClash(perk, flaw), seed + ":" + P.perk + "/" + P.flaw);
    seenP.add(P.perk); seenF.add(P.flaw);
  });
  assert.strictEqual(seenP.size, G.PERKS.length); assert.strictEqual(seenF.size, G.FLAWS.length);
});
T("不能重抽：已經選過職業、沒有這個職業、自由模式都不做事；自由模式的優缺點也不算", () => {
  const P = fresh(); G.chooseJob(P, "salesman");
  const before = S(P);
  assert.strictEqual(G.chooseJob(P, "salesman"), null); assert.strictEqual(G.chooseJob(P, "detective"), null);
  assert.strictEqual(S(P), before);
  const Q = fresh(); assert.strictEqual(G.chooseJob(Q, "沒有這個"), null); assert.strictEqual(Q.job, null); assert.strictEqual(Q.perk, null);
  const F = fresh("free"); assert.strictEqual(G.chooseJob(F, "detective"), null); assert.strictEqual(F.job, null); assert.strictEqual(F.perk, null);
  F.perk = "thrifty"; F.flaw = "weak";
  assert.strictEqual(G.traitSum(F, "fusion"), 0); assert.strictEqual(G.fusionPrice(F), 0);
});
T("3 位候選人那一套拿掉了：沒有 rollCandidates、chooseCandidate、candidateStats、LEGACY.candidates", () => {
  assert.strictEqual(typeof G.rollCandidates, "undefined"); assert.strictEqual(typeof G.chooseCandidate, "undefined"); assert.strictEqual(typeof G.candidateStats, "undefined");
  assert.ok(!("candidates" in G.LEGACY));
});

// ---------- A. 前任的遺物 ----------
T("留下一件收藏當遺物：放進遺物櫃（第幾位留的）、收藏不會少、下一位開場心情 +LEGACY.relicMood", () => {
  const P = fresh();
  const a = mk(P, {});
  const nPepes = Object.keys(P.pepes).length;
  G.nextVisitor(P, "russia8", { type: "relic", item: { kind: "pepe", key: a.key } });
  assert.strictEqual(P.relics.length, 1);
  assert.strictEqual(P.relics[0].n, 1); assert.strictEqual(P.relics[0].key, a.key); assert.strictEqual(P.relics[0].kind, "pepe");
  assert.strictEqual(Object.keys(P.pepes).length, nPepes);
  assert.strictEqual(P.history[0].left.type, "relic"); assert.strictEqual(P.history[0].left.key, a.key);
  assert.strictEqual(P.legacy.type, "relic"); assert.strictEqual(P.legacy.from, 1); assert.strictEqual(P.legacy.mood, G.LEGACY.relicMood);
  // 選一個不是賭徒的職業，抽到心情沒有加減的優缺點：選職業時才加遺物的心情
  P.mood = 40;
  const r = chooseWith(P, "detective", "strong", "slow");
  assert.strictEqual(P.mood, 40 + G.LEGACY.relicMood); assert.strictEqual(r.moodFrom, 40); assert.strictEqual(r.moodAdj, G.LEGACY.relicMood);
  assert.ok(r.why.some(w => w.id === "legacy" && w.what === "mood"));
});
T("遺物不在收藏裡：什麼都沒留", () => {
  const P = fresh();
  G.nextVisitor(P, "russia8", { type: "relic", item: { kind: "pepe", key: "普通|開心|紅|沒有|站著|沒有|沒有" } });
  assert.strictEqual(P.relics.length, 0); assert.strictEqual(P.legacy, null); assert.strictEqual(P.history[0].left, null);
});
T("遺物櫃最多 LEGACY.relicsMax 件，新的在前面", () => {
  const P = fresh(); const a = mk(P, {}); const b = mk(P, { 顏色: "綠" });
  for (let i = 0; i < G.LEGACY.relicsMax + 3; i++) { G.nextVisitor(P, "russia8", { type: "relic", item: { kind: "pepe", key: i % 2 ? b.key : a.key } }); G.chooseJob(P, "detective"); }
  assert.strictEqual(P.relics.length, G.LEGACY.relicsMax);
  assert.strictEqual(P.relics[0].n, P.visitor - 1);
});
T("把最拿手的技能傳下去：下一位這個技能起點 +LEGACY.skillPlus（不超過 99）", () => {
  const P = fresh(); G.assignJob(P, "historian"); P.skills.偵查 = 80; // 偵查比拿手的鑑賞還高
  assert.deepStrictEqual(J(G.bestSkill(P)), ["偵查", 80]);
  G.nextVisitor(P, "russia8", { type: "skill" });
  assert.deepStrictEqual([P.legacy.type, P.legacy.skill, P.legacy.plus], ["skill", "偵查", G.LEGACY.skillPlus]);
  assert.strictEqual(P.history[0].left.skill, "偵查");
  // 下一位選推銷員（拿手不是偵查），抽到不改技能的優缺點
  const base = baseSkills("salesman");
  const r = chooseWith(P, "salesman", "strong", "slow");
  assert.strictEqual(P.skills.偵查, Math.max(1, Math.min(99, base.偵查 + G.LEGACY.skillPlus)));
  assert.strictEqual(r.delta.偵查, P.skills.偵查 - base.偵查);
  assert.ok(r.why.some(w => w.id === "legacy" && w.skill === "偵查"));
});
T("最拿手的技能一樣高：選職業的拿手技能", () => {
  const P = fresh(); G.assignJob(P, "salesman");
  G.SKILLS.forEach(s => { P.skills[s] = 40; });
  assert.strictEqual(G.bestSkill(P)[0], "說服");
});
T("什麼都不留：遺物櫃、P.legacy 都沒有；紀錄的 left 是 null", () => {
  const P = fresh(); mk(P, {});
  G.nextVisitor(P, "russia8", null);
  assert.strictEqual(P.legacy, null); assert.strictEqual(P.relics.length, 0); assert.strictEqual(P.history[0].left, null);
  assert.ok(G.legacyOptions(P).relic.ok);
});

// ---------- D. 歷任參觀者的紀錄 ----------
T("紀錄：做了幾隻（這一位的）、地下走到第幾層、看懂幾件、理智在哪裡用完、優缺點、前任留給牠的", () => {
  const P = P3();
  G.nextVisitor(P); chooseWith(P, "detective", "strong", "slow"); // 第 2 位
  const before = P.stats.made;
  const team = [mk(P, {}), mk(P, { 顏色: "綠" }), mk(P, { 顏色: "黃" })].map(r => r.key);
  assert.ok(G.startCellar(P, 1, team).ok);
  G.understandLine(P, "strange"); G.understandLine(P, "strange"); G.understandLine(P, "book:book1");
  P.sanity = 2; G.applySan(P, 5, "statue");
  const perk = P.perk, flaw = P.flaw;
  G.nextVisitor(P);
  const e = P.history[0];
  assert.strictEqual(e.n, 2); assert.strictEqual(e.madeThis, P.stats.made - before); assert.strictEqual(e.madeThis, 3);
  assert.strictEqual(e.deepest, 1); assert.strictEqual(e.understood, 2); assert.strictEqual(e.where, "statue");
  assert.strictEqual(e.perk, perk); assert.strictEqual(e.flaw, flaw); assert.strictEqual(e.endedBy, "russia8");
  assert.strictEqual(P.history.length, 2); assert.strictEqual(P.history[1].n, 1);
  // 新的一位從 0 開始算
  assert.strictEqual(P.visit.deepest, 0); assert.strictEqual(P.visit.made0, P.stats.made); assert.strictEqual(P.visit.where, null);
});
T("第一位參觀者的紀錄也有抽到的優缺點（決定 0028）", () => {
  const P = fresh(); chooseWith(P, "gambler", "lucky", "insomnia");
  const now = G.visitorRecord(P, null);
  assert.strictEqual(now.n, 1); assert.strictEqual(now.perk, "lucky"); assert.strictEqual(now.flaw, "insomnia");
  G.nextVisitor(P);
  assert.strictEqual(P.history[0].perk, "lucky"); assert.strictEqual(P.history[0].flaw, "insomnia");
});
T("走完一層接著往下：走到的那一層也算", () => {
  const P = P3(); P.cellar.best = 1;
  const team = [mk(P, {}), mk(P, { 顏色: "綠" }), mk(P, { 顏色: "黃" })].map(r => r.key);
  G.startCellar(P, 1, team);
  for (let i = 0; i < G.cellarFloor(1).rooms.length; i++) { G.cellarApply(P, G.cellarResolve(P, 0), true); G.cellarAdvance(P); }
  assert.strictEqual(P.visit.deepest, 2);
});
T("舊紀錄只有累計的 made：跟前一位相減；不知道的是 null", () => {
  const list = [{ n: 3, made: 20 }, { n: 2, made: 12 }, { n: 1, made: 5 }];
  assert.deepStrictEqual([0, 1, 2].map(i => G.visitorMade(list, i)), [8, 7, 5]);
  assert.strictEqual(G.visitorMade([{ n: 5, made: 9 }, { n: 3, made: 4 }], 0), null); // 中間缺一位
  assert.strictEqual(G.visitorMade([{ n: 4, made: 9, madeThis: 2 }], 0), 2);
});

// ---------- 小優點、小缺點的效果 ----------
T("說明文字：數字從 config 帶進來", () => {
  assert.ok(G.traitDesc("thrifty").includes(`${G.NUM.fusionCost} → ${G.NUM.fusionCost - 1}`));
  assert.ok(G.traitDesc("deft").includes(String(G.PERKS.find(t => t.id === "deft").pillowFree)));
  assert.ok(G.traitDesc("insomnia").includes(`${G.NUM.startSanity} → ${G.NUM.startSanity - 5}`));
  G.PERKS.concat(G.FLAWS).forEach(t => { const d = G.traitDesc(t.id); assert.ok(d && !/[{}]/.test(d), t.id + "：" + d); assert.ok(G.traitName(t.id) !== t.id); });
});
T("手巧：做抱枕有機會不花靈感", () => {
  const P = withTrait(P3(), "deft"); const a = mk(P, {});
  const pct = G.PERKS.find(t => t.id === "deft").pillowFree;
  const pick = { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" };
  let before = P.insp;
  G.setRng(seq((pct - 1) / 100)); let r = G.makePillow(P, pick, "p:" + a.key);
  assert.ok(r.free); assert.strictEqual(P.insp, before);
  before = P.insp;
  G.setRng(seq((pct + 1) / 100)); r = G.makePillow(P, pick, "p:" + a.key);
  assert.ok(!r.free); assert.strictEqual(P.insp, before - G.NUM.costPillow);
  G.setRng(null);
});
T("嘴甜、不會講價：交委託多拿、少拿（最少拿 1）", () => {
  for (const [id, sign] of [["sweet", 1], ["haggler", -1]]) {
    G = load();
    const P = withTrait(fresh(), id);
    const c = G.dailyCommissions(P, "2026-11-08")[0];
    const right = Object.assign({ 稀有度: "稀有" }, c.need);
    G.finishMake(P, right, { natural: 30 });
    const before = P.insp;
    const d = G.deliver(P, 0, { kind: "pepe", key: G.pepeKey(right) });
    const deal = G.traitById(id).deal;
    assert.ok(d.ok); assert.strictEqual(P.insp - before, Math.max(1, c.reward + deal)); assert.strictEqual(Math.sign(d.deal), sign);
  }
});
T("精打細算、坐不住：融合多花、少花", () => {
  const P = withTrait(P3(), "thrifty");
  assert.strictEqual(G.fusionPrice(P), G.NUM.fusionCost - 1);
  const a = mk(P, {}), b = mk(P, { 顏色: "綠" });
  const before = P.insp;
  assert.ok(G.startFusion(P, { kind: "pepe", key: a.key }, { kind: "pepe", key: b.key }).ok);
  assert.strictEqual(P.insp, before - (G.NUM.fusionCost - 1));
  P.perk = null; P.flaw = "restless";
  assert.strictEqual(G.fusionPrice(P), G.NUM.fusionCost + 1);
});
T("力氣大、沒力氣：地下收藏庫的隊伍強度 ±1，寫在說明裡", () => {
  const P = P3();
  const team = [mk(P, {}), mk(P, { 顏色: "綠" }), mk(P, { 顏色: "黃" })].map(r => ({ kind: "pepe", key: r.key, pick: G.fromKey(r.key) }));
  const base = G.teamPower(P, team, null).total;
  P.perk = "strong";
  let tp = G.teamPower(P, team, null);
  assert.strictEqual(tp.total, base + 1); assert.ok(tp.notes.some(n => n.includes("力氣大")));
  P.perk = null; P.flaw = "weak";
  tp = G.teamPower(P, team, null);
  assert.strictEqual(tp.total, base - 1); assert.ok(tp.notes.some(n => n.includes("沒力氣")));
});
T("學得快、慢熱：技能成長多長、少長 1（最少還是 +1）", () => {
  const P = fresh(); G.assignJob(P, "detective"); P.skills.鑑賞 = 20; P.skillTicks = { 鑑賞: true };
  P.perk = "quick";
  G.setRng(seq(d100(90), dN(5, 10)));
  let g = G.skillGrowth(P);
  assert.strictEqual(g[0].gain, 6); assert.strictEqual(g[0].adj, 1); assert.strictEqual(P.skills.鑑賞, 26);
  P.perk = null; P.flaw = "slow"; P.skillTicks = { 鑑賞: true };
  G.setRng(seq(d100(90), dN(1, 10)));
  g = G.skillGrowth(P);
  assert.strictEqual(g[0].gain, 1); assert.strictEqual(P.skills.鑑賞, 27);
  G.setRng(null);
});
T("好運、悲觀、失眠：第一位參觀者也一樣，開場心情、理智跟著加減（今天的理智從加減之後算）", () => {
  let P = fresh(); const mood = P.mood;
  const r = chooseWith(P, "detective", "lucky", "insomnia");
  assert.strictEqual(P.visitor, 1);
  assert.strictEqual(P.mood, Math.min(99, mood + G.traitById("lucky").mood));
  assert.strictEqual(P.sanity, G.NUM.startSanity + G.traitById("insomnia").sanity);
  assert.strictEqual(P.day.startSan, P.sanity);
  assert.strictEqual(r.moodFrom, mood); assert.strictEqual(r.moodAdj, G.traitById("lucky").mood);
  assert.strictEqual(r.sanityFrom, G.NUM.startSanity); assert.strictEqual(r.sanityAdj, G.traitById("insomnia").sanity);
  P = fresh(); const m2 = P.mood;
  chooseWith(P, "detective", "strong", "gloomy");
  assert.strictEqual(P.mood, Math.max(0, m2 + G.traitById("gloomy").mood));
  // 第 2 位也一樣
  G.nextVisitor(P); const m3 = P.mood;
  chooseWith(P, "historian", "lucky", "weak");
  assert.strictEqual(P.mood, Math.min(99, m3 + G.traitById("lucky").mood));
});
T("多才多藝、笨手笨腳：技能起點加減（回傳的 delta 跟實際加減一樣）", () => {
  let P = fresh();
  const sk = baseSkills("detective"), main = G.jobSkill("detective"), others = G.traitById("allround").others;
  const r = chooseWith(P, "detective", "allround", "darkfear");
  G.SKILLS.forEach(s => assert.strictEqual(P.skills[s], s === main ? sk[s] : Math.min(99, sk[s] + others), s));
  G.SKILLS.forEach(s => assert.strictEqual(r.delta[s] || 0, P.skills[s] - sk[s], s));
  P = fresh();
  const cl = G.traitById("clumsy"), sk2 = baseSkills("detective");
  chooseWith(P, "detective", "strong", "clumsy");
  assert.strictEqual(P.skills[cl.skillName], Math.max(1, sk2[cl.skillName] + cl.skillAdj));
});
T("手腳俐落、手滑：受傷的隊員早、晚 1 天好", () => {
  const P = P3();
  const team = [mk(P, { 顏色: "綠" }), mk(P, { 顏色: "黃" }), mk(P, { 顏色: "黑" })].map(r => r.key);
  G.startCellar(P, 1, team);
  const room = G.currentRoom(P);
  const res = { room, choice: { success: {}, fail: { injure: true } }, type: "power", success: false };
  P.flaw = "butter";
  assert.strictEqual(G.injureDaysOf(P), G.NUM.injureDays + 1);
  const fx = G.cellarApply(P, res);
  assert.strictEqual(P.injured[fx.injured.key], G.addDays(P.day.date, G.NUM.injureDays + 1));
  P.flaw = null; P.perk = "nimble";
  assert.strictEqual(G.injureDaysOf(P), Math.max(1, G.NUM.injureDays - 1));
});
T("怕黑：地下收藏庫扣理智時多扣；看懂檢定比較容易", () => {
  const P = P3();
  const team = [mk(P, { 顏色: "綠" }), mk(P, { 顏色: "黃" }), mk(P, { 顏色: "黑" })].map(r => r.key);
  G.startCellar(P, 1, team);
  const room = G.currentRoom(P);
  const res = { room, choice: { success: {}, fail: { san: "3" } }, type: "power", success: false };
  const extra = G.traitById("darkfear").cellarSan;
  assert.strictEqual(G.cellarApply(P, res).sanLoss, 3);
  P.flaw = "darkfear";
  const fx = G.cellarApply(P, res);
  assert.strictEqual(fx.sanLoss, 3 + extra); assert.strictEqual(fx.dark, extra);
  assert.strictEqual(G.cellarDarkLoss(P, 0), 0); assert.strictEqual(G.cellarDarkLoss(P, 2), extra);
  P.myth = 0;
  G.setRng(seq(d100(1)));
  assert.strictEqual(G.understandCheck(P).target, G.NUM.understandBase + G.traitById("darkfear").understand);
  G.setRng(null);
});

T("第一位參觀者抽到的，規則裡都算：每一種優缺點各抽一次（traitSum、融合價、受傷天數）", () => {
  const all = G.PERKS.concat(G.FLAWS);
  const START = ["mood", "sanity", "others", "skillAdj"]; // 開場就加完的（上面另外測）
  const FIELDS = [...new Set(all.flatMap(t => Object.keys(t).filter(k => typeof t[k] === "number")))].filter(k => !START.includes(k));
  assert.ok(FIELDS.includes("fusion") && FIELDS.includes("power") && FIELDS.includes("cellarSan"));
  all.forEach(t => {
    const isPerk = G.PERKS.includes(t);
    const job = jobIds().find(id => !(t.notJob || []).includes(id));
    const o = (isPerk ? G.FLAWS : G.PERKS).find(x => !(x.notJob || []).includes(job) && !G.traitsClash(x, t)); // 配一個不同類的
    const P = fresh();
    if (isPerk) chooseWith(P, job, t.id, o.id); else chooseWith(P, job, o.id, t.id);
    assert.strictEqual(P.visitor, 1); assert.strictEqual(isPerk ? P.perk : P.flaw, t.id);
    FIELDS.forEach(f => assert.strictEqual(G.traitSum(P, f), (t[f] || 0) + (o[f] || 0), t.id + " " + f));
    assert.strictEqual(G.fusionPrice(P), Math.max(0, G.NUM.fusionCost + (t.fusion || 0) + (o.fusion || 0)), t.id);
    assert.strictEqual(G.injureDaysOf(P), Math.max(1, G.NUM.injureDays + (t.injure || 0) + (o.injure || 0)), t.id);
  });
});

// ---------- 舊存檔（決定 0028：已經在館裡的參觀者不改） ----------
T("舊存檔：0028 以前的第一位參觀者（選了職業、沒有優缺點）讀回來還是沒有，不補抽；職業、技能、心情、理智都不變", () => {
  const P = fresh(); G.assignJob(P, "detective"); P.mood = 63; P.sanity = 41; // 以前第一位只選職業（assignJob），沒有抽
  const old = J(P); delete old.perk; delete old.flaw; delete old.cands; // 更早的存檔連欄位都沒有
  const back = G.migrateSave(J(saveOf(old))).profiles.challenge;
  assert.strictEqual(back.perk, null); assert.strictEqual(back.flaw, null);
  assert.strictEqual(back.job, "detective"); assert.strictEqual(S(back.skills), S(P.skills)); assert.strictEqual(back.mood, 63); assert.strictEqual(back.sanity, 41);
  assert.strictEqual(G.traitSum(back, "fusion"), 0); assert.strictEqual(G.fusionPrice(back), G.NUM.fusionCost);
  assert.strictEqual(G.chooseJob(back, "gambler"), null); assert.strictEqual(back.perk, null); assert.strictEqual(back.job, "detective"); // 有職業了：不會再抽
  // 有欄位、是 null 的（0016 以後、0028 以前的第一位）也一樣
  const old2 = J(P); old2.perk = null; old2.flaw = null;
  const b2 = G.fixProfile(old2, "challenge");
  assert.strictEqual(b2.perk, null); assert.strictEqual(b2.flaw, null); assert.strictEqual(b2.job, "detective");
});
T("舊存檔：以前從候選人挑的（有優缺點）照舊，效果照算", () => {
  const P = fresh(); G.nextVisitor(P); G.assignJob(P, "historian"); P.perk = "thrifty"; P.flaw = "butter"; // 以前 chooseCandidate 做的事
  const back = G.migrateSave(J(saveOf(J(P)))).profiles.challenge;
  assert.strictEqual(back.perk, "thrifty"); assert.strictEqual(back.flaw, "butter"); assert.strictEqual(back.job, "historian"); assert.strictEqual(back.visitor, 2);
  assert.strictEqual(G.fusionPrice(back), G.NUM.fusionCost + G.traitById("thrifty").fusion);
  assert.strictEqual(G.injureDaysOf(back), G.NUM.injureDays + G.traitById("butter").injure);
});
T("舊存檔：還在門口、3 位候選人還沒挑的：讀回來候選人原樣留著；選職業照新的做法（6 個都能選、抽優缺點），候選人清掉", () => {
  const P = fresh(); G.nextVisitor(P);
  P.cands = [{ job: "detective", perk: "strong", flaw: "slow", skills: G.rollSkills("detective") }, { job: "gambler", perk: "lucky", flaw: "weak", skills: G.rollSkills("gambler") },
    { job: "artisan", perk: "quick", flaw: "gloomy", skills: G.rollSkills("artisan") }];
  const cands = S(P.cands);
  const back = G.migrateSave(J(saveOf(J(P)))).profiles.challenge;
  assert.strictEqual(S(back.cands), cands); assert.strictEqual(back.job, null); assert.strictEqual(back.perk, null);
  const r = chooseWith(back, "occultist", "sweet", "restless"); // 候選人裡沒有的職業也能選
  assert.ok(r); assert.strictEqual(back.job, "occultist"); assert.strictEqual(back.cands, null);
  assert.strictEqual(back.perk, "sweet"); assert.strictEqual(back.flaw, "restless");
});

// ---------- 退休換人（決定 0025） ----------
const retiree = () => { const P = fresh(); G.setRng(G.mulberry32(3)); G.assignJob(P, "detective"); G.setRng(null); P.visit.from = G.addDays(G.todayStr(), -G.LEGACY.retireDays); return P; };
T("退休：館長室要來了 LEGACY.retireDays 天以上；看完結局不用等", () => {
  const P = retiree();
  assert.deepStrictEqual(J(G.retireCheck(P, "office")), { ok: true, reason: null });
  P.visit.from = G.todayStr();
  const c = J(G.retireCheck(P, "office"));
  assert.strictEqual(c.ok, false); assert.strictEqual(c.reason, "new"); assert.strictEqual(c.days, G.LEGACY.retireDays);
  assert.strictEqual(G.retireCheck(P, "ending").ok, true);
  P.visit.from = null; // 舊存檔不知道哪天來的
  assert.strictEqual(G.retireCheck(P, "office").ok, true);
});
T("退休：燈熄了、正在發作、正在地下、還沒挑職業、自由模式都不行", () => {
  const why = P => G.retireCheck(P, "ending").reason;
  let P = retiree(); P.dark = true; assert.strictEqual(why(P), "dark");
  P = retiree(); P.sanity = 0; assert.strictEqual(why(P), "dark");
  P = retiree(); P.bout = { i: 1, left: 2 }; assert.strictEqual(why(P), "bout");
  P = retiree(); P.cellar.run = { floor: 1, idx: 0 }; assert.strictEqual(why(P), "cellar");
  P = retiree(); P.job = null; assert.strictEqual(why(P), "picking");
  assert.strictEqual(why(fresh("free")), "free");
});
T("退休的結局都有文字；退休走 nextVisitor，牆上記怎麼結束的，理智不用歸零", () => {
  G.RETIRE_ENDINGS.forEach(id => assert.ok(id === "cellar" ? G.ENDING_CELLAR.title : G.ENDINGS[id] && G.ENDINGS[id].title, id));
  assert.ok(!G.RETIRE_ENDINGS.includes("russia8"));
  ["endEnding", "endRetire", "retireBtn", "stayBtn", "retireAsk", "officeAsk1", "officeAsk2", "notNew"].forEach(k => assert.ok(G.LEGACY_TEXT[k], k));
  const P = retiree(); P.vname = "阿明"; P.sanity = 33; mk(P, {});
  const r = G.nextVisitor(P, "curator", { type: "skill" });
  assert.strictEqual(r.entry.endedBy, "curator"); assert.strictEqual(r.entry.where, null); assert.strictEqual(r.entry.name, "阿明");
  assert.strictEqual(P.history[0].endedBy, "curator");
  assert.strictEqual(P.visitor, 2); assert.strictEqual(P.sanity, G.NUM.startSanity); assert.strictEqual(P.cands, null); assert.strictEqual(P.job, null);
  assert.strictEqual(P.legacy.fromName, "阿明"); assert.strictEqual(P.legacy.from, 1);
});
T("遺物、前一位留下的記名字（沒有名字是 null）", () => {
  const P = retiree(); P.vname = "阿明"; const a = mk(P, { 顏色: "藍" });
  G.nextVisitor(P, "retire", { type: "relic", item: { kind: "pepe", key: a.key } });
  assert.strictEqual(P.relics[0].name, "阿明"); assert.strictEqual(P.relics[0].n, 1); assert.strictEqual(P.legacy.fromName, "阿明");
  G.chooseJob(P, "detective");
  G.nextVisitor(P, "russia8", { type: "relic", item: { kind: "pepe", key: a.key } }); // 第 2 位沒有取名字
  assert.strictEqual(P.relics[0].name, null); assert.strictEqual(P.legacy.fromName, null);
});

// ---------- 真正的 ES 模組也接得上（legacy ⇄ logic ⇄ logic3 互相 import） ----------
(async () => {
  try {
    const url = f => pathToFileURL(path.join(__dirname, "..", "shared", f)).href;
    const logic = await import(url("logic.js"));
    const legacy = await import(url("legacy.js"));
    const P = logic.newProfile("challenge"); logic.ensureDay(P, "2026-11-08");
    assert.ok(legacy.chooseJob(P, "artisan")); // 第一位也抽
    assert.ok(legacy.traitById(P.perk) && legacy.traitById(P.flaw));
    logic.nextVisitor(P, "russia8", { type: "skill" });
    assert.strictEqual(P.cands, null); assert.strictEqual(P.job, null);
    assert.ok(legacy.chooseJob(P, "gambler"));
    assert.strictEqual(legacy.chooseJob(P, "gambler"), null);
    pass++;
  } catch (e) { fail++; console.log("FAIL ES 模組", "\n   ", e.message); }
  console.log(`${pass} passed, ${fail} failed（參觀者一位接一位）`);
  process.exit(fail ? 1 : 0);
})();
