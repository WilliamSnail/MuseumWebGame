// ================================================================
//  手機轉橫的提示（11-09，翊文：「手機介面改成橫向操作好了」，決定 0043）。純規則，不碰畫面。
//  畫面在 web/src/ui_orient.js、web/src/css/landscape.css；測試在 test/orient.test.cjs。
//  「先用直的」記在這台裝置（localStorage），不進存檔、不上傳；所以這裡的函式都收一個 storage 進來，不自己去拿。
// ================================================================

export const ORIENT_SKIP_KEY = "pepe_orient_skip"

// 這台裝置按過「先用直的」嗎？storage 壞掉（無痕、被擋）就看 mem（只記在這次）
export function readOrientSkip(storage, mem) {
  try { return storage.getItem(ORIENT_SKIP_KEY) === "1"; }
  catch (e) { return !!mem; }
}

// 記下（on）或拿掉（!on）「先用直的」。回傳有沒有真的寫進裝置
export function writeOrientSkip(storage, on) {
  try {
    if (on) storage.setItem(ORIENT_SKIP_KEY, "1"); else storage.removeItem(ORIENT_SKIP_KEY);
    return true;
  } catch (e) { return false; }
}

// Android 全螢幕或裝成 App 才鎖得住方向；iPhone 的 Safari 沒有這個功能。試一次，失敗就算了，不丟錯、不強制全螢幕。
// scr：window.screen；coarse：是不是手指操作（pointer: coarse）。
// 回傳："no-touch"（電腦、不試）、"no-api"（沒有 lock）、"asked"（有問了，結果不管）
export function askLandscapeLock(scr, coarse) {
  if (!coarse) return "no-touch";
  try {
    const o = scr && scr.orientation;
    if (!o || typeof o.lock !== "function") return "no-api";
    const p = o.lock("landscape");
    if (p && typeof p.catch === "function") p.catch(() => {});
    return "asked";
  } catch (e) { return "no-api"; }
}
