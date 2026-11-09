---
日期: 2026-11-09 20:45:53
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [functions/index.js]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過
狀態: 待合併
相關: [docs/決定/0051-Discord聯動.md, docs/Firebase做法.md]
---

## 為什麼要改

> 「可以開始做了」

## 改了什麼

- 拿掉 `discordOutboxSend` 的 export：Firestore 觸發要專案擁有者開權限才部署得上，部署帳號沒有，整個部署被擋（PR 72 那次）。其他 Discord 功能照常上線；事件先寫進 `discordOutbox`，不發。

## 怎麼確認的

- 部署紀錄：`Failed to verify the project has the correct IAM bindings`，出錯在部署任何東西之前，正式站還是上一版。
- `npm test` 全過。

## 還沒做、要注意

- 翊文用專案擁有者身分開三個權限後，把 `functions/index.js` 那行註解拿掉，大事才會發到頻道。指令：`gcloud projects add-iam-policy-binding pepe-museum` 給 `service-256538052616@gcp-sa-pubsub.iam.gserviceaccount.com` roles/iam.serviceAccountTokenCreator，給 `256538052616-compute@developer.gserviceaccount.com` roles/run.invoker 和 roles/eventarc.eventReceiver。

## 給下一個人

- 被跳過的事件太舊（超過 30 分鐘）就不發，所以接回之前累積的不會一次跳出來。
