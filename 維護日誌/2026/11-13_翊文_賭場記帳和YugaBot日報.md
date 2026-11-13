---
日期: 2026-11-13 14:05:23
作者: 翊文
AI: Claude Opus 5.5／Sonnet 5.5（Claude Code）
類型: 平衡
範圍: [shared/casino_book.js, shared/casino_report.js, shared/casino_wallet.js, shared/casino_econ.js, shared/casino_find.js, shared/casino_job.js, shared/config.js, shared/notices.js, functions/casino.js, functions/discord_data.js, web/src/ui_casino.js, web/src/ui_casino_report.js, web/src/css/casino.css, test/casino_book.test.cjs, test/sim_bj_long.cjs, docs/現況.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功；模擬器（第 6 套）兩位玩家各打一輪後叫 report，日報產得出來、沒有「帳對不上」的錯誤；畫面沒有親眼看過
狀態: 待合併
相關: [docs/經濟體系規劃.md, docs/決定/0070-餐車和贏牌抽券改成小賭一把.md, docs/決定/0071-借錢從莊家出.md, docs/決定/0072-賭場記帳：每條動籌碼的路都要記帳，日報每天一份.md]
---

## 為什麼要改

> 「翊文 11-13：要往世界觀的大經濟走，第一步是記帳和財報（docs/經濟體系規劃.md 2.2 節 P0、玩法 1）。沒有人知道錢到底在哪（規劃發現 8），預算池 10 人約 24 天就乾（發現 1）。」

## 改了什麼

- 每一條會動籌碼的路都記到帳上，不改任何賺賠數字。錢包 w.led 記憑空（mint：開場 start、全勤 signWeek、認領 legacy、Discord 綁定 discord、欠款工作補回 work）和消失（burn：換小獎 exchange）；莊家 house.led 記進出（flow：bj、pack、food、loan、loanBack、econWin、econLoot、econSea、job、find）和重開（mint.reset）。規則在 shared/casino_book.js。
- 舊錢包沒有 led：補空的，記帳上線以前的籌碼不補記。
- 日報：伺服器 act report，每天第一個來問的人觸發一次全館快照（readOnly 交易一致讀取所有錢包、莊家、打到一半的注），存 casinoReport/{day}，跟上一份相減就是那段時間的帳；總和對不上開場就 console.error。畫面在賭場「拚經濟」頁籤最下面，海底只給水位公分（NUM.casino.report.seaPerCm）。第一份快照只給現在多少，不寫變多少。
- 新增館方公告「賭場多了 Yuga Bot 日報」。Discord 沒有發。
- 新增 test/casino_book.test.cjs（10 項）：守恆（單人 1500 步、同桌 60 局、亂數一個月 3 人每天走遍每條路，每一步帳都平）、每條路單獨過、逾期被扣在路上也算、重開記 mint.reset、日報不外露海底數字。改壞一條路（全勤簽到改回直接 +=）測試會抓到。
- 新增 test/sim_bj_long.cjs：21 點大樣本模擬（可帶種子、加成）。

## 怎麼確認的

- 21 點高手有沒有穩賺：每格 400 萬手、95% 誤差約 ±0.10%。基本打法：無加成 −0.841%（種子 20261113）、−0.798%（種子 777001）；加最大加成 0.398%（賭徒＋幸運 99）−0.564%。高手（四張牌 17 以下一直要）：無加成 −0.214%、−0.150%（兩個種子合起來 800 萬手，約 −0.18% ±0.07%）；最大加成 +0.048% ±0.100%。四張 ≤16 衝：−0.501%、−0.447%；四張 ≤18 衝：−0.424%、−0.375%（都無加成）。結論：之前 10 萬手看到的 +0.15%～+0.34% 是雜訊。沒有證據顯示穩賺；最強的玩家（賭徒、幸運 99、衝五張）接近打平（+0.05%，誤差範圍含 0）。
- 模擬器：兩位玩家各開禮包、餐車、借款、拚經濟、21 點後叫 report，快照 gap＝0，日報文字正確。
- 沒有親眼看過畫面（拚經濟頁籤下面的日報）：只用既有的 cas-note 等 class，加了 .cas-rpt 兩行 css。

## 還沒做、要注意

- 正式站第一次跑 casinoReport 快照要看 Functions 紀錄（readOnly 交易讀全部錢包、有沒有逾時）。
- 週報還沒做（現在只有日報）；Discord 要翊文同意才發。
- 接下來：門票和莊家稅、景氣指數和政策效果（docs/經濟體系規劃.md 2.6 節）。

## 給下一個人

- 以後任何新的動籌碼的路，一定要用 casMint／casBurn／casHouseMove／casHouseMint，不要直接 w.chips +=；test/casino_book.test.cjs 的亂數一個月測試要把新的路加進去。
- 快照不是剛好 05:00，是當天第一個來問的人的時候；沒人來就拉長（日報會寫「從哪天算起」）。
- 對帳那一行「差 1 枚，原因不明」是劇情梗，真的帳是平的；真正的差額在 casinoReport/{day} 的 gap。
- 起帳的開場總和是第一份快照當起點（opening），記帳以前的籌碼不補記。
