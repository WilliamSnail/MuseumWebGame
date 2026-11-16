---
日期: 2026-11-16 16:00:00
作者: Yuga
AI: Claude Opus 5.5（Claude Code）
類型: 修正
範圍: [tools/fx_report.cjs, tools/gh_lib.cjs, tools/ship.cjs, test/gh_wait.test.cjs, test/fx_report.test.cjs, test/run_all.cjs, content/fx_notes.json, docs/音效與特效總表.md]
PR: 無
版本: 2026.11.14-1
測試: npm test；npm run day:check；npm run fx:report -- --check
狀態: 待合併
相關: []
---

## 為什麼要改

1. 音效總表沒掃 `shared/fight_sfx.js` 的 `FIGHT_SFX`，skill-reveal、war-drums-hit 被誤判「沒人用」。
2. ship 等部署用 `gh run watch`，中途斷掉或非零結束就判失敗，但 PR 其實已合併、部署成功（PR 600、620、627 都發生過）。

## 改了什麼

- `tools/fx_report.cjs`：讀 `FIGHT_SFX`，file 欄算音效檔使用處、snd 欄算合成音使用處；總表多第 7 節「地下打鬥的聲音」（每個事件 key、現在用什麼、todo）；摘要多一行「還在用合成音、之後要找錄音的：N 項」；「沒人用」的項目會附 `fx_notes.json` 的 note。
- `content/fx_notes.json`：stairs-boss 加 note「11-16 起不用了，換成 gate-viking；檔案留著備用」（總表照列沒人用、附這句）。
- `tools/gh_lib.cjs`：新增 `runState`、`runVerdict`、`waitRun`（REST 輪詢 run 的 status／conclusion，間隔 10 秒，網路短暫錯誤連續 6 次才放棄，總上限預設 20 分鐘）；`dispatch` 也改用它。
- `tools/ship.cjs`：等部署改用 `waitRun`；等 CI 查 PR 最新 commit 時網路錯誤改成重試（連續 6 次才失敗）。
- `test/gh_wait.test.cjs`（新，已加進 run_all）：用假的查狀態函式測成功、失敗、重試、逾時；`test/fx_report.test.cjs` 加打鬥聲音表的檢查。

## 怎麼確認的

- `npm test`、`npm run day:check`、`npm run fx:report -- --check`。部署判斷用假回應測，沒有真的重現 gh run watch 中斷。

## 給下一個人

- **新增／合併的腳本**：`test/gh_wait.test.cjs`；`gh run watch` 已經不再被 ship、wf_run、say、fb_run 使用（全走 `gh_lib.waitRun`）。
- 以後打鬥聲音換成錄音：在 `FIGHT_SFX` 把 `snd`／`todo` 換成 `file`，跑 `npm run fx:report`。

## 還沒做、要注意

- 部署上限 20 分鐘是估的（以前 gh run watch 沒有上限）。
