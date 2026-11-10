// 開發用：網址後面加 #畫面 就直接打開那個畫面，並放好假的收藏。只在 npm run dev 時載入（main.js），不會進正式打包。
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { STORY_CHAPTERS } from "../../shared/content.js";
import { BASE_TOTAL, CATS, RNG, SAVE_KEY, codexPick, dailyCommissions, exhibitById, finishMake, mulberry32, newProfile, newSave, nowMs, partOf, pillowKeyOf, placeInHall, setRng, visitorArrive } from "../../shared/logic.js";
import { assignJob, hallSize, startCellar } from "../../shared/logic3.js";
import { storyState } from "../../shared/story.js";
import { $, P, PANELS, SAVE, UI, applyBodyState, collectionItems, go, setP, setSave, useProfile } from "./ui_core.js";
import { focusExhibit, openBook } from "./ui_screens1.js";
import { pickJob } from "./ui_screens3.js";

(function () {
  const want = decodeURIComponent((location.hash || "").slice(1));
  if (!want) return;
  window.__PM_NODOOR__ = true; // 截圖直接進畫面，不放開館布幕
  const [screen, arg, extra] = want.split(":");
  setTimeout(() => {
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
    setRng(null);
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
    if (screen === "signin" || screen === "calendar" || screen === "shop" || screen === "casino" || screen === "pass") { go("lobby", {}, { action: false }); setTimeout(() => PANELS[screen] && PANELS[screen](), 300); return; }
    if (screen === "book") { go("origin", {}, { action: false }); setTimeout(() => openBook(STORY_CHAPTERS[0], $(".reader")), 300); return; }
    go(screen, arg && !["lowsan", "bout", "quirk"].includes(arg) ? { tab: arg } : {}, { action: false });
  }, 150);
})();
