---
日期: 2026-11-09 18:22:42
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [docs/Discord聯動規劃.md, docs/決定/0051-Discord聯動.md, tools/ship.cjs, test/tools.test.cjs]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過
狀態: 待合併
相關: [docs/Discord聯動規劃.md, docs/決定/0051-Discord聯動.md, docs/決定/0033-管理員介面.md]
---

## 為什麼要改

> 「有，不過都是認識的人」
>
> 「有沒有辦法讓還沒是館友的人自己加也可以加進來，不用我一直更改firebase」

## 改了什麼

- 記下頻道裡有館友以外的人，暱稱和結果可以公開。
- 加上「自己加入」的提案：`/pepe-加入` 給一次性連結。翊文還沒同意。
- `npm run ship`：PR 剛開、GitHub 還沒登記 CI 時，最多等 3 分鐘，不再當成失敗。

## 怎麼確認的

- 對過現在的 `join`：只看 `invites/{email}`；管理員介面已經有 `invite`。
- `npm test` 全過。

## 還沒做、要注意

- 還沒動工。
- 自己加入要翊文同意。

## 給下一個人

- 在背景跑 ship 又接 `tail` 的話，結束碼永遠是 0，要看輸出最後有沒有 ✓。
