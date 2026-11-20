---
日期: 2026-11-19 15:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [tools/fb_task.cjs, test/fb_task.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: fb_task.test（多一項）、npm test
狀態: 待合併
相關: [11-18_翊文_集團往來表和佩佩銀行.md]
---

# house-ledger、world-status 印佩佩銀行準備金

## 為什麼要改
上線佩佩銀行（決定 0127）後存基準對帳，`house-ledger` 沒印 `house.gb` 和 `led` 裡的 group* 來源，已知世界少了約 6.67 億對不了帳。

## 改了什麼
- `house-ledger`：多印佩佩銀行準備金（現金、欠博物館資金、集團存款和放款合計、每個集團的存放款）、準備金每個來源累計（`led.gb`）、已知世界裡 group* 來源累計（`led.world`）、全館的錢合計（莊家、博物館資金、海底、修繕基金、政府帳、已知世界、海外、準備金、館友的錢）。
- `world-status`：多印準備金和存放款。
- `econ-status`（`econPick`）：帶 `gb` 和 `led.gb`。
- `houseLedger`、`worldStatus` 匯出，測試用假的資料庫跑壹遍。

## 怎麼確認的
`test/fb_task.test.cjs` 新增壹項（假資料庫：印出準備金、來源、合計 2,962）；`npm test` 全過。沒有連真的 Firebase。

## 還沒做、要注意
上線後要請 Yuga 重跑 house-ledger，確認約 6.67 億是集團存進佩佩銀行（準備金現金 ＋ 存款 ≈ 那個數）。全館合計不含在路上的借款和打到一半的注（跟 `casBookTotal` 少兩項）。

## 給下一個人
新增的帳（像 `house.gb`）要同時加進 `house-ledger` 的守恆合計和 `econPick`。
