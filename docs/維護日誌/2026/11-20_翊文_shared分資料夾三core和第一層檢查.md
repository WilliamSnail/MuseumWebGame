---
日期: 2026-11-20 22:55:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [shared/core/, test/load_shared.cjs, tools/check/repo_rules.cjs, tools/check/code_rules.cjs, AGENTS.md, docs/規則/架構.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、check_imports／repo_rules／code_rules 都過、functions/index.js 匯出的 34 個名字沒變、books_sign_check／econ_scan／fx_report／snd_check／npc_check／world_check／econ_check 都跑過沒壞、ui:check（lobby、workshop）沒有載入錯誤、手機寬度沒另外看
狀態: 待合併
相關: []
---

## 為什麼要改

翊文同意把 shared/ 第一層還平放的檔也分資料夾（架構整理第三輪，PR 874、875 做了前面兩包）。這是最後一包：core，加上「shared/ 第一層只准子資料夾」的檢查。

## 改了什麼

只搬位置、改路徑，沒改行為、數值、文字。

| 舊 | 新 |
|---|---|
| shared/config.js、content.js、systems_text.js | shared/core/ 同名 |
| shared/logic.js、logic_base.js、systems.js | shared/core/ 同名 |
| shared/legacy.js、shop.js、titles.js、fresh.js、guide.js、orient.js | shared/core/ 同名 |

core 放的是「設定、文字、核心規則」和被它們直接用的底層；放不進別的系統的雜項在 shared/game/。

三包合起來，shared/ 第一層現在只有 11 個資料夾：core、npc、stock、world、story、social、game、casino、coop、cellar、discord。

- 所有 import 照新位置改；test/load_shared.cjs 的 ORDER 換成新路徑；test/content/check_systems.cjs 預設檢查 shared/core/。
- 新檢查：tools/check/repo_rules.cjs 第 3 條改成「shared/ 第一層不准有 .js」，並在 test/tools/code_rules.test.cjs 加測試（npm test 會擋）。
- 修了 tools/check/code_rules.cjs 第 4 條（新加的畫面文字用「壹」）：原本用 `git diff --no-renames`，只搬位置的 content.js、systems_text.js 會被當成整份新檔，報 110 個「一」；改成 `-M` 認搬家，只看真的新加的行。
- AGENTS.md（第 4 節）和 docs/規則/架構.md（資料夾樹、import 層級）改成新結構。

## 怎麼確認的

- npm test 全過、npm run build 成功；check_imports、repo_rules、code_rules 單跑都過。
- copy_shared 後載入 functions/index.js，匯出名字跟搬之前一樣（34 個）。
- 其他掃 shared/ 的工具各跑一遍沒壞：books_sign_check、econ_scan、fx_report（沒改到總表）、snd_check、npc_check、world_check、econ_check。
- npm run ui:check 抽查 lobby、workshop，沒有載入錯誤（casino 要登入，跳過）。

## 還沒做、要注意

- docs/決定/ 和舊維護日誌裡寫的舊路徑沒改（歷史紀錄）。
- 本機的 functions/shared/ 是 copy_shared 複製出來的，不會刪舊檔，裡面可能還有搬家前的舊檔；刪掉整個資料夾再跑一次 copy_shared 就乾淨。部署是 CI 重新複製，不受影響。

## 給下一個人

- 搬檔後用 `git add -A`（或 git mv）再跑 npm test：code_rules 第 4 條靠 git 認搬家，還沒 add 的新檔會被當成整份新加的行。
- 舊分支併 main：搬過的檔會變成「舊的刪、新的在別處」，要手動貼到新路徑。對照表在 .claude/交接/架構整理完-新路徑.md「第三輪」。
