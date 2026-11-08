# 0021 部署改用 Firebase（Firebase 給的網域、兩個專案、兩個人的 AI 一起維護）

- 日期：2026-11-08
- 誰決定：翊文
- 狀態：有效（取代第 0012 篇的「自架在 homelab，先 A 後 B」）。「兩個專案」那部分被第 0023 篇取代：只用 `pepe-museum` 一個，測試都在模擬器

## 背景

- 第 0012 篇決定自架在 homelab。伺服器骨架（`server/`，Node＋SQLite＋WebSocket）已經做好、接進畫面（M1）。
- 翊文 11-08：

  > 「我目前想部屬在Firebase好了」
  >
  > 「就用Firebase的網域」
  >
  > 「然後兩個人的不同AI可以共同維護這個專案」

- 問了四題：
  - 方案：翊文說「Spark也有要卡吧，我可以用我的卡」。Spark（免費）其實不用卡，要卡的是 Blaze；翊文願意綁卡，所以用 **Blaze**。
  - 原本的 Node 伺服器和 homelab：**停掉，全部改 Firebase**。
  - 本機的模擬器要的 Java、firebase-tools：**都由 Claude 裝**（Java 要接受授權條款，指令由 Claude 打在翊文的終端機，條款由翊文自己按同意）。
  - 專案：**兩個，測試和正式**。

## 決定

- **網址**：Firebase Hosting 給的 `專案名.web.app`（免費、有 HTTPS），不買網域。
- **方案**：Blaze（用多少付多少，有免費額度；10 個人應該是 0 元）。要設花費通知和上限。綁卡、設上限由翊文自己在後台做。
- **用到的**：
  - Hosting：遊戲網頁（`dist/`）。
  - Authentication：Google 登入。
  - Cloud Firestore：存檔、展廳、信箱、按讚留言、紀錄。
  - Realtime Database：在線名單（斷線自動標離線）、邀請、隊伍、一起玩的狀態。
  - Cloud Functions：伺服器說了算的事（一起融合、合作地下的擲骰、送佩佩、來訪的靈感、之後的核對和排程）。規則照舊寫在 `shared/`，Functions import 同一份。
- **兩個專案**：測試（給 PR 先部署、壞了沒關係）、正式（朋友在玩的，只有合併到 `main` 後的自動流程能部署）。名字由翊文開專案時決定。
- **本機開發**：Firebase 模擬器（Emulator Suite：Auth、Firestore、Realtime Database、Functions、Hosting），每個人在自己電腦跑，碰不到真的專案。
- **兩個人的 AI 一起維護**：照規劃第七節「兩個人的 AI 一起自動維護同一個專案」：
  - AI 只改 repo；部署只由 GitHub Actions 做（每個 PR 一個預覽網址，合併到 `main` 才部署正式）。
  - 部署用的服務帳號金鑰只放 GitHub Secrets，兩邊的 AI 都拿不到。
  - 兩邊的 AI 用 Firebase 官方的 MCP 連模擬器或測試專案；權限是登入那個人的，朋友在正式專案只能看。
- **原本的 Node 伺服器**（`server/`、`db/`）：留在 repo 當參考，不再加東西。畫面叫的 `NET` 介面（登入、存檔、在線名單、送訊息）保持一樣，裡面改接 Firebase，畫面幾乎不用改。

## 影響

- 第 0012 篇標「被第 0021 篇取代」；第 0011 篇（玩家要登入、存檔放伺服器）照舊有效，伺服器換成 Firebase。
- `docs/多人實作.md` 的「技術上要先想好的」改成 Firebase 的做法（新文件 `docs/Firebase做法.md`）。
- 規劃第五節「服務」改成 Firebase；第十節第 1、2 題改寫。
- `AGENTS.md` 第 2 節的指令：多一個開模擬器的指令；第 6 節「不碰正式伺服器」改成「不碰正式的 Firebase 專案」。
- 要翊文做的（AI 不能做）：開兩個 Firebase 專案、升級 Blaze、設花費上限、加一起開發的朋友當成員、開 GitHub repo。

## 什麼時候可以再討論

- 費用超過預期，或 Firebase 的限制（例如 Realtime Database 同時連線數）不夠用的時候。
- 想搬回自架的時候：規則都在 `shared/`，`server/` 也還在，可以搬回去。
