// ================================================================
//  假伺服器（翊文 11-22：「賭場要登入才打得開，有沒有辦法讓他做一個測試的方式，不用登入」）。
//  只在 npm run dev 載入（debug_boot.js 用 import() 載入，debug_boot 又只有 DEV 才載入，正式的 dist/ 沒有；code_rules 第 8 項擋）。
//  做什麼：把 NET 換成一個「已經登入、不連任何網路」的假的。賭場、銀行叫 NET.call 時，回的是 mock/fixtures.json 錄下來的真伺服器回應
//  （tools/dev/mock_record.cjs 對模擬器真的叫一次錄的，形狀就是伺服器回的）。網址 #casino、#casino:餐車、#bank:財報 就能直接看，不用登入、不用開模擬器。
//  只能看畫面：會動錢、改狀態的動作（發牌、買賣、存提…）回「假伺服器不處理」。要測規則、動到錢，用模擬器登入（docs/操作/本機模擬器實測.md）。
//  調狀態：網址加 ?mock&chips=5000（籌碼多少），或在 console 叫 __mock.set({ chips: 5000 })；理智用 #casino:lowsan 之類（debug_boot 本來就有）。
// ================================================================
import { NUM } from "../../../shared/core/config.js";
import { newParty } from "../../../shared/social/party.js";
import { NET } from "./net_firebase.js";
import { UI, setChips } from "./ui_core.js";
import FIX from "./mock/fixtures.json";

export const MOCK_UID = "mock-me", MOCK_NICK = "測試館友";
export const mockKey = (fn, d) => [fn, d && d.act, d && d.op].filter(Boolean).join(":");
const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const OV = {};
const wait = ms => new Promise(r => setTimeout(r, ms));

// 把「籌碼多少」這類調整蓋到回應上（錢包、狀態列、桌子的 chips）
function apply(r) {
  if (!r || typeof r !== "object") return r;
  if (OV.chips != null) {
    if (typeof r.chips === "number") r.chips = OV.chips;
    if (r.wallet && typeof r.wallet.chips === "number") r.wallet.chips = OV.chips;
    if (r.view && typeof r.view.chips === "number") r.view.chips = OV.chips;
  }
  return r;
}
const NOPE = key => ({ ok: false, reason: "（假伺服器不處理這個動作；要測規則請用模擬器登入）", mock: key });
// 德州「打牌中」「結算」的假畫面（11-22）：網址 ?mock&holdem=play（輪到我、超時過 1 次）、other（輪到別人）、over（攤牌、有邊池、兩位贏家）；或 __mock.set({ holdem: "over" })。
// 形狀照 shared/casino/holdem.js 的 casHView（手寫的，不是錄的）。每次叫 tick 都把倒數重設，畫面停著不會跳走
function holdemMode() { return OV.holdem || new URLSearchParams(location.search).get("holdem") || ""; }
export function holdemMockView(mode, now = Date.now()) {
  const H = NUM.casino.holdem, ME = MOCK_UID, FU = "u-fu", KK = "u-kk", XY = "npc:v-xiaoyu";
  const seat = (uid, nick, o) => Object.assign({ uid, nick, stack: 0, put: 0, bet: 0, st: "in", me: uid === ME, btn: false, hole: [-1, -1], timeouts: 0, last: null, leaving: false, npc: uid.startsWith("npc:"), say: null, sitOut: false }, o);
  const view = { game: "holdem", pid: "mock-pid", hand: 12, phase: "play", street: 2, board: [45, 38, 1, 21], now, deadline: now + 24000, level: { lv: 1, sb: 5000, bb: 10000, levels: H.levels }, buy: { min: 400000, max: 2000000 }, rake: { pct: H.rakePct, capBB: H.rakeCapBB, cap: H.rakeCapBB * 10000 }, pot: 0, toAct: ME, curBet: 40000, E: 600000, res: null, rev: 1, sitting: true, seatsMax: 6, talk: [], chips: 9960000, pairLeft: H.pairDay };
  const log = [{ uid: XY, nick: "小雨", a: "raise", amt: 20000, street: 1 }, { uid: KK, nick: "老K", a: "call", amt: 20000, street: 1 }, { uid: FU, nick: "阿福", a: "raise", amt: 40000, street: 2 }, { uid: XY, nick: "小雨", a: "fold", amt: 0, street: 2 }, { uid: KK, nick: "老K", a: "call", amt: 40000, street: 2 }];
  if (mode === "over") {
    Object.assign(view, { phase: "over", street: 3, board: [45, 38, 1, 21, 30], deadline: now + 11000, toAct: null, curBet: 0, pot: 0, res: { hand: 12, how: "showdown", winners: [ME, FU], pot: 420000, rake: 21000, net: { [ME]: 160000, [FU]: 90000, [KK]: -200000, [XY]: -50000 }, board: [45, 38, 1, 21, 30], street: 3, cards: { [ME]: [12, 25], [FU]: [7, 20], [KK]: [3, 16] }, names: { [ME]: "三條", [FU]: "兩對", [KK]: "壹對" },
      pots: [{ amount: 300000, winners: [ME], elig: [ME, FU, KK] }, { amount: 120000, winners: [FU], elig: [FU, KK] }] } });
    view.seats = [seat(XY, "小雨", { stack: 100000, hole: [], st: "idle", last: { a: "fold", amt: 0 }, say: "下一手再來。" }), seat(FU, "阿福", { stack: 560000, hole: [], st: "idle", btn: true, last: { a: "allin", amt: 160000 } }), seat(KK, "老K", { stack: 0, hole: [], st: "idle", last: { a: "call", amt: 160000 } }), seat(ME, "測試館友", { stack: 540000, hole: [], st: "idle", last: { a: "allin", amt: 300000 } })];
    view.log = log.slice(-8);
    return view;
  }
  const other = mode === "other";
  view.seats = [seat(XY, "小雨", { stack: 210000, put: 60000, st: "fold", last: { a: "fold", amt: 0 }, say: "這手不跟了。" }),
    seat(FU, "阿福", { stack: 520000, put: 80000, bet: 40000, btn: true, last: { a: "raise", amt: 40000 } }),
    seat(KK, "老K", { stack: 150000, put: 80000, bet: 40000, last: other ? null : { a: "call", amt: 40000 } }),
    seat(ME, "測試館友", { stack: 380000, put: other ? 80000 : 60000, bet: other ? 40000 : 20000, hole: [12, 25], timeouts: other ? 0 : 1, last: other ? { a: "call", amt: 20000 } : null })];
  if (other) { view.toAct = KK; view.deadline = now + 17000; view.seats[2].bet = 20000; view.seats[2].put = 60000; view.curBet = 40000; view.seats[2].last = null; }
  view.pot = view.seats.reduce((a, s) => a + s.put, 0);
  view.log = log.slice(-8);
  if (!other) view.legal = { check: false, call: 20000, minTo: 80000, maxTo: 380000, canRaise: true, fold: true };
  return view;
}
function holdemAnswer(mode, d) {
  if (["open", "buyin", "tick"].includes(d.act)) return { ok: true, pid: "mock-pid", view: holdemMockView(mode) };
  if (d.act === "npcWho") return { ok: true, who: [] };
  return NOPE(mockKey("casinoHoldem", d));
}
// 桌子（pid 不是真的）：德州、21 點同桌的後續動作一律回錄下來的那張桌子畫面
function tableAnswer(name, d) {
  const open = FIX.responses[`${name}:open`];
  if (!open) return NOPE(mockKey(name, d));
  if (["buyin", "tick", "npcWho"].includes(d.act)) return d.act === "npcWho" ? { ok: true, who: [] } : { ok: true, pid: open.pid, view: clone(open.view) };
  return NOPE(mockKey(name, d));
}
// 交代人的聊聊、送佩佩、接拜託：只在畫面上走完（不記熟識度、不動錢），讓小框裡的按鈕按得下去、看得到回的話
const TAPS = {};
function giverAnswer(d) {
  if (d.op === "tap") { const n = (TAPS[d.id] = (TAPS[d.id] || 0) + 1); return { ok: true, n, over: n > 8, lv: 0, up: false, rev: 1 }; }
  if (d.op === "gift") return { ok: true, react: "ok", up: false, lv: 0, rev: 1 };
  if (["heard", "ask", "askDone", "visit"].includes(d.op)) return { ok: true, rev: 1 };
  return null;
}
export function mockCall(name, d = {}) {
  const key = mockKey(name, d);
  let r;
  if (name === "casino" && d.act === "giver" && !(key in FIX.responses) && giverAnswer(d)) return wait(30).then(() => giverAnswer(d));
  if (name === "casinoHoldem" && holdemMode()) r = holdemAnswer(holdemMode(), d);
  else if ((name === "casinoTable" || name === "casinoHoldem") && d.act !== "open") r = tableAnswer(name, d);
  else if (key in FIX.responses) r = clone(FIX.responses[key]);
  else { r = NOPE(key); console.warn("[假伺服器] 沒有這個呼叫的假資料：", key, "→ 到 web/src/core/mock/calls.json 加，再 npm run mock:record"); }
  return wait(30).then(() => apply(r));
}

export function installMock(opts = {}) {
  if (window.__mock && window.__mock.on) return window.__mock;
  const q = new URLSearchParams(location.search);
  if (q.has("chips")) OV.chips = Number(q.get("chips"));
  if (opts.chips != null) OV.chips = opts.chips;
  const pid = (FIX.responses["casinoHoldem:open"] || {}).pid;
  const me = { id: MOCK_UID, nick: MOCK_NICK, invisible: false, email: "mock@dev.local" };
  const def = (k, get) => Object.defineProperty(NET, k, { get, configurable: true });
  def("loggedIn", () => true); def("me", () => me); def("state", () => "online"); def("roster", () => []); def("rev", () => 1);
  Object.assign(NET, {
    call: mockCall,
    flush: () => Promise.resolve(),
    saveSoon: () => {}, save: () => Promise.resolve({ conflict: false, rev: 1 }), dropPending: () => {},
    where: () => true, connect: () => {}, disconnect: () => {},
    watch: () => () => {},
    // 讀 RTDB：目前只有「我在哪一桌」有東西（德州桌）；其他都沒有
    read: async path => (path === `partyOf/${MOCK_UID}` ? null : path === `parties/${pid}` ? newParty({ pid, kind: "holdem", leader: MOCK_UID, leaderNick: MOCK_NICK, now: Date.now() }) : null),
  });
  UI.net = true; UI.localPlay = false; // debug_boot 的 #畫面 設了 localPlay（不連伺服器）：銀行看它決定要不要跟伺服器拿資料，假的也要拿
  setChips(OV.chips != null ? OV.chips : ((FIX.responses["casino:peek"] || {}).chips || 0));
  window.__mock = { on: true, set(o) { Object.assign(OV, o || {}); if (OV.chips != null) setChips(OV.chips); }, calls: () => Object.keys(FIX.responses) };
  return window.__mock;
}
