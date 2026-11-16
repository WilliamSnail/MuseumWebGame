// 「這次只改內容嗎」的判斷（11-16 每日排程優化二；以前寫在 tools/ship.cjs，現在 ship 和 CI 共用這壹份）
//   isContentFile(檔名)   內容路徑：content/、維護日誌/、.claude/（交接檔，不進遊戲），（公告在 content/notices/），以及
//                         和從 content 打包出來的 shared/npc_roster.js、shared/map_data.js
//   contentOnly(檔案清單) 每個檔案都在內容路徑裡才算；空的清單不算（沒東西就照舊全跑）
//
// （11-16 前半：CI 曾用這裡的判斷跳過最慢的經濟自我檢查；經濟自我檢查改成規則只跑一次、不再慢之後，CI 不再跳過任何測試，
//   好讓部署可以認得「這個 tree 的 CI 是全套跑過的」，見 tools/deploy_gate.cjs。）

const CONTENT_PATH = /^(content\/|維護日誌\/|\.claude\/)|^shared\/(npc_roster|map_data)\.js$/;
const norm = f => String(f || "").split("\\").join("/");
const isContentFile = f => CONTENT_PATH.test(norm(f));
const contentOnly = files => { const f = (files || []).filter(Boolean); return f.length > 0 && f.every(isContentFile); };
module.exports = { CONTENT_PATH, isContentFile, contentOnly };
