---
日期: 2026-11-13 21:44:42
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [docs/Firebase做法.md]
PR: 無
版本: 2026.11.11-1
測試: 沒改程式
狀態: 待合併
相關: []
---

## 為什麼要改

> 「PR 316 加了第壹個排程 Function（stockTwTick），部署兩次失敗：先是 Cloud Scheduler API 沒開，再來是 github-deploy 少 cloudscheduler.jobs.update。翊文開了 API、加了「Cloud Scheduler 管理員」後部署成功（PR 318 那次）。」

## 改了什麼

- Firebase做法 部署帳號那段補 Cloud Scheduler 管理員和要先開 API。

## 怎麼確認的

- 部署成功，PR 315～318 都上線。

## 還沒做、要注意

- 11-16（週壹）第壹個台股交易日看 Functions 紀錄，確認從 Cloud Functions 抓得到證交所行情。

## 給下一個人

- 無。
