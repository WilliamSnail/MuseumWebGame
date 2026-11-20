---
日期: 2026-11-20 20:30:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [tools/, test/sim/, package.json, .github/workflows/, firebase.json, vite.config.js, AGENTS.md, tools/README.md, content/排程說明.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、node tools/check/check_imports.cjs、node tools/check/repo_rules.cjs
狀態: 待合併
相關: [維護日誌/2026/11-20_翊文_docs分類搬家.md]
---

## 為什麼要改

資料夾結構第二輪（翊文：「照規劃做」）的第二項。tools/ 平放 113 支：上線、CI、每天排程、素材的 python、模擬、QA 混在一起，還有 15 支模擬／回測腳本放錯地方。

## 改了什麼

只搬位置、改路徑，沒改行為、數值、文字。

- 用 `git mv` 搬，全 repo 的舊路徑換成新路徑：package.json 的 scripts、.github/workflows/*.yml、firebase.json、vite.config.js、test/、AGENTS.md、docs/、content/排程說明.md、程式註解。
- 搬了以後相對路徑多一層：每支搬走的腳本裡 `path.join(__dirname, "..", …)` 改成 `"..", ".."`，require／import 的相對路徑重算；tools/dev/tune.cjs 叫別的檢查腳本的名字改成 `../check/…`；tools/assets/map_assets.py 的根目錄多往上一層。
- tools/README.md 最上面加「資料夾」說明表。
- tools/check/repo_rules.cjs 加規則：`tools/` 第一層只准放 README.md（`FIRST_LEVEL`，之後 test/、functions/、web/src/ 也加進去）；`OLD_NUM` 拿掉已搬走的 gstock_lev_sim2。
- 舊的維護日誌、docs/決定/ 沒改（歷史）。

### 舊 → 新路徑（`tools/X` → `tools/<資料夾>/X`，檔名沒變）

| 新資料夾 | 數量 | 檔案 |
|---|---|---|
| tools/release/ | 10 | bump_version、changed_files、copy_shared、deploy_gate、fn_hash、gh_lib、issue、merge_main、ship、wf_run |
| tools/check/ | 18 | actions_health、books_sign_check、check_imports、econ_check、econ_prices、econ_scan（連 econ_scan_allow.json）、econ_status、fx_report、fx_source、log_check、log_index、log_lib、npc_check、repo_rules、snd_check、world_check、world_health |
| tools/content/ | 36 | announce、day_check、day_lib、day_new、day_plan、day_pr、discord_commands、discord_digest、discord_fake、discord_post、ledger、map_pack、market_pack、new_doc、new_level、notice、notices_build、notices_migrate、npc_pack、pool_levels、rename_known_world、san_levels、say、stocks_fetch、stocks_publish、week_check、weekly_board、world_budget、world_event、world_events_pack、world_gdp、world_lib、world_news、world_npc、world_pack、world_unit |
| tools/assets/ | 10 | black_to_alpha.py、build_panel_kits.py、cut_frames.py、cut_sheet.py、make_tile.py、map_assets.py、map_tab_plate.py、flat_prompts、svg_preview、sfx_add |
| tools/dev/ | 21 | apply_edits、browser_snippets.md、edit_lib、emu_call、emu_doc、emu_rules、emulators、local_game、new_worktree、now、npc_avg、perf_idle、qa_casino_ev、qa_lost_card、qa_seed_save、quote_lag、shot、shot_login、shot_phone、tune、wt_clean |
| tools/fb/ | 2 | fb_run、fb_task |
| test/sim/ | 15 | bank_split_sim、ext_split_sim、gov_sweep_sim、gstock_lev_sim、gstock_lev_sim2、gstock_sim、invest_backtest、lag_arb_sim、lag_arb2_sim、lag_arb3_sim、task_points_sim、trade_live_sim、world_market_sim、world_sim、world_trade_sim |

分類拿不準的：
- discord_*、say、announce（發 Discord）放 content（跟公告、每天排程一組）。
- stocks_fetch、stocks_publish（真實股價抓取發布）放 content。
- world_budget／world_event／world_gdp／world_news／world_npc／world_unit（排程填世界資料）放 content；world_check、world_health（檢查）放 check。
- tune、quote_lag、npc_avg（調數值、分析）放 dev。
- copy_shared、fn_hash（部署前打包）放 release。
- invest_backtest 是回測，跟模擬一起放 test/sim/。

## 怎麼確認的

- npm test 全過、npm run build 成功、tools/check/check_imports.cjs、tools/check/repo_rules.cjs 都過。
- 寫了一支檢查腳本：每支 JS 的相對 import／require、`path.join(__dirname, …)` 指到的檔案都存在（只剩已知會在執行時才產生的檔：notices_data.js、音效總表、.announce-state）。
- 搬走的腳本每一支都跑過 `node --check`。

## 還沒做、要注意

- 沒實際跑過（只做了語法和路徑檢查）：tools/dev 的 shot、local_game、emulators（要開瀏覽器、模擬器）、tools/fb（不能跑 npm run fb）、tools/assets 的 python。路徑都照規則換過，下次用到時如果找不到檔，先看有沒有少改的 `..`。
- 別人手上還沒合併的分支如果改了 tools/ 的檔，併 main 時要把改動貼到新路徑的檔。
- 每天排程讀的 content/排程說明.md 裡的 tools 路徑已經改成新的。

## 給下一個人

- 新腳本放哪：上線／部署 → tools/release/；檢查、報表 → tools/check/；每天排程、內容、發文 → tools/content/；素材 → tools/assets/；開發實測 → tools/dev/；正式 Firebase 固定動作 → tools/fb/；模擬、回測 → test/sim/。第一層不放新檔。
- 腳本裡找專案根目錄：tools 的腳本在子資料夾，要用 `path.join(__dirname, "..", "..")`，不是 `".."`。
- 要叫別的腳本，用相對路徑 `require("../release/gh_lib.cjs")`，或 `path.join(__dirname, "..", "release", "wf_run.cjs")`。
