// ================================================================
//  新玩家的「下一步」（翊文 11-08「先改前三個」，介面檢查第 2 項）
//  做完教學後，大廳沒有目標提示；手機上連右邊那張提示卡都被藏起來。
//  這裡照順序看玩家做過什麼，回傳「下一步去哪個房間、做什麼」；基本的都做過就回傳 null，大廳就不再顯示。
//  純函式：只讀 P，不改任何東西。畫面在 web/src/ui_screens1.js 的大廳。
// ================================================================
import { dailyCommissions, isFree, makeCost } from "./logic.js";

// 回傳 { room, text, why } 或 null。text、why 是畫面上的字（介面照第 1 代用「壹」）。
export function nextStep(P) {
  if (!P || isFree(P)) return null; // 自由模式只管捏佩佩，不帶路
  const has = o => !!o && Object.keys(o).length > 0;
  const made = Object.keys(P.pepes || {}).length + Object.keys(P.failed || {}).length;
  if (!has(P.seen)) return { room: "gallery", text: "去畫廊看壹幅畫", why: "看畫會拿到靈感，做佩佩要花靈感。" };
  if (!made) {
    const cost = makeCost(P, P.wsPick || {});
    if ((P.insp || 0) < cost) return { room: "gallery", text: "再去畫廊看壹幅畫", why: `做佩佩要 ${cost} 靈感，你現在有 ${P.insp || 0}。` };
    return { room: "workshop", text: "到手作坊做第壹隻佩佩", why: `花 ${cost} 靈感，稀有度做出來才知道。` };
  }
  const open = P.day ? dailyCommissions(P, P.day.date).filter(c => !c.done).length : 0;
  if (!P.done && open) return { room: "commission", text: "去委託櫃台交壹張委託", why: "交了拿靈感，還會補壹點理智。" };
  if (!P.unlockCount) return { room: "workshop", text: "用靈感解鎖壹個新選項", why: "手作坊的卡片上寫著要花多少；選項越多，能做的佩佩越多。" };
  if (!(P.hall || []).some(Boolean)) return { room: "hall", text: "把壹隻佩佩擺進你的展廳", why: "參觀者會來看，留下靈感。" };
  if (!has(P.pillows)) return { room: "pillow", text: "做壹個抱枕", why: "做好之後按住抱壹下，可以補理智。" };
  if (!has(P.chaptersRead)) return { room: "origin", text: "到圖書館讀第壹章", why: "佩佩是從哪裡來的？" };
  return null;
}
