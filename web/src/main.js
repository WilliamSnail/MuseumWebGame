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
import "./css/signin.css"; // 每日簽到、簽到日曆、節日的外觀（11-09，決定 0030）
import "./css/story.css"; // 每週劇情：書架的頁籤、今日特展、本週異狀、每週劇情面板（11-09）

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
import "./ui_party.js"; // 邀請、隊伍、一起融合（多人版 M3，11-08）
import "./ui_coop.js"; // 合作地下收藏庫（多人版 M4，11-09）：規則在 shared/coop.js，伺服器在 functions/coop.js
import "./ui_signin.js"; // 每日簽到、簽到日曆、節日特展（11-09，決定 0030）
import "./ui_story.js"; // 每週劇情（11-09）：內容在 content/weeks/，規則在 shared/story.js

const debugScreen = import.meta.env.DEV && location.hash.length > 1;
if (debugScreen) window.__PM_NODOOR__ = true; // 開發時直接進畫面，不放開館布幕

import("./boot.js").then(() => {
  if (debugScreen) import("./debug_boot.js");
});
