# class 名單

> 11-13 建。起因：新大廳在 `<html>` 上加了 `.ui2`，後來委託櫃台的 css 也拿 `.ui2` 當前綴，`.ui2 .note-card` 改到全遊戲的委託單、地下房間卡、打怪面板（PR 218 上線後才發現，PR 220 修）。
>
> 翊文：「我們把所有名字更好一點，不要縮寫成這樣，創一個名單，這樣以後不會再發生如何，做一個subagent 解決」
>
> 這份會被 `npm test` 讀（`test/class_names.test.cjs`）。**表格的格式不要改**：第一欄的名字要用反引號包起來。

## 規則

1. **全域 class 不能拿來當元件樣式的前綴。** 全域 class 是加在 `<html>`、`<body>` 上的，整個遊戲都有。css 規則不能用「全域 class 加空白加別的選擇器」當開頭（例如 `.big-ui .note-card`），不然會套到全部的畫面。真的要全域（例如 `body.reduce-motion` 關動畫），寫進下面「允許的例外」。
2. **新的前綴要先查這份名單，不能重複；寫完要加進名單。**
3. **名字用看得懂的英文**，不要用 `u2`、`l2`、`cx` 這種縮寫。新的元件前綴寫成完整的字（`onescreen-`、`lobby-`）。
4. **往 `<html>`、`<body>` 加新 class，先登記到「全域 class」這一節**，不然 `npm test` 不過。
5. 舊的縮寫前綴（第三節）這次沒改，太多了、風險大。新東西不要再學它們；要動到那一整塊時順便改。
6. 圖片檔 `web/public/ui2/ui2-*.webp` 的名字沒改（路徑一改，要動的地方太多），這些是檔名，不是 class。

## 一、全域 class

加在 `<html>` 或 `<body>` 上的。`*` 代表後面接不同的字尾。

| class | 加在 | 誰加的 | 什麼時候有 | 意思 |
|---|---|---|---|---|
| `new-lobby-on` | html | `ui_lobby2.js`（`NUM.ui.newLobby` 開著） | 一直都有，整個遊戲 | 新介面的總開關。以前叫 `ui2`。`phoneTabs()`（`ui_core.js`）也看它 |
| `lobby-wide-on` | body | `ui_lobby2.js` | 畫新大廳的時候；換房間 `render()` 拿掉 | 大螢幕大廳不受 `#room` 寬度限制。以前叫 `l2-on` |
| `cellar-on` | body | `ui_screens3.js`（地下收藏庫入口） | 在地下收藏庫入口；換房間 `render()` 拿掉 | 石牆背景和石板、銅牌的樣子（`cellar2.css`） |
| `room-frame-on` | body | `ui_core.js` `render()` | 這個畫面有導覽列和狀態列（標題、結局、黑房間沒有） | 以前叫 `chrome`，容易跟瀏覽器的 chrome 搞混 |
| `lights-out` | body | `ui_core.js` | 理智用完、燈熄了（`P.dark`）而且不在結局 | 黑房間的樣子。以前叫 `dark`（跟 `.spine.dark`、`.vs-card.dark` 撞名） |
| `reduce-motion` | body | `ui_core.js`（設定頁） | 玩家開了「減少動態」 | 關動畫。**新動畫要尊重它** |
| `font-*` | body | `ui_core.js` | 永遠有一個：`font-s`、`font-m`、`font-l` | 字體大小 |
| `lowsan` | body | `ui_core.js` | 理智低於 40 | 低理智的抖動、變色 |
| `bout` | body | `ui_core.js` | 瘋狂發作中（`P.bout`） | 發作 |
| `bout-*` | body | `ui_core.js` | 發作中的第幾種：`bout-0` 到 `bout-9` | 各種發作的樣子 |
| `watching` | body | `ui_core.js` | 理智低於 40 或發作第 3 種 | 眼睛跟著游標 |
| `free-mode` | body | `ui_core.js` | 自由模式（理智不會扣） | 自由模式 |
| `holiday-on` | body | `ui_core.js` | 今天是節日 | 節日裝飾的總開關 |
| `holiday-*` | body | `ui_core.js` | 同上，`holiday-spring`、`holiday-moon` 等，一次一個 | 哪個節日 |
| `holding` | body | `ui_core.js` | 手上拿著東西在拖 | 可以放的地方畫虛線框 |
| `faint` | body | `ui_core.js` | 昏倒演出（約 1.3 秒） | 畫面變暗 |
| `flee` | body | `ui_core.js` | 逃跑演出（約 0.65 秒） | 畫面震動 |
| `nb-open` | body | `ui_board.js` | 佈告欄、登入畫面開著 | 擋住背後的捲動 |
| `coop-on` | body | `ui_coop.js` | 在合作地下 | 合作畫面的樣子 |
| `orient-skip` | body | `ui_orient.js` | 玩家選了「不用轉橫」 | 略過「請轉橫」 |
| `fx-dragging` | html | `fx.js` | 拖東西的時候 | 拖的時候不選字、不捲 |

另外 `<body>` 有屬性 `data-screen`（現在是哪個畫面，`ui_core.js`）、`data-holiday`（哪個節日）。屬性不是 class，沒有撞名的問題。

## 二、允許的例外

css 規則用上面的全域 class 加後代當開頭，只有這裡寫的才准。第二欄的 `*` 是全部的 css 檔。

| class | 檔案 | 為什麼 |
|---|---|---|
| `reduce-motion` | `*` | `body.reduce-motion .xxx { animation: none }`，故意全域 |
| `holding` | `*` | 拖的時候，所有能放的地方都要畫框，故意全域 |
| `lowsan`、`lights-out`、`faint`、`flee`、`watching`、`bout`、`bout-*` | `*` | 理智狀態影響全部畫面 |
| `holiday-*`、`holiday-on` | `*` | 節日裝飾全域 |
| `font-*` | `*` | 字體大小全域 |
| `room-frame-on` | `*` | 有沒有導覽列影響全部畫面 |
| `nb-open`、`coop-on`、`fx-dragging`、`orient-skip` | `*` | 各自的開關，只有那個狀態才有 |
| `new-lobby-on`、`lobby-wide-on`、`cellar-on` | `lobby2.css`、`cellar2.css`、`landscape.css`、`theme3.css`、`ui.css` | 新介面（決定 0066）的總開關；回滾時整批拿掉。檔案只限新大廳、地下室改版，其他檔不准用 |

## 三、CSS 前綴

class 名字開頭的字（`xxx-`）。**畫面欄是主要用的畫面**，很多前綴在 `landscape.css`（手機橫拿）、`theme3.css`、`ui.css` 也有補樣式。「縮寫」是這次沒改的。

### 看得懂的（新東西照這樣寫）

| 前綴 | 主要 css | 畫面、意思 |
|---|---|---|
| `onescreen-` | `onescreen.css` | 介面重塑的骨架：`onescreen-room`（整個廳）、`-main`、`-side`、`-drawer`、`-pull`、`-card`、`-big`、`-learn`、`-more`、`-lesson-layer`。以前叫 `u2r`、`u2-xxx` |
| `hall-` | `onescreen.css`、`signin.css` | 我的展廳；`hall-onescreen`（展廳套骨架）以前叫 `hall-u2`。`signin.css` 的是展廳的簽到 |
| `lobby-` | `hub.css` | 大廳 |
| `hub-` | `hub.css` | 大廳的導覽圖 |
| `artmarket-` | `artmarket.css` | 藝術市場（`ui_art.js`）：畫廊今日特展每幅畫下面的買賣（`artmarket-row`）和「我收藏的畫」（`artmarket-shelf`）。不要跟畫框的 `art-` 搞混 |
| `bank-` | `bank.css` | Yuga Bot 銀行廳（`ui_bank.js`）：`bank-onescreen`（套骨架）、`bank-panel`（深藍面板）、`bank-book`（米色存摺表格）、`bank-ticker`（最下面的今日行情）。賭場銀行用的是 `cas-bank`、`bk-`，不要搞混 |
| `gal-` | `gallery2.css` | 畫廊重做（11-14，`ui_story.js` 的 `galleryShell`、`ui_art.js` 的拍賣）：`gallery-onescreen`（套骨架）、`gal-wall`（畫牆）、`gal-corridor`（畫框走廊）、`gal-side`／`gal-rules`（側欄）、`gal-lot`／`gal-easel`（拍賣的畫架） |
| `hn-` | `hallnow.css` | 展廳現在幾人、NPC 的即時評價（11-14，`ui_hallnow.js`）：`hn-box`（小區塊）、`hn-lobby`／`hn-hall`（大廳深色、展廳羊皮紙）、`hn-list`、`hn-rv`（一則評價）、`hn-layer`（看全部） |
| `origin-` | `origin2.css`、`story.css` | 圖書館重做（11-14，`ui_screens1.js` 的 `SCREENS.origin`）：`origin-onescreen`（套骨架）、`origin-main`（左書架右讀書）、`origin-wrap`、`origin-tabs`（頁籤） |
| `cellar-` | `cellar2.css`、`onescreen.css` | 地下收藏庫入口；`cellar-onescreen`（套骨架）、`cellar-entry`、`cellar-facts`、`cellar-buff`、`cellar-power` 在 `onescreen.css` |
| `codex-` | `onescreen.css` | 圖鑑室套骨架：`codex-onescreen`、`codex-stage`（主區的框）、`codex-filter`（篩選）、`codex-no-side`（沒有側欄的頁籤）。不要跟 `cx-`（地下探險）搞混 |
| `room-` | `onescreen.css`、`landscape.css` | 各房間共用的標題列（`room-head`） |
| `nav-` | `theme3.css`、`lobby2.css` | 上面的導覽列 |
| `note-` | `onescreen.css`、`ui.css` | 委託單（`note-card`） |
| `strip-` | `ui.css`、`theme.css` | 收藏的縮圖列 |
| `ped-` | `ui.css`、`onescreen.css` | 展台（pedestal） |
| `trial-` | `cellar2.css`、`shop.css` | 試煉房間 |
| `team-` | `cellar2.css`、`theme3.css` | 地下的隊伍位子 |
| `floor-` | `cellar2.css` | 地下每一層的門 |
| `story-` | `cellar2.css`、`story.css` | 每週劇情的卡 |
| `reduce-` | `theme3.css` | 減少動態的設定頁（跟全域 `reduce-motion` 不同） |
| `holiday-` | `signin.css` | 節日簽到（跟全域 `holiday-*` 同名，注意） |
| `curio-`、`altar-`、`relic-`、`skill-`、`book-`、`sheet-`、`spine-`、`job-`、`event-`、`limit-`、`lights-`、`bout-`、`lesson-`、`mini-`、`menu-`、`focus-`、`seg-`、`tab-`、`item-`、`icon-`、`img-`、`chip-`、`mood-`、`insp-`、`work-`、`meet-`、`live-`、`day-`、`head-`、`next-`、`end-`、`fresh-`、`fit-`、`set-`、`theme-`、`art-`、`vol-`、`draw-`、`story-` | 多個檔 | 英文單字開頭，意思就是字面（例如 `curio-` 是珍奇物品畫面）；全域的 `bout-*`、`lights-*` 注意：`bout-chip` 等是狀態列的元件，不是全域 |

### 縮寫（這次沒改，新東西不要再用）

| 前綴 | 主要 css | 畫面、意思 |
|---|---|---|
| `fg-` | `fight.css` | 打怪（fight） |
| `nb-` | `board.css` | 佈告欄（notice board）、登入／簽到彈窗也用 |
| `fx-` | `fx.css` | 特效、拖放（`fx.js`）；`fx-drop-hover` 等 |
| `cx-` | `coop.css` | 地下探險的畫面（單人與合作共用：英雄卡、成員、寵物） |
| `cxh-` | `coop.css` | 合作地下的大廳側欄 |
| `cas-` | `casino.css` | 賭場 |
| `st-` | `theme3.css`、`ui.css` | 狀態列（status） |
| `sg-` | `signin.css` | 每日簽到（sign-in） |
| `sl-` | `casino.css` | 賭場的拉霸（slot） |
| `rt-` | `route.css` | 地下的地圖選路（route） |
| `ts-` | `themeshow.css` | 主題展（theme show） |
| `vs-` | `visitors.css` | 參觀者卡 |
| `vw-` | `theme3.css` | 歷任參觀者牆（visitor wall） |
| `scr-` | `landscape.css`、`ui.css` | 每個畫面的外框（`scr-lobby` 等） |
| `sp-` | `story.css` | 每週劇情的頁（story page） |
| `fp-` | `ui.css`、`theme3.css` | 融合室的佩佩（fusion pepe） |
| `cs-` | `theme3.css` | 選佩佩、隊伍（choose） |
| `ad-` | `theme3.css`、`onescreen.css` | 一鍵交件、自動接件（auto deliver）的列和視窗 |
| `rv-` | `ui.css` | 揭曉（reveal）的舞台 |
| `pt-` | `party.css` | 邀請、隊伍、一起融合（party） |
| `rg-` | `theme3.css`、`onescreen.css` | 老主顧（regulars） |
| `bk-` | `casino.css` | 賭場的書（book） |
| `cw-` | `casino.css` | 賭場的每週收藏（casino week） |
| `ps-` | `pass.css` | 通行證卡（pass） |
| `pv-` | `pass.css` | 通行證預覽（pass view） |
| `qk-` | `theme3.css` | 怪癖（quirk） |
| `ws-` | `ui.css` | 手作坊（workshop） |
| `sc-` | `story.css`、`shop.css`、`cellar2.css` | 劇情卡裡的房間列（story card）、兌換所 |
| `md-` | `theme3.css`、`board.css` | 彈窗裡的管理區（modal） |
| `rk-` | `rank.css` | 排行榜（rank） |
| `pl-` | `ui.css`、`pillow2.css` | 展示牌（placard）；抱枕工作台重做（11-14）：`pillow-onescreen`（套骨架）、`pl-main`（左抱枕和選項、右名牌）、`pl-left` |
| `shp-` | `shop.css` | 兌換所（shop） |
| `nf-` | `net.css` | 館友動態（net feed） |
| `si-` | `theme3.css`、`cellar2.css` | 隊伍條裡的一格（strip item） |
| `nc-` | `onescreen.css`、`ui.css` | 委託單內部（note card） |
| `cm-` | `onescreen.css` | 委託櫃台（commission） |
| `ex-` | `theme3.css` | 兌換、換取（exchange） |
| `uk-` | `theme3.css` | 《看懂的事》（understood knowledge） |
| `cand-` | `theme3.css` | 候選人（選參觀者的職業） |
| `fh-` | `visit.css` | 參觀別人的展廳（friend hall） |
| `gf-` | `visit.css` | 送佩佩（gift） |
| `hgu-` | `visit.css` | 展廳的留言簿（hall guest） |
| `lf-` | `net.css` | 招領單（lost & found） |
| `tg-` | `theme3.css` | 稱號（title group） |
| `tr-` | `coop.css` | 合作地下的痕跡（trace） |
| `inv-` | `party.css` | 邀請（invite） |
| `tb-` | `lobby2.css` | 手機的最上面一條（top bar） |
| `lg-` | `theme3.css` | 外觀選項（look group）彈窗 |
| `hp-` | `hub.css` | 大廳的照片（hub photo） |
| `hst-`、`hsh-` | `hub.css` | 大廳的標題（hub strip head）、今天要做的事 |
| `ls-` | `signin.css` | 簽到的節日列 |
| `lim-` | `signin.css` | 限定配件（limited） |
| `hg-` | `signin.css` | 簽到的獎勵格 |
| `ev-` | `events.css` | 限時活動（event） |
| `td-`、`lt-` | `today.css` | 今天要做的事（today）、列表 |
| `rl-`、`rh-` | `theme3.css` | 清單、回上一頁列 |
| `na-` | `net.css` | 館友的名字、綁 Discord（name） |
| `ns-` | `theme3.css` | 新手提示（next step） |
| `pal-`、`qm-`、`dk-` | `theme3.css` | 調色盤、問號箱、黑房間（dark room） |
| `adm-` | `admin.css` | 管理員畫面 |
| `l2-` | `lobby2.css` | 新大廳（lobby 2）。**別拿來當全域 class**，全域的是 `lobby-wide-on` |
| `t-` | `title.css`、`net.css` | 標題畫面（title） |
| `k-` | `fight.css`、`casino.css` | 賭場結算的牌型（kind） |
| `f-` | `theme3.css` | 空白的臉部元件（face） |
| `or-` | `landscape.css` | 轉橫提示（orient） |
| `has-` | 多個檔 | 狀態：有某個東西（`has-new`、`has-dot`），加在元件自己身上 |
| `is-` | `fx.css`、`lobby2.css` | 狀態：現在是某個狀態（`is-open`、`is-landed`、`is-closing`），加在元件自己身上 |
| `nd-` | `discord.css` | 綁定 Discord 的步驟說明 |
| `spend-` | `theme3.css` | 花靈感、花籌碼的確認框（spend） |
| `p-` | `themeshow.css` | 主題展裡各種佩佩的圖例（`p-angry`、`p-tears`、`p-russia8`） |
