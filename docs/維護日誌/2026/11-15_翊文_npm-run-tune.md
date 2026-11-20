---
日期: 2026-11-15 22:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 平衡
範圍: [tools/tune.cjs, tools/world_npc.cjs, test/tune.test.cjs, test/run_all.cjs, package.json, tools/README.md, AGENTS.md, docs/決定/0089-調數值的總入口 npm run tune.md]
PR: 無
版本: 2026.11.14-1
測試: npm test、test/tune.test.cjs（6 項）；實跑一次 --dry（growBase 4,000,000＋單位 share）：econ:check 抓到問題、還原、沒寫任何檔
狀態: 本機完成
相關: [docs/決定/0089-調數值的總入口 npm run tune.md]
---

## 為什麼要改

翊文要壹個能依需求更新各項數值的總入口：一張清單改好幾處、自動檢查和模擬、可以 `--dry`。

## 改了什麼

- `tools/tune.cjs`（`npm run tune`）：`NUM.路徑=值`（acorn 只換那個值）、`unit:…`（叫 `world:unit set`）、`npc:…`（叫 `world:npc set`，新增）；改完跑 world:check、econ:check、npc_check、世界經濟測試、30 天模擬前後對照；沒過就還原；`--dry`、`--file`、`--full`、`--no-sim`。
- `world:npc set`：改 NPC 的壹個欄位（路徑用點，型別不能變，不能改 id）。
- 測試、README 表、AGENTS.md 的指令區。

## 怎麼確認的

- `test/tune.test.cjs`：解析、acorn 只換值（註解、負數、字串、布林、陣列、其他 export、真的 config.js）、三種改動壹起、檢查沒過還原、`--dry` 還原、後面的錯了前面也還原、模擬破產不寫、清單檔。
- 實跑：見決定 0089。

## 還沒做、要注意

- **新增／合併的腳本**：新增 `tune`、`world:npc set`；沒有重複的要合併（`tune` 叫既有的 `world:unit`、`world:npc`、`econ_check`、`world_sim`）。
- `AGENTS.md` 本來就超過一萬字元（11,243），這次多了壹行；之後要整理。

## 給下一個人

要讓 `tune` 多檢查壹項：在 `defaultChecks` 加一行；要多模擬一種情境：在 `defaultSim` 加。
