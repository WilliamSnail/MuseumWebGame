// 「現在該放哪一首環境音」的決定，從 ui_core.js 的 audioState 抽出來的純函式（11-16 聲音狀態檢查）。
// 不碰畫面、不碰 fx.js：輸入畫面、存檔狀態、蓋在上面的框、地下的聲音狀態，輸出環境音的名字和要告訴它的 ambMix。
// 這樣 test/snd_check.test.cjs 可以不開瀏覽器，直接測「地下→大廳」「賭場框開著被嚇退」這些轉換。
// AMB_OF（畫面→環境音）還是留在 ui_core.js（tools/check/fx_report.cjs 從那裡掃）；呼叫的人傳進來。

// 回傳 { amb, mix }：amb ＝ 最後要放的環境音（含理智歸零的 "zero"）；mix ＝ [名字, 內容] 或 null，要在放之前呼叫 ambMix。
// opts：
//   screen、hasP（有沒有存檔）、live（有存檔而且不是自由模式）、dark（理智歸零）、params（畫面的參數）、ambOf（AMB_OF）
//   ambOver（蓋在房間上面的框要的環境音，現在只有 "casino"）、cellarSnd（地下的聲音狀態或 null）
//   heat()、dread()、creepy()、event()、crowd()：用到才算（賭場熱鬧程度、圖庫的走音、失敗作之夜、限時活動進行中、人潮很多）
export function ambFor(o) {
  const scr = o.screen, P = !!o.hasP, ambOf = o.ambOf || {};
  let amb = scr === "title" ? "title" : P ? (scr in ambOf ? ambOf[scr] : "room") : null;
  if (o.ambOver && P && scr !== "ending" && scr !== "title" && ambOf[scr] !== null) amb = o.ambOver;
  // 地下：合作模式的框蓋在別的房間上，也換成地下的聲音；賭場框開著時賭場優先
  if (o.cellarSnd && P && scr !== "ending" && scr !== "title" && !o.ambOver) amb = "cellar";
  let mix = null;
  if (amb === "cellar") mix = ["cellar", o.cellarSnd || { floor: null, mode: "map" }];
  else if (amb === "origin") mix = ["origin", { forbidden: !!(o.params && o.params.tab === "forbidden") }];
  else if (amb === "library") mix = ["library", { dread: o.live ? o.dread() : null }];
  else if (amb === "lobby") mix = ["lobby", { creepy: !!(P && o.creepy()), event: !!(P && o.event && o.event()), crowd: !!(P && o.crowd && o.crowd()), tier: o.live && o.sanTier ? o.sanTier() : null }]; // tier：理智那壹段（自由模式、沒存檔是 null，不換曲） // event：有限時活動進行中、crowd：館內人潮很多（11-16，大廳換那兩首）
  else if (amb === "hall") mix = ["hall", { creepy: !!(P && o.creepy()) }];
  else if (amb === "workshop") mix = ["workshop", { busy: !!(o.wsBusy && o.wsBusy()) }]; // busy：手作坊超過幾人換曲（11-17）
  else if (amb === "casino") mix = ["casino", { heat: o.heat(), busy: !!(o.casBusy && o.casBusy()) }]; // busy：賭場超過幾人換曲（11-16）
  if (o.live && o.dark && scr !== "ending") amb = "zero";
  if (scr === "ending" && o.params && o.params.id === "russia8") amb = "zero";
  return { amb, mix };
}
