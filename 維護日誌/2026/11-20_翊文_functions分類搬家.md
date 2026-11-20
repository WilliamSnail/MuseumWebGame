---
日期: 2026-11-20 21:40:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 伺服器
範圍: [functions/, tools/check/repo_rules.cjs, test/tools/functions_imports.test.cjs, AGENTS.md, docs/]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、node tools/check/check_imports.cjs、node tools/check/repo_rules.cjs、本機 copy_shared 後 node 載入 functions/index.js（34 個匯出名字跟搬之前一樣）
狀態: 待合併
相關: [維護日誌/2026/11-20_翊文_test分類搬家.md]
---

## 為什麼要改

資料夾結構第二輪（翊文：「照規劃做」）的第四項。functions/ 第一層平放 25 支，discord 開頭 8 支、casino 5 支；跟 shared/ 的分法對不起來。

## 改了什麼

只搬位置、改路徑，沒改行為、數值、文字。**部署入口 `functions/index.js` 匯出的 34 個函式名字都沒變**（不會被當成刪掉重建）。

- 用 `git mv` 搬 25 支到 `functions/<系統>/`，檔名不變。
- 每支裡的 `import "./shared/…"` 改成 `"../shared/…"`（`functions/shared/` 是部署前由 tools/release/copy_shared.cjs 複製出來的，位置沒變）；彼此的 import 照新位置重算（例如 `./party.js` → `../coop/party.js`）。
- functions/index.js 的 `export … from "./xxx.js"` 改成新路徑；`options.js` 留在第一層，各支用 `"../options.js"`。
- tools/、test/、docs/ 裡的 `functions/xxx.js` 都換成新路徑。
- test/tools/functions_imports.test.cjs 改成連子資料夾一起掃（不含 shared/、node_modules）。
- tools/check/repo_rules.cjs：`functions/` 第一層只准 index.js、options.js、package.json、package-lock.json；單檔行數檢查連子資料夾一起看。
- firebase.json 的 functions 設定（source、predeploy）不用改，tools/release/fn_hash.cjs 本來就會往子資料夾找。

### 舊 → 新路徑（`functions/X.js` → `functions/<資料夾>/X.js`，檔名沒變）

| 新資料夾 | 檔案 |
|---|---|
| functions/casino/ | art、casino、casino_table、pool_public、task_act |
| functions/coop/ | coop、coop_trace、party |
| functions/discord/ | discord、discord_config、discord_data、discord_digest、discord_link、discord_out、discord_play、discord_warm |
| functions/stock/ | stock_div、stock_tw、stock_us |
| functions/world/ | world |
| functions/npc/ | san_levels |
| functions/game/ | admin、client_error、lostfound、visit |
| 第一層不動 | index.js、options.js、package.json、package-lock.json |

分類拿不準的：party（邀請、隊伍）放 coop；pool_public、task_act 放 casino；san_levels（旅客理智公開 JSON）放 npc；admin、client_error、lostfound、visit 是通用的，放 game（跟 test/game/ 一樣）。

## 怎麼確認的

- npm test 全過、npm run build 成功、tools/check/check_imports.cjs、tools/check/repo_rules.cjs 都過。
- 本機跑 `node tools/release/copy_shared.cjs` 之後，用 node 載入 functions/index.js：載得起來，匯出 34 個名字，跟搬之前（原來的 main）逐個一樣。
- 檢查腳本：每支 JS 的相對 import 指到的檔案都存在。

## 還沒做、要注意

- 沒有在模擬器真的叫過每個 Function。這次沒有在正式站驗證，合併後會自動部署 Functions（路徑都換了，指紋會變）：上線後看一下 Actions 的部署有沒有成功、正式站玩一手賭場、Discord 的指令有沒有回。
- 別人手上還沒合併的分支如果改了 functions/ 第一層的檔，併 main 時要把改動貼到新路徑的檔。

## 給下一個人

- 新的伺服器檔放哪：照系統放 functions/casino/、coop/、discord/、stock/、world/、npc/、game/；第一層只留 index.js 和 options.js。
- 在子資料夾裡 import 規則：`from "../shared/casino/core.js"`；import 同資料夾的別支用 `"./xxx.js"`；import 別的資料夾 `"../coop/party.js"`；一定要最先 import `"../options.js"`（地區、initializeApp）。
- 新增 Function 一樣要在 functions/index.js 匯出，名字不要改（改了名字，正式站的函式會被刪掉重建）。
