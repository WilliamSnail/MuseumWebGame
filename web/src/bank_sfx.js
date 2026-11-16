// ================================================================
//  銀行的聲音（11-15 銀行廳先用；11-16 翊文：「其他地方的簡單型銀行應該以手動輸入為主，並且要有銀行按鈕的那些音效」→ 抽成共用）
//  檔案和來源在 shared/sfx_files.js。用的地方：銀行廳 ui_bank.js、賭場和畫廊拍賣的簡易銀行 ui_casino.js 的 bankBar。
//  錢放進去＝籌碼落下，從銀行領錢／借錢＝ATM 吐鈔，還債＝收銀機「叮」，賣股＝吐硬幣，大筆錢回到手上＝壹串硬幣
// ================================================================
import { sndFile } from "./ui_core.js";

const IN = new Set(["bank:put", "bank:term", "bank:bond", "stock:buy", "stock:open"]);
const PAY = new Set(["repay:", "stock:sellDebt"]);
const ATM = new Set(["bank:take", "borrow:"]);
const OUT = new Set(["stock:sell"]);
const BIG = new Set(["bank:break", "bank:bondRedeem", "stock:close"]);
// act：casino 的動作（bank、borrow、repay、stock）；data.op：bank／stock 的哪壹種
export function bankSfx(act, data) {
  const k = act + ":" + ((data && data.op) || "");
  if (PAY.has(k)) sndFile("cha-ching", 0.45);
  else if (ATM.has(k)) sndFile("atm-dispense", 0.4);
  else if (IN.has(k)) sndFile("coin-drop", 0.4);
  else if (OUT.has(k)) sndFile("coin-payout", 0.45);
  else if (BIG.has(k)) sndFile("coin-payout-big", 0.4);
}
// 數字欄按數字「嗶」（Pixabay「Number pad 1」）：40 毫秒內只響壹次
let keyAt = 0;
export function keyBeep() { const t = Date.now(); if (t - keyAt > 40) { keyAt = t; sndFile("keypad", 0.3); } }
export const isKeyBeep = e => /^[0-9.]$/.test(e.key) || e.key === "Backspace";
