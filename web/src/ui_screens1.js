// ================================================================
//  畫面 1–5、7：開場、大廳、畫廊、圖書館、手作坊、揭曉
// ================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { CAS_TEXT } from "../../shared/casino_text.js";
import { EXHIBITS, GALLERY_INTRO, GEN_TEXT, LEGACY, NUM, ORIGIN, RARITY_TABLE, UPGRADES } from "../../shared/config.js";
import { FAILED_WORK_TEXT, FIND_DIFF_TEXT, FORBIDDEN_BOOKS, FREE_MODE_TEXT, MOOD_RECOVER_TEXT, PERFECT_WORK_TEXT, ROOM_HINTS, SAN_ASIDES, TITLE_TAGLINE, TUTORIAL_TEXT } from "../../shared/content.js";
import { BOOK4, LEGACY_TEXT, ROOM_HINTS3, UNDERSTAND_TEXT, VISITOR_TEXT } from "../../shared/content3.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { CATS, CORE_TOTAL, FAILED, RARITY_ORDER, RNG, ROLLED, activeQuirks, addMyth, understandTarget, allChapters, allOpts, asList, baseOpts, blockedWhy, bookMyth, canMake, chapterOpen, clampN, codexCount, d100Faces, dailyCommissions, decoOpen, describePepe, doUnlock, exhibitById, exhibitOpen, fill, finishChapter, finishMake, galleryInsp, isBlocked, isFree, isUnlocked, knownTotal, makeCost, maniaQuirk, maxSan, miniReward, moodRecovery, newProfile, num, optOf, pad, partOf, pepeKey, pickOne, possibilities, progressEvents, pushRoll, quirkName, rarityOfRoll, rarityRank, moodNoteOf, readOrigin, reviewsLeft, sanSpecFor, spendRange, startMake, unlockState, usable, viewExhibit, viewsToday } from "../../shared/logic.js";
import { bookSequels, cellarFloors, fusionLeft, hasTalent, hasUp, understandList, rereadTry, rereadReady, jobInfo, rerollTens, rerollsLeft, roomProgress, sequelEvents, sequelOpen, sequelVisible, skillCheck, unlockSequel, upgradeState } from "../../shared/logic3.js";
import { FRESH_KEY, freshRooms, freshUnder, isFresh } from "../../shared/fresh.js";
import { nextStep } from "../../shared/guide.js";
import { addVisitor, cleanName, freeSlots, renameVisitor, switchVisitor, visitorSlots } from "../../shared/visitors.js";
import { traitDesc, traitName } from "../../shared/legacy.js";
import { noteCraft, $, planPortrait, $$, ADDONS, understandFlow, HIDE_CHROME, IMG, P, PANELS, RCOLOR, ROOM_NAMES, SAVE, SCREENS, UI, actionTick, applySettings, ask, btn, checkEnding, collectionItems, costText, every, freshMark, freshTag, frogHTML, go, h, icon, inspHave, itemHTML, later, limitPill, miniPill, motionOff, navTo, note, noteCured, pepePlacard, persist, placard, placeTarget, ptNode, quirkCureText, quirkHereBox, quirkLeftNode, quirkLeftText, quirkMakeBox, quirkProgText, rdot, rerender, sanFlow, sanShort, sanWords, showEvents, snd, updateStatus, useProfile, wait } from "./ui_core.js";
import { colorGame } from "./ui_screens2.js";
import { askVisitorName, growthFlow, legacyFill, pickJob, visitorLabel } from "./ui_screens3.js";
import { enliven } from "./ui_curio.js";
import { lobbyFriends, loginArea, refreshLogin } from "./ui_login.js";
import { ORIGIN_TABS, galleryAuction, galleryCollect, galleryRules, galleryShell, originTabs, storyLobby, storyShelf, storyShow, weekUnderstood } from "./ui_story.js"; // 每週劇情（11-09）

// 介面重塑（翊文 11-13，docs/介面整合規劃.md 第六步）：最下面收藏的抽屜。平常壹排縮圖，按銅拉環拉開才有頁籤和篩選（css/onescreen.css 的 .onescreen-drawer）
export function onescreenDrawer(strip, label = "你的收藏") {
  const drawer = h("div", { class: "onescreen-drawer" });
  const pull = h("button", { type: "button", class: "onescreen-pull", "aria-expanded": "false", title: "拉開：換頁籤、篩選" }, h("span", null, label));
  pull.addEventListener("click", () => { const open = drawer.classList.toggle("open"); pull.setAttribute("aria-expanded", String(open)); });
  drawer.append(pull, strip);
  return drawer;
}
export function roomHead(title, sub, ...extra) {
  const back = UI.screen && UI.screen !== "lobby" && !HIDE_CHROME.includes(UI.screen) && P ? btn([icon("lobby"), " 回大廳"], () => navTo("lobby"), "ghost small rh-back") : null;
  return h("header", { class: "room-head" }, h("h1", null, title), sub ? h("p", { class: "sub" }, sub) : null, back ? h("div", { class: "rh-row" }, back) : null, extra.length ? h("div", { class: "head-tools" }, extra) : null); // 回大廳在標題下面靠左，每個房間同壹個位置
}

// ---------- 1 開場 ----------
// 多人版 M1（翊文 11-08：「首頁可以改成登入」）：標題中間那一塊是 ui_login.js 的 loginArea()。
// 還沒登入只有登入的框；登入、讀到伺服器的存檔之後，才放下面這些按鈕（titleActions 每次重新做，因為存檔換了）
SCREENS.title = root => {
  // 新參觀者的教學還沒走完就回到門口（選單「換參觀者」、登出、別的分頁先存了）：把教學的對話框收掉（11-08 修）
  if (FX.spotlightEnd) FX.spotlightEnd("gone");
  root.append(h("div", { class: "t-wrap" },
    h("h1", { class: "t-name" }, GEN_TEXT.museum),
    h("div", { class: "t-orn", "aria-hidden": "true" }),
    h("div", { class: "t-en" }, "PEPE MUSEUM"),
    h("div", { class: "t-est" }, "EST. MMXXI"),
    h("p", { class: "t-tag" }, TITLE_TAGLINE),
    loginArea(titleActions)), titleMusicBtn());
};
// 按鈕的名字（翊文 11-08：「進館跟繼續這兩個鈕名稱不太對，繼續參觀應該才要是主要的，進館應該改稱新參觀者」）。
// 多位參觀者（翊文 11-08：「玩家可以選擇和命名多個參觀者」，決定 0018；規則在 shared/visitors.js）：
//   - 挑戰模式有進度：三個位子的卡片（visitorSlotsBox）。有人的位子「繼續參觀」（上次玩的那位是主要的金色按鈕）、可以改名字；空位子「新參觀者」。
//   - 沒有進度：「新參觀者」（主要）＋自由模式，跟以前一樣。
//   - 「新參觀者」先取名字再擲心情、選職業：每一位都從 6 個職業選，再抽一個小優點、一個小缺點（pickJob；決定 0028，以前空位子加的是從 3 位候選人挑）。
//   - 「新參觀者」不會再清掉博物館（以前按兩次會整個重新開始）。
function titleActions() {
  const C = SAVE.profiles.challenge;
  const first = C ? null : btn(VISITOR_TEXT.add, () => firstVisitor(), "primary");
  const free = btn("自由模式", () => {
    if (!SAVE.profiles.free) SAVE.profiles.free = newProfile("free");
    useProfile("free"); go("lobby"); afterEnter();
  }, "ghost");
  const mig = UI.migrated ? h("p", { class: "t-note" }, `第 2 代的 ${UI.migrated} 件收藏搬進了自由模式。`)
    : UI.fromAdv ? h("p", { class: "t-note" }, "進階版的存檔搬過來了（進階版的檔案照樣能玩，兩邊的存檔分開）。") : null;
  // 自由模式的說明：滑鼠移到「自由模式」按鈕上（或用鍵盤選到它）才出現
  const freeNote = h("p", { class: "t-free", id: "tFreeNote" }, h("b", null, "自由模式："), FREE_MODE_TEXT);
  free.setAttribute("aria-describedby", "tFreeNote");
  const showNote = on => freeNote.classList.toggle("show", on);
  free.addEventListener("mouseenter", () => showNote(true));
  free.addEventListener("mouseleave", () => showNote(false));
  free.addEventListener("focus", () => showNote(true));
  free.addEventListener("blur", () => showNote(false));
  return [C ? visitorSlotsBox(C) : null, h("div", { class: "t-actions" + (C ? " vs-free" : "") }, first, free), freeNote, mig];
}
// 三個位子：有人的一張卡（名字、第幾位、職業、理智、心情），空的「新參觀者」。
// 名字是玩家打的字：一律用 h() 的字串（純文字），不用 html:
export function visitorSlotsBox(C) {
  const slots = visitorSlots(C);
  return h("section", { class: "vs-wrap", "aria-label": VISITOR_TEXT.slotsTitle },
    h("p", { class: "vs-head" }, h("b", null, VISITOR_TEXT.slotsTitle), h("span", null, legacyFill(VISITOR_TEXT.slotsSub, { x: LEGACY.slots }))),
    h("div", { class: "vs-slots" }, slots.map((s, i) => (s ? slotCard(s) : emptySlot(i)))));
}
function slotCard(s) {
  const j = s.job ? jobInfo(s.job) : null;
  const stat = (k, v) => h("span", { class: "vs-stat" }, h("small", null, k), h("b", null, v));
  const play = btn(VISITOR_TEXT.cont, () => playVisitor(s.vid), s.current ? "primary" : "");
  const ren = h("button", { type: "button", class: "t-link vs-rename", "aria-label": `${VISITOR_TEXT.rename}：${s.name}` }, VISITOR_TEXT.rename);
  ren.addEventListener("click", () => renameFlow(s));
  return h("article", { class: "vs-card" + (s.current ? " cur" : "") + (s.dark ? " dark" : "") + (s.work ? " working" : ""), "aria-label": `${s.name}・第 ${s.visitor} 位參觀者` },
    s.current ? h("span", { class: "vs-last" }, VISITOR_TEXT.last) : null,
    h("div", { class: "vs-top" }, h("span", { class: "vs-badge", html: j && ART.jobBadge ? ART.jobBadge(s.job) : ART.icon("frog") }),
      h("div", { class: "vs-id" }, h("b", { class: "vs-name" }, s.name), h("span", { class: "vs-no" }, [s.vname ? `第 ${s.visitor} 位參觀者` : null, j ? j.name : "還沒選職業"].filter(Boolean).join("・")))),
    h("div", { class: "vs-stats" }, stat("理智", `${s.sanity}／${s.maxSan}`), stat("心情", String(s.mood))),
    // 小優點、小缺點（決定 0028：每一位選職業時抽；0028 以前的第一位沒有，就不放）。效果寫在 title，館長室的名片上有完整的
    s.perk || s.flaw ? h("div", { class: "vs-traits" }, [["perk", s.perk], ["flaw", s.flaw]].filter(x => x[1]).map(([k, id]) =>
      h("span", { class: "vw-tag " + k, title: traitDesc(id) }, `${k === "perk" ? LEGACY_TEXT.perk : LEGACY_TEXT.flaw}・${traitName(id)}`))) : null,
    s.work ? h("p", { class: "vs-warn vs-work" }, (ADDONS.workLine && ADDONS.workLine()) || CAS_TEXT.workSlot)
      : s.dark ? h("p", { class: "vs-warn" }, VISITOR_TEXT.dark) : s.picking ? h("p", { class: "vs-warn" }, VISITOR_TEXT.picking) : null,
    // 在地下室工作的（決定 0064）：不能上場，改成「花靈感幫他」
    h("div", { class: "vs-acts" }, s.work ? (ADDONS.workCheer && UI.work ? btn(CAS_TEXT.workCheer, () => ADDONS.workCheer(), "") : null) : play, ren));
}
function emptySlot(i) {
  const add = btn([icon("plus"), " ", VISITOR_TEXT.add], () => addVisitorFlow(i), "");
  return h("article", { class: "vs-card empty", "aria-label": VISITOR_TEXT.empty },
    h("div", { class: "vs-top" }, h("span", { class: "vs-badge empty", html: ART.icon("user") }), h("div", { class: "vs-id" }, h("b", { class: "vs-name" }, VISITOR_TEXT.empty), h("span", { class: "vs-no" }, VISITOR_TEXT.emptySub))),
    h("div", { class: "vs-acts" }, add));
}
// 繼續參觀：換到這位（現在這位收進 P.visitors），再進館
function playVisitor(vid) {
  const C = SAVE.profiles.challenge;
  if (!C || !switchVisitor(C, vid)) return;
  useProfile("challenge"); go("lobby"); afterEnter();
}
async function renameFlow(s) {
  const C = SAVE.profiles.challenge;
  const name = await askVisitorName({ title: VISITOR_TEXT.rename, sub: legacyFill(VISITOR_TEXT.renameSub, { max: LEGACY.nameMax }), value: s.vname || "", ok: VISITOR_TEXT.save });
  if (!name || !C) return;
  if (!renameVisitor(C, s.vid, name)) return;
  persist(); snd("click");
  note(legacyFill(VISITOR_TEXT.renamed, { name }), "good");
  refreshLogin();
}
// 整個帳號的第一位：取名字 → 擲心情 → 選職業（6 個職業）、抽小優缺點（決定 0028：第一位也抽）
async function firstVisitor() {
  if (SAVE.profiles.challenge) { refreshLogin(); return; }
  const name = await askVisitorName({ sub: legacyFill(VISITOR_TEXT.firstSub, { max: LEGACY.nameMax }) });
  if (name) await startChallenge(name);
}
// 在空位子加一位：取名字 → 擲心情 → 選職業、抽小優缺點（跟第一位一樣，不用留遺物；決定 0028）
export async function addVisitorFlow(slot) {
  const C = SAVE.profiles.challenge;
  if (!C) { firstVisitor(); return; }
  if (!freeSlots(C).length) { note(VISITOR_TEXT.full, "bad"); refreshLogin(); return; }
  const name = await askVisitorName({ sub: legacyFill(VISITOR_TEXT.addSub, { max: LEGACY.nameMax }) });
  if (!name) return;
  const r = addVisitor(C, name, slot);
  if (!r) { note(VISITOR_TEXT.full, "bad"); refreshLogin(); return; }
  useProfile("challenge");
  go("lobby", {}, { action: false });
  await FX.rollOverlay({ title: "擲心情", sub: MOOD_ROLL_SUB, spec: "3D6", result: { total: r.total, faces: r.faces }, outcome: { text: `${visitorLabel(P)}：心情 ${P.mood}　理智 ${P.sanity}`, tone: "neutral" } });
  updateStatus();
  await pickJob(); // 從 6 個職業選，再抽小優點、小缺點
  afterEnter();
}
const MOOD_ROLL_SUB = "像克蘇魯建角色：擲 3 顆 6 面骰加起來，再 × 5。心情就是你的幸運，之後可以花掉來改骰子。";
// 標題畫面右下角：瀏覽器要先點壹下才准出聲，所以給壹顆「開啟音樂」（點畫面任何地方也會開）
export function titleMusicBtn() {
  const on = () => FX.sound.state && FX.sound.state().running && FX.sound.state().amb === "title" && !SAVE.settings.muted; // 聲音真的在播才算
  const b = h("button", { type: "button", class: "t-music" + (on() ? " on" : ""), title: "瀏覽器要先點壹下畫面，才會出聲" }, on() ? "♪ 音樂開著" : "♪ 點壹下開啟音樂");
  const refresh = () => { b.classList.toggle("on", on()); b.textContent = on() ? "♪ 音樂開著" : SAVE.settings.muted ? "♪ 現在是靜音（點壹下打開）" : "♪ 點壹下開啟音樂"; };
  b.addEventListener("click", () => { if (SAVE.settings.muted) { SAVE.settings.muted = false; applySettings(); persist(); } FX.sound.sync(); setTimeout(refresh, 80); setTimeout(refresh, 500); });
  const iv = setInterval(() => { if (!b.isConnected) { clearInterval(iv); return; } refresh(); }, 700); // 點畫面別的地方開了聲音，按鈕也跟著變
  return b;
}
// 整個帳號的第一位參觀者（name ＝玩家取的名字）。已經有博物館就不做：不會清掉收藏（決定 0018）
export async function startChallenge(name) {
  if (SAVE.profiles.challenge) return;
  SAVE.profiles.challenge = newProfile("challenge");
  SAVE.profiles.challenge.vname = cleanName(name);
  useProfile("challenge");
  go("lobby", {}, { action: false });
  const f = P.moodRoll;
  await FX.rollOverlay({ title: "擲心情", sub: MOOD_ROLL_SUB, spec: "3D6",
    result: { total: f.reduce((a, b) => a + b, 0), faces: f }, outcome: { text: `心情 ${P.mood}　理智 ${P.sanity}`, tone: "neutral" } });
  updateStatus();
  await pickJob();
  afterEnter();
}
export async function afterEnter() {
  if (!P) return;
  if (PANELS.casinoResume && await PANELS.casinoResume()) return; // 賭場同桌坐到一半（重新整理過、斷線回來）：接回去（ui_casino_table.js）
  if (PANELS.coopResume && await PANELS.coopResume()) return; // 合作地下走到一半（重新整理過、斷線回來）：接回去，關掉之後會再叫一次（ui_coop.js）
  if (!isFree(P) && P.dark) { await checkEnding(); return; } // 燈熄了的那位（換人時留著的）：直接回黑房間找那扇門
  if (!isFree(P) && ADDONS.workCheck) ADDONS.workCheck(); // 欠款中要送人去地下工作、在工作的還清了回來（決定 0064，ui_work.js）。不等它
  if (!isFree(P) && ADDONS.lostSync) ADDONS.lostSync(); // 招領單：把自己館裡最近理智歸零的參觀者寫上去（翊文 11-13，ui_lost.js）。不等它
  if (!isFree(P) && !P.job) await pickJob(); // 進階版搬過來的存檔、下一位參觀者：先選職業
  if (!isFree(P) && !SAVE.tutorialDone) { await wait(500); await tutorial(); }
  if (UI.screen === "title" || !P) return; // 教學走到一半回到門口了：今天的心情、公告等進館再說（11-08 修）
  await dailyRecovery();
  if (PANELS.autoMail) await PANELS.autoMail(); // 館友寄來的信、請你去看展廳：大提示卡，排在公佈欄、簽到卡前面，關了才跳下一張（11-09，ui_visit.js）
  if (UI.screen === "title" || !P) return;
  if (PANELS.autoBoard) PANELS.autoBoard(); // 公佈欄：有新公告就打開壹次（11-08）
  if (PANELS.autoSignin) PANELS.autoSignin(); // 簽到卡：公佈欄關了才跳；今天簽過就不跳（11-09，ui_signin.js）
}
export async function dailyRecovery() {
  if (!UI.pendingRecovery || isFree(P)) return;
  UI.pendingRecovery = false;
  const before = P.mood;
  const r = moodRecovery(P);
  await FX.rollOverlay({ title: "今天的心情", sub: `每天第一次進館：擲 1～100，擲出比心情 ${before} 大，心情就 +1～10`, spec: "d100", result: r.roll,
    outcome: r.up ? { text: `${MOOD_RECOVER_TEXT}：心情 +${r.gain.total}`, tone: "good" } : { text: "心情普普通通。", tone: "neutral" } });
  if (P.day && P.day.sanBack > 0) note(`睡了一覺，理智 +${P.day.sanBack}`, "good");
  updateStatus(); persist();
  await growthFlow();
}
export async function tutorial() {
  const steps = [() => $('.fp-room[data-room="gallery"]'), () => $("#status"), () => $('.fp-room[data-room="workshop"]')];
  for (let i = 0; i < steps.length; i++) {
    if (UI.screen !== "lobby") return; // 已經離開大廳（例如回到門口）：不在別的畫面上放教學，下次進館再從頭（11-08 修）
    const el = steps[i]();
    if (!el) continue;
    const r = await FX.spotlight(el, { text: TUTORIAL_TEXT[i], step: i + 1, total: steps.length });
    if (r === "gone") return; // 被收掉的（回到門口）：不算看完
    if (r === "skip") break;
  }
  SAVE.tutorialDone = true; persist();
}

// ---------- 2 大廳：館內平面圖 ----------
export function roomHasNew(id) {
  if (!P) return false;
  if (P.news[id]) return true;
  if (id === "gallery") return EXHIBITS.some(e => { const ex = exhibitById(e.id); return exhibitOpen(P, ex) && !P.seen[e.id]; });
  if (id === "origin") return !P.chaptersRead[0] || allChapters().some(c => chapterOpen(P, c.id) && !P.chaptersRead[c.id]);
  if (id === "workshop") return !isFree(P) && CATS.some(c => allOpts(c).some(n => { const s = unlockState(P, c, n); return s.state === "buy" && s.ok; }));
  if (id === "commission") return dailyCommissions(P, P.day.date).some(c => !c.done);
  if (id === "fusion") return !isFree(P) && fusionLeft(P) > 0 && Object.keys(P.pepes).length >= 2 && !P.stats.fused;
  if (id === "cellar") return !isFree(P) && Object.keys(P.pepes).length >= 3 && (P.cellar.best || 0) < cellarFloors().length && !P.cellar.floorsDone[(P.cellar.best || 0) + 1] && (P.cellar.best || 0) === 0;
  if (id === "office") return !isFree(P) && UPGRADES.some(u => { const s = upgradeState(P, u.id); return s.state === "buy" && s.ok; });
  return false;
}
SCREENS.lobby = root => {
  // 新的大廳（決定 0066，ui_lobby2.js）：總開關 NUM.ui.newLobby、玩家在設定頁選「舊的大廳」就走下面原本的
  if (ADDONS.useLobby2 && ADDONS.useLobby2() && ADDONS.lobby2) { const jobs2 = dailyCommissions(P, P.day.date).filter(c => !c.done).length;
    const rh = roomHead("大廳", isFree(P) ? FREE_MODE_TEXT : `今天有 ${jobs2} 張委託　你已經打開的可能性 ${num(possibilities(P))}／${num(knownTotal(P))}`);
    rh.classList.add("l2-sr"); // 標題留給朗讀，畫面上收起來：高度留給導覽圖
    root.append(rh); ADDONS.lobby2(root); return; }
  const portrait = planPortrait();
  const jobs = dailyCommissions(P, P.day.date).filter(c => !c.done).length;
  const sub = isFree(P) ? FREE_MODE_TEXT : `今天有 ${jobs} 張委託　你已經打開的可能性 ${num(possibilities(P))}／${num(knownTotal(P))}`;
  const progress = roomProgress(P);
  const imgs = Object.values(IMG).reduce((n, v) => n + asList(v).filter(Boolean).length, 0);
  progress.library = { text: imgs ? `你的圖 ${imgs} 張` : "還沒放圖", pct: null };
  const plan = h("div", { class: "plan" + (portrait ? " portrait" : ""), html: ART.floorPlan({ portrait, names: ROOM_NAMES, progress, fresh: freshRooms(P) }) }); // fresh：有新解開的東西的房間標「新」（11-08）
  if (ADDONS.planMates) ADDONS.planMates(plan); // 導覽圖上的館友（ui_mates.js）
  const hint = h("p", { class: "lobby-hint", "aria-live": "polite" }, portrait ? "點一間房走進去。" : "把滑鼠移到房間上看看。");
  // 新玩家的下壹步（翊文 11-08「先改前三個」，介面檢查第 2 項）：大廳標題下面壹條，電腦和手機都看得到；導覽圖上那間房發光
  const step = nextStep(P);
  const stepBar = step ? h("div", { class: "next-step", role: "status" },
    h("span", { class: "ns-tag" }, icon("sparkle"), " 下壹步"),
    h("div", { class: "ns-body" }, h("b", { class: "ns-text" }, step.text), h("span", { class: "ns-why" }, step.why)),
    btn(["走過去 ", h("span", { "aria-hidden": "true" }, "→")], () => navTo(step.room), "primary small")) : null;
  $$(".fp-room", plan).forEach(g => {
    const id = g.dataset.room;
    g.classList.toggle("has-new", roomHasNew(id));
    g.classList.toggle("is-goal", !!step && step.room === id);
    g.addEventListener("click", () => navTo(id));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navTo(id); } });
    const show = () => { hint.textContent = ROOM_HINTS[id] || (typeof ROOM_HINTS3 !== "undefined" && ROOM_HINTS3[id]) || ROOM_NAMES[id] || id; };
    g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
  });
  const mine = collectionItems("pepe");
  const feature = mine.length ? mine[Math.floor(Math.random() * Math.min(mine.length, 12))] : null;
  const side = h("aside", { class: "lobby-side" },
    feature ? (() => { const fb = h("div", { class: "frog live", html: itemHTML(feature) }); const wrap = h("div", { class: "lobby-feature" }, fb, pepePlacard(feature.pick, { perfect: feature.perfect })); enliven(fb, feature.pick); return wrap; })()
      : h("div", { class: "lobby-feature empty" }, placard(["還沒有作品", "先去畫廊找靈感，再到手作坊做你的第一隻佩佩。"])),
    !isFree(P) && (P.vname || P.visitor > 1) ? h("p", { class: "sub lobby-who" }, visitorLabel(P)) : null); // 多位參觀者（11-08）：有名字寫名字
  // 總覽（ui_hub.js，決定 0061）：下壹步、今天的事、簽到、本週劇情、館友證收成壹塊。自由模式沒有總覽，照舊排
  const hub = ADDONS.lobbyHub ? ADDONS.lobbyHub() : null;
  root.append(roomHead("大廳", sub), hub || stepBar, hub || !ADDONS.lobbyToday ? null : ADDONS.lobbyToday(), ADDONS.lobbyEvent ? ADDONS.lobbyEvent() : null, ADDONS.lobbyLive ? ADDONS.lobbyLive() : null, hub || !ADDONS.lobby ? null : ADDONS.lobby(), hub ? null : storyLobby(), lobbyFriends(), ADDONS.lobbyGuests ? ADDONS.lobbyGuests() : null, h("div", { class: "lobby-wrap" }, plan, side), hint); // lobbyFriends：在線的館友（多人版 M1）；lobbyGuests：你不在時誰來過（多人版 M2，ui_visit.js）；storyLobby：本週地下收藏庫（每週劇情，11-09）
};

// ---------- 3 畫廊：橫向走廊 ----------
SCREENS.gallery = (root, params) => {
  if (params.tab === "collect") return galleryCollect(root, params); // 我收藏的畫（藝術市場）
  if (params.tab === "auction") return galleryAuction(root, params); // 拍賣
  if ((params.show || params.tab === "show") && storyShow(root, params)) return; // 今日特展（每週劇情，11-09，ui_story.js）
  const sideBox = [];
  if (!isFree(P)) {
    const g0 = NUM.galleryInsp[0], gN = NUM.galleryInsp[NUM.galleryInsp.length - 1];
    sideBox.push(galleryRules("怎麼看",
      h("p", null, icon("sparkle"), h("span", null, h("b", { class: "em good" }, "越危險的畫，靈感越多"), `：不用理智檢定的畫，再看壹次 +${g0.review}；最危險的 +${gN.review}。第壹次看更多（+${g0.first}～+${gN.first}）。`)),
      h("p", null, icon("hourglass"), h("span", null, "同壹件展品，", h("b", { class: "em" }, `壹天最多再拿 ${g0.perDay}～${gN.perDay} 次靈感`), "（每幅畫底下寫著今天還剩幾次）。")),
      h("p", null, icon("eye"), h("span", null, "同壹天看同壹幅可怕的畫", h("b", { class: "em" }, `超過 ${NUM.habituate} 次`), "，就不怕了（理智只扣 0/1）；", h("b", { class: "em bad" }, "隔天又會怕"), "。"))));
  }
  const calmCure = !isFree(P) && activeQuirks(P).some(q => q.task === "calm"); // 有怪癖的治法是「看壹幅不可怕的畫」（11-09，決定 0027）
  if (calmCure) sideBox.push(quirkHereBox("calm"));
  const corridor = h("div", { class: "corridor gal-corridor", tabindex: "0", "aria-label": "走廊，可以左右滑動" });
  EXHIBITS.forEach(e => {
    const ex = exhibitById(e.id);
    const open = exhibitOpen(P, ex);
    const spec = open ? sanSpecFor(P, ex) : null;
    const unseen = open && !P.seen[ex.id]; // 沒看過的先蓋著布，點進去看了才掀開
    const frame = h("div", { class: `frame art-${ex.art}` + (unseen ? " covered" : ""), html: open ? ART.exhibit(ex.art) + (unseen ? '<div class="ex-cover" aria-hidden="true"><span>還沒看過</span></div>' : "") : "" });
    const cap = h("div", { class: "ex-cap" },
      open ? ptNode(ex.title, "ex-title") : h("span", { class: "ex-title" }, "？"),
      open && spec && !isFree(P) ? h("span", { class: "ex-san", title: `看的時候擲 1～100，擲出 ≤ 你的理智就算成功：${sanWords(spec)}` }, `理智 ${sanShort(spec)}`) : null,
      open && !P.seen[ex.id] ? h("span", { class: "ex-new" }, "沒看過") : null,
      open && calmCure && !ex.san ? h("span", { class: "ex-cure" }, icon("check"), "看了治好怪癖") : null,
      open && !isFree(P) ? exInspLine(ex) : null,
      open && !isFree(P) && ex.san && viewsToday(P, ex) ? h("span", { class: "ex-hab" + (viewsToday(P, ex) > NUM.habituate ? " calm" : "") }, viewsToday(P, ex) > NUM.habituate ? `今天看了 ${viewsToday(P, ex)} 次：已經不怕了` : `今天看了 ${viewsToday(P, ex)} 次（超過 ${NUM.habituate} 次就不怕）`) : null,
      !open ? h("span", { class: "ex-lock" }, icon("lock"), ex.lockedHint || "還沒開放") : null);
    const item = h("button", { type: "button", class: "exhibit" + (open ? "" : " locked"), "aria-label": open ? (ex.label || ex.title) + (unseen ? "（還沒看過，蓋著布）" : "") : "還沒開放的展品" }, frame, cap);
    freshMark(item, open && isFresh(P, "gallery", FRESH_KEY.ex(ex.id))); // 新開放的展品：畫框角上「新」（11-08）
    item.addEventListener("click", () => open ? focusExhibit(ex) : note(ex.lockedHint || "還沒開放"));
    corridor.append(item);
  });
  corridor.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { corridor.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  corridor.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { corridor.scrollBy({ left: 320, behavior: "smooth" }); e.preventDefault(); }
    if (e.key === "ArrowLeft") { corridor.scrollBy({ left: -320, behavior: "smooth" }); e.preventDefault(); }
  });
  corridor.addEventListener("scroll", () => { UI.params.scroll = corridor.scrollLeft; });
  if (ADDONS.gallery) sideBox.push(ADDONS.gallery()); // 節日特展：只有節日那天（11-09，ui_signin.js）
  galleryShell(root, "main", GALLERY_INTRO, [corridor, h("p", { class: "hint gal-hint" }, "用滑鼠滾輪或手指左右滑，點展品靠近看。")], sideBox);
  if (params.scroll) requestAnimationFrame(() => { corridor.scrollLeft = params.scroll; });
};
// 每幅畫底下的靈感那壹行
export function exInspLine(ex) {
  const gi = galleryInsp(ex), left = reviewsLeft(P, ex);
  if (!P.seen[ex.id]) return h("span", { class: "ex-insp" }, `第壹次看 +${gi.first} 靈感`);
  return h("span", { class: "ex-insp" + (left ? "" : " out") }, left ? `再看 +${gi.review} 靈感・今天還能 ${left} 次` : "今天的靈感拿完了，明天再來");
}
export async function focusExhibit(ex) {
  if (UI.busy) return;
  UI.busy = true;
  const host = $("#room");
  const artBox = h("div", { class: `frame focus-art art-${ex.art}`, html: ART.exhibit(ex.art, { hol: ex.look }) }); // look：節日特展的小裝飾（11-09）
  const info = h("div", { class: "focus-info" });
  // 得到、失去的東西：放在說明卡下面（畫的旁邊），一直留到回走廊
  const gains = h("div", { class: "focus-gains", "aria-live": "polite" });
  const gain = (text, tone) => { gains.append(h("span", { class: "gain-chip " + (tone || "") }, text)); };
  const closeBtn = btn("回走廊", () => close(), "ghost");
  const layer = h("div", { class: "focus-layer", role: "dialog", "aria-label": ex.title },
    h("div", { class: "focus-inner" }, artBox, info), h("div", { class: "focus-actions" }, closeBtn));
  let closed = false;
  const close = () => { if (closed) return; closed = true; layer.remove(); document.removeEventListener("keydown", onKey); UI.busy = false; if (UI.screen === "gallery") rerender(); };
  const onKey = e => { if (e.key === "Escape" && !$(".fx-overlay")) close(); };
  document.addEventListener("keydown", onKey);
  // 被換畫面拿掉時（發作把人拉走）：一樣收乾淨（go() 會跑 UI.cleanup）
  UI.cleanup.push(() => { if (closed) return; closed = true; document.removeEventListener("keydown", onKey); UI.busy = false; });
  host.append(layer);
  requestAnimationFrame(() => layer.classList.add("in"));
  try {
    closeBtn.disabled = true;
    const before = P.seen[ex.id] || 0;
    if (!isFree(P) && P.sanity < 50 && before > 0 && !ex.holiday && !P.day.diff[ex.id] && ART.exhibitDiffs && ART.exhibitDiffs[ex.art] && Math.random() < 0.6) {
      P.day.diff[ex.id] = true;
      await diffGame(ex, artBox, info);
    }
    if (ex.art === "russia8") { await wait(600); snd("whoosh"); artBox.innerHTML = ART.exhibit("russia8", { open: true }); artBox.classList.add("opened"); }
    const v = viewExhibit(P, ex);
    if (v.san || ex.myth || ex.art === "russia8") later(() => snd("eerie"), 300);
    snd("flip");
    const pl = placard([ex.title].concat(ex.lines), { cls: "big" });
    if (ex.aside) pl.append(h("div", { class: "pl-aside" }, ptNode(v.moodNote || ex.aside)));
    info.replaceChildren(pl, gains);
    await wait(250);
    if (v.insp) { gain(`+${v.insp} 靈感`, "good"); snd("coin"); }
    else if (v.capped) gain(`今天這件的靈感拿完了（壹天 ${galleryInsp(ex).perDay} 次），明天再來`, "");
    if (v.insp && !v.first) gain(reviewsLeft(P, ex) ? `今天這件還能拿 ${reviewsLeft(P, ex)} 次` : "今天這件的靈感拿完了", "");
    if (v.mood) { await wait(300); gain(`心情 ${v.mood > 0 ? "+" : "−"}${Math.abs(v.mood)}`, v.mood > 0 ? "good" : "bad"); }
    if (v.cured.length) { v.cured.filter(c => !c.step).forEach(c => gain(`治好了「${quirkName(c.quirk)}」`, "good")); noteCured(v.cured); if (v.cured.some(c => !c.step)) snd("unlock"); } // 看了不可怕的畫（決定 0027）
    updateStatus(); persist();
    if (v.san) {
      await wait(700);
      const res = await sanFlow(v.san, ex.id, ex.title, { anchor: gains, occult: !!ex.myth });
      // 框被發作拉走（closed）時：框上的字不用寫了，但神話一定要給（viewExhibit 已經記了 mythFrom，這次不給就再也拿不到）
      if (res) {
        if (!closed) {
          gain(res.loss ? `理智 −${res.loss}` : "理智沒有掉", res.loss ? "bad" : "good");
          const sa = SAN_ASIDES[ex.id] || {};
          const aside = res.r.habituated || v.san === "0/1" ? SAN_ASIDES.habituated : res.r.success ? (ex.successAside || sa.success) : (ex.failAside || sa.fail);
          if (aside) pl.append(h("div", { class: "pl-aside" }, ptNode(aside)));
        }
        if (res.ev.zero) { close(); return; }
        if (v.myth) {
          const ev = addMyth(P, v.myth);
          note(`佩佩神話 +${v.myth}：理智上限變成 ${maxSan(P)}`, "bad");
          if (!closed) gain(`佩佩神話 +${v.myth}`, "bad");
          updateStatus(); persist();
          await showEvents(ev);
        }
        if (res.involuntary === "backout") { if (!closed) { await wait(1200); close(); go("lobby"); } return; }
      }
    } else if (v.myth) { const ev = addMyth(P, v.myth); await showEvents(ev); }
    await showEvents(progressEvents(P));
    actionTick();
  } finally {
    closeBtn.disabled = false;
    if (!closed) closeBtn.focus();
  }
}
// 小遊戲：畫廊找不同（理智低時）
export function diffGame(ex, artBox, info) {
  return new Promise(async res => {
    const diffs = ART.exhibitDiffs[ex.art];
    const vi = 1 + Math.floor(Math.random() * (diffs.length - 1));
    const target = diffs[vi];
    info.replaceChildren(placard([FIND_DIFF_TEXT.prompt, "先記住它的樣子……"]), miniPill("diff"));
    await wait(2000);
    artBox.classList.add("blink-out"); await wait(280);
    artBox.innerHTML = ART.exhibit(ex.art, { variant: vi });
    artBox.classList.remove("blink-out");
    const bar = h("div", { class: "timer" }, h("i"));
    let finished = false;
    const end = ok => {
      if (finished) return; finished = true;
      clearTimeout(t); artBox.removeEventListener("click", onClick);
      const svg = artBox.querySelector("svg");
      if (ok !== null && svg) svg.insertAdjacentHTML("beforeend", `<circle cx="${target.x}" cy="${target.y}" r="${target.r + 4}" fill="none" stroke="${ok ? "#3F8F4A" : "#B33A2E"}" stroke-width="3" stroke-dasharray="6 4"/>`);
      if (ok) { const g = miniReward(P, "diff", 2); snd("coin"); note(FIND_DIFF_TEXT.success + (g ? `　+${g} 靈感` : ""), "good"); updateStatus(); }
      else if (ok === false) note(FIND_DIFF_TEXT.fail);
      setTimeout(() => { artBox.innerHTML = ART.exhibit(ex.art); res(); }, ok === null ? 0 : 1400);
    };
    const onClick = e => {
      const svg = artBox.querySelector("svg");
      if (!svg) return;
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse());
      end(Math.hypot(q.x - target.x, q.y - target.y) <= target.r * 1.6);
    };
    artBox.addEventListener("click", onClick);
    let secs = 20;
    if (hasTalent(P, "偵查")) {
      const sc = skillCheck(P, "偵查");
      if (sc.success) { secs = 30; note(`偵查 ${sc.roll.total} ≤ ${sc.target} 成功：多 10 秒`, "good"); }
    }
    bar.firstChild.style.animationDuration = secs + "s";
    const t = setTimeout(() => end(false), secs * 1000);
    info.replaceChildren(placard(["哪裡變了？", `點畫上不一樣的地方，${secs} 秒。`]), bar, btn("略過", () => end(null), "ghost"));
  });
}

// ---------- 4 圖書館：書架 ----------
SCREENS.origin = (root, params) => {
  root.append(roomHead("圖書館", "書可以翻開。新章節解鎖時，書背會亮起來。"));
  const tab = ORIGIN_TABS.some(t => t[0] === params.tab) ? params.tab : "shelf"; // 書架分頁籤（11-09，docs/每週劇情.md 第九節）：館藏、禁書照舊，主線、每週劇情、節日在 ui_story.js
  const reader = h("div", { class: "reader", "aria-live": "polite" }, h("p", { class: "empty" }, "從書架上挑一本書。"));
  const books = [{ id: 0, title: "起源", spine: "起源", gen1: true }].concat(allChapters());
  const shelf = h("div", { class: "shelf" }, h("span", { class: "shelf-label" }, "館藏"),
    books.map(b => {
      const open = b.gen1 || chapterOpen(P, b.id);
      const unread = open && !P.chaptersRead[b.id];
      const el = h("button", { type: "button", class: "spine" + (open ? "" : " locked") + (unread ? " lit" : ""), "aria-label": open ? b.title : "還沒解鎖的章節" },
        h("span", { class: "spine-t" }, open ? b.spine : "？"), open ? null : icon("lock"));
      freshMark(el, open && !b.gen1 && isFresh(P, "origin", FRESH_KEY.ch(b.id))); // 新的章節（11-08）
      el.addEventListener("click", () => {
        if (!open) { note(b.lockHint || (b.id === 4 ? "走到地下收藏庫 B4，這一章會亮起來。" : `解鎖 ${b.id === 2 ? NUM.ch2 : NUM.ch3} 個選項後，這一章會亮起來。`)); return; }
        $$(".spine.on", root).forEach(x => x.classList.remove("on")); el.classList.add("on"); el.classList.remove("lit");
        openBook(b, reader);
      });
      return el;
    }));
  if (!isFree(P)) { // 壹件都還沒看懂也放在書架上（翊文 11-10：館友證寫「放在圖書館的書架上」卻找不到）；翻開都是「？？？」，不破梗
    const el = h("button", { type: "button", class: "spine uk-spine", "aria-label": "看懂的事" }, h("span", { class: "spine-t" }, "看懂的事"));
    freshMark(el, isFresh(P, "origin", FRESH_KEY.understood)); // 《看懂的事》多了壹件（11-08）
    el.addEventListener("click", () => { $$(".spine.on", root).forEach(x => x.classList.remove("on")); el.classList.add("on"); snd("eerie", 1); openUnderstood(reader); });
    shelf.append(el);
  }
  const forbList = [];
  FORBIDDEN_BOOKS.concat(typeof BOOK4 !== "undefined" && (P.keys.book4 || isFree(P)) ? [BOOK4] : []).forEach(b => {
    forbList.push(b);
    for (let s = bookSequels().find(x => x.after === b.id); s; s = bookSequels().find(x => x.after === s.id)) forbList.push(s);
  });
  // 續集接在哪壹本後面（翊文 11-09：「禁書的哪個是哪壹個的續集有點難看得出來」）：書背寫上第壹本的名字，也貼著那壹本放
  const seriesRoot = b => { let r = b; while (r && r.after) { const id = r.after; r = forbList.find(x => x.id === id); } return r || b; };
  const seriesTag = b => h("span", { class: "spine-of" }, `${seriesRoot(b).spine} 續集`);
  const forbSpine = b => {
      if (b.after && !sequelVisible(P, b)) return null;
      if (b.after && !sequelOpen(P, b)) {
        const sealed = h("button", { type: "button", class: "spine dark sealed sequel", dataset: { seq: b.id }, "aria-label": `還打不開的《${seriesRoot(b).spine}》續集。${b.hint}` }, h("span", { class: "spine-of" }, seriesRoot(b).spine), h("span", { class: "spine-t" }, "續集"), icon("lock"));
        sealed.addEventListener("click", () => {
          $$(".spine.on", root).forEach(x => x.classList.remove("on")); sealed.classList.add("on"); snd("eerie", 1);
          reader.replaceChildren(h("div", { class: "book sealed-book" }, h("h2", { class: "book-title" }, "還打不開的續集"), h("p", { class: "book-hint" }, icon("key"), " 怎麼打開"), h("p", { class: "sealed-hint" }, b.hint, b.need === "idleOrigin" ? `大約 ${NUM.idleBook} 秒。` : "")));
        });
        return sealed;
      }
      const el = h("button", { type: "button", class: "spine dark" + (b.after ? " sequel" : ""), "aria-label": b.after ? `禁書：${b.title}（《${seriesRoot(b).spine}》的續集）` : `禁書：${b.title}` },
        b.after ? h("span", { class: "spine-two" }, h("span", { class: "spine-t" }, b.spine.replace(`${seriesRoot(b).spine}・`, "")), seriesTag(b)) : h("span", { class: "spine-t" }, b.spine), !isFree(P) && !P.mythFrom[b.id] ? h("span", { class: "spine-m" }, `神話 +${b.myth}`) : null,
        rereadReady(P, b) ? h("span", { class: "spine-m spine-again", title: "讀過了還沒看懂：今天可以再翻開壹次" }, "再看壹次") : null);
      freshMark(el, isFresh(P, "origin", FRESH_KEY.book(b.id))); // 新的禁書、續集（11-08）
      el.addEventListener("click", () => openForbidden(b, reader));
      return el;
    };
  // 壹套書框在壹起（翊文 11-10：「書架區也整理一下」）：原書和它的續集放同壹格，有續集的上面寫這壹套的名字，套跟套之間留空
  const forb = h("div", { class: "shelf forbidden" }, h("span", { class: "shelf-label" }, "禁書"),
    forbList.filter(b => !b.after).map(r => {
      const els = forbList.filter(b => seriesRoot(b) === r).map(forbSpine).filter(Boolean);
      return h("div", { class: "series" + (els.length > 1 ? " multi" : ""), role: "group", "aria-label": `《${r.spine}》這壹套，${els.length} 本` },
        els.length > 1 ? h("span", { class: "series-cap", "aria-hidden": "true" }, r.spine) : null, els);
    }));
  const opened = books.filter(b => b.gen1 || chapterOpen(P, b.id)), fbVis = forbList.filter(b => !b.after || sequelOpen(P, b));
  const counts = { shelf: [opened.length, opened.filter(b => !P.chaptersRead[b.id]).length, opened.filter(b => !b.gen1 && isFresh(P, "origin", FRESH_KEY.ch(b.id))).length + (isFresh(P, "origin", FRESH_KEY.understood) ? 1 : 0)],
    forbidden: [fbVis.length, isFree(P) ? 0 : fbVis.filter(b => !P.mythFrom[b.id]).length, fbVis.filter(b => isFresh(P, "origin", FRESH_KEY.book(b.id))).length] }; // 頁籤上的「幾本・幾本沒讀」
  root.append(originTabs(tab, counts), h("div", { class: "origin-wrap" }, h("div", { class: "shelves" }, tab === "shelf" ? shelf : tab === "forbidden" ? forb : storyShelf(tab, reader, params)), reader));
  armIdleSequel(root);
};
// 《佩佩起源考・補遺》：讀過上壹本之後，在圖書館什麼都不做 NUM.idleBook 秒（點滑鼠、按鍵盤、滾輪會重來；移動滑鼠沒關係）
// 等的時候：書架上蓋著的那本越來越亮、快好時會抖，書架下面浮出壹行字，壹半時有低語（翊文 11-08：等了看起來沒作用）
export function armIdleSequel(root) {
  const s1 = bookSequels().find(x => x.need === "idleOrigin");
  if (!s1 || isFree(P) || !P.mythFrom[s1.after] || sequelOpen(P, s1)) return;
  const token = UI.idleToken = {};
  UI.lastInput = Date.now();
  let whispered = false;
  const sign = h("p", { class: "idle-sign", "aria-live": "polite" });
  root.append(sign);
  const LINES = ["……書架那邊，好像有什麼在動。", "……有誰在翻書。不是你。", "……"];
  const watch = () => {
    if (UI.idleToken !== token || UI.screen !== "origin" || !sign.isConnected || sequelOpen(P, s1)) return;
    const idle = Date.now() - UI.lastInput, k = Math.min(1, idle / (NUM.idleBook * 1000));
    const spine = root.querySelector(`.spine.sealed[data-seq="${s1.id}"]`);
    if (spine) { spine.style.setProperty("--idle", k.toFixed(2)); spine.classList.toggle("stir", k > 0.8); }
    if (idle < 1500) { whispered = false; sign.classList.remove("on"); }
    else if (k > 0.25) { sign.textContent = LINES[k < 0.55 ? 0 : k < 0.85 ? 1 : 2]; sign.classList.add("on"); }
    if (k >= 0.5 && !whispered) { whispered = true; snd("whisper"); }
    if (k >= 1) { const ev = unlockSequel(P, s1.id); persist(); rerender(); showEvents(ev); return; }
    later(watch, 400);
  };
  later(watch, 400);
}
// 《看懂的事》：看懂檢定看懂過的，照故事的順序排（翊文 11-08：故事線）
export function openUnderstood(reader) {
  const list = understandList(P), got = list.filter(x => x.got).length;
  reader.replaceChildren(h("div", { class: "book uk-book" },
    h("h2", { class: "book-title" }, "看懂的事"),
    h("p", { class: "uk-count" }, `看懂了 ${got}／${UNDERSTAND_TEXT.length} 件。照發生的順序排，拼起來就是這間博物館的祕密。`),
    h("p", { class: "uk-how" }, "怎麼看懂：被嚇到壹次掉 5 點以上的理智，再擲過看懂檢定。讀過的禁書，隔天再翻開可以直接擲看懂檢定。還沒看懂的，下面寫了去哪裡看。"),
    h("ol", { class: "uk-list" }, list.map(x => x.got
      ? h("li", null, h("span", { class: "uk-from" }, x.from), h("span", { class: "uk-line" }, ptNode(x.text)))
      : h("li", { class: "unknown" + (x.again ? " again" : "") }, h("span", { class: "uk-line" }, "？？？（還沒看懂）"), x.again ? h("span", { class: "uk-again" }, "再看壹次") : null,
        x.hint ? h("span", { class: "uk-hint" }, "提示：" + x.hint) : null))),
    weekUnderstoodBox()));
}
// 每週劇情裡看懂的（線索集齊才會多壹件，shared/clues.js）。快看懂的只說還差幾條和提示，不給答案
function weekUnderstoodBox() {
  const v = weekUnderstood();
  if (!v.done.length && !v.near.length) return null;
  return h("div", { class: "uk-weeks" },
    h("h3", { class: "uk-sub" }, "這些週看懂的"),
    v.done.length ? h("ol", { class: "uk-list" }, v.done.map(x => h("li", null, h("span", { class: "uk-from" }, x.from || "館裡"), h("span", { class: "uk-line" }, ptNode(x.text))))) : null,
    v.near.map(x => h("p", { class: "uk-near" }, `有件事快看懂了：還差 ${x.left} 條。`, x.hint ? h("span", { class: "uk-hint" }, ptNode(x.hint)) : null)));
}
export function bookReader(reader, title, pages, o = {}) {
  let i = 0;
  const page = h("div", { class: "page" });
  const count = h("span", { class: "page-n" });
  // 翊文 11-09：「翻頁箭頭可以明顯一點嗎」：金色按鈕，箭頭旁邊寫字
  const prev = h("button", { type: "button", class: "book-arrow prev", onClick: () => flip(-1) }, icon("arrowLeft"), h("span", null, "上壹頁"));
  const next = h("button", { type: "button", class: "book-arrow next", onClick: () => flip(1) }, h("span", null, "下壹頁"), icon("arrowRight"));
  const draw = () => {
    page.replaceChildren(...String(pages[i]).split("\n").map(l => bookLine(l)));
    if (o.aside && i === pages.length - 1) page.append(h("p", { class: "pl-aside" }, ptNode(o.aside)));
    count.textContent = `${i + 1}／${pages.length}`;
    prev.disabled = i === 0; next.disabled = i === pages.length - 1;
    page.classList.remove("enter"); void page.offsetWidth; page.classList.add("enter");
    if (i === pages.length - 1 && o.onEnd) { const f = o.onEnd; o.onEnd = null; f(); }
  };
  const flip = d => { const j = clampN(i + d, 0, pages.length - 1); if (j !== i) { i = j; snd("flip"); draw(); } };
  let sx = null;
  page.addEventListener("pointerdown", e => { sx = e.clientX; });
  page.addEventListener("pointerup", e => { if (sx != null && Math.abs(e.clientX - sx) > 40) flip(e.clientX < sx ? 1 : -1); sx = null; });
  const book = h("div", { class: "book", tabindex: "0", onKeydown: e => { if (e.key === "ArrowRight") flip(1); if (e.key === "ArrowLeft") flip(-1); } },
    h("h2", { class: "book-title" }, title), pages.some(p => /\[\[/.test(p)) ? h("p", { class: "book-hint" }, icon("sparkle"), " 書裡發亮的字可以點") : null,
    page, h("div", { class: "book-nav" }, prev, count, next), h("div", { class: "book-gains", "aria-live": "polite" }));
  reader.replaceChildren(book);
  draw();
  book.focus({ preventScroll: true });
}
export function openBook(b, reader) {
  if (b.gen1) {
    const m = readOrigin(P);
    bookReader(reader, "起源", [ORIGIN.lines.join("\n")], { aside: moodNoteOf(P, ORIGIN, m) || ORIGIN.aside, onEnd: () => { P.chaptersRead[0] = true; persist(); } });
    if (m) { bookGain(reader, `心情 +${m}`, "good"); updateStatus(); }
    return;
  }
  bookReader(reader, b.title, b.pages, { onEnd: () => { const g = finishChapter(P, b.id); if (g) { bookGain(reader, `+${g} 靈感`, "good"); snd("coin"); updateStatus(); } persist(); } });
}
export async function openForbidden(b, reader) {
  if (UI.busy) return;
  if (isFree(P)) { bookReader(reader, b.title, [b.lines.join("\n")]); return; }
  const first = !P.mythFrom[b.id];
  // 翊文 11-08：「禁書看過的再看一次應該不需要再減定san值一次，因為已經看過了」
  // 這位參觀者讀過的（P.mythFrom 記著），再翻開就直接讀，不用再擲理智。換下壹位參觀者時 mythFrom 會清掉：新的人第壹次讀還是要擲。
  // 翊文 11-10（決定 0063）：這樣讀過的書就沒機會看懂了。隔天以後再翻開：只擲看懂檢定；看懂了才再擲壹次理智。沒看懂就沒事，明天再試
  if (!first && rereadReady(P, b)) {
    const T = understandTarget(P);
    if (await ask(`再翻開《${b.title}》？你讀過它，還沒看懂。這次只擲看懂檢定（擲出 ≤ ${T} 就是看懂）：看懂了要再擲壹次理智（${sanWords(b.san)}）；沒看懂就沒事，明天可以再試。`, "翻開", "只是翻翻")) {
      UI.busy = true;
      try {
        snd("eerie");
        const u = rereadTry(P, b);
        persist();
        if (!u) return;
        await FX.rollOverlay({ title: "看懂檢定", sub: `《${b.title}》：你讀過了，這次看你「看懂了沒」。擲出 ≤ ${u.target} 就是看懂了。（50＋佩佩神話，懂得越多越容易看懂）`, spec: "d100", result: u.roll,
          outcome: { text: u.success ? "你看懂了。" : "你沒看懂。明天再翻開壹次。", tone: u.success ? "bad" : "good" } });
        const sp = $$(".shelf.forbidden .spine-again").find(x => x.closest(".spine") && x.closest(".spine").classList.contains("on")); if (sp) sp.remove();
        bookReader(reader, b.title, [b.lines.join("\n")], { aside: u.success ? "(字還是那些字。只是這次，你看懂了)" : "(字還在。你還是不知道它們要說什麼)" });
        if (!u.success) { bookGain(reader, "還沒看懂：明天可以再翻開壹次", "neutral"); return; }
        await understandFlow("book:" + b.id);
        const res = await sanFlow(b.san, "book:" + b.id, `《${b.title}》`, { anchor: reader, occult: true, noUk: true });
        if (!res || P.dark) return;
        bookGain(reader, res.loss ? `理智 −${res.loss}` : "理智沒有掉", res.loss ? "bad" : "good");
        updateStatus(); persist();
        if (res.involuntary === "backout") { await wait(1400); go("lobby"); }
      } finally { UI.busy = false; }
      return;
    }
  }
  if (!first) {
    bookReader(reader, b.title, [b.lines.join("\n")], { aside: "(你讀過了。字還在，只是這次你知道它們要說什麼)" });
    bookGain(reader, "讀過了：這次不用擲理智", "good");
    return;
  }
  const ok = await ask(`翻開《${b.title}》？要擲理智（${sanWords(b.san)}）${first ? `，會得到佩佩神話 +${b.myth}（理智上限 ${maxSan(P)} → ${maxSan(P) - b.myth}）` : ""}。`, "翻開", "算了");
  if (!ok) return;
  snd("eerie");
  UI.busy = true;
  try {
    const res = await sanFlow(b.san, "book:" + b.id, `《${b.title}》`, { anchor: reader, occult: true });
    if (!res || P.dark) return;
    bookReader(reader, b.title, [b.lines.join("\n")], { aside: res.r.success ? b.successAside : b.failAside });
    bookGain(reader, res.loss ? `理智 −${res.loss}` : "理智沒有掉", res.loss ? "bad" : "good");
    let m = bookMyth(P, b);
    if (m && hasTalent(P, "神秘學")) m += 1; // 神秘學家讀得更懂
    if (m) { const ev = addMyth(P, m); bookGain(reader, `佩佩神話 +${m}`, "bad"); note(`佩佩神話 +${m}：理智上限變成 ${maxSan(P)}`, "bad", 7000); await showEvents(ev); }
    updateStatus(); persist();
    const sev = sequelEvents(P); if (sev.length) await showEvents(sev);
    if (first && UI.screen === "origin") armIdleSequel($(".scr-origin") || $("#room"));
    if (res.involuntary === "backout") { await wait(1400); go("lobby"); }
  } finally { UI.busy = false; }
}

// ---------- 5 手作坊 ----------
export function rarityRanges() { // 最後壹列是失敗作（NUM.fumbleFrom–100）
  let lo = 1;
  const rs = RARITY_TABLE.map(t => { const to = Math.min(t.max, NUM.fumbleFrom - 1), r = { name: t.name, from: lo, to, pct: to - lo + 1 }; lo = t.max + 1; return r; });
  return rs.concat([{ name: FAILED, from: NUM.fumbleFrom, to: 100, pct: 101 - NUM.fumbleFrom, failed: true }]);
}
// 不敢碰的選項：說清楚為什麼、怎麼好（翊文 11-08：「看了一幅畫之後其他本來解開的就還不能點，看看是不是有問題」——
// 是看畫的理智檢定失敗得到的恐懼症，照規則擋住的，但原本只寫「不敢碰」，看起來像壞掉）
function afraidText(cat, name, why) {
  if (why && why.kind === "bout") return `恐懼症發作：暫時不敢碰「${name}」，再 ${why.left} 個動作就好。`;
  if (why && why.kind === "quirk") { // 決定 0046：治法是得到時抽的那壹件，要做 2 個不同的日子，不然壹週後自己好
    const cure = quirkCureText(why.quirk), prog = quirkProgText(why.quirk);
    return `你有「${quirkName(why.quirk)}」，不敢碰「${name}」。${cure ? `治法：${cure}${prog}不然 ` : ""}${quirkLeftText(why.quirk, "n")}後自己好。`;
  }
  return `你不敢碰「${name}」。`;
}
// 這壹類有不敢碰的：卡片上面壹行說明（不用點也看得到）
function afraidBar(cat) {
  const blocked = allOpts(cat).filter(n => isUnlocked(P, cat, n) && isBlocked(P, cat, n));
  if (!blocked.length) return null;
  // 怪癖和發作分開說（同壹類兩種都有的時候，不要把暫時的發作說成怪癖）
  const byQuirk = blocked.filter(n => { const w = blockedWhy(P, cat, n); return w && w.kind === "quirk"; });
  const byBout = blocked.filter(n => !byQuirk.includes(n));
  const lines = [];
  // 同壹類可能有兩個恐懼症（整類的、單壹選項的），治法各自不同：壹個怪癖壹行（11-09，決定 0027）
  [...new Set(byQuirk.map(n => blockedWhy(P, cat, n).quirk))].forEach(q => {
    const mine = byQuirk.filter(n => blockedWhy(P, cat, n).quirk === q);
    const what = !q.opt ? `「${cat}」除了「${baseOpts(cat)[0]}」都不敢碰` : mine.map(n => `「${n}」`).join("、") + "不敢碰";
    const cure = quirkCureText(q);
    lines.push(h("span", null, h("b", null, what), `：這是看可怕的東西時理智檢定失敗留下的「${quirkName(q)}」。`, cure ? `治法：${cure}不然 ` : "", quirkLeftNode(q, "n"), "後自己消失。"));
  });
  if (byBout.length) lines.push(h("span", null, h("b", null, byBout.map(n => `「${n}」`).join("、") + "不敢碰"), `：恐懼症發作中，再 ${P.bout ? P.bout.left : 1} 個動作就好。`));
  return h("div", { class: "afraid-bar", role: "note" }, icon("eye"), h("div", { class: "afraid-lines" }, lines));
}
SCREENS.workshop = (root, params) => {
  const free = isFree(P);
  const pick = P.wsPick;
  if (params.preset) {
    const miss = [];
    CATS.forEach(c => { const v = params.preset[c]; if (c === ROLLED && !free) return; if (usable(P, c).includes(v)) pick[c] = v; else miss.push(v); });
    if (miss.length) note(`還沒解鎖或不能用：${miss.join("、")}`, "bad");
    params.preset = null;
  }
  CATS.forEach(c => { if (!usable(P, c).includes(pick[c])) pick[c] = usable(P, c)[0]; });
  if (P.swapNext) {
    P.swapNext = false;
    const cs = CATS.filter(c => c !== ROLLED && usable(P, c).length > 1);
    if (cs.length) {
      const c = pickOne(cs); const others = usable(P, c).filter(n => n !== pick[c]); pick[c] = pickOne(others);
      later(() => note(`你的手不聽使喚：${c}被換成了「${pick[c]}」`, "bad"), 400);
    }
  }
  let tab = params.tab && CATS.includes(params.tab) ? params.tab : CATS.find(c => c !== ROLLED);
  const hold = UI.wsHold || (UI.wsHold = {});
  let rolling = false;
  const frogBox = h("div", { class: "frog live", id: "wsFrog" });
  const flag = h("span", { class: "ws-flag" });
  const stage = h("div", { class: "ws-stage", "aria-label": "展台：可以把帽子拖到青蛙頭上" }, flag, frogBox, h("div", { class: "pedestal" }));
  const info = h("aside", { class: "ws-info" });
  const tabs = h("div", { class: "ws-tabs", role: "tablist" });
  const cards = h("div", { class: "ws-cards", role: "listbox", "aria-label": "選項" });
  const afraidBox = h("div", { class: "ws-afraid" }); // 不敢碰的說明放在卡片列外面（卡片列在手機上是橫的，放裡面會被擠成直條）
  const tools = h("div", { class: "ws-tools" });
  root.append(roomHead(GEN_TEXT.workshop, free ? "自由模式：什麼都能直接選。" : "點卡片換選項；帽子可以直接拖到頭上。稀有度做出來才知道。"),
    h("div", { class: "ws-top" }, stage, info), tabs, afraidBox, cards, tools);

  const drawFrog = anim => {
    frogBox.innerHTML = frogHTML(pick, free ? { fx: true } : {});
    enliven(frogBox, pick);
    if (anim) { frogBox.classList.remove(anim); void frogBox.offsetWidth; frogBox.classList.add(anim); }
  };
  frogBox.addEventListener("click", () => {
    frogBox.classList.remove("jump"); void frogBox.offsetWidth; frogBox.classList.add("jump");
    const moods = usable(P, "心情").filter(m => m !== pick.心情);
    if (moods.length) { frogBox.innerHTML = frogHTML(Object.assign({}, pick, { 心情: pickOne(moods) })); later(() => drawFrog(), 650); }
  });
  const drawInfo = () => {
    const owned = free ? (P.pepes[pepeKey(pick)] ? [pick[ROLLED]] : []) : RARITY_ORDER.filter(r => P.pepes[pepeKey(Object.assign({}, pick, { [ROLLED]: r }))]);
    flag.replaceChildren(owned.length ? h("span", null, "已收藏 ", owned.map(r => rdot(r))) : h("span", { class: "new" }, "新的！"));
    const d = describePepe(pick);
    const third = free ? h("div", { class: "pl-line pl-r" }, rdot(pick[ROLLED]), " ", pick[ROLLED], "　", d.no)
      : h("div", { class: "pl-line pl-r" }, "稀有度：做出來才知道");
    const counts = CATS.filter(c => !partOf(c).deco || decoOpen(P, c)).map(c => usable(P, c).length);
    const poss = possibilities(P);
    const cost = makeCost(P, pick);
    const can = canMake(P, pick);
    info.replaceChildren(
      placard([d.title, d.extra, third]),
      h("div", { class: "poss" }, h("span", { class: "poss-l" }, "你已經打開的可能性"),
        h("b", { class: "poss-n", id: "wsPoss", dataset: { v: poss } }, `${num(poss)}`), h("span", { class: "poss-of" }, `／${num(knownTotal(P))}`),
        h("div", { class: "poss-f" }, counts.join(" × "))),
      quirkMakeBox(pick), // 11-08：怪癖讓這隻多花或少花幾靈感，要明顯
      h("div", { class: "ws-make" },
        btn(free ? "做！" : costText("做", cost), () => make(), "primary big"),
        free ? null : inspHave(cost),
        !can.ok ? h("p", { class: "warn-line" }, can.reason) : null));
  };
  const drawTabs = () => {
    tabs.replaceChildren(...CATS.filter(c => !partOf(c).deco || decoOpen(P, c)).map(c => {
      const t = h("div", { class: "tab-wrap" + (c === tab ? " on" : "") },
        h("button", { type: "button", class: "tab", role: "tab", "aria-selected": String(c === tab), onClick: () => { tab = c; UI.params.tab = c; drawTabs(); drawCards(); drawTools(); } },
          icon(CAT_ICON[c] || "sparkle"), h("span", { class: "tab-t" }, c), h("span", { class: "tab-n" }, `${usable(P, c).length}/${allOpts(c).filter(n => !(optOf(c, n).forbidden || optOf(c, n).limited || optOf(c, n).mix) || isUnlocked(P, c, n)).length}`), // 簽到限定的拿到了才算（11-09）
          freshUnder(P, "workshop", FRESH_KEY.opt(c, "")) || isFresh(P, "workshop", FRESH_KEY.cat(c)) ? freshTag("tab-fresh") : null), // 這頁有新選項（11-08）
        c === ROLLED && !free ? null : h("button", { type: "button", class: "hold" + (hold[c] ? " on" : ""), "aria-pressed": String(!!hold[c]), title: hold[c] ? "鎖住了：擲骰時這一類不變" : "鎖住這一類：擲骰時不變",
          onClick: () => { hold[c] = !hold[c]; drawTabs(); } }, icon(hold[c] ? "lock" : "unlock")));
      return t;
    }));
  };
  const cardFor = (cat, name) => {
    const st = unlockState(P, cat, name);
    const o = optOf(cat, name);
    if (o.forbidden && st.state === "forbidden" && P.myth < o.myth - 4) return null; // 太遠的禁忌選項先不露面
    if (o.mix && st.state !== "open") return null; // 調色盤的顏色：調出來才出現（提示在融合室的調色盤）
    if (o.limited === "shop" && st.state !== "open") return null; // 兌換所的限定頭飾：買到了才出現（決定 0032；帽子那頁不會多一排鎖著的）
    if (o.limited && o.limited !== "signin" && o.limited !== "shop" && st.state !== "open") return null; // 主題展、每週特展的配件：拿到才出現，下面壹行字說怎麼拿（決定 0035）
    const blocked = st.state === "open" && isBlocked(P, cat, name);
    const on = pick[cat] === name;
    const rolledTab = cat === ROLLED && !free;
    const preview = Object.assign({}, pick, { [cat]: name });
    let sub;
    if (st.state === "open") {
      if (blocked) { const why = blockedWhy(P, cat, name); sub = h("span", { class: "c-sub warn", title: afraidText(cat, name, why) }, why && why.kind === "bout" ? "不敢碰（發作）" : "不敢碰"); }
      else if (rolledTab) { const r = rarityRanges().find(x => x.name === name); sub = h("span", { class: "c-sub" }, r ? `${pad(r.from, 2)}–${pad(r.to, 2)}` : "神話＋01"); }
    } else if (st.state === "buy") sub = h("span", { class: "c-sub" + (st.ok ? " can" : "") }, icon("lock"), `花 ${st.cost} 靈感解鎖`);
    else sub = h("span", { class: "c-sub" }, icon("lock"), st.state === "forbidden" ? `禁忌：神話 ${o.myth}` : st.text);
    const art = cat === ROLLED
      ? h("span", { class: "thumb rthumb" }, h("i", { class: "rbig", style: { background: st.state === "open" ? RCOLOR[name] : "var(--line)" } }))
      : h("span", { class: "thumb", html: st.state === "open" ? frogHTML(preview) : ART.frog(preview, { silhouette: true }) });
    const card = h("button", { type: "button", class: `card${on && !rolledTab ? " on" : ""}${st.state !== "open" ? " locked" : ""}${blocked ? " afraid" : ""}${o.forbidden ? " forbidden" : ""}`,
      role: "option", "aria-selected": String(on), "aria-label": `${cat}：${name}${st.state !== "open" ? "（" + (st.text || "鎖住") + "）" : ""}` },
      art, h("span", { class: "c-name" }, name), sub);
    freshMark(card, isFresh(P, "workshop", FRESH_KEY.opt(cat, name))); // 新解開的選項、剛能解鎖的選項：卡片角上「新」（11-08）
    let armed = false;
    const activate = () => {
      if (st.state === "open") {
        if (blocked) { snd("error"); note(afraidText(cat, name, blockedWhy(P, cat, name)), "bad"); card.classList.add("shake"); return; }
        if (rolledTab) { note("稀有度做出來才知道：按「做」之後擲 d100。"); return; }
        select(cat, name);
      } else if (st.state === "buy") {
        if (!st.ok) { snd("error"); note(`靈感不夠：解鎖要 ${st.cost}，你有 ${P.insp}`, "bad"); return; }
        if (!armed) { armed = true; card.classList.add("armed"); card.querySelector(".c-sub").replaceChildren(`再按一次：花 ${st.cost} 靈感`); later(() => { if (armed) { armed = false; drawCards(); } }, 3000); return; }
        const r = doUnlock(P, cat, name);
        if (!r.ok) { note(r.reason, "bad"); return; }
        snd("unlock");
        const ev = r.events[0];
        FX.floatText(card, `${num(ev.from)} → ${num(ev.to)}`, "good");
        if (!rolledTab) pick[cat] = name;
        drawAll("jump");
        const pn = $("#wsPoss"); if (pn) { pn.textContent = num(ev.from); pn.dataset.v = ev.from; FX.countTo(pn, ev.to); }
        showEvents(r.events.slice(1));
        updateStatus(); persist();
      } else { snd("error"); note(st.text || "還不能解鎖"); }
    };
    if (cat === "帽子" && st.state === "open" && !blocked) {
      UI.cleanup.push(FX.makeDraggable(card, { type: "hat", data: name, onTap: activate }));
      card.addEventListener("click", e => { if (e.detail === 0) activate(); });
    } else card.addEventListener("click", activate);
    return card;
  };
  const drawCards = () => {
    const list = allOpts(tab).map(n => cardFor(tab, n)).filter(Boolean);
    cards.replaceChildren(...list);
    afraidBox.replaceChildren(afraidBar(tab));
    if (ADDONS.hatNote && tab === "帽子" && !free) cards.append(ADDONS.hatNote()); // 主題展的限定配件（決定 0035，ui_themeshow.js）
    if (tab === ROLLED && !free) cards.append(h("p", { class: "card-note" }, `稀有度不能選：按「做」之後擲 d100，01 是完美作品、${NUM.fumbleFrom}–100 是失敗作。可以花心情把骰子壓低。`));
  };
  cards.addEventListener("keydown", e => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const all = $$(".card", cards), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const j = clampN(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1), 0, all.length - 1);
    all[j].focus(); e.preventDefault();
  });
  const select = (cat, name) => {
    if (pick[cat] === name) return;
    UI.undo.push(Object.assign({}, pick)); UI.undo = UI.undo.slice(-30);
    pick[cat] = name;
    drawAll("jump");
    persist();
  };
  const drawTools = () => {
    tools.replaceChildren(
      h("p", { class: "hold-hint" }, icon("lock"), " 類別旁的鎖頭：鎖住的類別，擲骰換壹隻時不會變"),
      btn([icon("dice"), " 擲骰換一隻"], () => rollAll(), "", { title: "每一類隨機換一個；鎖住的那一類不變" }),
      btn([icon("undo"), " 上一步"], () => { const u = UI.undo.pop(); if (u) { Object.assign(pick, u); CATS.forEach(c => { if (!usable(P, c).includes(pick[c])) pick[c] = usable(P, c)[0]; }); drawAll("jump"); } else note("沒有上一步了"); }, "ghost", { disabled: !UI.undo.length }),
      tab === "顏色" ? btn([icon("sparkle"), " 調色小遊戲"], () => colorGame(pick.顏色), "ghost", { title: "拖三個顏料混出目標顏色，越準靈感越多" }) : null);
  };
  const drawAll = anim => { drawFrog(anim); drawInfo(); drawTabs(); drawCards(); drawTools(); };
  async function rollAll() {
    if (rolling) return;
    rolling = true;
    UI.undo.push(Object.assign({}, pick)); UI.undo = UI.undo.slice(-30);
    snd("dice");
    const cs = CATS.filter(c => !(c === ROLLED && !free) && !hold[c]);
    const final = {};
    cs.forEach(c => { final[c] = pickOne(usable(P, c)); });
    const steps = motionOff() ? 1 : 9;
    for (let s = 0; s < steps; s++) {
      cs.forEach(c => { pick[c] = pickOne(usable(P, c)); });
      frogBox.innerHTML = frogHTML(pick);
      $$(".card", cards).forEach(x => x.classList.toggle("flash", x.querySelector(".c-name").textContent === pick[tab]));
      await wait(55 + s * 14);
    }
    Object.assign(pick, final);
    rolling = false;
    if (UI.screen === "workshop") drawAll("jump");
    persist();
  }
  function make() {
    if (free) {
      const res = finishMake(P, Object.assign({}, pick), {});
      go("reveal", { res });
      return;
    }
    const r = startMake(P, Object.assign({}, pick));
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    const mq = maniaQuirk(P); // 紅色狂這類：少花或多花的那 1 靈感飄出來，再留壹則提示
    if (mq) { const hit = pick[mq.cat] === mq.opt, t = `${quirkName(mq)}：${hit ? "少花" : "多花"} 1 靈感`; FX.floatText($(".ws-make .btn"), t, hit ? "good" : "bad"); note(`${t}（這次花 ${r.cost} 靈感）`, hit ? "good" : "bad"); }
    updateStatus();
    go("reveal", { pick: Object.assign({}, pick), roll: r.roll });
  }
  placeTarget(stage, ["hat"], name => {
    if (!usable(P, "帽子").includes(name)) return false;
    select("帽子", name);
    frogBox.classList.remove("hat-snap"); void frogBox.offsetWidth; frogBox.classList.add("hat-snap");
    snd("click");
    return true;
  });
  drawAll();
  if (P.bout && P.bout.i === 2) every(() => { if (!$(".fx-overlay")) rollAll(); }, 1700);
};

// ---------- 7 揭曉 ----------
SCREENS.reveal = (root, params) => {
  const free = isFree(P);
  const spot = h("div", { class: "rv-spot" });
  const frogBox = h("div", { class: "rv-frog" });
  const stage = h("div", { class: "rv-stage" }, spot, frogBox, h("div", { class: "pedestal big" }));
  const trayHost = h("div", { class: "rv-tray" });
  const panel = h("div", { class: "rv-panel", "aria-live": "polite" });
  root.append(stage, trayHost, panel);
  // 捲到看得到（翊文 11-08 介面檢查第 1 項：擲骰、就這樣、揭曉的佩佩都在畫面外）。
  // 只在不在畫面裡時才捲；上下留給導覽列、狀態列的空間寫在 CSS 的 scroll-margin。
  const seen = el => { if (!el) return true; const r = el.getBoundingClientRect(), top = parseFloat(getComputedStyle(el).scrollMarginTop) || 0, bot = parseFloat(getComputedStyle(el).scrollMarginBottom) || 0; return r.top >= top - 1 && r.bottom <= innerHeight - bot + 1; };
  const bring = (el, block = "nearest") => { if (el && !seen(el)) el.scrollIntoView({ block, behavior: motionOff() ? "auto" : "smooth" }); };
  if (params.res) { reveal(params.res); return; }
  if (!params.roll) { go("workshop"); return; }
  let natural = params.roll.total, pushed = false, spent = 0, tray = null, firstInfo = null;
  const fu = params.fusion || null, blood = fu ? fu.blood || 0 : 0;
  const pm = UI.pendingMake = { pick: params.pick, natural, spent: 0, pushed: false, done: false, fusion: fu };
  const sync = () => { pm.natural = natural; pm.spent = spent; pm.pushed = pushed; };

  const table = eff => h("table", { class: "rtable" }, h("tbody", null, rarityRanges().map(r => {
    const open = r.failed || isUnlocked(P, ROLLED, r.name);
    return h("tr", { class: (eff >= r.from && eff <= r.to ? "on" : "") + (open ? "" : " locked") + (r.failed ? " fumble" : "") },
      h("td", null, `${pad(r.from, 2)}–${r.to === 100 ? "100" : pad(r.to, 2)}`), h("td", null, rdot(r.name), " ", r.name), h("td", null, open ? `${r.pct}%` : "鎖住"));
  })));
  const summary = () => {
    const eff = natural - spent;
    const info = rarityOfRoll(P, eff, natural);
    return h("div", { class: "rv-sum" },
      h("div", { class: "rv-num" }, natural === 100 ? "100" : pad(eff, 2)),
      h("div", { class: "rv-r" }, rdot(info.failed ? FAILED : info.rarity), " ", info.failed ? "失敗作" : info.rarity),
      info.perfect ? h("p", { class: "rv-crit" }, "大成功 01：完美作品") : null,
      info.failed ? h("p", { class: "rv-fumble" }, `大失敗 ${natural}：做壞了（${NUM.fumbleFrom}–100 是失敗作）`) : null,
      info.capped ? h("p", { class: "sub" }, `擲到${info.want}，但它還沒解鎖，降為${info.rarity}`) : null);
  };
  const drawPanel = () => {
    const range = spendRange(P, natural, pushed, blood);
    const sumBox = h("div", null, summary());
    const tbl = h("div", null, table(natural - spent));
    let slider = null;
    const spendText = () => spent ? `花 ${spent} 點${blood ? "（血統 " + blood + " 點先用）" : "心情"} → 骰子變成 ${pad(natural - spent, 2)}　心情剩 ${P.mood - Math.max(0, spent - blood)}` : `還沒花：骰子是 ${pad(natural, 2)}，心情 ${P.mood}${blood ? "（另有血統 " + blood + " 點）" : ""}`;
    if (range > 0) {
      const lab = h("p", { class: "spend-l" }, spendText());
      const inp = h("input", { type: "range", min: "0", max: String(range), step: "1", value: String(spent), class: "mood-range", "aria-label": "花多少心情" });
      inp.addEventListener("input", () => {
        spent = +inp.value; sync();
        box.classList.remove("untouched");
        tray.show(natural - spent);
        lab.textContent = spendText();
        sumBox.replaceChildren(summary()); tbl.replaceChildren(table(natural - spent));
      });
      // 壹鍵壓到：每壹個打開了、而且花得起的更好稀有度
      const quick = rarityRanges().filter(r => r.to < natural && usable(P, ROLLED).includes(r.name)).map(r => ({ r, need: natural - r.to })).filter(x => x.need > 0 && x.need <= range).sort((x, y) => x.need - y.need) // 便宜的排前面
        .map(x => btn([rdot(x.r.name), ` 壓到${x.r.name}（花 ${x.need}）`], () => { inp.value = String(x.need); inp.dispatchEvent(new Event("input")); snd("click"); }, "ghost small"));
      const box = h("div", { class: "spend spend-box" + (spent ? "" : " untouched") },
        h("div", { class: "spend-head" }, icon("heart"), h("b", null, blood ? "用血統和心情把骰子壓低" : "用心情把骰子壓低"), h("span", { class: "spend-arrow", "aria-hidden": "true" }, "← 往左拖")),
        inp, lab,
        quick.length ? h("div", { class: "spend-quick" }, h("span", { class: "spend-q-l" }, "壹鍵："), quick) : null,
        h("p", { class: "sub" }, "1 點心情壓低 1，最低壓到 02；01 要原本就擲出。"));
      slider = box;
    } else if (!pushed && natural >= NUM.fumbleFrom) slider = h("p", { class: "sub" }, `原本擲出 ${natural}（${NUM.fumbleFrom}–100 是失敗作）：不能花心情改。`);
    else if (pushed) slider = h("p", { class: "sub" }, "孤注一擲的這一次不能花心情。");
    panel.replaceChildren(sumBox, tbl, slider,
      h("div", { class: "rv-btns" },
        btn("就這樣", () => accept(), "primary"),
        !pushed ? btn("孤注一擲", () => push(), "", { title: `重擲壹次；不能花心情。結果比原本差，要擲理智（${sanWords(NUM.pushSan)}）` }) : null,
        rerollsLeft(P) ? btn([icon("dice"), ` 重擲十位骰（今天還有 ${rerollsLeft(P)} 次）`], () => reroll(), "ghost", { title: "骰子打磨：只重擲十位那顆，不算孤注壹擲" })
          : !free && hasUp(P, "dice") ? limitPill(`骰子打磨今天用完了（壹天 ${NUM.diceRerolls} 次），明天再來`, 0) : null),
      fu && fu.title ? h("p", { class: "sub" }, `配方「${fu.title}」${fu.minRarity ? `：至少${fu.minRarity}` : ""}`) : null);
    panel.querySelector(".btn.primary").focus({ preventScroll: true });
    // 骰子停了：「用心情壓低」和「就這樣」要看得到（手機上原本在畫面下面約 500px）
    later(() => { bring(panel.querySelector(".spend-box") || panel.querySelector(".rv-sum"), "start"); later(() => bring(panel.querySelector(".rv-btns")), 450); }, 150);
  };
  const run = async () => {
    root.classList.add("rolling"); // 擲骰時展台是空的：先縮小，骰盤才不會被擠到畫面外
    tray = FX.createDiceTray(trayHost, { spec: "d100", label: "擲 d100 決定稀有度" });
    panel.replaceChildren(table(-1), h("p", { class: "sub" }, "點骰子，或把骰子丟出去。"));
    bring(trayHost, "center");
    await tray.throw(params.roll);
    // 藝術史學者：鑑賞成功就多擲一顆十位骰，取低的（CoC 的獎勵骰）
    if (hasTalent(P, "鑑賞")) {
      const sc = skillCheck(P, "鑑賞");
      if (sc.success) {
        const t2 = Math.floor(RNG() * 10), u = d100Faces(natural)[1];
        const alt = t2 === 0 && u === 0 ? 100 : t2 * 10 + u;
        note(`鑑賞 ${sc.roll.total} ≤ ${sc.target} 成功：多擲壹顆十位骰（${pad(t2 * 10, 2)}），取低的`, "good");
        if (alt < natural) { natural = alt; sync(); tray.show(natural); }
      } else note(`鑑賞 ${sc.roll.total} > ${sc.target}：這次看不出門道`);
    }
    firstInfo = rarityOfRoll(P, natural, natural);
    if (natural === 1 || natural >= NUM.fumbleFrom) snd(natural === 1 ? "crit01" : "fumble100");
    drawPanel();
  };
  const push = async () => {
    pushed = true; spent = 0;
    const before = rarityOfRoll(P, natural, natural);
    const nr = pushRoll(P);
    natural = nr.total; sync();
    panel.replaceChildren(h("p", { class: "sub" }, "孤注一擲：再擲一次。這次不能花心情。"));
    await tray.throw(nr);
    const after = rarityOfRoll(P, natural, natural);
    const rank = i => i.failed ? -1 : rarityRank(i.rarity);
    if (rank(after) < rank(before)) {
      note("比原本還差……", "bad");
      const lucky = hasTalent(P, "幸運") ? skillCheck(P, "幸運") : null;
      if (lucky && lucky.success) note(`幸運 ${lucky.roll.total} ≤ ${lucky.target}：賭徒笑了笑，不用做理智檢定`, "good");
      else await sanFlow(NUM.pushSan, null, "孤注一擲", { noInvoluntary: true, anchor: trayHost, uk: "push" });
      if (pm.done) return;
      if (P.dark) { pm.done = true; finishMake(P, params.pick, { natural, spent: 0, pushed: true }); persist(); await checkEnding(); return; }
    }
    drawPanel();
  };
  const reroll = async () => {
    const nr = rerollTens(P, { total: natural, faces: d100Faces(natural) });
    if (!nr) return;
    spent = 0; natural = nr.total; sync();
    panel.replaceChildren(h("p", { class: "sub" }, "骰子打磨：重擲十位那顆。"));
    await tray.throw(nr, { auto: true });
    drawPanel();
  };
  const accept = () => {
    if (pm.done) return;
    pm.done = true; UI.pendingMake = null;
    const res = finishMake(P, params.pick, { natural, spent, pushed, fusion: fu });
    noteCraft(); // 館內股票：手作坊今天有人做過
    persist();
    tray.el.classList.add("done");
    reveal(res);
  };
  async function reveal(res) {
    panel.replaceChildren();
    root.classList.remove("rolling");
    root.classList.add("lights-down");
    bring(stage, "start"); // 揭曉：捲回展台，佩佩整隻看得到
    const tone = res.failed ? "failed" : res.pick[ROLLED];
    root.dataset.r = tone;
    snd("whoosh");
    await wait(600);
    frogBox.innerHTML = res.failed ? frogHTML(res.pick, { failed: true }) : frogHTML(res.pick, { fx: true, perfect: res.perfect });
    frogBox.classList.add("live", "rise");
    if (!res.failed) enliven(frogBox, res.pick);
    const legend = ["傳說級稀有", "不可名狀"].includes(res.pick[ROLLED]) && !res.failed;
    // 揭曉：稀有度越高越熱鬧；完美作品再加一串亮音
    snd(res.failed ? "revFailed" : legend ? "revLegend" : res.pick[ROLLED] === "超稀有" ? "revSuper" : res.pick[ROLLED] === "稀有" ? "revRare" : "revCommon");
    if (res.perfect && !res.failed) later(() => snd("crit01"), 700);
    if (!res.failed && res.pick[ROLLED] === "不可名狀") later(() => snd("eerie", 2), 900);
    if (legend) { await wait(300); FX.goldDust(stage, 3200); }
    await wait(950);
    const d = describePepe(res.pick, { failed: res.failed });
    const dot = rdot(res.failed ? FAILED : res.pick[ROLLED]);
    dot.classList.add("later");
    const third = h("div", { class: "pl-line pl-r" }, dot, " ", res.failed ? "失敗作" : res.pick[ROLLED], d.no ? "　" + d.no : "");
    const entry = !res.failed && P.pepes[res.key];
    const flavor = res.failed ? pickOne(FAILED_WORK_TEXT) : entry && entry.title ? `名號：「${entry.title}」` : res.perfect ? pickOne(PERFECT_WORK_TEXT) : null;
    const total = res.failed ? `失敗作 ${Object.keys(P.failed).length} 件` : `圖鑑 ${codexCount(P)}／${num(CORE_TOTAL)}`;
    const pl = placard([d.title, d.extra, third,
      flavor ? h("div", { class: "pl-aside" }, flavor) : null,
      h("div", { class: "pl-foot" }, fill(GEN_TEXT.done, d.full), " ", GEN_TEXT.gift),
      h("div", { class: "pl-count" + (res.isNew ? " new" : "") }, res.isNew ? `新收藏！${total}` : "這種你已經有了")], { gold: res.perfect, cls: "rv-placard" });
    panel.replaceChildren(pl);
    await wait(600);
    dot.classList.add("lit");
    if (res.isNew && !legend) snd("unlock");
    const item = { kind: res.kind, key: res.key, pick: res.pick, perfect: res.perfect };
    panel.append(h("div", { class: "rv-btns" },
      params.from === "fusion" ? btn("回融合室", () => go("fusion"), "primary") : btn("再做一隻", () => go("workshop"), "primary"),
      btn("印成抱枕", () => { P.plPrint = (res.kind === "failed" ? "f:" : "p:") + res.key; go("pillow"); }),
      btn("放進展廳", () => go("hall", { place: item })),
      btn("去委託櫃台", () => go("commission"), "ghost"),
      btn([icon("lobby"), " 回大廳"], () => go("lobby"), "ghost"))); // 介面檢查：揭曉沒有回大廳
    panel.querySelector(".btn.primary").focus({ preventScroll: true });
    later(() => bring(panel.querySelector(".rv-btns")), 400); // 按鈕不在畫面裡就補捲到剛好看得到
    await showEvents(res.events);
    updateStatus();
  }
  run();
};

// ---------- 書裡的字（翊文 11-08：書可以互動） ----------
// 頁面上的 [[字|動作]] 變成可以點的字；{圖鑑格數} 換成真正的格數（改選項之後也不會寫錯）
export const CAT_ICON = { 稀有度: "star", 心情: "heart", 顏色: "palette", 帽子: "hat", 姿勢: "frog", 背景: "gallery", 手上拿的東西: "hand" };
export const BOOK_LINK = /\[\[(.+?)\|(.+?)\]\]/g;
export function bookLine(l) {
  const s = String(l).split("{圖鑑格數}").join(num(CORE_TOTAL));
  const parts = [];
  let last = 0, m;
  BOOK_LINK.lastIndex = 0;
  while ((m = BOOK_LINK.exec(s))) {
    if (m.index > last) parts.push(ptNode(s.slice(last, m.index)));
    const act = m[2], word = m[1];
    parts.push(h("button", { type: "button", class: "book-link", title: "點點看", onClick: e => { const f = BOOK_ACTIONS[act]; if (f) f(e.currentTarget); } }, word));
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(ptNode(s.slice(last)));
  return h("p", null, parts);
}
export function bookAside(el, text) {
  const page = el.closest(".page");
  if (!page || [...page.querySelectorAll(".book-react")].some(x => x.textContent === text)) return;
  page.append(h("p", { class: "pl-aside book-react" }, text));
}
// 讀書時得到、失去的東西：留在書的下面，不會消失
export function bookGain(reader, text, tone) {
  const g = reader && reader.querySelector(".book-gains");
  if (g) g.append(h("span", { class: "gain-chip " + (tone || "") }, text));
}
export const BOOK_ACTIONS = {
  void: el => { el.classList.add("faded"); snd("whisper"); bookAside(el, "(什麼都不做，也是壹種考證)"); },
  mirror: el => {
    snd("eerie", 1);
    const page = el.closest(".page");
    if (page && !page.querySelector(".book-mirror")) page.append(h("div", { class: "book-mirror", html: frogHTML({ 稀有度: "普通", 心情: "俄國8+9", 顏色: "綠", 帽子: "沒有", 姿勢: "斯拉夫蹲" }) }));
    bookAside(el, "(鏡子裡蹲著壹隻佩佩。牠也在看你)");
  },
  window: el => { snd("eerie", 3); bookAside(el, "(窗外什麼都沒有。你的腳跟，貼著地)"); },
  beat: el => { snd("gopnik"); bookAside(el, "(你的腳開始跟著打拍子)"); },
  hat: el => { snd("squelch"); bookAside(el, "(你摸了摸頭頂。有東西在動)"); },
  codex: () => { snd("eerie", 0); go("codex", { tab: "pepe", beyond: true }); },
  cellar: () => go("cellar"),
};
