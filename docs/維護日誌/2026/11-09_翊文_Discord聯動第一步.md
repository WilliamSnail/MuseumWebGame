---
日期: 2026-11-09 19:03:05
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/discord.js, shared/config.js, functions/discord.js, functions/discord_data.js, functions/discord_link.js, functions/discord_config.js, functions/index.js, web/src/ui_discord.js, web/src/css/discord.css, web/src/net_firebase.js, web/src/ui_login.js, tools/discord_fake.cjs, tools/discord_commands.cjs, .github/workflows/discord-commands.yml, test/discord_bot.test.cjs, docs/Discord聯動規劃.md, docs/Firebase做法.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過、npx vite build 成功、模擬器 tools/discord_fake.cjs 50 項全過、瀏覽器看過電腦和手機寬度的「綁定 Discord」和加入連結；正式環境沒測
狀態: 待合併
相關: [docs/決定/0051-Discord聯動.md, docs/Discord聯動規劃.md, docs/Firebase做法.md]
---

## 為什麼要改

> 「可以開始做了（Discord 聯動第一步）」

## 改了什麼

- 新 shared/discord.js：純規則（解析 interaction、綁定碼和加入連結碼、打錯擋、每日加入上限、公開文字、指令清單、網址 join 參數）。NUM.discord 放數字。
- 新 functions/discord.js：discordBot（onRequest）。用 req.rawBody 和 node:crypto 的 ed25519 驗簽名，錯 401、時間戳差 5 分鐘以上也 401、沒設定 503、PING 回 PONG、只收設定的伺服器。八個指令當場讀寫、回覆。
- 新 functions/discord_data.js：綁定、解除、加入的 Firestore 交易。獎勵記在 discordBonus/{uid}（解除不會刪），籌碼直接加進 casinoWallets/{uid}（沒進過賭場的先照 casWalletFix 開錢包）。碼用掉在交易裡標記，並發只有一個人能用。
- 新 functions/discord_link.js：遊戲裡的 discordLinkCode、discordLinkState、discordUnlink。
- functions/index.js 的 join：多收 { code }。沒帶碼完全照舊；帶了有效的碼就建館友、建 invites（source: discord）、綁定、發獎勵。
- 新 functions/discord_config.js：Application ID、Public Key、Guild ID 三個空字串。模擬器才讀測試設定（環境變數或 discordTest/config）。
- 遊戲裡：我的帳號多一列 Discord（web/src/ui_discord.js）。拿碼、倒數、每 4 秒問一次綁好沒；伺服器還沒設定就整列藏起來。網址帶 ?join=碼 時登入後傳給 join，伺服器回了就把參數從網址拿掉。
- 新 tools/discord_commands.cjs 和手動的 discord-commands.yml：註冊 guild commands。--print 不連線。
- 新 tools/discord_fake.cjs：用每次新產生的測試金鑰簽假的 interaction 打模擬器；50 項。
- 測試：test/discord_bot.test.cjs（純規則 22 項；因為 test/discord.test.cjs 已經是公告發到 Discord 那支，所以換了檔名）、test/tools.test.cjs 多 2 項。
- 沒有改 firestore.rules、database.rules.json、firebase.json、任何 workflow（只新增 discord-commands.yml）、任何 casino 檔。

## 怎麼確認的

- node tools/discord_fake.cjs --set 5：50／50。簽名錯、內容被改、沒標頭、時間戳太舊、GET 都擋；PING；別的伺服器；綁定成功、重複用碼、同一個 Discord 再綁、過期碼、錯碼鎖定（第 5 次錯之後連對的碼也不收、碼不被用掉）；Alice 沒進過賭場綁定後錢包 = 開場籌碼 + 100 萬，Bob 先進賭場再綁定 = 原本 + 100 萬、賭場 peek 讀得到；解除、解除再綁、換 Discord 再綁都不再送；未綁定查籌碼；誰在線不列隱身的（連 members 隱身但狀態沒寫離線的也不列）；加入連結成功／碼用過／並發三人搶一個碼只有一個成功／email 沒驗證／停用的人（含 @dev.local）回不來、那個 Discord 帳號不能再用 /pepe-加入／今天名額滿；沒帶碼的 join 照舊；沒設定回 503 而且賭場照常；所有回覆沒有 email、理智、怪癖、靈感；瀏覽器身分讀不到 discord 開頭的集合。
- 瀏覽器（模擬器）：我的帳號拿到碼、倒數，從假 Discord 綁定後畫面自己換成已綁定；解除再綁；手機寬度 375 排版正常；?join=碼 登入後網址只剩 ?user=。
- 回應時間（模擬器，Windows、OneDrive 資料夾，只有這台機器的數字）：第一個請求（冷啟動，要先載入 Functions）5077 ms；之後 54 個請求中位數 48～60 ms、第 90 百分位 84～94 ms、最慢 96 ms。另外直接 import functions/index.js 第一次 4.1 秒、之後 1.3 秒；只載入 options.js 加 Firebase 兩個套件 1.2 秒。所以冷啟動可能超過 3 秒，要在正式環境量。

## 還沒做、要注意

- 正式環境的回應時間還沒量（Discord 要求 3 秒）。冷啟動常超過就要設 minInstances: 1，先查價再問翊文。
- Application ID、Public Key、伺服器 ID 還沒設定（翊文給）：沒設定時 discordBot 回 503、遊戲裡看不到綁定。
- 還沒在真的 Discord 試過，沒部署。Interactions Endpoint URL 要翊文在開發者頁面填。
- 加入連結的 Google 登入（真的 Google、email_verified）只在模擬器的假憑證測過。
- /pepe-排行榜 只讀最近一次 boards/latest（每週一算一次），不是這週目前排名。
- 沒有加公佈欄公告：功能要設定 Discord 才通。要上線通了再加。
- 第二步（遊戲大事發頻道、加入的那則「○○ 加入了博物館」）、第三步沒做。

## 給下一個人

- 新的 shared 檔名字全用 dc／DC 開頭：五個檔接在一起跑，頂層名字不能重複，連沒 export 的也一樣。
- Git Bash 會把指令開頭的 /pepe-… 當路徑改掉；discord_fake.cjs 的 --cmd 開頭不要寫 /。
- 模擬器的 @dev.local 帳號在 join 不用邀請；測加入的守門要用別的網域的帳號（discord_fake.cjs 用 @test.example）。
- join 的 email 要小寫才對得到 invites 的文件。
- casino 檔沒改；如果之後賭場改了錢包的開法（casWalletFix、casWalletNew），discord_data.js 的 bonusWrites 要一起看。
