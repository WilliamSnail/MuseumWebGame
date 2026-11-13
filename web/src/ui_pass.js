// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，見 docs/介面整合規劃.md）
//  館友證是封面：暱稱、稱號、入館日、籌碼和週章、紀錄，最下面是帳號的設定（登入了才有，原本的「我的帳號」）。
//  翻開是典藏冊，用頁籤分：佩佩、書和看懂的事、紀念品、裝飾、成就。
//  只讀現有的資料（shared/pass.js 的 passView），每壹頁有「前往」帶到原本的房間；原本的房間都留著。
//  賭場全部的紀念品、賭場成就在伺服器：這裡只列掛在展廳的和戴著的稱號，其他連到賭場。
//  入口：導覽列「今天」右邊的「館友證」、右上角選單。ui_core 不能 import 這個檔：這裡把自己登記進 PANELS。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { casNum } from "../../shared/casino.js";
import { fromKey, isFree, num, todayStr } from "../../shared/logic.js";
import { PASS_TABS, avatarChoices, passAvatar, passView, setPassAvatar } from "../../shared/pass.js";
import { signinState } from "../../shared/signin.js";
import { NET } from "./net_firebase.js";
import { ART } from "./art.js";
import { P, PANELS, SAVE, UI, btn, cicon, frogHTML, gearArt, go, h, icon, navTo, persist, rdot, rerender, snd, titleTag } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { accountRows } from "./ui_login.js";
import { whoOf } from "./ui_screens3.js";
import { itemArt, useNow } from "./ui_signin.js";
import { casePane } from "./ui_story.js";

const sec = (title, ...kids) => h("section", { class: "sp-sec" }, title ? h("h3", null, title) : null, ...kids);
const stat = (label, value) => h("div", { class: "ps-stat" }, h("b", null, value), h("span", null, label));
const bar = (a, b) => h("div", { class: "ps-bar", role: "img", "aria-label": `${a}／${b}` }, h("i", { style: { width: Math.round((b ? Math.min(1, a / b) : 0) * 100) + "%" } }));

export function openPass(o = {}) {
  if (!P) return;
  const m = overlay("nb-story nb-pass", "館友證", "館友證和典藏冊", "user");
  let tab = PASS_TABS.some(t => t[0] === o.tab) ? o.tab : "card";
  const leave = fn => () => { m.close(); fn(); };
  const goBtn = (label, fn, ic) => btn([ic ? (ic.endsWith(":c") ? cicon(ic.slice(0, -2)) : icon(ic)) : null, ic ? " " : null, label, " ", h("span", { "aria-hidden": "true" }, "→")], leave(fn), "small");
  const nick = () => (UI.net && NET.me && NET.me.nick) || "館友";

  const cardPane = v => {
    const c = v.card;
    const card = h("div", { class: "ps-card" },
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
      h("div", { class: "ps-card-foot" }, v.free ? "自由模式" : `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`));
    return [card,
      h("div", { class: "ps-open" }, btn([icon("user"), " 換頭像"], () => pickAvatar(), "ps-av-btn"), btn(["翻開典藏冊 ", h("span", { "aria-hidden": "true" }, "→")], () => { tab = "pepe"; draw(); }, "primary")),
      sec("紀錄", h("div", { class: "ps-stats" }, v.records.map(([l, x]) => stat(l, x)))),
      UI.net ? sec("帳號", accountRows(draw, m.close)) : sec("帳號", h("p", { class: "sp-note" }, "現在沒有登入：存檔只放在這個瀏覽器。"))];
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

  const souvenirPane = v => {
    if (v.free) return h("p", { class: "nb-empty" }, "紀念品是 Hamachi 賭場的東西，自由模式沒有。");
    return [
      sec("掛在展廳的紀念品", v.souvenirs.length
        ? h("ul", { class: "ps-list" }, v.souvenirs.map(s => h("li", null, icon("gift"), h("span", null, h("b", null, s.name), s.desc ? h("small", null, s.desc) : null))))
        : h("p", { class: "sp-note" }, "展廳還沒有掛紀念品。"),
        h("p", { class: "sp-note" }, "全部的紀念品收在賭場的道具那壹頁，在那裡挑要掛哪幾件。"),
        h("div", { class: "sp-go" }, PANELS.casino && UI.net ? goBtn("賭場的道具", () => PANELS.casino({ tab: "props" }), "dice") : null, goBtn("展廳", () => navTo("hall"), "hall")))];
  };

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

  const achPane = v => {
    const a = v.ach;
    return [
      sec(`徽章　${a.have}／${a.total}`, bar(a.have, a.total),
        h("div", { class: "ps-badges" }, a.list.map(b => h("span", { class: "ps-badge" + (b.got ? " got" : ""), title: b.got ? `拿到了・${b.got}` : "還沒拿到" }, icon(b.got ? "star" : "lock"), b.name))),
        h("div", { class: "sp-go" }, goBtn("圖鑑室的徽章", () => go("codex", { tab: "badges" }), "star"))),
      v.free ? null : sec("稱號", v.card.title ? h("p", null, "現在戴著：", titleTag(v.card.title, "ps-ttl")) : h("p", { class: "sp-note" }, "還沒有戴稱號。"),
        h("p", { class: "sp-note" }, "稱號是賭場的成就。在賭場的成就那壹頁挑要戴哪壹個。"),
        h("div", { class: "sp-go" }, PANELS.casino && UI.net ? goBtn("賭場的成就", () => PANELS.casino({ tab: "ach" }), "dice") : null, PANELS.rank ? goBtn("本週榜單", () => PANELS.rank(), "star") : null))];
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
  const PANES = { card: cardPane, visitor: visitorPane, pepe: pepePane, books: booksPane, souvenir: souvenirPane, deco: decoPane, ach: achPane };
  function draw() {
    const v = passView(P, { today: todayStr(), signins: SAVE && !isFree(P) ? signinState(SAVE).count : undefined });
    const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": "典藏冊" }, PASS_TABS.map(([id, name]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "nb-tab" + (id === tab ? " on" : ""), onClick: () => { tab = id; draw(); snd("flip"); } }, name)));
    m.surface.replaceChildren(tabs, h("div", { class: "sp-body ps-body ps-" + tab }, PANES[tab](v)));
  }
  draw();
  snd("flip");
}

PANELS.pass = openPass;
