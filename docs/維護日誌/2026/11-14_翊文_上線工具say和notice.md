---
日期: 2026-11-14 23:59:00
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [tools/say.cjs, tools/notice.cjs, tools/ship.cjs, tools/day_plan.cjs, test/tools.test.cjs, content/排程說明.md, tools/README.md, package.json]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；say、notice 的 --dry 實跑
狀態: 待合併
相關: []
---

## 為什麼要改

> 「還有什麼腳本需要寫的」→「四個都做」

11-14 壹天手打 gh workflow run discord-announce 十幾次、手插公告、ship 忘了給說明被擋、每日排程上線後還要再手動發今日館訊。

## 改了什麼

- `npm run say -- "文字"`（tools/say.cjs）：叫 discord-announce 工作流程發，找到這次的 run、等到成功或失敗；擋空的、超過 1900 字、@ 人。子 session 可以自己發。
- `npm run notice -- --area … --title … "句子"…`（tools/notice.cjs）：在 shared/notices.js 最上面插壹則；area、cat 照檔案裡的清單檢查，日期預設今天（台灣 05:00 換日）、到期隔年年底，id 不能重複。
- `npm run ship`：
  - 沒給 `--body` 就拿這個分支新加的維護日誌「為什麼要改」「改了什麼」當 PR 說明。
  - `--say "文字"`／`--say-file`：部署成功後發 Discord（先檢查文字，免得上線完才發現發不出去）。
  - `--after-deploy "指令"`：部署成功後再跑壹條（每日排程拿來發今日館訊）。
  - 改了 web／shared／functions 卻沒動 shared/notices.js：印警告不擋；`--no-notice` 關掉。
  - 在 worktree 裡不再試著切回 main（每次都失敗、印壹行雜訊）。
- 每日排程：`day:plan` 印的 ship 指令和排程說明第 9、10 步改成 `--no-notice --after-deploy "gh workflow run discord-scheduled.yml --ref main"`，少壹步。

## 怎麼確認的

- npm test 全過（tools.test 加 5 項：新選項、日誌當說明、公告警告、say 擋字、notice 組公告和插入位置、寫出來是合法的物件）。
- `npm run notice -- --dry`、`npm run say -- --dry` 實跑。

## 還沒做、要注意

- `npm run say` 真的發出去、找 run id 那段還沒實發過（沒有要公告的事，不為了測發壹則）；下壹次上線用 `--say` 就會走到。
- 交接信箱 README 加了三個工具的用法（在主資料夾的 .claude/交接，不在 repo）。

## 給下一個人

- 公告的格式換了（新欄位），改 tools/notice.cjs 的 render。
