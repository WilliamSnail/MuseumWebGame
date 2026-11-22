# 給 AI 重複用的腳本

翊文 11-09：

> 「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」
>
> 「這個只要以後有發現可以寫來加速的，以後就自己寫，自己改腳本」

> 「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」

**發現重複的步驟，就自己寫進這裡、自己改，不用先問。子代理和每天的排程也一樣：動手前先看這份，做到一半覺得「這幾步下次還要再來一遍」就加一支。** 會再用到的進 repo（加測試 `test/tools/tools.test.cjs`、更新這份），只用一次的放暫存資料夾。動手前先看這裡有沒有現成的。

## 資料夾（11-20 資料夾結構第二輪）

第一層只留這份 README，新腳本放進下面的子資料夾（`npm test` 的資料夾規矩會擋）。

| 資料夾 | 放什麼 |
|---|---|
| `tools/release/` | 上線和部署：ship、merge_main、deploy_gate、bump_version、changed_files、gh_lib、wf_run、issue、copy_shared、fn_hash |
| `tools/check/` | 檢查和報表：check_imports、repo_rules、log_*、actions_health、econ_*、books_sign_check、fx_report、fx_source、snd_check、npc_check、world_check、world_health |
| `tools/content/` | 每天排程和內容：day_*、week_check、weekly_board、notice*、*_pack、new_doc、new_level、ledger、world_* 內容工具、Discord 發文（say、announce、discord_*）、股價抓取發布 |
| `tools/assets/` | 素材：*.py、flat_prompts、svg_preview、sfx_add |
| `tools/dev/` | 開發和實測：emu_*、emulators、shot*、local_game、qa_*、perf_idle、wt_clean、clean_stale（搬家前的舊檔，ship 會跑）、new_worktree、now、edit_lib、apply_edits、tune |
| `tools/fb/` | 正式 Firebase 的固定動作：fb_run、fb_task |

模擬和回測腳本（*_sim.cjs、*_backtest.cjs）搬到 `test/sim/`。

| 要做什麼 | 指令 |
|---|---|
| 上線：本機測試 → commit → 併 main → 推 → 開 PR → 等 CI → 合併 → 等部署 → 回到 main 拉最新 | `npm run ship -- --title "標題" --body "內容"`（放背景跑；`--no-merge` 不合併；沒給 `--body` 就拿新加的維護日誌兩段；`--say "文字"` 部署成功後發 Discord；`--after-deploy "指令"` 部署後再跑壹條；改了 web／shared／functions 沒加公告會警告，不是玩家看得到的加 `--no-notice`；在 worktree 裡不切回 main） |
| **發 Discord**：發壹則手動公告，等到成功或失敗 | `npm run say -- "文字"`（`--file 檔案`、`--dry` 只印；擋空的、太長、@ 人） |
| **加館方公告**（寫成 `content/notices/<id>.json`，一則一個檔，不會撞） | `npm run notice -- --area 賭場 --title "標題" "第壹句" "第二句"`（area 要是 NOTICE_AREAS 其中壹個；`--id`、`--section`、`--importance`、`--expire`、`--dry`，看 tools/content/notice.cjs 開頭） |
| **經濟三支**：價格總表（玩家看得到的價格和上限，名字、值、路徑）；寫死金額掃描（文字裡的「1,000 萬」跟 NUM 對不上的，列檔名:行；白名單 `tools/check/econ_scan_allow.json`）；正式站帳面壹鍵拿（按固定動作 econ-status → 存 log → 餵 `econ_check --ledger`，**只有翊文同意才能跑，要加 `--yes`**） | `npm run econ:prices [-- --md]`；`npm run econ:scan [-- --all --strict]`；`npm run econ:status -- --yes` |
| 館方投資策略回測（真實日線 5 年，比較追高、平均買、跌深加碼等） | `node test/sim/invest_backtest.cjs --fetch` 抓資料，再 `node test/sim/invest_backtest.cjs [交易日數]`（決定 0099） |
| **`npm run tune`（調數值的總入口，決定 0089）**：壹張清單改好幾處（`NUM.路徑=值`、`unit:id.欄位=值`、`npc:id.欄位=值`，或 `--file 清單.txt`），自己找到檔案（config.js 用 acorn 只換那個值）、改完自動跑 world:check、econ:check、相關測試，再模擬 30 天（景氣 0 和 −1）印「改之前 → 改之後」；任何壹項沒過就還原，`--dry` 只看不留。**以後改數字壹律用它** | 要改 NUM、單位、NPC 的數字時 | `tools/dev/tune.cjs` |
| **`npm run world:event`（排程填世界事件，決定 0092）**：`san`／`unrest`／`mood` 三種（某位 NPC 那天的理智 ±、某集團的集體不安 ±、那天展廳氣氛 ±）寫進 week.json，寫之前先過 week_check 的規則，寫完重新打包 `shared/world/events.js`；`list`、`clear`、`--dry` | 排程要放劇情事件的時候（只放數字和 id，理由寫在帳本） | `tools/content/world_event.cjs`、`tools/content/world_events_pack.cjs` |
| **世界經濟八支**（決定 0086；加 `world:budget` 集團預算總表、`world:sim` 改數字前跑預覽（`--scan` 景氣 −1／0／+1 各跑 30、90 天；也印錢包、NPC 理智）、`world:health` 各集團的健康值和狀態（離緊縮、裁員還差幾週）、`world:news` 世界市場新聞寫進 market（`draft` 從集團換狀態產生草稿）；正式站用固定動作 `world-status`）：`npm run world:check`（名單檢查：單位的樹、兩層加總、股票只掛一處、NPC 的隸屬）；`world:unit -- list --tree／add／set／move`（加、改、掛單位）；`world:npc -- assign／list／orphans`（NPC 的隸屬）；`world:gdp -- --quarter … --yoy … --published …`（台灣 GDP 數字寫進 content/economy.json，不倒退、自動推近四季）。都有 `--dry`，寫之前會檢查，只改 repo 的檔案 | 加單位、掛 NPC、更新 GDP 時用；排程更新 GDP 也用 `world:gdp`，不手改 JSON | `tools/world_*.cjs` |
| 開本機測試環境：模擬器、規則、網頁 | `npm run local -- --set 8 --port 5288`（放背景跑；`--stop` 關掉；測試請換到還沒開的 `--set`，不然會測到別的分支） |
| 測限時活動：把一場移到 90 秒後開始 | `npm run local -- --event-now double11`（測完 `git checkout` 還原，不要 commit） |
| 寫日誌、決定：時間、版本、號碼、索引都自動 | `npm run doc:new -- spec.json`（格式看 `tools/content/new_doc.cjs` 開頭） |
| 日誌標題寫錯：很接近的改成範本的寫法，「還沒做、要注意」「給下一個人」漏了補「- 沒有」；只動這個分支的日誌 | `npm run log:fix`（`ship` 跑測試前會先跑，格式還是不對就先停，11-22） |
| 一次改很多檔：找不到或不只一處會丟錯 | `require("./tools/dev/edit_lib.cjs")` 的 `editor` |
| **改很多處文字（首選）**：寫純文字計畫檔，反引號、`$`、引號都不用跳脫；有壹處對不上就壹個檔都不寫 | `npm run edits -- 計畫檔`（格式在 `tools/dev/apply_edits.cjs` 開頭，`--check` 只檢查） |
| 一張好幾格的綠底素材切成一條（怪物姿勢、特效、圖示） | `~/anaconda3/python.exe tools/assets/cut_frames.py 原圖 輸出.webp --rows 6 [--cell 200]`（`--rows 4,3` 每排幾格；用法在檔案開頭） |
| 給翊文生素材：Prompt 做成網頁，每張有參考圖、「複製參考圖」「複製 Prompt」兩顆鈕 | `node tools/assets/flat_prompts.cjs` → `docs/素材/地下室素材Prompt.html`（從 `docs/素材/地下室素材清單.md` 產生，不要手改） |
| **每天的排程做新關卡**：幾個旋鈕 → 地下今天的怪物；自動調難度、模擬 1～4 人、印出玩家會看到什麼、寫進當天的檔 | `npm run level:new -- 規格.json`（`--write` 寫進 `dN.json`；`--styles` 列出打法；格式在 `tools/content/new_level.cjs` 開頭；步驟在 `content/排程說明.md` 一之八） |
| 打怪物的模擬（改 `NUM.fight`、`CELLAR_FOES` 之後跑） | `node test/sim/sim_fight.cjs 200`（`RANK=3` 看 3 級的） |
| 開工作資料夾、接好依賴（同時做好幾件事、子代理一人一個） | `npm run wt -- --dir 路徑 --branch claude/主題`（`--remove` 收掉） |
| 按 GitHub 的手動流程，只認新的那一次、照結束碼回報 | `npm run wf -- discord-log.yml -f hours=2 --grep "^2026-"`（多行文字用 `--file 名字=檔案`） |
| 看、改模擬器的資料（莊家破產、隱身、次數歸零） | `npm run emu:doc -- --set 8 data casinoHouse/main bankroll=-500000` |
| Yuga Bot 每個指令花多久（正式環境的真實紀錄） | `npm run wf -- discord-log.yml -f hours=2 --grep "^2026-\|^=="` |
| 併 main：公告、日誌索引、測試清單的衝突自動解 | `npm run merge:main`（`ship` 也會用） |
| 不開瀏覽器，直接用某人身分叫模擬器的 Functions（登入跟網頁壹樣，同名字同壹個人；共用零件 `emu_lib.cjs`） | `npm run emu:call -- --set 8 --user 小明 casino '{"act":"peek"}'` |
| **壹個指令備好測試帳號**：登入、建 members、放挑戰存檔（N 隻佩佩）、建錢包文件 | `npm run qa:user -- --set 7 --nick 聊乙 --pepes 12`（`--no-save`、`--no-wallet`） |
| **交代人互動測試**：把熟識度改成指定級、算今天誰有臨時拜託（找剛好有拜託的帳號） | `npm run qa:giver -- --set 7 --nick 聊乙 --lv clerk=1,scale=2 --offers`；`npm run qa:giver -- --offers --uid <uid>` |
| **瀏覽器 console 的 `window.__qa`**（只有開發版）：進房間、換帳號、叫伺服器、撥前端日期 | `await __qa.enter("銀行")`；`__qa.as("聊乙")`；`await __qa.casino({act:"giver",op:"info"})`；`__qa.date(1)`（`web/src/core/qa_hooks.js`） |
| **德州／牌桌守恆快照**：錢包＋桌上（扣旅客）＋莊家＋已知世界＋預算＋館＋政府，每手對 `--base` 看差是不是 0 | `npm run qa:holdem -- --set 7 --pid <牌桌號碼> --base <第壹次的 total>` |
| 看哪幾套本機模擬器有人在用、是誰開的 | `npm run local -- --list` |
| 用假的 Discord 簽名打模擬器的 `discordBot`，走完綁定、加入、獎勵、各個指令、整手 21 點（按鈕、seq、別人的按鈕）、遊戲和 Discord 接續、次數共用、存檔、outbox（冷卻、失敗、沒 token）（不連真的 Discord，模擬器的 Function 把「會發的訊息」寫進 `discordTestSent`） | 先 `npm run local -- --set 5 --port 5285`（背景），再 `node tools/content/discord_fake.cjs --set 5`（`--show` 印幾則回覆看長相）；單打一個指令：`--cmd 'pepe-莊家' --user 12345`（Git Bash 不要寫開頭的 /）。**改了 `shared/` 或 `functions/` 要重開模擬器**（規則是開的時候才複製進去的） |
| 把 `/pepe-…` 指令註冊到 Discord 伺服器 | `node tools/content/discord_commands.cjs --print`（只印）；真的註冊要 `DISCORD_BOT_TOKEN`、`DISCORD_APPLICATION_ID`、`DISCORD_GUILD_ID`，或在 GitHub 按「註冊 Discord 斜線指令」（`discord-commands.yml`，只能手動） |
| **用眼睛看今天新畫的 `svg`**：壹天或整週的畫排成壹張 PNG（太暗、跑版、看不出是什麼，這裡看得出來），再用 Read 打開看 | `npm run svg -- content/weeks/2026-W46/d2.json`（給資料夾就是整週；`--out x.png`；無頭 Chrome 截不到或找不到時改用 Playwright，`SVG_PW=1` 直接走 Playwright；都沒有才只印 HTML） |
| **劇情帳本只看今天用得到的、壹次改壹個欄位**（帳本 13 萬字，不用整份讀、整份重寫） | `npm run ledger -- today`；`get／keys／set／push <路徑> [值]`（路徑用點，陣列可用 id，例 `foreshadow.f-page.closed`） |
| **不開瀏覽器分頁，把畫面照成 PNG**：壹次照電腦和手機橫拿（打開就看得到的樣子；要按按鈕、要登入的還是用瀏覽器走） | 先開著 `npm run local`，再 `npm run shot -- "http://localhost:5287/#lobby"`（`--size 800x1000,375x812`、`--out 資料夾`；只准 localhost），用 Read 打開 PNG 看 |
| **照手機直拿（375 寬）**：shot.cjs 窄過 500 照不了；這支模擬觸控手機，可以先跑 JS（按按鈕、拿掉提示泡泡）再照 | `node tools/dev/shot_phone.cjs "http://localhost:5287/?x=1#lobby" --js "document.querySelector('.tb-menu').click()" --out a.png`（`--size`、`--wait`、`--full`；會自動略過「請轉橫」） |
| **登入後的畫面照成 PNG**（賭場每一頁、銀行、展廳…；先用 `emu:call` 建帳號、`emu:doc` 給籌碼，最後才照；說明在 `docs/操作/本機模擬器實測.md`） | `node tools/dev/shot_login.cjs --url http://localhost:5393 --user 賭場甲 --room 賭場 --tab 成就 --size 375x740 --out a.png`（`--mode 新參觀者`、`--size 1366x768／740x375`） |
| 量某個畫面放著不動時瀏覽器有多忙（重畫幾次、幾毫秒；改前改後比效能） | `node tools/dev/perf_idle.cjs "http://localhost:5287/?x=1#lobby" --size 1920x1080 --secs 10`；加 `--top 15` 列出最吃 CPU 的函式，加 `--js "…"` 先在頁面跑壹段（例如停掉動畫比較），加 `--after "…"` 量完印出頁面上的值 |
| **QA：給模擬器裡的玩家放佩佩、放招領單、算餐車期望值**（做回歸測試用，清單在 `docs/操作/測試清單.md`） | `node tools/dev/qa_seed_save.cjs --set 3 --nick 小明 --pepes 14`；`node tools/dev/qa_lost_card.cjs --set 3 --owner <uid> [--n 2]`；`node tools/dev/qa_casino_ev.cjs 400000` |
| 看某個時間 Discord 會發什麼（不會真的發） | `npm run announce:preview -- "2026-11-10 08:30"` |
| **按 Firebase 固定動作、存結果、跟上次比**（改正式資料的前後對照；按要翊文同意） | `npm run fb -- house-ledger --save W4前`、`--diff W4前`；`--show 名字` 不按只看。查錯：`npm run fb -- fn-errors`；量大小：`house-size`。整份在 `docs/操作/伺服器除錯.md`。排隊超過 10 分鐘還沒開始會自己取消、重按壹次（`gh_lib` 的 `dispatch`） |
| **程式的規矩五條**（shared/ 純函式、無限動畫白名單、`.replace(字串, 字串)`、新加的畫面文字用壹、改名對照；`npm test` 會跑；改規矩或白名單看 `tools/check/code_rules.cjs` 開頭） | `npm run code:check [-- --base origin/main --only 1,4]`（第 4 項只看跟 base 比新加的行；沒給 base 就用 origin/main 和 HEAD 的共同祖先） |
| **畫面版面檢查（改了畫面，上線前一定要跑）**：自己起 dev server、無頭瀏覽器開主要畫面（`#畫面` 假資料，自動靜音），手機 375×740 和電腦 2140×1440；報超出視窗的元素、可見寬高 < 80% 的按鈕、字被擠成直排。要登入的畫面列為跳過。要瀏覽器，不在 `npm test` | `npm run ui:check [-- --screens lobby,today --sizes phone --shots 資料夾 --url http://localhost:5173]`（`tools/check/ui_check.cjs`；有問題 exit 1；畫面清單在檔案開頭 SCREENS） |
| 看今天 20:00 Discord 彙整會發什麼 | `node tools/content/discord_digest.cjs [--date 2026-11-15]`（每天 20:00 由伺服器排程 `discordDigestTick` 發，`functions/discord/discord_digest.js`；GitHub 的 `discord-digest.yml` 只留手動補發） |
| 寫新腳本要叫 GitHub（觸發流程、等跑完、讀紀錄、找 gh） | 用 `tools/release/gh_lib.cjs` 的 `dispatch`、`runLog`、`ghRun`，**不要再自己寫壹份**；雲端擋 GraphQL，只用 `gh workflow／run／api` |

**腳本要寫就寫、重複的要合併**（翊文 11-15：「記得有什麼腳本要寫都要寫，如果腳本需要合併也記得」）：同樣的邏輯有兩份以上，就抽成共用的（例：`tools/release/gh_lib.cjs` 是 wf_run、fb_run、say、ship 合併出來的），舊的改成叫它；新腳本壹定要加進上面這張表和測試。

**不要用腳本去改另壹支腳本，也不要把大段文字塞進程式字串或 shell 指令**（翊文 11-09：「修補腳本因為跳脫字元失敗，有沒有辦法以後不要發生」）。文字放純文字檔：改現有檔用 `npm run edits`；`doc:new` 的 JSON 用 Write 工具直接寫檔，或用 `JSON.stringify` 產生。`ship` 的訊息長就用 `--body-file`。

**瀏覽器分頁是大家共用的**：預設分頁可能被別的子代理導走，畫面會莫名其妙關掉。要測就自己開新分頁（`tabs_create`，之後每個動作都帶 `tabId`）。怎麼快速進遊戲、測難走到的情況，看 `tools/dev/browser_snippets.md`。

**動手前先看 `docs/規則/踩過的坑.md`**：部署、Discord、測試、改檔踩過的坑都在那裡。又踩到新的就寫進去。

**要拿 `ship` 的結果，別接 `| tail`**（結束碼會被吃掉）：`npm run ship -- ... > log 2>&1; echo $?`，再找 `✓ PR`。

`ship` 會真的合併、部署到正式站：只在該上線的分支跑。不准做的事照 `AGENTS.md` 第 6 節，腳本也不能繞過（不直接推 main、不跑 `firebase deploy`、不碰正式資料）。
