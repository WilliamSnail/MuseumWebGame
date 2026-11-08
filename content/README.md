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
  "continues": "2026-W48"        // 選填：這週的線延到下週（週日就可以不放 ending 的書）
}
```

- `kind`：`week` 這週的、`floor` 樓層的新劇情線、`main` 主線、`holiday` 節日、`side` 小插曲（備用的一天用）、`curator` 策展手記（之後）。
- 備用週不放 `main`、`holiday` 的線（可能在任何一週用到）。
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
- 每個任務都要有 `reward`。

### 獎勵

- `reward`：`{ "insp": 1–10, "mood": 1–10, "items": [最多 2 樣] }`。週章不要寫：每週任務遊戲自己給 `NUM.story.stampPerTask` 枚，全做完多 `stampAllBonus` 枚。
- 東西（`STORY_ITEMS`）：技能書 `book:偵查`、`book:鑑賞`、`book:神秘學`、`book:幸運`、`book:手工藝`、`book:說服`（用了技能 +1D3，最多 80）；`firstAid` 急救箱（受傷的佩佩全好）；材料 `mat:畫布`、`mat:金箔`、`mat:金線`（收著，之後兌換所用）。領的時候可以「馬上使用」。
- **預算**（`NUM.story`）：一天全部（3 個每日任務＋全做完那份＋那天的書 × `bookInsp`＋那天的房間＋今日特展上限）最多 `dayBudget`（靈感 22、心情 10、東西 1）；每週任務 5 個＋全做完那份＋本週異狀的房間最多 `weekTaskBudget`（靈感 60、心情 20、東西 3）。

### 今日特展的畫（`SHOW_ART`、`SHOW_FX`、`SHOW_FRAMES`）

- `art`：`frog`（遊戲自己的青蛙，`pick` 寫手作坊的選項：稀有度、心情、顏色、帽子、姿勢、背景、手上拿的東西）、`portrait`、`strange`、`rare`、`statue`、`hidden`（畫廊已經有的畫，`variant` 0–3）。**不畫 Pepe the Frog 的樣子**；要新的畫法得改 `web/src/art.js`，走一般的 PR。
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
| `main.direction`、`main.connects` | 主線的大方向、接到遊戲已經有的故事 |
| `main.seasons[]` | 一季一筆：`season`、`name`、`weeks`、`summary`、`chapters[]`（`week`、`title`、`tell` 每章要交代的事） |
| `lines[]` | 每一條劇情線：`id`、`name`、`kind`、`start`（哪一週開始；主線以外要跟週一樣）、`status`（還沒開始／進行中／收尾了／先放著／備用）、`summary` |
| `foreshadow[]` | 伏筆：`id`、`what`、`planted`、`due`（預計哪一週收，或 `S2` 這種）、`closed`、`note` |
| `characters[]`、`places[]`、`items[]` | 角色（名字、說話的樣子）、地點、物品，避免前後不一樣 |
| `news[]` | 用過的新聞元素（只寫抽象的元素） |
| `weeks{}` | 每週一筆：`use`（正式週或 `備用/常青1`）、`main`（這週主線推到哪，正式週一定要寫）、`news`（這週用的元素） |

## 六、排程設定：`content/排程設定.json`

```json
{ "pause": false, "pauseWeeks": [], "note": "" }
```

- `pause: true`：排程不寫新的週、新的天（遊戲自己用備用週、備用的一天）。
- `pauseWeeks: ["2026-W48"]`：只停那幾週。
- 遊戲不讀這份；排程開始前讀。

## 七、檢查程式擋什麼（`node tools/week_check.cjs`）

- 格式：放的位置、檔名（`week.json`、`d1`–`d7`）、週的名字、`start` 是週一、`date` 對得上、還沒到的天先寫（比遊戲的今天晚超過一天）。
- 字數（第三節的數字）、畫面上的字用「壹」（**不准有「一」**）、禁用字（政治、選舉、兩岸、戰爭、宗教、災難、傷亡、犯罪、醫療、品牌……）、英文字母（樓層 B1、骰子 1D3 除外）、大括號只准 `{圖鑑格數}`、書裡的動作要存在。
- 任務的種類和參數、每日任務做得完、獎勵的東西存在、不超過預算。
- 每本書掛在這週存在的劇情線上；每天至少一本接這週的線；解開的條件指到存在的房間、任務；週日有結局（或 `continues`）；結局新玩家打得開。
- 今日特展的畫法、效果、畫框、理智檢定；房間的強度門檻、技能、理智、`hint` 的寫法。
- 劇情帳本：每條劇情線都在帳本裡、名字和種類一樣；正式週要寫這週主線推到哪；到期還沒收的伏筆、重複的新聞元素 → **警告**（不擋，寫進 PR）。
- 排程設定的格式；`web/src/` 不准讀帳本和排程設定。
- 擋得住的例子都在 `test/week_check.test.cjs`。
