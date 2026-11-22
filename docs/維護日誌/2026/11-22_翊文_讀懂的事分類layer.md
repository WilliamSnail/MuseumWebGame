---
日期: 2026-11-22 14:20:47
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 內容
範圍: [shared/core/systems_text.js, shared/core/systems.js, shared/story/clues.js, tools/content/week_check.cjs, content/排程說明.md, content/README.md, test/story/clues.test.cjs, test/story/week_check.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: clues 12 項、week_check 74 項過；npm test 由 ship 跑
狀態: 待合併
相關: []
---

## 為什麼要改

> 「讀懂的事是不是要分類一下」
>
> 「每壹條加 layer，檢查要雙向」

## 改了什麼

- 26 條固定的《看懂的事》每條加 layer（物、人、規矩、你）和 where；新增 UNDERSTAND_LAYERS
- 每日檔的 understand 必寫 layer，沒寫或不在四類 week_check 擋；who、where 可選
- understandView 的 done 和 understandList 多帶 layer、where、who，畫面交給美術統籌
- 排程說明、content/README 寫規矩

## 怎麼確認的

- 測試：26 條都有 layer、四類都有、week_check 沒寫和寫錯都擋

## 還沒做、要注意

- 畫面照 layer 分類（館友證整合第 3 步，美術統籌）

## 給下一個人

- layer 是我照條目內容分的，Yuga 或翊文覺得分錯可以改 systems_text.js 的 layer，不用動 text（第 1 代文字不改）
