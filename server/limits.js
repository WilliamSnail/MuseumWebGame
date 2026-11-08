// 限制次數：每個 key（IP、帳號、連線）一個桶子。
// 桶子最多裝 capacity 個，每秒補 perSec 個；拿一個走一次，空了就擋。
export function createLimiter({ capacity, perSec }) {
  const buckets = new Map();
  const fill = (b, now) => Math.min(capacity, b.tokens + ((now - b.at) / 1000) * perSec);
  return {
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, at: now }; buckets.set(key, b); }
      b.tokens = fill(b, now);
      b.at = now;
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
    // 已經補滿的桶子丟掉，記憶體不會一直長
    sweep(now = Date.now()) {
      for (const [k, b] of buckets) if (fill(b, now) >= capacity) buckets.delete(k);
    },
    get size() { return buckets.size; },
  };
}
