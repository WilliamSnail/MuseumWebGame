// ================================================================
//  地下打鬥：每壹種事件配什麼聲音（11-16 翊文：「先加壹些音效，並標記之後可以增加這些 royalty free 音效」）
//  壹張表管全部：snd ＝ web/src/fx/fx.js 合成的音效（R 裡的名字）、file ＝ web/public/sfx 的音效檔（shared/sfx_files.js 的 id）、g ＝ 檔案的音量。
//  todo ＝ 之後想換成 royalty free 錄音時要找什麼樣的聲音（有寫的就是「暫時用合成的，之後要找」）；npm run fx:report 會列出來。
//  事件的 key：e.t（push、calm、guard…），怪物個性是 trait:<kind>，逃跑 flee:ok／flee:no，帽子和姿勢招式 move:<招式 id>。
//  畫面在 web/src/rooms/ui_fight.js：每壹步重播時照這張表響；沒有在表裡的照舊響通用的「受傷／喀」。
// ================================================================
export const FIGHT_SFX = {
  push: { snd: "crack", todo: "推中怪物的悶響（布料被推開、重物晃動）" },
  calm: { snd: "hug", todo: "安撫成功：低聲的嘆息或布慢慢落下" },
  guard: { snd: "block", todo: "擋下：木盾或厚布擋住的悶擊" },
  inspire: { file: "war-drums-hit", g: 0.4 },
  share: { snd: "shimmer", todo: "分膽量：暖暖的上揚音" },
  comfort: { snd: "sanUp", todo: "安慰隊友：輕拍、柔和的鈴" },
  taunt: { snd: "hey", todo: "引開：口哨或拍手吸引注意" },
  see: { file: "skill-reveal", g: 0.4 },
  reveal: { file: "skill-reveal", g: 0.4 },
  point: { file: "skill-reveal", g: 0.4 },
  "flee:ok": { snd: "whoosh", todo: "逃掉了：快跑的腳步加門關上" },
  "flee:no": { snd: "error", todo: "沒逃掉：絆倒、被拉回來" },
  win: { snd: "fanfare", todo: "打贏：怪物安靜下來的長嘆、布落地" },
  ghost: { snd: "defeat", todo: "自己倒下：沉悶的倒地聲" },
  retreat: { snd: "steps", todo: "撤回地面：往上跑的樓梯腳步" },
  "trait:grow": { snd: "puff", todo: "怪物長大：布被撐開、低吼" },
  "trait:steal": { snd: "whoop", todo: "招式被偷走：搶東西的嗖聲" },
  "trait:mark": { snd: "stamp", todo: "被記上帳：蓋章、筆尖刮紙" },
  "trait:markHit": { snd: "sanDrop", todo: "記帳到期：帳本重重闔上" },
  "trait:unmark": { snd: "sparkle", todo: "帳塗掉了：橡皮擦、紙被撕下" },
  "move:crown": { snd: "crit01", todo: "皇冠：金屬的亮響" },
  "move:tentacle": { snd: "squelch", todo: "觸手帽：黏黏的觸手甩動" },
  "move:wizard": { snd: "twinkle", todo: "巫師帽：魔法閃爍" },
  "move:beanie": { snd: "sanUp", todo: "毛帽：暖和的毛線、呼氣" },
  "move:rest": { snd: "sanOk", todo: "躺平：躺下去的布料聲" },
  "move:squat": { snd: "gopnik", todo: "斯拉夫蹲：蹲下的運動褲摩擦" },
  "move:cheer": { file: "war-drums-hit", g: 0.4 },
  "move:cap": { snd: "block", todo: "棒球帽：帽簷擋下的悶擊" },
};
// 事件 → 表裡的 key（沒有對應回 null）
export function fightSfxKey(e) {
  if (!e || typeof e.t !== "string") return null;
  if (e.t === "trait") return e.kind ? "trait:" + e.kind : null;
  if (e.t === "flee") return e.ok ? "flee:ok" : "flee:no";
  if (e.t === "move") return e.move ? "move:" + e.move : null;
  if ((e.t === "see" || e.t === "reveal" || e.t === "calm") && !e.ok) return null; // 沒成功：照舊通用聲
  return FIGHT_SFX[e.t] ? e.t : null;
}
