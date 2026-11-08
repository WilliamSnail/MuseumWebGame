# 伺服器的訊息格式（協定第 1 版）

> 2026-11-08，Claude 寫。之後的邀請、招募、合作關卡都照這份加。
> 改這份要一起改：`server/protocol.js`（欄位、限制、關閉碼）、`web/src/net.js`（畫面那邊）、`test/server.test.mjs`。

---

## 一、總則

- 網頁和伺服器是**同一個網址**：開發時 Vite（5173）把 `/api`、`/ws` 轉到伺服器（8787）；正式環境是 Caddy 或 cloudflared 轉過來。
- 兩條路：
  - **HTTP API**（`/api/…`）：要「一問一答」的事。登入、存檔、改設定。
  - **WebSocket**（`/ws`）：要「伺服器主動通知」的事。在線名單；之後的邀請、招募、合作關卡。
- 都用 **JSON**、UTF-8。
- **登入憑證**：`POST /api/login` 拿到 `token`。
  - HTTP：每個請求帶 header `Authorization: Bearer <token>`。
  - WebSocket：連上之後第一則訊息 `hello` 帶 `token`。
  - 不放在網址裡（網址會留在紀錄裡）。不用 cookie（別的網站沒辦法替玩家送請求）。
- **不給 email**：在線名單、別人看得到的東西只有帳號 `id` 和暱稱 `nick`。只有 `/api/me` 會回自己的 email。
- **玩家打的字一律當純文字**：暱稱（之後還有留言）顯示時用 `textContent`，不要塞進 `innerHTML`。
- **時間**一律是 ISO 字串（UTC），例如 `"2026-11-08T13:18:50.489Z"`。

---

## 二、HTTP API

錯誤一律回：

```json
{ "error": "代號", "msg": "給人看的話" }
```

| 狀態碼 | 代號 | 什麼時候 |
|---|---|---|
| 400 | `bad_json`、`bad_save`、`need_rev`、`bad_nick`、`bad_field`、`need_name`、`bad_name` | 格式不對 |
| 401 | `need_login` | 沒帶 token、token 不對或過期、名單上被拿掉了 |
| 403 | `not_invited`、`disabled`、`dev_off` | 不在邀請名單上、帳號停用、正式環境用開發登入 |
| 404／405 | `not_found`、`bad_method` | 沒有這條、方法不對 |
| 409 | `conflict` | 存檔：別的分頁或裝置先存了（多回 `rev`） |
| 413 | `too_big` | 太大（存檔預設 1 MB，其他 4 KB） |
| 415 | `need_json` | 有 body 卻不是 `Content-Type: application/json` |
| 429 | `rate_limited` | 太快（每個 IP 每秒約 2 次；登入每分鐘約 10 次；存檔每分鐘約 20 次） |
| 501 | `not_ready` | 這種登入還沒做（Firebase、Access） |

### `GET /api/health`（不用登入）

```json
{ "ok": true, "version": "2026.11.08-1", "auth": "dev", "entry": "ddns", "uptimeSec": 12 }
```

- `auth`：畫面看這個決定登入畫面長怎樣（`dev`＝打名字、`firebase`＝「用 Google 登入」、`access`＝不用登入畫面）。

### `POST /api/login`

送什麼看登入方式（`server/auth/`）：

| 登入方式 | 送什麼 |
|---|---|
| `dev`（只有開發時） | body `{ "name": "小明" }`；或網址 `?user=小明`；或 header `X-Dev-User`（中文要 `encodeURIComponent`） |
| `firebase`（A，還沒做） | body `{ "idToken": "<Firebase 的 ID token>" }` |
| `access`（B，還沒做） | 不用送；Cloudflare Access 會加 header `Cf-Access-Jwt-Assertion` |

回：

```json
{ "token": "…", "expiresAt": "2026-12-08T…", "me": { "id": 1, "nick": "小明", "email": "小明@dev.local", "invisible": false, "createdAt": "…" } }
```

- 第一次登入就建帳號，暱稱先用登入帶來的名字。
- token 預設 30 天（`SESSION_DAYS`）。

### `POST /api/logout`

- 讓這個 token 失效。回 `{ "ok": true }`。

### `GET /api/me`、`PUT /api/me`

- `GET` 回跟登入時一樣的 `me`。
- `PUT` 送 `{ "nick"?: "新暱稱", "invisible"?: true }`，回新的 `me`。
  - 暱稱 1–12 個字，不能有看不見的字（控制字元、零寬空白）。
  - 隱身：別人的名單上你是離線；改了馬上重送名單給大家。

### `GET /api/save`

```json
{ "data": { …整份 SAVE… }, "rev": 5, "updatedAt": "…" }
```

- 還沒存過：`data` 是 `null`、`rev` 是 `0`。

### `PUT /api/save`

送：

```json
{ "data": { …整份 SAVE… }, "baseRev": 5 }
```

- `baseRev`：上次讀到或存好的 `rev`（第一次是 0）。對不上回 409 `conflict`（多回現在的 `rev`）：畫面要重新讀，以伺服器為準。
- 存好回 `{ "rev": 6, "updatedAt": "…" }`。
- 被蓋掉的那一份會留成快照（隔 `SNAPSHOT_GAP_MIN` 分鐘以上才留一份，每個人只留最近 `SNAPSHOT_KEEP` 份），之後還原用。
- 現在是**整份存、不核對**。伺服器核對（規劃.md 第五節「規則在哪裡跑」的 B）之後再做，那時會改成送「做了什麼」的佇列。

---

## 三、WebSocket（`/ws`）

### 每一則訊息

```json
{ "t": "種類", "id": "可以不帶", "...": "其他欄位" }
```

- `t`：訊息種類（必填）。
- `id`：畫面自己編的號碼（32 字以內的字串，或 0 以上的整數）。伺服器回錯誤時用 `re` 帶回來，畫面才知道是哪一則錯了。之後要「一問一答」的訊息（例如邀請）也用它。
- 只收文字（JSON），不收二進位。

### 限制（`server/protocol.js` 的 `LIMITS`）

| 限制 | 多少 | 超過會怎樣 |
|---|---|---|
| 一則多大 | 4 KB | 直接斷線（1009） |
| 送多快 | 一口氣 20 則，之後每秒 2 則 | 回 `error`（`rate_limited`），那則丟掉 |
| 送錯幾次 | 10 次（格式錯、太快都算） | 斷線（4008） |
| 同一個帳號幾條 | 5 條（5 個分頁） | 新的那條斷線（4009） |
| 整台伺服器幾條 | 200 條 | 連不上（503） |
| 每個 IP 連幾次 | 一口氣 30 次，之後每秒 1 次 | 連不上（429） |

### 流程

1. 連上 `/ws`。
2. **5 秒內**送 `hello`。沒送斷線（4002）；先送別的斷線（4001）。
3. 伺服器回 `welcome`（含整份名單）。之後算「在線」。
4. 每 `beatEvery` 毫秒（20 秒）送一次 `beat`。**60 秒沒收到任何訊息**算離線，斷線（4010）。
5. 換房間送 `where`。
6. 名單有變，伺服器送 `roster`（整份）。

### 畫面 → 伺服器

| `t` | 欄位 | 意思 |
|---|---|---|
| `hello` | `token`（登入拿到的）、`v`（協定版本，現在是 `1`） | 打招呼、登入 |
| `beat` | `active`?（布林：上一次心跳之後有沒有動過滑鼠、鍵盤） | 心跳。`active: true` 會把「離開」變回「在線」 |
| `where` | `room`（房間代號） | 我在哪裡 |

- 房間代號：小寫英文開頭，後面可以是英文、數字、`_`、`-`、`:`，最多 32 字。例如 `lobby`、`gallery`、`cellar:b2`。顯示成「在畫廊」由畫面自己翻（`NAV_ROOMS`）。

### 伺服器 → 畫面

**`welcome`**（hello 通過之後）：

```json
{ "t": "welcome", "v": 1,
  "me": { "id": 1, "nick": "小明", "invisible": false },
  "beatEvery": 20000,
  "limits": { "maxBytes": 4096, "burst": 20, "perSec": 2 },
  "roster": [ …同 roster 的 players… ],
  "at": "…" }
```

**`roster`**（名單有變；每個人收到的「自己」那一列不一樣）：

```json
{ "t": "roster", "at": "…", "players": [
  { "id": 1, "nick": "小明", "status": "online", "room": "gallery", "lastSeen": null, "me": true, "invisible": false },
  { "id": 2, "nick": "小華", "status": "offline", "room": null, "lastSeen": "2026-11-08T12:00:00.000Z" }
] }
```

- `status`：
  - `online`：在線。
  - `away`：離開。連著，但 5 分鐘沒動（沒有 `where`、沒有 `active: true` 的 `beat`）。
  - `offline`：離線。看 `lastSeen`（最後上線）。
- `room`：在線、離開時才有。
- 名單是**館裡每一個人**（邀請制，10 人左右），包含離線的。
- **隱身**的人：別人看到 `offline`、沒有 `room`，`lastSeen` 停在變隱身的那一刻；自己那一列看得到真的狀態和 `invisible: true`。
- 斷線後等 5 秒才算離線（重新整理頁面不會閃一下）。
- 「小明上線了」的提示由畫面比對前後兩份名單（`web/src/net.js` 的 `arrive`、`leave` 事件）。

**`error`**：

```json
{ "t": "error", "code": "bad_message", "msg": "room 的格式不對", "re": 7 }
```

| `code` | 什麼時候 |
|---|---|
| `bad_json` | 不是 JSON |
| `bad_message` | 種類不認得、少欄位、欄位格式不對、送了二進位 |
| `rate_limited` | 送太快 |
| `already_hello` | 已經 hello 過又送 |
| `unknown_type` | 協定裡有這種，但伺服器還沒接上處理 |
| `server_error` | 伺服器自己出錯 |

### 關閉碼（`server/protocol.js` 的 `CLOSE`）

| 碼 | 意思 | 畫面要不要自己重連 |
|---|---|---|
| 1000 | 正常關閉 | 不要 |
| 1001 | 伺服器重開（部署、重開機） | 要 |
| 1006 | 網路斷了（沒有關閉碼） | 要 |
| 1009 | 一則太大 | 要（但這是畫面的錯） |
| 4000 | 協定版本不對、格式錯 | 不要（重新整理拿新版） |
| 4001 | 沒登入、登入過期 | 不要，回登入畫面 |
| 4002 | 連上太久沒 hello | 要 |
| 4003 | 不在邀請名單上、帳號停用 | 不要，回登入畫面 |
| 4008 | 送太多、送錯太多次 | 要（會慢慢重連） |
| 4009 | 同一個帳號開太多條 | 不要 |
| 4010 | 太久沒心跳 | 要 |

- 重連：1、2、4、8……秒，最多 30 秒，每次再乘 0.5–1 的亂數（伺服器重開時大家不會同時擠回來）。網路恢復、分頁切回來時馬上試一次。

---

## 四、之後要加的訊息怎麼加

1. 在 `server/protocol.js` 的 `CLIENT_MESSAGES` 加一種，寫好欄位的型別（`FIELD` 不夠就加一種，例如限長度的字串）。
2. 在 `server/app.js` 用 `gateway.on("種類", (conn, msg) => …)` 接上處理函式（`conn.account` 是誰送的）。邏輯放在自己的檔，例如 `server/party.js`。
3. 伺服器主動送的，用 `gateway.send(conn, { t: "…" })`；要給某個人，從 `presence` 找他的連線。
4. 畫面用 `NET.send({ t: "…", id })` 送，`NET.on("message", m => …)` 收。
5. 這份文件加一列，測試加一項。
6. **規則不要寫在 server/**：擲骰、結算照舊寫在 `shared/`（純函式、用 `RNG()`），伺服器 import 同一份來跑。

**預計的訊息**（還沒做，名字先占著；規劃.md 第三節「找人一起打」「合作關卡」）：

| `t` | 方向 | 做什麼 |
|---|---|---|
| `invite` | 畫面 → 伺服器 | 邀請某人打某一關（`to`、`stage`、`level`）；對方不在線就變成信箱的信 |
| `invited` | 伺服器 → 畫面 | 收到邀請（誰、哪一關、60 秒倒數） |
| `invite_reply` | 畫面 → 伺服器 | 接受／婉拒（`re` 是邀請的 id） |
| `recruit`、`recruits` | 雙向 | 招募看板：開一隊、看現在有哪些隊 |
| `sos` | 畫面 → 伺服器 | 打到一半求救 |
| `party`、`party_update` | 雙向 | 準備區：隊員、帶的佩佩、打勾、出發、請人離開 |
| `coop_*` | 雙向 | 合作關卡：投票、伺服器擲的骰子、結果、斷線 60 秒內回來接著打 |
| `shout` | 畫面 → 伺服器 | 快速短句、佩佩叫聲（不給自由打字；理智低會變形，由伺服器照 `shared/` 的規則變） |

- 合作關卡的狀態全部放在伺服器，伺服器擲骰、伺服器決定結果（規劃.md 第三節「技術」）。
- 協定改成不相容的寫法時，`PROTOCOL_VERSION` 加 1；舊的畫面會被 4000 擋下、提示重新整理。
