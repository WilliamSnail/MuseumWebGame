// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，見 docs/規劃/介面整合規劃.md）
//  館友證是封面：暱稱、稱號、入館日、籌碼和週章、紀錄，最下面是帳號的設定（登入了才有，原本的「我的帳號」）。
//  11-21 重新設計（翊文選方向 A）：左邊證件常駐（證件、紀錄、帳號），右邊冊子 5 個頁籤：總覽、佩佩與書、賭場、參觀者、裝飾。手機證件縮成壹條，紀錄和帳號放進「總覽」。
//  賭場頁用伺服器的只讀摘要 casino act pass（shared/casino/pass_view.js）：成就、本週收藏、財產、換小獎這週次數；每塊有「前往」帶到賭場的對應頁。
//  只讀現有的資料（shared/social/pass.js 的 passView），每壹頁有「前往」帶到原本的房間；原本的房間都留著。
//  賭場全部的紀念品、賭場成就在伺服器：這裡只列掛在展廳的和戴著的稱號，其他連到賭場。
//  入口：導覽列「今天」右邊的「館友證」、右上角選單。ui_core 不能 import 這個檔：這裡把自己登記進 PANELS。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../../shared/casino/core.js";
import { fromKey, isFree, num, todayStr } from "../../../shared/core/logic.js";
import { PASS_TABS, PASS_TIPS, avatarChoices, passAvatar, passView, setPassAvatar } from "../../../shared/social/pass.js";
import { signinState } from "../../../shared/social/signin.js";
import { NET } from "../core/net_firebase.js";
import { ART } from "../core/art.js";
import { P, PANELS, SAVE, UI, btn, cicon, frogHTML, gearArt, go, h, icon, navTo, persist, rdot, rerender, snd, titleTag } from "../core/ui_core.js";
import { tipOn } from "../core/ui_tip.js";
import { overlay } from "./ui_board.js";
import { accountRows } from "./ui_login.js";
import { whoOf } from "../rooms/ui_screens3.js";
import { itemArt, useNow } from "./ui_signin.js";
import { casePane } from "./ui_story.js";

const sec = (title, ...kids) => h("section", { class: "sp-sec" }, title ? h("h3", null, title) : null, ...kids);
const secT = (title, tip, ...kids) => { const el = sec(title, ...kids); const t = el.querySelector("h3"); if (t && PASS_TIPS[tip]) tipOn(t, PASS_TIPS[tip]); return el; }; // 帶說明牌的區塊（滑鼠移到標題、手機長按）
const SWAP_NAME = { insp: "壹點靈感", canvas: "壹張舊畫布", foil: "壹片金箔" };
const stat = (label, value) => h("div", { class: "ps-stat" }, h("b", null, value), h("span", null, label));
const bar = (a, b) => h("div", { class: "ps-bar", role: "img", "aria-label": `${a}／${b}` }, h("i", { style: { width: Math.round((b ? Math.min(1, a / b) : 0) * 100) + "%" } }));

export function openPass(o = {}) {
  if (!P) return;
  const m = overlay("nb-story nb-pass", "館友證", "館友證和典藏冊", "user");
  let tab = PASS_TABS.some(t => t[0] === o.tab) ? o.tab : "card";
  const leave = fn => () => { m.close(); fn(); };
  const goBtn = (label, fn, ic) => btn([ic ? (ic.endsWith(":c") ? cicon(ic.slice(0, -2)) : icon(ic)) : null, ic ? " " : null, label, " ", h("span", { "aria-hidden": "true" }, "→")], leave(fn), "small");
  const nick = () => (UI.net && NET.me && NET.me.nick) || "館友";

  // 證件（左邊常駐；手機縮成壹條）
  const certCard = v => {
    const c = v.card;
    return h("div", { class: "ps-card" },
      h("div", { class: "ps-card-top" }, h("span", null, "PEPE MUSEUM"), h("span", null, "館友證")),
      h("div", { class: "ps-card-main" },
        h("div", { class: "ps-photo", "aria-hidden": "true", html: c.photo ? frogHTML(fromKey(c.photo)) : "" }, c.photo ? null : icon("user")),
        h("div", { class: "ps-id" },
          h("h3", null, nick(), c.title ? titleTag(c.title, "ps-ttl") : null),
          h("dl", null,
            h("dt", null, "入館日"), h("dd", null, c.created),
            h("dt", null, "今天是"), h("dd", null, `第 ${c.dayNo} 天`),
            v.visitor ? [h("dt", null, "參觀者"), h("dd", null, `${v.visitor.name || `第 ${v.visitor.n} 位`}・${v.visitor.jobName}`)] : null,
            typeof UI.chips === "number" && UI.net ? [h("dt", null, "籌碼"), h("dd", null, casNum(UI.chips))] : null,
            c.stamps !== null ? [h("dt", null, "週章"), h("dd", null, `${c.stamps} 枚`)] : null))),
      h("div", { class: "ps-card-foot" }, v.free ? "自由模式" : `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`),
      h("div", { class: "ps-card-act" }, btn([icon("user"), h("span", { class: "ps-av-t" }, " 換頭像")], () => pickAvatar(), "small ps-av-btn")));
  };
  const recordsSec = v => sec("紀錄", h("div", { class: "ps-stats" }, v.records.map(([l, x]) => stat(l, x))));
  const accountSec = () => UI.net ? sec("帳號", accountRows(draw, m.close)) : sec("帳號", h("p", { class: "sp-note" }, "現在沒有登入：存檔只放在這個瀏覽器。"));

  // 賭場的摘要（伺服器的只讀 casino act pass；進到有用的頁籤才問，回來再畫）
  let cas = null, casBusy = false;
  const loadCas = v => {
    if (cas || casBusy || v.free || !UI.net || !NET.loggedIn) return;
    casBusy = true;
    NET.call("casino", { act: "pass" }).then(r => { cas = r && r.ok ? r : { failed: true }; }).catch(() => { cas = { failed: true }; }).then(() => { casBusy = false; if (m.layer.isConnected) draw(); });
  };
  // 每個區塊壹行摘要＋「前往」。tab：點了換到冊子的哪壹頁
  const tile = (id, title, big, line, tabId) => {
    const el = h("button", { type: "button", class: "ps-tile", onClick: () => { tab = tabId; draw(); snd("flip"); } },
      h("b", { class: "ps-tile-t" }, title, h("span", { class: "ps-go", "aria-hidden": "true" }, "前往 →")), h("span", { class: "ps-tile-n" }, big), line ? h("small", null, line) : null);
    return tipOn(el, PASS_TIPS[id]);
  };
  const casOff = v => v.free || !UI.net || !NET.loggedIn; // 自由模式、沒登入：賭場在伺服器，看不到
  const casLine = () => cas && cas.ok ? `成就 ${cas.ach.have}／${cas.ach.total}${cas.wk ? `・本週收藏 ${cas.wk.got}／${cas.wk.total}` : ""}` : cas ? "現在讀不到" : "讀取中……";
  const overviewPane = v => {
    loadCas(v);
    const x = v.visitor;
    return [
      h("div", { class: "ps-tiles" },
        tile("pepe", "佩佩與書", v.free ? "自由模式" : `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`, `圖書館的書 ${v.books.origin.text.replace(/^(✓ )?讀過 /, "")}・徽章 ${v.ach.have}／${v.ach.total}`, "pepe"),
        tile("casino", "賭場", casOff(v) ? (v.free ? "自由模式沒有" : "要登入") : cas && cas.ok ? `籌碼 ${casNum(cas.chips)}` : "…", casOff(v) ? (v.free ? "" : "賭場在伺服器上，登入才看得到") : casLine(), "casino"),
        tile("visitor", "參觀者", x ? `${x.name || `第 ${x.n} 位`}・${x.jobName}` : "還沒選職業", x ? `裝備 ${x.gear.length}／${x.gearMax}` : "", "visitor"),
        tile("deco", "裝飾", `${v.deco.have}／${v.deco.total}`, "每日簽到和兌換所拿得到", "deco")),
      h("div", { class: "ps-narrow" }, recordsSec(v), accountSec())]; // 手機：左邊的證件縮成壹條，紀錄和帳號放這裡
  };

  // 現在這位參觀者（翊文 11-10：「把館友證補齊」）：館長室名片上有的這裡都看得到；要改（脫裝備、退休）還是去館長室
  const visitorPane = v => {
    const x = v.visitor;
    if (!x) return [h("p", { class: "nb-empty" }, v.free ? "自由模式沒有職業，也不擲骰。" : "還沒選職業。到館長室選。"), v.free ? null : h("div", { class: "sp-go" }, goBtn("館長室", () => go("office"), "info"))];
    return [
      sec(null, h("div", { class: "pv-head" },
        h("div", { class: "pv-badge", html: ART.jobBadge(x.job), "aria-hidden": "true" }),
        h("div", { class: "pv-who" }, h("b", null, `${whoOf(x.n, x.name)}・${x.jobName}`), x.desc ? h("span", null, x.desc) : null, x.motto ? h("i", null, `「${x.motto}」`) : null)),
        x.traits.length ? h("div", { class: "pv-traits" }, x.traits.map(t => h("span", { class: "cand-trait " + t.kind }, h("b", null, `${t.kind === "perk" ? "小優點" : "小缺點"}・${t.name}`), h("span", null, t.desc)))) : null),
      sec("現在的狀態", h("div", { class: "ps-stats" }, x.stats.map(([l, n]) => stat(l, n)))),
      sec("技能", h("div", { class: "pv-skills" }, x.skills.map(k => h("div", { class: "pv-skill" + (k.main ? " main" : "") },
        h("span", null, k.s, k.main ? "（拿手）" : ""), h("span", { class: "ps-bar", "aria-hidden": "true" }, h("i", { style: { width: k.v + "%" } })), h("b", null, String(k.v)), h("span", { class: "pv-tick", title: "今天用成功過，明天會擲成長" }, k.tick ? "✓" : ""))))),
      sec(`裝備　${x.gear.length}／${x.gearMax}`, x.gear.length
        ? h("ul", { class: "pv-gear" }, x.gear.map(g => h("li", null, gearArt(g.id), h("span", null, h("b", null, g.name), h("small", null, g.desc)))))
        : h("p", { class: "sp-note" }, "還沒有穿東西。用週章到兌換所換。"),
        h("div", { class: "sp-go" }, PANELS.shop ? goBtn("兌換所", () => PANELS.shop(), "shop:c") : null)),
      x.quirks.length ? sec("怪癖", h("ul", { class: "pv-quirks" }, x.quirks.map(q => h("li", null, icon("eye"), h("b", null, q.name), h("small", null, q.type === "mania" ? "狂熱" : "恐懼症")))),
        h("p", { class: "sp-note" }, "怎麼治好、還剩多久，寫在館長室的名片上。")) : null,
      h("div", { class: "sp-go pv-go" }, goBtn("館長室的名片", () => go("office"), "info"))];
  };

  const pepePane = v => {
    const p = v.pepe;
    return [
      sec("圖鑑", h("p", { class: "ps-big" }, `${num(p.have)}／${num(p.total)}`), bar(p.have, p.total),
        h("div", { class: "ps-rar" }, p.byRarity.map(x => h("span", { class: "ps-rar-i" }, rdot(x.r), ` ${x.r} ${x.n}`))),
        h("div", { class: "sp-go" }, goBtn("圖鑑室", () => go("codex"), "codex"), goBtn("展廳", () => navTo("hall"), "hall"))),
      p.recent.length ? sec("最近收進來的", h("div", { class: "ps-recent" }, p.recent.map(k => h("span", { class: "ps-thumb", html: frogHTML(fromKey(k)), "aria-hidden": "true" })))) : null,
      sec("其他的收藏", h("div", { class: "ps-stats" },
        stat("融合配方", `${p.recipes[0]}／${p.recipes[1]}`), stat("失敗作", `${p.failed} 種`), stat("修好的", `${p.repaired} 種`),
        stat("抱枕", p.pillow.text.replace(/^(✓ )?抱枕 /, "")), stat("展台", p.hall.text.replace(/^(✓ )?展台 /, ""))),
        h("div", { class: "sp-go" }, goBtn("配方", () => go("codex", { tab: "recipes" })), goBtn("融合室", () => navTo("fusion")), goBtn("抱枕工作台", () => navTo("pillow"))))];
  };

  const booksPane = v => {
    const b = v.books;
    return [
      sec("書", h("div", { class: "ps-stats" },
        stat("圖書館的書", b.origin.text.replace(/^(✓ )?讀過 /, "")),
        b.week !== null ? stat("每週的書", `讀過 ${b.week} 本`) : null,
        stat("看懂的事", `${b.understood[0]}／${b.understood[1]}`)),
        h("p", { class: "sp-note" }, "《看懂的事》放在圖書館書架的「館藏」那壹頁，最右邊。"),
        h("div", { class: "sp-go" }, goBtn("圖書館的書架", () => go("origin"), "book"), !v.free ? goBtn("每週的書", () => go("origin", { tab: "weekly" })) : null)),
      v.free ? null : h("h3", { class: "ps-h" }, "疑點簿"),
      v.free ? null : casePane()];
  };

  // 賭場：成就、本週收藏、財產、換小獎（資料是伺服器的摘要）。每塊「前往」帶到賭場的對應頁
  const casGo = (label, t) => (PANELS.casino && UI.net ? goBtn(label, () => PANELS.casino({ tab: t }), "dice") : null);
  const casinoPane = v => {
    if (v.free) return h("p", { class: "nb-empty" }, "紀念品和賭場成就是 Hamachi 賭場的東西，自由模式沒有。");
    if (casOff(v)) return h("p", { class: "nb-empty" }, "賭場在伺服器上，登入才看得到成就和紀念品。");
    loadCas(v);
    if (!cas) return h("p", { class: "nb-empty" }, "讀取賭場的紀錄……");
    if (!cas.ok) return [h("p", { class: "nb-empty" }, "現在讀不到賭場的紀錄。"), h("div", { class: "sp-go" }, casGo("去賭場", "table"))];
    if (!cas.entered) return [h("p", { class: "nb-empty" }, "還沒進過賭場。進去走壹趟，成就和紀念品就會出現在這裡。"), h("div", { class: "sp-go" }, casGo("去賭場", "table"))];
    const A = cas.ach, Pp = cas.props, S = cas.swap, W = cas.wk, chip = (t, cls) => h("span", { class: "ps-chip" + (cls ? " " + cls : "") }, t);
    return [
      secT(`成就　${A.have}／${A.total}`, "ach", bar(A.have, A.total),
        A.extra ? h("p", { class: "sp-note" }, `另外還有 ${A.extra} 個（每週收藏集滿、以前 Discord 帶來的）。`) : null,
        A.recent.length ? h("div", { class: "ps-chips" }, A.recent.map(a => chip(a.name))) : h("p", { class: "sp-note" }, "還沒有成就。在賭場打牌、吃東西就會拿到。"),
        h("p", { class: "sp-note" }, A.title ? ["現在戴著的稱號：", titleTag(A.title.name, "ps-ttl")] : "還沒有戴稱號。在賭場挑壹個成就當稱號，展廳和館友名單都看得到。"),
        h("div", { class: "sp-go" }, casGo("賭場的成就", "ach"), PANELS.rank ? goBtn("本週榜單", () => PANELS.rank(), "star") : null)),
      W ? secT(`本週收藏　${W.got}／${W.total}`, "week", bar(W.got, W.total), h("p", { class: "sp-note" }, W.claimed ? "集滿了，週章領過了。" : W.done ? "集滿了！到賭場領週章、讀集滿的故事。" : `還差 ${W.total - W.got} 件集滿。`), h("div", { class: "sp-go" }, casGo("本週收藏", "week"))) : null,
      secT(`財產（紀念品）　${Pp.have} 種・${Pp.copies} 件`, "props", h("p", { class: "sp-note" }, `掛在展廳 ${Pp.hung}／${Pp.hungMax} 件，來參觀的館友看得到。`),
        Pp.recent.length ? h("div", { class: "ps-chips" }, Pp.recent.map(p => chip(p.name + (p.n > 1 ? ` ×${p.n}` : ""), p.hung ? "hung" : ""))) : h("p", { class: "sp-note" }, "還沒有財產。到餐車買壹份東西，就是第壹件紀念品。"),
        h("div", { class: "sp-go" }, casGo("賭場的財產", "props"), goBtn("展廳", () => navTo("hall"), "hall"))),
      secT(`換小獎　這週換了 ${S.used} 次`, "swap", h("div", { class: "ps-stats" }, S.rows.map(r => stat(SWAP_NAME[r.id] || r.id, `還剩 ${r.left}／${r.perWeek}`))),
        h("p", { class: "sp-note" }, "籌碼換壹點點小東西，每週有上限（週壹 05:00 重算）。換到的東西直接進背包，沒有留紀錄。"),
        h("div", { class: "sp-go" }, casGo("去換小獎", "swap")))];
  };
  // 圖鑑室的徽章（原本的「成就」頁）
  const badgesSec = v => { const a = v.ach; return secT(`徽章　${a.have}／${a.total}`, "badge", bar(a.have, a.total),
    h("div", { class: "ps-badges" }, a.list.map(b => h("span", { class: "ps-badge" + (b.got ? " got" : ""), title: b.got ? `拿到了・${b.got}` : "還沒拿到" }, icon(b.got ? "star" : "lock"), b.name))),
    h("div", { class: "sp-go" }, goBtn("圖鑑室的徽章", () => go("codex", { tab: "badges" }), "star"))); };

  const decoPane = v => {
    const d = v.deco;
    return [
      sec(`限定的收藏　${d.have}／${d.total}`,
        h("div", { class: "ps-items" }, d.items.map(it => h("div", { class: "sg-item k-" + it.kind + (it.own ? "" : " ps-miss") },
          h("span", { class: "sg-item-art", html: it.own ? itemArt(it.id) : "", "aria-hidden": "true" }, it.own ? null : icon("lock")),
          h("div", { class: "sg-item-body" }, h("b", null, it.own ? it.name : "？？？"), h("span", { class: "sg-item-kind" }, it.kindName + (it.worn ? "・用著" : "")),
            it.own && !v.free ? btn("拿去用", () => useNow(it.id, m.close), "small") : null)))),
        h("p", { class: "sp-note" }, "這些只有每日簽到和兌換所拿得到。"),
        h("div", { class: "sp-go" }, PANELS.calendar && !v.free ? goBtn("簽到日曆", () => PANELS.calendar(), "calendar") : null, PANELS.shop && !v.free ? goBtn("兌換所", () => PANELS.shop(), "shop:c") : null))];
  };

  // 換頭像（11-13）：小視窗，列出收藏過的佩佩，點壹隻就設成頭像；「不用頭像」清掉。小視窗掛在這個框上，框關了它也跟著沒了
  function pickAvatar() {
    const layer = m.surface.closest(".nb-layer");
    if (!layer || layer.querySelector(".ps-pick")) return;
    const list = avatarChoices(P), cur = passAvatar(P);
    const choose = k => { if (!setPassAvatar(P, k)) return; persist(); pop.remove(); draw(); snd("flip"); if (UI.screen === "lobby") rerender(); };
    const pop = h("div", { class: "ps-pick", role: "dialog", "aria-modal": "true", "aria-label": "換頭像", onClick: e => { if (e.target === pop) pop.remove(); } },
      h("div", { class: "ps-pick-box" },
        h("h3", null, "挑壹隻當頭像"),
        list.length
          ? h("div", { class: "ps-pick-grid" }, list.map(k => h("button", { type: "button", class: "ps-pick-i" + (k === cur ? " on" : ""), "aria-pressed": String(k === cur), title: k.split("|").join("・"), onClick: () => choose(k), html: frogHTML(fromKey(k)) })))
          : h("p", { class: "sp-note" }, "還沒有收藏的佩佩。去手作坊捏壹隻，就能拿來當頭像。"),
        h("div", { class: "ps-pick-foot" }, btn("不用頭像", () => choose(""), "small"), btn("關掉", () => pop.remove(), "small primary"))));
    layer.append(pop);
    const first = pop.querySelector(".ps-pick-i.on") || pop.querySelector(".ps-pick-i") || pop.querySelector(".btn");
    first && first.focus();
  }
  const PANES = { card: overviewPane, pepe: v => [...pepePane(v), badgesSec(v), ...booksPane(v)], casino: casinoPane, visitor: visitorPane, deco: decoPane };
  function draw() {
    const v = passView(P, { today: todayStr(), signins: SAVE && !isFree(P) ? signinState(SAVE).count : undefined });
    const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": "典藏冊" }, PASS_TABS.map(([id, name]) => {
      const b = h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "nb-tab" + (id === tab ? " on" : "") }, name);
      tipOn(b, PASS_TIPS[id]); b.addEventListener("click", () => { tab = id; draw(); snd("flip"); }); // 先接說明牌、再接點擊（長按顯示說明那壹下不算點擊）
      return b;
    }));
    const keepY = (m.surface.querySelector(".ps-body") || {}).scrollTop || 0;
    m.surface.replaceChildren(h("div", { class: "ps-layout" },
      h("aside", { class: "ps-side", "aria-label": "館友證" }, certCard(v), h("div", { class: "ps-side-more" }, recordsSec(v), accountSec())),
      h("div", { class: "ps-right" }, tabs, h("div", { class: "sp-body ps-body ps-pane-" + tab }, PANES[tab](v)))));
    const body = m.surface.querySelector(".ps-body"); if (body) body.scrollTop = keepY;
  }
  draw();
  snd("flip");
}

PANELS.pass = openPass;
