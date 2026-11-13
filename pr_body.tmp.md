## 做了什麼
- 賭場記帳：每一條會動籌碼的路都記到帳上（憑空／消失／莊家進出，按來源），不改任何賺賠數字。
- Yuga Bot 日報：伺服器每天第一個來問的人觸發一次全館快照，畫在「拚經濟」頁籤最下面；海底只給水位公分。
- 守恆測試 `test/casino_book.test.cjs`（單人、同桌、亂數一個月，每一步帳都平）。
- 21 點大樣本模擬 `test/sim_bj_long.cjs`：高手打法無加成 −0.18%（800 萬手）、最大加成 +0.05% ±0.10%，之前的 +0.15% 是雜訊，不改。

## 驗證
npm test 全過、npm run build 成功；模擬器兩位玩家各打一輪後叫 report，帳是平的。畫面沒有親眼看過。

## 要翊文決定
日報要不要發 Discord；海底要不要給水位以外的數字。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
