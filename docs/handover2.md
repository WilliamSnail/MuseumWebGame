# 美術統籌 交接（11-13 晚，專案搬到 E:\MuseumWebGame 之前）

給在 E 槽新開的美術統籌 session。先讀 `E:\MuseumWebGame` 的 AGENTS.md、docs/現況.md、docs/介面整合規劃.md（第六步）、docs/介面配色.md、docs/class名單.md、docs/素材生成.md、docs/介面重塑素材清單.md。全程用繁體中文回翊文。

## 專案狀態
- 專案已搬到 `E:\MuseumWebGame`（C 槽舊資料夾會刪）。repo 改公開，CI 合併後不再重跑（PR 278）。
- 我之前開的 worktree 都在 C 槽 scratchpad，**全部作廢**，不要用。新的做法：在 E:\MuseumWebGame 跑 `node tools/new_worktree.cjs --dir <新資料夾> --branch claude/<名字>`；預覽用 `.claude/launch.json` 新加設定（port 5181 以上，不要用 5173，那是主 session 的）。
- 合併：`npm run ship -- --title … --body-file … --skip-local`（ship 會 git add -A）。常見失敗：shared/notices.js 最上面被自動解衝突弄壞括號 → `node --check shared/notices.js` 修；merge conflict → 再跑一次 ship。
- 修改要有維護日誌（`npm run doc:new -- 檔.json`）、館方公告（shared/notices.js，介面字用「壹」）。

## 已完成（都已上線）
地下收藏庫入口、圖鑑室、展廳（含手機直拿）、委託櫃台抽屜、打怪手機橫拿、大廳（手機橫拿、直拿、電腦右欄、導覽圖多銀行房間）、融合室（魔法陣＋抽屜修正，PR 274、281）、銀行廳畫面（PR 265，示範資料）、賭場手機（PR 275、280，沒量過）。

## 還沒做 / 要注意
1. **銀行廳**：主 session 在改 `web/src/ui_bank.js`，不要動；要改 `css/bank.css` 先跟主 session 說。待辦：手機橫拿很擠（主區 174px）、換上翊文的紅漲綠跌小牌（`ui2-bank-tag-up/down`）、股價折線底（`ui2-bank-chart`）、定存格底（`ui2-bank-slot`）。導覽圖「銀行」熱區要 `ADDONS.bankOpen = true` 才出現（主 session 管）。
2. **賭場手機**（PR 275、280）都是 CSS 推算、沒在瀏覽器量（賭場要伺服器錢包）。請測試 session 複測：375×740 寬不被撐開、「發牌」在第一屏。
3. **圖書館**（U-6、P-8 書架框／層板／亮書、P-9 站著的書 12 本）還沒做；**畫廊**還沒做；**手作坊**主 session 在修，先別動；**打怪手機直拿**要照 `assets/cellar2/ui-手機.webp` 重排；**館友證**主 session 的子代理在做頭像，別動。
4. 融合室：放一隻、空的、按下融合的動畫（`.fusing`）沒看過；光絲零件（`ui2-light-thread`）沒用上。
5. 零件都在 `web/public/ui2/`（ui2-*.webp），原圖 `assets/ui2/`。規範：`docs/介面配色.md`（--ink／--paper 變數、四級字級）。翊文生的圖放 `docs/生成/`，處理後原圖存 `assets/ui2/`、`docs/生成/` 裡的刪掉；prompt 網頁放 `docs/`，生完就刪。

## 翊文的偏好（這輪學到的）
- 可以按的要看得出能按（金邊、粗體、有框）；可以展開的要寫「點開 ▾」。
- 紫紅花紋壁紙留著；導覽圖留現在這張；紅漲綠跌。
- Pepe 強度、Buff 要顯示清楚、可以篩選。
- 測試不開聲音（網址用 #畫面）。
- 每個廳：電腦 1366×768、手機直拿 375×740、手機橫拿 740×375 都不用捲；量完回報數字。
- 預覽分頁在背景時，量高度前先 `document.querySelectorAll('.enter').forEach(e=>e.classList.remove('enter'))`。

## 【第一件要修】測試複測（PR 274/277/280/281 都通過）剩的版面問題
融合室手機直拿和橫拿：「今天還能融合 N 次」卡和「融合」鈕蓋住提示文字。檔案：web/src/css/onescreen.css 的 fusion-onescreen 區塊（sticky 融合鈕、次數卡）。修完照三尺寸量過再 ship。
賭場手機三尺寸已確認正常（不用再動）。
## 之後可能來的需求
主 session 在跟翊文確認股票加「槓桿、當沖」；銀行廳股票頁會多槓桿倍數、保證金、強制賣出警示、當沖部位。ui_bank.js 仍由主 session 管，等它定好規則和資料格式再說要畫什麼。
