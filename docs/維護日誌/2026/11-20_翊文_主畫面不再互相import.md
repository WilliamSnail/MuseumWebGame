---
日期: 2026-11-20 15:56:42
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 修正
範圍: [web/src/ui_room.js, web/src/ui_screens1.js, web/src/ui_screens2.js, web/src/ui_screens3.js, web/src/ui_story.js, web/src/ui_board.js, web/src/ui_bank.js, web/src/ui_themeshow.js, web/src/ui_visit.js]
PR: 無
版本: 2026.11.11-1
測試: check_imports 過、npm test 和 build 交給上線腳本
狀態: 待合併
相關: []
---

## 為什麼要改
翊文 11-20 架構整理（建議第 4 項）：ui_screens1 和 ui_screens2、ui_screens3、ui_story 互相 import（繞圈），ui_board 和 ui_story 也是（決定 0146 剛加的）。現在能跑，但載入順序一變就可能出錯。

## 改了什麼
- 新檔 web/src/ui_room.js：房間標題 roomHead、收藏抽屜 onescreenDrawer、書 bookReader／bookLine／bookBack／bookGain、BOOK_LINK，從 ui_screens1.js 原封不動搬過來。書裡 [[字|動作]] 的動作表 BOOK_ACTIONS 也在這裡，內容還是 ui_screens1.js 加進去。
- 用到這些的檔改從 ui_room.js import。
- ui_screens2 改用 PANELS.afterEnter()（ui_screens1 登記），ui_board 改用 ADDONS.actDone（ui_story 登記），照專案原本 PANELS／ADDONS 的做法。
- 只搬位置，函式內容沒改。web/src 裡已經沒有互相 import 的檔。

## 怎麼確認的
- tools/check_imports.cjs 過；另外算過 web/src 每對檔案，沒有互相 import。

## 還沒做、要注意
- 改的是畫面程式，瀏覽器實際點過書、公佈欄才算數（見 PR）。

## 給下一個人
- 新的房間共用零件放 ui_room.js，不要再讓 ui_screens2／3、ui_story import ui_screens1。
