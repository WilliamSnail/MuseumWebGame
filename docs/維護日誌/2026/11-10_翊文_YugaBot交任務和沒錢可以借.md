---
日期: 2026-11-10 00:37:11
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/story.js, shared/casino_wallet.js, shared/casino_text.js, shared/discord.js, shared/discord_play.js, shared/notices.js, functions/casino.js, functions/discord.js, functions/discord_play.js, web/src/ui_casino.js, web/src/ui_story.js, tools/week_check.cjs, tools/copy_shared.cjs, tools/discord_fake.cjs, content/排程說明.md, content/README.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過、npx vite build 成功；discord_fake 82／82（含 /pepe-借錢）
狀態: 待合併
相關: [docs/決定/0051-Discord聯動.md, content/排程說明.md]
---

## 為什麼要改

> 「他可能也會在跟你對話時想到某些事項，交任務給你推動劇情」
>
> 「沒錢了可以跟Yuga bot借錢這部分好像還沒完成」

## 改了什麼

- 每日任務可以多 giver（只能 yuga）、says（40 字內）、done（選填，40 字內）。不新增任務種類；壹天最多壹個；備用週不收。shared/story.js 的 yugaTaskOf、yugaLine、yugaMarkSaid；P.story.said 記說過 done（舊存檔沒有就補空的，八週後清掉）。
- 遊戲：進賭場荷官說 says（沒做完，100%）；做完後進賭場說 done 壹次；每週劇情的任務清單標「Yuga Bot 交代」並顯示 says。
- Discord：tools/copy_shared.cjs 的 day_data 只打包 giver 任務的 id 和 says；/pepe-籌碼、/pepe-21點、/pepe-餐車（都是只有本人看得到）今天有任務而且存檔裡沒做完，最後多壹行 says。公開指令不放。
- tools/week_check.cjs 檢查 giver、says、done、壹天壹個、禁用字、「壹」、英文字母（只放行 R）。content/排程說明.md 寫排程怎麼用（3 天左右壹個、推 sideArcs、不寫答案）；content/README.md 寫格式。
- 借錢：新指令 /pepe-借錢（本人才看得到），走 playCore 的 actRelief（遊戲的 relief 也改用它，規則 casRelief 沒改、數字沒改）。casCanRelief、casPoorReason 放 shared/casino_wallet.js。
- Discord 買不起、下注不夠（/pepe-21點、/pepe-餐車、/pepe-斗內）而且借得到：多壹行「打 /pepe-借錢 跟 Yuga 借」。
- 遊戲：賭場每個頁籤上方壹條借錢提示（canRelief 才出現、打牌中不出現），牌桌的舊按鈕拿掉；買餐車、換小獎、下注錢不夠時，借得到就多說壹句可以借。手機橫向壹行不換行。
- shared/notices.js 加壹則不破梗的公告。test/yuga.test.cjs（17 項）、test/week_check.test.cjs 加 12 項、tools/discord_fake.cjs 加 6 項。

## 怎麼確認的

- npm test 全過、npx vite build 成功。
- npm run local -- --set 2 --port 5282 + node tools/discord_fake.cjs --set 2：82／82。測 says 時暫時在 W46 d1 的第壹個每日任務加 giver，測完已還原（內容沒動）。
- 瀏覽器（挑戰模式）：進賭場荷官說 says；用 emu:doc 把籌碼改 400，九個頁籤上方都有借錢提示；餐車買不起的提示有「可以借：按上面的向 Yuga 借」；按借錢後籌碼 2 萬、提示消失；844x390 橫向壹行，高 47px。

## 還沒做、要注意

- 要再註冊壹次 Discord 斜線指令（多 /pepe-借錢，共 16 個）。
- 沒看過『做完後進賭場說 done』的畫面（單元測試測了邏輯，沒在瀏覽器走完任務）。
- Discord 的 says 只有今天有 giver 任務才多讀壹次存檔（壹個文件）；正式環境的 3 秒還沒量。

## 給下一個人

- says 在遊戲和 Discord 都會原樣顯示：不能放理智、怪癖、靈感，也不能寫答案。
- 判斷『沒做完』在 Discord 是讀存檔的 profiles.challenge.story.tasks[週/任務id].done；存檔沒有挑戰模式的人視為沒做完。
- 新增 Discord 指令不要忘了在 PLAY_COMMANDS 和 dcCommands 兩邊都加。
