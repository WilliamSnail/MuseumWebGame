// ================================================================
//  館外地圖（圖書館的「地圖」頁籤，11-16；規格 .claude/交接/主線拓展規劃稿.md 第伍節，決定 0097）
//  純函式：哪些點現在看得到、亮到什麼程度。網頁（web/src/ui_map.js）和測試共用，不碰畫面、不碰存檔。
//  兩階亮度：日期到了（from <= 今天）＝亮輪廓（看得到「這裡有東西」）；再拿到對應線索（need，壹個線索 id 在 P.clues 裡）＝亮字（名字、壹句話、住的人）。
//  沒寫 need 的點，日期到了就全亮。只看日期和 P.clues，不看哪天打開過：晚進來的玩家，日期都到、線索補讀到就全亮。
// ================================================================
import { MAP_SPOTS } from "./map_data.js";

export const MAP_LAYER_NAME = { L1: "城鎮", L3: "外面世界", L2: "別的館", L4: "總帳" };
export const MAP_LAYER_ORDER = ["L1", "L3", "L2", "L4"]; // 四片透明片疊起來的順序（規劃稿 5.2 的表）
const mapHeld = (P, id) => !!(P && P.clues && typeof P.clues === "object" && !Array.isArray(P.clues) && P.clues[id]);
// 現在看得到的點：[{ ...點, lit }]，lit＝線索也拿到了。spots 不給就用打包好的 MAP_SPOTS
export function mapSpots(today, P, spots) {
  return (Array.isArray(spots) ? spots : MAP_SPOTS).filter(s => s && typeof s.from === "string" && s.from <= today).map(s => Object.assign({}, s, { lit: !s.need || mapHeld(P, s.need) }));
}
// 頁籤上的數字：[看得到幾個, 還沒亮字幾個, 新的幾個]（新的由畫面用 P.fresh 算，這裡不管）
export function mapCounts(today, P, spots) {
  const v = mapSpots(today, P, spots);
  return [v.length, v.filter(s => !s.lit).length];
}
// 哪幾片透明片已經有東西（沒東西的不畫）
export function mapLayersOn(list) {
  return MAP_LAYER_ORDER.filter(l => (list || []).some(s => s.layer === l));
}
