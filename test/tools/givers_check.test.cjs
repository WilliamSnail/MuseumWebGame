// 交代人台詞的檢查（tools/check/givers_check.cjs）：真的 content/givers 過得了，壞的擋得住
const assert = require("assert");
const { checkGivers, readGivers } = require("../../tools/check/givers_check.cjs");
const { readJSON, LEDGER } = require("../../tools/content/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const clone = o => JSON.parse(JSON.stringify(o));
const real = readGivers(), ledger = readJSON(LEDGER);
const base = () => ({ givers: clone(real.givers), bad: [], ledger });
const get = (c, id) => c.givers.find(g => g.id === id);
const expectErr = (mutate, re) => { const c = base(); mutate(c); const r = checkGivers(c); assert.ok(r.errors.some(e => re.test(e)), `應該擋下來：${re}；實際：${r.errors.join("｜")}`); };

T("真的 content/givers：六位都在、沒有壞檔、都過", () => {
  assert.deepStrictEqual(real.bad, []);
  assert.strictEqual(real.givers.length, ledger.taskGivers.list.length);
  assert.deepStrictEqual(checkGivers(base()).errors, []);
});
T("太長、用了「一」、英文字母、數字都擋", () => {
  expectErr(c => { get(c, "hall").chat.morning[0] = "壹".repeat(41); }, /太長/);
  expectErr(c => { get(c, "hall").chat.morning[0] = "今天一碗湯。"; }, /壹/);
  expectErr(c => { get(c, "hall").chat.morning[0] = "今天推薦 R。"; }, /英文字母/);
  expectErr(c => { get(c, "hall").chat.morning[0] = "今天有 3 碗湯。"; }, /數字/);
});
T("R 只有 yuga 可以用", () => {
  const c = base(); get(c, "yuga").chat.morning[0] = "R，早。"; assert.deepStrictEqual(checkGivers(c).errors, []);
});
T("贏輸賺賠催玩、撥款信那條線、後面才揭的事都擋", () => {
  expectErr(c => { get(c, "yuga").chat.noon[0] = "R，今天你會贏。"; }, /不能寫/);
  expectErr(c => { get(c, "number").chat.night[0] = "叫號：池子的水位。"; }, /不能寫/);
  expectErr(c => { get(c, "number").chat.named[0] = "叫號：{name}，請離開。"; }, /不能寫/);
});
T("缺時段、缺字條、缺稱號、id 不在帳本都擋", () => {
  expectErr(c => { get(c, "yuga").chat.noon = []; }, /沒有閒聊/);
  expectErr(c => { delete get(c, "hall").away.night; }, /沒有閒聊/);
  expectErr(c => { delete get(c, "hall").call[3]; }, /要有字/);
  expectErr(c => { get(c, "hall").id = "nobody"; }, /不在帳本/);
});
T("第二批：小故事、拜託、送禮的欄位都擋得住壞的", () => {
  expectErr(c => { get(c, "hall").story.parts[0].pop(); }, /每段 3 句/);
  expectErr(c => { get(c, "hall").errands[0].kind = "deposit"; }, /kind 只能是/);
  expectErr(c => { get(c, "hall").errands[2].to = "hall"; }, /另壹位交代人/);
  expectErr(c => { get(c, "hall").gift.likes.款式 = ["A"]; }, /欄位只能是/);
  expectErr(c => { get(c, "hall").gift.likes.帽子 = ["不存在的帽"]; }, /不是圖鑑裡的選項/);
  expectErr(c => { get(c, "hall").gift.love = ["壹"]; }, /至少 2 句/);
  expectErr(c => { get(c, "number").story.last = "（收走你的名字。）"; }, /不能寫/);
  assert.ok(get(base(), "number").gift, "號碼機也收禮（決定 0151 題 5 選 B）");
});
console.log(`交代人台詞檢查：${pass} 通過，${fail} 失敗`);
if (fail) process.exit(1);
