# 佩佩博物館2（第 4 版，多人版）

朋友之間的網頁遊戲。第 4 版＝**多人版**。

- 主旨是「客製化自己的佩佩」：在博物館裡解鎖選項、做佩佩、收藏、擺展廳，選項彼此組合出很多可能性。
- 規則借用克蘇魯的呼喚（CoC）：擲 d100、理智檢定、瘋狂、怪癖。
- 第 4 版要做成大家登入同一間線上博物館，一起參觀展廳、送佩佩、一起融合、組隊下地下收藏庫、比賽（`規劃.md`）。
- **11-08 做到哪**：登入、存檔放在 Firebase、館友在線、三個參觀者的位子做好了；一起融合、合作地下、參觀展廳、送佩佩的規則寫好了，還沒接上（`docs/多人實作.md`）。
- 正式網址：`pepe-museum.web.app`（Firebase，決定 0021、0023）。合併到 `main` 就自動部署。

做到哪、已知問題：`docs/現況.md`。

---

## 第一次怎麼開始（一起開發的朋友看這段）

1. 裝好：**Git**、**Node.js 22.13 以上**、**Java 21**（Firebase 模擬器要用；Windows：`winget install --id EclipseAdoptium.Temurin.21.JDK -e`）。
2. 把 repo 抓下來：`git clone <repo 網址>`，進到資料夾。
3. 裝套件（第一次）：

   ```bash
   npm install
   npm --prefix functions install
   ```

4. 開兩個終端機：

   ```bash
   npm run emulators   # Firebase 模擬器（登入、存檔、館友都在這裡；第一次會下載約 100 MB）
   ```

   ```bash
   npm run dev         # 遊戲，打開 http://localhost:5173/?user=小明
   ```

   - 網址帶 `?user=名字` 就是用那個名字登入；開好幾個分頁、用不同名字，就是好幾個人。
   - 模擬器的管理畫面：http://127.0.0.1:4400（看登入的人、資料庫）。
   - 第一次登入會問「要把這台電腦的存檔搬上去嗎」：測試帳號按「從頭開始」。
5. 叫你的 AI 先讀 `AGENTS.md`（Antigravity、Claude Code 都會讀），照裡面的步驟：認領 Issue → 開分支 → 改 → `npm test` → 寫維護日誌 → 開 PR。測試過 AI 就可以自己合併（決定 0024），合併就會部署到正式版。
6. **不要**從自己電腦 `firebase deploy`，也不要直接改正式的資料庫；部署只由 GitHub 的自動流程做。

## 怎麼跑起來

需要 **Node.js 22.13 以上**。在這個資料夾裡執行：

```bash
npm install          # 第一次要裝
npm run emulators    # Firebase 模擬器（要 Java 21）
npm run dev          # 打開 http://localhost:5173
```

其他指令：

```bash
npm test         # 跑全部的測試
npm run build    # 打包到 dist/
npm run preview  # 看打包後的樣子
```

- 開發時網址加 `#畫面`（例如 `http://localhost:5173/#lobby`）會直接進那個畫面、放好假收藏。**這會清掉這個瀏覽器裡的存檔**，不要拿平常在玩的瀏覽器試。
- 版本號在 `version.json`，遊戲的設定頁看得到。

---

## 資料夾

```
佩佩博物館4/
├─ README.md       ← 這份（給人看的入口）
├─ AGENTS.md       ← 給 AI 的規則（人也可以看）
├─ CLAUDE.md       ← 只有一行 @AGENTS.md（給 Claude Code）
├─ 規劃.md         ← 第 4 版（多人版）的規劃
├─ docs/           ← 說明文件（下面）
├─ 維護日誌/        ← 每次改動一篇；格式照 範本.md
├─ shared/         ← 規則和資料：設定（config）、文字（content）、規則（logic）
├─ web/            ← 網頁：index.html 是外殼，畫面、美術、聲音在 src/
├─ functions/      ← Cloud Functions：伺服器說了算的事（規則照舊在 shared/）
├─ firebase.json、firestore.rules、database.rules.json ← Firebase 的設定和規則
├─ server/、db/    ← 舊的 Node 伺服器（決定 0021 之後停用，留著當參考）
├─ test/           ← 測試和模擬
├─ tools/、.github/ ← 日誌工具、PR 模板、CI
├─ package.json、vite.config.js、version.json
└─ dist/           ← npm run build 打包出來的（不進 repo）
```

**想改設定、文字的人**（例如 Yuga）：

- 選項、數值：`shared/config.js` 最上面那一段。
- 劇情、委託、提示：`shared/content.js`、`shared/content3.js`。
- 改完跑 `npm test`，再用 `npm run dev` 看一下。

---

## 文件在哪

| 文件 | 寫什麼 |
|---|---|
| `docs/現況.md` | 做到哪、還沒做、已知問題 |
| `docs/界線.md` | 每一版都要守的事、「不要改回去」清單 |
| `docs/決定/` | 決定紀錄：為什麼這樣做（一個決定一個檔） |
| `docs/架構.md` | 程式怎麼分、每個檔做什麼、聲音、存檔、數值、會踩的坑 |
| `維護日誌/` | 每次改了什麼、怎麼確認的、給下一個人的提醒 |
| `規劃.md` | 第 4 版的完整規劃；第十節是還沒決定的事 |
| `AGENTS.md` | 一起開發的規矩（給 AI，也給人） |

一起開發的 AI 是 Claude（Claude Code）和 Google Antigravity，規則都以 `AGENTS.md` 為準。

---

## 以前的版本

這幾個在翊文的電腦上，跟這個資料夾放在一起（`yu program/`），不在 repo 裡：

| 版本 | 在哪 | 說明 |
|---|---|---|
| 第 1 代 | `../PepeMuseumTest.exe` | Yuga 2021 年的原作 |
| 第 2 代、進階版 | `../佩佩博物館2/` | 凍結 |
| 第 3 版 | `../佩佩博物館3/` | 凍結。`PepeMuseum3.html` 是單一檔案，離線就能玩；維護說明是那邊的 `說明.md` |
| 往來紀錄 | `../_AI_Note/yu program_Claude紀錄.md` | 第 1 代到第 4 版規劃的經過、翊文的原話 |

想離線玩，就玩第 3 版。第 4 版只做多人版，不做單一 HTML 檔（`docs/決定/0014-只做多人版.md`）。
