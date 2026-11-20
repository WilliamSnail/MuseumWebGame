---
日期: 2026-11-09 20:33:01
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/discord.js, shared/discord_out.js, shared/discord_play.js, shared/notices.js, shared/config.js, functions/casino.js, functions/casino_table.js, functions/discord.js, functions/discord_out.js, functions/discord_play.js, functions/index.js, tools/week_check.cjs, tools/copy_shared.cjs, tools/discord_fake.cjs, content/排程說明.md, .github/workflows/deploy.yml, test/discord_bot.test.cjs, test/discord_out.test.cjs, test/discord_play.test.cjs, test/week_check.test.cjs]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過、npm run build 成功、模擬器 tools/discord_fake.cjs 77 項全過（連跑 4 次）；沒有在真的 Discord 試
狀態: 待合併
相關: [docs/決定/0051-Discord聯動.md, docs/Discord聯動規劃.md, docs/Firebase做法.md]
---

## 為什麼要改

> 「應該要今天的一些現實活動吧? 還有近期更新指令之類的」
>
> 「可以開始做了」

## 改了什麼

- 第一段：/pepe-今日活動多「今日館訊」和「今天的現實世界」（dN.json 的 real，最多 3 則、50 字，沒有就不顯示）；排程說明加一之六（只寫查得到來源的真實消息，界線照決定 0048）；week_check 認得 real 並擋壞資料；copy_shared 打包 functions/shared/day_data.js。新指令 /pepe-更新（預設 5 則公佈欄公告，附遊戲連結）。
- 第二步：遊戲大事發到頻道。交易成功後寫 discordOutbox，onDocumentCreated 的 discordOutboxSend 發送。事件：莊家破產、有人一把打到破產、莊家被救回來、有人加入、開播、斗內感謝。冷卻 10 分鐘（斗內 1 分鐘）、同一件事只發一次、太舊不發、失敗不重試、沒 token 不發。deploy.yml 部署時用 printf 寫 functions/.env，完成後 trap 刪掉。
- 第三步：/pepe-21點（按鈕）、/pepe-大禮包、/pepe-餐車（選單）、/pepe-拚經濟、/pepe-實況、/pepe-斗內。functions/casino.js 的 play 拆成 playCore，各動作搬成 act… 函式，遊戲和 Discord 共用。21 點打完頻道多一行結果，同一人 5 分鐘內併成一則（編輯第一則）。
- 公佈欄新增 discord-yuga 一則（發布日 2026-11-10）。

## 怎麼確認的

- tools/discord_fake.cjs：77 項。包含 21 點整手（seq 重按被擋、別人的按鈕被擋）、遊戲和 Discord 接續（兩個方向）、次數和籌碼共用、餐車加心情寫存檔（rev 加一、save_changed）、outbox 冷卻、發送失敗不影響遊戲、沒 token 不發、@everyone 不 tag、5 分鐘併單。
- 三個單元測試檔：discord_bot、discord_out、discord_play。
- 存檔衝突：伺服器端用模擬器實測；遊戲分頁端只讀程式確認，沒有在瀏覽器試（結論在 docs/Firebase做法.md 第十二節）。

## 還沒做、要注意

- 真的 Discord 還沒試：按鈕和選單的長相、type 7 換訊息、編輯第一則訊息（PATCH）。
- 第一次部署 Firestore 觸發的 Function（discordOutboxSend）可能要開 Eventarc；沒驗證。
- 要在 GitHub 再按一次「註冊 Discord 斜線指令」（現在是 15 個）。
- 正式環境的 3 秒回應時間還沒量；第三步的指令比第一步重（要開交易、讀存檔）。
- 拚經濟、大禮包沒有演拉霸和跳字（編輯訊息違反 3 秒），一次列完；Yuga 要不要改回演出，要另外想辦法。

## 給下一個人

- 改了 shared/ 或 functions/ 之後要重開模擬器（規則是開的時候才複製進 functions/shared/）。
- tools/discord_fake.cjs 的 member() 以前用名字當 email 的前綴，中文短名字會撞到上一輪的帳號，已改成隨機。
- /pepe-更新 不列標題有「理智、怪癖、靈感」的公告（現在只有 quirk-week 一則），那是為了頻道不放這三樣的字。
- outbox 的「加入」事件：一天最多 5 人加入，但這一種 10 分鐘只發一則，所以不是每個人都會被公佈。
- deploy.yml 的 token 那幾行不要加 set -x、不要 echo；test/discord_out.test.cjs 會擋。
