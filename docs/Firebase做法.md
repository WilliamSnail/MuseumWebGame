# Firebase 的做法

> 2026-11-08，Claude 寫。決定：`docs/決定/0021-部署改用Firebase.md`（翊文：「我目前想部屬在Firebase好了」「就用Firebase的網域」「然後兩個人的不同AI可以共同維護這個專案」）。
> 這份寫資料放哪裡、誰能讀寫、哪些事由 Cloud Functions 做、畫面的 `NET` 怎麼對過去。多人玩法的順序照 `docs/多人實作.md`。

---

## 一、整體

```
瀏覽器（web/，Vite 打包）
  │  NET（web/src/net_firebase.js）：介面跟原本的 net.js 一樣
  ├─ Authentication：Google 登入
  ├─ Firestore：存檔、帳號、展廳、信箱
  ├─ Realtime Database：在線名單、給我的通知、邀請、隊伍
  └─ Cloud Functions（functions/）：伺服器說了算的事 → import shared/ 同一份規則
Hosting：放 dist/，網址 專案名.web.app
```

- **一個專案**：`pepe-museum`（網址 `pepe-museum.web.app`，決定 0023）。測試都在模擬器，不另外開測試專案。
- **本機**：Firebase 模擬器，專案名用 `demo-pepe4`。`demo-` 開頭的專案不用登入 Firebase、不會連到真的專案（官方的設計），兩個人的 AI 在自己電腦都可以跑。
- 原本的 Node 伺服器（`server/`、`db/`）留著當參考，不再加東西。

## 二、資料放哪裡

### Firestore

| 路徑 | 放什麼 | 誰能讀 | 誰能寫 |
|---|---|---|---|
| `members/{uid}` | 這個帳號是館友：`nick`、`invisible`、`joinedAt` | 館友 | 只有 Functions（`join` 檢查邀請名單之後建） |
| `invites/{email}` | 邀請名單 | 沒有人（只有 Functions） | 管理員（之後的管理介面） |
| `saves/{uid}` | 整份存檔：`data`（JSON 字串）、`rev`、`updatedAt` | 自己 | 自己，`rev` 一定要加一（防兩個分頁互相蓋）；Functions 改別人的存檔時也加一 |
| `halls/{uid}` | 展廳給別人看的那一小部分（M2） | 館友 | 自己存檔時一起寫 |
| `coopRuns/{pid}` | 合作地下完整的一趟（`data`：JSON 字串，裡面有線索、幻覺、地圖） | 沒有人（只有 Functions） | 只有 Functions，跟存檔同一個交易 |
| `mail/{uid}/items/{id}` | 伺服器的信（送佩佩、來訪、補償） | 自己 | 只有 Functions |

- 存檔用**一個字串欄位**放整份 JSON：Firestore 一份文件最多 1 MiB，欄位數也有上限；字串不用一層一層建索引（`firestore.indexes.json` 把 `data` 排除）。
- 沒有 `members/{uid}` 的人，什麼都讀不到、寫不了（`firestore.rules`）。這就是邀請制：Google 帳號誰都能登入，但不在名單上就進不了館。

### Realtime Database

| 路徑 | 放什麼 | 誰能寫 |
|---|---|---|
| `/status/{uid}` | `state`（online／away／offline）、`room`、`nick`、`at` | 自己；斷線時 `onDisconnect` 自動改成 offline |
| `/inbox/{uid}/{id}` | 給我的通知：被邀請、存檔被伺服器改了、有新的信 | 只有 Functions；自己讀完刪掉 |
| `/invites/{iid}`、`/parties/{pid}` | 邀請、隊伍、一起玩的狀態（M3、M4） | 只有 Functions；成員可以讀 |
| `/sent/{uid}/{iid}`、`/partyOf/{uid}` | 這個人送出去還沒回覆的邀請（找舊邀請用，不用在 `/invites` 建索引）、現在在哪一隊 | 只有 Functions；`/partyOf/{uid}` 他自己讀得到（接回去用），別的誰都不能讀 |
| `/coopView/{pid}/{uid}` | 合作地下給這個人看的樣子（`viewFor`） | 只有 Functions；**只有他自己讀得到** |
| `/coopChat/{pid}` | 合作地下的對話（已經變形的，短句、叫聲、打的字），隊伍解散就清 | 只有 Functions；隊員讀得到 |
| `/coopChatLog/{pid}`、`/coopChatAt/{pid}` | 短句變形前的原文（報告用）、送太快的擋 | 只有 Functions，誰都不能讀 |
| `/coopTalkLog/{這一趟}/{id}`、`/coopReports/{id}` | 打的字的紀錄（誰、原文、變形後，不記 email；不清）、檢舉 | 只有 Functions；之後的管理員讀，玩家讀不到 |
| `/traces/...` | 留言牌、影子、幽影、還沒領的讚 | 只有 Functions；館友讀得到 |
| `/lounge/{id}` | 交誼廳：館友貼的探險報告 | 只有 Functions；館友讀得到 |

- 在線名單：每個人聽 `/status`（10 人，一次全讀沒問題）。隱身的人寫 offline。
- 「在哪裡」：換房間寫自己的 `room`。

## 三、Cloud Functions（伺服器說了算）

都用 callable（`onCall`）：瀏覽器呼叫、帶著登入憑證，Functions 檢查是館友才做。

| 名字 | 做什麼 | 哪一步 |
|---|---|---|
| `join` | 第一次登入：email 在邀請名單上 → 建 `members/{uid}` | M1 |
| `invite`、`inviteReply`、`partyAction` | 邀請、隊伍（準備、挑佩佩、開始、離開） | M3 |
| `fuseTogether` | 兩個人一起融合：讀兩份存檔 → `shared/logic3.js` 的 `fuseTogether` → 兩份都寫回（`rev` 加一）→ 通知 | M3 |
| `coopStep` | 合作地下：開隊、選層數、留守、開始、投票、看完了、搬、猜、敲一下、說話和打字、檢舉、時間到、接回去、移出斷線的人（`shared/coop.js`、`coop_flow.js`、`coop_fun.js`） | M4 |
| `coopTrace` | 報告掛展廳、貼交誼廳；留言牌、按讚、領讚的靈感、影子、幽影（`shared/coop_trace.js`） | M2、M6 |
| `sendGift`、`claimMail`、`visitHall` | 送佩佩、領信、來訪的靈感 | M2 |

- **規則同一份**：部署前把 `shared/` 複製進 `functions/shared/`（`firebase.json` 的 predeploy），Functions import 它。
- **骰子**：`shared/logic.js` 的 `RNG` 是整個程式一個。Functions 每次呼叫自己一個執行環境，算之前 `setRng(這次的骰子)`、算完換回來，中間不 `await`。
- **「今天」**：全部照台灣時間 05:00 換日（決定 0019）。11-09 起遊戲裡的一天也是（不再是 15 分鐘一天）。Functions 要「今天」一律 `taipeiDay(Date.now())`（`shared/logic.js`，用伺服器的時間），改存檔前先 `ensureDay(P, 今天)`。Functions 裡 `nowMs()` 就是伺服器的 `Date.now()`（不要在 Functions 用 `setNowClock`、`setDayClock`）。畫面那邊的「現在」登入後也照網路的時間（決定 0026）。

## 四、畫面的 NET

`web/src/net.js` 的介面不變（`info`、`login`、`restore`、`logout`、`updateMe`、`loadSave`、`save`、`saveSoon`、`flush`、`connect`、`where`、`send`、`on`、`me`、`state`、`roster`、`rev`、`loggedIn`），新的 `web/src/net_firebase.js` 照這個介面接 Firebase：

| NET | Firebase |
|---|---|
| `info()` | `{ auth: "firebase", emulator: true/false }` |
| `login()` | 正式：Google 登入（彈出視窗）。模擬器：打名字就登入（模擬器接受假的 Google 憑證） |
| `restore()` | 等 Auth 告訴我上次登入的是誰 |
| `loadSave()`、`save()` | `saves/{uid}` 的交易：讀到的 `rev` 跟上次的不一樣 → `conflict` |
| `connect()`、`where()`、`roster` | `/status`：寫自己的、聽全部的、`onDisconnect` |
| `send(msg)` | 叫對應的 Function |
| `on("message")` | 聽 `/inbox/{uid}` |

- 開發時網址帶 `?user=名字`：這個分頁自己登入（登入狀態只放在這個分頁），一台電腦開幾個分頁就是幾個人，跟原本一樣。
- `ui_login.js` 看 `info().auth`：模擬器 → 打名字；正式 → 「用 Google 登入」。

## 五、本機怎麼跑

```bash
npm run emulators   # Firebase 模擬器（要 Java 21；第一次會下載模擬器，約 100 MB）
npm run dev         # 遊戲（Vite），開發時自動連模擬器
```

- 模擬器的管理畫面：http://localhost:4400（看資料、看登入的人）。
- 連接埠（`firebase.json`）：Auth 9099、Firestore 8180、Realtime Database 9100、Functions 5101、Hosting 5050、管理畫面 4400。翊文的電腦 8080、9000、4000 已經有別的程式在用，所以不用預設的。
- **模擬器的 Realtime Database 規則**：`npm run emulators` 把規則放在 `demo-pepe4-default-rtdb`，遊戲用的是 `demo-pepe4`，所以本機其實沒有規則。要測「玩家讀不到」：開好之後跑 `node tools/emu_rules.cjs`（第 N 套前面加 `EMU_SET=N`）。
- 模擬器關掉資料就沒了；要留著用 `--export-on-exit`（`npm run emulators` 已經設好，放在 `.firebase-data/`，不進 repo）。
- 同時開好幾套（好幾個分支各測各的 Functions）：`EMU_SET=1 npm run emulators`，連接埠都加 1000×EMU_SET（管理畫面 5400），資料不存；網頁要連同一套：`VITE_EMU_SET=1 npx vite --port 5190 --strictPort`。會有一行「multiple instances」的警告，沒關係。

## 六、部署（兩個人的 AI 一起維護）

照規劃第七節：

- AI 只改 repo、開 PR；**部署只由 GitHub Actions 做**。
- PR：只跑測試、打包，**不部署**（只有一個專案，預覽網址會連到正式的資料，決定 0023）。
- 合併到 `main`：部署到正式專案（Hosting、Functions、資料庫規則）。測試過 AI 就可以自己合併、壞了也可以自己退版（決定 0024）。
- 部署用的服務帳號金鑰只放 GitHub Secrets；兩邊的 AI 都拿不到。
- 兩邊的 AI 用 Firebase 官方的 MCP 看模擬器或測試專案（Claude Code：`claude mcp add firebase npx -- -y firebase-tools@latest mcp`；Antigravity：MCP Servers → Firebase）。

### 部署用的服務帳號（翊文做一次，AI 不能做：金鑰是密碼）

1. Google Cloud 主控台（專案選 `pepe-museum`）→「IAM 與管理」→「服務帳戶」→「建立服務帳戶」，名字 `github-deploy`。
2. 給它這些角色：**Firebase 管理員**、**Cloud Functions 管理員**、**服務帳戶使用者**。第一次部署如果說少了權限，照錯誤訊息再加（常見的是「Artifact Registry 管理員」「服務使用情形消費者」）。
3. 點進這個服務帳戶 →「金鑰」→「新增金鑰」→ JSON，會下載一個檔。
4. GitHub repo →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」：名字 `FIREBASE_SERVICE_ACCOUNT`，內容貼那個 JSON 檔的全部文字。
5. 下載的那個檔刪掉（不要放進專案資料夾、不要傳給任何人，包括 AI）。

放好之後，下一次合併到 `main`（或在 GitHub 的「Actions」→「Deploy」按「Run workflow」）就會部署。

## 七、要翊文做的（AI 不能做：開帳號、付款、接受條款）

11-08 做到哪：

- [x] 開專案 `pepe-museum`（網址 `pepe-museum.web.app`）。
- [x] Blaze：走 Google Cloud 的免費試用（抵免額 NT$9,727）。**2027-02-07 之前要按「升級」改成付費帳戶，不然服務會停。**
- [x] 註冊網頁應用程式 `PEPE_MUSEUM`，設定寫進 `web/src/firebase_config.js` 的 `prod`。
- [x] Authentication 打開 Google 登入（公開名稱「佩佩博物館2」）。
- [x] Firestore（`(default)`、asia-east1、正式版模式、每日備份 30 天）。
- [x] Realtime Database（asia-southeast1、鎖定模式）。
- [ ] 設預算通知（Google Cloud →「預算與快訊」）。
- [ ] 開 GitHub repo（私人），把一起開發的朋友加進來。
- [ ] 一起開發的朋友：`pepe-museum` 給「檢視者」（Viewer）。
- [ ] 部署用的服務帳號和金鑰（上面「部署用的服務帳號」那一段）。
