---
日期: 2026-11-08
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [web/src/net_firebase.js, web/src/firebase_config.js, web/src/net.js, web/src/ui_core.js, web/src/ui_login.js, functions/index.js, functions/package.json, firebase.json, .firebaserc, firestore.rules, firestore.indexes.json, database.rules.json, tools/emulators.cjs, tools/copy_shared.cjs, package.json, .gitignore, shared/logic3.js, docs/Firebase做法.md, docs/決定/0020-多人玩法的數字和說話.md, docs/決定/0021-部署改用Firebase.md, docs/決定/0012-自架先A後B.md, AGENTS.md, docs/架構.md, docs/多人實作.md, docs/現況.md, 規劃.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過；vite build 成功；sim.cjs 1000 跟拆融合之前一樣；模擬器開起來，瀏覽器兩個分頁（小明、小華）在 Firebase 上登入、建館友、存檔、互相看到在哪個房間；正式的 Firebase 專案還沒開，沒部署
狀態: 本機完成
相關: [docs/決定/0021-部署改用Firebase.md, docs/Firebase做法.md]
---

## 為什麼要改

> 「我目前想部屬在Firebase好了」「就用Firebase的網域」「然後兩個人的不同AI可以共同維護這個專案」「好了，可以做多人遊戲模式了」（翊文的原話）

- 原本決定自架在 homelab（決定 0012），伺服器骨架用 Node＋SQLite＋WebSocket。翊文改成 Firebase：用 Firebase 給的網址、兩個專案（測試、正式）、Blaze（翊文綁卡）、Node 伺服器停掉。
- 做多人玩法之前先問了規劃第十節的四題（來訪的靈感、隊伍、次數、說話），寫成決定 0020。

## 改了什麼

- **決定**：0020（來訪 +2、一天 5 次；合作 2–4 人每人 1–2 隻；不限次數、每天前 3 趟有獎勵；快速短句＋叫聲，也要自由打字；其他結局也能退休）、0021（改用 Firebase，取代 0012）。規劃第十節第 9、11、23、25 題標已決定。
- **Firebase 的做法**（`docs/Firebase做法.md`）：資料放哪裡、誰能讀寫、哪些事由 Functions 做、`NET` 怎麼對過去、本機怎麼跑、要翊文做的事。
- **設定和規則**：`firebase.json`（Hosting、Firestore、Realtime Database、Functions、模擬器的連接埠）、`.firebaserc`（本機用 `demo-pepe4`）、`firestore.rules`（館友才能讀寫；存檔只有自己、`rev` 要加一）、`database.rules.json`（在線名單、給我的通知）、`firestore.indexes.json`（存檔的字串不建索引）。
- **Functions**（`functions/`）：先做 `join`：第一次登入檢查邀請名單、建館友（Firestore 和 Realtime Database 兩邊都記）。模擬器裡 `@dev.local` 的帳號不用邀請。
- **畫面的 NET 改接 Firebase**：新的 `web/src/net_firebase.js`，介面跟原本的 `net.js` 一模一樣，畫面只改了 import 那一行（`ui_core.js`、`ui_login.js`）。
  - 模擬器：打名字登入（模擬器接受假的 Google 憑證）。正式：Google 登入。
  - 存檔：Firestore 的交易檢查 `rev`。
  - 在線名單：Realtime Database，斷線自動變離線，5 分鐘沒動算離開。
  - `?user=名字` 照樣每個分頁一個人（登入只放在這個分頁）。
  - 舊的 `net.js` 的 `NET` 改名 `NODE_NET`（頂層名字不能重複），只剩伺服器的測試在用。
- **本機的模擬器**：`npm run emulators`（`tools/emulators.cjs`：找 Java、先把 `shared/` 複製進 `functions/shared/`、不經過 shell，路徑有空白和中文也可以）。`.claude/launch.json` 多 `pepe4-emulators`。
- **安裝**（翊文：「都你幫我裝」）：firebase-tools 15.35（專案的開發套件）、firebase 網頁套件、Functions 的 firebase-admin、firebase-functions（npm 官方）；Java（Eclipse Temurin JDK 21，winget，從 Adoptium 官方下載、驗過雜湊）——指令打在翊文的終端機，條款由翊文自己同意。
- **一起融合的規則**（M3，純函式）：`shared/logic3.js` 的融合拆成 `chargeFusion`、`fusionChild`、`fusionLearn`，`startFusion` 照原本的順序叫（亂數順序一樣、模擬一字不差）；新的 `canFuseOne`、`fuseTogether(PA, a, PB, b)`：各自扣靈感和次數、各自擲理智、骰子只擲一次、血統自動用、理智用完的人拿不到。

## 怎麼確認的

- `npm test` 全過；`npx vite build` 成功（Firebase 套件讓檔案變大，打包時有提醒，之後再拆）。
- `node test/sim.cjs 1000`：全部解鎖中位數 0.8 小時、完美作品 1.0%、失敗作 2.1%，跟拆融合之前一樣。
- 模擬器：Auth、Functions（`join` 載入成功）、Firestore、Database、Hosting 都起來了。
- 瀏覽器：
  - `?user=小明`：登入、`join` 建館友、問搬存檔（按「從頭開始」）、存檔寫進 Firestore（rev 1）。
  - 第一次在線名單說沒權限、跳「連不上伺服器」：Realtime Database 的名字對不上（見「給下一個人」），改了之後小明在線、在門口。
  - `?user=小華`：小華的選單「館友 2 人在線」；小明的大廳寫「小華　在畫廊」「測試位子2　在大廳」（做位子的 subagent 開的）。

## 還沒做、要注意

- **`fuseTogether` 還沒有測試**（規則寫好了，還沒接 Functions、還沒有畫面）。下一步：Functions 的邀請、隊伍、`fuseTogether`，加上它的測試。
- 上線提示、衝突、改暱稱、隱身、登出在 Firebase 上**還沒有一項一項重走**（Node 版都走過；`NET` 的介面一樣，但裡面換了）。
- 送佩佩、參觀展廳（M2）的伺服器部分要改寫成 Functions；規則 `shared/gifts.js` 已經好了（subagent，另一篇日誌）。
- 真的 Firebase 專案還沒開：`web/src/firebase_config.js` 的 `test`、`prod` 是空的；GitHub Actions 自動部署還沒設。要翊文做的事寫在 `docs/Firebase做法.md` 第七節。
- 邀請名單（`invites/{email}`）還沒有管理介面，開給朋友前要做（或先在後台手動加）。
- Functions 的 `firebase-functions` 版本，模擬器說有新版（有不相容的改動），之後再升級。
- npm 新版預設不跑安裝腳本：`re2`、`protobufjs` 的沒有跑，模擬器照樣可以用。

## 給下一個人

- **本機開發**：先 `npm run emulators`（或 `pepe4-emulators`），再 `npm run dev`；多人測試照樣開 `?user=小明`、`?user=小華`。模擬器管理畫面 http://127.0.0.1:4400 看得到登入的人、Firestore、Database 的資料。
- **不要在原始碼寫反斜線 u 加 2028／2029 的跳脫**：工具會換成真的換行字元（連註解都會），檔案載不起來。用 `codePointAt` 判斷。
- **模擬器的 Realtime Database 名字是 `demo-pepe4`**，不是 `demo-pepe4-default-rtdb`。
- Realtime Database 的規則讀不到 Firestore：「是不是館友」兩邊都要記。
- 從瀏覽器查模擬器的資料可以帶 `Authorization: Bearer owner`（不受規則限制，只有模擬器可以這樣）。
- 這台電腦 8080、9000、4000 被別的程式用了，所以 `firebase.json` 的連接埠不是預設的。
