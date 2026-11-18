---
日期: 2026-11-18 11:15:20
作者: 翊文
AI: Claude Opus 5.5
類型: 修正
範圍: [tools/fb_task.cjs]
PR: 待補
版本: -
測試: 正式站 world-status 跑壹次
相關: 決定 0086（世界文件）
狀態: 待合併
---

## 為什麼要改
11-18 07:30 排程跑 world-status 失敗：worldDays 用 orderBy("__name__", "desc") 要 Firestore 複合索引（FAILED_PRECONDITION）。翊文：「好，修」。

## 改了什麼
最近 3 天的 worldDays 改成照日期直接拿（world/main 的最近壹天往前推 3 天，db.getAll），不用排序查詢，不需要建索引。

## 怎麼確認的
上線後跑壹次 world-status，有印出最近 3 天和各集團的健康值、狀態。

## 還沒做、要注意
哪天沒有紀錄就少印那天，不會失敗。

## 給下一個人
fb 的只讀動作盡量用直接拿文件，避免要建索引的查詢。
