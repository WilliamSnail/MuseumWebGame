---
日期: 2026-11-13 00:29:57
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [docs/素材生成.md, docs/地下室素材清單.md, tools/flat_prompts.cjs, docs/地下室素材Prompt*.html]
PR: 無
版本: 2026.11.11-1
測試: flat_prompts.cjs 重跑：3-8 以後的 prompt 有零件結尾，1-2 這類沒有
狀態: 待合併
相關: [docs/素材生成.md, docs/地下室素材清單.md]
---

## 為什麼要改

> 「也可以想之後promt要怎麼要優化」

## 改了什麼

- docs/素材生成.md 加「零件 prompt 的八條」：只畫要的零件、不要字、數量寫死、純綠底、一樣大一樣間距、不同狀態同一個形狀、九宮格邊一樣寬、零件之間留 80px。
- docs/地下室素材清單.md 第〇節加第二個程式框「零件結尾」。
- tools/flat_prompts.cjs 讀第〇節的第二個程式框，3-8～3-19 自動接在【結尾】後面；重產兩份 prompt 網頁。

## 怎麼確認的

- 只改文件和產 prompt 的工具，遊戲沒有變。

## 還沒做、要注意

- 無。

## 給下一個人

- 新的介面零件編號不在 3-8～3-19 的話，要改 flat_prompts.cjs 的 isPart。
