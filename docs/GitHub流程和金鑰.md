# GitHub 上的手動流程和金鑰

> 給接手的 AI 和人看：要發 Discord 公告、註冊斜線指令、碰正式的 Firebase，都是「按 GitHub 上的手動流程」，不是自己拿金鑰做。
> 翊文 11-12 問「其他 AI 怎麼用 Discord 的 secrets」後寫的。

## 一、金鑰在哪裡

- 金鑰都放在 GitHub repo 的 **Settings → Secrets and variables → Actions**，只有翊文能看、能改：
  - `DISCORD_BOT_TOKEN`：Yuga Bot 的 token。
  - `DISCORD_CHANNEL_ID`：發公告的頻道。
  - `FIREBASE_SERVICE_ACCOUNT`：正式 Firebase 的服務帳號。
- **AI 拿不到、也不要拿**：不要叫翊文貼 token，不要寫進 repo、`.env`、日誌、聊天（`docs/界線.md`）。
- 流程在 GitHub 的機器上跑，那邊才讀得到金鑰。AI 只負責「按下去」和「傳要發的文字」。

## 二、AI 要怎麼按

要能按流程，AI 要有這個 repo「執行 Actions」的權限，三種情況：

| AI 在哪裡 | 怎麼按 |
|---|---|
| 翊文電腦上（Claude Code、Antigravity） | 用電腦上登入好的 `gh`：`npm run -s wf -- 流程.yml -f 欄位=值`（`tools/wf_run.cjs`，會等跑完、照結果回報）。多行文字寫進檔案，用 `--file 欄位=檔案` |
| 雲端、接得上 GitHub | 要翊文給它這個 repo 的權限，而且包含執行 Actions；只能讀的話發不出去 |
| 接不上 GitHub | 把要發的文字寫好給翊文，翊文到 GitHub 的 **Actions → 流程名字 → Run workflow** 貼上、按執行 |

`gh` 在 Windows 上可能不在 PATH：`"/c/Program Files/GitHub CLI/gh.exe"`。

## 三、有哪些流程

| 流程 | 做什麼 | 什麼時候按 |
|---|---|---|
| `discord-announce.yml` | 發一則公告到 Discord（欄位 `message`，最多 2000 字，不會 @ 人） | **翊文說要發才發**。例：`npm run -s wf -- discord-announce.yml --file message=公告.txt` |
| `discord-commands.yml` | 註冊 Yuga Bot 的斜線指令（清單在 `shared/discord.js`，整份取代） | 改了指令清單之後。欄位 `application_id=300999289197428737`、`guild_id=291221925571854347`（不是密碼） |
| `discord-test.yml` | 發一則測試訊息，確認 token、頻道、權限對不對 | 懷疑 bot 壞了的時候 |
| `discord-log.yml` | 看 Yuga Bot 每個指令花多久（只印時間、狀態碼、耗時） | 查 bot 慢、沒回應 |
| `firebase-task.yml` | 正式 Firebase 的固定動作（決定 0038） | **只有翊文要求時** |
| `discord-scheduled.yml`、`weekly-board.yml`、`deploy.yml` | 定時館訊、每週榜單、合併後部署（部署完會自動發當天的更新） | 自動跑，不用按 |

## 四、發 Discord 公告的規矩

1. **要翊文同意才發**（翊文說「發 Discord」「公告 Discord」才算）。發出去就收不回來。
2. 遊戲裡也要有館方公告（`shared/notices.js`），不能只發 Discord。
3. 先上線、確認部署成功，再發公告（除非翊文說先發）。
4. 文字照遊戲畫面的寫法：介面字用「壹」，短句，一行一件事。不要放謎底、玩家的資料。
5. 發完跟翊文說發了什麼。

## 五、雲端排程（自動的，不用按）

- **每週劇情的 Claude 排程**：每天 08:00（台灣）在雲端跑，週一排這週、週二到週日寫今天，開 PR、合併、部署。
  - 做法全部寫在 `content/排程說明.md`（排程網址、環境、失敗了怎麼辦都在那裡）。
  - 限時活動、預約公告也是它寫進 `content/weeks/<週>/week.json` 的 `events`、`content/公告排程.json`；到時間由 `discord-scheduled.yml` 發到 Discord。
- **部署完的當天更新**：`deploy.yml` 合併到 main、部署成功後，自動把當天的「館方公告」整理發到 Discord。
- 所以：**每週內容、每天的館訊、活動開跑的通知都是自動的**。手動的 `discord-announce.yml` 只用在翊文另外交代的公告（例如改版說明）。
- 臨時加活動（例如 11-12 的「掉進地下的找零」）：寫進這週的 `week.json` 的 `events`，跑 `node tools/week_check.cjs content/weeks/<週>`，走 PR 上線；開跑時 Discord 會自己發。
