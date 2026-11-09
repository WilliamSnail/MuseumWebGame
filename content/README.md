# content/：每週劇情的內容（格式）

> 2026-11-09 寫（Claude）。給每週一 04:30、每天 04:30 的排程看，人也可以看。
> 規劃在 `docs/每週劇情.md`；排程每一步怎麼做在 `content/排程說明.md`。
> 遊戲的規則在 `shared/story.js`，畫面在 `web/src/ui_story.js`，檢查程式 `tools/week_check.cjs`（`npm test` 會跑）。
> 格式改了，這份、檢查程式、`shared/story.js` 要一起改。

---

## 一、放在哪裡

```
content/
├─ README.md            ← 這份
├─ 排程說明.md           ← 排程的每一步
├─ 排程設定.json         ← 「這週暫停」（第六節）
├─ story/帳本.json       ← 劇情帳本（第五節）。不打包進網頁
└─ weeks/               ← 網頁只讀這裡的 .json（web/src/ui_story.js 的 import.meta.glob）
   ├─ 2026-W47/         ← 正式週：ISO 週的名字（週一開始）
   │  ├─ week.json      ← 週的設定（週一 04:30 寫）
   │  ├─ d1.json … d7.json ← 一天一個（d1＝週一。那天 04:30 寫）
   │  └─ 靈感來源.md     ← 新聞的連結、取了什麼、為什麼安全（只給審的人看；.md 不進網頁）
   └─ 備用/
      ├─ 常青1/          ← 備用週：week.json＋d1–d7 都寫好（不寫 week、start、date）
      └─ 一天/插曲1.json … ← 備用的一天
```

- **網頁讀什麼**：`content/weeks/**/*.json`。`.md`、`content/story/`、`content/排程設定.json` 都不進網頁。
- **哪一週**：台灣時間週一 05:00 換週。今天（`todayStr()`，05:00 換日）是哪一個 ISO 週，就找那個資料夾。
- **沒有那個資料夾**（排程失敗、這週暫停）：遊戲自己用備用週（`備用/` 裡照週數輪流）。不用另外複製。
- **正式週少了某一天的檔**：那天遊戲自己用備用的一天（照日期挑一個，同一週不重複）。
- **開放時間**：一天的檔照它的日期，那天 05:00 才打開；還沒到的天不會出現（備用週也一樣，照週一往後算）。
- **id**：書、任務、畫、房間的 id 一週裡不能重複（英文、數字、`-`、`_`）。遊戲會在前面加週的名字（`2026-W47/1a`），所以不同週可以用一樣的 id。
- 每週劇情從 `NUM.story.startWeek`（2026-W46）開始；更早的週沒有劇情。

## 二、週的設定：`week.json`

```json
{
  "week": "2026-W47",            // 正式週要寫，跟資料夾一樣（備用週不寫）
  "start": "2026-11-16",         // 這週的週一（備用週不寫）
  "title": "失物招領",            // 16 字以內。公告標題是「本週地下收藏庫：〈標題〉」
  "theme": "給寫的人看的一句話",    // 不上畫面
  "holidayWeek": false,
  "summary": ["…", "…"],         // 2–5 行、每行 60 字以內：不劇透的大綱（只講開頭和氣氛、去哪裡、找什麼）
  "lines": [                     // 這週的劇情線（每本書都要掛在其中一條上；帳本裡要有一樣的 id、名字、種類）
    { "id": "w47-count", "name": "多壹隻", "kind": "week" },     // 這週的線（至少一條）
    { "id": "w47-b1door", "name": "B1 的小門", "kind": "floor" }, // 樓層的新劇情線
    { "id": "main-s1", "name": "第壹季　帳對不上", "kind": "main" } // 主線（跨週用同一個 id、同一個名字）
  ],
  "anomaly": {                   // 本週異狀（地下收藏庫入口的告示）。可以不寫
    "title": "…", "text": ["…"],
    "room": { …一間房間，格式見第四節… }
  },
  "weekly": [ …剛好 5 個每週任務（第四節）… ],
  "weeklyBonus": { "insp": 10, "items": ["mat:金線"] }, // 5 個都做完多給的；週章遊戲自己給
  "ending": { "need": { "read": 6 } },                 // 讀了這週幾本書，週日的結局才打開
  "shop": ["hat-rain", "hat-muff"],                    // 選填：這週兌換所上架哪幾件限定頭飾（第四節「兌換所上架」）。不寫就照週號輪流
  "continues": "2026-W48",       // 選填：這週的線延到下週（週日就可以不放 ending 的書）
  "events": [                    // 選填：這週的限時活動（決定 0041，下面「限時活動」）
    { "id": "double11", "kind": "coopBoost", "date": "2026-11-11", "from": "20:00", "to": "22:00", "title": "…", "words": "…" }
  ]
}
```

- **限時活動 `events`**（台灣時間；規則 `shared/events.js`，數字 `NUM.events`，決定 0041）：`kind` 有 `coopBoost`（合作地下收藏庫：記號對上、猜對、搬回來的靈感變多，活動那天多 1 趟有獎勵）、`casinoBoost`（賭場：活動時間內第一次進賭場多 1 包免費大禮包，每場每人一次）和 `trialBoost`（試煉房間過關的技能成長變多；單人試煉、邀館友一起打的合作試煉都算）。`date` 在這週之內；`from`、`to` 像 `"20:00"`，同一天、`to` 晚於 `from`、不早於 05:00、30～360 分鐘；`title` 16 字、`words` 60 字（畫面上的字，用「壹」）；一週最多 3 場、同一天不重疊、id 不重複；備用週不能寫。壞的會被 `tools/week_check.cjs` 擋；遊戲遇到壞的會直接略過（不丟錯）。大廳、公佈欄、每週劇情面板、Discord 都會自己列出來。怎麼排看 `content/排程說明.md` 的「一之二」。
  - Functions 拿得到同一份：`tools/copy_shared.cjs` 部署前把 `events` 打包進 `functions/shared/events_data.js`（每週劇情合併就會部署）。

- **賭場的每週收藏 `casino`**（決定 0042，規則 `shared/casino_week.js`）：選填，沒有的舊週照常。格式：

  ```json
  "casino": {
    "line": "w46-casino",                    // 這週的哪一條劇情線（要先在 lines 宣告，帳本也要有；沒有書也可以）
    "title": "賭場的招領櫃檯",                 // 14 字以內
    "intro": "…",                              // 60 字以內
    "items": [                                 // 3～5 件（每件就是賭場的一件「財產」）
      { "id": "scarf", "name": "織壹半的圍巾", "desc": "…", "when": { "type": "wins", "n": 3 } },
      { "id": "cup", "name": "還溫的茶杯", "desc": "…", "when": { "type": "meal", "meal": "tea", "n": 1 } }
    ],
    "reward": {                                // 集滿的獎勵：只有這三樣；週章 1 枚由遊戲給，不給靈感
      "title": "招領櫃檯常客",                  // 稱號（12 字以內）
      "souvenir": { "name": "待領的圍巾", "desc": "…" },   // 紀念品（名字 12 字、說明 40 字）
      "story": { "title": "櫃檯上的四張單", "pages": ["…", "…"] }   // 集滿後讀的一小段（1～3 頁，每頁 120 字）
    }
  }
  ```

  - `name` 12 字、`desc` 50 字、畫面上的字用「壹」、過禁用字、不要英文字母。`id` 英文、數字、-、_，這週裡不能重複（包括每天加碼的）。
  - `when.type` 只能從這些挑（`shared/casino_week.js` 的 `CAS_WK_CONDS`；`n` 的上限是一週做得到的範圍）：`wins` 贏幾手（15）、`hands` 打完幾手（30）、`blackjack` 黑傑克（3）、`charlie` 五張過關（2）、`dealerBust` 看荷官爆牌（5）、`push` 平手（5）、`streak` 連贏（5）、`table` 跟館友同桌打完幾手（10，同桌要有 2 個人以上下注）、`packs` 開幾包大禮包（14；每天免費 2 包）、`bigPack` 三星以上的大禮包（3）、`meals` 吃過幾種不同的餐點（6）、`meal` 點過某樣餐點（要寫 `meal`：`chicken`、`tea`、`feast`、`juice`、`admiral`、`sushi`，`n` 最多 3；大禮包券不算餐點）。單人和同桌的「手」都算。
  - 進度、發收藏品、集滿都是伺服器算的（玩家改畫面沒有用）。統計從週一 05:00 累計，週一 05:00 換週。過期的週：拿到的財產留著，沒拿到的就過了，不懲罰。
  - 集滿：這週 `items` 全部拿到（每天加碼的不算）。拿紀念品、稱號；週章 1 枚和故事要玩家按「領」。**不能寫靈感、心情、東西、週章**（檢查程式擋）。
  - 收藏品的說明和集滿的故事要接這週的劇情線、圍繞主旨（像副劇情），帳本 `weeks.<週>.casino` 要記（沒寫會警告）。備用週（`備用/常青1`）寫一組通用的。
  - Functions 拿得到同一份：`tools/copy_shared.cjs` 部署前把每週 `week.json`、`dN.json` 的 `casino` 打包進 `functions/shared/casino_week_data.js`。

- `kind`：`week` 這週的、`floor` 樓層的新劇情線、`main` 主線、`season` 季節線（第八節）、`holiday` 節日、`side` 小插曲（備用的一天用）、`curator` 策展手記（之後）。
- 備用週不放 `main`、`season`、`holiday` 的線（可能在任何一週用到）。`main`、`season` 跨週用同一個 id、同一個名字。
- **每週任務只能指到週一就有的東西**：本週異狀的房間、d1 的書和房間；或用不用指定的種類（`readWeek`、`dailyAll`、`showDays`、`ending`、`cellar`、`make`…）。後面幾天才寫的房間，週一還不存在，檢查會擋。

## 三、一天：`d1.json` … `d7.json`

舉例（備用週「常青1」的第 1 天，`content/weeks/備用/常青1/d1.json`，節錄）：

```json
{
  "day": 1,
  "date": "2026-11-16",          // 正式週要寫：週一往後 day-1 天。備用週不寫
  "holiday": null,               // 節日的接口：寫節日的名字（之後接簽到分支的 holidayOf）
  "board": "失物招領箱出現在 B1；書架多了 2 本書。", // 公佈欄那則公告多的一行（44 字以內；遊戲會在前面加「第 N 天：」）
  "books": [                     // 1–2 本
    { "id": "1a", "line": "lost", "title": "招領箱", "spine": "招領箱", "unlock": { "type": "now" },
      "pages": ["守夜的警衛在值班紀錄上寫：\n「凌晨三點，B1 樓梯口多了壹個木箱。」", "…"] },
    { "id": "1b", "line": "lost", "title": "第壹張招領單", "spine": "招領單", "unlock": { "type": "find", "room": "box" }, "pages": ["…", "…"] }
  ],
  "daily": [                     // 剛好 3 個每日任務
    { "id": "d1a", "kind": "view", "exhibit": "portrait", "reward": { "insp": 2 } },
    { "id": "d1b", "kind": "make", "need": { "顏色": "綠" }, "reward": { "insp": 2 } },
    { "id": "d1c", "kind": "show", "reward": { "mood": 5 } }
  ],
  "dailyBonus": { "items": ["mat:畫布"] },  // 3 個都做完多給的
  "show": {                      // 今日特展：3–5 幅
    "title": "沒人來領的畫", "intro": "招領箱旁邊靠著幾幅畫。畫框背面都貼著「待領」。",
    "works": [
      { "id": "s1a", "art": "frog", "pick": { "顏色": "綠", "心情": "傷心", "姿勢": "坐著" }, "fx": ["sepia"], "frame": "wood",
        "title": "等人來接的佩佩", "lines": ["牠坐得很端正，像是在車站等人。"] },
      { "id": "s1b", "art": "portrait", "variant": 2, "fx": ["faded"], "frame": "gold", "title": "褪色的肖像", "lines": ["…"] },
      { "id": "s1c", "art": "strange", "variant": 1, "fx": ["dark"], "frame": "dark", "san": "0/1D4", "title": "…", "lines": ["…"] }
    ]
  },
  "adds": []                     // 這天加的新東西：0–2 間房間（第四節），通常放在已經過關的樓層
}
```

- **書**：`title` 16 字、`spine`（書背）6 字、`pages` 2–6 頁、每頁 120 字以內（`\n` 換行）。書裡可以寫 `[[字|動作]]`（動作只有 `void`、`mirror`、`window`、`beat`、`hat`、`codex`、`cellar`）、`{圖鑑格數}`。
  - `unlock`：`now` 當天就能讀；`find` 在地下找到某一間（`room`）；`task` 做完某個任務（`task` 寫任務 id，那天以前或這週的）。
  - 週日（d7）放一本 `"ending": true` 的書（不寫 unlock），讀了 `ending.need.read` 本才打開，收這週的線、留一個接下週的線索。
  - 結局要讀的本數，不用走到 B2 以下就讀得到（新玩家也打得開）。
- **每天至少一本書**在這週的 `week` 或 `floor` 線上（接著昨天往下）。
- **線索和看懂**（選填，舊內容照常；規則 `shared/clues.js`，排程怎麼用 `content/排程說明.md` 一之四）：
  - `"clue": "c-xxx"`：加在**書**、**房間**（`adds[]`）、**今日特展的畫**（`show.works[]`）上。id 是 `c-` 開頭、小寫英文、數字、`-`，壹條線索壹個 id、壹個地方。玩家把書讀完、找到房間、看過那幅畫，遊戲就悄悄記下（`P.clues`），沒有任何提示。每日任務、賭場（`casino`）、公佈欄、每週任務旁白**還不能**放 `clue`（遊戲不會算，檢查程式會擋）。備用週、備用的一天也不能。
  - `"understand": [{ "id": "u-xxx", "need": ["c-a", "c-b"], "from": "招領箱的帳", "text": "他沒有離開。……", "hint": "還有壹條在地下 B3" }]`：壹組線索集齊就跳「你看懂了：text」，記進起源室的《看懂的事》（不扣理智、不發作，給 `NUM.story.understandInsp` 靈感，壹件壹次）。`need` 可以放更早幾天、更早幾週的線索，不能放還沒出現的（`npm test` 擋）；`text` 80 字以內、不用寫「你看懂了：」；`from` 24 字以內；`hint` 40 字以內、必填，拿到壹部分線索、還沒集齊時會看到「有件事快看懂了：還差 N 條」加這句；壹條都沒拿到就不顯示。壹天最多 2 件。
  - 玩家拿不到的線索（過了那週還沒找到的房間、沒看的畫）不卡：遊戲只要求還拿得到的。書永遠補讀得到。
- **今天的現實世界 `real`**（選填）：`"real": ["台北有壹場光影展，展到月底。"]`，字串陣列，最多 3 則、每則 50 字以內。只寫查得到來源的真實台灣活動、展覽、節慶（來源記在 `靈感來源.md`，不進這個檔）；沒有就不寫這欄。遊戲裡不顯示，只有 Discord 的 `/pepe-今日活動` 會列。規矩跟新聞一樣（決定 0048），檢查程式會擋禁用字、英文字母；備用的一天不能寫。做法看 `content/排程說明.md` 一之六。
- **賭場加碼 `casino`**（選填，決定 0042）：`"casino": { "item": { id, name, desc, when }, "note": "多壹段話（50 字以內）" }`。`item` 是一件加碼的收藏品（格式跟 week.json 的 casino.items 一樣，id 不能跟這週的重複），那天 05:00 才打開，**不算集滿的條件**；`note` 顯示在賭場的「本週收藏」和每週劇情面板。這週的 week.json 沒有 casino 就不能寫；備用的一天不能寫。
- 錯過的天：書還在、可以補讀；每日任務、今日特展只有當天（做完沒領的這週還能領）。

## 四、固定的種類（只能從這裡挑；新的要寫程式、走一般的 PR）

### 任務（`shared/story.js` 的 `STORY_TASKS`）

| kind | 參數 | 每日／每週 | 畫面上的字（遊戲自己產生） |
|---|---|---|---|
| `make` | `n`、`need`（例如 `{ "顏色": "綠" }`） | 都可以 | 做 1 隻綠色的佩佩 |
| `deliver` | `n` | 都可以 | 交 1 張委託 |
| `fuse` | `n` | 都可以 | 在融合室融合 1 次 |
| `pillow` | `n` | 都可以 | 做 1 個抱枕 |
| `hug` | `n` | 每日 | 抱 1 次抱枕 |
| `view` | `exhibit`（畫廊的展品 id）、`n` | 都可以 | 在畫廊看「普通的佩佩肖像」 |
| `show` | — | 每日 | 看完今日特展「…」（3 幅） |
| `read` | `book`（這週的書 id） | 都可以 | 讀書架上的〈…〉 |
| `cellar` | `floor` | 都可以 | 在地下收藏庫走到 B1 |
| `spot` | `room`（這週的房間 id） | 都可以 | 房間的 `hint`（例如「去 B1 看看那個招領箱」） |
| `readWeek` | `n` | 每週 | 讀這週的書 6 本 |
| `dailyAll` | `n` | 每週 | 每日任務全部做完 3 天 |
| `showDays` | `n` | 每週 | 看完今日特展 3 天 |
| `ending` | — | 每週 | 讀到這週的結局 |

- 每日任務：`n` 最多 2；`make` 的 `need` 只能用一開始就有的選項（紅、綠、開心、傷心、沒有、棒球帽、站著、坐著）；`view` 只能挑不用理智檢定的畫（`portrait`、`rare`）；`cellar` 最多 B2；3 個加起來大約 `NUM.story.dailyMinutes`（12）分鐘以內。
- 不放一定要掉理智的任務。參觀館友、送佩佩、簽到還沒做，先不放。
- **Yuga Bot 交代的任務（選填，每日任務才能寫）**：任務本身還是上面的種類和獎勵，多三個欄位：`"giver": "yuga"`、`"says": "R，我剛想到壹件事。B2 那邊你幫我數壹下。"`（必填，40 字以內，荷官交代的話）、`"done": "R。我就知道。……"`（選填，40 字以內，做完後荷官說壹次）。壹天最多壹個；備用週、備用的壹天不能寫。字母只有「R」（荷官叫玩家的方式）可以寫；「一」要寫「壹」。遊戲裡：每週劇情的任務清單標「Yuga Bot 交代」並顯示 `says`；進賭場時荷官說 `says`（沒做完），做完後進賭場說 `done`（只說壹次，記在存檔 `P.story.said`）；Discord 綁定的人用 `/pepe-籌碼`、`/pepe-21點`、`/pepe-餐車` 時，沒做完就在回覆最後多壹行 `says`（`tools/copy_shared.cjs` 只打包 `says`，不打包任務種類和答案）。**不能在台詞裡寫答案**。
- 每個任務都要有 `reward`。

### 獎勵

- `reward`：`{ "insp": 1–10, "mood": 1–10, "items": [最多 2 樣] }`。週章不要寫：每週任務遊戲自己給 `NUM.story.stampPerTask` 枚，全做完多 `stampAllBonus` 枚。
- 東西（`STORY_ITEMS`）：技能書 `book:偵查`、`book:鑑賞`、`book:神秘學`、`book:幸運`、`book:手工藝`、`book:說服`（用了技能 +1D3，最多 80）；`firstAid` 急救箱（受傷的佩佩全好）；材料 `mat:畫布`、`mat:金箔`、`mat:金線`（收著，在兌換所每 3 份換一枚週章）。領的時候可以「馬上使用」。
- **房間的獎勵可以多寫技能成長**：`{ "insp": 3, "skill": "偵查" }`（只有房間：`adds`、`anomaly.room`）。技能只能寫 `偵查`、`鑑賞`、`神秘學`、`幸運`、`手工藝`、`說服`；加多少是遊戲定的（`NUM.shop.trialSkill`，現在 +1D5，最多到 80），找到房間時給現在這位參觀者。
  - 有技能成長的房間**不能有 `check.type: "none"` 的選項**（不然不挑戰也算過）。
  - 一天最多一間、一週最多 `NUM.shop.weekSkillRooms`（2）間。結局要讀的書不要指到這種房間（要挑戰才過得了）。
- **預算**（`NUM.story`）：一天全部（3 個每日任務＋全做完那份＋那天的書 × `bookInsp`＋那天的房間＋今日特展上限）最多 `dayBudget`（靈感 22、心情 10、東西 1、技能成長 1）；每週任務 5 個＋全做完那份＋本週異狀的房間最多 `weekTaskBudget`（靈感 60、心情 20、東西 3、技能成長 1）。

### 兌換所上架（`week.json` 的 `shop`）

週包可以指定這週賣哪幾件限定頭飾，照這週的主題挑。**只能從下面已經畫好的挑**（`shared/config.js` 的 `LIMITED_ITEMS` 裡 `shop: true` 的）；要新畫的寫提案（`content/排程說明.md` 第六節）。

| id | 名字（草稿） | 適合什麼主題 |
|---|---|---|
| `hat-rain` | 黃雨帽 | 下雨、淹水、颱風前的天氣 |
| `hat-chef` | 廚師帽 | 排隊美食、吃的、夜市 |
| `hat-muff` | 毛耳罩 | 寒流、冬天、噪音 |
| `hat-miner` | 礦工帽 | 挖地下、找東西、停電 |
| `hat-wreath` | 花環 | 春天、賞花、畢業、慶祝 |
| `hat-bow` | 蝴蝶結 | 失物招領、送禮、可愛的東西 |
| `hat-pot` | 鐵鍋帽 | 做菜、搶購、吵吵鬧鬧的週 |
| `hat-paper` | 摺紙帽 | 報紙、書、紙、手作 |

- 寫 1～`NUM.shop.limitedMax`（4）件，不重複。不寫這一欄就照週號輪流（一週 `limitedRotate` 件，大家同一週同一批）；備用週通常不寫。
- 一件 5 枚週章（`LIMITED_ITEMS` 的 `price`）。買到的帽子打開在手作坊，不算進「全部解鎖」。下週沒上架就買不到了，等輪回來或週包再指定。
- 公告會自動多一行「這週上架的限定頭飾：…」，不用自己寫。

### 今日特展的畫（`SHOW_ART`、`SHOW_FX`、`SHOW_FRAMES`；新畫 `svg` 見第九節）

- 一幅畫寫 `art`（舊的畫換參數）或 `svg`（自己畫，第九節），一天 3–5 幅可以混著。**每天至少用 `svg` 畫 1–2 幅全新的。**
- `art`：`frog`（遊戲自己的青蛙，`pick` 寫手作坊的選項：稀有度、心情、顏色、帽子、姿勢、背景、手上拿的東西）、`portrait`、`strange`、`rare`、`statue`、`hidden`（畫廊已經有的畫，`variant` 0–3）。**不畫 Pepe the Frog 的樣子**。
- `fx`（最多 2 個）：`sepia`、`faded`、`dust`、`dark`、`flip`、`water`、`torn`、`shadow`（只剩影子）、`glow`。
- `frame`：`gold`、`dark`、`wood`、`plain`、`ornate`。
- `san`：可怕的才寫，成功一定不扣（`0/1D4`），失敗最多 `NUM.story.showSanMax`（6）點。不寫的就是不可怕的（看了也治好「看壹幅不可怕的畫」的怪癖）。
- 第一次看一幅給 `showInsp` 靈感，一天最多 `showInspDay`。週日旁邊自動有「本週回顧展」。

### 房間（本週異狀、`adds`）

跟 `shared/content3.js` 的 `CELLAR` 一樣的格式，多幾個欄位：

```json
{ "id": "backdoor", "floor": 1, "line": "backdoor",
  "title": "箱子後面的小門", "hint": "去 B1，看看招領箱後面", "intro": "…",
  "lines": ["…", "…"], "mood": "生氣", "color": "綠",
  "choices": [
    { "label": "循著腳印走進去", "check": { "type": "skill", "skill": "偵查", "mod": 0 },
      "success": { "text": "…", "insp": 3 }, "fail": { "text": "…", "san": "1D2" } },
    { "label": "把門整個推開", "check": { "type": "power", "target": 12 }, "success": { … }, "fail": { … } },
    { "label": "從門縫看就好", "check": { "type": "none" }, "success": { "text": "…" } }
  ],
  "reward": { "insp": 3 } }
```

- `hint` 寫成「去 B1 …」：只說去哪裡、做什麼（劇情線的下一步、任務的字都用它）。
- `check.type`：`power`（強度門檻照樓層：B1 11–13、B2 15–16、B3 17–19、B4 19–21、B5 20–23）、`skill`（`mod` -20～20）、`san`（失敗最多 8）、`none`。結果的 `insp` 1–5、`myth` 最多 1、`san` 最多扣 4、`injure: true`。
- 玩家帶 3 隻進去只走這一間；**任何一個選項過了就算找到**（要不扣理智也能找到，就放一個 `none`）。找到時給 `reward`、解開 `unlock.find` 指到這間的書。
- 樓層要走到過（`floor` ≤ 走到的最深＋1）才進得去。結局要的書不要放在 B2 以下。

## 五、劇情帳本：`content/story/帳本.json`

只給寫的人、審的人、排程看，**不打包進網頁**。週一的排程寫之前先讀、寫完同一個 PR 更新；每天的排程也讀。

| 欄位 | 內容 |
|---|---|
| `calendar` | 節日表以外大家會聊的日子（雙 11、情人節……）：`date` 或 `when`、`name`、`idea`（草稿點子）。每天的排程看到就融進今天 |
| `main.depths` | 主旨往深處走的方向（`layers`：一層一個問題、怎麼藏進故事、接到哪；`seasons`：之後幾季的方向）。一季往下挖一層，不下結論，不把問句直接寫進遊戲 |
| `main.theme` | **主線的主旨**（翊文定案，不要改；要改先問翊文）：所有劇情線共同的主軸（沒有就擋）。每週的線、每天的書、季節線都圍繞它（決定 0037） |
| `main.direction`、`main.connects` | 主線的大方向、接到遊戲已經有的故事 |
| `main.seasons[]` | 一季一筆：`season`、`name`、`weeks`、`summary`、`chapters[]`（`week`、`title`、`tell` 每章要交代的事） |
| `lines[]` | 每一條劇情線：`id`、`name`、`kind`、`start`（哪一週開始；主線以外要跟週一樣）、`status`（還沒開始／進行中／收尾了／先放著／備用）、`summary` |
| `foreshadow[]` | 伏筆：`id`、`what`、`planted`、`due`（預計哪一週收，或 `S2` 這種）、`closed`、`note` |
| `characters[]`、`places[]`、`items[]` | 角色（名字、說話的樣子）、地點、物品，避免前後不一樣 |
| `news[]` | 用過的新聞元素（只寫抽象的元素） |
| `seasonal.lines[]` | 季節線一季一條：`id`、`name`、`season`（冬／春／夏／秋）、`year`、`status`、`summary` 或 `direction`、`chapters[]`（第八節） |
| `weeks{}` | 每週一筆：`use`（正式週或 `備用/常青1`）、`main`（這週主線推到哪，正式週一定要寫）、`ties`（這週碰到主軸的哪一點，每天加一行；沒寫只警告）、`news`（這週用的元素）、`casino`（有賭場收藏的週要寫：這週賭場收藏接哪條線、碰到主軸的哪一點） |

## 六、排程設定：`content/排程設定.json`

```json
{ "pause": false, "pauseWeeks": [], "note": "" }
```

- `pause: true`：排程不寫新的週、新的天（遊戲自己用備用週、備用的一天）。
- `pauseWeeks: ["2026-W48"]`：只停那幾週。
- 遊戲不讀這份；排程開始前讀。

## 七、檢查程式擋什麼（`node tools/week_check.cjs`）

- 格式：放的位置、檔名（`week.json`、`d1`–`d7`）、週的名字、`start` 是週一、`date` 對得上、還沒到的天先寫（比遊戲的今天晚超過一天）。
- 字數（第三節的數字）、畫面上的字用「壹」（**不准有「一」**）、禁用字（真實的職位、政黨、人名、災難、傷亡、犯罪、醫療、品牌……，清單在 `tools/week_check.cjs` 的 `BANNED`；選舉、投票、兩岸這類一般的字可以寫）、英文字母（樓層 B1、骰子 1D3 除外）、大括號只准 `{圖鑑格數}`、書裡的動作要存在。
- 任務的種類和參數、每日任務做得完、獎勵的東西存在、不超過預算。
- 賭場收藏（`casino`）：件數 3～5、條件種類和 `n` 的範圍、`meal` 要寫是哪樣、id 不重複、字數、畫面用「壹」、禁用字、英文字母；集滿的獎勵只能有稱號、紀念品、小故事（不能寫靈感、週章）；每天加碼的格式。帳本 weeks 沒寫 `casino` → 警告。
- 房間獎勵的技能成長：只有房間可以、技能要存在、不能有 `none` 的選項、一天和一週的上限。週包的 `shop`：要是陣列、id 要是兌換所賣的、不重複、不超過上限。
- 每本書掛在這週存在的劇情線上；每天至少一本接這週的線；解開的條件指到存在的房間、任務；週日有結局（或 `continues`）；結局新玩家打得開。
- 今日特展的畫法、效果、畫框、理智檢定；`svg` 的標籤、屬性、外部網址、大小、裡面的字（第九節）；那天一幅新畫都沒有 → 警告。房間的強度門檻、技能、理智、`hint` 的寫法。
- 劇情帳本：有 `main.theme`；每條劇情線都在帳本裡、名字和種類一樣（季節線也是）；正式週要寫這週主線推到哪；到期還沒收的伏筆、重複的新聞元素、這週沒寫 `ties`、季節線的章沒寫 `ties`、季節線的章到週日還沒放書 → **警告**（不擋，寫進 PR）。
- 排程設定的格式；`web/src/` 不准讀帳本和排程設定。
- 擋得住的例子都在 `test/week_check.test.cjs`。

## 八、季節線（決定 0037）

- 一年四季各一條線，跨好幾週，大約每兩週一章，接得上當季的節日（`shared/holidays.js` 的 `holidayOf`）。
- **季節照節氣切**：立冬約 11/7 起是冬、立春約 2/4 起是春、立夏約 5/5 起是夏、立秋約 8/7 起是秋（`yearSeason(日期)`）；這週的週一屬於哪一季就算哪一季（`weekSeason(週)`）。節日剛好在換季那週，可以放在新的那一季（2027-W05 的週一還沒立春，除夕 2/5 已經過了，放春天）。
- **是副劇情**：每章從季節和節日的角度碰到主線的東西（同一個帳、同一批人物或地方、同一個謎的另一面），不揭曉主線的謎底、不搶主線的進度。
- **帳本** `seasonal.lines[].chapters[]`：`week`（哪一週）、`title`、`holiday`（當週的節日，可以 `null`）、`tell`（要交代的事）、`ties`（碰到主線的哪一點）、`written`（還沒寫 `null`；寫了放書的 id）。`lines` 也要有這條線（`kind: "season"`，`start` 寫第一章那週）。
- **週包**：那週的 `week.json` 的 `lines` 加 `{ "id": "season-2026-winter", "name": "冬天的明信片", "kind": "season" }`（id、名字跟帳本一樣，好幾週同一個）；某一天放一本 `"line": "season-2026-winter"` 的書，`"unlock": { "type": "now" }`。沒有書的週不用寫這條線。
- **遊戲怎麼算**：好幾週的書算同一條線；書放起源室的「季節」頁籤，過了那週還是可以補讀（不給靈感）；劇情線面板看得到進度和下一步。有更新的一條線（換季）舊的就算走完，收進劇情回顧。**季節線的書不算進結局要讀的本數**：沒讀也不會卡住這週、卡住主線。

## 九、今日特展的新畫：`works[].svg`（翊文：「新的畫廊的話好像只是原本的畫改一點點，之後能不能更加不一樣」）

每幅畫可以帶自己的向量圖，照這週的故事畫。寫成字串，或字串的陣列（接起來，JSON 裡比較好讀）。屬性用單引號，JSON 不用跳脫。例子看 `content/weeks/備用/常青1/`：d1 `s1b`、d3 `s3b`、d6 `s6d`、d7 `s7c`、`s7d`。

```json
{ "id": "s3b", "svg": ["<svg viewBox='0 0 240 300'><defs>…</defs>", "<rect width='240' height='300' fill='url(#w)'/>", "…", "</svg>"],
  "fx": [], "frame": "dark", "san": "0/1D4", "title": "門縫後面", "lines": ["門縫很窄，只看得到壹點點光。", "光的旁邊，有東西眨了壹下。"] }
```

### 不能畫什麼

- **不畫 Pepe the Frog 的樣子，也不畫青蛙或任何像 Pepe 的角色**。新的畫以**場景、物品、抽象、光影**為主。要青蛙就用 `art: "frog"`（遊戲自己的青蛙）。
- 不下載、不描別人的圖；不用真實的品牌標誌；不畫真人。

### 規矩（`shared/story.js` 的 `sanitizeSvg`：檢查程式擋，畫面也會再淨化一次）

- 只准這些標籤（`SVG_TAGS`）：`svg`、`g`、`defs`、`path`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon`、`text`、`tspan`、`title`、`desc`、`linearGradient`、`radialGradient`、`stop`、`clipPath`、`mask`、`pattern`、`use`，還有 `filter` 和裡面的 `feGaussianBlur`、`feTurbulence`、`feDisplacementMap`、`feColorMatrix`、`feComponentTransfer`、`feFuncR/G/B/A`、`feBlend`、`feComposite`、`feMerge`、`feMergeNode`、`feOffset`、`feFlood`、`feDropShadow`。
- 屬性也有白名單（`SVG_ATTRS`：幾何、顏色、線條、字型、漸層、濾鏡）。**不准**：`script`、`foreignObject`、`image`、`a`、`style`（標籤和屬性都不准，顏色直接寫在屬性上）、`class`、`on` 開頭的事件、外部網址、註解、CDATA。
- `url()` 和 `href` 只能連到這幅畫裡面的 `#id`（`use`、漸層、`pattern` 才能有 `href`），id 要存在、不能重複。id 不用怕跟別幅撞到：畫面會加前綴。
- 最外面一個 `<svg>`，要有 `viewBox`（建議 `0 0 240 300`，跟畫廊的畫一樣直的）。`width`、`height` 會拿掉，大小由畫框決定。
- **一幅最多 `NUM.story.showSvgKB`（12）KB。**
- 畫裡的字（`text`、`tspan`、`title`、`desc`）也算遊戲文字：用「壹」、過禁用字、不要英文字母，一段 40 字以內；`&` 只准 `&amp;` `&lt;` `&gt;`。字會讀得很小，少放。
- 有哪裡不合，整幅都不畫（畫面改放空白的佔位），所以一定要過 `npm test`。

### 畫風（給排程看）

這間博物館的畫要有**不安感和手繪感**：暗色、羊皮紙色，像油畫或版畫。

- **一幅一個清楚的主題**：一眼看得出畫的是什麼（一個箱子、一扇門、一本帳本），再讓人覺得哪裡不對。不要只是幾何圖形堆疊。
- **同一天的幾幅彼此要明顯不同**：構圖、顏色、題材都換（一幅場景、一幅物品、一幅抽象）。
- **跟這週的故事有關**，說明牌（`lines`）跟畫的東西要對得上。
- 手繪感三個小技巧（`常青1` 的畫都這樣）：
  - 線條抖一點：`<filter id='r'><feTurbulence type='fractalNoise' baseFrequency='.03' numOctaves='3' seed='4' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='5' xChannelSelector='R' yChannelSelector='G'/></filter>`，整組形狀放進 `<g filter='url(#r)'>`。`seed` 每幅換。
  - 畫布的顆粒：最上面蓋一張 `<rect width='240' height='300' filter='url(#n)'/>`，`n` 是 `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' seed='8' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .16 0 0 0 0 .11 0 0 0 0 .06 0 0 0 .5 -.16'/></filter>`。
  - 四邊暗下來：`radialGradient` 中間透明、邊上接近黑（`stop-opacity` .86）。

三種寫法的例子：

1. **漸層背景＋剪影**（`常青1` d1 `s1b`「沒人來領的箱子」）：`radialGradient` 當燈光和牆，物品用深色 `path` 剪出來，只有燈下那一小塊有顏色。
2. **用 path 畫的房間**（d3 `s3b`「門縫後面」）：牆、地板的透視線、門框、門板都是 `path`；最亮的只有門縫和地上那道光，門縫裡站著一個看不清楚的影子。
3. **抽象的冷風**（d7 `s7d`「風把招領單吹走了」）：深藍底，幾條又粗又抖的 `path`（`stroke` 用漸層、兩頭透明），再疊一層 `feGaussianBlur` 的霧；紙片越遠越小。

新畫要照這個順序確認：`npm test` 過（`tools/week_check.cjs` 擋不准的東西）。**檢查不看畫得好不好、像不像青蛙**：那是寫的人自己要守的。

## 預約公告

今日館訊（早上八點半左右）和限時活動開跑是自動發的，不用寫在這裡（決定 0045）。

`公告排程.json`：指定幾點發到 Discord，時間是台灣時間。改完跑 `npm run announce:sync`，開 PR 合併之後才生效。AI 只有翊文要求時才排。工作流程只在每則公告的時間跑，GitHub 的定時可能晚幾分鐘，尖峰時更晚；到點和 20 分鐘後各跑一次，過了 6 小時就不發。

## 每週任務的旁白

每週任務底下可以多一句話（40 字以內，選填，決定 0048）：`week.json` 的 `weekly[].words`，或當天 `dN.json` 的 `weeklyWords: [{ task, words }]`（晚的蓋掉早的，一天最多 2 句）。寫法看 `排程說明.md` 一之四。
