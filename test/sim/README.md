# 模擬腳本

數值模擬都放這裡（11-20 架構整理，從 test/ 收進來）。比較久，不在 npm test 裡跑；改數值時自己跑，例如：

```
node test/sim/sim.cjs 1000        # 節奏
node test/sim/sim_san.cjs 1000    # 理智
node test/sim/sim_cellar.cjs 100  # 地下收藏庫
node test/sim/sim_casino.cjs      # 賭場
```

每支開頭的註解寫了用法和參數。共用的載入器是上一層的 `test/load_shared.cjs`。
