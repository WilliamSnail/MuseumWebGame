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
| `invites/{email}` | 邀請名單；`admin: true` 的是管理員（第八節） | 沒有人（只有 Functions） | 翊文在 Firestore 後台（AI 碰不到） |
| `saves/{uid}` | 整份存檔：`data`（JSON 字串）、`rev`、`updatedAt` | 自己 | 自己，`rev` 一定要加一（防兩個分頁互相蓋）；Functions 改別人的存檔時也加一 |
| `halls/{uid}` | 訪客簿（M2）：誰哪一天來過、按讚、留言，格式見 `shared/visit.js`。展廳本身不另外存，別人來的時候 Functions 當場讀存檔、只取展廳那一部分（決定 0034） | 沒有人（只有 Functions） | 只有 Functions |
| `coopRuns/{pid}` | 合作地下完整的一趟（`data`：JSON 字串，裡面有線索、幻覺、地圖） | 沒有人（只有 Functions） | 只有 Functions，跟存檔同一個交易 |
| `mail/{uid}/items/{id}` | 伺服器的信（送佩佩、來訪的謝禮，之後的補償）。領了標 `claimed`，不刪 | 沒有人（瀏覽器叫 Functions 的 `socialNews` 拿） | 只有 Functions |
| `calls/{uid}/items/{id}` | 「請你去看我的展廳」（11-09）：編號 `call-日期-請的人`，同一天同一位只有一則（再請就蓋過去、變回沒看過）。看過標 `seen`，不刪 | 沒有人（瀏覽器叫 `socialNews` 拿；沒寫進規則，走「一律不准」） | 只有 Functions |
| `boards/{週}`、`boards/latest` | 每週排行榜（決定 0039）：榜單、建議、提醒、`posted`。只有暱稱和榜上的數字，沒有 uid、email。`latest` 是最新一週的整份複製 | 館友 | 只有 `tools/weekly_board.cjs`（Admin SDK） |
| `boards/{週}/private/people` | 那一週每個人的累計數字（圖鑑、書、展廳、地下），下週相減用。用 uid 當 key，所以放另一份：Firestore 的規則不能只擋一個欄位 | 沒有人（走最下面的「一律不准」） | 只有 `tools/weekly_board.cjs` |

- 存檔用**一個字串欄位**放整份 JSON：Firestore 一份文件最多 1 MiB，欄位數也有上限；字串不用一層一層建索引（`firestore.indexes.json` 把 `data` 排除）。
- 沒有 `members/{uid}` 的人，什麼都讀不到、寫不了（`firestore.rules`）。這就是邀請制：Google 帳號誰都能登入，但不在名單上就進不了館。

### Realtime Database

| 路徑 | 放什麼 | 誰能寫 |
|---|---|---|
| `/status/{uid}` | `state`（online／away／offline）、`room`、`nick`、`at` | 自己；斷線時 `onDisconnect` 自動改成 offline |
| `/inbox/{uid}/{id}` | 給我的通知：被邀請、存檔被伺服器改了（`save_changed`）、有新的信（`mail_new`）、有人來過展廳（`hall_news`） | 只有 Functions；自己讀完刪掉 |
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
| `visitHall`、`hallAct` | 走進館友的展廳（給展廳那一部分、記來訪、寄謝禮）、按讚、留言 | M2 |
| `sendGift`、`claimMail` | 送佩佩（同一個交易從自己的收藏拿掉、寄進對方的信箱）、領信（同一個交易放進存檔、把信標成領過） | M2 |
| `hallCall` | 請館友來看我的展廳（11-09，取代分享碼）：沒有獎勵，同一位可以一直請，自己的展廳要開館；寫 `calls`、送 `hall_call` 通知（`shared/gifts.js` 的 `checkHallCall`、`shared/visit.js` 的 `stepHallCall`） | M2 |
| `visitWeekly` | 跟館友比本週特展（11-09，取代特展碼）：只讀，檢查對方是館友，只回那一週的最高分和展台（`weeklyView` → `stepWeeklyView`，格子走 `cleanHallSlot`）；不算來訪、不寄信；對方沒開館、這週沒擺過就只回旗標 | M2 |
| `socialNews` | 我的新消息：還沒領的信、誰來過我的展廳、誰請我去看展廳（`calls`；`seenCalls` 把處理過的標起來） | M2 |
| `adminCheck` | 我是不是管理員：回傳 `{ admin }`。畫面登入後問一次，決定選單要不要多「管理員」 | 決定 0033 |
| `adminOverview` | 大家的進度（只讀）：讀 `members`、`saves`、`/status`，用 `shared/admin.js` 算成摘要。不是管理員回「沒有權限」。不回傳 email、uid、整份存檔 | 決定 0033 |

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
| `readBoard()` | 讀 `boards/latest`（本週榜單，決定 0039）。只有 Firebase 版有 |

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

## 八、管理員（翊文在後台設，決定 0033）

管理員只看得到大家的進度，不能改（`functions/admin.js`、`shared/admin.js`、`web/src/ui_admin.js`）。程式裡不寫死任何 email、uid，名單就是 `invites`。

翊文怎麼把自己設成管理員（AI 不能做，AI 碰不到正式的 Firebase）：

1. Firebase 主控台（專案 `pepe-museum`）→「Firestore Database」→ 集合 `invites`。
2. 打開自己的 email 那一筆。文件 ID 要全部小寫，跟登入的 Google 帳號一樣。沒有那一筆就新增一筆。
3. 按「新增欄位」：名稱 `admin`，類型 `boolean`，值 `true`。要選 boolean，不要打成字串。
4. 回遊戲重新整理：進館後右上角「選單」多一項「管理員」。

- 拿掉：把 `admin` 刪掉或改成 `false`，下次登入選單就沒有了；已經開著的畫面，按「重新整理」會變成「沒有權限」。
- 那一筆有 `disabled` 就不算管理員。
- Functions 看的是登入 token 的 email（小寫，`email_verified` 要是 true）。

在模擬器測（只用假帳號）：

1. 算出假帳號的 email：`node -e "console.log('dev-' + Buffer.from('測試管理').toString('hex').slice(0, 40) + '@dev.local')"`。
2. http://127.0.0.1:4400/firestore → `invites` → 新增文件，文件 ID 是那個 email，欄位 `admin`，類型 boolean，值 true。
3. 開 `http://localhost:5173/?user=測試管理`，進館 → 選單 → 管理員。

## 九、固定動作（決定 0038）

翊文跟 AI 說要做什麼（例如「邀請 xxx@gmail.com」），AI 按 GitHub 上的 `firebase-task.yml`；金鑰在 GitHub Secrets，AI 拿不到。翊文也可以自己到 GitHub 的 Actions 頁按。

| 動作 | 做什麼 |
|---|---|
| `invite` | 把一個 Gmail 加進邀請名單（可以帶名字）；被停用的會恢復 |
| `admin-on`、`admin-off` | 設或取消管理員 |
| `disable`、`enable` | 停用或恢復邀請。停用只擋還沒加入的、讓管理員失效；已經加入的還進得去 |
| `stats` | 合起來的數字：邀請、管理員、館友、有存檔的、最近 24 小時和 7 天有存檔的。沒有 email、名字 |

```bash
gh workflow run firebase-task.yml -f action=stats
```

這幾件以外都不能做（讀存檔、改存檔、刪資料都不行）。email、名字在紀錄裡遮掉，不寫進 repo。

## 十、每週排行榜（決定 0039）

`.github/workflows/weekly-board.yml` 跑 `tools/weekly_board.cjs`，規則在 `shared/board.js`。金鑰照 `firebase-task.yml` 的做法（寫暫存檔、用完 `if: always()` 刪）。

- **什麼時候**：每週一台灣時間 05:15（cron `15 21 * * 0`，UTC 週日 21:15）。GitHub 的排程可能晚幾分鐘，只在預設分支跑。
- **算哪一週**：一律是剛過完的那一週。週三手動按，算的也是上一週。
- **順序**：讀 `members`、`saves` → 跟 `boards/{上週}/private/people` 相減 → 先寫快照（`boards/{週}`、`boards/{週}/private/people`、`boards/latest`）→ 再發 Discord → 發了才記 `posted`。
- **Discord 沒放或發失敗**：快照已經寫了。再跑一次會用同一份榜單補發（不重算）。發失敗那次的 Actions 會是紅的；沒放金鑰是綠的。
- **同一週不發兩次**：看 `posted`。`force` 會重算、再發一次，數字會變成現在的。
- **沒有人有進度**：快照照寫，不發。
- **紀錄**：只印榜單文字和幾份存檔讀不了（只有數字）。沒有 email、uid、存檔內容。

手動按（AI 只有翊文要求時才能按，跟固定動作一樣）：

```bash
gh workflow run weekly-board.yml -f dry_run=true             # 只印不發：不寫 Firestore、不發 Discord（手動的預設）
gh workflow run weekly-board.yml -f dry_run=false            # 照正常的流程
gh workflow run weekly-board.yml -f dry_run=false -f force=true   # 這週發過了也重算、再發一次
```

在模擬器測（只用假資料）：

```bash
EMU_SET=4 npm run emulators        # Firestore 在 12180
FIRESTORE_EMULATOR_HOST=127.0.0.1:12180 node tools/weekly_board.cjs --dry-run --now 2026-11-16T05:15:00+08:00
```

有 `FIRESTORE_EMULATOR_HOST` 就一定不發 Discord，就算環境變數有金鑰也一樣。`--now` 只有連模擬器時能用。
