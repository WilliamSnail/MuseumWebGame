// 館內 NPC 的內容檢查（tools/npc_check.cjs）擋得住壞的內容，真的 content/npc 過得了，也打包得進 functions/shared：node test/npc_check.test.cjs（npm test 也會跑）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { checkNpc, readNpc } = require("../tools/npc_check.cjs");
const { readJSON, LEDGER } = require("../tools/week_check.cjs");
const G = require("./load_shared.cjs").load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const clone = o => JSON.parse(JSON.stringify(o));
const real = readNpc(), ledger = readJSON(LEDGER);
const base = () => ({ npcs: clone(real.npcs), bad: [], ledger });
const get = (c, id) => c.npcs.find(n => n.id === id);
const run = c => checkNpc(c);
const expectErr = (mutate, re) => { const c = base(); mutate(c); const r = run(c); assert.ok(r.errors.some(e => re.test(e)), `應該擋下（${re}），結果：\n${r.errors.slice(0, 5).join("\n") || "沒擋"}`); };

T("真的 content/npc：都過、沒有壞檔", () => {
  assert.deepStrictEqual(real.bad, []);
  const r = run(base());
  assert.deepStrictEqual(r.errors, []);
});
T("數量和種類：委託人 20 位全搬進來、帳本 5 位角色都是劇情角色、旅客至少 8 位", () => {
  const k = x => real.npcs.filter(n => n.kind === x);
  assert.strictEqual(k("client").length, G.CLIENTS.length);
  G.CLIENTS.forEach(c => { const n = k("client").find(x => x.name === c.name); assert.ok(n, c.name); assert.strictEqual(n.note, c.note, c.name + " 的 note 要照原文"); });
  assert.strictEqual(k("trace").length, ledger.characters.length);
  assert.ok(k("visitor").length >= 8);
});
T("每位都有名字、預算不壹樣、不同身分的預算差很多", () => {
  const paid = real.npcs.filter(n => n.kind !== "trace");
  assert.strictEqual(new Set(paid.map(n => n.budget.perDay)).size, paid.length, "perDay 每位都不壹樣");
  assert.ok(real.npcs.every(n => n.name && n.name.trim()));
  const tiers = new Set(paid.map(n => n.budget.tier));
  assert.ok(["drifter", "modest", "comfortable", "collector"].every(t => tiers.has(t)), "四級都有人");
  const max = Math.max(...paid.map(n => n.budget.perDay)), min = Math.min(...paid.map(n => n.budget.perDay));
  assert.ok(max / min >= 50, "最有錢的和最窮的差 50 倍以上");
});
T("至少 6 位有 3 段故事線，每段都有日期，第 1 段不用全館進度", () => {
  const three = real.npcs.filter(n => n.arc.length >= 3);
  assert.ok(three.length >= 6, "只有 " + three.length + " 位");
  real.npcs.forEach(n => n.arc.forEach((s, j) => { assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.from)); if (j === 0) assert.strictEqual(s.need, undefined); }));
});
T("劇情角色：不帶錢、不去哪裡、沒有故事線改路線", () => {
  real.npcs.filter(n => n.kind === "trace").forEach(n => { assert.strictEqual(n.budget.tier, "none"); assert.strictEqual(n.budget.perDay, 0); assert.deepStrictEqual(n.likes, []); assert.deepStrictEqual(n.route, {}); });
});

T("擋：id 重複", () => expectErr(c => { get(c, "c-cat").id = "c-bus"; }, /重複/));
T("擋：名字重複", () => expectErr(c => { get(c, "v-duck").name = "阿霧"; }, /名字「阿霧」重複/));
T("擋：沒有名字", () => expectErr(c => { get(c, "v-duck").name = ""; }, /name.*要有字/));
T("擋：缺欄位（沒有 story）", () => expectErr(c => { delete get(c, "v-duck").story; }, /story.*要有字/));
T("擋：不認得的欄位", () => expectErr(c => { get(c, "v-duck").money = 5; }, /不認得欄位「money」/));
T("擋：kind 不對", () => expectErr(c => { get(c, "v-duck").kind = "boss"; }, /kind 要是/));
T("擋：id 前綴跟 kind 不合", () => expectErr(c => { get(c, "v-duck").kind = "client"; }, /要用「c-」開頭/));
T("擋：地點不在允許的清單", () => expectErr(c => { get(c, "v-duck").route.moon = 3; }, /地點「moon」不認得/));
T("擋：權重超過上限", () => expectErr(c => { get(c, "v-duck").route.food = 99; }, /權重要是 0～/));
T("擋：喜好不在允許的清單", () => expectErr(c => { get(c, "v-duck").likes.push("星星"); }, /喜好「星星」不認得/));
T("擋：預算不在那一級的範圍（路人拿 100 萬）", () => expectErr(c => { const b = get(c, "v-duck").budget; b.perDay = 1000000; }, /perDay.*110?0?0?|perDay（壹天最多花）要是/));
T("擋：tier 不存在", () => expectErr(c => { get(c, "v-duck").budget.tier = "king"; }, /tier 是/));
T("擋：單筆比壹天還多", () => expectErr(c => { const b = get(c, "v-mimi").budget; b.max = 150000; b.perDay = 70000; }, /max.*範圍|不能比 perDay/));
T("擋：兩位預算壹樣", () => expectErr(c => { get(c, "v-duck").budget.perDay = get(c, "v-mimi").budget.perDay; }, /壹樣（每個 NPC/));
T("擋：預算不是壹千的倍數", () => expectErr(c => { get(c, "v-duck").budget.perDay = 110500; }, /壹千的倍數/));
T("擋：劇情角色帶錢", () => expectErr(c => { Object.assign(get(c, "t-guard").budget, { tier: "drifter", perDay: 30000, max: 10000 }); }, /劇情角色只能是 none/));
T("擋：旅客用 none", () => expectErr(c => { get(c, "v-duck").budget = { tier: "none", perDay: 0, max: 0 }; }, /none 只給劇情角色/));
T("擋：劇情角色有去的地方", () => expectErr(c => { get(c, "t-guard").route = { hall: 3 }; }, /劇情角色不去哪裡/));
T("擋：劇情角色露臉（寫長相）", () => expectErr(c => { get(c, "t-squat").story = "他有壹張圓圓的臉。"; }, /不露臉.*「臉」/));
T("擋：真人、品牌", () => expectErr(c => { get(c, "v-duck").story = "在星巴克遇到的人。"; }, /禁用字「星巴克」/));
T("擋：真人名字", () => expectErr(c => { get(c, "v-duck").arc[0].text = "他說他認識柯文哲。"; }, /禁用字「柯文哲」/));
T("擋：英文字母", () => expectErr(c => { get(c, "v-duck").story = "愛玩 Pepe 的人。"; }, /英文字母/));
T("擋：用「一」不用「壹」", () => expectErr(c => { get(c, "v-duck").story = "每次都點同一份。"; }, /用「壹」/));
T("擋：破梗（謎底的說法）", () => expectErr(c => { get(c, "v-fog").arc[0].text = "他發現會計把自己算進去了。"; }, /破梗/));
T("擋：破梗（跟謎底壹樣的句子）", () => expectErr(c => { get(c, "v-fog").arc[0].text = "他說差的不是東西，是數的人。"; }, /破梗/));
T("擋：太長", () => expectErr(c => { get(c, "v-duck").story = "很".repeat(61); }, /太長了/));
T("擋：故事線 step 錯", () => expectErr(c => { get(c, "v-fog").arc[1].step = 5; }, /step 要照順序/));
T("擋：故事線日期沒有往後", () => expectErr(c => { const a = get(c, "v-fog").arc; a[1].from = a[0].from; }, /要比上壹段晚/));
T("擋：故事線日期壞掉", () => expectErr(c => { get(c, "v-fog").arc[0].from = "2026-13-45"; }, /from 要是日期/));
T("擋：全館進度的指標不認得", () => expectErr(c => { get(c, "v-fog").arc[1].need = { metric: "myCoins", n: 5 }; }, /metric 是/));
T("擋：全館進度超過上限", () => expectErr(c => { get(c, "c-umbrella").arc[1].need = { metric: "commissions", n: 99999 }; }, /n 最多/));
T("擋：旅客用委託人的進度", () => expectErr(c => { get(c, "v-fog").arc[1].need = { metric: "commissions", n: 3 }; }, /只有委託人/));
T("擋：第 1 段寫 need", () => expectErr(c => { get(c, "v-fog").arc[0].need = { metric: "hallVisits", n: 3 }; }, /第 1 段只看日期/));
T("擋：故事線超過 6 段", () => expectErr(c => { const a = get(c, "c-umbrella").arc; for (let i = 0; i < 4; i++) a.push({ step: a.length + 1, from: `2027-0${i + 1}-01`, text: "他又來了。" }); }, /1～6 段/));
T("擋：沒有故事線（旅客）", () => expectErr(c => { get(c, "v-duck").arc = []; }, /arc.*1～6 段/));
T("擋：ties 不在帳本", () => expectErr(c => { get(c, "v-fog").arc[0].ties = ["m-nope"]; }, /不在帳本/));
T("擋：段落的 route 地點不認得", () => expectErr(c => { get(c, "v-fog").arc[2].route = { moon: 5 }; }, /地點「moon」/));
T("擋：委託人少了壹位", () => expectErr(c => { c.npcs = c.npcs.filter(n => n.id !== "c-cat"); }, /樓下的貓.*還沒搬進來/));
T("擋：委託人的 note 被改", () => expectErr(c => { get(c, "c-cat").note = "不壹樣的話。"; }, /note 要跟 CLIENTS 原文壹樣/));
T("擋：JSON 壞掉的檔", () => { const c = base(); c.bad = ["content/npc/x.json：JSON 讀不出來（壞）"]; assert.ok(run(c).errors.some(e => /JSON 讀不出來/.test(e))); });
T("警告：帳本多了角色但沒有 trace", () => { const c = base(); c.ledger = clone(ledger); c.ledger.characters.push({ name: "新來的人", how: "測試" }); assert.ok(run(c).warnings.some(w => /新來的人/.test(w))); });

// 打包給伺服器：tools/copy_shared.cjs → functions/shared/npc_list_data.js
(async () => {
  try {
    require("child_process").execFileSync(process.execPath, [path.join(__dirname, "..", "tools", "copy_shared.cjs")], { stdio: "pipe" });
    const url = require("url").pathToFileURL(path.join(__dirname, "..", "functions", "shared", "npc_list_data.js")).href;
    const { NPC_LIST } = await import(url);
    T("打包：NPC_LIST 跟 content/npc 壹樣多、照 id 排序、內容壹樣", () => {
      assert.strictEqual(NPC_LIST.length, real.npcs.length);
      assert.deepStrictEqual(NPC_LIST.map(n => n.id), real.npcs.map(n => n.id).sort());
      const o = clone(real.npcs.find(n => n.id === "v-fog")); delete o.__file;
      assert.deepStrictEqual(NPC_LIST.find(n => n.id === "v-fog"), o);
      assert.ok(NPC_LIST.every(n => n.__file === undefined));
    });
  } catch (e) { fail++; console.log("FAIL 打包", e.message); }
  console.log(`館內 NPC 的內容檢查：${pass} 過、${fail} 沒過`);
  process.exit(fail ? 1 : 0);
})();
