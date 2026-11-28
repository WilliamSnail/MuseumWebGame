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
T("壹週超過兩條人物線會擋", () => bad(L => { L.extend.weeks["2026-W48"].threads.push("t-number-2"); }, /最多 2 條/));
T("壓縮的週寫 threadsMax 和 threadsWhy 才能放寬；沒寫原因不算（11-28 決定 0166）", () => { bad(L => { L.extend.weeks["2026-W50"].threadsWhy = ""; }, /最多 2 條/); bad(L => { L.extend.weeks["2026-W50"].threads.push("t-number-2"); }, /最多 4 條/); });
T("同壹個人的階往回走會擋", () => bad(L => { L.extend.threads.find(x => x.id === "t-number-3").stage = 1; }, /階要隨週數往上/));
T("週表沒列三個去處會擋", () => bad(L => { L.extend.weeks["2026-W50"].leads = ["只有壹個"]; }, /leads 至少要三個/));
T("三條線索不足或同一種地方會擋", () => { bad(L => { L.extend.weeks["2026-W49"].clues.splice(1); }, /clues 至少三條/); bad(L => { L.extend.weeks["2026-W49"].clues.forEach(c => { c.where = "書"; }); }, /三種以上/); });
T("closes 要跟 mysteries 的收線週一致、旁證不能晚於收線週", () => { bad(L => { L.extend.weeks["2026-W49"].closes = ["m-guard"]; }, /不是這週/); bad(L => { L.mysteries.list.find(m => m.id === "m-queue").closeBy = "2026-W49"; }, /晚於 m-queue 的收線週/); });
T("掉落 items：5 件都有、沒審過或抄謎底或週對不上會擋", () => { assert.strictEqual(real.extend.items.length, 5); bad(L => { L.extend.items[0].audit.status = "待審"; }, /audit 要是審過/); bad(L => { L.extend.items[0].lore = L.mysteries.list.find(m => m.id === "m-queue").truth.slice(0, 12); }, /破梗/); bad(L => { L.extend.items[0].week = "2026-W52"; }, /drops 要列|晚於/); });
T("四問：每週 dread、cost、pepe、horror 缺了或空了會擋；cost 要有 san", () => { ["dread", "cost", "pepe", "horror"].forEach(k => bad(L => { delete L.extend.weeks["2026-W51"][k]; }, new RegExp(k + " 要有"))); bad(L => { L.extend.weeks["2026-W49"].horror.what = "空"; }, /horror.what/); bad(L => { L.extend.weeks["2026-W52"].cost.day = "週三"; }, /cost.day/); bad(L => { delete L.extend.weeks["2026-W53"].cost.san; }, /cost.san/); });
T("總表 collect：八個謎和文化部、已知世界、撥款信都在；非集團寫不負責、少列、週對不上會擋", () => {
  assert.ok(real.extend.collect.rows.length >= 18);
  bad(L => { L.extend.collect.rows.find(r => r.id === "c-culture").pepe = "不負責：沒有"; }, /不能寫不負責|只有集團/);
  bad(L => { L.extend.collect.rows.find(r => r.id === "c-m-you").dread = "不負責：x不負責不負責不負責"; }, /只有集團/);
  bad(L => { L.extend.collect.rows.find(r => r.id === "c-g-daily").pepe = "不負責"; }, /不負責|要有字/);
  bad(L => { L.extend.collect.rows = L.extend.collect.rows.filter(r => r.id !== "c-known"); }, /少了 c-known/);
  bad(L => { L.extend.collect.rows.find(r => r.id === "c-m-count").week = "2026-W40"; }, /不在 extend.weeks/);
});
T("每週都要有 dayPlan d1～d7，缺了或太短會擋", () => { bad(L => { delete L.extend.weeks["2026-W50"].dayPlan; }, /dayPlan 要有/); bad(L => { delete L.extend.weeks["2026-W48"].dayPlan.d3; }, /dayPlan\.d3/); bad(L => { L.extend.weeks["2026-W53"].dayPlan.d7 = "短"; }, /dayPlan\.d7/); });
T("beats 不在 revealBeats 會擋", () => bad(L => { L.extend.weeks["2026-W52"].beats.push("b99"); }, /不在 revealBeats/));
T("person 不在 taskGivers 會擋", () => bad(L => { L.extend.threads[0].person = "nobody"; }, /不在 taskGivers/));
console.log(`extend_check：${pass} 過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
