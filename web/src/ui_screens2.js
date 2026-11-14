// ================================================================
//  畫面 6、8–13：抱枕、委託、圖鑑、展廳、圖庫、設定、結局（還有小遊戲）
// ================================================================

// ---------- 6 抱枕工作台（系統 I：印你的佩佩） ----------
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { BADGES, GEN_TEXT, NUM, PILLOW_PARTS, RECIPES } from "../../shared/config.js";
import { ENDINGS, HALL_THEME_TEXT, HUG_TEXT } from "../../shared/content.js";
import { CLIENT_LINES, ENDING_CELLAR, LEGACY_TEXT, RECIPE_TEXT } from "../../shared/content3.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { BASE_TOTAL, CATS, CORE_CATS, CORE_TOTAL, DECO_CATS, FAILED, PILLOW_CATS, PILLOW_TOTAL, ROLLED, SAVE_KEY, asList, autoDeliverables, baseOpts, canMakePillow, codexCount, codexPick, coreKey, dailyCommissions, decoOpen, deliver, deliverAll, describePepe, describePillow, exportCode, fromKey, gainSan, gameDayNo, hallItem, hallScore, hug, importCode, isBasePick, isFree, isSpecialOpt, isUnlocked, makePillow, miniReward, newProfile, newSave, num, pad, parsePillowKey, partOf, pepeKey, pickOne, pillowKeyOf, pillowPossibilities, placeInHall, possibilities, quirkName, regularsView, themeProgress, todayStr, usable } from "../../shared/logic.js";
import { npcNews, npcWebCounters } from "../../shared/npc.js";
import { bookSequels, hasTalent, hasUp, sequelOpen, skillCheck, unlockSequel } from "../../shared/logic3.js";
import { FRESH_KEY, freshUnder, isFresh } from "../../shared/fresh.js";
import { RETIRE_ENDINGS, retireCheck, traitHits, traitTag } from "../../shared/legacy.js";
import { isLimitedMat, stockOf } from "../../shared/signin.js";
import { $, $$, ADDONS, FIT, IMG, P, PANELS, RCOLOR, SAVE, SCREENS, UI, actionTick, closeOnOutside, syncStatusHeight, applyBodyState, applySettings, ask, btn, collectionItems, collectionStrip, costText, diceWords, freshMark, freshTag, frogHTML, go, h, holdFor, icon, inspHave, itemHTML, itemTitle, later, miniLayer, miniPill, motionOff, note, noteCured, pepePlacard, persist, placard, placeTarget, ptNode, quirkHereBox, quirkLayer, rdot, rerender, sanFlow, saveFit, saveImages, setP, setSave, showEvents, snd, trackGaze, updateStatus, useProfile, wait } from "./ui_core.js";
import { afterEnter, roomHead, onescreenDrawer } from "./ui_screens1.js";
import { orientSkipped, setOrientSkip } from "./ui_orient.js";
import { hallTabs, legacyFill, retireFlow, visitorLabel, weeklyHall } from "./ui_screens3.js";
import { enliven } from "./ui_curio.js";

SCREENS.pillow = (root, params = {}) => {
  const pick = P.plPick;
  if (params.mat) { pick.材質 = params.mat; params.mat = null; } // 簽到拿的材料「馬上使用」：直接選好（11-09，決定 0030）
  const owned = collectionItems("pepe").concat(collectionItems("failed"));
  if (!P.plPrint && owned.length) P.plPrint = (owned[0].kind === "failed" ? "f:" : "p:") + owned[0].key;
  const art = h("div", { class: "pillow-art" });
  const stage = h("div", { class: "pl-stage", tabindex: "0", role: "button", "aria-label": "抱枕：按住抱一下" }, art, h("div", { class: "pl-shadow" }));
  const info = h("aside", { class: "pl-info" });
  const rows = h("div", { class: "pl-rows" });
  const keyNow = () => pillowKeyOf(pick, P.plPrint);
  // 翊文 11-08：「抱枕好像只有剛做好的可以抱」→ 收藏列多「抱枕」頁籤：點壹個做過的抱枕，展台就換成它，按住就能抱
  const loadPillow = key => { const pp = parsePillowKey(key); Object.entries(pp.pick).forEach(([c, v]) => { pick[c] = v; }); P.plPrint = pp.ref; };
  const huggedToday = key => !!P.day.hugs[key];
  const strip = collectionStrip({ tabs: ["pepe", "failed", "pillow"], title: "印哪一隻", hint: "左右滑，點一隻就換圖",
    titles: { pillow: "你做過的抱枕" }, hints: { pillow: "點壹個，展台就換成它，按住就能抱（每個每天抱壹次）" },
    onPick: item => {
      if (item.kind === "pillow") { loadPillow(item.key); snd("flip"); drawAll(); strip.refresh(); stage.scrollIntoView({ block: "center", behavior: motionOff() ? "auto" : "smooth" }); return; }
      P.plPrint = (item.kind === "failed" ? "f:" : "p:") + item.key; snd("flip"); drawAll(); strip.refresh();
    },
    selected: item => item.kind === "pillow" ? item.key === keyNow() : P.plPrint === (item.kind === "failed" ? "f:" : "p:") + item.key,
    badge: item => item.kind === "pillow" ? h("span", { class: "si-hug" + (huggedToday(item.key) ? " done" : "") }, huggedToday(item.key) ? "今天抱過" : "可以抱") : null });
  root.append(roomHead(GEN_TEXT.pillow, "抱枕正面印的是你做過的佩佩。換材質，印刷效果當場變；換尺寸，印的範圍當場變。"),
    h("div", { class: "pl-top" }, stage, info), rows, strip);
  const drawArt = () => { art.innerHTML = itemHTML({ kind: "pillow", key: keyNow() }); };
  const drawInfo = () => {
    const key = keyNow();
    const d = describePillow(key);
    const have = !!P.pillows[key];
    const n = Object.keys(P.pepes).length + Object.keys(P.failed).length;
    const can = canMakePillow(P, pick, P.plPrint);
    const hugged = P.day.hugs[key];
    stage.classList.toggle("huggable", have && !hugged); // 可以抱的時候，抱枕輕輕發光
    info.replaceChildren(
      placard([d.title, d.extra, `印：${d.printed}`, h("div", { class: "pl-count" + (have ? "" : " new") }, have ? `已收藏（做過 ${P.pillows[key]} 個）` : "新的！")]),
      h("div", { class: "poss" }, h("span", { class: "poss-l" }, "抱枕的可能性"), h("b", { class: "poss-n" }, num(pillowPossibilities(P))),
        h("div", { class: "poss-f" }, `${PILLOW_TOTAL} 種抱枕 × 你收藏的 ${n} 隻`)),
      h("div", { class: "ws-make" }, btn(isFree(P) ? "做！" : costText("做", NUM.costPillow), () => make(), "primary big"), isFree(P) ? null : inspHave(NUM.costPillow), !can.ok ? h("p", { class: "warn-line" }, can.reason) : null),
      hugHint(have, hugged, key),
      (() => { // 還有幾個抱枕今天還沒抱（不算展台上這個）
        const left = Object.keys(P.pillows).filter(k => k !== key && !huggedToday(k)).length;
        return left ? h("p", { class: "sub hug-more" }, `還有 ${left} 個抱枕今天還沒抱：在下面「抱枕」頁點壹個就能抱。`) : null;
      })(),
      quirkHereBox("hug")); // 治法是「抱壹次抱枕」的怪癖（11-09，決定 0027；原本是連續 3 天抱抱枕）
  };
  const drawRows = () => {
    rows.replaceChildren(...PILLOW_PARTS.map(part => h("div", { class: "pl-row" },
      h("span", { class: "pl-row-l" }, part.name),
      h("div", { class: "seg big" }, part.options.map(o => h("button", { type: "button", class: "seg-btn" + (pick[part.name] === o.name ? " on" : "") + (o.limited ? " lim" + (stockOf(P, o.name) > 0 ? "" : " lim-empty") : ""),
        title: o.limited ? "簽到限定的材料：每週全簽到、節日簽到拿得到，做壹個用掉壹份" : null,
        onClick: () => { pick[part.name] = o.name; snd("click"); drawAll(); } }, o.name, o.limited && isLimitedMat(o.name) && !isFree(P) ? h("small", { class: "lim-n" }, `剩 ${stockOf(P, o.name)}`) : null))), // 星光絨（11-09）
      part.name === "填充" ? btn([icon("pillow"), " 親手塞"], async () => { const f = await stuffGame(); if (f) { pick.填充 = f; drawAll(); } }, "ghost", { title: "按住塞棉花，放開的時機決定軟硬" }) : null)));
  };
  const drawAll = () => { drawArt(); drawInfo(); drawRows(); persist(); };
  function make() {
    const r = makePillow(P, pick, P.plPrint);
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    if (r.free) note("手巧：這個不花靈感", "good"); // 小優點「手巧」（11-08）
    else if (hasTalent(P, "手工藝")) {
      const sc = skillCheck(P, "手工藝");
      if (sc.success) { P.insp += NUM.costPillow; note(`手工藝 ${sc.roll.total} ≤ ${sc.target}：手很巧，這個不花靈感`, "good"); }
    }
    snd(r.isNew ? "unlock" : "click");
    stage.classList.remove("pop"); void stage.offsetWidth; stage.classList.add("pop");
    note(r.isNew ? `新收藏！${describePillow(r.key).title}` : "又做了一個一樣的。", r.isNew ? "good" : "neutral");
    actionTick(); drawAll(); strip.refresh(); showEvents(r.events);
  }
  // 抱一下：按住會壓扁，放開彈回來
  let holdT = null, hugged = false;
  const press = () => {
    stage.classList.add("squash"); hugged = false;
    holdT = setTimeout(() => {
      hugged = true;
      const key = keyNow();
      if (!P.pillows[key]) { note("先做出來才能抱。"); return; }
      const r = hug(P, key);
      if (r.ok && !r.free && hasTalent(P, "手工藝")) { const sc = skillCheck(P, "手工藝"); if (sc.success) { r.gain += gainSan(P, 1); } }
      snd("hug");
      if (r.already) { note("這個今天抱過了。"); return; }
      if (r.gain) FX.floatText(stage, `理智 +${r.gain}`, "good");
      note(pickOne(HUG_TEXT) + (r.free ? "" : `　理智 +${r.gain}（擲 ${diceWords(r.roll.spec)}）`), "good");
      noteCured(r.cured);
      applyBodyState(); updateStatus(); drawInfo(); strip.refresh(); persist(); actionTick();
    }, 450);
  };
  const release = () => { clearTimeout(holdT); if (stage.classList.contains("squash")) { stage.classList.remove("squash"); stage.classList.add("bounce"); later(() => stage.classList.remove("bounce"), 500); } };
  stage.addEventListener("pointerdown", e => { e.preventDefault(); press(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => stage.addEventListener(ev, release));
  stage.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); press(); } });
  stage.addEventListener("keyup", e => { if (e.key === "Enter" || e.key === " ") release(); });
  drawAll();
};

// ---------- 8 委託櫃台 ----------
export const KIND_NAME = { precise: "很精準", vague: "模糊", riddle: "謎語", pillow: "抱枕" };
export const QUEST_STARS = { precise: 3, riddle: 2, pillow: 2, vague: 1 };
SCREENS.commission = root => {
  const list = dailyCommissions(P, P.day.date);
  const board = h("div", { class: "cm-board" });
  const commentsBox = h("div", { class: "cm-comments", hidden: true });
  list.forEach((c, i) => board.append(noteCard(c, i)));
  const strip = collectionStrip({ tabs: ["pepe", "failed", "pillow", "repaired"], title: "你的收藏", hint: "拖到委託單上就是交件；也可以點一件、再點委託單", drag: true });
  const cBtn = btn(`收到的評語 ${P.comments.length}`, () => {
    commentsBox.hidden = !commentsBox.hidden;
    commentsBox.replaceChildren(...(P.comments.length ? P.comments.slice(0, 60).map(c => h("div", { class: "comment" }, h("p", null, `「${c.text}」`), h("p", { class: "sub" }, `— ${c.who}・${c.d}`))) : [h("p", { class: "empty" }, "還沒有評語。交一張委託就會有。")]));
  }, "ghost");
  // 壹個畫面看得完（翊文 11-13：「目前每個廳都要很多訊息，要往上下滑才能看到全部」，docs/介面整合規劃.md 第六步）：
  //   標題壹行｜中間軟木板（委託單）＋右邊側欄（老主顧、怪癖的治法、壹鍵交件、上課和兌換所收起來）｜最下面收藏的抽屜（平常壹排，按拉環拉開才有頁籤和篩選）
  //   零件是翊文生的 assets/ui2/P-1～P-3（切好的在 web/public/ui2/），樣式在 css/onescreen.css
  // 上課和兌換所（決定 0032，ui_shop.js）：標題列右邊兩顆銅牌按鈕（翊文 11-13：「上課，兌換所就不構明顯」），上課的細節點了才跳出來
  const lesson = ADDONS.commission ? ADDONS.commission() : null;
  const lessonLeft = lesson && lesson.querySelector(".day-limit b") ? lesson.querySelector(".day-limit b").textContent.replace(/（.*）/, "").replace(/，.*/, "") : "";
  const learn = [
    lesson ? btn([icon("medal"), h("span", null, "上課", h("small", null, lessonLeft))], () => { const m = miniLayer("委託櫃台的課", "老主顧輪流來教你壹招。"); m.card.classList.add("onescreen-lesson-layer"); m.card.prepend(h("button", { type: "button", class: "mini-x", "aria-label": "關閉", title: "關閉", onClick: () => m.close() }, "×")); m.card.append(lesson, btn("關閉", () => m.close(), "primary")); closeOnOutside(m); }, "onescreen-big") : null,
    PANELS.shop ? btn([icon("medal"), h("span", null, "兌換所", h("small", null, "用週章換東西"))], () => PANELS.shop(), "onescreen-big") : null];
  const side = h("aside", { class: "onescreen-side" }, regularsStrip(list), quirkHereBox("deliver"), autoBar()); // quirkHereBox：治法是「交壹張委託」的怪癖（11-09，決定 0027）
  const drawer = onescreenDrawer(strip);
  root.classList.add("onescreen-room"); // 以前叫 u2r。名字不能跟 html 上的 new-lobby-on 撞，也不要用兩個字母的縮寫（docs/class名單.md）
  root.append(roomHead("委託櫃台", "每天 3 張，隔天換新的。越精準賞越多。", ...learn.filter(Boolean), cBtn), commentsBox, h("div", { class: "onescreen-main" }, board, side), drawer);
  syncStatusHeight(); setTimeout(syncStatusHeight, 300); // 抽屜要停在狀態列上面：狀態列排成兩排時也量對（分頁在背景時 requestAnimationFrame 不會跑，所以直接量）
};

// ---------- 「壹鍵交件」（翊文 11-08：「可以設計一鍵提交委託嗎，就是把符合的都自動符合的都委託都交上去」） ----------
// 挑哪一件、怎麼交都在 shared/logic.js（autoDeliverables、keepRank、deliverAll）。
// 這裡只管：委託單上方的按鈕、先用 ask() 問一次、交完蓋一張總結，最後才用 showEvents() 演出徽章這些事件。
// 不像手動交件每張都蓋章、飄字、跳提示，免得一次跳一大堆。
export function autoBar() {
  const plan = autoDeliverables(P);
  const left = dailyCommissions(P, P.day.date).filter(c => !c.done).length;
  const n = plan.length;
  const b = btn([icon("commission"), n ? `壹鍵交件（${n} 張）` : "壹鍵交件"], () => autoDeliverFlow(b), n ? "primary ad-btn" : "ad-btn", n ? {} : { disabled: true });
  const why = !left ? "今天的委託都完成了，明天再來。"
    : !n ? "沒有符合的收藏"
    : `每張挑收藏裡最普通的那件去交，完美作品留到最後；交了收藏不會少。${n < left ? `另外 ${left - n} 張，收藏裡還沒有符合的。` : ""}`;
  return h("div", { class: "ad-bar" + (n ? "" : " off") }, b, h("p", { class: "ad-why" }, why));
}
export async function autoDeliverFlow(b) {
  const plan = autoDeliverables(P); // 按下去的當下再算一次
  if (!plan.length) { snd("error"); note("沒有符合的收藏", "bad"); rerender(); return; }
  const list = dailyCommissions(P, P.day.date);
  b.disabled = true;
  const asking = ask(`壹鍵交件：這 ${plan.length} 張委託，各交下面這壹件。交了收藏不會少。`, `全部交出去（${plan.length} 張）`, "算了");
  // ask() 只放得下一行字：把「哪張委託 ← 交哪一隻」的清單接在那行字下面（ask 是 ui_core 的，不改它）
  const box = $$(".ask").pop();
  if (box) {
    box.classList.add("ad-ask");
    box.querySelector("p").after(h("ol", { class: "ad-list" }, plan.map(p => {
      const c = list[p.idx];
      return h("li", { class: "ad-row" + (p.item.perfect ? " perfect" : "") },
        h("span", { class: "ad-art", html: itemHTML(p.item) }),
        h("span", { class: "ad-txt" },
          h("span", { class: "ad-job" }, `「${c.text}」`, h("small", null, ` — ${c.client}`)),
          h("span", { class: "ad-give" }, `← 交 ${giveName(p.item)}`)));
    })));
  }
  if (!(await asking)) { b.disabled = false; return; }
  const res = deliverAll(P, plan);
  if (!res.results.length) { snd("error"); note("委託換新了，再按壹次看看。", "bad"); rerender(); return; }
  snd("stamp");
  if (ADDONS.jobChips) ADDONS.jobChips(res.results.map(x => x.c.id), res.results.map(x => x.c.client)); // 交委託拿壹點籌碼（決定 0062）
  applyBodyState(); updateStatus(); persist(); actionTick();
  if (UI.screen === "commission") rerender(); // 委託單蓋上「完成」、按鈕的張數跟著變
  await autoSummary(res);
  showEvents(res.events); // 徽章、老主顧送的選項、新章節……跟手動交件一樣
}
// 清單上「交哪一隻」：名字後面加稀有度（名字常常一樣，看稀有度才知道挑的是普通的）；抱枕加上印的是哪一隻
export function giveName(it) {
  const t = itemTitle(it);
  if (it.kind === "pillow") return `${t}（印：${describePillow(it.key).printed}）`;
  if (it.kind !== "pepe") return t; // 失敗作、修復品：itemTitle 已經寫了
  return `${t}・${it.pick[ROLLED]}${it.perfect ? "・完美作品" : ""}`;
}
// 交完蓋的總結：交了幾張、靈感、理智、說服、治好的怪癖、老主顧的故事，評語挑兩句
export function autoSummary(res) {
  const free = isFree(P);
  const n = res.results.length;
  const skills = res.results.map(x => x.r.skill).filter(Boolean);
  const won = skills.filter(s => s.success).length;
  const lines = res.results.map(x => x.r.line).filter(Boolean);
  const quotes = res.results.filter(x => x.c.kind === "line").concat(res.results.filter(x => x.c.kind !== "line")).slice(0, 2); // 老主顧的評語先
  const stat = (v, label) => h("div", { class: "ad-stat" }, h("b", null, v), h("small", null, label));
  return quirkLayer(`壹鍵交件：交了 ${n} 張`, free ? "自由模式：交件只收評語，不算靈感和理智。" : "每張委託單都蓋上了「完成」。", [
    h("div", { class: "ad-sum" }, stat(n, "張委託"), free ? null : stat(`+${res.reward}`, "靈感"), free ? null : stat(`+${res.gain}`, "理智")),
    skills.length ? h("p", { class: "ad-note" }, `說服 ${skills.length} 次，成功 ${won} 次${won ? "（成功的那幾張賞金多三成）" : ""}`) : null,
    ...res.cured.filter(cu => !cu.step).map(cu => h("p", { class: "ad-note good" }, `治好了「${quirkName(cu.quirk)}」${cu.to !== cu.from ? `：可能性 ${num(cu.from)} → ${num(cu.to)}` : ""}`)), // 狂熱治好時可能性不變，不寫
    ...lines.map(l => h("p", { class: "ad-note line" }, l.finale ? `${l.name}：「${l.finale}」` : `${l.name}的故事 ${l.step}／${l.of}`)),
    quotes.length ? h("div", { class: "ad-quotes" }, quotes.map(x => h("blockquote", null, h("p", null, `「${x.r.comment}」`), h("small", null, `— ${x.c.client}`)))) : null,
    res.skipped ? h("p", { class: "ad-note" }, `有 ${res.skipped} 張沒交成（委託換新了）。`) : null,
  ], "ad-modal", "好");
}
// ---------- 老主顧（翊文 11-13：「追蹤那些來參觀者的劇情應該更明顯」；規劃 docs/銀行特展老主顧招領規劃.md 第三節） ----------
// 委託櫃台上面壹條：三張名片，名字、第幾段（●●○○○）、今天在不在。還沒來過的不寫他是誰。點來過的那位，重讀他說過的話
export function regularsStrip(list) {
  const v = regularsView(P, list);
  if (!v) return null;
  if (!v.open) return h("div", { class: "rg-strip off" }, h("b", { class: "rg-h" }, "老主顧"), h("span", null, `再解開 ${Math.max(1, v.need - v.have)} 個選項，會有老主顧開始來櫃台。他們壹人有壹段故事，壹次說壹段。`));
  return h("div", { class: "rg-strip", role: "group", "aria-label": "老主顧" }, h("b", { class: "rg-h" }, "老主顧"),
    v.list.map(x => {
      const dots = h("span", { class: "rg-dots", "aria-label": `第 ${x.step}／${x.of} 段` }, Array.from({ length: x.of }, (_, k) => h("i", { class: k < x.step ? "on" : "" })));
      const state = x.done ? "故事走完了" : x.today === "here" ? "今天在櫃台" : x.today === "done" ? "今天交過了" : x.met ? "下次再來" : "還沒來過";
      return btn([h("b", { class: "rg-name" }, x.met ? x.name : "？？？"), dots, h("small", null, state)], () => regularsStory(x),
        "rg-card" + (x.today === "here" ? " here" : "") + (x.done ? " done" : ""), x.met ? { title: "重讀他說過的話" } : { disabled: true });
    }));
}
function regularsStory(x) {
  return quirkLayer(x.name, x.done ? `故事走完了。他送你的：${x.gift}` : `走到第 ${x.step}／${x.of} 段`, [
    h("p", { class: "rg-intro" }, `「${x.intro}」`),
    ...x.said.map((s, k) => h("div", { class: "rg-step" }, h("small", null, `第 ${k + 1} 段`), h("p", null, ptNode(s.text)), h("blockquote", null, `「${s.comment}」`))),
    x.finale ? h("p", { class: "rg-finale" }, `「${x.finale}」`) : h("p", { class: "hint" }, x.today === "here" ? "他今天在櫃台等你，下面那張就是。" : "下壹段還沒來。他會輪流來，按順序說。"),
  ], "rg-modal", "好");
}
// 交完老主顧的壹段：跳壹張小卡，他說的話、第幾段、下次再來（走完的那段寫結尾）
function regularDone(line, comment) {
  return quirkLayer(line.name, line.finale ? "故事走完了" : `第 ${line.step}／${line.of} 段`, [
    h("blockquote", { class: "rg-say" }, `「${comment}」`),
    line.finale ? h("p", { class: "rg-finale" }, `「${line.finale}」`) : h("p", { class: "hint" }, "他點點頭，說下次再來。"),
  ], "rg-modal", "好");
}
export function noteCard(c, i) {
  const card = h("div", { class: "note-card" + (c.done ? " done" : "") + (c.kind === "line" ? " line" : ""), "aria-label": `委託：${c.text}` },
    h("i", { class: "pin" }),
    c.kind === "line" ? h("span", { class: "nc-ribbon" }, `老主顧・第 ${c.step + 1} 段`) : null,
    h("div", { class: "nc-tags" }, h("span", { class: "tag" }, c.kind === "line" ? `${c.client} ${c.step + 1}／${CLIENT_LINES[c.line].steps.length}` : KIND_NAME[c.kind] || c.kind), h("span", { class: "stars", title: "難度" }, "★".repeat(QUEST_STARS[c.kind] || 1))), // 「治療委託」的標籤拿掉了（11-09，決定 0027）：治法是交委託的話，哪壹張都算
    c.intro ? h("p", { class: "nc-intro" }, ptNode(c.intro)) : null,
    h("p", { class: "nc-text" }, ptNode(c.text)),
    h("p", { class: "nc-client" }, `— ${c.client}`),
    h("p", { class: "nc-reward" }, isFree(P) ? "交件可以收到評語" : `+${c.reward} 靈感${traitHits(P, "deal").map(t => `（${traitTag(t)}）`).join("")}・理智 +${NUM.commissionSan}${ADDONS.chipsOn && ADDONS.chipsOn() ? "・壹點籌碼" : ""}`), // 嘴甜、不會講價（11-08）
    c.done ? h("div", { class: "nc-stamp", html: ART.stamp("完成") }) : null,
    c.done ? null : h("p", { class: "nc-drop" }, c.kind === "pillow" ? "把抱枕拖到這裡" : "把佩佩拖到這裡"));
  if (!c.done) placeTarget(card, c.kind === "pillow" ? ["pillow"] : ["pepe"], item => {
    const r = deliver(P, i, item);
    if (r.ok && r.skill) note(`說服 ${r.skill.roll.total} ≤ ${r.skill.target}？${r.skill.success ? "成功：賞金多三成" : "沒談成，照原價"}`, r.skill.success ? "good" : "neutral");
    if (r.ok && r.line) later(() => regularDone(r.line, r.comment), 1500); // 等委託單飛走、畫面重畫完才跳
    if (!r.ok) { snd("error"); note(r.reason, "bad"); card.classList.remove("nope"); void card.offsetWidth; card.classList.add("nope"); return false; }
    snd("stamp");
    if (ADDONS.jobChips) ADDONS.jobChips([c.id], [c.client]); // 交委託拿壹點籌碼（決定 0062）
    card.append(h("div", { class: "nc-stamp in", html: ART.stamp("完成") }));
    if (r.reward) FX.floatText(card, `+${r.reward} 靈感`, "good");
    if (r.gain) later(() => FX.floatText(card, `理智 +${r.gain}`, "good"), 350);
    note(`${c.client}：「${r.comment}」`, "good");
    noteCured(r.cured);
    later(() => card.classList.add("fly"), 750);
    later(() => { if (UI.screen === "commission") rerender(); }, 1400);
    applyBodyState(); updateStatus(); persist(); actionTick();
    showEvents(r.events);
    return true;
  });
  return card;
}

// ---------- 9 圖鑑室 ----------
SCREENS.codex = (root, params) => {
  const tab = params.tab || "pepe";
  if (params.beyond) UI.codexFilter = {}; // 從《圖鑑之外》點過來：整面牆都要看得到
  const count = codexCount(P);
  const pct = (count / CORE_TOTAL * 100).toFixed(1);
  // 頁籤：圖示＋數量（翊文 11-08：要更明顯）
  const TAB_IC = { pepe: "frog", failed: "undo", repaired: "hammer", forbidden: "eye", recipes: "scroll", pillow: "pillow", badges: "medal" };
  const tabN = { pepe: Object.keys(P.pepes).length, failed: Object.keys(P.failed).length, repaired: Object.keys(P.repaired || {}).length, recipes: Object.keys(P.recipes || {}).length, pillow: Object.keys(P.pillows).length, badges: Object.keys(P.badges).length };
  const tabFresh = { recipes: freshUnder(P, "codex", FRESH_KEY.recipe("")), badges: freshUnder(P, "codex", FRESH_KEY.badge("")) }; // 這頁有新東西（11-08）
  const tabs = h("div", { class: "seg big-tabs" }, [["pepe", "佩佩"], ["failed", "失敗作"], ["repaired", "修復品"], ["forbidden", "禁忌・突變"], ["recipes", "配方"], ["pillow", "抱枕"], ["badges", "徽章"]].map(([id, n]) =>
    h("button", { type: "button", class: "seg-btn" + (id === tab ? " on" : ""), "aria-pressed": String(id === tab), onClick: () => go("codex", { tab: id }, { action: false }) }, icon(TAB_IC[id]), h("span", null, n), tabN[id] ? h("small", { class: "tab-c" }, String(tabN[id])) : null, tabFresh[id] ? freshTag("tab-fresh") : null)));
  // 壹個畫面看得完（docs/介面整合規劃.md 第六步）：標題壹行｜頁籤壹排｜主區（圖鑑的格子，太多的時候在自己裡面捲）＋側欄（篩選收起來、點壹格的說明牌）
  root.classList.add("onescreen-room", "codex-onescreen");
  root.append(roomHead("圖鑑室", `收藏 ${num(count)}／${num(CORE_TOTAL)}（${pct}%）　徽章 ${Object.keys(P.badges).length}／${BADGES.length}`), tabs);
  // 沒有側欄的頁籤（修復品、配方、禁忌、徽章）：內容放主區；同壹頁再 append 就接在後面
  const stageOnly = (...kids) => {
    let stage = $(".codex-stage", root);
    if (!stage) { root.classList.add("codex-no-side"); stage = h("div", { class: "codex-stage" }); root.append(h("div", { class: "onescreen-main" }, stage)); }
    stage.append(...kids.filter(Boolean));
  };
  const detail = h("div", { class: "cx-detail", "aria-live": "polite" }, h("p", { class: "empty" }, "點一格放大看說明牌。"));
  if (tab === "pepe" || tab === "failed") {
    const failed = tab === "failed";
    const filt = UI.codexFilter || (UI.codexFilter = {});
    const chips = h("div", { class: "chips" }, CATS.filter(c => !(failed && c === ROLLED) && (!partOf(c).deco || decoOpen(P, c))).map(c => h("div", { class: "chip-group" },
      h("span", { class: "chip-l" }, c),
      baseOpts(c).map(v => h("button", { type: "button", class: "chip-btn" + (filt[c] === v ? " on" : ""), onClick: () => { filt[c] = filt[c] === v ? null : v; rerender(); } },
        c === ROLLED ? rdot(v) : c === "顏色" ? h("i", { class: "swatch", style: { background: (ART.COLORS[v] || ["#ccc"])[0] } }) : null, v)))));
    const per = CORE_TOTAL / baseOpts(ROLLED).length;
    const total = failed ? per : CORE_TOTAL;
    // 核心組合 → 收藏裡符合的那幾件（背景、手上拿的東西可以篩）
    const own_ = {};
    Object.keys(failed ? P.failed : P.pepes).forEach(k => {
      const p = fromKey(k); if (!p) return;
      if (DECO_CATS.some(c => filt[c] && p[c] !== filt[c])) return;
      const ck = coreKey(p);
      const e = failed ? { n: P.failed[k] } : P.pepes[k];
      own_[ck] = own_[ck] ? { n: own_[ck].n + (e.n || 1), perfect: own_[ck].perfect || e.perfect } : { n: e.n || 1, perfect: !!e.perfect };
    });
    let shown = 0, own = 0, html = "";
    for (let i = 0; i < total; i++) {
      const pick = codexPick(i);
      if (failed) pick[ROLLED] = FAILED;
      if (CORE_CATS.some(c => filt[c] && !(failed && c === ROLLED) && pick[c] !== filt[c])) continue;
      const e = own_[coreKey(pick)];
      shown++; if (e) own++;
      const col = (ART.COLORS[pick.顏色] || ["#999"])[0];
      html += `<button type="button" class="cell${e ? " own" : ""}${e && e.perfect ? " perfect" : ""}" data-i="${i}" style="--c:${col}" aria-label="${describePepe(pick).title}${e ? "（已收藏）" : ""}">${e && !failed ? `<i class="cdot" style="background:${RCOLOR[pick[ROLLED]]}"></i>` : ""}</button>`;
    }
    // 《圖鑑之外》：讀過之後，最後壹格的下壹格出現（篩選的時候不出現）
    const beyondOn = !failed && !CATS.some(c => filt[c]) && (isFree(P) || P.mythFrom.book3);
    if (beyondOn) html += `<button type="button" class="cell-beyond" aria-label="最後壹格的下壹格"><span>？</span></button>`;
    const grid = h("div", { class: "cx-grid" + (failed ? " failed" : ""), html });
    grid.addEventListener("click", e => { const bb = e.target.closest(".cell-beyond"); if (bb) beyondFlow(bb); });
    if (params.beyond) later(() => { const bb = $(".cell-beyond"); if (bb) { bb.scrollIntoView({ block: "center", behavior: "smooth" }); bb.classList.add("call"); } }, 400);
    grid.addEventListener("click", e => {
      const b = e.target.closest(".cell"); if (!b) return;
      $$(".cell.sel", grid).forEach(x => x.classList.remove("sel")); b.classList.add("sel");
      const pick = codexPick(+b.dataset.i); if (failed) pick[ROLLED] = FAILED;
      showCodexCell(detail, pick, failed);
    });
    // 篩選：整條是壹顆銅牌按鈕，寫現在篩了什麼；點開才是整排選項（翊文 11-13：可以展開的東西要看得出能展開）
    const nowFilter = CATS.map(c => filt[c]).filter(Boolean).join("、") || "全部（沒有篩）";
    const filterBox = h("details", { class: "onescreen-card codex-filter", open: !!UI.codexFilterOpen, onToggle: e => { UI.codexFilterOpen = e.target.open; } },
      h("summary", null, h("b", null, "篩選"), h("span", { class: "codex-filter-now" }, nowFilter), h("span", { class: "codex-filter-more" }, "點開 ▾"), h("span", { class: "codex-filter-less" }, "收起來 ▴")), chips);
    root.append(h("div", { class: "onescreen-main" },
      h("div", { class: "codex-stage" }, h("p", { class: "sub codex-count" }, `顯示 ${num(shown)} 格，收藏了 ${num(own)} 格`), grid),
      h("aside", { class: "onescreen-side" }, filterBox, detail)));
  } else if (tab === "repaired") {
    const list = collectionItems("repaired");
    stageOnly(h("p", { class: "sub" }, hasUp(P, "repair") ? "在館長室的修復台把失敗作修好，就會放到這裡。" : "在館長室買「修復台」之後，失敗作可以修成修復品。"),
      list.length ? h("div", { class: "item-grid" }, list.map(it => h("div", { class: "item-card" }, h("div", { class: "si-art", html: itemHTML(it) }), placard([describePepe(it.pick).title, "修復品"]))))
        : h("p", { class: "empty" }, "還沒有修復品。"));
  } else if (tab === "recipes") {
    stageOnly(h("p", { class: "sub" }, `在融合室試出來的配方。發現了 ${Object.keys(P.recipes).length}／${RECIPES.length} 個。`),
      h("div", { class: "badge-grid" }, RECIPES.map(r => {
        const t = (typeof RECIPE_TEXT !== "undefined" && RECIPE_TEXT[r.id]) || { name: r.id, hint: "" };
        const got = P.recipes[r.id];
        return freshMark(h("div", { class: "badge recipe" + (got ? " got" : "") }, icon(got ? "scroll" : "lock"),
          h("b", null, got ? t.name : "？？？"), h("p", { class: "sub" }, got ? t.found : t.hint), got ? h("p", { class: "sub" }, `發現於 ${got}`) : null), got && isFresh(P, "codex", FRESH_KEY.recipe(r.id)));
      })));
  } else if (tab === "forbidden") {
    const list = Object.entries(P.pepes).map(([k, e]) => ({ kind: "pepe", key: k, pick: fromKey(k), perfect: !!e.perfect })).filter(i => i.pick && !isBasePick(i.pick));
    const forb = CATS.flatMap(c => partOf(c).options.filter(o => isSpecialOpt(o) && !((o.limited === "show" || o.limited === "week") && !isUnlocked(P, c, o.name))).map(o => ({ c, o }))); // 主題展、每週特展的配件拿到才列（決定 0035）
    const how = o => o.forbidden ? `神話 ${o.myth}` : o.mutant ? "融合突變" : o.mix ? "融合調色" : o.limited ? ({ shop: "兌換所限定", show: "主題展限定", week: "每週特展限定" }[o.limited] || "簽到限定") : "委託人送的";
    stageOnly(h("p", { class: "sub" }, `禁忌、突變、委託人送的選項不算在 ${num(CORE_TOTAL)} 格裡：` + forb.map(({ c, o }) => `${o.name}（${c}，${how(o)}）${isUnlocked(P, c, o.name) ? "已打開" : ""}`).join("、")),
      list.length ? h("div", { class: "item-grid" }, list.map(it => h("div", { class: "item-card" }, h("div", { class: "si-art", html: itemHTML(it) }), pepePlacard(it.pick, { perfect: it.perfect }))))
        : h("p", { class: "empty" }, "還沒有禁忌作品。"));
  } else if (tab === "pillow") {
    const combos = [];
    const rec = (i, acc) => { if (i === PILLOW_PARTS.length) { combos.push(acc); return; } PILLOW_PARTS[i].options.forEach(o => rec(i + 1, Object.assign({}, acc, { [PILLOW_PARTS[i].name]: o.name }))); };
    rec(0, {});
    const grid = h("div", { class: "pl-grid" }, combos.map(pick => {
      const base = PILLOW_CATS.map(c => pick[c]).join("|");
      const keys = Object.keys(P.pillows).filter(k => parsePillowKey(k).base === base);
      const last = keys.length ? parsePillowKey(keys[keys.length - 1]) : null;
      const cell = h("button", { type: "button", class: "pl-cell" + (keys.length ? " own" : ""), "aria-label": `${base.split("|").join("")}：印過 ${keys.length} 種` },
        h("span", { class: "si-art", html: keys.length ? itemHTML({ kind: "pillow", key: keys[keys.length - 1] }) : ART.pillow(pick, null) }),
        h("span", { class: "pl-cell-l" }, `${pick.尺寸}・${pick.材質}・${pick.填充}`),
        h("span", { class: "pl-cell-n" }, keys.length ? `印過 ${keys.length} 種` : "還沒做過"));
      cell.addEventListener("click", () => {
        detail.replaceChildren(h("h3", null, `${pick.尺寸}${pick.材質}抱枕・${pick.填充}`),
          keys.length ? h("div", { class: "item-grid small" }, keys.map(k => h("div", { class: "item-card" }, h("div", { class: "si-art", html: itemHTML({ kind: "pillow", key: k }) }), h("p", { class: "sub" }, describePillow(k).printed))))
            : h("p", { class: "empty" }, "還沒做過這一種。"));
      });
      return cell;
    }));
    root.append(h("div", { class: "onescreen-main" },
      h("div", { class: "codex-stage" }, h("p", { class: "sub codex-count" }, `抱枕 ${Object.keys(P.pillows).length} 種（27 格，每格顯示印過幾種佩佩）`), grid),
      h("aside", { class: "onescreen-side" }, detail)));
  } else {
    stageOnly(h("div", { class: "badge-grid" }, BADGES.map(b => freshMark(h("div", { class: "badge" + (P.badges[b.id] ? " got" : "") },
      icon(P.badges[b.id] ? "star" : "lock"), h("b", null, b.name), h("p", { class: "sub" }, b.desc), h("p", { class: "sub" }, P.badges[b.id] ? `拿到了・${P.badges[b.id]}` : b.insp ? `獎勵 +${b.insp} 靈感` : "")),
      !!P.badges[b.id] && isFresh(P, "codex", FRESH_KEY.badge(b.id)))))); // 新拿到的徽章：角上「新」（11-08）
    const rows = Object.keys(P.fullRows);
    stageOnly(h("p", { class: "sub" }, `整類全收集（每類 +${NUM.fullRowSan} 理智）：${rows.length ? rows.map(r => r.split(":")[1]).join("、") : "還沒有"}`));
  }
};
export function showCodexCell(detail, pick, failed) {
  // 這個核心組合，收藏裡第一件符合的（可能帶背景、手上拿的東西）
  const src = failed ? P.failed : P.pepes;
  const ck = coreKey(pick);
  const hit = Object.keys(src).find(k => { const p = fromKey(k); return p && coreKey(p) === ck; });
  if (hit) pick = fromKey(hit);
  const key = hit || pepeKey(pick);
  const e = src[key];
  const art = h("div", { class: "frog live big", html: e ? frogHTML(pick, { failed, perfect: e && e.perfect, fx: !failed }) : ART.frog(pick, { silhouette: true }) });
  const missing = CATS.filter(c => c !== ROLLED || isFree(P)).filter(c => !(failed && c === ROLLED) && !usable(P, c).includes(pick[c])).map(c => pick[c]);
  if (e && !failed) later(() => enliven(art, pick), 0);
  detail.replaceChildren(art, pepePlacard(pick, { failed, perfect: e && e.perfect }),
    e ? h("p", { class: "sub" }, failed ? `失敗了 ${e} 次` : `做過 ${e.n} 次${e.perfect ? "・完美作品" : ""}${e.gen2 ? "・第 2 代帶來的" : ""}`) : null,
    !e && !failed ? btn("去做這隻", () => go("workshop", { preset: pick }), "primary") : null,
    !e && !failed && !isFree(P) ? h("p", { class: "sub" }, "選項會幫你選好；稀有度還是要靠擲骰。") : null,
    !e && missing.length ? h("p", { class: "warn-line" }, `還沒解鎖：${missing.join("、")}`) : null);
}

// ---------- 10 我的展廳 ----------
SCREENS.hall = (root, params) => {
  if (params.place) {
    const it = params.place; params.place = null;
    const empty = P.hall.findIndex(s => !s);
    const r = placeInHall(P, empty >= 0 ? empty : 0, it);
    if (r.ok) later(() => showEvents(r.events), 300);
  }
  if (params.friend && ADDONS.friendHall) { ADDONS.friendHall(root, params); return; } // 走進館友的展廳（多人版 M2，ui_visit.js）
  if (params.week) { weeklyHall(root, params); return; }
  const hs = hallScore(P);
  const theme = hs.theme ? HALL_THEME_TEXT[hs.theme] : null;
  // 看館友的展廳、請館友來看（11-09，翊文：「這些分享不需要用分享碼了，直接可以選擇館友才對」）：登入了才有；單機沒有館友，不放按鈕
  const tools = UI.net && PANELS.pickFriend ? [
    btn([icon("users"), " 看館友的展廳"], () => PANELS.pickFriend({ title: "看館友的展廳", hint: "選一位館友，走進他的展廳。他不在線也看得到。",
      onPick: p => go("hall", { friend: { id: p.id, nick: p.nick } }, { action: false }) }), "ghost"),
    ADDONS.hallCall ? btn([icon("share"), " 請館友來看"], () => PANELS.pickFriend({ title: "請館友來看", hint: "選一位館友，請他來看你的展廳。沒有獎勵；他在線上會馬上看到，不在線的下次進館看到。",
      keep: true, onPick: p => ADDONS.hallCall.send(p) }), "ghost") : null,
  ].filter(Boolean) : [];
  // 壹個畫面看得完（翊文 11-13，docs/介面整合規劃.md 第六步，跟委託櫃台同壹個骨架）：
  //   標題壹行（評分、常設展／本週特展的頁籤、看館友的展廳）｜中間牆和展台｜右邊側欄（主題怎麼擺、參觀者留言、館友來過、館主名牌、探險報告、賭場的稱號）｜最下面收藏的抽屜
  root.classList.add("onescreen-room", "hall-onescreen");
  root.append(roomHead("我的展廳", `評分 ${hs.score}／100　參觀者 ${num(P.hallVisitors)} 位`, hallTabs("main"), ...tools));
  const wall = h("div", { class: "hall-wall" + (theme ? " themed" : "") },
    theme ? h("div", { class: "theme-name enter" }, h("h2", null, theme.name), h("p", null, theme.wall))
      : h("p", { class: "theme-hint big" }, "牆上還沒有主題。", h("b", null, "擺對主題"), "，牆上會浮出主題名，", h("b", { class: "good" }, "評分 +10～+20"), "。點「主題」看哪壹個最接近。"));
  const room = h("div", { class: "hall-room", style: { "--n": String(P.hall.length) } }, P.hall.map((s, i) => pedestal(s, i)));
  const news = npcNews(todayStr(), npcWebCounters()); // 館內近況（11-14，shared/npc.js）：旅客和委託人現在的故事，壹兩句小字
  const visitors = h("section", { class: "visitors", id: "visitors" }, h("h3", null, "參觀者留言"),
    news.length ? h("p", { class: "sub npc-news" }, "館裡最近：" + news.map(x => x.news).join(" ")) : null,
    P.visitorLog.length ? P.visitorLog.slice(0, 6).map(v => visitorCard(v)) : h("p", { class: "empty" }, hs.items.length ? "參觀者快來了。" : "擺上作品，參觀者就會來。"));
  const strip = collectionStrip({ tabs: ["pepe", "failed", "pillow", "repaired"], title: "你的收藏", hint: "拖上展台；也可以點壹件、再點展台", drag: true });
  // 主題怎麼擺：收起來，標題寫現在最接近的那壹個（點開才是整張清單）
  const guide = themeGuide(hs);
  const themes = h("details", { class: "onescreen-card hall-themes" }, h("summary", null, h("b", null, theme ? `主題：${theme.name}` : "主題：還沒有"), h("span", { class: "hall-themes-open" }, "點開看怎麼擺 ▾"), h("span", { class: "hall-themes-close" }, "收起來 ▴")), guide);
  const side = h("aside", { class: "onescreen-side" }, themes, visitors);
  root.append(h("div", { class: "onescreen-main" }, h("div", { class: "hall-stage" }, wall, room), side), onescreenDrawer(strip));
  if (ADDONS.hall) ADDONS.hall(side, room); // 簽到拿的展台裝飾、館主名牌（11-09，ui_signin.js）：名牌放側欄
  if (ADDONS.hall2) ADDONS.hall2(side); // 掛在牆上的探險報告（ui_coop.js）
  if (ADDONS.hall3) ADDONS.hall3(side); // 賭場的稱號和紀念品（決定 0040，ui_casino.js）
  if (ADDONS.hallGuests) ADDONS.hallGuests(side); // 館友來過、留了什麼話（多人版 M2，ui_visit.js）
  if (ADDONS.hallShow) ADDONS.hallShow(wall); // 主題展的展期、三級、海報（11-09，決定 0035，ui_themeshow.js）
  // 手機：側欄只留主題那壹條，其他（館友來過、參觀者留言、探險報告…）收在「館友和留言」按鈕後面，點了從下面蓋上來（測試 session 11-13：手機看不到館友來過）
  const others = [...side.children].filter(c => c !== themes);
  if (others.length) {
    const more = h("details", { class: "hall-more" }, h("summary", null, h("b", null, "館友和留言"), h("span", { class: "hall-more-open" }, "點開 ▾"), h("span", { class: "hall-more-close" }, "收起來 ▴")), h("div", { class: "hall-more-body" }, others));
    side.append(more);
  }
  side.prepend(themes); // 主題放側欄最上面（館友來過那塊會自己插到最前面，這裡再搬回來；翊文 11-13：「右邊的主題展也不夠明顯」）
};
// 主題展的小卡（翊文 11-08：「擺對主題，牆上會浮出主題名……這個要顯示清楚一點」）
// 還沒見過「俄國8+9」的人不列那個主題，只留壹張「？？？」；沒解鎖「不可名狀」就不提它
export function themeGuide(hs) {
  const known = isUnlocked(P, "心情", "俄國8+9"), eld = isUnlocked(P, ROLLED, "不可名狀");
  const list = themeProgress(hs.items).filter(t => t.id !== "russia8" || known);
  const cards = list.map(t => {
    const tx = HALL_THEME_TEXT[t.id] || { name: t.id }, top = hs.theme === t.id;
    const pct = Math.min(100, Math.round(t.have / t.need * 100));
    return h("div", { class: "tg-card" + (t.ok ? " ok" : "") + (top ? " top" : "") },
      h("div", { class: "tg-head" }, h("b", { class: "tg-name" }, tx.name), h("span", { class: "tg-bonus" }, `+${t.bonus}`)),
      h("p", { class: "tg-rule" }, t.rule, t.id === "legend" && eld ? "（或不可名狀）" : ""),
      h("div", { class: "tg-bar" }, h("i", { style: { width: (t.ok ? 100 : pct) + "%" } })),
      h("p", { class: "tg-have" }, top ? "✓ 牆上的主題" : t.ok ? "✓ 也成立（只算加分最高的壹個）" : `現在 ${t.have}／${t.need}${t.extra ? "・" + t.extra : ""}`),
      ADDONS.themeCard ? ADDONS.themeCard(t.id) : null); // 這個主題展辦到哪壹級（決定 0035，ui_themeshow.js）
  });
  if (!known) cards.push(h("div", { class: "tg-card unknown" }, h("div", { class: "tg-head" }, h("b", { class: "tg-name" }, "？？？")), h("p", { class: "tg-rule" }, "還有壹個主題，等你發現。")));
  return h("section", { class: "theme-guide", "aria-label": "主題展" },
    h("div", { class: "tg-title" }, icon("sparkle"), h("b", null, "主題展"), h("span", null, "擺對了，牆上會浮出主題名；評分加分，只算加分最高的壹個。")),
    h("div", { class: "tg-grid" }, cards));
}
export function pedestal(slot, i) {
  const it = hallItem(P, slot);
  const el = h("div", { class: "ped-slot" + (it ? " full" : ""), "aria-label": it ? `展台 ${i + 1}：${itemTitle(it)}` : `展台 ${i + 1}：空的` },
    h("div", { class: "ped-art", html: it ? itemHTML(it, it.kind === "pepe" ? { fx: true } : {}) : "" }),
    h("div", { class: "ped-block" }),
    it ? h("div", { class: "ped-label" }, h("b", null, itemTitle(it)), it.kind !== "pillow" ? h("span", null, rdot(it.kind === "failed" ? FAILED : it.pick[ROLLED]), " ", it.kind === "failed" ? "失敗作" : it.pick[ROLLED]) : h("span", null, describePillow(it.key).printed))
      : h("div", { class: "ped-label empty" }, "空展台"),
    it ? h("button", { type: "button", class: "icon-btn ped-x", "aria-label": "從展台拿下來", onClick: e => { e.stopPropagation(); P.hall[i] = null; persist(); rerender(); } }, icon("close")) : null);
  placeTarget(el, ["pepe", "pillow"], item => {
    const r = placeInHall(P, i, item);
    if (!r.ok) { note(r.reason || "放不上去", "bad"); return false; }
    snd("submit"); persist();
    later(() => { if (UI.screen === "hall") { rerender(); showEvents(r.events); } }, 280);
    return true;
  });
  return el;
}
export function visitorCard(v) { return h("div", { class: "visitor enter" + (v.story ? " story" : "") }, h("p", null, v.story ? v.text : `「${v.text}」`), h("p", { class: "sub" }, `— ${v.who}${v.gain ? `　+${v.gain} 靈感` : ""}${v.full ? `　（今天參觀者給的靈感滿 ${NUM.visitorInspDay} 了，明天再來）` : ""}`)); }
export function copyText(text, ta) {
  const ok = () => note("複製好了。", "good");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => { ta.select(); document.execCommand("copy"); ok(); });
  else { ta.select(); document.execCommand("copy"); ok(); }
}

// ---------- 11 圖庫：放你們自己的佩佩圖 ----------
// 一次放很多張時，照檔名分到哪種心情：檔名有這些字就分過去，都沒有就放「全部」
export const MOOD_WORDS = { 開心: ["開心", "快樂", "笑", "happy", "smile", "laugh", "joy"], 傷心: ["傷心", "難過", "哭", "sad", "cry", "tear"], 生氣: ["生氣", "憤怒", "怒", "angry", "mad", "rage"], "俄國8+9": ["俄", "8+9", "russia", "gopnik", "slav"] };
export const IMG_SLOTS = () => ["全部"].concat(baseOpts("心情"));
export function guessSlot(fileName) {
  const n = fileName.toLowerCase();
  return Object.keys(MOOD_WORDS).find(m => IMG_SLOTS().includes(m) && MOOD_WORDS[m].some(w => n.includes(w.toLowerCase()))) || "全部";
}
export function shrinkImage(file) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 360 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/webp", 0.85));
      };
      im.onerror = () => res(null);
      im.src = reader.result;
    };
    reader.onerror = () => res(null);
    reader.readAsDataURL(file);
  });
}
export async function addImages(files) {
  const list = [...files].filter(f => f.type.startsWith("image/"));
  if (!list.length) { note("沒有圖片檔。", "bad"); return; }
  for (const f of list) {
    const url = await shrinkImage(f);
    if (!url) continue;
    const slot = guessSlot(f.name);
    IMG[slot] = asList(IMG[slot]).concat(url);
  }
  saveImages();
  note(`放進 ${list.length} 張圖。`, "good");
  rerender();
}
export const FIT_SLIDERS = [
  { k: "hatY", label: "帽子上下", min: -80, max: 80, step: 1 },
  { k: "hatS", label: "帽子大小", min: 0.5, max: 2, step: 0.05 },
  { k: "handX", label: "手左右", min: -100, max: 40, step: 1 },
  { k: "handY", label: "手上下", min: -80, max: 80, step: 1 },
];
SCREENS.library = root => {
  const input = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onChange: () => { addImages(input.files); input.value = ""; } });
  const drop = h("div", { class: "dropzone", tabindex: "0", role: "button", "aria-label": "把圖拖進來，或按一下選圖" },
    icon("upload"), h("p", null, "把圖拖進虛線框，或點這裡選圖"), h("p", { class: "sub" }, "可以一次選很多張。只在這個瀏覽器裡用，不會上傳。"), input);
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files.length) addImages(e.dataTransfer.files); });
  const total = Object.values(IMG).reduce((n, v) => n + asList(v).length, 0);
  const rows = h("div", { class: "img-rows" }, IMG_SLOTS().map(slot => {
    const imgs = asList(IMG[slot]);
    const row = h("div", { class: "img-row", "aria-label": `${slot}：${imgs.length} 張` },
      h("span", { class: "img-row-l" }, slot, h("small", null, ` ${imgs.length}`)),
      h("div", { class: "img-list" }, imgs.length ? imgs.map((url, i) => {
        const cell = h("div", { class: "img-cell", tabindex: "0", "aria-label": `${slot}的第 ${i + 1} 張` },
          h("img", { src: url, alt: "" }),
          h("button", { type: "button", class: "icon-btn img-x", "aria-label": "拿掉這張", onClick: e => { e.stopPropagation(); moveImage(slot, i, null); } }, icon("close")));
        UI.cleanup.push(FX.makeDraggable(cell, { type: "image", data: { slot, i }, onTap: () => { UI.imgHeld = { slot, i }; $$(".img-cell.held").forEach(x => x.classList.remove("held")); cell.classList.add("held"); note("選好了，再點要放的那一列。"); } }));
        return cell;
      }) : h("span", { class: "empty" }, slot === "全部" ? "其他心情沒有圖時用這裡的" : "拖一張圖到這一列")));
    UI.cleanup.push(FX.makeDropTarget(row, { accepts: ["image"], onDrop: d => { if (d.slot === slot) return false; moveImage(d.slot, d.i, slot); return true; } }));
    row.addEventListener("click", () => { if (UI.imgHeld && UI.imgHeld.slot !== slot) { const d = UI.imgHeld; UI.imgHeld = null; moveImage(d.slot, d.i, slot); } });
    return row;
  }));
  const preview = h("div", { class: "frog live fit-frog" });
  const demo = { 稀有度: "普通", 心情: "開心", 顏色: "綠", 帽子: "巫師帽", 姿勢: "比讚" };
  const drawPreview = () => { preview.innerHTML = ART.frog(demo, { custom: IMG, fit: FIT }); };
  const fit = h("div", { class: "fit" }, h("h3", null, "對準你的圖"), h("p", { class: "sub" }, "有放圖時才有作用：帽子和比讚的手照這裡的位置疊上去。"),
    FIT_SLIDERS.map(sl => {
      const r = h("input", { type: "range", min: String(sl.min), max: String(sl.max), step: String(sl.step), value: String(FIT[sl.k]), "aria-label": sl.label });
      r.addEventListener("input", () => { FIT[sl.k] = +r.value; saveFit(); drawPreview(); });
      return h("label", { class: "fit-row" }, h("span", null, sl.label), r);
    }),
    btn("位置重設", () => { Object.assign(FIT, { hatY: 0, hatS: 1, handX: 0, handY: 0 }); saveFit(); rerender(); }, "ghost"));
  root.append(roomHead("圖庫", total ? `圖庫 ${total} 張。某個心情有圖就從裡面挑，沒有就用「全部」的圖；顏色、帽子、姿勢照樣套上去（顏色是照綠色的圖去調）。` : "還沒有圖，現在畫的是原創青蛙。放你們自己的佩佩圖進來吧。"),
    drop, h("div", { class: "lib-wrap" }, rows, h("div", { class: "fit-wrap" }, preview, fit)));
  drawPreview();
};
export function moveImage(from, i, to) {
  const list = asList(IMG[from]).slice();
  const [url] = list.splice(i, 1);
  if (list.length) IMG[from] = list; else delete IMG[from];
  if (to && url) IMG[to] = asList(IMG[to]).concat(url);
  saveImages(); rerender();
}

// ---------- 12 設定 ----------
SCREENS.settings = root => {
  const s = SAVE.settings;
  const set = (k, v) => { s[k] = v; applySettings(); persist(); rerender(); };
  const seg = (k, opts) => h("div", { class: "seg" }, opts.map(([v, n]) => h("button", { type: "button", class: "seg-btn" + (s[k] === v ? " on" : ""), onClick: () => set(k, v) }, n)));
  const exportBox = h("div", { class: "share-box", hidden: true });
  let armed = false;
  const clear = btn("清除存檔", () => {
    if (!armed) { armed = true; clear.textContent = "再按一次：真的清除（不能復原）"; clear.classList.add("danger"); return; }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 不能存的環境 */ }
    setSave(newSave()); SAVE.gen2Migrated = true; setP(null); persist(); applySettings();
    note("存檔清掉了。圖庫的圖還在（要拿掉請到圖庫）。");
    go("title", {}, { action: false });
  }, "ghost danger-line");
  const other = P ? (isFree(P) ? "challenge" : "free") : null;
  root.append(roomHead("設定", null), h("div", { class: "set-cols" }, // 左邊設定、右邊怎麼玩（手機上下排）
    h("div", { class: "set-list" },
      h("div", { class: "set-row" }, h("span", null, "字大小"), seg("font", [["s", "小"], ["m", "中"], ["l", "大"]])),
      h("div", { class: "set-row" }, h("span", null, "動畫減量"), seg("reduceMotion", [[false, "關"], [true, "開（只淡入）"]])),
      NUM.ui && NUM.ui.newLobby ? h("div", { class: "set-row" }, h("span", null, "大廳的樣子"), h("div", null, h("div", { class: "seg" }, [[false, "新的"], [true, "舊的"]].map(([v, n]) => h("button", { type: "button", class: "seg-btn" + (!!s.oldLobby === v ? " on" : ""), onClick: () => set("oldLobby", v) }, n))), h("p", { class: "sub" }, "11-11 大廳改版了（導覽圖變大、右邊壹欄今天要做的事）。用不習慣可以先換回舊的。"))) : null,
      h("div", { class: "set-row" }, h("span", null, "節日外觀"), h("div", null, seg("holidayLook", [[true, "打開"], [false, "關"]]), h("p", { class: "sub" }, "節日那天（台灣時間 05:00 到隔天 05:00）館裡的顏色和裝飾換壹下。"))), // 11-09，決定 0030
      // 換日（11-08 翊文：「壹天多長 全部都要是真實的壹天」）：拿掉 15／30／60 分鐘的選項，只寫什麼時候換日（決定 0019）
      h("div", { class: "set-row set-day" }, h("span", null, "換日"), h("div", null,
        h("p", { class: "sub" }, "台灣時間每天 05:00 換壹天，每週壹 05:00 換週，大家的壹天都壹樣。每換壹天：委託換新、每天的次數重新算、心情恢復、技能成長。"),
        P ? h("p", { class: "sub" }, `現在是第 ${pad(gameDayNo(P), 3)} 天（你第壹次進館那天是第 1 天）。`) : null)),
      h("div", { class: "set-row set-orient" }, h("span", null, "手機直拿提醒"), h("div", null,
        h("div", { class: "seg" }, [[false, "提醒我轉橫"], [true, "不用提醒"]].map(([v, n]) => h("button", { type: "button", class: "seg-btn" + (orientSkipped() === v ? " on" : ""), onClick: () => { setOrientSkip(v); rerender(); } }, n))),
        h("p", { class: "sub" }, "手機直拿時，會請你把手機轉橫（橫著比較好玩）。只記在這台裝置，電腦和平板不會跳。"))),
      h("div", { class: "set-row" }, h("span", null, "聲音"), seg("muted", [[false, "打開"], [true, "靜音"]])),
      h("div", { class: "set-row set-vol" }, h("span", null, "音量"), volumeBox()),
      h("div", { class: "set-row set-demo" }, h("span", null, "試聽"), demoBox()),
      P ? h("div", { class: "set-row" }, h("span", null, "模式"), h("span", { class: "sub" }, isFree(P) ? "現在是自由模式" : "現在是挑戰模式"),
        btn(other === "free" ? "換到自由模式" : "換到挑戰模式", () => {
          if (other === "challenge" && !SAVE.profiles.challenge) { go("title", {}, { action: false }); return; }
          if (other === "free" && !SAVE.profiles.free) SAVE.profiles.free = newProfile("free");
          useProfile(other); go("lobby", {}, { action: false }); afterEnter();
        }, "ghost")) : null,
      h("div", { class: "set-row" }, h("span", null, "存檔碼"), h("div", null,
        btn("匯出", () => {
          exportBox.hidden = false;
          const code = exportCode(SAVE);
          const ta = h("textarea", { class: "code", readonly: true, rows: "4" }, code);
          exportBox.replaceChildren(h("p", { class: "sub" }, "把這串字存起來，換電腦時貼進「匯入」就能帶走（圖庫的圖不在裡面）。"), ta, btn([icon("copy"), " 複製"], () => copyText(code, ta), "primary"));
        }, "ghost"),
        btn("匯入", () => {
          exportBox.hidden = false;
          const ta = h("textarea", { class: "code", rows: "4", placeholder: "貼上存檔碼" });
          exportBox.replaceChildren(h("p", { class: "sub" }, "貼上存檔碼。匯入會蓋掉現在這台的存檔。"), ta, btn("匯入", async () => {
            const s2 = importCode(ta.value);
            if (!s2) { note("這串存檔碼讀不出來。", "bad"); return; }
            if (!(await ask("確定要用這個存檔蓋掉現在的嗎？", "蓋掉", "算了"))) return;
            setSave(s2); SAVE.gen2Migrated = true; persist(); applySettings();
            const m = SAVE.current && SAVE.profiles[SAVE.current] ? SAVE.current : SAVE.profiles.challenge ? "challenge" : SAVE.profiles.free ? "free" : null;
            if (m) { useProfile(m); go("lobby", {}, { action: false }); } else { setP(null); go("title", {}, { action: false }); }
            note("匯入好了。", "good");
          }, "primary"));
          ta.focus();
        }, "ghost"))),
      exportBox,
      h("div", { class: "set-row" }, h("span", null, "清除存檔"), clear),
      h("div", { class: "set-row" }, h("span", null, "版本"), h("span", { class: "sub" }, typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "開發中"))),
    howToPlay()),
    P ? btn("回大廳", () => go("lobby", {}, { action: false }), "ghost") : btn("回開場", () => go("title", {}, { action: false }), "ghost"));
};

// ---------- 13 結局 ----------
SCREENS.ending = (root, params) => {
  const id = params.id;
  const E = ENDINGS[id] || (id === "cellar" && typeof ENDING_CELLAR !== "undefined" ? ENDING_CELLAR : ENDINGS.curator);
  if (id !== "russia8") P.endings[id] = todayStr();
  else P.endings.russia8 = (P.endings.russia8 || 0) + 1;
  persist();
  const lines = h("div", { class: "end-lines" });
  const stats = h("div", { class: "end-stats" });
  const actions = h("div", { class: "end-actions" });
  root.append(h("div", { class: "end-wrap" }, h("h1", { class: "end-title" }, E.title), lines, stats, actions));
  (async () => {
    await wait(900);
    for (const l of E.lines) { lines.append(h("p", { class: "enter slow" }, l)); await wait(1500); }
    const hs = hallScore(P);
    stats.replaceChildren(
      h("div", null, h("b", null, num(codexCount(P))), h("span", null, "收藏")),
      h("div", null, h("b", null, num(possibilities(P))), h("span", null, `可能性／${num(BASE_TOTAL)}`)),
      h("div", null, h("b", null, String(hs.score)), h("span", null, "展廳評分")));
    stats.classList.add("enter");
    await wait(900);
    if (id === "russia8") actions.append(btn("下一位參觀者", async e => {
      // 參觀者一位接一位（11-08 翊文，roguelike 的繼承）：先留一樣東西給下一位（A），換人之後選職業、抽小優缺點（C，決定 0028）。流程在 ui_screens3.js 的 retireFlow
      e.currentTarget.disabled = true;
      await retireFlow("russia8");
    }, "primary"));
    else if (RETIRE_ENDINGS.includes(id) && retireCheck(P, "ending").ok) {
      // 退休換人（11-08 翊文：「好，加些其他的」，決定 0025）：看完館長、地下館長、你的佩佩博物館，可以退休換下一位，也可以繼續當參觀者
      actions.append(btn(LEGACY_TEXT.stayBtn, () => go("lobby", {}, { action: false }), "primary"),
        btn(LEGACY_TEXT.retireBtn, async e => {
          const b = e.currentTarget;
          if (!(await ask(legacyFill(LEGACY_TEXT.retireAsk, { who: visitorLabel(P) }), LEGACY_TEXT.retireYes, LEGACY_TEXT.retireNo))) return;
          b.disabled = true;
          await retireFlow(id);
        }, "ghost"));
    } else actions.append(btn("回大廳繼續逛", () => go("lobby", {}, { action: false }), "primary"));
    actions.querySelector("button").focus();
  })();
};

// 理智 0：熄燈，只剩手上一圈光，找到那扇門
SCREENS.darkroom = root => {
  const x = 12 + Math.random() * 76;
  const door = h("button", { type: "button", class: "dark-door", style: { left: x + "%" }, "aria-label": "一扇門，上面寫著 8", html: ART.exhibit("russia8") });
  // 光圈底下的展廳（翊文 11-08：手電筒要整頁都照得到東西）：空的金框（離門遠壹點），其中壹個有眼睛；瓜子殼壹路通到門口
  const slots = [8, 22, 36, 50, 64, 78, 92].filter(l => Math.abs(l - x) > 9);
  const eyesAt = (Math.random() * slots.length) | 0;
  const frames = slots.map((l, i) => {
    const w = 70 + Math.random() * 60, hh = w * (1.1 + Math.random() * 0.4);
    return h("div", { class: "dk-frame", style: { left: l + "%", top: (12 + Math.random() * 26) + "%", width: w + "px", height: hh + "px" } },
      i === eyesAt ? h("div", { class: "dk-eyes" }, h("i", null), h("i", null)) : null);
  });
  const sx = x < 50 ? 100 : 0, shells = Array.from({ length: 12 }, (_, i) => {
    const k = (i + 1) / 13, px = sx + (x - sx) * k + (Math.random() - 0.5) * 3;
    return h("i", { class: "dk-shell", style: { left: px + "%", bottom: (4 + Math.random() * 7) + "%", transform: `rotate(${(Math.random() * 180) | 0}deg)` } });
  });
  door.addEventListener("focus", () => { const r = door.getBoundingClientRect(); document.documentElement.style.setProperty("--mx", (r.left + r.width / 2) + "px"); document.documentElement.style.setProperty("--my", (r.top + r.height / 2) + "px"); });
  door.addEventListener("click", async () => {
    door.disabled = true; snd("whoosh");
    door.innerHTML = ART.exhibit("russia8", { open: true });
    await wait(1600);
    go("ending", { id: "russia8" }, { action: false });
  });
  const wrap = h("div", { class: "dark-wrap" }, h("div", { class: "dk-wall" }), ...frames, h("div", { class: "dk-wainscot" }), h("div", { class: "dk-floor" }), ...shells,
    h("p", { class: "dark-hint" }, "燈熄了。只剩你手上的一圈光。"), door);
  wrap.addEventListener("pointerdown", e => trackGaze(e)); // 手機：點哪裡，光就到哪裡
  root.append(wrap);
  later(() => snd("heartbeat"), 600);
};

// ---------- 小遊戲共用的框 ----------
// miniLayer 搬到 ui_core.js 了（第 4 版：ui_core 不 import 後面的檔）
// 小遊戲：上色（拖三個顏料混出目標顏色）
export function colorGame(targetName) {
  return new Promise(res => {
    const tgt = (ART.COLORS[targetName] || ["#6cc04a"])[0];
    const m = miniLayer("調色", `混出「${targetName}」：把顏料拖進碗裡（或直接點顏料），每一滴都算。20 秒。`);
    const mp = miniPill("color"); if (mp) m.card.append(mp);
    const drops = { c: 0, m: 0, y: 0 };
    const mix = () => { const k = 0.1; return [1 - Math.min(1, drops.c * k), 1 - Math.min(1, drops.m * k), 1 - Math.min(1, drops.y * k)].map(v => Math.round(v * 255)); };
    const hex = rgb => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
    const tRgb = tgt.match(/\w\w/g).map(x => parseInt(x, 16));
    const acc = () => { const a = mix(); return Math.max(0, 1 - Math.hypot(a[0] - tRgb[0], a[1] - tRgb[1], a[2] - tRgb[2]) / 441.7); };
    const bowl = h("div", { class: "bowl", "aria-label": "調色碗" }, h("i", { class: "paint" }));
    const pctEl = h("b", { class: "acc" }, "0%");
    const counts = h("p", { class: "sub" });
    const draw = () => { bowl.firstChild.style.background = hex(mix()); pctEl.textContent = Math.round(acc() * 100) + "%"; counts.textContent = `青 ${drops.c}　洋紅 ${drops.m}　黃 ${drops.y}`; };
    const add = k => { drops[k]++; snd("click"); bowl.classList.remove("plip"); void bowl.offsetWidth; bowl.classList.add("plip"); draw(); };
    const cleanups = [];
    const tubes = h("div", { class: "tubes" }, [["c", "青", "#00A6D6"], ["m", "洋紅", "#D6338A"], ["y", "黃", "#F2D21B"]].map(([k, n, col]) => {
      const t = h("button", { type: "button", class: "tube", style: { "--tc": col }, "aria-label": `加一滴${n}` }, h("i"), n);
      const unbind = FX.makeDraggable(t, { type: "paint", data: k, onTap: () => add(k) });
      t.addEventListener("click", e => { if (e.detail === 0) add(k); });
      cleanups.push(unbind);
      return t;
    }));
    cleanups.push(FX.makeDropTarget(bowl, { accepts: ["paint"], onDrop: k => { add(k); return true; } }));
    const bar = h("div", { class: "timer" }, h("i"));
    let finished = false;
    const end = skip => {
      if (finished) return; finished = true; clearTimeout(t);
      cleanups.forEach(f => { try { f(); } catch (e) { /* 已拿掉 */ } });
      const a = acc();
      const reward = a >= 0.92 ? 3 : a >= 0.8 ? 2 : a >= 0.6 ? 1 : 0;
      if (!skip) {
        const g = miniReward(P, "color", reward);
        note(`準確度 ${Math.round(a * 100)}%${g ? `　+${g} 靈感` : reward && !isFree(P) ? "（今天這個小遊戲的靈感拿滿了）" : ""}`, a >= 0.6 ? "good" : "neutral");
        if (g) snd("coin");
        updateStatus(); persist();
      }
      m.close(); res(a);
    };
    const t = setTimeout(() => end(false), 20000);
    m.card.append(h("div", { class: "mix-row" }, h("div", { class: "swatch-big", style: { background: tgt } }, h("span", null, "目標")), bowl, pctEl), counts, tubes, bar,
      h("div", { class: "rv-btns" }, btn("好了", () => end(false), "primary"), btn("倒掉重來", () => { drops.c = drops.m = drops.y = 0; draw(); }, "ghost"), btn("略過", () => end(true), "ghost")));
    m.layer.addEventListener("keydown", e => { if (e.key === "Escape") end(true); });
    draw();
    m.card.querySelector(".tube").focus();
  });
}
// 小遊戲：抱枕填充（按住塞棉花，放開的時機決定軟硬）
export function stuffGame() {
  return new Promise(res => {
    const m = miniLayer("塞棉花", "按住按鈕塞棉花，放開的時機決定填充。剛好放在每一區的中間有靈感。");
    const mp = miniPill("stuff"); if (mp) m.card.append(mp);
    const zones = [["軟綿綿", 0, 40, 20], ["剛剛好", 40, 75, 57], ["硬梆梆", 75, 100, 88]];
    const fillEl = h("i", { class: "meter-fill" });
    const meter = h("div", { class: "meter" }, zones.map(([n, a, b, c]) => h("span", { class: "zone", style: { left: a + "%", width: (b - a) + "%" } }, n, h("em", { style: { left: ((c - a) / (b - a) * 100) + "%" } }))), fillEl);
    const pillow = h("div", { class: "stuff-pillow" });
    let v = 0, raf = null, start = null, done = false;
    const drawV = () => { fillEl.style.width = v + "%"; pillow.style.transform = `scale(${0.8 + v / 400}, ${0.7 + v / 300})`; };
    const step = ts => { if (start == null) start = ts; v = Math.min(100, (ts - start) / 2600 * 100); drawV(); if (v < 100) raf = requestAnimationFrame(step); };
    const down = e => { if (done || raf) return; if (e) e.preventDefault(); start = null; raf = requestAnimationFrame(step); snd("hug"); };
    const up = () => {
      if (done || raf == null) return; cancelAnimationFrame(raf); raf = null; done = true;
      const z = zones.find(([, a, b]) => v >= a && v < b) || zones[2];
      const sweet = Math.abs(v - z[3]) <= 5;
      const g = sweet ? miniReward(P, "stuff", 1) : 0;
      note(`${z[0]}${sweet ? "，剛好在正中間！" : ""}${g ? `　+${g} 靈感` : ""}`, sweet ? "good" : "neutral");
      updateStatus(); persist();
      setTimeout(() => { m.close(); res(z[0]); }, 700);
    };
    const hold = h("button", { type: "button", class: "btn primary big hold-btn" }, "按住塞棉花");
    hold.addEventListener("pointerdown", down);
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => hold.addEventListener(ev, up));
    hold.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) down(e); if (e.key === "Escape") { done = true; m.close(); res(null); } });
    hold.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") up(); });
    m.card.append(pillow, meter, h("div", { class: "rv-btns" }, hold, btn("略過", () => { done = true; cancelAnimationFrame(raf); m.close(); res(null); }, "ghost")));
    hold.focus();
  });
}

// ---------- 設定頁：三條音軌的音量、每個聲音的試聽（翊文 11-08） ----------
export function volumeBox() {
  const v = SAVE.settings.vol || (SAVE.settings.vol = { sfx: 100, amb: 100, heart: 100 });
  const rows = [["sfx", "效果音", 100], ["amb", "環境音", 100], ["heart", "心跳與低鳴", 100]].map(([k, label, d]) => {
    if (v[k] == null) v[k] = d;
    const val = h("b", { class: "vol-n" }, String(v[k]));
    const input = h("input", { type: "range", min: "0", max: "100", step: "5", value: String(v[k]), "aria-label": label });
    input.addEventListener("input", () => { v.touched = true; v[k] = +input.value; val.textContent = input.value; FX.sound.setVolume(k, v[k] / 100); });
    input.addEventListener("change", () => { persist(); FX.sound.demo(k === "sfx" ? "revRare" : k === "amb" ? "drone" : "heart", k === "heart" ? 15 : 0.8); });
    return h("label", { class: "vol-row" }, h("span", { class: "vol-l" }, label), input, val);
  });
  return h("div", { class: "vol-list" }, rows, h("p", { class: "sub" }, "心跳在理智 30 以下才會出現，越低越快。環境音會跟著房間換。不想聽哪一種，就拉到 0。"));
}
export const SOUND_DEMOS = [
  ["理智", [["扣一點", "sanDrop", 2], ["扣很多", "sanDrop", 7], ["擲骰前", "sanPre"], ["檢定成功", "sanOk"], ["檢定失敗", "sanBad"], ["回理智", "sanUp"], ["燈熄", "lightsOut"]]],
  ["心跳與發作", [["心跳（理智 25）", "heart", 25], ["心跳（理智 15）", "heart", 15], ["心跳（理智 5）", "heart", 5], ["發作時的低鳴", "tinnitus"], ["不安的低鳴", "drone", 1]]],
  ["心情", [["心情上升", "moodUp"], ["心情下降", "moodDown"]]],
  ["做出來的佩佩", [["普通", "revCommon"], ["稀有", "revRare"], ["超稀有", "revSuper"], ["傳說級", "revLegend"], ["失敗作", "revFailed"], ["擲出 01", "crit01"], ["擲出失敗作", "fumble100"]]],
  ["地下收藏庫、融合", [["強度檢定", "drum"], ["受傷", "hurt"], ["擋下來", "block"], ["整層走完", "fanfare"], ["融合", "fuse"], ["突變", "mutate"], ["換房間的腳步", "steps"]]],
  ["奇怪的東西", [["倒著響的鐘", "eerie", 0], ["玻璃顫音", "eerie", 1], ["低語（理智 60）", "whisper", 2], ["低語（理智 25）", "whisper", 5], ["低語（理智 5）", "whisper", 7], ["遠處的門", "eerie", 3], ["不和諧的和弦", "eerie", 4]]],
  ["環境音（各 6 秒）", [["開場音樂盒", "title"], ["大廳", "lobby"], ["畫廊", "gallery"], ["手作坊", "workshop"], ["抱枕工作台", "pillow"], ["委託櫃台", "commission"], ["圖鑑室", "codex"], ["圖書館", "origin"], ["我的展廳", "hall"], ["圖庫", "library"], ["館長室", "office"], ["融合室", "fusion"], ["地下收藏庫", "cellar"], ["理智歸零", "zero"], ["設定（很安靜）", "room"]]],
];
export function demoBox() {
  return h("div", { class: "demo-list" }, SOUND_DEMOS.map(([group, items]) => h("div", { class: "demo-group" },
    h("span", { class: "demo-g" }, group),
    h("div", { class: "demo-btns" }, items.map(([label, name, arg]) => btn(label, () => {
      if (SAVE.settings.muted) { note("現在是靜音，先把上面的「聲音」打開。"); return; }
      FX.sound.demo(name, arg);
    }, "ghost small"))))));
}

// ---------- 抱枕：怎麼抱的提示（翊文 11-08：要明顯一點） ----------
export function hugHint(have, hugged, key) {
  const pp = parsePillowKey(key), spec = pp.print && pp.print.pick && pp.print.pick.心情 === "開心" ? NUM.hugHappy : NUM.hug;
  const text = !have ? "做好之後，按住抱枕不放，就能抱壹下。" : isFree(P) ? "按住抱枕不放，抱壹下。" : hugged ? "這個今天抱過了（每個抱枕每天抱壹次）。明天再抱可以再補理智；換壹個沒抱過的也可以。" : `按住抱枕不放，抱壹下：理智 +${diceWords(spec)}（每個抱枕每天壹次）`;
  return h("p", { class: "hug-hint" + (have && !hugged ? " ready" : "") + (hugged ? " done" : "") }, icon("heart"), h("span", null, text));
}
// ---------- 圖鑑：最後壹格的下壹格（《圖鑑之外》的續集） ----------
export async function beyondFlow(cell) {
  if (UI.busy) return;
  const s = bookSequels().find(x => x.id === "book3b");
  const done = !s || sequelOpen(P, s);
  UI.busy = true;
  try {
    const veil = h("div", { class: "beyond-veil" }, h("p", null, "(你閉上眼睛)"));
    document.body.append(veil);
    requestAnimationFrame(() => veil.classList.add("in"));
    snd("whisper"); await holdFor(3000);
    veil.querySelector("p").textContent = done ? "(那格裡什麼都沒有了。帽子在你頭上)" : "(那格裡的佩佩戴著帽子。帽子在動)";
    snd("squelch"); await holdFor(3800);
    veil.remove();
    if (!done && !isFree(P)) { await sanFlow("0/1D3", "beyond", "最後壹格的下壹格", { noInvoluntary: true }); if (P.dark) return; }
    if (!done) { const ev = unlockSequel(P, "book3b"); persist(); await showEvents(ev); }
  } finally { UI.busy = false; }
}

// ---------- 設定頁右邊：怎麼玩（翊文 11-08：重點要有粗體、顏色） ----------
// E(字)：金色重點；B(字)：紅色（會扣理智、會瘋）；G(字)：綠色（補理智）
export function howToPlay() {
  const E = t => h("b", { class: "em" }, t), B = t => h("b", { class: "em bad" }, t), G = t => h("b", { class: "em good" }, t);
  const R = (ic, title, ...parts) => h("li", null, h("span", { class: "rl-t" }, icon(ic), " ", title), h("p", null, ...parts));
  return h("div", { class: "rules" }, h("h3", null, icon("book"), " 怎麼玩"),
    h("ul", { class: "rl-list" },
      R("gallery", "靈感", "逛畫廊拿", E("靈感"), "，用靈感在手作坊做佩佩、解鎖選項。每解鎖壹個，", E("可能性"), "當場變大。"),
      R("dice", "稀有度", "挑戰模式做出來才知道：擲 ", E("d100"), "，", E("01–02 傳說級"), "、", E("03–12 超稀有"), "、", E("13–40 稀有"), "，其他普通。", E("01 完美作品"), "，", B(`${NUM.fumbleFrom}–100 失敗作`), "。"),
      R("heart", "心情＝幸運", E("1 點心情把骰子壓低 1"), "，最低到 02。不滿意可以", E("孤注壹擲"), "重擲壹次，但不能花心情，", B("結果更差要做理智檢定"), "。"),
      R("eye", "理智檢定", "開場理智 ", E(String(NUM.startSanity)), "。看到嚇人的東西要擲 1～100：", E("擲出的數字 ≤ 你現在的理智就算成功"), "，成功掉得少、失敗掉得多（例如「成功扣 1 點，失敗扣 1～6 點」）。", B("壹次掉 5 點以上"), "再擲壹次，看你「看懂了沒」（50＋佩佩神話），看懂了就", B("瘋狂發作"), "。", B("壹天掉超過當天理智的 1/5"), "會得到怪癖：", G(`在 ${NUM.quirkTaskDays} 個不同的日子各做壹次卡片上寫的那件事`), `，不然恐懼症 ${NUM.quirkDays} 天、狂熱 ${NUM.quirkManiaDays} 天後也會自己好。這段時間可以換別的參觀者玩。`), // 決定 0046（0027 是做完壹件事、20 分鐘）
      R("scroll", "佩佩神話", "理智上限＝", E("99－佩佩神話"), "。讀禁書、看隱藏展品會懂更多，也會打開", E("禁忌選項"), "。", B("理智 0"), "的時候，會發生壹些事。"), // 不破梗（翊文 11-08）
      R("pillow", "補理智", G("抱抱枕"), "、", G("完成委託"), "、", G("圖鑑整類全收集"), "可以補理智。"),
      R("fusion", "融合室・館長室", "兩隻佩佩融合成壹隻：每壹類各 ", E("45% 遺傳"), "、", E("10% 突變"), "，試出", E("隱藏配方"), "。館長室可以買升級、修東西、送佩佩給館友。"),
      R("cellar", "職業・地下收藏庫", "每位參觀者自己選職業，再抽", G("壹個小優點"), "、", B("壹個小缺點"), "（館長室的名片上看得到）。技能", E("擲 d100 ≤ 技能值"), "就成功，用成功的技能隔天會成長。地下收藏庫帶 ", E("3 隻佩佩"), "下去：", E("心情相剋"), "、", E("帽子是技能"), "、", E("姿勢是站位"), "。"),
      R("hourglass", "歷任參觀者", "換下壹位參觀者時，可以", E("留下壹樣東西"), "給下壹位。館長室看得到歷任參觀者。"))); // 不破梗：不寫什麼時候換人（11-08）
}
