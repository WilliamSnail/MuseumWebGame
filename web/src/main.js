// 佩佩博物館 4 的入口：載入樣式和每個畫面的模組，最後才開館（boot.js）。
// 順序很重要：
//   1. 樣式照第 3 版的順序（後面的蓋前面的）。
//   2. 每個畫面檔載入時會把自己的房間登記進 SCREENS（ui_core.js），所以全部先載入。
//   3. boot.js 一載入就開館，所以放在最後，而且用動態 import，確保前面都準備好了。
// 開發時網址加 #畫面（例如 #lobby、#cellarrun）會直接進那個畫面、放好假收藏（debug_boot.js，只有 npm run dev 才有）。
import "./css/ui.css";
import "./css/fx.css";
import "./css/theme.css";
import "./css/theme3.css";
import "./css/board.css"; // 公佈欄、信箱、選單（11-08）
import "./css/net.css"; // 登入、館友、我的帳號（多人版 M1，11-08）
import "./css/visitors.css"; // 三個參觀者的位子、取名字（多人版 M1，11-08，決定 0018）
import "./css/title.css"; // 標題畫面的新外觀（11-11，拆開的素材組起來）
import "./css/party.css"; // 邀請、隊伍、一起融合（多人版 M3，11-08）
import "./css/coop.css"; // 合作地下收藏庫（多人版 M4，11-09）
import "./css/route.css"; // 地圖選路（地下室改版）
import "./css/fight.css"; // 打怪物（地下室改版，決定 0067、0068）
import "./css/visit.css"; // 參觀館友的展廳、送佩佩（多人版 M2，11-09）
import "./css/funday.css"; // 趣味節日（決定 0044）
import "./css/signin.css"; // 每日簽到、簽到日曆、節日的外觀（11-09，決定 0030）
import "./css/story.css"; // 每週劇情：書架的頁籤、今日特展、本週異狀、每週劇情面板（11-09）
import "./css/admin.css"; // 管理員介面（只看不改，決定 0033）
import "./css/shop.css"; // 兌換所、上課、試煉房間（11-09，決定 0032）
import "./css/themeshow.css"; // 主題展辦完：展期、三級、海報（11-09，決定 0035）
import "./css/rank.css"; // 本週榜單（11-09，決定 0039）
import "./css/mates.css"; // 大廳導覽圖上的館友名牌（11-09）
import "./css/events.css"; // 限時活動（決定 0041）
import "./css/casino.css"; // Hamachi 賭場（決定 0040）
import "./css/discord.css"; // 我的帳號裡的「綁定 Discord」（決定 0051）
import "./css/today.css"; // 「今天」清單和導覽列的「今天」（11-10）
import "./css/pass.css"; // 館友證和典藏冊（11-10，決定 0058）
import "./css/hub.css"; // 大廳的總覽（11-10，決定 0061）
import "./css/lobby2.css";
import "./css/cellar2.css"; // 地下室改版（11-11） // 新的大廳（決定 0066）
import "./css/artmarket.css"; // 藝術市場：今日特展的畫可以跟館方買賣（11-14，ui_art.js）
import "./css/gallery2.css";
import "./css/origin2.css"; // 圖書館重做（11-14，ui_screens1.js）
import "./css/office2.css"; // 館長室重做（11-14，ui_screens3.js） // 畫廊重做（11-14，ui_story.js、ui_art.js）
import "./css/bank.css"; // Yuga Bot 銀行廳（11-13，ui_bank.js）
import "./css/onescreen.css"; // 介面重塑：每個廳壹個畫面（11-13，docs/介面整合規劃.md 第六步）。零件在 public/ui2
import "./css/hallnow.css"; // 展廳現在、評價（11-14，ui_hallnow.js）
import "./css/tabx.css"; // 頁籤牌子六種材質（11-14，docs/頁籤牌子素材.md）
import "./css/landscape.css"; // 手機橫拿的版面和直拿的提示（決定 0043）。要蓋掉前面所有的樣式，所以放在最後

import "./art.js";
import "./fx.js";
import "./ui_core.js";
import "./ui_screens1.js";
import "./ui_screens2.js";
import "./ui_screens3.js";
import "./ui_bank.js"; // Yuga Bot 銀行廳（11-13）：先用示範資料，伺服器的 bankHall 接上後換掉
import "./ui_curio.js";
import "./ui_odd.js";
import "./ui_board.js"; // 公佈欄、信箱（11-08）
import "./ui_login.js"; // 登入、存檔放伺服器、館友（多人版 M1，11-08）
import "./ui_visit.js"; // 參觀館友的展廳、送佩佩、伺服器的信（多人版 M2，11-09）。放在 ui_party 前面：館友小卡上的按鈕照載入的順序
import "./ui_party.js"; // 邀請、隊伍、一起融合（多人版 M3，11-08）
import "./ui_trace.js"; // 留下痕跡（留言牌、影子、幽影，11-09）
import "./ui_route.js"; // 地圖選路（地下室改版）；ui_coop.js 在 route、rest、chest 階段叫它
import "./ui_fight.js"; // 打怪物的畫面（地下室改版，決定 0067、0068）；ui_coop.js 在 fight 階段叫它
import "./ui_coop.js"; // 合作地下收藏庫（多人版 M4，11-09）：規則在 shared/coop.js，伺服器在 functions/coop.js
import "./ui_signin.js"; // 每日簽到、簽到日曆、節日特展（11-09，決定 0030）
import "./ui_story.js"; // 每週劇情（11-09）：內容在 content/weeks/，規則在 shared/story.js
import "./ui_admin.js"; // 管理員介面（只看不改，決定 0033）：資料從 functions/admin.js 來
import "./ui_shop.js"; // 兌換所、委託櫃台的上課、地下的試煉房間（11-09，決定 0032）：規則在 shared/shop.js
import "./ui_themeshow.js"; // 主題展辦完（11-09，決定 0035）：規則在 shared/themeshow.js
import "./ui_board_rank.js"; // 本週榜單（11-09，決定 0039）：規則在 shared/board.js，資料是 tools/weekly_board.cjs 每週寫的。跟公佈欄 ui_board.js 不一樣
import "./ui_mates.js"; // 大廳導覽圖上的館友在哪間房（11-09）：規則在 shared/mates.js
import "./ui_pass.js"; // 館友證和典藏冊（11-10，決定 0058，整合的第 2 步）：規則在 shared/pass.js；要放在 ui_login、ui_signin、ui_story 後面
import "./ui_hub.js"; // 大廳的總覽（11-10，決定 0061）：要放在 ui_signin、ui_story、ui_pass 後面；ui_today 它自己會 import
import "./ui_today.js"; // 「今天」清單（11-10，整合的第 1 步）：簽到、劇情、任務、信箱、賭場剩幾次排在壹張，每項有「前往」
import "./ui_events.js"; // 限時活動（決定 0041）：大廳的一條、合作和試煉的標籤；規則在 shared/events.js
import "./ui_casino_slot.js"; // 大禮包的拉霸機（11-09）
import "./ui_casino_live.js"; // 實況和斗內：聽 casinoLive、跳感謝、大廳的「正在實況」（決定 0053）
import "./ui_casino.js"; // Hamachi 賭場（決定 0040）：規則在 shared/casino*.js，伺服器在 functions/casino.js
import "./ui_orient.js"; // 手機直拿時請玩家轉橫、橫拿的版面在 css/landscape.css（決定 0043）
import "./ui_discord.js"; // 我的帳號裡的「綁定 Discord」（決定 0051）：伺服器在 functions/discord_link.js，規則在 shared/discord.js
import "./ui_hallnow.js"; // 展廳現在幾人、NPC 的即時評價（11-14，伺服器 PR 418）
import "./ui_lobby2.js"; // 新的大廳（決定 0066）：要放在 ui_today、ui_events、ui_casino_live 後面；回滾改 NUM.ui.newLobby
import "./ui_work.js"; // 欠款送參觀者去地下工作（決定 0064 第二部分）：規則在 shared/casino_wallet.js 的 casWork*；要放在 ui_login、ui_screens1 後面
import "./ui_lost.js"; // 招領：地下遇到別的館友以前理智歸零的參觀者（翊文 11-13，shared/lostfound.js）
import "./ui_casino_table.js"; // 賭場的館友同桌（第二階段）：伺服器在 functions/casino_table.js；放在 ui_party 後面（PARTY_HOOKS）

import "./ui_update.js"; // 有新版本的提示（11-10）：還開著的舊網頁跳「館裡更新了」；判斷在 shared/notices.js

const debugScreen = import.meta.env.DEV && location.hash.length > 1;
if (debugScreen) window.__PM_NODOOR__ = true; // 開發時直接進畫面，不放開館布幕

import("./boot.js").then(() => {
  if (debugScreen) import("./debug_boot.js");
});
