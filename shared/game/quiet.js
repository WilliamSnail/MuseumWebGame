// ================================================================
//  這個分頁要不要靜音（11-28，翊文：「有個 session 沒用靜音」「這個不是跟 Super Intendent 討論過開完要關閉的嗎」→ 改成程式擋）
//  純函式：給網頁的 boot.js 用，不碰 DOM（網址和瀏覽器的旗標由呼叫的人傳進來）。
//  靜音的情況（網址有 sound 就都不靜音，例如 ?sound、&sound、#lobby&sound）：
//    開發版（npm run dev）壹律靜音：AI 開預覽面板常常先開根網址，以前只有 #畫面、?user= 才靜音，根網址會放大廳音樂（11-21、11-28 各發生壹次）。
//    自動化瀏覽器（navigator.webdriver，Playwright、無頭瀏覽器都會帶）：連正式版也靜音（AI 合併後會打開正式版看壹下）。
//  布幕（進館的門）還是照舊：只有 #畫面、?user= 才跳過（boot.js 的 UI.testMute），根網址照常有門。
// ================================================================
export function tabQuiet(o) {
  const x = o && typeof o === "object" ? o : {};
  const url = String(x.search || "") + String(x.hash || "");
  if (/[?&#]sound\b/.test(url)) return false;
  return !!x.dev || !!x.webdriver;
}
