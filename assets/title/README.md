# 主畫面（標題）素材（先存起來，還沒接進遊戲）

翊文 11-11 生的，用來拆開組成新的標題畫面。**標題「佩佩博物館 2」的字、副標、人名、數字、按鈕上的字都由程式放，不要用圖畫字。**

## 檔案

- `bg-damask.png`：全螢幕背景（酒紅花紋、邊緣暗角、上方有暖光），1024x572，不透明。中間低對比，方便放標題。
- 裝飾（去背）：`crest`（柱子加月桂葉的空徽章）、`divider-big`（大分隔線）、`divider-thin`（細分隔線）、`corner`（角飾，左上；其他三角翻轉用）、`crown-top`（框上方的冠飾）、`ribbon`（酒紅空緞帶）、`curtain-left`、`curtain-right`（天鵝絨窗簾）、`wax-seal`（金色封蠟章）、`lantern`（掛燈）。
- 人物卡（去背）：`card-selected`（上次玩的，外圈暖金光）、`card-normal`、`card-empty`（空位子，酒紅絨面加虛線）、`tag-ribbon`（「上次玩的」金色緞帶，空）、`plate-stat`（理智／心情的小框，空）、`medal-empty`（頭像圓框，空）。
- 職業圖章（去背）：`job-detective` 偵探、`job-historian` 藝術史學者、`job-occultist` 神秘學家、`job-gambler` 賭徒、`job-artisan` 抱枕職人、`job-salesman` 推銷員。
- `_sheet-deco.webp`、`_sheet-cards.webp`：兩張原圖（還留著，要重切時用）。

## 注意

- 光暈（`glow`）那塊切出來邊緣是方塊，不能用，沒存；要暖光用 CSS 的 `radial-gradient`。
- 三張人物卡的邊框均勻、只有四角有花紋，可以九宮格拉伸；`card-selected` 的外光要多留邊。
- 小圓章邊緣有些許綠邊，放在深色底上不明顯；要貼在淺色底上要再修。
- 授權要翊文確認；不要放 Pepe the Frog 的樣子（決定 0005）。
- 不在 `web/` 底下，不會進 `dist/`。
