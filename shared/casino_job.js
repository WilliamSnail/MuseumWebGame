// ================================================================
//  交委託拿籌碼（決定 0062）
//  翊文 11-10：「委託給的靈感再少一點，可以改給一些籌碼」
//  靈感那一半在 config.js 的 NUM.rewardPct（logic.js 的 jobReward）；這裡是籌碼那一半。
//  客戶端只能說「我交了今天的哪幾張」（委託 id 的 # 後面那一段：0、1、2、3、x、L）；給多少在這裡由伺服器的亂數決定。
//  防刷：每個帳號每個遊戲日（台灣 05:00 換日）最多拿 perDay 次；同一張同一天只給一次；格子的名字要是認得的。
//  記帳跟地下探險撿籌碼（casino_find.js）一樣：錢包加、莊家減，兩邊守恆；統計 st.jobs（拿過幾次）、st.jobChips（共幾枚）、st.chipsMax。
//  錢包的欄位 cj：{ day, n 今天拿了幾次, slots 今天給過的格子 }；舊錢包沒有，這裡補。
//  純函式：亂數用 RNG（測試可以換，也可以從參數 rnd 傳）；「今天」從參數來。籌碼不是錢，這裡沒有任何換成現實東西的路。
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove } from "./casino_book.js";
import { casInUsed } from "./casino_stock_in.js";
import { RNG } from "./logic.js";
import { npcByName } from "./npc.js";

const cjBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const cjNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
export const CAS_JOB_SLOTS = ["0", "1", "2", "3", "4", "x", "L"];
export const casJobSlotOk = s => typeof s === "string" && CAS_JOB_SLOTS.includes(s);
// 補欄位、換日歸零（壞資料也不丟錯）
export function casJobFix(w, day) {
  if (!cjBox(w.cj)) w.cj = { day, n: 0, slots: [] };
  const cj = w.cj;
  if (cj.day !== day) { cj.day = day; cj.n = 0; cj.slots = []; }
  cj.n = Math.max(0, Math.floor(cjNum(cj.n)));
  cj.slots = Array.isArray(cj.slots) ? cj.slots.filter(casJobSlotOk).slice(0, CAS_JOB_SLOTS.length) : [];
  return cj;
}
// 今天還可以拿幾次
export function casJobLeft(w, day) {
  const C = NUM.casino.job;
  return Math.max(0, C.perDay - casJobFix(w, day).n);
}
// 交了幾張委託：一張擲一次數量。
// 回傳 { ok: false, reason }（什麼都沒改）、{ ok: true, found: 這次共幾枚, n: 這次給了幾張 }（重複的、超過上限的那幾張不給，found 可能是 0）
// clients：跟 slots 壹對壹的委託人名字（網頁說的；伺服器算不出每張是誰，因為要看玩家的存檔）。認得是名單裡的委託人才記到他名下；不認得的只算全館
export function casJobChips(w, house, slots, day, rnd = RNG, clients = null) {
  const C = NUM.casino.job;
  if (!C || typeof rnd !== "function") return { ok: false, reason: "沒有這個設定" };
  const list = (Array.isArray(slots) ? slots : [slots]).slice(0, CAS_JOB_SLOTS.length);
  if (!list.length || !list.every(casJobSlotOk)) return { ok: false, reason: "不認得這張委託" };
  const cj = casJobFix(w, day);
  const steps = Math.floor((C.max - C.min) / C.step) + 1;
  let found = 0, n = 0;
  const who = [];
  list.forEach((s, i) => {
    if (cj.slots.includes(s) || cj.n >= C.perDay) return;
    const nm = Array.isArray(clients) && typeof clients[i] === "string" ? npcByName(clients[i].slice(0, 40)) : null;
    if (nm && nm.kind === "client") who.push(nm.id);
    cj.slots.push(s); cj.n++; n++;
    found += Math.min(C.max, C.min + C.step * Math.min(steps - 1, Math.floor(rnd() * steps)));
  });
  if (!n) return { ok: true, found: 0, n: 0 };
  casInUsed(w, house, "job", day); // 館內股票：今天有這個人交過委託
  w.chips += found;
  if (house) casHouseMove(house, "job", -found); // 莊家出，跟大禮包一樣
  if (!cjBox(w.st)) w.st = {};
  if (house) { if (!cjBox(house.npcc)) house.npcc = { comm: 0, hall: 0 }; house.npcc.comm = Math.floor(cjNum(house.npcc.comm)) + n; if (who.length) { if (!cjBox(house.npcc.cl)) house.npcc.cl = {}; who.forEach(id => { house.npcc.cl[id] = Math.floor(cjNum(house.npcc.cl[id])) + 1; }); } } // 全館累計完成幾張委託（NPC 故事線解鎖用）
  w.st.jobs = Math.floor(cjNum(w.st.jobs)) + n;
  w.st.jobChips = Math.floor(cjNum(w.st.jobChips)) + found;
  w.st.chipsMax = Math.max(cjNum(w.st.chipsMax), w.chips);
  return { ok: true, found, n };
}
