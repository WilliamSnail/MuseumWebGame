---
日期: 2026-11-22 00:10:00
作者: 數值平衡
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/social/giver.js, shared/social/npcrel.js, shared/npc/givers.js, shared/casino/wallet.js, shared/core/config.js, functions/casino/casino.js, tools/content/givers_pack.cjs, tools/release/copy_shared.cjs, test/social/giver.test.cjs, test/tools/givers_pack.test.cjs, test/load_shared.cjs, test/run_all.cjs]
PR: 無
版本: 2026.11.22
測試: npm test 全過；giver 測試 8 項、打包測試；伺服器端（casino 的 act giver）沒有在模擬器實測；沒有畫面
狀態: 待合併
相關: [docs/規劃/交代人互動_數值和存檔.md, docs/決定/0151-交代人互動：閒聊、熟識度、作息、拜託、送禮.md, docs/維護日誌/2026/11-21_數值平衡_熟識度和好感度共用模組.md]
---

# 交代人互動的伺服器動作（act giver）

## 為什麼要改
決定 0151 的交代人互動：閒聊、來訪、臨時拜託、送禮、交談紀錄。熟識度共用模組（PR 944）已經上線，這次接上伺服器動作，畫面（美術統籌）之後呼叫。

## 改了什麼
- `casino` 的 act `giver`（`d.op`）：`info`（六位現在的樣子、今天的拜託、今天送了幾隻，不動東西）、`tap`（閒聊：前 3 次 +1、第 4 次起不耐煩、壹天最多 8 下）、`visit`（來訪 +1）、`ask`／`askDone`（臨時拜託，接下、做完 +3）、`gift`（送佩佩，從存檔拿走、不退還）、`heard`／`log`（交談紀錄）。
- `shared/social/giver.js`（規則）：臨時拜託用 hash 決定（Lv1～3 出現率 30／35／40%、六位合計 ≤ 2 件、同壹天重整結果壹樣）；送禮反應看五個欄位（稀有度、心情、顏色、帽子、姿勢；失敗作算「失敗作」）：喜歡 +5、普通 +3、不太對 +1；壹位壹天 1 隻、六位合計 3 隻、只能送佩佩和失敗作（修復品不行）、只有壹隻的完美作品或取了名字的擋住；他桌上記最近收到的 3 隻（`house.givers[id].recent`，匿名）；到 Lv3 發稱號 `npc:<id>`。
- 拜託做完的證據：參觀（visit）、吃東西（eat）看伺服器的 `taskAct`；傳話（tell）要今天跟對方閒聊過；其他種類信客戶端（只加熟識度，不給任何東西）。
- 交談紀錄放自己的 Firestore 文件 `casinoNpcLog/{uid}`（`{ v: 1, g: { 交代人: [[天數, 句子 id]] } }`），每位 200 句、壹次最多 10 句、同壹句不重複；伺服器只查格式，不查台詞檔。
- `shared/npc/givers.js`（新，產生的）：`content/givers/*.json` 打包，網頁和伺服器共用；`tools/content/givers_pack.cjs`，`copy_shared.cjs` 會順手跑，npm test 檢查有沒有跟上。
- 錢包多了 `npcDay`（今天送出幾隻）；`NUM.npcRel` 補了閒聊上限、拜託出現率、送禮上限、反應加多少。

## 怎麼確認的
8 項測試：閒聊上限和換日、來訪、拜託（Lv0 不出、合計 ≤ 2、同壹天穩定、接下算數、不能重複、證據）、送禮（反應、拿走壹隻、限制、不給籌碼靈感）、六位 Lv3 稱號進成就和挑得起來、交談紀錄的各種限制。npm test 全過。

## 還沒做、要注意
- `casino` act `giver` 沒有在模擬器實測（opts.save 的存檔寫回、`casinoNpcLog` 交易）。
- 沒有畫面；拜託種類裡的 `casinoCollection`、`cellar`、`read` 等只信客戶端說做完（只有熟識度 +3）。
- 還沒做：旅客好感度的來源（同桌打牌、下地下、送禮、邀請）和德州邀 NPC。
- `today.errand` 是拜託的狀態，`today.ask` 是「拜託」來源的次數（兩個名字不能混，之前撞過壹次）。

## 給下一個人
`npcRelAdd` 的 `src` 次數存在 `today[src]`，所以 `today` 裡自己的欄位不要取跟來源同名。
