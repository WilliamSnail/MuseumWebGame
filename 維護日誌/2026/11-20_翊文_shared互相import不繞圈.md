---
日期: 2026-11-20 16:50:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [shared/logic_base.js, shared/story_state.js, shared/coop_base.js, shared/world_base.js, shared/systems.js, shared/systems_text.js, shared/logic.js, shared/legacy.js, shared/shop.js, shared/story.js, shared/coop.js, shared/world.js, test/load_shared.cjs, tools/check_imports.cjs, docs/架構.md, AGENTS.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、node tools/check_imports.cjs 過、畫面沒在瀏覽器看（只搬位置）
狀態: 待合併
相關: []
---

## 為什麼要改
架構重整第 7 項（翊文交辦）：shared/ 的檔互相 import 繞圈（logic ⇄ logic3，logic3 → themeshow／legacy／shop／story／events 又回到 logic，shop ⇄ story，logic ⇄ visitors，coop 四支、stat_view ⇄ world）。繞圈的檔只能靠「函式裡才用到對方」撐著，頂層一碰到就看載入順序。另外 logic3、content3 的名字看不出用途。

## 改了什麼
- 被兩邊共用的宣告抽到下層的新檔，依賴變單向（只搬位置，函式內容、行為沒改）：
  - `logic_base.js`（新）：logic.js 被別的檔用到的底層（日期、骰子、收藏鍵、解鎖、委託、展廳分數…，約 126 個），加上從 logic3 搬來的 hasUp、續集（bookSequels、sequel*）、weekIndex、cellarFloor、canStartCellar、teamItems，從 legacy 搬來的特質（traitById、traitsOf、traitSum），從 shop 搬來的裝備存檔（shopObj、newShop、shopState、gearItem、ownsGear、wornGear）。setRng、setNowClock、setDayClock 跟著它的 `let` 一起搬（import 進來的變數不能被改）。
  - `story_state.js`（新）：STORY_ITEMS、isPlain、storyState、itemDesc（story 和 shop 共用）。
  - `coop_base.js`（新）：COOP、coopRoom、coopSync、coopFinish、coopFix…（coop 本體和 fun、fight、route 共用）；coopRouteBack 搬進 coop_fight.js。
  - `world_base.js`（新）：wdN、wuBox、whCfg、whClamp、whUnrest、whMult、nwSan（stat_view 和 world 共用）。
  - 職業與技能（JOB_SKILL、jobInfo、jobSkill、rollSkills、assignJob、skillOf）搬進 legacy.js；weeklyTheme、weeklyState 搬進 themeshow.js。
- 改名：logic3.js → systems.js、content3.js → systems_text.js（跟 coop_text、casino_text 同一種取名）；test/content/check3.cjs → check_systems.cjs。
- logic.js 開頭 `export * from "./logic_base.js"`：web、functions 原本從 logic.js 拿的名字不用改。其他搬走的名字，web／functions／test／tools 的 import 已經機器改到新位置。
- test/load_shared.cjs：ORDER 照依賴順序重排、加新檔；strip 會拿掉 `export * from`／`export { … } from`。
- tools/check_imports.cjs：認得再匯出；新增「shared/ 的 import 繞圈就擋」。
- docs/架構.md、AGENTS.md、各檔註解裡的舊檔名跟著改（舊的決定和維護日誌是歷史，不改）。

## 怎麼確認的
- 用 node 重算 shared/ 的 import 圖：改前有 3 組繞圈（11 檔、2 檔、4 檔），改後 0 組。
- npm test 全過、npm run build 成功、node tools/check_imports.cjs 過。
- 舊檔名 grep 過 web、functions、test、tools、docs。

## 還沒做、要注意
- 沒開瀏覽器看畫面（只搬位置，沒改函式）；正式站請看一次大廳、融合室、地下收藏庫有沒有正常。
- 新增 shared/ 的檔要排進 test/load_shared.cjs 的 ORDER（排在用到它的檔前面）。
- functions/shared/ 是 copy_shared 複製的，改名後舊的 logic3.js、content3.js 會留在本機的 functions/shared/（不進 git），要刪的話自己刪。

## 給下一個人
- 想在 shared/ 兩個檔之間互相用東西：把共用的抽到更下層的檔（像 logic_base.js），不要互相 import；check_imports 會擋。
- logic.js 是最上層（newSave、fixProfile、deliver…），底層在 logic_base.js。
