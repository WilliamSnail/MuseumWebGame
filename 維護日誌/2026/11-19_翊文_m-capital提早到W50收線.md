---
日期: 2026-11-19 15:17:27
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 內容
範圍: [content/story/帳本.json, docs/世界觀主旨.md]
PR: 無
版本: 2026.11.11-1
測試: node tools/week_check.cjs、node tools/npc_check.cjs 過；node test/week_check.test.cjs 70 過 0 失敗
狀態: 待合併
相關: []
---

## 為什麼要改

> 「在這三個禮拜內揭示（翊文選 m-capital 整個提早揭）」
>
> 「門檻那晚收走壹個名字」

## 改了什麼

- m-capital 從 2027-W30 收線改成 2026-W50（12-10），季別改第 1 季；mysteries.order 移到 m-world 後面；u2 的 closes 加 m-capital
- 原本 W52～2027-W24 的六條線索重排進 W48～W50：W48 d5 銀行、W49 d2 書、W49 d4 銀行、W50 d1 今日特展、W50 d3 書（加開 b28）、W50 d4 公佈欄收線；有兩條改寫，免得連帶碰到 m-queue、m-ledger
- arc-culture 第 2 段（W52）改成館債催繳通知，撥款公文已經提早到 W50；承辦人的登場日跟著改
- arc-grant 的收尾和伏筆記下翊文的決定（1.5 倍到門檻、不設最早日期、那晚收走壹個名字；程式由數值平衡做）
- 謎底照翊文的決定補了壹句（字只在帳本）；世界觀主旨補壹行改了收線週

## 怎麼確認的

- week_check、npc_check、week_check 測試全過，沒有新警告

## 還沒做、要注意

- W50 收線那天要在 m-count、m-accountant 收線之後：建議那兩條放 W50 d1～d2、m-capital 放 d4（12-10）
- 水位和收名字的程式由數值平衡做

## 給下一個人

- 每日排程照 mysteries.m-capital.clues 的 day 放；b28 放完 npm run ledger -- reveal b28=…
