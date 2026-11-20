# 地下室的素材（11-11）

翊文用 prompt C1～C6 生的，`tools/assets/cut_sheet.py` 去背切開。遊戲用的是縮小的 webp：`web/public/cellar/`。

- `_c1-panels.png` → `panel-stone` 鐵框石面板、`notice` 釘在牆上的告示、`banner-iron` 鐵橫條、`scroll` 捲軸
- `_c2-doors.webp` → `door-open` 開著、`door-locked` 上鎖、`door-current` 現在這層（發光）、`door-sealed` 封起來（還沒用）
- `_c3-pedestals.png` → `ped-normal`、`ped-glow`、`ped-broken`（還沒用）；上面的光柱是綠的，切的時候跳過
- `_c4-cards.png` → `card-common`、`card-rare`、`card-epic`、`card-legend`、`card-eldritch`（照稀有度）
- `_c5-buttons.png` → `step-normal`、`step-hover`、`step-pressed`、`step-disabled`、`tag`、`lantern`、`key`、`medallion`（後四個還沒用）
- `bg.png`：石牆背景（不用去背）

授權要翊文確認；不要放 Pepe the Frog 的樣子（決定 0005）。


---
## 原圖已移出 repo（11-20，翊文：只存切好的）
- 移出：`_c1-panels.png`、`_c2-doors.webp`、`_c3-pedestals.png`、`_c4-cards.png`、`_c5-buttons.png`
- 要找原檔：`git show 41f45c13:assets/cellar/<檔名>`（41f45c13 以前的 commit 都有）。
- 切好的成品在 `web/public/`（哪個檔用在哪、從哪張原圖切的，看 `docs/素材/素材索引.md`）。
