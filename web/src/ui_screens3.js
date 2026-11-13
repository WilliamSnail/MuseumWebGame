// ================================================================
//  第 3 版的畫面：選職業、技能成長、融合室、館長室、地下收藏庫、每週特展
// ================================================================

// ---------- 選職業（系統 L） ----------
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { CELLAR_POWER, CELLAR_REWARDS, COLOR_POWER, LEGACY, MOOD_BEATS, NUM, SKILLS, UPGRADES } from "../../shared/config.js";
import { BOOK4, BOOK_SEQUELS, ENDING_CELLAR, FUSION_TEXT, JOBS, JOB_TEXT, LEGACY_TEXT, RECIPE_TEXT, ROOM_HINTS3, SKILL_TEXT, UPGRADE_TEXT, VISITOR_TEXT, WEEKLY_TEXT } from "../../shared/content3.js";
import { ENDINGS, FORBIDDEN_BOOKS, NEXT_VISITOR } from "../../shared/content.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { CATS, ROLLED, activeQuirks, asList, clampN, decoOpen, exhibitById, fill, finishMake, fromKey, hallItem, isFree, maxSan, nextVisitor, num, pad, partOf, quirkName, rarityRank, scoreItems } from "../../shared/logic.js";
import { buyUpgrade, canFuse, cellarAdvance, cellarApply, cellarFloor, cellarFloors, cellarResolve, currentRoom, fusionBlood, fusionChances, fusionLeft, fusionLimit, fusionPrice, fusionRarityCost, hasUp, healInjured, injureDaysOf, jobInfo, jobSkill, leaveCellar, matchMix, matchRecipe, memberPower, paletteView, placeWeekly, repairFailed, skillGrowth, skillOf, startCellar, startFusion, teamItems, teamPower, upgradeState, weeklyState } from "../../shared/logic3.js";
import { FRESH_KEY, freshUnder, isFresh, markFresh } from "../../shared/fresh.js";
import { RETIRE_ENDINGS, cellarDarkLoss, chooseJob, legacyOptions, retireCheck, traitDesc, traitHits, traitName, traitTag, visitorMade, visitorRecord } from "../../shared/legacy.js";
import { cleanName, renameVisitor } from "../../shared/visitors.js";
import { $, $$, ADDONS, P, PANELS, SCREENS, UI, actionTick, ask, btn, collectionItems, collectionStrip, costText, freshMark, freshTag, go, h, icon, inspHave, itemHTML, itemTitle, later, limitPill, lossFlow, miniLayer, note, persist, persistNow, placard, placeTarget, ptNode, quirkCard, rerender, sanFlow, sanShort, sanWords, showEvents, snd, updateStatus, wait } from "./ui_core.js";
import { onescreenDrawer, roomHead } from "./ui_screens1.js";
import { SOCIAL } from "../../shared/gifts.js";
import { storyCellarBox } from "./ui_story.js"; // 每週劇情（11-09）：本週異狀、這週多出來的地方

// 選職業（每一位參觀者都一樣，第一位也是；11-08 翊文：「6 個職業自己選，再抽優缺點」，決定 0028）：
//   從 6 個職業選一個 → 抽一個小優點、一個小缺點（shared/legacy.js 的 chooseJob）→ 馬上存檔 → 蓋一張卡寫抽到什麼、有什麼效果（drawReveal）。
//   抽到就定了，不能重抽：存好之後 P.job 有值，重新整理也不會再選。
//   以前換人時是從 3 位候選人挑（pickCandidate，拿掉了）。候選人那一頁原本有的「前一位留下的」「取名字」搬到這一頁，做法照舊。
export function pickJob() {
  return new Promise(res => {
    if (!P || isFree(P) || P.job || typeof JOBS === "undefined") { res((P && P.job) || null); return; }
    const m = miniLayer(JOB_TEXT.pick, JOB_TEXT.sub);
    m.card.classList.add("wide", "job-modal");
    const got = legacyLine(P.legacy); // 前一位留下的（以前寫在候選人上面）：選職業之前就看得到，例如傳下來的技能
    if (got) m.card.append(h("p", { class: "cand-got" }, icon(P.legacy.type === "relic" ? "medal" : "star"), h("span", null, got)));
    // 理智歸零、退休換人時，新的這位還沒有名字：在這裡取（不填就叫「第 N 位參觀者」）。從標題「新參觀者」來的已經取好了
    let nameBox = null;
    const nameErr = h("p", { class: "vs-err", role: "alert" });
    if (!P.vname) {
      nameBox = nameInput("", `第 ${P.visitor} 位參觀者`);
      m.card.append(h("label", { class: "cand-name" }, h("b", null, VISITOR_TEXT.candName), nameBox, h("small", null, legacyFill(VISITOR_TEXT.candNameHint, { x: P.visitor }))), nameErr);
    }
    m.card.append(h("p", { class: "job-draw-note" }, icon("dice"), h("span", null, LEGACY_TEXT.drawNote)));
    let busy = false;
    const grid = h("div", { class: "job-grid" }, JOBS.map(j => {
      const b = h("button", { type: "button", class: "job" },
        h("span", { class: "job-badge", html: ART.jobBadge ? ART.jobBadge(j.id) : ART.icon("medal") }),
        h("b", null, j.name), h("span", { class: "job-skill" }, `拿手：${j.skill}`),
        h("span", { class: "job-desc" }, j.desc), j.motto ? h("span", { class: "job-motto" }, `「${j.motto}」`) : null);
      b.addEventListener("click", async () => {
        if (busy) return;
        if (nameBox && nameBox.value.trim()) {
          if (!renameVisitor(P, P.vid, nameBox.value)) { nameErr.textContent = nameError(nameBox.value); snd("error"); nameBox.focus(); return; }
        }
        const r = chooseJob(P, j.id);
        if (!r) return;
        busy = true;
        persistNow(); // 抽到的馬上存（不等幾秒），重新整理也不能重抽
        m.close(); snd("unlock");
        updateStatus();
        await drawReveal(r);
        note(legacyFill(LEGACY_TEXT.drawDone, { who: visitorLabel(P), job: j.name, perk: traitName(r.perk), flaw: traitName(r.flaw) }), "good");
        if (UI.screen === "lobby") rerender(); // 大廳旁邊的「誰在館裡」換成新的名字、職業（11-08）
        res(j.id);
      });
      return b;
    }));
    m.card.append(grid);
    (nameBox || grid.querySelector("button")).focus();
  });
}
// 選好職業之後蓋的卡（決定 0028）：抽到的小優點、小缺點（名字＋效果）、拿手和技能（加減多少）、開場的心情和理智。
// 已經存好了，這裡只是給玩家看清楚；只有「知道了」，沒有重抽
export function drawReveal(r) {
  return new Promise(res => {
    const j = jobInfo(r.job);
    const m = miniLayer(LEGACY_TEXT.drawTitle, legacyFill(LEGACY_TEXT.drawSub, { who: visitorLabel(P), job: j.name }));
    m.card.classList.add("wide", "draw-modal");
    const sign = v => (v > 0 ? `+${v}` : `−${-v}`);
    const whyOf = what => r.why.filter(w => w.what === what).map(w => `${w.id === "legacy" ? LEGACY_TEXT.drawLegacy : traitName(w.id)} ${sign(w.v)}`).join("、");
    const fromTo = (a, b, what) => (a === b ? String(b) : `${a} → ${b}${whyOf(what) ? `（${whyOf(what)}）` : ""}`);
    const drawn = (id, kind, i) => (id ? h("div", { class: "draw-card " + kind, style: { "--i": i } },
      h("span", { class: "draw-kind" }, kind === "perk" ? LEGACY_TEXT.perk : LEGACY_TEXT.flaw),
      h("b", { class: "draw-name" }, traitName(id)),
      h("span", { class: "draw-desc" }, traitDesc(id))) : null);
    const skills = h("div", { class: "cand-skills" }, SKILLS.map(s => {
      const d = r.delta[s] || 0;
      return h("span", { class: "cand-sk" + (s === r.main ? " main" : "") + (d > 0 ? " up" : d < 0 ? " down" : "") },
        h("small", null, s), h("b", null, String(r.skills[s])), d ? h("i", null, sign(d)) : null);
    }));
    const ok = btn(LEGACY_TEXT.drawOk, () => { m.close(); res(); }, "primary");
    m.card.append(
      h("div", { class: "draw-head" }, h("span", { class: "job-badge", html: ART.jobBadge ? ART.jobBadge(r.job) : ART.icon("medal") }),
        h("span", { class: "draw-id" }, h("b", null, j.name), h("span", { class: "job-skill" }, `拿手：${r.main} ${r.value}`))),
      h("div", { class: "draw-cards" }, drawn(r.perk, "perk", 0), drawn(r.flaw, "flaw", 1)),
      skills,
      r.moodAgain ? h("p", { class: "cand-start" }, `賭徒的運氣：心情再擲壹次是 ${r.moodAgain.value}，取高的`) : null,
      h("p", { class: "cand-start" }, `開場：心情 ${fromTo(r.moodFrom, r.mood, "mood")}・理智 ${fromTo(r.sanityFrom, r.sanity, "sanity")}`),
      h("div", { class: "rv-btns" }, ok));
    snd("flip");
    ok.focus();
  });
}
// 技能成長（CoC 的經驗檢定）：每天第一次進館
export function growthFlow() {
  return new Promise(res => {
    if (!UI.pendingGrowth || !P || isFree(P)) { res(); return; }
    UI.pendingGrowth = false;
    const g = skillGrowth(P);
    persist();
    if (!g.length) { res(); return; }
    const m = miniLayer("技能成長", "昨天用成功過的技能，擲 d100 比技能值大就 +1D10。");
    const why = traitHits(P, "growth").map(traitTag).join("、"); // 小優點「學得快」、小缺點「慢熱」（11-08）
    m.card.append(h("div", { class: "growth" }, g.map(x => h("p", null,
      h("b", null, x.skill), `：擲出 ${pad(x.roll.total, 2)}　`,
      x.up ? h("span", { class: "good" }, `＞ ${x.value - x.gain}，+${x.gain} → ${x.value}${x.adj && why ? `（${why}）` : ""}`) : `≤ ${x.value}，這次沒有長進`))),
      h("div", { class: "rv-btns" }, btn("好", () => { m.close(); res(); }, "primary")));
    g.filter(x => x.up).forEach(x => note(fill(JOB_TEXT.growth, x.skill), "good"));
    m.card.querySelector(".btn").focus();
  });
}

// ---------- 參觀者一位接一位（翊文 11-08，roguelike 的繼承；規則在 shared/legacy.js） ----------
// LEGACY_TEXT 裡的 {名字} 換成值
export const legacyFill = (t, o = {}) => Object.keys(o).reduce((s, k) => s.split("{" + k + "}").join(String(o[k])), String(t));
// 遺物（或前任留下的遺物）→ 收藏列的格式，畫圖、寫名字用
export function relicItem(r) {
  if (!r || typeof r.key !== "string") return null;
  if (r.kind === "pillow") return { kind: "pillow", key: r.key };
  const pick = fromKey(r.key);
  return pick ? { kind: r.kind, key: r.key, pick, perfect: !!r.perfect } : null;
}
// 前一位留給這一位的東西，寫成一句話
export function legacyLine(L) {
  if (!L) return null;
  const who = whoOf(L.from, L.fromName); // 11-08：有名字寫名字（以前的沒有，寫「第 N 位參觀者」）
  if (L.type === "relic") { const it = relicItem(L); return legacyFill(L.mood ? LEGACY_TEXT.gotRelic : LEGACY_TEXT.gotRelicNoMood, { who, name: it ? itemTitle(it) : "?", mood: L.mood }); }
  if (L.type === "skill") return legacyFill(LEGACY_TEXT.gotSkill, { who, skill: L.skill, plus: L.plus });
  return null;
}
// ---------- 多位參觀者的名字（11-08 翊文：「玩家可以選擇和命名多個參觀者」，決定 0018；規則在 shared/visitors.js） ----------
// 名字是玩家打的字：一律用 h() 的字串（純文字）放，不用 html:
// 稱呼：有名字「阿明（第 2 位參觀者）」，沒有「第 2 位參觀者」
export const whoOf = (n, name) => (name ? `${name}（第 ${n || 1} 位參觀者）` : `第 ${n || 1} 位參觀者`);
export const visitorLabel = v => whoOf(v && v.visitor, v && v.vname);
// 名字為什麼不行（cleanName 回傳 null 的時候）
export function nameError(raw) {
  const t = String(raw == null ? "" : raw).trim();
  if (!t) return VISITOR_TEXT.errEmpty;
  if ([...t].length > LEGACY.nameMax) return legacyFill(VISITOR_TEXT.errLong, { max: LEGACY.nameMax });
  return VISITOR_TEXT.errBad;
}
export function nameInput(value, placeholder) {
  return h("input", { class: "t-input vs-input", type: "text", maxlength: String(LEGACY.nameMax), autocomplete: "off", spellcheck: "false",
    placeholder: placeholder || VISITOR_TEXT.placeholder, value: value || "", "aria-label": VISITOR_TEXT.label });
}
// 問名字（新參觀者、改名字）：回傳整理好的名字；按「算了」或 Esc 回傳 null
export function askVisitorName({ title = VISITOR_TEXT.add, sub = "", value = "", ok = VISITOR_TEXT.next } = {}) {
  return new Promise(res => {
    const m = miniLayer(title, sub);
    m.card.classList.add("vs-ask");
    const input = nameInput(value);
    const err = h("p", { class: "vs-err", role: "alert" });
    const done = v => { m.close(); res(v); };
    const form = h("form", { class: "vs-form" }, input, err,
      h("div", { class: "rv-btns" }, h("button", { type: "submit", class: "btn primary" }, ok), btn(VISITOR_TEXT.cancel, () => done(null), "ghost")));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const nm = cleanName(input.value);
      if (!nm) { err.textContent = nameError(input.value); snd("error"); input.focus(); return; }
      done(nm);
    });
    m.layer.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); done(null); } });
    m.card.append(form);
    input.focus(); input.select();
  });
}
// 小優點、小缺點的小框（館長室的名片、牆上的詳細）
export function traitBox(id, kind) {
  if (!id) return null;
  return h("span", { class: "cand-trait " + kind }, h("b", null, `${kind === "perk" ? LEGACY_TEXT.perk : LEGACY_TEXT.flaw}・${traitName(id)}`), h("span", null, traitDesc(id)));
}
// A. 換人之前：留一樣東西給下一位。回傳 nextVisitor 要的 leave（{ type: "relic", item }、{ type: "skill" }、null ＝什麼都不留）
export function legacyFlow() {
  return new Promise(res => {
    if (!P || isFree(P)) { res(null); return; }
    const opt = legacyOptions(P);
    const m = miniLayer(legacyFill(LEGACY_TEXT.leaveTitle, { who: visitorLabel(P) }), LEGACY_TEXT.leaveSub);
    m.card.classList.add("wide", "lg-modal");
    const body = h("div", { class: "lg-body" });
    m.card.append(body);
    const done = v => { m.close(); res(v); };
    const showMain = () => {
      const relicB = h("button", { type: "button", class: "lg-opt", disabled: !opt.relic.ok }, h("span", { class: "lg-ic" }, icon("medal")), h("b", null, LEGACY_TEXT.relic),
        h("span", { class: "lg-desc" }, opt.relic.ok ? legacyFill(opt.relic.mood ? LEGACY_TEXT.relicDesc : LEGACY_TEXT.relicDescNoMood, { who: visitorLabel(P), mood: opt.relic.mood }) : LEGACY_TEXT.relicNone));
      relicB.addEventListener("click", () => { snd("click"); showRelic(); });
      const skillB = opt.skill.ok ? h("button", { type: "button", class: "lg-opt" }, h("span", { class: "lg-ic" }, icon("star")), h("b", null, LEGACY_TEXT.skill),
        h("span", { class: "lg-desc" }, legacyFill(LEGACY_TEXT.skillDesc, opt.skill))) : null;
      if (skillB) skillB.addEventListener("click", () => { snd("unlock"); done({ type: "skill" }); });
      body.replaceChildren(h("div", { class: "lg-grid" }, relicB, skillB), h("div", { class: "rv-btns" }, btn(LEGACY_TEXT.none, () => done(null), "ghost")));
      (opt.relic.ok ? relicB : skillB || body.querySelector(".btn")).focus();
    };
    const showRelic = () => {
      let chosen = null;
      const preview = h("div", { class: "lg-preview" }, h("div", { class: "relic-glass" }), h("div", { class: "lg-pv-t" }, h("b", null, LEGACY_TEXT.relicEmpty), h("span", { class: "relic-label" }, legacyFill(LEGACY_TEXT.relicLabel, { who: visitorLabel(P) }))));
      const ok = btn([icon("medal"), " ", LEGACY_TEXT.relicOk], () => { if (chosen) { snd("unlock"); done({ type: "relic", item: { kind: chosen.kind, key: chosen.key } }); } }, "primary", { disabled: true });
      const kinds = ["pepe", "failed", "pillow", "repaired"];
      const strip = collectionStrip({ tabs: kinds, start: kinds.find(k => collectionItems(k).length) || "pepe", title: LEGACY_TEXT.relicPick, hint: LEGACY_TEXT.relicHint,
        onPick: item => {
          chosen = item; ok.disabled = false; snd("click");
          preview.replaceChildren(h("div", { class: "relic-glass" }, h("div", { class: "relic-art", html: itemHTML(item) })),
            h("div", { class: "lg-pv-t" }, h("b", null, itemTitle(item)), h("span", { class: "relic-label" }, legacyFill(LEGACY_TEXT.relicLabel, { who: visitorLabel(P) }))));
          strip.refresh();
        },
        selected: item => !!chosen && chosen.kind === item.kind && chosen.key === item.key });
      body.replaceChildren(preview, strip, h("div", { class: "rv-btns" }, ok, btn(LEGACY_TEXT.back, showMain, "ghost")));
      const first = strip.querySelector(".strip-item");
      if (first) first.focus({ preventScroll: true });
    };
    showMain();
  });
}
// ---------- 退休換人（11-08 翊文：「好，加些其他的」，docs/決定/0025-退休換人.md；規則在 shared/legacy.js 的 retireCheck） ----------
// 結局的名字（牆上「看完「館長」，退休了。」）
export function endingTitle(id) {
  if (id === "cellar") return (typeof ENDING_CELLAR !== "undefined" && ENDING_CELLAR.title) || id;
  return (ENDINGS[id] && ENDINGS[id].title) || id;
}
// 牆上「怎麼結束的」：退休的那幾種（理智歸零另外寫）
export function retireWords(endedBy) {
  if (endedBy === "retire") return LEGACY_TEXT.endRetire;
  if (RETIRE_ENDINGS.includes(endedBy)) return legacyFill(LEGACY_TEXT.endEnding, { ending: endingTitle(endedBy) });
  return null;
}
// 不能退休的原因寫成字
export function retireReason(c) {
  const t = { dark: LEGACY_TEXT.notDark, bout: LEGACY_TEXT.notBout, cellar: LEGACY_TEXT.notCellar, picking: LEGACY_TEXT.notPicking }[c.reason];
  return t || (c.reason === "new" ? legacyFill(LEGACY_TEXT.notNew, { x: c.days || 1 }) : "");
}
// 換下一位（理智歸零、退休都走這裡）：留一樣東西（A）→ 寫上牆（D）→ 擲心情 → 選職業、抽小優缺點、取名字（C，決定 0028）。endedBy ＝怎麼結束的
export async function retireFlow(endedBy) {
  const who = visitorLabel(P);
  const leave = await legacyFlow();
  const r = nextVisitor(P, endedBy, leave);
  markFresh(P, "office", "wall:" + r.entry.n); // 館長室的歷任參觀者牆多了一張（導覽列標「新」）
  persist();
  go("lobby", {}, { action: false });
  if (endedBy !== "russia8") note(legacyFill(LEGACY_TEXT.retired, { who }), "neutral");
  await FX.rollOverlay({ title: "下一位參觀者", sub: NEXT_VISITOR.join("　"), spec: "3D6", result: { total: r.total, faces: r.faces }, outcome: { text: `心情 ${P.mood}　理智 ${P.sanity}`, tone: "neutral" } });
  updateStatus();
  await pickJob(); // 從 6 個職業選，再抽小優點、小缺點；還沒有名字就在那一頁取
  return r;
}
// 館長室名片下面的「退休」：不用等理智用完。確認兩次
export function retireBox() {
  const c = retireCheck(P, "office");
  const b = btn(LEGACY_TEXT.officeBtn, async () => {
    if (UI.busy || !retireCheck(P, "office").ok) return;
    const who = visitorLabel(P);
    if (!(await ask(legacyFill(LEGACY_TEXT.officeAsk1, { who }), LEGACY_TEXT.retireYes, LEGACY_TEXT.retireNo))) return;
    if (!(await ask(legacyFill(LEGACY_TEXT.officeAsk2, { who }), LEGACY_TEXT.retireYes, LEGACY_TEXT.retireNo))) return;
    UI.busy = true;
    try { await retireFlow("retire"); } finally { UI.busy = false; }
  }, "ghost danger-line", { disabled: !c.ok });
  return h("div", { class: "retire-box placard" }, h("div", { class: "pl-title" }, icon("hourglass"), " ", LEGACY_TEXT.officeTitle),
    h("p", { class: "pl-line" }, LEGACY_TEXT.officeDesc), b, c.ok ? null : h("p", { class: "sub retire-why" }, retireReason(c)));
}
// 理智在哪裡用完（P.visit.where 記的是理智檢定的來源）→ 「在畫廊看「雕像」的時候」
export function whereWords(src) {
  const s = String(src || "");
  if (!s) return null;
  if (s.startsWith("book:")) {
    const id = s.slice(5), b = [].concat(FORBIDDEN_BOOKS || [], BOOK4 ? [BOOK4] : [], BOOK_SEQUELS || []).find(x => x && x.id === id);
    return b ? `在讀禁書《${b.title}》的時候` : "在讀禁書的時候";
  }
  if (s.startsWith("cellar:")) return `在地下收藏庫 B${s.slice(7, 8)}`;
  if (s === "fusion") return "在融合室";
  if (s === "beyond") return "在圖鑑室";
  const ex = exhibitById(s);
  return ex && ex.title ? `在畫廊看「${ex.title}」的時候` : null;
}

// ---------- 融合室（系統 J） ----------
SCREENS.fusion = root => {
  const slots = UI.fusion || (UI.fusion = [null, null]);
  slots.forEach((s, i) => { if (s && !P.pepes[s.key]) slots[i] = null; });
  const altar = h("div", { class: "altar" + (slots[0] && slots[1] ? " ready" : "") }, h("div", { class: "altar-art", html: ART.altar ? ART.altar() : "" }));
  const slotEl = i => {
    const it = slots[i] ? { kind: "pepe", key: slots[i].key, pick: fromKey(slots[i].key), perfect: !!(P.pepes[slots[i].key] || {}).perfect } : null;
    const el = h("div", { class: `altar-slot s${i}` + (it ? " full" : ""), "aria-label": it ? `融合台 ${i + 1}：${itemTitle(it)}` : `融合台 ${i + 1}：空的` },
      h("div", { class: "altar-frog", html: it ? itemHTML(it) : "" }),
      h("div", { class: "altar-label" }, it ? itemTitle(it) : i === 0 ? "爸爸" : "媽媽"),
      it ? h("button", { type: "button", class: "icon-btn ped-x", "aria-label": "拿下來", onClick: e => { e.stopPropagation(); slots[i] = null; rerender(); } }, icon("close")) : null);
    placeTarget(el, ["pepe"], item => {
      if (item.kind !== "pepe") { note("只有佩佩能放上融合台。", "bad"); return false; }
      slots[i] = { key: item.key }; snd("submit"); later(rerender, 200); return true;
    });
    return el;
  };
  altar.append(slotEl(0), slotEl(1));
  const n = Object.keys(P.pepes).length;
  const info = h("div", { class: "fusion-info" });
  const A = slots[0] && fusionItemUI(slots[0].key), B = slots[1] && fusionItemUI(slots[1].key);
  if (A && B) {
    const ch = fusionChances();
    const rec = matchRecipe(A, B);
    const rt = rec && typeof RECIPE_TEXT !== "undefined" ? RECIPE_TEXT[rec.id] : null;
    const rows = CATS.filter(c => c !== ROLLED && (!partOf(c).deco || decoOpen(P, c))).map(c => {
      const mut = partOf(c).options.filter(o => o.mutant).map(o => o.name);
      return h("tr", null, h("td", null, c), h("td", null, A.pick[c]), h("td", null, B.pick[c]), h("td", { class: "sub" }, mut.length ? mut.join("、") : "隨機"));
    });
    const blood = fusionBlood(A, B), price = fusionPrice(P, A, B), extra = fusionRarityCost(A, B);
    const mix = matchMix(A, B), mixOn = mix && !(rec && (rec.same || (rec.child && rec.child.顏色)));
    const can = canFuse(P, slots[0] && { kind: "pepe", key: slots[0].key }, slots[1] && { kind: "pepe", key: slots[1].key });
    info.append(
      placard([FUSION_TEXT.ready, `每一類：爸爸 ${ch.a}%、媽媽 ${ch.b}%、突變 ${ch.mutate}%`]),
      h("table", { class: "rtable fusion-table" }, h("thead", null, h("tr", null, h("td", null, ""), h("td", null, "爸爸"), h("td", null, "媽媽"), h("td", null, "突變"))), h("tbody", null, rows)),
      h("p", { class: "sub" }, rec ? (P.recipes[rec.id] ? `配方「${rt ? rt.name : rec.id}」會發生。` : "這一對好像會發生什麼特別的事……") : mixOn ? "" : "沒有對上配方。稀有度照樣擲 d100。"),
      mixOn ? h("p", { class: "sub pal-hit" }, P.recipes[mix.id] ? `這兩種顏色會調出「${mix.child.顏色}」。` : "這兩種顏色放在壹起，好像會調出沒看過的顏色……") : null,
      !isFree(P) ? h("p", { class: "sub" }, `血統 ${blood} 點（爸媽愈稀有愈多：稀有 ${NUM.blood}、超稀有 ${NUM.blood * 2}、傳說 ${NUM.blood * 3}${mixOn ? `；調色 +${NUM.mixBlood}` : ""}）　融合要 ${price} 靈感${extra ? `（爸媽稀有，多收 ${extra}）` : ""}${traitHits(P, "fusion").map(t => `（${traitTag(t)}）`).join("")}，還要擲理智（${sanWords(rec && rec.san ? rec.san : NUM.fusionSan)}）`) : null,
      fusionPill(),
      h("div", { class: "rv-btns" }, btn([icon("fusion"), isFree(P) ? " 融合" : ` ${costText("融合", price)}`], () => doFusion(), "primary big", { disabled: !can.ok }), isFree(P) ? null : inspHave(price), can.ok ? null : h("p", { class: "warn-line" }, can.reason)));
  } else info.append(placard([FUSION_TEXT.empty, "點下面的佩佩，或拖到融合台上。同一隻有兩隻以上，也可以自己跟自己融合。"]), fusionPill());
  info.append(palettePane());
  const strip = collectionStrip({ tabs: ["pepe"], title: "你的收藏", hint: "點一隻放上融合台", drag: true,
    onPick: item => { const i = slots[0] ? (slots[1] ? 0 : 1) : 0; slots[i] = { key: item.key }; snd("submit"); rerender(); },
    selected: item => slots.some(s => s && s.key === item.key) });
  const newRecipes = freshUnder(P, "codex", FRESH_KEY.recipe("")); // 圖鑑室的配方頁有新的：按鈕上也標「新」（11-08）
  root.append(roomHead("融合室", FUSION_TEXT.intro, btn([icon("scroll"), " 配方圖鑑", newRecipes ? freshTag("tab-fresh") : null], () => go("codex", { tab: "recipes" }), "ghost")),
    h("p", { class: "sub" }, `配對的可能性：收藏 ${num(n)} 隻 × ${num(n)} 隻 ＝ ${num(n * n)} 種`),
    h("div", { class: "fusion-wrap" }, altar, info), strip);
};
export function fusionItemUI(key) { const e = P.pepes[key]; return e ? { kind: "pepe", key, pick: fromKey(key), perfect: !!e.perfect } : null; }
export async function doFusion() {
  if (UI.busy) return;
  const slots = UI.fusion;
  const f = startFusion(P, { kind: "pepe", key: slots[0].key }, { kind: "pepe", key: slots[1].key });
  if (!f.ok) { snd("error"); note(f.reason, "bad"); return; }
  UI.busy = true;
  try {
    const altar = $(".altar");
    if (altar) altar.classList.add("fusing");
    snd("fuse"); updateStatus(); persist();
    await wait(1000);
    if (!isFree(P)) {
      await sanFlow(f.san, "fusion", "融合", { anchor: altar || undefined, noInvoluntary: true });
      if (P.dark) return;
    }
    if (f.mutations.length) snd("mutate");
    f.mutations.forEach(m => note(fill(FUSION_TEXT.mutate, m.name), "good"));
    await showEvents(f.events);
    UI.fusion = [null, null];
    const fusion = { blood: f.blood, minRarity: f.minRarity, title: f.title, recipe: f.recipe, fixed: f.fixed };
    if (f.fixed || isFree(P)) go("reveal", { res: finishMake(P, f.child, { natural: 50, fusion }), from: "fusion" });
    else go("reveal", { pick: f.child, roll: f.roll, fusion, from: "fusion" });
  } finally { UI.busy = false; }
}

// ---------- 館長室（升級、名片、修復台、送館友、歷任參觀者） ----------
SCREENS.office = (root, params) => {
  // 「送館友」要登入才有（單機沒有館友）：沒登入的人不放這個頁籤，網址帶 tab=trade 也回到名片
  const tab = params.tab === "trade" && !UI.net ? "sheet" : params.tab || "sheet";
  const OFFICE_IC = { sheet: "info", upgrades: "plus", repair: "hammer", trade: "share", history: "hourglass" };
  const tabs = h("div", { class: "seg big-tabs" }, [["sheet", "參觀者名片"], ["upgrades", "工坊升級"], ["repair", "修復台"], ["trade", "送館友"], ["history", JOB_TEXT.history]].filter(([id]) => id !== "trade" || UI.net).map(([id, n]) =>
    h("button", { type: "button", class: "seg-btn" + (id === tab ? " on" : ""), "aria-pressed": String(id === tab), onClick: () => go("office", { tab: id }, { action: false }) }, icon(OFFICE_IC[id]), h("span", null, n),
      (id === "upgrades" && freshUnder(P, "office", FRESH_KEY.up(""))) || (id === "history" && freshUnder(P, "office", "wall:")) ? freshTag("tab-fresh") : null))); // 有第壹次買得起的升級（11-08）；牆上多了一位參觀者（11-08，key 是 "wall:第幾位"）
  root.append(roomHead("館長室", (typeof ROOM_HINTS3 !== "undefined" && ROOM_HINTS3.office) || "", tabs));
  if (tab === "sheet") root.append(officeSheet());
  else if (tab === "upgrades") root.append(officeUpgrades());
  else if (tab === "repair") root.append(officeRepair());
  else if (tab === "trade") root.append(officeTrade());
  else root.append(officeHistory());
};
export function officeSheet() {
  if (isFree(P)) return placard(["自由模式", "自由模式沒有職業，也不擲骰。"]);
  if (!P.job) return h("div", null, placard(["還沒選職業"]), btn("選職業", async () => { await pickJob(); rerender(); }, "primary"));
  const j = jobInfo(P.job);
  const main = jobSkill(P.job);
  return h("div", { class: "sheet" },
    h("div", { class: "sheet-head placard" },
      h("div", { class: "sheet-badge", html: ART.jobBadge ? ART.jobBadge(P.job) : "" }),
      h("div", null, h("div", { class: "pl-title" }, `${visitorLabel(P)}・${j.name}`), j.desc ? h("div", { class: "pl-line" }, j.desc) : null, j.motto ? h("div", { class: "pl-aside" }, `「${j.motto}」`) : null,
        // 參觀者一位接一位（11-08）：這一位的小優缺點、前一位留下的
        P.perk || P.flaw || P.legacy ? h("div", { class: "sheet-traits" }, traitBox(P.perk, "perk"), traitBox(P.flaw, "flaw"),
          legacyLine(P.legacy) ? h("p", { class: "cand-got" }, icon(P.legacy.type === "relic" ? "medal" : "star"), h("span", null, legacyLine(P.legacy))) : null) : null)),
    h("div", { class: "sheet-left" }, h("div", { class: "sheet-stats" },
      [["心情", `${P.mood}／99`], ["理智", `${P.sanity}／${maxSan(P)}`], ["佩佩神話", String(P.myth)], ["靈感", String(P.insp)], ["做過", `${P.stats.made} 隻`], ["融合", `${P.stats.fused || 0} 次`]].map(([k, v]) => h("div", { class: "stat" }, h("span", null, k), h("b", null, v)))),
      // 怪癖放在數字正下方（翊文 11-08：「怪癖要上面一點才看的到」）
      // 11-09（決定 0027）：卡片上寫要做的那件事、還剩幾分鐘；時間到的不列
      activeQuirks(P).length ? h("div", { class: "sheet-quirks" }, h("div", { class: "sq-title" }, icon("eye"), "怪癖"), activeQuirks(P).map(q => quirkCard(q))) : null,
      ADDONS.sheet ? ADDONS.sheet() : null), // 穿了什麼裝備（決定 0032，ui_shop.js）。放左邊這壹欄：以前排在技能下面那壹列，左邊空壹大塊（翊文 11-10）
    h("div", { class: "skills placard" }, h("div", { class: "pl-title" }, "技能"),
      SKILLS.map(s => h("div", { class: "skill-row" + (s === main ? " main" : "") },
        h("span", { class: "skill-n" }, s, s === main ? "（拿手）" : ""),
        h("span", { class: "skill-bar" }, h("i", { style: { width: skillOf(P, s) + "%" } })),
        h("b", null, String(skillOf(P, s))),
        h("span", { class: "skill-tick", title: "今天用成功過，明天會擲成長" }, P.skillTicks[s] ? "✓" : ""),
        h("span", { class: "skill-desc sub" }, (typeof SKILL_TEXT !== "undefined" && SKILL_TEXT[s]) || "", traitHits(P, "skill:" + s).map(t => `（${traitTag(t)}）`).join("")))), // 放大鏡這種裝備（決定 0032）
      h("p", { class: "sub" }, "擲 d100 ≤ 技能值就成功。用成功過的技能打勾，明天第一次進館擲成長。")),
    retireBox()); // 退休（11-08，決定 0025）
}
export function officeUpgrades() {
  return h("div", null, inspHave(), h("div", { class: "badge-grid" }, UPGRADES.map(u => {
    const t = (typeof UPGRADE_TEXT !== "undefined" && UPGRADE_TEXT[u.id]) || { name: u.id, desc: "" };
    const st = upgradeState(P, u.id);
    const b = h("div", { class: "badge upgrade" + (st.state === "owned" ? " got" : "") }, icon(st.state === "owned" ? "check" : "hammer"),
      h("b", null, t.name), h("p", { class: "sub" }, t.desc),
      st.state === "owned" ? h("p", { class: "sub" }, `已經有了・${P.upgrades[u.id]}`) :
      st.state === "req" ? h("p", { class: "sub" }, st.text) :
      btn(costText("買", u.cost), () => {
        const r = buyUpgrade(P, u.id);
        if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
        snd("unlock"); note(`買了「${t.name}」`, "good"); updateStatus(); persist(); rerender(); showEvents(r.events);
      }, st.ok ? "primary" : "ghost"),
      st.state === "buy" && !st.ok && P.insp < u.cost ? h("p", { class: "up-short" }, `還差 ${u.cost - P.insp} 靈感`) : null);
    return freshMark(b, st.state === "buy" && isFresh(P, "office", FRESH_KEY.up(u.id)));
  })));
}
export function officeRepair() {
  if (!hasUp(P, "repair")) return h("div", null, placard(["修復台還沒買", "在「工坊升級」買了修復台，就能把失敗作修成修復品、治好在地下收藏庫受傷的佩佩。"]), btn("去工坊升級", () => go("office", { tab: "upgrades" }, { action: false }), "primary"));
  const failed = collectionItems("failed");
  const hurt = Object.keys(P.injured).filter(k => P.pepes[k]).map(k => ({ kind: "pepe", key: k, pick: fromKey(k) }));
  return h("div", null, inspHave(),
    h("h3", { class: "sec-title" }, `受傷的佩佩（${hurt.length}）`),
    hurt.length ? h("div", { class: "item-grid" }, hurt.map(it => h("div", { class: "item-card" }, h("div", { class: "si-art", html: itemHTML(it) }),
      h("p", { class: "sub" }, `${itemTitle(it)}・${P.injured[it.key]} 會自己好`),
      btn(costText("治好", NUM.healCost), () => { const r = healInjured(P, it.key); if (!r.ok) { note(r.reason, "bad"); return; } snd("hug"); note("包紮好了。", "good"); updateStatus(); persist(); rerender(); }, "ghost"))))
      : h("p", { class: "empty" }, "沒有受傷的佩佩。"),
    h("h3", { class: "sec-title" }, `失敗作（${failed.length}）`),
    failed.length ? h("div", { class: "item-grid" }, failed.map(it => h("div", { class: "item-card" }, h("div", { class: "si-art", html: itemHTML(it) }),
      h("p", { class: "sub" }, itemTitle(it)),
      btn(costText("修修看", NUM.repairCost), () => {
        const r = repairFailed(P, it.key);
        if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
        if (r.check && !r.check.skip) note(`手工藝 ${r.check.roll.total} ≤ ${r.check.target}？${r.fixed ? "成功" : "失手了"}`, r.fixed ? "good" : "bad");
        if (r.fixed) { snd("unlock"); note("修好了，變成修復品。", "good"); showEvents(r.events); }
        updateStatus(); persist(); rerender();
      }, "ghost"))))
      : h("p", { class: "empty" }, `沒有失敗作。擲出 ${NUM.fumbleFrom}–100 才會有。`));
}
// 送館友（11-09，翊文：「這些分享不需要用分享碼了，直接可以選擇館友才對」）：選館友 → 選一隻 → 寄到他的信箱（規則在 shared/gifts.js，伺服器在 functions/visit.js 的 sendGift）。取代交換碼
export function officeTrade() {
  const free = isFree(P);
  return h("div", { class: "trade" }, h("div", { class: "share-box" },
    h("p", { class: "sub" }, `選一位館友，再挑一隻送給他：寄到他的信箱，他不在線也收得到，上線後自己領（${SOCIAL.mailDays} 天沒領就不見）。送出去就拿不回來。`),
    free ? h("p", { class: "warn-line" }, "自由模式不能送佩佩（收藏是挑戰模式的）。回挑戰模式的參觀者，才送得出去。") : null,
    h("div", { class: "rv-btns" },
      btn([icon("share"), " 選館友，送佩佩"], () => PANELS.pickFriend({ title: "送佩佩給館友", hint: "選一位館友，下一步挑要送的那隻。", onPick: p => PANELS.giftTo(p) }), "primary", { disabled: free || undefined }),
      PANELS.mail ? btn([icon("mail"), " 看信箱"], () => PANELS.mail(), "ghost") : null),
    h("p", { class: "sub" }, "館友送你的佩佩，會放在信箱（選單 → 信箱）裡，到那裡領。")));
}
// D. 歷任參觀者牆（11-08）：上面是遺物櫃，下面一位一張卡（最前面是現在這一位），點了展開詳細
export function officeHistory() {
  const list = asList(P.history), relics = asList(P.relics), free = isFree(P);
  const cards = [];
  if (!free) { const now = visitorRecord(P, null); cards.push(historyCard(Object.assign(now, { now: true }), now.madeThis)); }
  // 多位參觀者（11-08）：別的位子上的也在館裡（收著的欄位蓋在 P 上算紀錄，博物館的累計照 P 的）
  if (!free) asList(P.visitors).filter(v => v && v.slot != null).sort((a, b) => a.slot - b.slot).forEach(v => {
    const r = visitorRecord(Object.assign({}, P, v), null);
    cards.push(historyCard(Object.assign(r, { now: true, here: true }), r.madeThis));
  });
  list.forEach((x, i) => cards.push(historyCard(x, visitorMade(list, i))));
  return h("div", { class: "vw" },
    relics.length ? h("section", { class: "relic-sec" }, h("h3", { class: "sec-title" }, icon("medal"), " ", LEGACY_TEXT.relics),
      h("div", { class: "relic-shelf" }, relics.map(relicCase))) : null,
    h("h3", { class: "sec-title" }, icon("hourglass"), " ", JOB_TEXT.history),
    list.length || cards.length > 1 ? h("p", { class: "sub vw-hint" }, LEGACY_TEXT.wallHint) : h("p", { class: "empty" }, legacyFill(LEGACY_TEXT.empty, { x: P.visitor })), // 別的位子有人：不寫「前面還沒有人」
    cards.length ? h("div", { class: "vw-wall" }, cards) : null);
}
export function relicCase(r) {
  const it = relicItem(r);
  return h("figure", { class: "relic-case" }, h("div", { class: "relic-glass" }, it ? h("div", { class: "relic-art", html: itemHTML(it) }) : null),
    h("figcaption", null, h("b", null, it ? itemTitle(it) : "？"), h("span", { class: "relic-label" }, legacyFill(LEGACY_TEXT.relicLabel, { who: whoOf(r.n, r.name) }))));
}
// 牆上的一張卡。x ＝ P.history 的一筆（或現在這一位的 visitorRecord）；made ＝這一位做了幾隻（不知道是 null）
export function historyCard(x, made) {
  const j = x.job ? jobInfo(x.job) : null;
  const dash = "—";
  const stat = (label, v) => h("span", { class: "vw-stat" }, h("b", null, v), h("small", null, label));
  const isNew = "perk" in x; // 11-08 以後的紀錄才有優缺點、地下、看懂、留下什麼
  const where = whereWords(x.where);
  const end = x.now ? "還在館裡" : x.endedBy === "russia8" ? `${where ? where + "，理智用完了。" : ""}最後走進了俄國8+9 的房間。` : retireWords(x.endedBy) || "離開了。";
  const left = x.left, li = left && left.type === "relic" ? relicItem(left) : null;
  const leftEl = left ? h("div", { class: "vw-left" }, li ? h("span", { class: "vw-relic", html: itemHTML(li) }) : icon(left.type === "skill" ? "star" : "medal"),
    h("span", null, left.type === "relic" ? `留下了「${li ? itemTitle(li) : "壹件收藏"}」` : `留下了「${left.skill}」+${left.plus}`))
    : !x.now && isNew ? h("div", { class: "vw-left none" }, "什麼都沒留下") : null;
  const row = (k, v) => v == null || v === "" ? null : h("div", { class: "vw-row" }, h("span", null, k), h("span", null, v));
  const more = h("div", { class: "vw-more" },
    row("來的那天", x.from || (x.now || isNew ? dash : "（更新前來的，沒有記到）")),
    x.now ? null : row("離開那天", x.d),
    x.mins != null ? row("玩了", `${x.mins} 分鐘`) : null,
    x.best ? row("最拿手", `${x.best[0]} ${x.best[1]}`) : null,
    typeof x.myth === "number" && isNew ? row("佩佩神話", String(x.myth)) : null,
    x.quirks && x.quirks.length ? row("怪癖", x.quirks.map(q => quirkName(q)).join("、")) : null,
    x.got ? row("前任留給這位的", legacyLine(x.got)) : null,
    j && j.desc ? row("職業", `${j.name}：${j.desc}`) : null,
    traitBox(x.perk, "perk"), traitBox(x.flaw, "flaw"));
  const card = h("div", { class: "vw-card" + (x.now ? " now" : ""), role: "button", tabindex: "0", "aria-expanded": "false", "aria-label": `${x.name ? x.name + "・" : ""}第 ${x.n} 位參觀者${j ? "・" + j.name : ""}` },
    x.now ? h("span", { class: "vw-now" + (x.here ? " here" : "") }, x.here ? VISITOR_TEXT.here : LEGACY_TEXT.now) : null,
    h("div", { class: "vw-top" }, h("span", { class: "vw-badge", html: j && ART.jobBadge ? ART.jobBadge(x.job) : ART.icon("frog") }),
      // 有名字寫名字（11-08）；以前的紀錄沒有名字，照舊
      h("div", { class: "vw-id" }, h("b", null, x.name || `第 ${x.n} 位參觀者`), h("span", null, [x.name ? `第 ${x.n} 位參觀者` : null, j ? j.name : "（還沒選職業）"].filter(Boolean).join("・")))),
    x.perk || x.flaw ? h("div", { class: "vw-tags" }, x.perk ? h("span", { class: "vw-tag perk" }, traitName(x.perk)) : null, x.flaw ? h("span", { class: "vw-tag flaw" }, traitName(x.flaw)) : null) : null,
    h("div", { class: "vw-stats" }, stat("做了幾隻", made == null ? dash : num(made)), stat("地下", isNew || x.now ? (x.deepest ? `B${x.deepest}` : "沒下去") : dash), stat("看懂幾件", isNew || x.now ? String(x.understood || 0) : dash)),
    h("p", { class: "vw-end" }, end),
    leftEl, more);
  const toggle = () => { const open = card.classList.toggle("open"); card.setAttribute("aria-expanded", String(open)); snd("flip"); };
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  return freshMark(card, !x.now && isFresh(P, "office", "wall:" + x.n));
}

// ---------- 地下收藏庫（系統 M） ----------
SCREENS.cellar = root => {
  if (P.cellar.run) { cellarRoom(root); return; }
  // 地下室改版（翊文 11-11 生的素材 web/public/cellar/，css/cellar2.css）：跟新大廳同壹個總開關 NUM.ui.newLobby
  const newLobby = !!(NUM.ui && NUM.ui.newLobby);
  if (newLobby) document.body.classList.add("cellar-on"); // 石牆背景；換房間時 ui_core 的 render 會拿掉
  const team = UI.cellarTeam || (UI.cellarTeam = [null, null, null]);
  team.forEach((k, i) => { if (k && (!P.pepes[k] || P.injured[k])) team[i] = null; });
  const best = P.cellar.best || 0;
  const floors = cellarFloors();
  if (UI.cellarFloor == null || UI.cellarFloor > best + 1) UI.cellarFloor = Math.min(best + 1, floors.length);
  const floorEls = floors.map(n => {
    const f = cellarFloor(n), open = n <= best + 1, done = !!P.cellar.floorsDone[n];
    const r = CELLAR_REWARDS[n] || {};
    const reward = [r.insp ? `${r.insp} 靈感` : null, r.unlock ? `「${r.unlock[1]}」` : null, r.key ? `「${r.key === "bg" ? "背景" : "手上拿的東西"}」的鑰匙` : null, r.book ? "一本禁書" : null, r.ending ? "結局" : null].filter(Boolean).join("、");
    const el = h("button", { type: "button", class: "floor" + (UI.cellarFloor === n ? " on" : "") + (open ? "" : " locked") + (done ? " done" : ""), "aria-label": `B${n} ${f.name}` },
      // 翊文 11-11：「這些名子跟圖案應該還是要留著比較好，至少解開來要看的到」：解開的樓層照舊放那層的畫；還不能去的才放上鎖的門
      newLobby && !open ? h("span", { class: "floor-door" }, h("img", { src: "/cellar/door-locked.webp", alt: "", draggable: "false" }), h("span", { class: "fd-plate" }, `B${n}`))
        : h("span", { class: "floor-art", html: ART.cellarScene ? ART.cellarScene(n, { cleared: done }) : "" }),
      h("span", { class: "floor-n" }, `B${n}`), h("b", null, open ? f.name : "？？？"),
      h("span", { class: "sub" }, done ? "走過了" : open ? `第一次走完：${reward}` : `要先走過 B${n - 1}`));
    freshMark(el, open && isFresh(P, "cellar", FRESH_KEY.floor(n))); // 新開的樓層（11-08）
    el.addEventListener("click", () => { if (!open) { note(`要先走過 B${n - 1}`); return; } UI.cellarFloor = n; rerender(); });
    return el;
  });
  const items = team.map(k => k ? { kind: "pepe", key: k, pick: fromKey(k), perfect: !!(P.pepes[k] || {}).perfect } : null);
  const slotEls = items.map((it, i) => {
    const el = h("div", { class: "team-slot" + (it ? " full" : ""), "aria-label": it ? `隊員 ${i + 1}：${itemTitle(it)}` : `隊員 ${i + 1}：空的` },
      newLobby ? h("img", { class: "ped-base", src: `/cellar/ped-${it ? "glow" : "normal"}.webp`, alt: "", draggable: "false" }) : null, // 展示台座（地下室改版）
      h("div", { class: "ped-art", html: it ? itemHTML(it) : "" }),
      h("div", { class: "ped-label" + (it ? "" : " empty") }, it ? h("b", null, itemTitle(it)) : "空位", it ? memberFacts(it) : h("span", null, "從下面的抽屜點壹隻")),
      it ? h("button", { type: "button", class: "icon-btn ped-x", "aria-label": "換下來", onClick: e => { e.stopPropagation(); team[i] = null; rerender(); } }, icon("close")) : null);
    placeTarget(el, ["pepe"], item => {
      if (item.kind !== "pepe") { note("只帶佩佩下去。", "bad"); return false; }
      if (P.injured[item.key]) { note("牠受傷了，先休息。", "bad"); return false; }
      if (team.includes(item.key)) return false;
      team[i] = item.key; snd("submit"); later(rerender, 200); return true;
    });
    return el;
  });
  const full = team.every(Boolean);
  const tp = full ? teamPower(P, items, null) : null;
  const legend = teamRules();
  const strip = collectionStrip({ tabs: ["pepe"], title: "挑隊員", hint: "點壹隻放進隊伍；受傷的不能下去", drag: true,
    meta: item => teamMeta(item, team),
    sorts: [["power", "強度高的先", (a, b) => (!!P.injured[a.key] - !!P.injured[b.key]) || (memberPower(b, null) - memberPower(a, null))], ["new", "照收藏順序", null]],
    onPick: item => { if (P.injured[item.key]) { note("牠受傷了，先休息。", "bad"); return; } if (team.includes(item.key)) return; const i = team.indexOf(null); team[i < 0 ? 2 : i] = item.key; snd("submit"); rerender(); },
    selected: item => team.includes(item.key) });
  const go_ = btn([icon("stairs"), ` 下到 B${UI.cellarFloor}`], () => {
    const r = startCellar(P, UI.cellarFloor, team);
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    snd("whoosh"); persist(); rerender();
  }, "primary big", { disabled: !full });
  // 壹個畫面看得完（docs/介面整合規劃.md 第六步，跟委託櫃台同壹個骨架；css/onescreen.css 的 .cellar-onescreen）：
  //   標題壹行（隊伍規則收成按鈕）｜中間樓層的門和隊伍的展示台｜右邊側欄（壹起下去、本週異狀、試煉房間）｜最下面挑隊員的抽屜
  const rulesBtn = btn([icon("scroll"), h("span", null, "隊伍規則", h("small", null, "強度、相剋、帽子"))], () => {
    const m = miniLayer("隊伍規則", "放哪 3 隻、戴什麼帽子，會影響在地下的強度。");
    m.card.classList.add("cellar-rules-layer");
    m.card.append(legend, h("div", { class: "rv-btns" }, btn("知道了", m.close, "primary")));
    m.layer.addEventListener("click", e => { if (e.target === m.layer) m.close(); });
  }, "onescreen-big");
  const side = h("aside", { class: "onescreen-side" },
    ADDONS.cellarTop ? ADDONS.cellarTop() : null, // 壹起下去（ui_coop.js）：側欄最上面（翊文 11-11：「壹起下去其實是很重點的但太小了」）
    storyCellarBox(),
    ADDONS.cellar ? ADDONS.cellar() : null); // 試煉房間（決定 0032，ui_shop.js）
  // 隊伍強度：總數大大的，每壹項加成（比讚、巫師帽……）壹顆小牌（翊文 11-13：「Pepe 的各種強度、Buff 等等的資料也要能顯示清楚」）
  const powerBox = tp ? h("div", { class: "poss cellar-power" },
    h("span", { class: "poss-l" }, "隊伍強度"), h("b", { class: "poss-n" }, String(tp.total)),
    h("span", { class: "cellar-power-sum" }, tp.parts.map(x => String(x.s)).join("＋") + (tp.notes.length ? "＋加成" : "")),
    tp.notes.length ? h("span", { class: "cellar-buffs" }, tp.notes.map(n => h("span", { class: "cellar-buff" }, n))) : null,
    h("small", { class: "cellar-power-hint" }, "還沒算房間的心情相剋、顏色"))
    : h("p", { class: "sub cellar-power-empty" }, `放滿 3 隻就能下去（還差 ${team.filter(k => !k).length} 隻）。`);
  root.classList.add("onescreen-room", "cellar-onescreen");
  if (!side.children.length) root.classList.add("cellar-no-side");
  root.append(roomHead("地下收藏庫", (typeof ROOM_HINTS3 !== "undefined" && ROOM_HINTS3.cellar) || "帶 3 隻佩佩下去。", rulesBtn),
    h("div", { class: "onescreen-main" },
      h("div", { class: "cellar-entry" },
        h("div", { class: "floors" }, floorEls),
        h("div", { class: "team-wrap" }, h("div", { class: "team" }, slotEls), h("div", { class: "team-side" }, powerBox, go_))),
      side),
    onescreenDrawer(strip, "挑隊員")); // 翊文 11-09：挑隊員要在隊伍正下方：抽屜就在展示台下面
};
export function cellarRoom(root) {
  const run = P.cellar.run, f = cellarFloor(run.floor), room = currentRoom(P);
  if (room && room.choices.some(c => c.check.type === "san") && UI.eerieRoom !== room.id) { UI.eerieRoom = room.id; later(() => snd("eerie"), 400); }
  if (!f || !room) { leaveCellar(P); go("cellar", {}, { action: false }); return; }
  const team = teamItems(P, run.team);
  const tp = teamPower(P, team, room);
  const dots = run.extra ? null : h("div", { class: "room-dots" }, f.rooms.map((r, i) => h("i", { class: i < run.idx ? "done" : i === run.idx ? "now" : "" }))); // run.extra：每週劇情多出來的一間、試煉房間（只走這一間）
  const leave = btn("回到地面", () => { leaveCellar(P); persist(); go("cellar", {}, { action: false }); }, "ghost");
  const teamBar = h("div", { class: "team-bar" }, team.map(it => h("div", { class: "tb-member" + (P.injured[it.key] ? " hurt" : "") },
    h("span", { class: "si-art", html: itemHTML(it) }), h("span", { class: "tb-n" }, `強度 ${memberPower(it, room)}`))),
    h("div", { class: "tb-total" }, h("span", { class: "poss-l" }, "這個房間的隊伍強度"), h("b", { class: "poss-n" }, String(tp.total)), tp.notes.length ? h("span", { class: "poss-f" }, tp.notes.join("・")) : null));
  const chips = h("div", { class: "nc-tags" }, room.mood ? h("span", { class: "tag" }, `房間的心情：${room.mood}`) : null, room.color ? h("span", { class: "tag" }, `房間的顏色：${room.color}`) : null);
  const result = h("div", { class: "room-result", "aria-live": "polite" });
  const desc = c => c.type === "power" ? `強度 ${tp.total}＋擲 1～10，要 ≥ ${c.target}` : c.type === "skill" ? `${c.skill} ${clampN(skillOf(P, c.skill) + (c.mod || 0) + (team.some(t => t.pick.帽子 === "紳士帽") ? 10 : 0), 1, 99)}%` : c.type === "san" ? `理智 ${sanShort(c.spec)}` : "安全";
  const choices = h("div", { class: "choices" }, room.choices.map((c, i) => btn([h("span", null, c.label), h("small", null, desc(c.check))], () => resolveFlow(i, result, choices), c.check.type === "none" ? "ghost" : "")));
  const stage = cellarStage(team, room, run.floor);
  // 游標移到選項上（或用鍵盤選到）：舞台先預告這個選項會怎麼做
  $$(".btn", choices).forEach((b, i) => {
    const c = room.choices[i];
    const on = () => { if (!stage.classList.contains("acting")) stageProp(stage, c.check, desc(c.check)); };
    b.addEventListener("pointerenter", on); b.addEventListener("focus", on);
    b.addEventListener("pointerleave", () => { if (!stage.classList.contains("acting")) stageClear(stage); });
  });
  const card = h("div", { class: "note-card room-card" + (room.boss ? " boss" : "") }, h("i", { class: "pin" }), chips,
    h("h2", { class: "room-title" }, ptNode(room.title)), h("div", { class: "nc-text" }, room.lines.map(l => h("p", null, ptNode(l)))),
    h("p", { class: "cs-hint" }, icon("sparkle"), " 游標移到選項上，看隊伍會怎麼做；按下去牠們就會動起來"), choices, result);
  root.append(roomHead(`B${run.floor}　${f.name}`, run.extra ? run.extra.intro || "這週多出來的地方。" : run.idx === 0 && f.intro ? f.intro : null, dots, leave),
    stage,
    teamBar, card,
    ADDONS.cellarMeet ? ADDONS.cellarMeet(room, run.floor) : null, // 遇到館友在地下工作的參觀者（決定 0064，ui_work.js）
    ADDONS.cellarLost ? ADDONS.cellarLost(room, run.floor) : null, // 招領單：別的館友以前理智歸零的參觀者（翊文 11-13，ui_lost.js）
    ADDONS.cellarTraces ? ADDONS.cellarTraces(room, run.floor, stage) : null); // 館友留下的痕跡（ui_trace.js）
}
// 誰讓理智多扣、少扣：「怕黑 +1、探險燈 −1」（只有一個就寫名字）
const darkWhy = () => { const hits = traitHits(P, "cellarSan"); return hits.length === 1 ? hits[0].name : hits.map(traitTag).join("、"); };
export async function resolveFlow(i, result, choices) {
  if (UI.busy) return;
  UI.busy = true;
  $$("button", choices).forEach(b => { b.disabled = true; });
  try {
    const stage = $(".cellar-stage"), team = teamItems(P, P.cellar.run.team);
    const res = cellarResolve(P, i);
    if (!res) return;
    if (stage) { stageProp(stage, res.choice.check, ""); await stageAct(stage, res.choice.check); }
    let sanSuccess = null;
    if (res.type === "power") {
      snd("drum");
      await FX.rollOverlay({ title: "強度檢定", sub: `隊伍強度 ${res.power}，再加擲出的 1～10，要 ≥ ${res.target}`, spec: "1D10", result: res.roll,
        outcome: { text: `${res.power} ＋ ${res.roll.total} ＝ ${res.total}　${res.success ? "過了" : "不夠"}${res.rerolled ? "（皇冠號令重擲過）" : ""}`, tone: res.success ? "good" : "bad" } });
    } else if (res.type === "skill") {
      await FX.rollOverlay({ title: `${res.skill}檢定`, sub: `擲出 ≤ ${res.target} 就成功${res.rerolled ? "（皇冠號令重擲過）" : ""}`, spec: "d100", result: res.roll,
        outcome: { text: res.success ? "成功" : "失敗", tone: res.success ? "good" : "bad" } });
    } else if (res.type === "san") {
      // 探險燈（決定 0032）：理智檢定要扣的先少扣
      const s = await sanFlow(res.sanSpec, "cellar:" + res.room.id, res.room.title, { anchor: result, noInvoluntary: true, adjust: l => { const d = cellarDarkLoss(P, l); if (d < 0) note(`${darkWhy()}：理智少扣 ${-d} 點`, "good"); return l + Math.min(0, d); } });
      if (P.dark) return;
      sanSuccess = s ? s.r.success : true;
      // 小缺點「怕黑」（11-08）：理智檢定扣了理智，再多扣（另外扣，數字才對得上）
      const dark = s ? Math.max(0, cellarDarkLoss(P, s.loss)) : 0;
      if (dark) { note(`${darkWhy()}：在地下多扣 ${dark} 點理智`, "bad"); await lossFlow(dark, "cellar:" + res.room.id, { anchor: result }); if (P.dark) return; }
    }
    res.notes.filter(n => /皇冠|紳士帽/.test(n)).forEach(n => note(n, "good"));
    const fx = cellarApply(P, res, sanSuccess);
    if (stage) stageOutcome(stage, res, fx, team);
    if (fx.blocked.length) snd("block");
    if (fx.injured) later(() => snd("hurt"), fx.blocked.length ? 300 : 0);
    const lines = [fx.text || (fx.success ? "你們過去了。" : "不太順利。")];
    if (fx.insp) lines.push(`+${fx.insp} 靈感`);
    if (fx.sanGain) lines.push(`理智 +${fx.sanGain}`);
    if (fx.myth) lines.push(`佩佩神話 +${fx.myth}`);
    fx.blocked.forEach(b => lines.push(b));
    if (fx.dark) lines.push(`${darkWhy()}：理智${fx.dark > 0 ? "多" : "少"}扣 ${Math.abs(fx.dark)} 點`);
    if (fx.trial) { lines.push(`試煉過了：${fx.trial.skill} ${fx.trial.before} → ${fx.trial.after}${fx.trial.boost ? `（限時活動 ×${fx.trial.boost.mult}）` : ""}`); snd("unlock"); } // 試煉房間的技能成長（決定 0032）
    if (fx.injured) lines.push(`「${itemTitle(fx.injured)}」受傷了（${fx.injureDays || injureDaysOf(P)} 天後會好；館長室的修復台可以治）`);
    result.replaceChildren(placard(lines, { cls: fx.success ? "ok" : "bad" }));
    if (fx.insp) { FX.floatText(result, `+${fx.insp} 靈感`, "good"); snd("coin"); }
    if (fx.sanLoss) { await lossFlow(fx.sanLoss, "cellar:" + res.room.id, { anchor: result }); if (P.dark) return; }
    await showEvents(fx.events);
    actionTick(); updateStatus(); persist();
    if (ADDONS.cellarResolved) ADDONS.cellarResolved(res.room, result); // 走完這一間：可以留牌子（ui_trace.js）
    if (ADDONS.cellarFind && !res.room.story && !res.room.trial) ADDONS.cellarFind(res.room.id); // 撿籌碼（決定 0047）：不等伺服器，失敗就算了
    result.append(h("div", { class: "rv-btns" }, btn("繼續", () => advanceFlow(result), "primary")));
    result.querySelector(".btn.primary").focus({ preventScroll: true });
  } finally {
    UI.busy = false;
    if (P && P.dark && ADDONS.cellarZero) { const zr = P.cellar.run && currentRoom(P); if (zr) ADDONS.cellarZero(zr, i); } // 理智在這一間歸零：留一個影子（ui_trace.js）
  }
}
export async function advanceFlow(result) {
  const passKeys = P.cellar.run ? P.cellar.run.team : null; // 走完一層要留幽影用（cellarAdvance 可能會把 run 收掉）
  const a = cellarAdvance(P);
  if (a && a.floorDone && ADDONS.cellarFloorDone) ADDONS.cellarFloorDone(a.floor, passKeys);
  persist();
  if (!a) { go("cellar", {}, { action: false }); return; }
  if (!a.floorDone) { rerender(); window.scrollTo(0, 0); return; }
  const f = cellarFloor(a.floor);
  const st = $(".cellar-stage"); if (st) st.classList.add("descend");
  snd("fanfare");
  const r = a.reward || {};
  const lines = [`B${a.floor} 走完了`, f.clear || ""];
  if (a.first && r.insp) lines.push(`+${r.insp} 靈感`);
  result.replaceChildren(placard(lines, { gold: true }));
  updateStatus();
  await showEvents(a.events);
  if (a.ending) { await wait(1500); go("ending", { id: a.ending }, { action: false }); return; }
  result.append(h("div", { class: "rv-btns" },
    a.next ? btn([icon("stairs"), ` 繼續往下到 B${a.next}`], () => { rerender(); window.scrollTo(0, 0); }, "primary") : null,
    btn("回到地面", () => { leaveCellar(P); persist(); go("cellar", {}, { action: false }); }, a.next ? "ghost" : "primary")));
}

// ---------- 展廳的頁籤、每週特展 ----------
export function hallTabs(active) {
  return h("div", { class: "seg hall-tabs big-tabs" },
    h("button", { type: "button", class: "seg-btn" + (active === "main" ? " on" : ""), onClick: () => go("hall", {}, { action: false }) }, icon("hall"), h("span", null, "常設展")),
    h("button", { type: "button", class: "seg-btn" + (active === "week" ? " on" : ""), onClick: () => go("hall", { week: true }, { action: false }) }, icon("star"), h("span", null, "本週特展")));
}
export function weeklyHall(root, params) {
  const W = weeklyState(P);
  const T = (typeof WEEKLY_TEXT !== "undefined" && WEEKLY_TEXT[W.theme]) || { name: W.theme, rule: "" };
  const items = W.slots.map(s => hallItem(P, s));
  const sc = scoreItems(items);
  // 跟館友比比看（11-09，翊文：「這些分享不需要用分享碼了，直接可以選擇館友才對」）：選館友，唯讀看他這週的特展分數和展台。登入了才有
  const vsBox = h("div", { class: "share-box", hidden: true });
  const tools = UI.net && PANELS.pickFriend && ADDONS.weeklyVs ? [btn([icon("users"), " 跟館友比比看"], () =>
    PANELS.pickFriend({ title: "跟館友比比看", hint: "選一位館友，看他這週的特展分數和展台，跟你比。不會通知他。", onPick: p => ADDONS.weeklyVs(p, W, vsBox) }), "ghost")] : [];
  const room = h("div", { class: "hall-room" }, W.slots.map((s, i) => {
    const it = hallItem(P, s);
    const el = h("div", { class: "ped-slot" + (it ? " full" : "") },
      h("div", { class: "ped-art", html: it ? itemHTML(it) : "" }), h("div", { class: "ped-block" }),
      h("div", { class: "ped-label" + (it ? "" : " empty") }, it ? itemTitle(it) : "空展台"),
      it ? h("button", { type: "button", class: "icon-btn ped-x", "aria-label": "拿下來", onClick: e => { e.stopPropagation(); W.slots[i] = null; persist(); rerender(); } }, icon("close")) : null);
    placeTarget(el, ["pepe", "pillow"], item => {
      const r = placeWeekly(P, i, item);
      if (!r.ok) { snd("error"); note(r.reason, "bad"); return false; }
      snd("submit"); if (r.isBest) note(`本週新紀錄：${r.best} 分`, "good");
      persist(); later(rerender, 250); return true;
    });
    return el;
  }));
  const strip = collectionStrip({ tabs: ["pepe", "failed", "pillow", "repaired"], title: "你的收藏", hint: `只能放：${T.rule}`, drag: true });
  root.append(roomHead("本週特展", `${T.name}：${T.rule}`, ...tools), vsBox, hallTabs("week"),
    h("div", { class: "hall-wall themed" }, h("div", { class: "theme-name" }, h("h2", null, T.name), h("p", null, `現在 ${sc.score} 分　本週最高 ${W.best} 分`))),
    ...(ADDONS.weeklyShow ? [ADDONS.weeklyShow(W)] : []), // 到金拿這週的限定配件（決定 0035，ui_themeshow.js）
    room, strip);
}

// ---------- 地下收藏庫的舞台（翊文 11-08：選項要有互動） ----------
export const CS_ROW = { 坐著: 1, 躺平: 2 }; // 0 前排、1 中排、2 後排
export const CS_SKILL_IC = { 偵查: "magnifier", 鑑賞: "eye", 神秘學: "book", 幸運: "dice", 手工藝: "hammer", 說服: "handshake" };
export const CS_CRATE = '<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="10" width="48" height="44" rx="3" fill="#9C7A3E" stroke="#3B2719" stroke-width="3"/><path d="M6 25H54M6 40H54M19 10V54M41 10V54" stroke="#3B2719" stroke-width="2.4"/><path d="M9 13L51 51" stroke="#5E4420" stroke-width="2"/></svg>';
export const CS_EYE = '<svg viewBox="-12 -9 24 18" xmlns="http://www.w3.org/2000/svg"><path d="M-10 0Q0-8 10 0Q0 8-10 0Z" fill="#EDE7F6" stroke="#2A2238" stroke-width=".8"/><ellipse class="cs-pupil" rx="2.4" ry="5.5" fill="#2A2238"/></svg>';
export function cellarStage(team, room, floor) {
  const stage = h("div", { class: "cellar-stage" });
  stage.append(h("div", { class: "cellar-scene", html: ART.cellarScene ? ART.cellarScene(floor) : "" }));
  stage.append(h("div", { class: "cs-prop" }, h("div", { class: "cs-p-art" }), h("span", { class: "cs-p-label" })));
  const crew = h("div", { class: "cs-team" });
  team.forEach((it, i) => {
    const pw = memberPower(it, room);
    const beat = !!room.mood && MOOD_BEATS[it.pick.心情] === room.mood, beaten = !!room.mood && MOOD_BEATS[room.mood] === it.pick.心情;
    crew.append(h("div", { class: "cs-frog" + (beat ? " beat" : "") + (beaten ? " beaten" : "") + (P.injured[it.key] ? " hurt" : ""), style: { "--i": i, "--row": CS_ROW[it.pick.姿勢] || 0 }, dataset: { key: it.key } },
      h("span", { class: "cs-tag" }, `強度 ${pw}${beat ? "・剋到 ×2" : beaten ? "・被剋" : ""}`),
      h("div", { class: "cs-art", html: itemHTML(it) }),
      h("div", { class: "cs-pops" })));
  });
  stage.append(crew, h("div", { class: "cs-float" }));
  return stage;
}
// 預告：這個選項要做什麼
export function stageProp(stage, check, label) {
  const prop = stage.querySelector(".cs-prop"), t = check.type;
  prop.className = "cs-prop on t-" + t;
  prop.querySelector(".cs-p-art").innerHTML = t === "power" ? CS_CRATE : t === "skill" ? ART.icon(CS_SKILL_IC[check.skill] || "sparkle") : t === "san" ? CS_EYE : ART.icon("arrowRight");
  if (label != null) prop.querySelector(".cs-p-label").textContent = label;
  stage.dataset.preview = t;
}
export function stageClear(stage) { stage.querySelector(".cs-prop").className = "cs-prop"; delete stage.dataset.preview; }
// 按下去：隊伍先動作，再擲骰
export async function stageAct(stage, check) {
  stage.classList.add("acting", "act-" + check.type);
  if (check.type === "power") snd("whoosh");
  else if (check.type === "san") snd("eerie");
  else if (check.type === "none") snd("steps");
  await wait(check.type === "none" ? 900 : 750);
}
export function stagePop(f, text, tone) { if (f) f.querySelector(".cs-pops").append(h("span", { class: "cs-pop " + (tone || "") }, text)); }
// 擲完骰：演出結果
export function stageOutcome(stage, res, fx, team) {
  ["act-power", "act-skill", "act-san", "act-none"].forEach(c => stage.classList.remove(c));
  stage.classList.remove("acting");
  stage.classList.add(fx.success ? "won" : "lost", "t-" + res.type);
  const frogs = [...stage.querySelectorAll(".cs-frog")];
  const of = it => it && frogs.find(f => f.dataset.key === it.key);
  frogs.forEach(f => { f.classList.remove("cheer", "recoil"); f.getBoundingClientRect(); f.classList.add(fx.success ? "cheer" : "recoil"); });
  if (fx.injured) { const f = of(fx.injured); if (f) { f.classList.add("hurt", "fall"); stagePop(f, "受傷了", "bad"); } }
  fx.blocked.forEach(b => {
    const who = /棒球帽/.test(b) ? team.find(t => t.pick.帽子 === "棒球帽") : /斯拉夫蹲/.test(b) ? team.find(t => t.pick.姿勢 === "斯拉夫蹲") : null;
    const f = of(who); if (f) { f.classList.add("shield"); stagePop(f, /棒球帽/.test(b) ? "擋下來了" : "穩住了", "good"); }
  });
  if (res.rerolled) { const f = of(team.find(t => t.pick.帽子 === "皇冠")); if (f) { f.classList.add("crowned"); stagePop(f, "皇冠號令：重擲", "good"); } }
  if (fx.rested) team.filter(t => t.pick.姿勢 === "躺平" || t.pick.帽子 === "毛帽").forEach(t => stagePop(of(t), "回理智", "good"));
  const fl = stage.querySelector(".cs-float");
  const say = (text, tone) => fl.append(h("span", { class: "cs-say " + (tone || "") }, text));
  if (fx.insp) say(`+${fx.insp} 靈感`, "good");
  if (fx.sanGain) say(`理智 +${fx.sanGain}`, "good");
  if (fx.sanLoss) { say(`理智 −${fx.sanLoss}`, "bad"); stage.classList.add("hit"); }
  if (res.type === "none") say("悄悄地過去了");
}

// ---------- 挑隊員：每隻底下的小卡（強度、心情相剋、能力、狀態） ----------
export const HAT_AB = { 棒球帽: "擋壹次", 皇冠: "重擲壹次", 巫師帽: "全隊 +2", 觸手帽: "全隊 +5・扣理智", 紳士帽: "技能 +10", 毛帽: "回理智" };
export const POSE_AB = { 比讚: "全隊每隻 +1", 躺平: "回理智", 斯拉夫蹲: "不會被推倒", 倒立: "強度 +1" };
// 強度怎麼來的：「稀有 2＋完美 1＋倒立 1」（照 memberPower 的算法，不算房間）
export function powerWhy(item) {
  const p = item.pick, parts = [`${String(p[ROLLED]).replace("傳說級稀有", "傳說級")} ${CELLAR_POWER[p[ROLLED]] ?? 1}`];
  if (item.perfect) parts.push(`完美 ${CELLAR_POWER.perfect}`);
  if (p.姿勢 === "倒立") parts.push("倒立 1");
  if (COLOR_POWER[p.顏色]) parts.push(`${p.顏色} ${COLOR_POWER[p.顏色]}`);
  return parts.join("＋");
}
// 壹隻佩佩在地下的資料（展示台上的名牌用）：強度、心情剋誰、顏色、帽子和姿勢的效果
export function memberFacts(item) {
  const p = item.pick, beats = MOOD_BEATS[p.心情];
  const buffs = [HAT_AB[p.帽子] ? [p.帽子, HAT_AB[p.帽子]] : null, POSE_AB[p.姿勢] ? [p.姿勢, POSE_AB[p.姿勢]] : null].filter(Boolean);
  return h("span", { class: "cellar-facts" },
    h("span", { class: "cellar-fact pw" }, h("i", null, "強度"), h("b", null, String(memberPower(item, null))), h("small", null, `＝${powerWhy(item)}`)),
    h("span", { class: "cellar-fact" }, h("i", null, "心情"), p.心情 === "俄國8+9" ? "俄國8+9・不被剋" : beats ? `${p.心情}・剋${beats}` : p.心情, p.顏色 ? h("span", { class: "cellar-color" }, `・${p.顏色}`) : null),
    buffs.length ? h("span", { class: "cellar-fact-buffs" }, buffs.map(([k, v]) => h("span", { class: "cellar-buff", title: `${k}：${v}` }, `${k}：${v}`)))
      : h("span", { class: "cellar-fact none" }, h("i", null, "加成"), "沒有（帽子、姿勢沒有效果）"));
}
export function teamMeta(item, team) {
  const p = item.pick, hurt = P.injured[item.key], inTeam = team.includes(item.key);
  const beats = MOOD_BEATS[p.心情];
  const abil = [];
  if (HAT_AB[p.帽子]) abil.push([p.帽子, HAT_AB[p.帽子]]);
  if (POSE_AB[p.姿勢]) abil.push([p.姿勢, POSE_AB[p.姿勢]]);
  return h("span", { class: "si-meta" },
    h("span", { class: "si-pw" }, `強度 ${memberPower(item, null)}`, item.perfect ? h("small", null, "（完美 +1）") : null),
    h("span", { class: "si-mood" }, p.心情 === "俄國8+9" ? "俄國8+9・不被剋" : beats ? `${p.心情}・剋${beats}` : p.心情),
    abil.map(([k, v]) => h("span", { class: "si-ab", title: `${k}：${v}` }, `${k}：${v}`)),
    hurt ? h("span", { class: "si-st bad" }, `受傷・${String(hurt).slice(5)} 會好`) : inTeam ? h("span", { class: "si-st good" }, "隊伍中") : null);
}

// ---------- 地下收藏庫的隊伍規則（翊文 11-08：要像設定頁的「怎麼玩」壹樣，粗體和顏色標重點） ----------
// E：金色重點；B：紅色（不利、扣理智）；G：綠色（有利、回理智）
export function teamRules() {
  const E = t => h("b", { class: "em" }, t), B = t => h("b", { class: "em bad" }, t), G = t => h("b", { class: "em good" }, t);
  const R = (ic, title, ...parts) => h("li", null, h("span", { class: "rl-t" }, icon(ic), " ", title), h("p", null, ...parts));
  return h("div", { class: "legend placard" }, h("div", { class: "pl-title" }, "隊伍規則"),
    h("ul", { class: "rl-list" },
      R("sparkle", "強度", "普通 ", E("1"), "、稀有 ", E("2"), "、超稀有 ", E("3"), "、傳說級 ", E("5"), "、不可名狀 ", E("6"), "，完美作品 ", E("+1"), "。"),
      R("heart", "心情相剋", "開心剋傷心、傷心剋生氣、生氣剋開心：", G("剋到 ×2"), "，", B("被剋 −1"), "。俄國8+9 ", G("不被剋"), "。顏色跟房間壹樣 ", G("+1"), "。"),
      R("hat", "帽子", "棒球帽", G("擋壹次"), "、皇冠", G("重擲壹次"), "、巫師帽 ", G("+2"), "、觸手帽 ", G("+5"), "（", B("扣理智"), "）、紳士帽", G("技能 +10"), "、毛帽", G("回理智"), "。"),
      R("hand", "姿勢", "比讚", G("全隊每隻 +1"), "、躺平", G("回理智"), "、斯拉夫蹲", G("不會被推倒"), "（擋壹次受傷）、倒立 ", G("+1"), "。毛帽、躺平：每壹層第壹次走時，各回 ", G("1D3 理智"), "。")));
}

// 融合室的調色盤（翊文 11-10：「現有的幾個融合起來有新顏色，可以給提示，像調色盤一樣解新顏色」）
// 調出來過：寫出配方和色塊；兩種材料手上都有：給壹句提示（不說是哪兩種）；還缺材料：只說還缺
export function palettePane() {
  const dot = c => h("i", { class: "pal-dot", style: `background:${(ART.COLORS[c] || ["#888"])[0]}`, "aria-hidden": "true" });
  const cells = paletteView(P).map(v => {
    const t = (typeof RECIPE_TEXT !== "undefined" && RECIPE_TEXT[v.id]) || { name: v.id, hint: "" };
    if (v.got) return h("li", { class: "pal-cell got" }, h("span", { class: "pal-mix" }, dot(v.a), "＋", dot(v.b), "＝", dot(v.color)), h("b", null, `${v.a}＋${v.b}＝${v.color}`), h("small", null, `調出來的顏色，在地下強度 +${COLOR_POWER[v.color] || 0}`));
    if (v.ready) return h("li", { class: "pal-cell ready" }, h("span", { class: "pal-mix" }, h("i", { class: "pal-dot q", "aria-hidden": "true" }, "？")), h("b", null, "你手上的顏色調得出來"), h("small", null, t.hint));
    return h("li", { class: "pal-cell" }, h("span", { class: "pal-mix" }, h("i", { class: "pal-dot q", "aria-hidden": "true" }, "？")), h("b", null, "？？？"), h("small", null, "還缺壹種顏色。先調出別的。"));
  });
  const n = cells.length, got = paletteView(P).filter(v => v.got).length;
  return h("section", { class: "palette" }, h("h3", null, `調色盤（${got}／${n}）`),
    h("p", { class: "sub" }, `兩隻佩佩的顏色對了，小孩就是新的顏色；調出來以後手作坊也能用。調色的那壹次血統多 ${NUM.mixBlood} 點。`),
    h("ul", { class: "pal-list" }, cells));
}

// 融合室：今天還能融合幾次（翊文 11-08：每天的上限要寫出來）
export function fusionPill() {
  if (isFree(P)) return null;
  const left = fusionLeft(P), lim = fusionLimit(P);
  const sub = `壹天 ${lim} 次。` + (hasUp(P, "forge2") ? "" : "館長室買「第二座融合爐」，每天多 3 次。");
  return limitPill(left ? `今天還能融合 ${left} 次` : "今天的融合次數用完了，明天再來", left, sub);
}
