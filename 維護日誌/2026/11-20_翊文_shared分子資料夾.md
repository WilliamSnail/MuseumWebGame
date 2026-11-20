---
日期: 2026-11-20 19:20:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [shared/casino/, shared/coop/, shared/cellar/, shared/discord/, tools/copy_shared.cjs, tools/check_imports.cjs, tools/books_sign_check.cjs, test/load_shared.cjs, test/holders_follow.test.cjs, docs/架構.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、node tools/check_imports.cjs 過、functions 的 casino／coop／discord／index 在 Node 載得起來、畫面沒在瀏覽器看（只搬位置）
狀態: 待合併
相關: []
---

## 為什麼要改
架構重整第 5 項（翊文交辦）：shared/ 平放約 95 支，賭場就占 28 支（casino_xxx.js），不好找。

## 改了什麼
- 41 支搬進子資料夾（用 git mv，歷史接得上），主檔叫 core.js，其他去掉前綴：
  - `casino.js` → `casino/core.js`；`casino_X.js` → `casino/X.js`（advisor、art、auction、bank、bond、book、credit、debt、econ、find、gdp、invest、job、live、npc、report、stock、stock_grp、stock_in、stock_lev、stock_lev_text、streak、table、text、ticket、wallet、week，共 28 支）。
  - `coop.js` → `coop/core.js`；`coop_X.js` → `coop/X.js`（base、fight、flow、fun、route、text、trace）。
  - `cellar_fight.js` → `cellar/fight.js`、`cellar_map.js` → `cellar/map.js`。
  - `discord.js` → `discord/core.js`；`discord_out.js` → `discord/out.js`、`discord_play.js` → `discord/play.js`。
- 所有 import 路徑機器改過（shared 裡互相、web、functions、test、tools）；文件和註解裡的「shared/舊名」也跟著改，舊的決定和維護日誌是歷史，不改。
- tools/copy_shared.cjs：連子資料夾一起複製到 functions/shared/；tools/check_imports.cjs、books_sign_check.cjs、test/holders_follow.test.cjs：掃 shared/ 會進子資料夾。test/load_shared.cjs 的 ORDER 改成帶路徑（`casino/wallet.js`）。vite 的 fs.allow 是整個專案資料夾，不用改。
- 先確認過 casino_bank／job／report／ticket 不是沒人用：web 的畫面檔、functions/casino.js、別的 shared 檔都有 import，只是搬之前的盤點沒算到。

## 怎麼確認的
- npm test 全過、npm run build 成功、check_imports 過。
- 跑 copy_shared 後，functions/casino.js、coop.js、discord.js、discord_play.js、index.js 在 Node 都載得起來。

## 還沒做、要注意
- 沒搬的：stocks*、npc*、world*、logic*、systems*（不是同一個主題一長串，先留著）。
- 註解裡純檔名的舊寫法（例如 coop_trace.js、casino_table.js）因為 functions/ 也有同名檔，沒有一律改，可能有舊的說法。
- 部署前 functions/shared/ 要用 copy_shared 重產（firebase.json 的 predeploy 會跑）；本機舊的平放複本不進 git，可以自己刪。
- 新增 shared/ 的檔放進對應資料夾、ORDER 寫帶路徑的名字。

## 給下一個人
- 想找賭場的規則：shared/casino/（core.js 是 21 點牌桌）；合作地下：shared/coop/；Discord：shared/discord/。
