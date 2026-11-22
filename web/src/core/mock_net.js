// ================================================================
//  假伺服器（翊文 11-22：「賭場要登入才打得開，有沒有辦法讓他做一個測試的方式，不用登入」）。
//  只在 npm run dev 載入（debug_boot.js 用 import() 載入，debug_boot 又只有 DEV 才載入，正式的 dist/ 沒有；code_rules 第 8 項擋）。
//  做什麼：把 NET 換成一個「已經登入、不連任何網路」的假的。賭場、銀行叫 NET.call 時，回的是 mock/fixtures.json 錄下來的真伺服器回應
//  （tools/dev/mock_record.cjs 對模擬器真的叫一次錄的，形狀就是伺服器回的）。網址 #casino、#casino:餐車、#bank:財報 就能直接看，不用登入、不用開模擬器。
//  只能看畫面：會動錢、改狀態的動作（發牌、買賣、存提…）回「假伺服器不處理」。要測規則、動到錢，用模擬器登入（docs/操作/本機模擬器實測.md）。
//  調狀態：網址加 ?mock&chips=5000（籌碼多少），或在 console 叫 __mock.set({ chips: 5000 })；理智用 #casino:lowsan 之類（debug_boot 本來就有）。
// ================================================================
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
  if ((name === "casinoTable" || name === "casinoHoldem") && d.act !== "open") r = tableAnswer(name, d);
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
