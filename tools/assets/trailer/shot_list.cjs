// 預告片要照的畫面。id 就是 trailer.js 裡 pic("id") 用的名字。
//   hash：`#畫面`（見 docs/規則/架構.md 第 3 節）；js：照之前在網頁裡跑的程式（照順序）；wait：開網頁後等多久。
// 不破梗：不照主線揭露、禁書和《看懂的事》的內文、怪物圖鑑的真相。
const W = 1920, H = 1080;
const click = cls => `document.querySelector(".${cls}").click()`;
const clickText = (sel, t) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim() === ${JSON.stringify(t)}).click()`;
// 開發用預覽的標題、說明，和怪物的名字（不破梗）藏起來
const hideDev = `document.querySelectorAll("h2, .pt-hint").forEach(e => { if (/開發用|預覽/.test(e.textContent)) e.style.visibility = "hidden"; }); document.querySelectorAll(".fg-name").forEach(e => e.style.visibility = "hidden")`;
const SHOTS = [
  { id: "title", hash: "title", wait: 6000 },
  { id: "lobby", hash: "lobby" },
  { id: "workshop", hash: "workshop" },
  { id: "roll", hash: "roll", wait: 9000 },
  { id: "reveal", hash: "reveal" },
  { id: "fusion", hash: "fusion2" },
  { id: "pillow", hash: "pillow" },
  { id: "gallery", hash: "gallery" },
  { id: "hall", hash: "hall" },
  { id: "tasks", hash: "lobby", js: [click("nav-today")], step: 2500 },
  { id: "casino", hash: "casino", wait: 7000 },
  { id: "holdem", hash: "casino:德州", wait: 9000 },
  { id: "wheel", hash: "casino", wait: 7000, js: [clickText(".bj-g", "轉盤")], step: 2500 },
  { id: "diner", hash: "casino:餐車", wait: 7000 },
  { id: "stock", hash: "bank:股票", wait: 7000 },
  { id: "report", hash: "bank:財報", wait: 7000 },
  { id: "cellar", hash: "cellarrun" },
  { id: "route", hash: "route:3", wait: 6000, js: [hideDev] },
  { id: "fight", hash: "fight", wait: 6000, js: [hideDev] },
  { id: "library", hash: "origin" },
  { id: "pass", hash: "pass", wait: 7000 },
  { id: "calendar", hash: "calendar" },
  { id: "shop", hash: "shop" },
  { id: "lowsan", hash: "gallery:lowsan", wait: 6000 },
];
module.exports = { SHOTS, W, H };
