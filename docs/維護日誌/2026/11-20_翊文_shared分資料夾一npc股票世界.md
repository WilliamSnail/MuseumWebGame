---
日期: 2026-11-20 21:55:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [shared/npc/, shared/stock/, shared/world/, test/load_shared.cjs, tools/content/, tools/release/]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、check_imports／repo_rules／code_rules 都過、functions/index.js 匯出的 34 個名字沒變、ui:check（lobby、workshop）沒有載入錯誤、手機寬度沒另外看
狀態: 待合併
相關: []
---

## 為什麼要改

翊文同意把 shared/ 第一層還平放的 55 支檔也分資料夾（架構整理第三輪）。這一包先做 npc、stock、world 三個系統；story、social、game 和 core 另開 PR。

## 改了什麼

只搬位置、改路徑，沒改行為、數值、文字。檔名去掉系統前綴（同第一輪 casino 的做法），`stocks` 統一成 `stock`。

| 舊 | 新 |
|---|---|
| shared/npc.js | shared/npc/core.js |
| shared/npc_card.js | shared/npc/card.js |
| shared/npc_roster.js（產生檔） | shared/npc/roster.js |
| shared/npc_spend.js | shared/npc/spend.js |
| shared/npc_trip.js | shared/npc/trip.js |
| shared/stocks.js | shared/stock/core.js |
| shared/stocks_text.js | shared/stock/text.js |
| shared/stocks_in_text.js | shared/stock/in_text.js |
| shared/stocks_tw.js | shared/stock/tw.js |
| shared/world.js | shared/world/core.js |
| shared/world_base.js | shared/world/base.js |
| shared/world_events.js（產生檔） | shared/world/events.js |
| shared/world_markets.js（產生檔） | shared/world/markets.js |
| shared/world_roster.js（產生檔） | shared/world/roster.js |
| shared/econ_events.js | shared/world/econ_events.js |
| shared/stat_view.js | shared/world/stat_view.js |
| shared/map.js | shared/world/map.js |
| shared/map_data.js（產生檔） | shared/world/map_data.js |

- 所有 import（shared、web/src、functions、tools、test）照新位置改。
- test/load_shared.cjs 的 ORDER 換成新路徑，順序不變。
- 打包產生檔的輸出路徑跟著改：tools/content/ 的 npc_pack、world_pack、market_pack、world_events_pack、map_pack，還有 day_check、tune；ship.cjs、changed_files.cjs 認「內容檔」的正規式。
- 順手把 PR 869 放錯位置（舊的「維護日誌/」）的那篇日誌搬進 docs/維護日誌/2026/，不然「資料夾的規矩」會紅。

## 怎麼確認的

- npm test 全過、npm run build 成功。
- check_imports、repo_rules、code_rules 單跑都過。
- copy_shared 後載入 functions/index.js，匯出名字一樣 34 個。
- npm run ui:check 抽查 lobby、workshop，沒有載入錯誤（workshop 手機寬度「這裡現在 0 人」按鈕被切，是原本就有的，沒動）。

## 還沒做、要注意

- story、social、game、core 還在 shared/ 第一層，後面的 PR 做。
- 舊維護日誌和決定紀錄裡寫的舊路徑沒改（是歷史紀錄）。

## 給下一個人

- 舊分支合併 main，搬過的檔會變成「舊的刪、新的在別處」，要手動貼到新路徑。
- 用 `path.join(ROOT, "shared", "x.js")` 組路徑的腳本，搬檔後要改成 `"shared", "資料夾", "x.js"`，單純搜尋 `shared/x.js` 找不到。
- 正規式裡寫的路徑（`^shared\/npc\/roster\.js$`）也要改，搜尋字串找不到它。
