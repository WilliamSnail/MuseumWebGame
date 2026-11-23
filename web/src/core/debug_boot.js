// 開發用：網址後面加 #畫面 就直接打開那個畫面，並放好假的收藏。只在 npm run dev 時載入（main.js），不會進正式打包。
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { STORY_CHAPTERS } from "../../../shared/core/content.js";
import { BASE_TOTAL, CATS, RNG, SAVE_KEY, codexPick, dailyCommissions, ensureDay, exhibitById, finishMake, mulberry32, newProfile, newSave, nowMs, partOf, pillowKeyOf, placeInHall, setRng, todayStr, visitorArrive } from "../../../shared/core/logic.js";
import { coopRoom } from "../../../shared/coop/base.js";
import { viewFor } from "../../../shared/coop/core.js";
import { coopAct, coopBegin } from "../../../shared/coop/flow.js";
import { assignJob } from "../../../shared/core/legacy.js";
import { hallSize, startCellar } from "../../../shared/core/systems.js";
import { storyState } from "../../../shared/story/state.js";
import { PASS_BLANK_AFTER } from "../../../shared/social/pass.js";
import { $, P, PANELS, SAVE, UI, applyBodyState, collectionItems, go, h, note, setP, setSave, useProfile } from "./ui_core.js";
import { focusExhibit, openBook } from "../rooms/ui_screens1.js";
import { pickJob } from "../rooms/ui_screens3.js";
import { overlay } from "../panels/ui_board.js";
import "./lyrics_tap.js"; // 歌詞對時工具（?lyrics-tap 加 #lobby，只在開發載入）
import { TASK_ICON, ptsPanel, taskCard } from "../panels/ui_tasks.js";
import { fightCard, fightOnRedraw, fightReplaySync, fightStage } from "../rooms/ui_fight.js";
import { routeCard, routeStage } from "../rooms/ui_route.js";
import { coopRouteOptions } from "../../../shared/coop/route.js";
import { cmapNode } from "../../../shared/cellar/map.js";

// #fight：不連伺服器，直接打開合作地下的守門打怪（地下室改版的畫面，ui_fight.js）。跟你壹隊的「小華」會自己選推。
//   #fight　壹開打；#fight:p2　推到第二階段；#fight:solo　壹個人（館方助手補位）；#fight:f3g　換成那隻怪物、那壹層的舞台（看圖用，數字不準）
// 規則照樣跑 shared/ 的 coopBegin、coopAct，只是存檔不存、不送伺服器。看排版、按鈕、結算的字用。
// #route：不連伺服器，直接打開今天的地圖選路（地下室改版，ui_route.js）。按「走這裡」之後那個點自動做完（房間選安全的、打怪都推、休息回理智、寶箱按繼續），再回到地圖
//   #route　B1；#route:3　第 3 層的地圖。看地圖的樣子用
function routePreview(arg) {
  const today = todayStr();
  let clock = nowMs();
  const floor = Math.max(1, Math.min(5, Number(arg) || 1));
  const mine = collectionItems("pepe").slice(0, 2).map(i => i.key);
  const s = coopBegin([{ id: "me", name: "小明", P, keys: mine }], 1, today, clock, { gate: true });
  if (!s.ok) { console.warn("#route 開不了：", s.reason); return; }
  const run = s.run, Ps = { me: P };
  if (floor > 1) { run.floor = floor; run.cmap = null; run.phase = "floorDone"; run.next = floor; run.floor = floor - 1; run.votes = {}; coopAct(run, Ps, "me", "floor", { go: "down" }, (clock = Math.max(clock + 1, nowMs()))); }
  const m = overlay("nb-party nb-coop", "地下收藏庫（開發用：地圖預覽）", "地圖預覽", "stairs");
  let sel = null;
  const finish = () => { // 把現在這個點做完
    for (let i = 0; i < 80 && run.phase !== "route" && run.phase !== "over" && run.phase !== "floorDone"; i++) {
      if (run.phase === "vote") { const r = coopRoom(run), c = Math.max(0, r.choices.findIndex(x => x.check.type === "none")); coopAct(run, Ps, "me", "vote", { choice: c }, (clock = Math.max(clock + 1, nowMs()))); }
      else if (run.phase === "fight") coopAct(run, Ps, "me", "fight", { act: "push" }, (clock = Math.max(clock + 1, nowMs())));
      else if (run.phase === "rest") coopAct(run, Ps, "me", "rest", { pick: "san" }, (clock = Math.max(clock + 1, nowMs())));
      else if (run.phase === "carry") coopAct(run, Ps, "me", "carry", { side: "skip" }, (clock = Math.max(clock + 1, nowMs())));
      else coopAct(run, Ps, "me", "ack", {}, (clock = Math.max(clock + 1, nowMs())));
    }
  };
  const draw = () => {
    const v = viewFor(run, "me"), me = v.members.find(x => x.id === "me");
    const body = run.phase === "route" ? [routeStage(v, sel, id => { sel = id; draw(); }), routeCard(v, me, { sel, mine: null, go: node => { coopAct(run, Ps, "me", "route", { node }, (clock = Math.max(clock + 1, nowMs()))); sel = null; finish(); draw(); } })]
      : [h("p", { class: "nb-empty" }, `走完了（${run.phase}）`)];
    m.surface.replaceChildren(h("div", { class: "cx-run" }, h("div", { class: "cx-main" }, ...body),
      h("aside", { class: "cx-side" }, h("p", { class: "pt-hint" }, `（預覽：能走 ${coopRouteOptions(run).length} 個點；真的遊戲這壹欄是隊員、證據和聊天）`))));
  };
  draw();
}
function fightPreview(arg) {
  const today = todayStr();
  let clock = nowMs();
  const mate = newProfile("challenge"); ensureDay(mate, today); mate.tutorialDone = true; mate.sanity = 66; assignJob(mate, "detective"); mate.day.quirkGiven = true;
  const mk = o => finishMake(mate, Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "綠", 帽子: "巫師帽", 姿勢: "站著" }, o), { natural: 40 }).key;
  const mine = collectionItems("pepe").slice(0, 2).map(i => i.key);
  const members = [{ id: "me", name: "小明", P, keys: mine }];
  if (arg !== "solo") members.push({ id: "mate", name: "小華", P: mate, keys: [mk({}), mk({ 顏色: "黃", 帽子: "棒球帽" })] });
  const Ps = { me: P, mate };
  const ids = members.map(m => m.id);
  const s = coopBegin(members, 1, today, clock, { gate: true });
  if (!s.ok) { console.warn("#fight 開不了：", s.reason); return; }
  const run = s.run;
  for (let i = 0; i < 80 && run.phase !== "fight" && run.phase !== "floorDone" && run.phase !== "over"; i++) { // 房間都選安全的走完
    if (run.phase === "route") { // 地圖選路：壹路走探索房、最後休息，再來是守門
      const opts = coopRouteOptions(run), kind = id => cmapNode(run.cmap, id).kind;
      const pick = opts.find(id => kind(id) === "explore") || opts.find(id => kind(id) === "rest") || opts.find(id => kind(id) === "gate") || opts[0];
      ids.forEach(id => { if (run.phase === "route") coopAct(run, Ps, id, "route", { node: pick }, (clock = Math.max(clock + 1, nowMs()))); });
    } else if (run.phase === "rest") ids.forEach(id => coopAct(run, Ps, id, "rest", { pick: "san" }, (clock = Math.max(clock + 1, nowMs()))));
    else if (run.phase === "vote") { const r = coopRoom(run), c = Math.max(0, r.choices.findIndex(x => x.check.type === "none")); ids.forEach(id => coopAct(run, Ps, id, "vote", { choice: c }, (clock = Math.max(clock + 1, nowMs())))); }
    else if (run.phase === "carry") ids.forEach(id => coopAct(run, Ps, id, "carry", { side: "skip" }, (clock = Math.max(clock + 1, nowMs()))));
    else ids.forEach(id => coopAct(run, Ps, id, "ack", {}, (clock = Math.max(clock + 1, nowMs()))));
  }
  if (/^f[1-5][abg]$/.test(arg || "") && run.fight) { run.fight.foe = arg; run.floor = Number(arg[1]); }
  if (arg === "p2") for (let i = 0; i < 12 && run.phase === "fight" && run.fight.phase === 1; i++) ids.forEach(id => coopAct(run, Ps, id, "fight", { act: "push" }, (clock = Math.max(clock + 1, nowMs()))));
  const m = overlay("nb-party nb-coop", "地下收藏庫（開發用：打怪預覽）", "打怪預覽", "stairs");
  let pick = null;
  const draw = () => {
    const v = viewFor(run, "me"), me = v.members.find(x => x.id === "me");
    fightReplaySync(v);
    const body = run.phase === "fight" && v.fight
      ? [fightStage(v, pick), fightCard(v, me, { mine: pick, setMine: p => { pick = p; draw(); }, act: d => { coopAct(run, Ps, "me", "fight", d, (clock = Math.max(clock + 1, nowMs()))); setTimeout(() => { if (run.phase === "fight" && ids.includes("mate")) coopAct(run, Ps, "mate", "fight", { act: "push" }, (clock = Math.max(clock + 1, nowMs()))); pick = null; draw(); }, 1500); } })]
      : [h("p", { class: "nb-empty" }, `打完了（${run.phase}）：${JSON.stringify(run.fightLast || run.last && run.last.fled || "")}`)];
    m.surface.replaceChildren(h("div", { class: "cx-run" }, h("div", { class: "cx-main" }, ...body),
      h("aside", { class: "cx-side" }, h("p", { class: "pt-hint" }, "（預覽：真的遊戲這壹欄是隊員、證據和聊天）"))));
  };
  fightOnRedraw(() => draw());
  draw();
}

// 假伺服器的網址可以用中文頁籤名：#casino:餐車、#bank:財報
const CAS_ALIAS = { 牌桌: "table", 餐車: "diner", 大禮包: "gift", 我的: "mine" };
const BANK_ALIAS = { 財報: "report", 金流: "flow", 股票: "stock", 存款: "save", 借款: "loan", 館債: "bond" };
(function () {
  const want = decodeURIComponent((location.hash || "").slice(1));
  if (!want) return;
  window.__PM_NODOOR__ = true; // 截圖直接進畫面，不放開館布幕
  const [screen, arg, extra] = want.split(":");
  setTimeout(async () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 沒關係 */ }
    setSave(newSave()); SAVE.tutorialDone = true; SAVE.gen2Migrated = true;
    SAVE.profiles.challenge = newProfile("challenge");
    useProfile("challenge");
    setRng(mulberry32(42));
    CATS.forEach(c => partOf(c).options.forEach(o => { if (!o.forbidden && !o.mix && o.limited !== "show" && o.limited !== "week" && !P.unlocked[c].includes(o.name) && o.name !== "皇冠" && o.name !== "斯拉夫蹲") P.unlocked[c].push(o.name); }));
    P.unlockCount = 8;
    for (let i = 0; i < 150; i++) finishMake(P, codexPick(Math.floor(RNG() * BASE_TOTAL)), { natural: 1 + Math.floor(RNG() * 99) });
    const legend = { 稀有度: "普通", 心情: "開心", 顏色: "綠", 帽子: "巫師帽", 姿勢: "站著" };
    finishMake(P, legend, { natural: 2 });
    finishMake(P, { 稀有度: "普通", 心情: "俄國8+9", 顏色: "黑", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 9 });
    finishMake(P, { 稀有度: "普通", 心情: "生氣", 顏色: "黃", 帽子: "沒有", 姿勢: "站著" }, { natural: 100 });
    const its = collectionItems("pepe");
    its.slice(0, 5).forEach((it, i) => placeInHall(P, i, it));
    const pk = pillowKeyOf({ 尺寸: "標準", 材質: "絨毛", 填充: "軟綿綿" }, "p:" + its[0].key); P.pillows[pk] = 1;
    P.plPrint = "p:" + its[0].key;
    for (let i = 0; i < 4; i++) visitorArrive(P);
    ["portrait", "strange", "rare", "statue"].forEach(id => { P.seen[id] = 1; });
    P.chaptersRead[0] = true; P.chaptersRead[1] = true;
    dailyCommissions(P, P.day.date)[1].done = true;
    P.insp = 37; P.mood = 55; P.sanity = arg === "lowsan" ? 28 : 64; P.myth = 3;
    if (arg === "bout") P.bout = { i: 3, left: 4 };
    if (arg === "quirk") P.quirks = [{ type: "phobia", cat: "帽子", opt: null, since: P.day.date, until: nowMs() + 5 * 86400000 + 5000, task: "calm", done: [] }, { type: "mania", cat: "顏色", opt: "綠", since: P.day.date, until: nowMs() + 2 * 86400000 + 5000, task: "hug", done: [P.day.date] }]; // 怪癖（決定 0046）
    if (typeof assignJob === "function") { assignJob(P, "historian"); P.skillTicks = { 鑑賞: true }; P.upgrades = { ped7: "2026-11-08", repair: "2026-11-08" }; while (P.hall.length < hallSize(P)) P.hall.push(null); }
    if (screen === "lobby" && /^pool/.test(arg || "")) UI.pool = { low: { lv: 2, dir: -1, band: "low", night: false, trace: [9, 7, 6, 4, 3, 3, 2], hits: 0 }, mid: { lv: 12, dir: 1, band: "mid", night: true, trace: [8, 9, 10, 11, 11, 12, 12], hits: 1 }, edge: { lv: 19, dir: 1, band: "edge", night: false, trace: [14, 15, 17, 18, 19, 19, 19], hits: 2 }, over: { lv: 24, dir: 1, band: "over", night: true, trace: [18, 19, 21, 22, 23, 24, 24], hits: 4 } }[arg.slice(4)] || { lv: 12, dir: 0, band: "mid", night: false, trace: [], hits: 0 };
    if (/^pnm/.test(arg || "")) { const k = its.map(i => i.key); P.nmSeq = 2; P.pepes[k[0]].nm = "小綠"; P.pepes[k[0]].nmSeq = 1; P.pepes[k[1]].tk = { no: 7, day: "2026-11-18", n: 1, stamp: false, was: "舊名" }; P.pepes[k[1]].nm = ""; P.pepes[k[2]].nm = "新名字"; P.pepes[k[2]].nmSeq = 2; P.pepes[k[2]].tk = { no: 12, day: "2026-11-18", n: 1, stamp: true, was: "舊" }; } // 取名的示範（決定 0133）
    setRng(null);
    // 假伺服器（mock_net.js）：賭場、銀行、館友證要登入才看得到，這裡換成假的 NET（不連網路），畫面用錄下來的伺服器回應。網址加 ?mock 任何畫面都用
    if (/^(casino|bank|pass)$/.test(screen) || /[?&]mock/.test(location.search)) (await import("./mock_net.js")).installMock();
    if (screen === "route") { go("lobby", {}, { action: false }); setTimeout(() => routePreview(arg), 300); return; }
    if (screen === "fight") { go("lobby", {}, { action: false }); setTimeout(() => fightPreview(arg), 300); return; }
    if (screen === "cellarrun") { const keys = collectionItems("pepe").slice(0, 3).map(i => i.key); startCellar(P, 1, keys); go("cellar", {}, { action: false }); return; }
    if (screen === "fusion2") { const it = collectionItems("pepe"); UI.fusion = [{ key: it[0].key }, { key: it[1].key }]; go("fusion", {}, { action: false }); return; }
    if (screen === "jobpick") { P.job = null; P.perk = null; P.flaw = null; go("lobby", {}, { action: false }); setTimeout(() => pickJob(), 200); return; }
    applyBodyState();
    if (screen === "title") { setP(null); go("title", {}, { action: false }); return; }
    if (screen === "titlehover") { setP(null); go("title", {}, { action: false }); setTimeout(() => [...document.querySelectorAll(".t-actions .btn")].pop().dispatchEvent(new MouseEvent("mouseenter")), 300); return; }
    if (screen === "reveal") { go("reveal", { res: finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "皇冠", 姿勢: "比讚" }, { natural: 1 }) }, { action: false }); return; }
    if (screen === "roll") { go("reveal", { pick: Object.assign({}, legend), roll: { total: 7, faces: [0, 7] } }, { action: false }); return; }
    if (screen === "focus") { go("gallery", {}, { action: false }); setTimeout(() => focusExhibit(exhibitById(extra || "strange")), 300); return; }
    if (screen === "ending") { go("ending", { id: arg || "curator" }, { action: false }); return; }
    // 簽到卡、簽到日曆（11-09，決定 0030）：#signin、#calendar；兌換所（決定 0032）：#shop，放好 40 枚週章
    if (screen === "shop") storyState(P).stamps = 40;
    // #pass:blank → 館友證「佩佩與書」那頁，已經讀懂 u-m-count（看多出來的那壹格空白，W48 d7）
    if (screen === "pass" && arg === "blank") { P.understood = Object.assign({}, P.understood, { [PASS_BLANK_AFTER]: todayStr() }); go("lobby", {}, { action: false }); setTimeout(() => PANELS.pass({ tab: "pepe" }), 300); return; }
    // #casino:德州 → 直接進德州（假伺服器 ?mock&holdem=play／other／over 看打牌中、結算；沒帶 holdem 就是開桌畫面）
    if (screen === "casino" && (arg === "德州" || arg === "holdem")) { go("lobby", {}, { action: false }); setTimeout(async () => { const P0 = await import("../panels/ui_party.js"), C0 = await import("../rooms/casino/ui_casino.js"); if (/[?&]holdem=/.test(location.search)) { P0.PARTY_HOOKS.holdem.open("mock-pid"); return; } if (PANELS.casino) PANELS.casino({ tab: "table" }); setTimeout(() => { const cs = C0.casinoState(); if (cs) { cs.game = "holdem"; C0.casinoRefresh(); } }, 500); }, 300); return; }
    if (screen === "signin" || screen === "calendar" || screen === "shop" || screen === "casino" || screen === "pass" || screen === "today") { go("lobby", {}, { action: false }); setTimeout(() => PANELS[screen] && PANELS[screen](screen === "casino" && arg && arg !== "lowsan" ? { tab: CAS_ALIAS[arg] || arg } : undefined), 300); return; } // #casino:餐車 → 賭場開在那一頁（casTabOf 認得的名字：table、diner…）
    if (screen === "bank") { UI.bankTab = arg && arg !== "lowsan" ? BANK_ALIAS[arg] || arg : "report"; go("bank", {}, { action: false }); return; } // #bank:股票 → 銀行開在那一頁（report、flow、stock、save、loan、bond）
    // #tasks：每日任務的畫面零件（11-20，ui_tasks.js），假資料；#tasks:full 是領得到的樣子
    if (screen === "tasks") {
      go("lobby", {}, { action: false });
      setTimeout(() => {
        const m = overlay("nb-story", "每週劇情", "每週劇情和劇情線", "book"), full = arg === "full";
        const ms = [100, 200, 300, 400, 500].map((at, i) => ({ at, state: full ? (i < 2 ? "claimed" : i < 4 ? "ready" : "wait") : (i < 1 ? "claimed" : "wait"), reward: {}, chips: at === 400 ? 200000 : 0, box: at === 300 || at === 500 }));
        const txt = v => ({ 100: "心情 +5", 200: "靈感 +3", 300: "週章 1 枚、籌碼禮盒", 400: "靈感 +4、籌碼 200,000", 500: "週章 1 枚、物品、籌碼禮盒" })[v.at];
        const mk = (kind, text, state, giver, says, done, pts, n, tgt, where) => taskCard({ t: { kind, giver, says, done }, sayText: giver && says ? (state !== "todo" && done ? done : says) : null, text, kindIcon: TASK_ICON[kind], pts, n, tgt, reward: { insp: 1, mood: 1 }, state, where, onGo() {}, onClaim() {} });
        m.surface.replaceChildren(h("div", { class: "sp-body" }, h("section", { class: "sp-sec" }, h("h3", null, "今天的每日任務（第 5 天）"),
          ptsPanel({ td: full ? 120 : 65, cap: 120, wk: full ? 340 : 160, goal: 500, ms, milesText: txt, onClaim() {} }),
          h("ul", { class: "sp-tasks" },
            mk("food", "到餐車吃一樣東西", "todo", "hall", "今天的葡萄酒，我推。", "", 15, 0, 1, true),
            mk("casino", "在賭場打一手 21 點", "done", "yuga", "來一手，輸贏隨你。", "手氣不錯嘛。", 20, 1, 1, true),
            mk("sign", "簽到", "claimed", "clerk", "蓋個章再走。", "章蓋好了，慢走。", 10, 1, 1, true),
            mk("stockLook", "看一支集團股的走勢", "todo", "scale", "多看兩眼，不吃虧。", "", 15, 0, 1, true),
            mk("deliver", "送壹隻佩佩給館友", "todo", "postman", "這封信只寫了名字。你替我送壹隻佩佩過去。", "", 20, 0, 1, true),
            mk("view", "看壹位館友的展廳", "todo", "number", "叫號：七。請到收藏庫小門旁。", "", 15, 0, 1, true),
            mk("make", "做 2 隻佩佩", "todo", null, "", "", 25, 1, 2, true))))); }, 300);
      return;
    }
    // #toast：連發好幾則提示（任務完成合併成壹則、手機最多 2 則，11-20）
    if (screen === "toast") { go("lobby", {}, { action: false }); setTimeout(() => { for (let i = 1; i <= 5; i++) note(`任務完成：做 ${i} 隻佩佩。到「每週劇情」領獎勵。`, "good"); note("書架多了壹本：〈測試〉", "good"); note("領到了：靈感 +1", "good"); }, 600); return; }
    if (screen === "book") { go("origin", {}, { action: false }); setTimeout(() => openBook(STORY_CHAPTERS[0], $(".reader")), 300); return; }
    go(screen, arg && !["lowsan", "bout", "quirk"].includes(arg) && !/^pool/.test(arg) && !/^pnm/.test(arg) && screen !== "tasks" ? { tab: arg } : {}, { action: false });
  }, 150);
})();
