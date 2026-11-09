---
日期: 2026-11-09 08:32:33
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [tools/discord_post.cjs, test/discord.test.cjs, test/run_all.cjs, .github/workflows/deploy.yml, .github/workflows/discord-test.yml, docs/每週劇情.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過（discord 9 項，不會真的連 Discord）；真的發到頻道要合併後跑測試訊息
狀態: 待合併
相關: [docs/每週劇情.md, docs/決定/0031-每週劇情全自動.md]
---

## 為什麼要改

> 「我想用Discord bot發布訊息，要怎麼做」「我有一個bot token」「自動公告讓我看看長什麼樣，並且每天的公告最後面也給一些遊戲網站連結」
> 「要以稍微更加像博物館的公告方式推出」（翊文的原話，2026-11-09 10:12:04）

- 每天排程上線之後，大家不用打開遊戲也知道今天有什麼。

## 改了什麼

- `tools/discord_post.cjs`：看這次合併新加了哪幾天（`content/weeks/<週>/dN.json`），有就發到 Discord。
  - 週一：這週的標題、不劇透的大綱、今天那一行。
  - 其他天：今天那一行。節日那天加節日的話（`holidayOf`）。
  - 博物館的公告口吻：「本週特展公告」「今日館訊」「本日節慶」「館長室 敬啟」。
  - 每則最後面固定放連結（`LINKS`，現在是「入館」），太長只截前面的內容。
  - `allowed_mentions` 是空的，內容再怎麼寫都不會 @ 到人。
- `deploy.yml`：部署完跑它（只有 push 到 main 時），發失敗不影響部署。`fetch-depth: 2` 才看得到這次合併改了什麼。
- `discord-test.yml`：手動發一則測試訊息（最新一天真正格式的公告，前面標「這是測試」）。
- 金鑰放 GitHub Secrets：`DISCORD_BOT_TOKEN`、`DISCORD_CHANNEL_ID`（翊文放的，AI 拿不到）。

## 怎麼確認的

- `npm test`：`test/discord.test.cjs` 9 項（只認正式週的 dN.json、訊息的樣子（拿備用週真的內容對欄位）、截短、不會 @ 人、沒放金鑰跳過、錯誤訊息沒有金鑰）。
- 真的發：合併後跑 `discord-test.yml`，結果補在這裡。

## 還沒做、要注意

- 備用週、備用的一天不會發（沒有新加的檔）。
- 節日公告只有在那天排程有寫內容時才一起發。
- 頻道現在是「限制級頻道」，翊文可以改成預設或換頻道（換頻道要改 secret）。

## 給下一個人

- 不要把 token 印出來，也不要放進 repo。外流就到 Discord 開發者後台 Reset Token，再更新 GitHub Secrets。
