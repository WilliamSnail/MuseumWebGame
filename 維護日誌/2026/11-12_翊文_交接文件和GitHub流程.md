---
日期: 2026-11-12 16:47:38
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [docs/現況.md, docs/GitHub流程和金鑰.md, docs/踩過的坑.md, AGENTS.md]
PR: 無
版本: 2026.11.11-1
測試: npm test（只改文件）
狀態: 待合併
相關: []
---

## 為什麼要改

> 「其他ai怎麼用discord secrest」
>
> 「然後把目前進度寫好，讓下一個AI方便接手」
>
> 「或協做」

## 改了什麼

- docs/現況.md 最上面加「接手先看」：11-12 上線了什麼、做到一半的（館友證和待辦卡的框、各房間手機版、沒用到的素材、手作坊頁籤）、這台電腦的狀況（node_modules 刪了要 npm install）、翊文的習慣（原本只在 Claude 的記憶裡）、好幾個 AI 一起做時怎麼分工。
- 新文件 docs/GitHub流程和金鑰.md：金鑰在 GitHub Secrets、AI 只按流程；每個流程做什麼、什麼時候按；發 Discord 公告的規矩；雲端排程哪些是自動的。
- docs/踩過的坑.md 加「上線腳本」：ship 沒能回到 main 怎麼收、ship 跑的時候不要在同一個資料夾加新檔案。
- AGENTS.md：先讀什麼的第 1 條指到「接手先看」；加一行指到 GitHub 流程的文件。

## 怎麼確認的

- npm test。文件裡的流程名字、欄位照 .github/workflows/ 的檔案對過。

## 還沒做、要注意

- Claude 記憶裡的規則搬過來了，之後新的習慣也要寫進 repo，不要只記在 AI 自己那邊。

## 給下一個人

- 無。
