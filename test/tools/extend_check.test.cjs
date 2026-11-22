// 帳本 extend（延伸世界六週表、人物線、旁證審查）的檢查（tools/content/extend_check.cjs）：真的帳本過得了，壞的擋得住
const assert = require("assert");
const { checkExtend } = require("../../tools/content/extend_check.cjs");
const { readJSON, LEDGER } = require("../../tools/content/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const clone = o => JSON.parse(JSON.stringify(o));
const real = readJSON(LEDGER);
const run = L => { const errs = []; checkExtend(L, (w, m) => errs.push(m), () => {}, "L"); return errs; };
const bad = (mutate, re) => { const L = clone(real); mutate(L); const e = run(L); assert.ok(e.some(x => re.test(x)), `應該擋下來：${re}；實際：${e.join("｜")}`); };

T("真的帳本 extend 過得了，六週都有、旁證都審過", () => {
  assert.deepStrictEqual(run(real), []);
  assert.deepStrictEqual(Object.keys(real.extend.weeks), ["2026-W48", "2026-W49", "2026-W50", "2026-W51", "2026-W52", "2026-W53"]);
  assert.ok(real.extend.threads.every(t => t.audit.status === "審過"), "排程只能用審過的旁證");
});
T("沒有 extend 的舊帳本照常", () => { const L = clone(real); delete L.extend; assert.deepStrictEqual(run(L), []); });
T("旁證沒有 audit 會擋", () => bad(L => { delete L.extend.threads[0].audit; }, /audit 要有/));
T("審過但沒寫誰審、沒寫檢查會擋", () => { bad(L => { L.extend.threads[0].audit.by = ""; }, /audit\.by/); bad(L => { L.extend.threads[0].audit.checks = ["壹項"]; }, /checks 至少列三項/); });
T("旁證抄謎底字句會擋", () => bad(L => { const m = L.mysteries.list.find(x => x.id === "m-queue"); L.extend.threads[0].seed = m.truth.slice(0, 12); }, /破梗/));
T("壹週超過兩條人物線會擋", () => bad(L => { L.extend.weeks["2026-W48"].threads.push("t-number-2"); }, /最多兩條/));
T("同壹個人的階往回走會擋", () => bad(L => { L.extend.threads.find(x => x.id === "t-number-3").stage = 1; }, /階要隨週數往上/));
T("週表沒列三個去處會擋", () => bad(L => { L.extend.weeks["2026-W50"].leads = ["只有壹個"]; }, /leads 至少要三個/));
T("三條線索不足或同一種地方會擋", () => { bad(L => { L.extend.weeks["2026-W49"].clues.splice(1); }, /clues 至少三條/); bad(L => { L.extend.weeks["2026-W49"].clues.forEach(c => { c.where = "書"; }); }, /三種以上/); });
T("closes 要跟 mysteries 的收線週一致、旁證不能晚於收線週", () => { bad(L => { L.extend.weeks["2026-W50"].closes = ["m-guard"]; }, /不是這週/); bad(L => { L.mysteries.list.find(m => m.id === "m-queue").closeBy = "2026-W51"; }, /晚於 m-queue 的收線週/); });
T("beats 不在 revealBeats 會擋", () => bad(L => { L.extend.weeks["2026-W52"].beats.push("b99"); }, /不在 revealBeats/));
T("person 不在 taskGivers 會擋", () => bad(L => { L.extend.threads[0].person = "nobody"; }, /不在 taskGivers/));
console.log(`extend_check：${pass} 過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
