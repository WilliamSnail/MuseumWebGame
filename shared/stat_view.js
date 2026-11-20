// ================================================================
//  公用的「數值怎麼看」：statView（決定 0088，docs/理智值提案.md 第 6 節）
//  畫面、日報、Discord、腳本、伺服器回傳給畫面都叫這一個，**分級的門檻和名字只寫在這一處**，不各自算。
//    statView(kind, id, data) → { value, band, label, tone, hint, pub } 或 null（沒有資料）
//      kind：unitHealth（集團健康值 h）、unitState（一般／減薪／緊縮／裁員）、budgetMult（NPC 預算倍率）、
//            npcSan、unitUnrest、crowdMood（三個理智值：提案還沒定案，分級先放在這裡，定案接上資料才會有值）
//      id：集團或 NPC 的 id（crowdMood 不用，給 null）；data：莊家文件 house（讀 house.wh、house.npcw），或直接給數字（value）
//      pub：可以給玩家看嗎（false ＝ 只給腳本和管理者看；數字本身永遠不給玩家，玩家只看 band、label、hint）
//    statBandOf(kind, value) → 分級代碼，給只有數字的地方用（例如財報卡的分布）。
//  純函式，不碰 DOM。
// ================================================================
import { NUM } from "./config.js";
import { nwSan, whMult, whUnrest } from "./world_base.js";

const svN = v => (v === null || v === undefined || v === "" || typeof v === "boolean" || !Number.isFinite(+v) ? null : +v);
// 分級表：由低到高；上限（含）以內算那一級。unitUnrest 是「高 ＝ 不安」，所以分級名字反過來讀。
const STAT_TABLE = {
  npcSan: { pub: true, bands: [["edge", "崩潰邊緣", "bad", "看起來快撐不住了。", 19], ["uneasy", "不安", "warn", "最近有點不對勁。", 39], ["tired", "有點累", "neutral", "看起來有點累。", 59], ["steady", "穩定", "good", "狀態不錯。", 100]] },
  unitUnrest: { pub: true, bands: [["calm", "安穩", "good", "那邊很平靜。", 29], ["stir", "有點躁動", "neutral", "那邊有點議論。", 49], ["uneasy", "不安", "warn", "那邊人心浮動。", 74], ["turmoil", "動盪", "bad", "那邊亂成一團。", 100]] },
  marketB: { pub: true, bands: [["low", "低迷", "bad", "這個行業很冷。", -0.5], ["cool", "偏冷", "warn", "這個行業有點冷。", -0.15], ["plain", "平穩", "neutral", "這個行業很平穩。", 0.15], ["warm", "回溫", "good", "這個行業在回溫。", 0.5], ["hot", "熱絡", "good", "這個行業很熱。", 1]] },
  crowdMood: { pub: true, bands: [["cold", "冷清", "warn", "今天館裡有點冷清。", 29], ["plain", "平常", "neutral", "今天館裡很平常。", 59], ["warm", "熱絡", "good", "今天館裡很熱絡。", 84], ["buzz", "沸騰", "good", "今天館裡人聲鼎沸。", 100]] },
};
// 集團健康值：門檻讀 W5 的設定（跟狀態換檔同一組），不另外寫
const svHealth = () => { const C = NUM.casino.worldDoc.health; return [["tight", "吃緊", "bad", "那邊的景氣很差。", C.squeeze], ["weak", "偏弱", "warn", "那邊的景氣偏弱。", C.cut], ["normal", "普通", "neutral", "那邊的景氣普通。", 1.1], ["strong", "很好", "good", "那邊的景氣很好。", Infinity]]; };
const STAT_STATE = { normal: ["normal", "一般", "good", "那邊照常營運。"], cut: ["cut", "減薪", "warn", "那邊減薪了。"], squeeze: ["squeeze", "緊縮", "bad", "那邊的開銷收得很緊。"], layoff: ["layoff", "裁員", "bad", "那邊在裁員。"] };

function svPick(bands, v, strict) { for (const b of bands) if (strict ? v < b[4] : v <= b[4]) return b; return bands[bands.length - 1]; } // 健康值用「小於」（跟 W5 換狀態的門檻一樣：h ＜ squeeze），其他用「以內」
const svPack = (value, b, pub) => ({ value, band: b[0], label: b[1], tone: b[2], hint: b[3], pub });
const svNum = (data, get) => { const n = svN(data); return n !== null && (typeof data === "number" || typeof data === "string") ? n : svN(get(data)); };

export function statBandOf(kind, value) {
  const v = svN(value); if (v === null) return null;
  if (kind === "unitHealth") return svPick(svHealth(), v, true)[0];
  return STAT_TABLE[kind] ? svPick(STAT_TABLE[kind].bands, v)[0] : null;
}
export function statView(kind, id, data) {
  if (kind === "unitHealth") { const v = svNum(data, d => d && d.wh && d.wh.h && d.wh.h[id]); return v === null ? null : svPack(v, svPick(svHealth(), v, true), true); }
  if (kind === "unitState") { const s = data && data.wh && data.wh.st && data.wh.st[id] ? data.wh.st[id].s : (typeof data === "string" ? data : null); const x = STAT_STATE[s]; return x ? { value: null, band: x[0], label: x[1], tone: x[2], hint: x[3], pub: true } : null; }
  if (kind === "budgetMult") { const m = typeof data === "number" ? data : (data && data.wh ? whMult(data, id) : null); if (m === null) return null; const t = m >= 1.05 ? ["up", "多一點", "good", "那邊的旅客花得大方。"] : m >= 0.95 ? ["even", "照常", "neutral", "那邊的旅客照常花錢。"] : m >= 0.6 ? ["down", "保守", "warn", "那邊的旅客花得比較保守。"] : ["low", "很省", "bad", "那邊的旅客幾乎不花錢。"]; return { value: m, band: t[0], label: t[1], tone: t[2], hint: t[3], pub: true }; }
  const T = STAT_TABLE[kind]; if (!T) return null;
  const v = svNum(data, d => (kind === "npcSan" ? (d && d.npcw ? nwSan(d, id) : null) : kind === "unitUnrest" ? (d && d.wh ? whUnrest(d, id) : null) : d && d.wh && d.wh.mood ? d.wh.mood.v : null));
  return v === null ? null : svPack(v, svPick(T.bands, v), T.pub);
}
