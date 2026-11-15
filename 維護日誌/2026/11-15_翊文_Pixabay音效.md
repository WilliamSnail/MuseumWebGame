---
日期: 2026-11-15 13:42:51
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 新功能
範圍: [web/public/sfx/, shared/sfx_files.js, web/src/fx.js, web/src/ui_core.js, web/src/ui_casino.js, web/src/ui_casino_slot.js, test/sfx_files.test.cjs, test/run_all.cjs, shared/notices.js]
PR: 無
版本: 2026.11.11-1
測試: sfx_files、amb_mix、vite build
狀態: 待合併
相關: []
---

# 加 Pixabay 音效檔（並標來源）

## 為什麼要改
翊文拿掉賭場的沙沙聲後，給了 6 個 Pixabay 下載的音效：「幫我標記來源，不只可以用在賭場」「音訊要壓縮也可以」。

## 改了什麼
- web/public/sfx/：6 個檔，用 ffmpeg 轉單聲道、loudnorm 對齊音量、壓 64～96 kbps（原檔共約 9.7 MB → 約 1.2 MB）。賭場環境錄音 395 秒截 30～120 秒那段、風聲 36 秒，頭尾 3 秒交叉淡入淡出做成可以循環。
- 來源：shared/sfx_files.js（程式用的清單：原名、作者、Pixabay 網址、用在哪）、web/public/sfx/來源.md（人看的表）。test/sfx_files.test.cjs 檢查三邊對得上、程式用到的 id 都有登記、每個檔 < 800 KB。
- web/src/fx.js：fileBuf（用到才 fetch、同檔只抓壹次、失敗安靜）、fileLoop（循環環境音）、fileOnce（環境音裡偶爾播壹次）、FX.sound.file(id, g)（走 sfx 音軌）。ui_core.js 加 sndFile。
- 用在：賭場人聲底（casino-ambiance，跟熱鬧連動，合成 murmur 降到 1.5 墊底）、地下的風（wind，合成風降壹半）、銀行遠處點硬幣（coins-counting，25～50 秒壹次）、借到籌碼（coin-drop）、抽卡包 4 星以上（slot-bonus）、5 星（crowd-cheer）。
- 館方公告壹則，連同 PR 579 拿掉沙沙聲（那次沒加公告）。

## 怎麼確認的
- test/sfx_files.test.cjs、test/amb_mix.test.cjs 過；vite build 有把 sfx 複製進去。耳朵沒聽（測試靜音），音量要翊文聽。

## 還沒做、要注意
- 授權是 Pixabay Content License：遊戲裡用可以、不用標作者；不能把檔案單獨轉發。repo 是公開的，檔案看得到，已在來源.md 寫明出處和授權。
- 音量是估的（casino-ambiance 增益 30 × crowdG、wind 0.35、coins-counting 0.12、單次 0.4～0.45），太大太小改 fx.js 那幾個數字。
- mp3 頭尾有幾十毫秒空白，循環時各跳過 0.05 秒；接縫如果聽得到，改用更長的交叉淡化重轉。

## 給下一個人
- 新音效：檔案進 web/public/sfx（先壓縮）、shared/sfx_files.js 和來源.md 各加壹列，測試會擋漏掉的。
