# 0023 只用一個 Firebase 專案（pepe-museum），測試都在模擬器

- 日期：2026-11-08
- 誰決定：翊文
- 狀態：有效（取代第 0021 篇的「兩個專案：測試、正式」；0021 其他部分照舊）

## 背景

- 第 0021 篇：開兩個 Firebase 專案，測試專案給 PR 先部署、壞了沒關係。
- 翊文開好正式的 `pepe-museum` 之後，說：

  > 「沒必要測試，就用正式的就好」

## 決定

- 只有一個專案：`pepe-museum`（網址 `pepe-museum.web.app`）。
- **開發、測試都在本機的模擬器**（`npm run emulators`，專案名 `demo-pepe4`，碰不到真的專案）。兩個人的 AI 都一樣。
- **PR**：GitHub Actions 只跑 `npm test`、`npm run build`，**不部署**，也不開 Hosting 的預覽網址。
  - 原因：只有一個專案的話，預覽網址連的是正式的資料庫和 Functions。PR 裡的 bug 會直接改到朋友的存檔。
- **合併到 `main`**：GitHub Actions 部署到 `pepe-museum`（Hosting、Firestore 和 Realtime Database 的規則、Functions）。合併由人按。
- 一起開發的朋友：在 `pepe-museum` 給「檢視者」（Viewer），看得到資料和錯誤，改不了；開發用模擬器。

## 影響

- `web/src/firebase_config.js` 拿掉 `test`。
- `docs/Firebase做法.md` 的第一、六、七節改成一個專案。
- 規劃第七節「兩個 Firebase 專案（建議）」那段改成看這篇。
- 上線之後要試新東西，先在模擬器試到沒問題才合併；合併之後壞了，照「出事時」的順序：開一個把壞掉的改動退掉的 PR，退版由翊文按。

## 什麼時候可以再討論

- 合併之後常常出事、模擬器測不到的問題變多的時候（例如 Google 登入、真的網路），再開測試專案。
