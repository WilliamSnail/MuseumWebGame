// ================================================================
//  掌聲和整點鐘聲（11-16，翊文：Pixabay 的掌聲、老掛鐘；檔案和來源在 shared/sfx_files.js）
//  掌聲：展廳評分「跨過」高分門檻、主題展辦完拿到新的壹級、拍賣成交、委託完成、21 點 Blackjack（那個用 applause-cheer）。
//  整點：每個畫面都響；敲的次數＝12 小時制的鐘點（0 點、12 點敲 12 下）。
// ================================================================
export const APPLAUSE = {
  hallScore: 60, // 展廳評分從不到這個分數變成到這個分數，掌聲壹次（壹般展出不響）
  vol: 0.4, // 掌聲音量（Blackjack 的歡呼也用這個）
  aucWords: ["賣出，", "拍到「"], // 拍賣收標的通知句子（shared/casino/auction.js 的 soldLine、wonLine）含這些字＝成交
};
export const CHIME = {
  checkMs: 15000, // 每 15 秒看壹次時間
  maxGapMs: 60000, // 離上次檢查超過這麼久（電腦睡著、分頁被凍住）不補敲
  tickVol: 0.25, strikeVol: 0.35,
  strikeAfterMs: 1500, // 滴答之後多久敲第壹下
  strikeGapMs: 1150, // 每下間隔
};
export const REPAIR_VOL = 0.4; // 維修音效（repair）音量；各畫面直接 sndFile("repair", 0.4)
export const hallApplauseDue = (before, after) => before < APPLAUSE.hallScore && after >= APPLAUSE.hallScore;
export const aucDealDone = notes => (notes || []).some(s => typeof s === "string" && APPLAUSE.aucWords.some(w => s.includes(w)));
// 台灣時間（UTC+8，不看裝置時區）的鐘點 0～23
export const taipeiHour = ms => Math.floor((((ms + 8 * 3600000) % 86400000) + 86400000) % 86400000 / 3600000);
// 剛跨過整點？prevMs＝上一次檢查的時間（沒有＝剛開遊戲，不補敲）
export const chimeDue = (prevMs, nowMs) => prevMs != null && nowMs - prevMs > 0 && nowMs - prevMs <= CHIME.maxGapMs && taipeiHour(prevMs) !== taipeiHour(nowMs);
export const chimeCount = hour => (hour % 12) || 12;
