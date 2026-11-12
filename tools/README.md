# 給 AI 重複用的腳本

翊文 11-09：

> 「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」
>
> 「這個只要以後有發現可以寫來加速的，以後就自己寫，自己改腳本」

> 「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」

**發現重複的步驟，就自己寫進這裡、自己改，不用先問。子代理和每天的排程也一樣：動手前先看這份，做到一半覺得「這幾步下次還要再來一遍」就加一支。** 會再用到的進 repo（加測試 `test/tools.test.cjs`、更新這份），只用一次的放暫存資料夾。動手前先看這裡有沒有現成的。

| 要做什麼 | 指令 |
|---|---|
| 上線：本機測試 → commit → 併 main → 推 → 開 PR → 等 CI → 合併 → 等部署 → 回到 main 拉最新 | `npm run ship -- --title "標題" --body "內容"`（放背景跑；`--no-merge` 不合併） |
| 開本機測試環境：模擬器、規則、網頁 | `npm run local -- --set 8 --port 5288`（放背景跑；`--stop` 關掉；測試請換到還沒開的 `--set`，不然會測到別的分支） |
| 測限時活動：把一場移到 90 秒後開始 | `npm run local -- --event-now double11`（測完 `git checkout` 還原，不要 commit） |
| 寫日誌、決定：時間、版本、號碼、索引都自動 | `npm run doc:new -- spec.json`（格式看 `tools/new_doc.cjs` 開頭） |
| 一次改很多檔：找不到或不只一處會丟錯 | `require("./tools/edit_lib.cjs")` 的 `editor` |
| **改很多處文字（首選）**：寫純文字計畫檔，反引號、`$`、引號都不用跳脫；有壹處對不上就壹個檔都不寫 | `npm run edits -- 計畫檔`（格式在 `tools/apply_edits.cjs` 開頭，`--check` 只檢查） |
| 一張好幾格的綠底素材切成一條（怪物姿勢、特效、圖示） | `~/anaconda3/python.exe tools/cut_frames.py 原圖 輸出.webp --rows 6 [--cell 200]`（`--rows 4,3` 每排幾格；用法在檔案開頭） |
| 給翊文生素材：Prompt 做成網頁，每張有參考圖、「複製參考圖」「複製 Prompt」兩顆鈕 | `node tools/flat_prompts.cjs` → `docs/地下室素材Prompt.html`（從 `docs/地下室素材清單.md` 產生，不要手改） |
| **每天的排程做新關卡**：幾個旋鈕 → 地下今天的怪物；自動調難度、模擬 1～4 人、印出玩家會看到什麼、寫進當天的檔 | `npm run level:new -- 規格.json`（`--write` 寫進 `dN.json`；`--styles` 列出打法；格式在 `tools/new_level.cjs` 開頭；步驟在 `content/排程說明.md` 一之八） |
| 打怪物的模擬（改 `NUM.fight`、`CELLAR_FOES` 之後跑） | `node test/sim_fight.cjs 200`（`RANK=3` 看 3 級的） |
| 開工作資料夾、接好依賴（同時做好幾件事、子代理一人一個） | `npm run wt -- --dir 路徑 --branch claude/主題`（`--remove` 收掉） |
| 按 GitHub 的手動流程，只認新的那一次、照結束碼回報 | `npm run wf -- discord-log.yml -f hours=2 --grep "^2026-"`（多行文字用 `--file 名字=檔案`） |
| 看、改模擬器的資料（莊家破產、隱身、次數歸零） | `npm run emu:doc -- --set 8 data casinoHouse/main bankroll=-500000` |
| Yuga Bot 每個指令花多久（正式環境的真實紀錄） | `npm run wf -- discord-log.yml -f hours=2 --grep "^2026-\|^=="` |
| 併 main：公告、日誌索引、測試清單的衝突自動解 | `npm run merge:main`（`ship` 也會用） |
| 不開瀏覽器，直接用某人身分叫模擬器的 Functions | `npm run emu:call -- --set 8 --user 小明 casino '{"act":"peek"}'` |
| 用假的 Discord 簽名打模擬器的 `discordBot`，走完綁定、加入、獎勵、各個指令、整手 21 點（按鈕、seq、別人的按鈕）、遊戲和 Discord 接續、次數共用、存檔、outbox（冷卻、失敗、沒 token）（不連真的 Discord，模擬器的 Function 把「會發的訊息」寫進 `discordTestSent`） | 先 `npm run local -- --set 5 --port 5285`（背景），再 `node tools/discord_fake.cjs --set 5`（`--show` 印幾則回覆看長相）；單打一個指令：`--cmd 'pepe-莊家' --user 12345`（Git Bash 不要寫開頭的 /）。**改了 `shared/` 或 `functions/` 要重開模擬器**（規則是開的時候才複製進去的） |
| 把 `/pepe-…` 指令註冊到 Discord 伺服器 | `node tools/discord_commands.cjs --print`（只印）；真的註冊要 `DISCORD_BOT_TOKEN`、`DISCORD_APPLICATION_ID`、`DISCORD_GUILD_ID`，或在 GitHub 按「註冊 Discord 斜線指令」（`discord-commands.yml`，只能手動） |
| **用眼睛看今天新畫的 `svg`**：壹天或整週的畫排成壹張 PNG（太暗、跑版、看不出是什麼，這裡看得出來），再用 Read 打開看 | `npm run svg -- content/weeks/2026-W46/d2.json`（給資料夾就是整週；`--out x.png`；找不到 Edge／Chrome 只印 HTML） |
| **不開瀏覽器分頁，把畫面照成 PNG**：壹次照電腦和手機橫拿（打開就看得到的樣子；要按按鈕、要登入的還是用瀏覽器走） | 先開著 `npm run local`，再 `npm run shot -- "http://localhost:5287/#lobby"`（`--size 800x1000,375x812`、`--out 資料夾`；只准 localhost），用 Read 打開 PNG 看 |
| **照手機直拿（375 寬）**：shot.cjs 窄過 500 照不了；這支模擬觸控手機，可以先跑 JS（按按鈕、拿掉提示泡泡）再照 | `node tools/shot_phone.cjs "http://localhost:5287/?x=1#lobby" --js "document.querySelector('.tb-menu').click()" --out a.png`（`--size`、`--wait`、`--full`；會自動略過「請轉橫」） |
| 量某個畫面放著不動時瀏覽器有多忙（重畫幾次、幾毫秒；改前改後比效能） | `node tools/perf_idle.cjs "http://localhost:5287/?x=1#lobby" --size 1920x1080 --secs 10` |
| 看某個時間 Discord 會發什麼（不會真的發） | `npm run announce:preview -- "2026-11-10 08:30"` |

**不要用腳本去改另壹支腳本，也不要把大段文字塞進程式字串或 shell 指令**（翊文 11-09：「修補腳本因為跳脫字元失敗，有沒有辦法以後不要發生」）。文字放純文字檔：改現有檔用 `npm run edits`；`doc:new` 的 JSON 用 Write 工具直接寫檔，或用 `JSON.stringify` 產生。`ship` 的訊息長就用 `--body-file`。

**瀏覽器分頁是大家共用的**：預設分頁可能被別的子代理導走，畫面會莫名其妙關掉。要測就自己開新分頁（`tabs_create`，之後每個動作都帶 `tabId`）。怎麼快速進遊戲、測難走到的情況，看 `tools/browser_snippets.md`。

**動手前先看 `docs/踩過的坑.md`**：部署、Discord、測試、改檔踩過的坑都在那裡。又踩到新的就寫進去。

**要拿 `ship` 的結果，別接 `| tail`**（結束碼會被吃掉）：`npm run ship -- ... > log 2>&1; echo $?`，再找 `✓ PR`。

`ship` 會真的合併、部署到正式站：只在該上線的分支跑。不准做的事照 `AGENTS.md` 第 6 節，腳本也不能繞過（不直接推 main、不跑 `firebase deploy`、不碰正式資料）。
