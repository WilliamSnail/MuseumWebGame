// ================================================================
//  每日簽到、簽到日曆、節日特展的畫面（決定 0030）
//  翊文 11-09：「每日簽到要先做，可以獲得一些東西，每周全簽到也可以獲得 特別項目」
//             「遊戲要有一個簽到的日曆看看每日簽到程度，以及節日特別活動」「收到的東西馬上能用」
//             「每日有特別的節日時，外觀主題要改一下下(當天而已)」「節慶也要新增節慶相關的畫廊的畫或雕像等等的藝術品」
//  規則在 shared/signin.js、shared/holidays.js；樣式在 css/signin.css。
//  入口：
//    - 進館後在大廳跳一張簽到卡（公佈欄先：ui_board.js 的 autoBoard 決定好了才跳；今天簽過就不跳；一次登入最多自動跳 2 個視窗）。
//    - 大廳標題下面一條「今天的簽到」（ADDONS.lobby）；右上角「選單」的「簽到日曆」（ui_core.js 的 buildNav）。
//  別的房間多出來的一塊都登記在 ui_core.js 的 ADDONS（ui_core 不能 import 這個檔）：
//    lobby（大廳的簽到條）、gallery（畫廊的節日特展）、hall（展廳的展台裝飾、館主名牌）、frameClass（館友名單上自己的名牌框）、calBadge（選單上的「還沒簽到」）。
//  蓋在畫面上的木框用 ui_board.js 的 overlay()。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { LIMITED_ITEMS } from "../../shared/config.js";
import { SIGNIN_TEXT } from "../../shared/content3.js";
import { HOLIDAY_YEARS, funDaysOf, holidayOf, holidaysOn, nextHoliday } from "../../shared/holidays.js";
import { cycleReward, limitedInfo, limitedCount, ownsLimited, signIn, signPreview, signedOn, signinMonth, signinState, stockOf, useTarget, wearDeco, weekProgress, wornDeco } from "../../shared/signin.js";
import { DEFAULT_PICK, daysBetween, exhibitOpen, isFree, realTodayStr, sanSpecFor } from "../../shared/logic.js";
import { ART } from "./art.js";
import { NET } from "./net_firebase.js";
import { $$, ADDONS, planPortrait, P, PANELS, SAVE, UI, btn, go, h, icon, motionOff, note, persist, persistNow, ptNode, rerender, sanShort, showEvents, snd, updateBoardBadges, updateStatus } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { exInspLine, focusExhibit } from "./ui_screens1.js";

const WD = ["日", "壹", "二", "三", "四", "五", "六"];
const WEEK_HEAD = ["壹", "二", "三", "四", "五", "六", "日"];
const dow = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const dayLabel = d => `${md(d)}（週${WD[dow(d)]}）`;
const busy = () => UI.busy || document.querySelector(".mini-layer, .ask, .nb-layer, .fx-overlay, .fx-roll-card, .fx-spot-card, .m-door");
const canSign = () => !!P && !isFree(P);
const holName = hol => hol.dayName && hol.dayName !== hol.name ? `${hol.name}・${hol.dayName}` : hol.name;

// ---------- 東西的小圖 ----------
// 帽子：戴在青蛙頭上；展台裝飾：緞帶；名牌框：一小塊名牌；材料：一個小抱枕
export function itemArt(id) {
  const it = limitedInfo(id);
  if (!it) return "";
  if (it.kind === "part") return ART.frog(Object.assign({}, DEFAULT_PICK, { [it.cat]: it.opt }));
  if (it.kind === "mat") return ART.pillow({ 尺寸: "小抱枕", 材質: it.opt, 填充: "軟綿綿" }, null);
  if (it.slot === "stand") return `<div class="lim-stand-demo"><i class="lim-ped"></i>${ART.standDeco(id)}</div>`;
  return `<div class="lim-plate-demo lim-${id}"><span class="lim-c tl">${ART.nameCorner(id)}</span><span class="lim-c br">${ART.nameCorner(id)}</span><b>館主</b></div>`;
}
const itemCard = (id, extra) => {
  const it = limitedInfo(id);
  return h("div", { class: "sg-item k-" + it.kind }, h("span", { class: "sg-item-art", html: itemArt(id), "aria-hidden": "true" }),
    h("div", { class: "sg-item-body" }, h("b", null, it.name), h("span", { class: "sg-item-kind" }, it.kindName), extra || null));
};

// ---------- 馬上使用 ----------
// 帽子：到手作坊、這頂已經選好；展台裝飾、名牌框：換上再到展廳；材料：到抱枕工作台、材料選好
export function useNow(id, close) {
  const t = useTarget(id), it = limitedInfo(id);
  if (!t || !P) return;
  if (it.kind === "part") t.params.preset = Object.assign({}, P.wsPick, t.params.preset); // 手作坊的 preset 要整套（其他類照現在選的）
  if (close) close();
  document.querySelectorAll(".nb-layer").forEach(l => { if (l.nbClose) l.nbClose(); else l.remove(); }); // 照正常的方式關（只拿掉畫面的話，木框的鍵盤監聽會留著，之後的 Esc 都被它吃掉）
  document.body.classList.remove("nb-open");
  if (t.wear) { wearDeco(P, id); persist(); note(`換上了「${it.name}」。在展廳看得到；不想要可以在展廳拿下來。`, "good"); }
  else if (it.kind === "part") note(`「${it.name}」選好了：按「做」就戴著它做壹隻。`, "good");
  else if (it.kind === "mat") note(`材料換成「${it.name}」了（剩 ${stockOf(P, it.opt)} 份）：挑壹隻要印的，按「做」。`, "good");
  snd("click");
  go(t.room, t.params);
}
const useBtn = (id, close) => btn([SIGNIN_TEXT.useNow, " ", h("span", { "aria-hidden": "true" }, "→")], () => useNow(id, close), "primary small sg-use");

// 一行拿到的東西
function gainRow(g, close) {
  if (g.kind === "insp") return h("li", { class: "sg-gain" }, icon("sparkle"), h("span", null, `靈感 +${g.n}`));
  if (g.kind === "mood") return h("li", { class: "sg-gain" }, icon("heart"), h("span", null, `心情 +${g.n}`));
  const it = limitedInfo(g.id);
  const note2 = g.dup ? h("span", { class: "sg-item-note" }, `${SIGNIN_TEXT.dup} +${g.insp}`) : g.n ? h("span", { class: "sg-item-note" }, `×${g.n}（現在有 ${stockOf(P, it.opt)} 份）`) : h("span", { class: "sg-item-note" }, it.desc);
  return h("li", { class: "sg-gain item" }, itemCard(g.id, note2), g.dup ? null : useBtn(g.id, close));
}
const rewardText = r => [r.insp ? `靈感 +${r.insp}` : null, r.mood ? `心情 +${r.mood}` : null, r.mat ? `星光絨 ×${r.mat}` : null].filter(Boolean).join("、");

// ---------- 這一週的七格 ----------
function weekStrip(wp, today) {
  return h("ol", { class: "sg-week", "aria-label": `這週簽到了 ${wp.n} 天，共 7 天` }, wp.dates.map((d, i) => h("li", {
    class: "sg-wd" + (wp.signed[i] ? " on" : "") + (d === today ? " today" : "") + (d > today ? " future" : "") + (d < today && !wp.signed[i] ? " miss" : ""),
    title: `${dayLabel(d)}${wp.signed[i] ? "：簽到了" : d > today ? "：還沒到" : d === today ? "：今天" : "：沒簽到"}` },
    h("small", null, `週${WEEK_HEAD[i]}`), h("span", { class: "sg-wd-mark", html: wp.signed[i] ? ART.stamp("簽") : "" }))));
}
// 這週的特別項目那一塊
function weekPrize(wp, today, close) {
  if (!wp.item) return null;
  const missed = wp.dates.some((d, i) => d < today && !wp.signed[i]);
  const left = wp.signed.filter(x => !x).length;
  const status = wp.claimed ? (wp.claimed.dup ? `這週拿過了（已經有，換成了靈感）` : "這週拿到了！")
    : missed ? "這週錯過了幾天，下週壹 05:00 起每天簽到就拿得到。" : left === 0 ? "這週七天都簽到了！" : left === 1 && !wp.signed[wp.dates.indexOf(today)] ? "今天簽到就拿得到！" : `還要簽 ${left} 天（每天都要）`;
  const owned = wp.item.kind !== "mat" && ownsLimited(P, wp.item.id);
  return h("div", { class: "sg-prize" + (wp.claimed ? " got" : "") },
    h("p", { class: "sg-prize-h" }, h("b", null, `這週全簽到（${wp.n}／7）可以拿`), h("span", null, SIGNIN_TEXT.week)),
    itemCard(wp.item.id, h("span", { class: "sg-item-note" }, limitedInfo(wp.item.id).desc)),
    h("p", { class: "sg-prize-st" }, status, owned && !wp.claimed ? "（已經有了的話，換成靈感）" : ""),
    wp.claimed && !wp.claimed.dup ? useBtn(wp.item.id, close) : null);
}
// 七天一輪的那一排
function cycleTrack(k, done) {
  return h("ol", { class: "sg-cycle", "aria-label": `七天壹輪：今天是第 ${k} 天` }, [1, 2, 3, 4, 5, 6, 7].map(i => {
    const r = cycleReward(i);
    return h("li", { class: "sg-cy" + (i < k || (i === k && done) ? " done" : "") + (i === k ? " today" : "") + (i === 7 ? " big" : "") },
      h("small", null, `第 ${i} 天`), r.insp ? h("span", null, `靈感 +${r.insp}`) : null, r.mood ? h("span", null, `心情 +${r.mood}`) : null,
      i < k || (i === k && done) ? h("i", { class: "sg-cy-ok", html: ART.icon("check"), "aria-hidden": "true" }) : null);
  }));
}
// 節日那一塊（簽到卡、日曆共用）
function holidayBox(hol, today, o = {}) {
  if (!hol) return null;
  const quiet = !hol.reward;
  return h("div", { class: "sg-hol" + (quiet ? " quiet" : "") + (hol.look ? " look-" + hol.look : "") },
    hol.look ? h("span", { class: "sg-hol-ic", html: ART.holidayIcon(hol.look), "aria-hidden": "true" }) : null,
    h("div", { class: "sg-hol-body" },
      h("b", null, o.dateText || (o.isToday ? `今天是${holName(hol)}` : holName(hol))),
      h("p", null, hol.words),
      quiet ? h("p", { class: "sg-hol-r" }, "紀念日：館裡照常開放，不發節日的獎勵。")
        : h("p", { class: "sg-hol-r" }, `那天簽到多壹份：${rewardText(hol.reward)}`),
      o.art !== false && hol.art.length ? holidayArtRow(hol, today) : null));
}
// 節日那天畫廊的藝術品：看過的露出來，還沒看的蓋著（標題照樣寫）
function holidayArtRow(hol, today) {
  const on = holidaysOn(today).some(x => x.key === hol.key);
  return h("div", { class: "sg-hol-art" }, h("small", null, on ? "今天畫廊的節日特展：" : "節日那天畫廊的節日特展："),
    h("div", { class: "sg-hol-art-list" }, hol.art.map(a => {
      const seen = P && P.seen && P.seen[a.id];
      return h("figure", { class: "sg-art" + (seen ? "" : " covered") }, h("span", { class: `frame art-${a.art}`, html: seen ? ART.exhibit(a.art, { hol: a.look }) : "" }), h("figcaption", null, `《${a.title}》`));
    })),
    on && P ? btn(["去畫廊看 ", h("span", { "aria-hidden": "true" }, "→")], () => { document.querySelectorAll(".nb-layer").forEach(l => l.remove()); document.body.classList.remove("nb-open"); go("gallery"); }, "small sg-go-gallery") : null);
}

// ---------- 簽到卡 ----------
export function openSignin(o = {}) {
  if (!SAVE || !P) { note("先進館才能簽到。"); return; }
  const today = realTodayStr();
  const m = overlay("nb-sign", SIGNIN_TEXT.title, SIGNIN_TEXT.title, "calendar");
  let result = null;
  const draw = () => {
    const pv = signPreview(SAVE, P, today);
    const done = pv.already || !!result;
    const k = result ? result.k : pv.k, n = result ? result.n : pv.n;
    const wp = weekProgress(SAVE, today);
    const head = h("div", { class: "sg-head" },
      h("p", { class: "sg-date" }, dayLabel(today)),
      h("p", { class: "sg-count" }, pv.free ? SIGNIN_TEXT.freeMode : done ? `累計第 ${n} 次簽到 ✓` : `今天是累計第 ${n} 次`),
      pv.free ? null : h("p", { class: "sg-why" }, SIGNIN_TEXT.why));
    const signBtn = pv.free ? null : done ? null : btn([icon("check"), " ", SIGNIN_TEXT.sign], () => doSign(), "primary big sg-sign");
    const stamp = done && !pv.free ? h("div", { class: "sg-stamp" + (result && !motionOff() ? " pop" : ""), html: ART.stamp("簽"), "aria-hidden": "true" }) : null;
    const gains = result ? h("section", { class: "sg-result", "aria-live": "polite" }, h("h3", null, "拿到了"),
      [["day", "每日簽到"], ["holiday", result.holiday ? `節日：${holName(result.holiday)}` : "節日"], ["week", SIGNIN_TEXT.weekDone]].map(([why, title]) => {
        const list = result.gains.filter(g => g.why === why);
        return list.length ? h("div", { class: "sg-res-grp g-" + why }, h("p", { class: "sg-res-h" }, title), h("ul", { class: "sg-gains" }, list.map(g => gainRow(g, m.close)))) : null;
      })) : null;
    const today2 = !result && pv.already ? h("p", { class: "sg-today" }, `今天拿了：${rewardText(cycleReward(k)) || "—"}${pv.holiday && pv.holiday.reward ? `；節日多了 ${rewardText(pv.holiday.reward)}` : ""}。明天 05:00 以後再來。`) : null;
    m.surface.replaceChildren(h("div", { class: "sg-card" },
      stamp, head, holidayBox(pv.holiday, today, { isToday: true, art: false }), // 藝術品在日曆、畫廊看
      pv.free ? null : cycleTrack(k, done),
      signBtn, gains, today2,
      pv.free ? null : h("section", { class: "sg-weekbox" }, h("p", { class: "sg-week-h" }, h("b", null, `這週 ${wp.n}／7`), h("span", null, "週壹 05:00 換週")), weekStrip(wp, today), weekPrize(wp, today, m.close))));
    m.foot.replaceChildren(btn([icon("calendar"), " ", SIGNIN_TEXT.calendar], () => { m.close(); openCalendar(); }, "small sg-to-cal"), done || pv.free ? btn("收下了", () => m.close(), "small") : null);
  };
  const doSign = () => {
    const r = signIn(SAVE, P, today);
    if (!r.ok) { if (!r.already) { snd("error"); note(r.reason, "bad"); } draw(); return; }
    result = r;
    snd("stamp");
    if (r.weekly || r.holiday) setTimeout(() => snd("bell"), 420);
    persistNow(); updateStatus(); updateBoardBadges();
    draw();
    if (r.events && r.events.length) setTimeout(() => showEvents(r.events), 600);
    refreshLobbySign();
  };
  draw();
  snd("flip");
}

// ---------- 簽到日曆 ----------
// 一個月一頁：簽了的蓋章、今天框起來、節日標名字；點一天看那天（節日的活動、獎勵、藝術品）
export function openCalendar(o = {}) {
  if (!SAVE) return;
  const today = realTodayStr();
  let y = +today.slice(0, 4), mo = +today.slice(5, 7), sel = o.date || today;
  const minY = HOLIDAY_YEARS[0], maxY = HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1];
  const m = overlay("nb-cal", SIGNIN_TEXT.calendar, SIGNIN_TEXT.calendar, "calendar");
  const draw = () => {
    const S = signinState(SAVE), mon = signinMonth(SAVE, y, mo, today), wp = weekProgress(SAVE, today);
    const prev = mo === 1 ? [y - 1, 12] : [y, mo - 1], next = mo === 12 ? [y + 1, 1] : [y, mo + 1];
    const navBtn = (lab, ym, aria) => btn(lab, () => { [y, mo] = ym; draw(); }, "small ghost sg-cal-nav", { "aria-label": aria, disabled: ym[0] < minY || ym[0] > maxY ? true : null });
    const lc = P && !isFree(P) ? limitedCount(P) : null;
    const nh = nextHoliday(today);
    const summary = h("div", { class: "sg-sum" },
      h("div", { class: "sg-sum-c" }, h("small", null, "累計簽到"), h("b", null, `${S.count} 次`)),
      h("div", { class: "sg-sum-c" }, h("small", null, "這週"), h("b", null, `${wp.n}／7`), weekStrip(wp, today)),
      wp.item ? h("div", { class: "sg-sum-c prize" }, h("small", null, "這週全簽到拿"), itemCard(wp.item.id, h("span", { class: "sg-item-note" }, wp.claimed ? "這週拿到了" : `還差 ${7 - wp.n} 天`))) : null,
      lc ? h("div", { class: "sg-sum-c" }, h("small", null, "限定收藏"), h("b", null, `${lc.have}／${lc.total}`), h("span", { class: "sg-sum-n" }, SIGNIN_TEXT.limitedNote)) : null);
    const grid = h("div", { class: "sg-grid", role: "grid", "aria-label": `${y} 年 ${mo} 月` },
      WEEK_HEAD.map(w => h("span", { class: "sg-gh", role: "columnheader" }, w)),
      mon.cells.map(c => {
        const hol = c.hol[0], fun = funDaysOf(c.date); // fun：趣味節日（決定 0044），不換外觀、不發獎勵，只在格子角落標壹個小點
        const b = h("button", { type: "button", role: "gridcell", class: "sg-day" + (c.inMonth ? "" : " out") + (c.signed ? " on" : "") + (c.isToday ? " today" : "") + (c.future ? " future" : "") + (hol ? " hol" + (hol.look ? " look-" + hol.look : " quiet") : "") + (c.date === sel ? " sel" : ""),
          "aria-pressed": String(c.date === sel), "aria-label": `${dayLabel(c.date)}${c.isToday ? "，今天" : ""}${c.signed ? `，簽到了（第 ${c.n} 次）` : ""}${hol ? "，" + c.hol.map(holName).join("、") : ""}${fun.length ? "，趣味節日：" + fun.map(f => f.name).join("、") : ""}`,
          onClick: () => {
            sel = c.date; if (!c.inMonth) { y = +c.date.slice(0, 4); mo = +c.date.slice(5, 7); } draw();
            if (planPortrait()) { const det = m.surface.querySelector(".sg-detail"); if (det) det.scrollIntoView({ block: "start", behavior: motionOff() ? "auto" : "smooth" }); } // 手機：說明在日曆下面
          } },
          h("span", { class: "sg-dn" }, String(c.d)),
          c.signed ? h("span", { class: "sg-dm", html: ART.stamp("簽"), "aria-hidden": "true" }) : null,
          fun.length ? h("span", { class: "sg-df", title: fun.map(f => f.name).join("、"), "aria-hidden": "true" }, fun.length > 1 ? String(fun.length) : "趣") : null,
          hol ? h("span", { class: "sg-dh" }, hol.look ? h("i", { html: ART.holidayIcon(hol.look), "aria-hidden": "true" }) : null, h("span", null, hol.dayName)) : null);
        return b;
      }));
    // 點的那一天
    const hs = holidaysOn(sel), fs = funDaysOf(sel), x = S.days[sel];
    const detail = h("section", { class: "sg-detail", "aria-live": "polite" },
      h("h3", null, `${+sel.slice(0, 4)} 年 ${dayLabel(sel)}`, sel === today ? h("span", { class: "sg-tag" }, "今天") : null),
      h("p", { class: "sg-det-s" }, x ? `簽到了：累計第 ${x.n} 次（七天壹輪的第 ${x.k} 天）` : sel > today ? "還沒到。" : sel === today ? (canSign() ? "今天還沒簽到。" : SIGNIN_TEXT.freeMode) : "這天沒簽到。"),
      hs.length ? hs.map(hh => holidayBox(hh, today, {})) : fs.length ? null : h("p", { class: "sg-det-n" }, "這天沒有節日。"),
      fs.length ? funBox(fs) : null,
      sel === today && canSign() && !x ? btn([icon("check"), " ", SIGNIN_TEXT.sign], () => { m.close(); openSignin(); }, "primary sg-cal-sign") : null);
    const legend = h("p", { class: "sg-legend" }, h("span", { class: "lg on" }, "蓋章＝簽到了"), h("span", { class: "lg today" }, "框起來＝今天"), h("span", { class: "lg hol" }, "有字＝節日（點了看活動）"), h("span", { class: "lg fun" }, "趣＝趣味節日（只是好玩，沒有獎勵）"),
      nh ? h("span", { class: "lg next" }, nh.date === today ? `今天是${holName(nh.holiday)}` : `下壹個節日：${nh.holiday.name} ${md(nh.date)}（還有 ${daysBetween(today, nh.date)} 天）`) : null);
    m.surface.replaceChildren(summary, h("div", { class: "sg-cal" },
      h("div", { class: "sg-cal-main" },
        h("div", { class: "sg-cal-head" }, navBtn("‹", prev, "上個月"), h("b", null, `${y} 年 ${mo} 月`), navBtn("›", next, "下個月"),
          y !== +today.slice(0, 4) || mo !== +today.slice(5, 7) ? btn("回到這個月", () => { y = +today.slice(0, 4); mo = +today.slice(5, 7); sel = today; draw(); }, "small ghost") : null,
          h("span", { class: "sg-cal-n" }, `這個月簽了 ${mon.signedIn} 天`)),
        grid, legend),
      detail));
    m.foot.replaceChildren(canSign() && !signedOn(SAVE, today) ? btn([icon("check"), " 今天還沒簽到：", SIGNIN_TEXT.sign], () => { m.close(); openSignin(); }, "primary small") : null);
  };
  draw();
  snd("flip");
}

// ---------- 進館後自己跳一次（公佈欄先） ----------
let autoSignDay = null;
export function autoSignin(tries = 0) {
  if (!canSign() || !SAVE) return;
  if (window.__PM_NODOOR__) return; // 開發用的 #畫面：不要自己跳出來擋住
  const today = realTodayStr();
  if (!tries) refreshLobbySign(); // 換日了：大廳的簽到條先換成今天的
  if (signedOn(SAVE, today) || autoSignDay === today) return;
  if (!UI.boardAutoDone || busy()) { if (tries < 60) setTimeout(() => autoSignin(tries + 1), 1500); return; }
  if (UI.screen !== "lobby") return; // 已經走去別的房間了：不蓋上來，大廳的簽到條、選單上照樣看得到
  const firstDay = UI.autoSignFirst == null;
  if (firstDay) UI.autoSignFirst = today;
  if (UI.autoSignFirst === today && (UI.autoPopups || 0) >= 2) return; // 一次登入最多自動跳 2 個視窗（換日之後的那一次不算）
  autoSignDay = today;
  UI.autoPopups = (UI.autoPopups || 0) + 1;
  openSignin({ auto: true });
}

// ---------- 大廳：今天的簽到 ----------
function lobbySignin() {
  if (!P || !SAVE) return null;
  const today = realTodayStr(), hol = holidayOf(today);
  if (isFree(P)) return hol ? h("div", { class: "lobby-sign hol-only" }, holChip(hol)) : null;
  const pv = signPreview(SAVE, P, today);
  return h("section", { class: "lobby-sign" + (pv.already ? " done" : ""), "aria-label": "今天的簽到" },
    h("span", { class: "ls-tag", html: ART.stamp("簽"), "aria-hidden": "true" }),
    h("div", { class: "ls-body" },
      h("b", null, pv.already ? `今天簽到了（累計第 ${pv.n} 次）` : `今天還沒簽到（第 ${pv.n} 次：${rewardText(pv.reward)}）`),
      h("span", null, `這週 ${pv.week.n}／7`, pv.week.item ? `・全簽到拿「${limitedInfo(pv.week.item.id).name}」` : "", pv.week.claimed ? "（拿到了）" : "")),
    hol ? holChip(hol) : null,
    pv.already ? btn([icon("calendar"), " 簽到日曆"], () => openCalendar(), "small ghost ls-btn") : btn([icon("check"), " ", SIGNIN_TEXT.sign], () => openSignin(), "primary small ls-btn"));
}
// 大廳的簽到條換成現在的（換日、簽完）；不在大廳就不用
export function refreshLobbySign() {
  if (UI.screen !== "lobby") return;
  const old = document.querySelector(".lobby-sign");
  if (old) { const now = lobbySignin(); if (now) old.replaceWith(now); else old.remove(); }
  const oldF = document.querySelector(".lobby-fun"), nowF = funLine(); // 趣味節日的壹小行也跟著換日
  if (oldF) { if (nowF) oldF.replaceWith(nowF); else oldF.remove(); }
  else if (nowF) { const a = document.querySelector(".lobby-sign"); if (a) a.after(nowF); }
}
// 趣味節日（決定 0044）：大廳壹小行「今天是圓周率日：……」。好幾個就壹次顯示壹個，按鈕換下壹個；有呼應的房間在後面括號寫壹句
function funLine() {
  const list = funDaysOf(realTodayStr());
  if (!list.length) return null;
  let i = 0;
  const box = h("div", { class: "lobby-fun", "aria-label": "今天的趣味節日" });
  const draw = () => {
    const f = list[i];
    box.replaceChildren(
      h("p", { class: "lf-text", title: list.map(x => x.name).join("、") }, h("b", null, `今天是${f.name}：`), f.line, f.hint ? h("span", { class: "lf-hint" }, `（${f.hint}）`) : null),
      list.length > 1 ? btn(`下壹個（${i + 1}／${list.length}）`, () => { i = (i + 1) % list.length; draw(); }, "small ghost lf-next") : null);
  };
  draw();
  return box;
}
// 日曆上點壹天看到的趣味節日
function funBox(list) {
  return h("div", { class: "sg-fun" }, list.map(f => h("div", { class: "sg-fun-i" },
    h("b", null, `趣味節日：${f.name}`), h("p", null, f.line, f.hint ? h("span", { class: "lf-hint" }, `（${f.hint}）`) : null))),
    h("p", { class: "sg-fun-n" }, "趣味節日只是好玩：不換館裡的樣子，也沒有獎勵。"));
}
const holChip = hol => h("button", { type: "button", class: "ls-hol" + (hol.look ? " look-" + hol.look : " quiet"), title: hol.words, onClick: () => openCalendar() },
  hol.look ? h("i", { html: ART.holidayIcon(hol.look), "aria-hidden": "true" }) : null, `今天是${holName(hol)}`);

// ---------- 畫廊：節日特展（只有節日那天） ----------
function galleryHoliday() {
  if (!P || !P.day) return null;
  const hol = holidayOf(P.day.date);
  if (!hol || !hol.art.length) return null;
  const list = hol.art.filter(ex => exhibitOpen(P, ex));
  if (!list.length) return null;
  return h("section", { class: "hol-gallery" + (hol.look ? " look-" + hol.look : ""), "aria-label": `節日特展：${hol.name}` },
    h("div", { class: "hg-head" }, hol.look ? h("span", { class: "hg-ic", html: ART.holidayIcon(hol.look), "aria-hidden": "true" }) : null,
      h("div", null, h("h2", null, `節日特展：${holName(hol)}`), h("p", null, hol.words, h("small", null, "　只有今天（台灣時間 05:00 換日）；看了壹樣有靈感，照畫廊每天的上限。")))),
    h("div", { class: "corridor hg-row" }, list.map(ex => {
      const spec = sanSpecFor(P, ex), unseen = !P.seen[ex.id];
      const frame = h("div", { class: `frame art-${ex.art}` + (unseen ? " covered" : ""), html: ART.exhibit(ex.art, { hol: ex.look }) + (unseen ? '<div class="ex-cover" aria-hidden="true"><span>還沒看過</span></div>' : "") });
      const cap = h("div", { class: "ex-cap" }, ptNode(ex.title, "ex-title"),
        spec && !isFree(P) ? h("span", { class: "ex-san" }, `理智 ${sanShort(spec)}`) : null,
        unseen ? h("span", { class: "ex-new" }, "沒看過") : null,
        !isFree(P) ? exInspLine(ex) : null);
      const item = h("button", { type: "button", class: "exhibit hol-ex", "aria-label": ex.label + (unseen ? "（還沒看過，蓋著布）" : "") }, frame, cap);
      item.addEventListener("click", () => focusExhibit(ex));
      return item;
    })));
}

// ---------- 展廳：展台裝飾、館主名牌 ----------
const myName = () => (UI.net && NET.me && NET.me.nick) || "這間博物館"; // 館主＝帳號（登入的暱稱）
function hallAddon(root, room) {
  if (!P) return;
  const stand = wornDeco(P, "stand"), frame = wornDeco(P, "frame");
  if (stand) $$(".ped-slot", room).forEach(el => { const blk = el.querySelector(".ped-block"); el.classList.add("has-deco"); (blk || el).append(h("div", { class: "stand-deco", html: ART.standDeco(stand), "aria-hidden": "true" })); }); // 掛在展台的上緣
  const owned = LIMITED_ITEMS.filter(x => x.kind === "deco" && ownsLimited(P, x.id));
  if (!frame && !owned.length) return;
  const plate = h("div", { class: "hall-plate" + (frame ? " lim-" + frame : "") },
    frame ? h("span", { class: "lim-c tl", html: ART.nameCorner(frame), "aria-hidden": "true" }) : null,
    frame ? h("span", { class: "lim-c br", html: ART.nameCorner(frame), "aria-hidden": "true" }) : null,
    h("small", null, "館主"), h("b", null, myName()));
  const toggles = owned.map(x => {
    const it = limitedInfo(x.id), on = wornDeco(P, x.slot) === x.id;
    return btn(on ? `拿下${it.name}` : `換上${it.name}`, () => { wearDeco(P, on ? null : x.id, x.slot); persist(); snd("click"); rerender(); }, "small ghost");
  });
  const bar = h("div", { class: "hall-limited" }, plate, toggles.length ? h("div", { class: "hall-lim-t" }, h("small", null, "簽到拿的裝飾（只是好看，不影響評分）："), toggles) : null);
  const head = root.querySelector(".room-head");
  if (head && head.nextSibling) root.insertBefore(bar, head.nextSibling); else root.append(bar);
}

ADDONS.lobby = () => { const f = document.createDocumentFragment(); [lobbySignin(), funLine()].forEach(x => { if (x) f.append(x); }); return f; };
ADDONS.gallery = galleryHoliday;
ADDONS.hall = hallAddon;
ADDONS.frameClass = () => { const f = P && wornDeco(P, "frame"); return f ? " lim-" + f : ""; };
ADDONS.calBadge = () => (canSign() && SAVE && !signedOn(SAVE, realTodayStr()) ? "還沒簽到" : "");
PANELS.signin = openSignin;
PANELS.calendar = openCalendar;
PANELS.autoSignin = autoSignin;
