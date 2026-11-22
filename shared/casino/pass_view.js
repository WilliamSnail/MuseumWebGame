// ================================================================
//  館友證的「賭場」頁要的只讀摘要（翊文 11-21：賭場頁籤整合，館友證看得到成就、換到的、本週收藏、財產）
//  純函式：只讀傳進來的錢包，不改它、不碰錢。伺服器 functions/casino/casino.js 的 act "pass" 叫它。
//  回傳（欄位固定，畫面只照著畫）：
//   chips            現在的籌碼
//   ach   { have, total, extra, wk, recent[{id,name,d}], title{id,name}|null }
//                    have：拿到幾個基本成就（CAS_ACH）／total：基本成就共幾個；extra：每週收藏和以前 Discord 帶來的其他成就；wk：其中每週收藏集滿的幾個；recent：最近拿到的前 6 個（新的在前）；title：戴著的稱號
//   props { have, copies, hung, hungMax, recent[{id,name,n,d,hung}] }
//                    財產（紀念品）：have 幾種、copies 共幾件、hung 掛在展廳幾件；recent 最近拿到的前 6 種
//   swap  { week, used, rows[{id,chips,perWeek,left}], tot { n, chips, rows[{id,n,chips}] } }（tot：從 11-22 起累計換了幾次、花了多少）
//                    換小獎：這週已經換了幾次（used），每一項還剩幾次
//   wk    { week, got, total, done, claimed } | null
//                    本週收藏：基本收藏品拿到幾件／共幾件；done：集滿了嗎；claimed：領了週章嗎。def 沒給（這週沒有賭場收藏）就是 null
// ================================================================
import { NUM } from "../core/config.js";
import { CAS_ACH } from "./text.js";
import { casAchInfo, casExTotFix, casExchangeLeft, casPropInfo } from "./wallet.js";
import { casWkBase } from "./week.js";

const newest = (ids, map) => ids.slice().sort((a, b) => String(map[b].d || "").localeCompare(String(map[a].d || "")) || (a < b ? -1 : 1));
export function casPassView(w, def) {
  const ids = Object.keys(w.ach || {}).filter(id => casAchInfo(w, id)), base = ids.filter(id => CAS_ACH.some(a => a.id === id));
  const ach = {
    have: base.length, total: CAS_ACH.length, extra: ids.length - base.length, wk: ids.filter(id => casAchInfo(w, id).wk).length,
    recent: newest(ids, w.ach).slice(0, 6).map(id => ({ id, name: casAchInfo(w, id).name, d: w.ach[id].d || null })),
    title: w.title && casAchInfo(w, w.title) ? { id: w.title, name: casAchInfo(w, w.title).name } : null,
  };
  const pids = Object.keys(w.props || {}).filter(id => casPropInfo(w, id)), hung = Array.isArray(w.hung) ? w.hung : [];
  const props = {
    have: pids.length, copies: pids.reduce((s, id) => s + Math.max(0, +w.props[id].n || 0), 0), hung: hung.filter(id => pids.includes(id)).length, hungMax: NUM.casino.hangMax,
    recent: newest(pids, w.props).slice(0, 6).map(id => ({ id, name: casPropInfo(w, id).name, n: w.props[id].n || 0, d: w.props[id].d || null, hung: hung.includes(id) })),
  };
  const rows = NUM.casino.exchange.map(x => ({ id: x.id, chips: x.chips, perWeek: x.perWeek, left: casExchangeLeft(w, x.id) }));
  const tot = casExTotFix(w.exTot), swap = { week: w.ex && w.ex.week || null, used: rows.reduce((s, r) => s + (r.perWeek - r.left), 0), rows, tot: { n: Object.values(tot).reduce((s, x) => s + x.n, 0), chips: Object.values(tot).reduce((s, x) => s + x.chips, 0), rows: NUM.casino.exchange.map(x => ({ id: x.id, n: (tot[x.id] || { n: 0 }).n, chips: (tot[x.id] || { chips: 0 }).chips })) } };
  let wk = null;
  if (def && w.wk && w.wk.week === def.label) {
    const items = casWkBase(def);
    wk = { week: def.label, got: items.filter(it => w.wk.got && w.wk.got[it.id]).length, total: items.length, done: !!w.wk.done, claimed: !!w.wk.claimed };
  }
  return { chips: w.chips, ach, props, swap, wk };
}
