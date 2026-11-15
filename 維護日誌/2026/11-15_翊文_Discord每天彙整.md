---
日期: 2026-11-15 13:35:48
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [tools/discord_digest.cjs, .github/workflows/discord-digest.yml, tools/ship.cjs, test/discord_digest.test.cjs, test/run_all.cjs, docs/GitHub流程和金鑰.md, docs/未來更新.md, docs/現況.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；discord_digest 3 項；本機印 11-15 的彙整約 300 字
狀態: 待合併
相關: []
---

## 為什麼要改

> 「Discord更新太洗板了，可不可以調一下，不然會有點惱人」→ 每天壹則彙整 →「晚上8點發」

## 改了什麼

- tools/discord_digest.cjs：把 shared/notices.js 今天發布的館方公告（特展活動不列）照 NOTICE_AREAS 分段列標題，最多約 1,800 字，放不下寫「還有幾則」；今天沒有就空的。
- .github/workflows/discord-digest.yml：每天 UTC 12:00（台灣 20:00）跑，空的就不發；也能手動按（dry 只印）。
- ship：--say／--say-file 不再馬上發，只印提醒；新的 --say-now 才馬上發（大更新用）。
- 規則文件三處改成「平常只加公告，20:00 彙整發 Discord」。

## 怎麼確認的

- 本機印 11-15 的彙整；上線後手動按壹次 dry 看 GitHub 上印的。

## 還沒做、要注意

- 子 session 的記憶和交接檔還寫「每次上線都發」：要通知她們改用新規則。
- 每天 08:00 的今日館訊照舊。

## 給下一個人

- 要改發的時間：改 workflow 的 cron（UTC）。
