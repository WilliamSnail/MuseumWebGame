# tools/assets/：素材索引

- `gen_index.cjs`：從 `web/public`、`web/src/assets` 掃圖，照用途分類，寫進 `docs/素材/素材索引.md` 的 AUTO 區。新增素材後跑 `node tools/assets/gen_index.cjs`；`--check` 只檢查是不是最新。
- 說明、用途、來源寫在 `docs/素材/素材標註.json`（規則：路徑的正規表示式 → 是什麼、可以用在哪、從哪切的）。
- 注意：原圖已移出 repo（翊文 11-20）。`tools/build_panel_kits.py`、`tools/map_assets.py`、`tools/cut_sheet.py`、`tools/cut_frames.py`、`tools/flat_prompts.cjs` 需要原圖當輸入，要重切請翊文再給原圖，或從 git 歷史拿（`git show 41f45c13:assets/…`）。
