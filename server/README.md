# 遊戲伺服器（server/）

> 2026-11-08，Claude 寫。這是**地基**：登入轉接層、邀請名單、存檔、在線名單。還沒接進遊戲畫面。
> 訊息格式：`server/protocol.md`。為什麼這樣做：`規劃.md` 第五節、`docs/決定/0011`、`0012`。

---

## 一、怎麼開

需要 **Node.js 22.13 以上**（用內建的 `node:sqlite`，不用裝原生套件）。第一次先 `npm install`（會裝 `ws`）。

開發時開兩個視窗：

```bash
npm run dev       # 網頁：http://localhost:5173（Vite）
npm run server    # 伺服器：http://127.0.0.1:8787（就是 node server/main.js）
```

- Vite 會把 `/api`、`/ws` 轉到 8787（`vite.config.js` 的 `proxy`），所以網頁裡一律寫 `/api/…`，不用寫 port。
- 什麼都不用設：開發登入、資料庫在 `~/.pepe-museum4/dev.db`（家目錄，不在專案裡，不會進 repo）。
- 看活著沒：`curl http://127.0.0.1:8787/api/health`。
- 開發登入：

  ```bash
  curl -X POST http://127.0.0.1:8787/api/login -H "Content-Type: application/json" -d "{\"name\":\"xiaoming\"}"
  ```

  回來的 `token` 放在 `Authorization: Bearer <token>`。名字只能用字母、數字、`_`、`-`（中文也可以），email 會是 `名字@dev.local`。
- 想重來：關掉伺服器，刪 `~/.pepe-museum4/dev.db`（和旁邊的 `-wal`、`-shm`）。**只刪開發用的那個**。
- 正式環境（打包好的網頁一起發）：

  ```bash
  npm run build
  NODE_ENV=production DB_PATH=/srv/pepe/data/pepe.db PUBLIC_URL=https://名字.asuscomm.com node server/main.js
  ```

- 測試：`npm test` 會跑 `test/server.test.mjs`（開一台暫存的伺服器、兩個假玩家，跑完自己刪掉）。

## 二、環境變數

都可以不設（開發時）。正式環境用 systemd 的 `EnvironmentFile=` 讀一個設定檔（例如 `/etc/pepe/pepe.env`，權限 600）；本機要用 `.env` 就 `node --env-file=.env server/main.js`。`.env` 不進 repo。

| 變數 | 預設 | 意思 |
|---|---|---|
| `NODE_ENV` | `development` | `production`＝正式環境：不准開發登入、一定要 `DB_PATH`、發 `dist/`、相信前面代理的 IP |
| `PORT` | `8787` | 伺服器的 port |
| `HOST` | `127.0.0.1` | 只聽本機。前面有 Caddy、cloudflared 轉過來，不要改成 `0.0.0.0` |
| `DB_PATH` | `~/.pepe-museum4/dev.db` | 資料庫檔。正式環境**一定要設**，放在 releases 資料夾外面（換版時才不會跟著換掉），例如 `/srv/pepe/data/pepe.db` |
| `ENTRY` | `ddns` | 朋友怎麼連進來：`ddns`＝A（ASUS DDNS＋Caddy）、`tunnel`＝B（Cloudflare Tunnel＋Access） |
| `AUTH` | 開發 `dev`；正式照 `ENTRY`：`ddns`→`firebase`、`tunnel`→`access` | 登入方式。正式環境設 `dev` 會開不起來 |
| `PUBLIC_URL` | 空 | 對外的網址，例如 `https://名字.asuscomm.com`。有設的話，瀏覽器的 WebSocket 一定要從這個網址來 |
| `SERVE_DIST` | 正式 `1`、開發 `0` | 要不要發 `dist/` 的網頁 |
| `DIST_DIR` | `dist/` | 打包好的網頁在哪 |
| `TRUST_PROXY` | 正式 `1`、開發 `0` | 玩家的 IP 從 `X-Forwarded-For`（A）或 `CF-Connecting-IP`（B）拿；限制次數要用 |
| `DEV_OPEN` | `1` | 開發時 `@dev.local` 的帳號不用在邀請名單上。設 `0` 可以在開發時試邀請名單 |
| `SAVE_MAX_KB` | `1024` | 一份存檔最大幾 KB |
| `SNAPSHOT_KEEP` | `20` | 每個人留幾份存檔快照 |
| `SNAPSHOT_GAP_MIN` | `10` | 隔幾分鐘才留一份快照 |
| `SESSION_DAYS` | `30` | 登入多久要重登 |
| `FIREBASE_PROJECT_ID` | 空 | A 用（Firebase 登入還沒做） |
| `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` | 空 | B 用（Access 登入還沒做） |

- 心跳、離開、寬限期這些時間在 `server/config.js` 的最後一段，平常不用動。

## 三、檔案

| 檔 | 做什麼 |
|---|---|
| `main.js` | 入口：讀設定、開伺服器、收到 Ctrl+C／`SIGTERM` 就好好關 |
| `app.js` | 把每一塊接起來（`startServer(cfg)`，測試也用它） |
| `config.js` | 讀環境變數 |
| `db.js` | 開資料庫、跑 `db/` 的搬家、只加不刪的檢查 |
| `store.js` | 所有 SQL：邀請名單、帳號、session、存檔、快照 |
| `auth/` | 登入轉接層：`dev.js`（開發）、`firebase.js`（A，還沒做）、`access.js`（B，還沒做）。都只回傳 `{ email, name }` |
| `api.js` | HTTP API（`/api/…`） |
| `ws.js` | WebSocket 的門口：hello、大小、次數、分給處理函式 |
| `presence.js` | 在線名單：在線／離開／離線、在哪裡、最後上線、隱身 |
| `protocol.js`、`protocol.md` | 訊息格式和限制（程式和說明，兩個一起改） |
| `limits.js` | 限制次數的桶子 |
| `http.js` | 回 JSON、讀 JSON、找 IP、發 `dist/` |
| `invite.js` | 邀請名單的小工具（下面） |

畫面那邊的連線模組是 `web/src/net.js`（用法寫在檔頭）。

## 四、邀請名單

只有名單上的 email 能登入（開發時 `@dev.local` 例外）。拿掉一個人＝標停用，不刪那一列；拿掉之後他手上的 token 下一個請求就失效。

```bash
node server/invite.js list
node server/invite.js add 某人@gmail.com 小明
node server/invite.js disable 某人@gmail.com
# 正式環境：node --env-file=/etc/pepe/pepe.env server/invite.js list
```

B（Access）的時候，Access 的名單也要放一樣的 email（之後可以寫一個小工具同步，規劃.md 第五節）。

## 五、資料庫

- `node:sqlite`，WAL 模式。資料表：`invites`、`accounts`、`sessions`、`saves`、`save_snapshots`、`schema_migrations`。
- email 只在 `invites`、`accounts`。存檔、在線名單只用帳號 `id` 和暱稱。
- session 只存 token 的雜湊（SHA-256），資料庫被看到也拿不到 token。
- **搬家（migration）寫在專案的 `db/`**：
  - 檔名 `四位數編號_說明.sql`，從 `0001` 連著排。**一個檔一次改動**。
  - 開資料庫時照編號跑還沒跑過的，記在 `schema_migrations`（編號、檔名、內容的 SHA-256、時間）。
  - **跑過的檔不能再改**：內容對不上，伺服器就不開。要改就新增下一個編號。
  - **只加不刪**：不准 `DROP`、`RENAME`、`DELETE`（`db.js` 的 `addOnlyProblems`；測試也會檢查 `db/` 每一個檔）。這樣程式退回上一版，舊程式也讀得懂新的資料庫（規劃.md 第五節「資料庫的格式：只加不刪」）。真的要刪或改名，分兩版做，先問翊文。
- 資料庫比程式新（程式退回上一版）也照樣開。

## 六、上 homelab 之前還要做的

步驟本身在 `規劃.md` 第五節：**A0–A8**（「A. ASUS DDNS」那張表）、**B1–B6**（「B. 買網域＋Cloudflare Tunnel＋Access」那張表）、「A 的隔離」、「從 A 換到 B 的步驟」、「自動部署、更新」、「版本和還原」。這裡只列**伺服器這邊**要補的：

| 對到 | 要做的 | 誰 |
|---|---|---|
| A6、A7 | 寫完 `auth/firebase.js`（驗 Firebase 的 ID token），畫面加「用 Google 登入」；`ENTRY=ddns`、`PUBLIC_URL`、`FIREBASE_PROJECT_ID` 填值 | Claude 寫，翊文填值 |
| B3、B4 | 寫完 `auth/access.js`（驗 `Cf-Access-Jwt-Assertion`）；`ENTRY=tunnel`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` 填值 | Claude 寫，翊文填值 |
| A5 | Caddy 設定範本：`名字.asuscomm.com` 反向代理到 `127.0.0.1:8787`（WebSocket 也要轉）；會自己加 `X-Forwarded-For` | Claude 寫範本 |
| B2 | cloudflared 設定範本：`pepe.你的網域` 指到 `http://127.0.0.1:8787` | Claude 寫範本 |
| — | `deploy/` 資料夾：systemd 的 service（`NODE_ENV=production`、`EnvironmentFile=`、`Restart=on-failure`、用專用的使用者）、每天備份 SQLite（`VACUUM INTO` 或 Litestream）、部署前先備份再搬資料表 | Claude 寫範本，翊文裝 |
| — | releases 資料夾和 `current` 連結（保留 5 版、一鍵退回）；`DB_PATH` 放在 releases 外面 | Claude 寫 |
| — | 自動測試「新版的資料庫，上一版的程式也能開」 | Claude 寫 |
| A8、B6 | 上線前測：名單外的被擋、WebSocket 正常、只開該開的 port | 翊文＋Claude |

- AI 不碰正式的伺服器、資料庫、路由器、Proxmox、Cloudflare、Firebase（`AGENTS.md` 第 6 節）。帳號要翊文自己開。

## 七、還沒做

- **伺服器核對**（規劃.md 第五節「規則在哪裡跑」的 B）：現在整份存、不檢查內容。之後改成送「做了什麼」的佇列，伺服器 import `shared/` 重算。
- **正式的登入**：`firebase.js`、`access.js` 現在回 501。
- **還原存檔**：快照有存，還沒有還原的 API 和管理介面。
- **接進遊戲畫面**：`web/src/net.js` 寫好了，還沒有畫面 import 它。
- 邀請、招募、準備區、合作關卡的訊息（`protocol.md` 第四節有預計的名字）。
- 登出所有裝置、管理員介面、告警、遊玩紀錄、排程。
