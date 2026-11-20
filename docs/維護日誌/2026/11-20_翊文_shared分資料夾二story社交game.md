---
日期: 2026-11-20 22:20:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [shared/story/, shared/social/, shared/game/, test/load_shared.cjs, tools/content/, .gitignore]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、check_imports／repo_rules／code_rules 都過、functions/index.js 匯出的 34 個名字沒變、ui:check（lobby、workshop）沒有載入錯誤、手機寬度沒另外看
狀態: 待合併
相關: []
---

## 為什麼要改

翊文同意把 shared/ 第一層還平放的檔也分資料夾（架構整理第三輪）。第一包（PR 874）做了 npc、stock、world；這一包做 story、social、game。core 最後一包。

## 改了什麼

只搬位置、改路徑，沒改行為、數值、文字。story 的兩支底層去掉前綴：`story_state` 變 `story/state`。

| 舊 | 新 |
|---|---|
| shared/story.js | shared/story/core.js |
| shared/story_state.js | shared/story/state.js |
| shared/clues.js、themeshow.js、headlines.js、holidays.js、events.js | shared/story/ 同名 |
| shared/visit.js、visitors.js、gifts.js、mates.js、party.js、mailbox.js、pass.js、signin.js、applause.js、room_mood.js、board.js、lostfound.js | shared/social/ 同名 |
| shared/admin.js、client_error.js、notices.js、notices_data.js（產生檔，不進 git）、sfx_files.js、fight_sfx.js | shared/game/ 同名 |

分法的理由：story 是劇情和日期事件；social 是館友之間、玩家之間的互動（參觀、送禮、組隊、信箱、簽到、留言板、失物）；game 是管理、錯誤回報、館方公告、音效清單這些不屬於上面任何系統的雜項。

- 所有 import（shared、web/src、functions、tools、test）照新位置改。
- test/load_shared.cjs 的 ORDER 換成新路徑；`notices_data` 的特例判斷改成 `game/notices_data.js`。
- .gitignore、tools/check/code_rules.cjs 裡的 `notices_data.js` 路徑跟著改；notices_build、notice、notices_migrate、sfx_add 的輸出入路徑改成 shared/game/。
- 測試和腳本裡的 `url("gifts.js")`、`imp("notices.js")` 這種寫在引號裡的檔名也改了（test/game、discord_digest、fb_task）。

## 怎麼確認的

- npm test 全過、npm run build 成功。
- check_imports、repo_rules、code_rules 單跑都過。
- copy_shared 後載入 functions/index.js，匯出名字跟搬之前一樣。
- npm run ui:check 抽查 lobby、workshop，沒有載入錯誤。

## 還沒做、要注意

- core（logic、config、content…）還在 shared/ 第一層，下一個 PR 做，之後加「shared/ 第一層只准子資料夾」的檢查。

## 給下一個人

- 引號裡單獨寫一個檔名（`url("gifts.js")`）的測試輔助函式，搜尋 `shared/gifts.js` 找不到，要搜 `gifts.js"`。
- `shared/game/notices_data.js` 不進 git，.gitignore 的路徑改過了；舊路徑的殘檔 shared/notices_data.js 如果在本機還在，可以刪。
