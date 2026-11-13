---
日期: 2026-11-13 12:54:01
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 修正
範圍: [web/src/css/onescreen.css, web/src/css/lobby2.css, web/src/css/cellar2.css, web/src/ui_core.js, web/src/ui_screens1.js, web/src/ui_screens2.js, web/src/ui_lobby2.js, docs/class名單.md, test/class_names.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過（多一項 class 名字檢查）、npm run build 成功
狀態: 待合併
相關: [docs/class名單.md, docs/介面整合規劃.md]
---

## 為什麼要改

> 「我們把所有名字更好一點，不要縮寫成這樣，創一個名單，這樣以後不會再發生如何，做一個subagent 解決」

## 改了什麼

- 改名（舊 → 新）：html 的 ui2 → new-lobby-on；body 的 l2-on → lobby-wide-on、chrome → room-frame-on、dark → lights-out
- 改名：u2r → onescreen-room、u2-main/side/drawer/pull/card/big/learn/more/lesson-layer → onescreen-xxx、hall-u2 → hall-onescreen、u2Drawer() → onescreenDrawer()、--ui2-gap → --onescreen-gap、css/ui2.css → css/onescreen.css
- 沒改：圖片檔 web/public/ui2/ui2-*.webp、館方公告的 id ui2-hall／ui2-commission、其他縮寫前綴（fg-、cx-、nb- 等，只寫進名單）
- 新增 docs/class名單.md：全域 class 21 個、允許的例外、css 前綴（看得懂的、縮寫的）和規則
- 新增 test/class_names.test.cjs（接進 test/run_all.cjs）：css 規則用全域 class 加後代當開頭、又不在名單允許裡，就失敗；JS 往 body／html 加了名單沒有的 class，失敗；名單裡的全域 class 在 css 和 JS 都找不到，失敗；css 出現名單沒有的新前綴只印警告
- AGENTS.md、docs/現況.md、docs/介面整合規劃.md 跟著改

## 怎麼確認的

- npm test 全過、npm run build 成功
- 加一條 .new-lobby-on .note-card 和一個沒登記的 body class，檢查都會擋；移掉就過
- 瀏覽器（npm run dev，port 5391）量 documentElement.scrollHeight，改前改後一樣：電腦 1366x768 的 commission、hall、lobby、fight、cellarrun = 768、768、768、768、1433；手機 375x812 = 1022、1065、1364、1364、1267。html、body 上的 class 也已經是新名字
- 沒有用眼睛逐個畫面比對截圖，只量了高度和 class

## 還沒做、要注意

- 縮寫前綴（fg-、cx-、nb-、cas- 等）還是縮寫，下次動到那一塊時順便改

## 給下一個人

- 新的前綴先查 docs/class名單.md；往 html／body 加 class 要先登記
- 改名只靠字串取代：舊的維護日誌裡還寫著 ui2、u2r，那是當時的紀錄，沒改
- 名單「允許的例外」裡 new-lobby-on 只准 lobby2.css、cellar2.css、landscape.css、theme3.css、ui.css 用，別的 css 檔不要用
