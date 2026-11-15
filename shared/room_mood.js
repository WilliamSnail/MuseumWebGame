// ================================================================
//  房間效果的狀態（翊文 11-15：「大廳也可以有些效果反應這些訊息」「銀行和賭場也可以有類似的特效」；docs/大廳效果提案.md）
//  大廳、銀行、賭場都叫這壹個，**門檻和換算只寫在這壹處**。畫面層是 web/src/ui_mood.js。純函式，不碰 DOM。
//    roomMood(data) → { light: { warm, dim }, crowd, flags: { bunting }, omen, hide }
//      light.warm：−1（冷、偏暗偏藍）～ 1（暖、偏金）；light.dim：0～1，整體再暗多少（莊家吃緊、景氣差）
//      crowd：畫幾個小人影（0～RM.crowdMax）
//      flags.bunting：null｜"policy"｜"event"｜"both"
//      omen：0～1，怪影子多常出現（0 ＝ 完全不出現）
//      heat：0～3（冷清／平常／熱絡／沸騰），賭場的籌碼塔、招牌、煙霧、荷官台詞用
//      hide：true ＝ 房間效果全部收起（館友自己的理智效果比房間效果大）
//  data 每個欄位都可以沒有：
//    mood        散客氣氛的數字（peek 的 crowdMood[0]）
//    warm        直接給暖冷（−1～1），有給就不看 mood（銀行用景氣來定）
//    hall        展廳現在幾人
//    policy／event   今天有沒有本日政策、限時活動（true／false）
//    idx         財報的景氣（−1～1）
//    squeeze     吃緊＋裁員的集團占幾成（0～1）
//    sanLow      理智偏低的 NPC 有幾位（理智低於 RM.sanLow）
//    unrest      集團人心四格 [安穩, 有點躁動, 不安, 動盪]
//    own         館友自己的理智效果 { lightsOut, faint, flee, bout, shadow }：有任何壹個，房間效果收起；shadow（跟著游標的黑影）出現時怪影子不出現
// ================================================================
import { statBandOf } from "./stat_view.js";

export const RM = { crowdMax: 24, sanLow: 40, omenMin: 0.15, warm: { cold: -0.7, plain: 0, warm: 0.5, buzz: 0.9 } };
const rmN = x => (x === null || x === undefined || x === "" || typeof x === "boolean" || !Number.isFinite(+x) ? null : +x);
const rmClamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function roomMood(data) {
  const d = data || {}, own = d.own || {};
  const mood = rmN(d.mood), hall = rmN(d.hall), idx = rmN(d.idx), sq = rmN(d.squeeze);
  const band = mood === null ? "plain" : statBandOf("crowdMood", mood) || "plain";
  const wv = rmN(d.warm), warm = wv !== null ? rmClamp(wv, -1, 1) : RM.warm[band] === undefined ? 0 : RM.warm[band];
  const dim = rmClamp((sq === null ? 0 : sq * 0.5) + (idx !== null && idx < -0.3 ? 0.2 : 0), 0, 0.7);
  // 人影：0～2 人沒有；3～20 人 3～7 個；21～60 人 8～16 個；60 人以上 24 個
  let crowd = 0;
  if (hall !== null && hall >= 3) crowd = hall <= 20 ? Math.round(3 + (hall - 3) / 17 * 4) : hall <= 60 ? Math.round(8 + (hall - 21) / 39 * 8) : RM.crowdMax;
  const flags = { bunting: d.policy && d.event ? "both" : d.policy ? "policy" : d.event ? "event" : null };
  const un = Array.isArray(d.unrest) ? d.unrest.map(x => rmN(x) || 0) : [0, 0, 0, 0];
  let omen = rmClamp((rmN(d.sanLow) || 0) * 0.12 + (un[2] || 0) * 0.08 + (un[3] || 0) * 0.18, 0, 1);
  if (omen < RM.omenMin) omen = 0;
  const hide = !!(own.lightsOut || own.faint || own.flee || own.bout);
  if (own.shadow || hide) omen = 0;
  return { heat: heatOf(d), light: { warm, dim: Math.round(dim * 100) / 100 }, crowd, flags, omen: Math.round(omen * 100) / 100, hide };
}

// ---------- 熱鬧程度 → 環境音（翊文 11-15：賭場、銀行要有背景樂和環境音；人聲和籌碼聲跟熱鬧連動） ----------
// heat：0 冷清、1 平常、2 熱絡、3 沸騰（用 crowdMood 的分級，沒資料就是 1）。**門檻只在 stat_view.js 的 crowdMood，換算只在這裡。**
// ambMix(heat) → { crowd, chipMin, chipMax, chipN }：人聲底噪的音量、籌碼聲間隔的毫秒範圍、壹次最多幾下。web/src/fx.js 的 AMB.casino 照這個放。
const HEAT_OF = { cold: 0, plain: 1, warm: 2, buzz: 3 };
export const AMB_MIX = [
  { crowd: 0.004, chipMin: 14000, chipMax: 24000, chipN: 1 },
  { crowd: 0.008, chipMin: 7000, chipMax: 13000, chipN: 2 },
  { crowd: 0.013, chipMin: 3500, chipMax: 7000, chipN: 3 },
  { crowd: 0.019, chipMin: 1500, chipMax: 3500, chipN: 4 },
];
export function heatOf(data) {
  const m = rmN((data || {}).mood);
  if (m === null) return 1;
  const b = statBandOf("crowdMood", m);
  return HEAT_OF[b] === undefined ? 1 : HEAT_OF[b];
}
export function ambMix(heat) {
  const h = rmN(heat), i = h === null ? 1 : rmClamp(Math.round(h), 0, AMB_MIX.length - 1);
  return Object.assign({}, AMB_MIX[i]);
}
