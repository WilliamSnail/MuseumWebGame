// 掌聲門檻、整點鐘聲的判斷（11-16）
const assert = require("assert");
(async () => {
  const A = await import("../../shared/social/applause.js");
  const T = (y, mo, d, h, mi, s = 0) => Date.UTC(y, mo - 1, d, h - 8, mi, s); // 台灣時間 → 毫秒
  assert.strictEqual(A.taipeiHour(T(2026, 11, 16, 0, 0)), 0);
  assert.strictEqual(A.taipeiHour(T(2026, 11, 16, 23, 59, 59)), 23);
  assert.strictEqual(A.taipeiHour(T(2026, 11, 16, 7, 30)), 7);
  // 12 小時制：0 和 12 都敲 12 下
  assert.deepStrictEqual([0, 1, 11, 12, 13, 23].map(A.chimeCount), [12, 1, 11, 12, 1, 11]);
  // 跨過整點才響
  assert.ok(A.chimeDue(T(2026, 11, 16, 9, 59, 50), T(2026, 11, 16, 10, 0, 5)));
  assert.ok(A.chimeDue(T(2026, 11, 16, 23, 59, 50), T(2026, 11, 17, 0, 0, 5)));
  assert.ok(!A.chimeDue(T(2026, 11, 16, 10, 0, 5), T(2026, 11, 16, 10, 0, 20)), "同壹個鐘點不敲");
  assert.ok(!A.chimeDue(null, T(2026, 11, 16, 10, 0, 5)), "剛開遊戲不補敲");
  assert.ok(!A.chimeDue(T(2026, 11, 16, 9, 0), T(2026, 11, 16, 10, 5)), "睡了很久醒來不補敲");
  // 展廳高分：只有「跨過」才響
  const t = A.APPLAUSE.hallScore;
  assert.ok(A.hallApplauseDue(t - 1, t) && A.hallApplauseDue(0, 100));
  assert.ok(!A.hallApplauseDue(t, t + 5) && !A.hallApplauseDue(t - 5, t - 1));
  // 拍賣成交
  assert.ok(A.aucDealDone(["「畫」賣出，100"]) && A.aucDealDone(["拍到「畫」，付 1"]));
  assert.ok(!A.aucDealDone(["「畫」沒有拍到，鎖住的籌碼退回。"]) && !A.aucDealDone([]));
  console.log("1 passed, 0 failed（掌聲和整點鐘）");
})().catch(e => { console.error(e); process.exit(1); });
