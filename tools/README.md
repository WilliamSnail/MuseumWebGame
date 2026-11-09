# 給 AI 重複用的腳本

翊文 11-09：

> 「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」
>
> 「這個只要以後有發現可以寫來加速的，以後就自己寫，自己改腳本」

> 「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」

**發現重複的步驟，就自己寫進這裡、自己改，不用先問。子代理和每天的排程也一樣：動手前先看這份，做到一半覺得「這幾步下次還要再來一遍」就加一支。** 會再用到的進 repo（加測試 `test/tools.test.cjs`、更新這份），只用一次的放暫存資料夾。動手前先看這裡有沒有現成的。

| 要做什麼 | 指令 |
|---|---|
| 上線：本機測試 → commit → 併 main → 推 → 開 PR → 等 CI → 合併 → 等部署 | `npm run ship -- --title "標題" --body "內容"`（放背景跑；`--no-merge` 不合併） |
| 開本機測試環境：模擬器、規則、網頁 | `npm run local -- --set 8 --port 5288`（放背景跑；`--stop` 關掉；測試請換到還沒開的 `--set`，不然會測到別的分支） |
| 測限時活動：把一場移到 90 秒後開始 | `npm run local -- --event-now double11`（測完 `git checkout` 還原，不要 commit） |
| 寫日誌、決定：時間、版本、號碼、索引都自動 | `npm run doc:new -- spec.json`（格式看 `tools/new_doc.cjs` 開頭） |
| 一次改很多檔：找不到或不只一處會丟錯 | `require("./tools/edit_lib.cjs")` 的 `editor` |
| **改很多處文字（首選）**：寫純文字計畫檔，反引號、`$`、引號都不用跳脫；有壹處對不上就壹個檔都不寫 | `npm run edits -- 計畫檔`（格式在 `tools/apply_edits.cjs` 開頭，`--check` 只檢查） |
| 併 main：公告、日誌索引、測試清單的衝突自動解 | `npm run merge:main`（`ship` 也會用） |
| 不開瀏覽器，直接用某人身分叫模擬器的 Functions | `npm run emu:call -- --set 8 --user 小明 casino '{"act":"peek"}'` |
| 用假的 Discord 簽名打模擬器的 `discordBot`，走完綁定、加入、獎勵、各個指令（不連真的 Discord） | 先 `npm run local -- --set 5 --port 5285`（背景），再 `node tools/discord_fake.cjs --set 5`；單打一個指令：`--cmd 'pepe-莊家' --user 12345`（Git Bash 不要寫開頭的 /） |
| 把 `/pepe-…` 指令註冊到 Discord 伺服器 | `node tools/discord_commands.cjs --print`（只印）；真的註冊要 `DISCORD_BOT_TOKEN`、`DISCORD_APPLICATION_ID`、`DISCORD_GUILD_ID`，或在 GitHub 按「註冊 Discord 斜線指令」（`discord-commands.yml`，只能手動） |
| 看某個時間 Discord 會發什麼（不會真的發） | `npm run announce:preview -- "2026-11-10 08:30"` |

**不要用腳本去改另壹支腳本，也不要把大段文字塞進程式字串或 shell 指令**（翊文 11-09：「修補腳本因為跳脫字元失敗，有沒有辦法以後不要發生」）。文字放純文字檔：改現有檔用 `npm run edits`；`doc:new` 的 JSON 用 Write 工具直接寫檔，或用 `JSON.stringify` 產生。`ship` 的訊息長就用 `--body-file`。

**瀏覽器分頁是大家共用的**：預設分頁可能被別的子代理導走，畫面會莫名其妙關掉。要測就自己開新分頁（`tabs_create`，之後每個動作都帶 `tabId`）。

`ship` 會真的合併、部署到正式站：只在該上線的分支跑。不准做的事照 `AGENTS.md` 第 6 節，腳本也不能繞過（不直接推 main、不跑 `firebase deploy`、不碰正式資料）。
