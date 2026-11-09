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
import "./css/party.css"; // 邀請、隊伍、一起融合（多人版 M3，11-08）
import "./css/coop.css"; // 合作地下收藏庫（多人版 M4，11-09）
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
import "./css/landscape.css"; // 手機橫拿的版面和直拿的提示（決定 0043）。要蓋掉前面所有的樣式，所以放在最後

import "./art.js";
import "./fx.js";
import "./ui_core.js";
import "./ui_screens1.js";
import "./ui_screens2.js";
import "./ui_screens3.js";
import "./ui_curio.js";
import "./ui_odd.js";
import "./ui_board.js"; // 公佈欄、信箱（11-08）
import "./ui_login.js"; // 登入、存檔放伺服器、館友（多人版 M1，11-08）
import "./ui_visit.js"; // 參觀館友的展廳、送佩佩、伺服器的信（多人版 M2，11-09）。放在 ui_party 前面：館友小卡上的按鈕照載入的順序
import "./ui_party.js"; // 邀請、隊伍、一起融合（多人版 M3，11-08）
import "./ui_trace.js"; // 留下痕跡（留言牌、影子、幽影，11-09）
import "./ui_coop.js"; // 合作地下收藏庫（多人版 M4，11-09）：規則在 shared/coop.js，伺服器在 functions/coop.js
import "./ui_signin.js"; // 每日簽到、簽到日曆、節日特展（11-09，決定 0030）
import "./ui_story.js"; // 每週劇情（11-09）：內容在 content/weeks/，規則在 shared/story.js
import "./ui_admin.js"; // 管理員介面（只看不改，決定 0033）：資料從 functions/admin.js 來
import "./ui_shop.js"; // 兌換所、委託櫃台的上課、地下的試煉房間（11-09，決定 0032）：規則在 shared/shop.js
import "./ui_themeshow.js"; // 主題展辦完（11-09，決定 0035）：規則在 shared/themeshow.js
import "./ui_board_rank.js"; // 本週榜單（11-09，決定 0039）：規則在 shared/board.js，資料是 tools/weekly_board.cjs 每週寫的。跟公佈欄 ui_board.js 不一樣
import "./ui_mates.js"; // 大廳導覽圖上的館友在哪間房（11-09）：規則在 shared/mates.js
import "./ui_events.js"; // 限時活動（決定 0041）：大廳的一條、合作和試煉的標籤；規則在 shared/events.js
import "./ui_casino_slot.js"; // 大禮包的拉霸機（11-09）
import "./ui_casino_live.js"; // 實況和斗內：聽 casinoLive、跳感謝、大廳的「正在實況」（決定 0053）
import "./ui_casino.js"; // Hamachi 賭場（決定 0040）：規則在 shared/casino*.js，伺服器在 functions/casino.js
import "./ui_orient.js"; // 手機直拿時請玩家轉橫、橫拿的版面在 css/landscape.css（決定 0043）
import "./ui_casino_table.js"; // 賭場的館友同桌（第二階段）：伺服器在 functions/casino_table.js；放在 ui_party 後面（PARTY_HOOKS）

const debugScreen = import.meta.env.DEV && location.hash.length > 1;
if (debugScreen) window.__PM_NODOOR__ = true; // 開發時直接進畫面，不放開館布幕

import("./boot.js").then(() => {
  if (debugScreen) import("./debug_boot.js");
});
