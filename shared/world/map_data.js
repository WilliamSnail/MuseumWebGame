// tools/content/map_pack.cjs 產生的，不要改（改 content/map/館外.json，再跑 node tools/content/map_pack.cjs）。
// 館外地圖的點（揭露當天才寫進去）：規則在 shared/world/map.js，畫面在 web/src/rooms/ui_map.js。
export const MAP_SPOTS = [{"id":"m-alley","name":"巷口","layer":"L1","from":"2026-11-18","x":30,"y":78,"icon":"lamp","line":"路燈下有人把街數了又數。","npc":["c-umbrella","c-late","c-eighth","c-cat"],"need":"c-stair-map"},
{"id":"m-bridgehead","name":"橋頭","layer":"L1","from":"2026-11-18","x":42,"y":58,"icon":"bridge","line":"橋頭畫了壹個小正字，才兩畫。","npc":["c-tourist"],"need":"c-stair-map-pic"},
{"id":"m-hall","name":"館","layer":"L1","from":"2026-11-18","x":50,"y":94,"icon":"gate","line":"地下的牆，數的人站哪，字就多高。","npc":[]},
{"id":"m-mailbox","name":"信箱","layer":"L1","from":"2026-11-18","x":50,"y":87,"icon":"mailbox","line":"信封每天少壹封，沒人問去了哪。","npc":["c-postman"]},
{"id":"m-nightmarket","name":"夜市","layer":"L1","from":"2026-11-18","x":68,"y":70,"icon":"market","line":"燈串下的椅子，總是空著壹張。","npc":["c-nightmarket"],"need":"c-stair-map"}];
