// ================================================================
//  音效檔清單（11-15，翊文從 Pixabay 下載給的；「不只可以用在賭場」）
//  檔案在 web/public/sfx/<id>.mp3（已壓縮：單聲道、音量對齊；環境音頭尾做成接得起來的循環）。
//  播法：畫面用 ui_core.js 的 sndFile(id, 音量)；環境音在 web/src/fx.js 用 fileLoop／fileOnce。
//  授權：Pixabay Content License（https://pixabay.com/service/license-summary/）：可以免費用在遊戲裡、可以改、不用標作者；
//    不能把檔案單獨拿去賣或轉發。我們還是每個都標來源（翊文要求），人看的版本在 web/public/sfx/來源.md。
//  新增檔案：放進 web/public/sfx、這裡加壹列、來源.md 加壹列（test/sfx_files.test.cjs 會檢查三邊對得上）。
// ================================================================
export const SFX_FILES = {
  "casino-ambiance": { name: "Casino Ambiance", by: "freesound_community", url: "https://pixabay.com/sound-effects/casino-ambiance-19130/", loop: true, use: "賭場人聲底（跟熱鬧連動）" },
  "wind": { name: "Wind blowing sfx", by: "JCI-21", url: "https://pixabay.com/sound-effects/wind-blowing-sfx-12809/", loop: true, use: "地下收藏庫的風" },
  "coins-counting": { name: "Coins Counting", by: "yuliana-yurukova", url: "https://pixabay.com/sound-effects/coins-counting-275779/", use: "銀行遠處點硬幣" },
  "coin-payout": { name: "Coin Payout 25", by: "floraphonic", url: "https://pixabay.com/sound-effects/coin-payout-25-213587/", use: "銀行提出、借錢、賣股票（錢回到手上）" },
  "coin-payout-big": { name: "Wood Surface Multi Coin Payout Loop 1", by: "floraphonic", url: "https://pixabay.com/sound-effects/wood-surface-multi-coin-payout-loop-1-215433/", use: "銀行定存解約、館債贖回、平倉（大筆錢回到手上）" },
  "i-see-money": { name: "i see money（截前 4.5 秒）", by: "Shelvis_makes_games", url: "https://pixabay.com/sound-effects/i-see-money-181273/", use: "開大禮包（拉霸開始轉）" },
  "cha-ching": { name: "Cashier \"ka-ching\" sound effect", by: "u_byub5wd934", url: "https://pixabay.com/sound-effects/cashier-quotka-chingquot-sound-effect-129698/", use: "銀行還錢、賣股還債" },
  "you-have-money": { name: "You have money", by: "RussWazHere3000", url: "https://pixabay.com/sound-effects/you-have-money-206821/", use: "開大禮包開到 2 星以上" },
  "coin-drop": { name: "Coin Drop In Slot 2 SFX", by: "BFCMUSIC", url: "https://pixabay.com/sound-effects/coin-drop-in-slot-2-sfx-330553/", use: "賭場借到籌碼；銀行存入、定存、買館債、買股票、開槓桿（錢放進去）" },
  "slot-bonus": { name: "Playful Casino Slot Machine Bonus 2", by: "floraphonic", url: "https://pixabay.com/sound-effects/playful-casino-slot-machine-bonus-2-183919/", use: "抽卡包 4 星以上" },
  "crowd-cheer": { name: "crowd cheering", by: "DennisH18", url: "https://pixabay.com/sound-effects/crowd-cheering-143103/", use: "抽卡包 5 星" },
};
export const SFX_LICENSE = "Pixabay Content License";
