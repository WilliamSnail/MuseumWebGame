---
日期: 2026-11-08
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [.github/workflows/deploy.yml, .github/workflows/ci.yml, .github/CODEOWNERS, README.md, AGENTS.md, web/src/firebase_config.js, .firebaserc, shared/config.js, shared/notices.js, web/index.html, test/esm_smoke.mjs, docs/Firebase做法.md, docs/決定/0022-名字改回佩佩博物館2.md, docs/決定/0023-只用一個Firebase專案.md, docs/決定/0024-AI可以自己合併和退版.md, docs/決定/0015-名字佩佩博物館4.md, docs/決定/0021-部署改用Firebase.md, 規劃.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過、vite build 成功；git init 之後看過會進 repo 的 153 個檔，掃過沒有金鑰和大檔；deploy.yml 還沒在 GitHub 上跑過
狀態: 還沒驗證
相關: [docs/決定/0022-名字改回佩佩博物館2.md, docs/決定/0023-只用一個Firebase專案.md, docs/決定/0024-AI可以自己合併和退版.md]
---

## 為什麼要改

> 「我決定這麼多版還是叫做 佩佩博物館2 好了」「沒必要測試，就用正式的就好」「這個可以我們授權ai來幫我們做」「好，我本來就有github，要加另一個朋友的一起維護」（翊文的原話）

- 翊文在 Firebase 後台開好正式專案 `pepe-museum`（Blaze 走免費試用、Google 登入、Firestore、Realtime Database、每日備份）。
- 接著要放上 GitHub，讓朋友的 AI 一起維護。

## 改了什麼

- **名字**（決定 0022，取代 0015 的名字部分）：玩家看得到的名字都改成「佩佩博物館2」：開場標題、分頁標題、公告標題、`AGENTS.md`、`README.md`。資料夾、`package.json` 的名字、Firebase 專案 ID、存檔 key 不改。
- **只用一個 Firebase 專案**（決定 0023，取代 0021 的兩個專案）：`firebase_config.js` 只有 `emulator`、`prod`；`.firebaserc` 加 `prod: pepe-museum`。PR 只測試、打包，不部署、不開預覽網址（會連到正式的資料）。
- **AI 可以自己合併和退版**（決定 0024）：測試和打包過了，任何 PR 都可以；正式版壞了 AI 可以開退版的 PR 自己合併，再開 Issue 告訴翊文。`AGENTS.md` 第 5、6 節改寫（還是不准直接推 `main`、改保護設定、自己 `firebase deploy`、直接改正式資料庫、刪資料）。`CODEOWNERS` 只當通知。
- **部署**：新的 `.github/workflows/deploy.yml`：合併到 `main` → 先跑測試和打包 → 過了才部署網頁、規則、Functions 到 `pepe-museum`。金鑰（`FIREBASE_SERVICE_ACCOUNT`）還沒放之前會跳過部署。服務帳號怎麼建寫在 `docs/Firebase做法.md` 第六節（翊文做）。
- **git**：在 `佩佩博物館4/` 裡 `git init -b main`（翊文選「就放現在這裡」，OneDrive 只是備份）；設了 `core.quotepath false`（中文檔名照樣顯示）、`core.autocrlf false`。**還沒 commit**。
- **README**：加「第一次怎麼開始（一起開發的朋友看這段）」：要裝什麼、`npm run emulators`、`?user=` 多人測試、叫 AI 先讀 `AGENTS.md`、不要自己部署。

## 怎麼確認的

- `npm test` 全過、`npx vite build` 成功（標題的測試改成「佩佩博物館2」）。
- `git status`：會進 repo 的 153 個檔；`node_modules`、`dist`、`.firebase-data`、`functions/node_modules`、`functions/shared` 都排除了。掃過私鑰、GitHub／API token 的樣子，沒有；最大的檔是 368 KB 的 `package-lock.json`。
- Firebase 的網頁設定照翊文貼的文字對過六項，都一樣。

## 還沒做、要注意

- **deploy.yml 還沒在 GitHub 上跑過**，服務帳號要的權限是照網路上的整理先寫的，第一次部署可能要再補。
- 第一次部署 Functions 時，Google Cloud 會自己打開幾個服務（Cloud Build、Artifact Registry 這些），可能要等幾分鐘、可能失敗一次再重跑。
- 資料庫規則沒有自動測試：AI 自己合併的話，規則寫錯擋不到（決定 0024 建議之後補）。
- 免費帳號的私人 repo 鎖不住 `main`（翊文：「沒問題」）：只靠 AI 守規矩和「測試沒過不部署」。
- **2027-02-07 之前**要把 Firebase 的免費試用升級成付費帳戶，不然服務會停。

## 給下一個人

- 部署只走 `deploy.yml`；`--force` 會把程式裡沒有的 Functions 刪掉（照程式為準）。
- 打包時 `firebase_config.js` 的 `firebaseTarget()`：`npm run dev` 連模擬器、`npm run build` 連正式的 `pepe-museum`。
- 第一次 commit 要等「三個參觀者的位子」那個 subagent 做完。
