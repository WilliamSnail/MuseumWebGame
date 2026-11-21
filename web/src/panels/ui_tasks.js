// ================================================================
//  每日任務的畫面零件（11-20，美術統籌；決定 0145 交代人、0146 活躍積分）
//  任務卡：種類圖示、交代人（頭像＋壹句話，做完換成回話）、積分、進度、獎勵、去哪裡做。
//  積分板：今天 N／120 的槽、這週 N／500 的槽（五個里程碑釘在槽上：還沒到暗、到了亮可以領、領過打勾）、領獎的小儀式。
//  交代人的頭像先用剪影＋顏色頂著；正式的圖放 web/public/tasks/giver-<id>.webp，再把 id 加進 GIVER_ART 就會換上（不用改別的）。
// ================================================================
import { giverName, rewardText } from "../../../shared/story/core.js";
import { btn, h, icon, snd } from "../core/ui_core.js";

// 種類 → 圖示（art.js 已有的名字）
export const TASK_ICON = { make: "palette", deliver: "commission", fuse: "fusion", pillow: "pillow", hug: "heart", view: "gallery", show: "gallery", read: "book", cellar: "stairs", spot: "key",
  casino: "cards", bank: "bank", food: "food", visit: "users", gift: "gift", stockLook: "magnifier", lesson: "notebook", sign: "stamp", board: "scroll", withNpc: "stairs",
  readWeek: "book", dailyAll: "star", showDays: "gallery", ending: "book" };
// 去哪裡做：按鈕上寫地點（11-20，翊文：按了直接跳房間，看起來像按錯）
const PLACE = { workshop: "手作坊", commission: "委託櫃台", fusion: "融合室", pillow: "抱枕工作台", gallery: "畫廊", origin: "圖書館", cellar: "地下收藏庫", casino: "賭場", bank: "銀行", friends: "館友名單", signin: "簽到", board: "公佈欄" };
export const placeName = w => (w && (PLACE[w.room] || PLACE[w.panel])) || "";
// 交代人在哪裡（照 content/story/帳本.json taskGivers.list 的 where，帳本不打包進網頁，這裡抄壹份；帳本改了這裡要跟著改）
export const GIVER_WHERE = { yuga: "賭場", hall: "餐車", postman: "館門口的信箱", clerk: "任務板、銀行", scale: "夜市、銀行", number: "B1 小門旁" };
// 交代人：剪影的顏色（底色、剪影色）；有正式圖的 id 放進 GIVER_ART
const GIVER_TONE = { yuga: ["#2F4A3A", "#BFE6C8"], hall: ["#4A3322", "#E6C879"], postman: ["#2F3F55", "#C9D8EE"], clerk: ["#4F3A2A", "#F3DFA6"], scale: ["#3E3A2A", "#E7D28A"], number: ["#2E2E34", "#D9D9E6"] };
export const GIVER_ART = new Set(["yuga"]); // yuga：玩家 Yuga 自己畫的 Yuga Bot 頭像（決定 0147）
const BUST = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="18" r="9" fill="currentColor"/><path d="M6 46c1-11 8-16 18-16s17 5 18 16z" fill="currentColor"/></svg>`;
export function giverAv(id, o = {}) {
  const tone = GIVER_TONE[id] || GIVER_TONE.hall;
  const el = h("span", { class: "tkc-av" + (o.small ? " small" : "") + (id === "yuga" ? " online" : ""), style: `--bg:${tone[0]};--fg:${tone[1]}`, role: "img", "aria-label": giverName(id) });
  if (GIVER_ART.has(id)) el.append(h("img", { src: `/tasks/giver-${id}.webp`, alt: "", loading: "lazy" }));
  else el.insertAdjacentHTML("beforeend", BUST);
  return el;
}

// 壹張任務卡。o：{ t, text, kindIcon, pts, n, tgt, reward, state: "todo"|"done"|"claimed", where（能去的話）, onGo, onClaim, past, words }
export function taskCard(o) {
  const t = o.t, done = o.state !== "todo", claimed = o.state === "claimed", giver = t.giver && t.says;
  const pct = Math.min(100, Math.round((o.tgt ? o.n / o.tgt : 0) * 100));
  const act = claimed ? h("span", { class: "tkc-stamp" }, icon("check"), h("span", null, "領過了"))
    : done ? btn("領獎勵", o.onClaim, "primary small tkc-claim")
      : o.where && !o.past ? btn([placeName(o.where) ? "去" + placeName(o.where) : "前往", " ", h("span", { "aria-hidden": "true" }, "→")], o.onGo, "small tkc-go") : null;
  return h("li", { class: "tkc-card" + (done ? " done" : "") + (claimed ? " claimed" : "") + (giver ? " giver" : "") },
    giver ? giverAv(t.giver, { small: true }) : null,
    h("div", { class: "tkc-body" },
      h("span", { class: "tkc-ic", "aria-hidden": "true" }, icon(o.kindIcon || "star")),
      h("div", { class: "tkc-main" },
        h("span", { class: "tkc-text" }, o.text),
        o.words ? h("small", { class: "tkc-words" }, o.words) : null,
        h("div", { class: "tkc-meta" },
          h("span", { class: "tkc-bar", role: "img", "aria-label": `進度 ${o.n}／${o.tgt}` }, h("i", { style: `width:${pct}%` })),
          h("span", { class: "tkc-n" }, `${o.n}／${o.tgt}`),
          o.pts ? h("span", { class: "tkc-pt" }, `+${o.pts} 分`) : null,
          o.reward ? h("small", { class: "tkc-r" }, rewardText(o.reward)) : null)),
      h("div", { class: "tkc-act" }, act)));
}

// 積分板。o：{ td, cap, wk, goal, ms（milesView）, milesText, onClaim(v) }
export function ptsPanel(o) {
  const pct = (a, b) => Math.max(0, Math.min(100, a / b * 100));
  const next = o.ms.find(v => v.state === "wait"), ready = o.ms.filter(v => v.state === "ready");
  const pin = v => {
    const el = h(v.state === "ready" ? "button" : "span", { class: "tkc-pin " + v.state, style: `left:${pct(v.at, o.goal)}%`, type: v.state === "ready" ? "button" : null,
      title: `${v.at} 分：${o.milesText(v)}`, "aria-label": `${v.at} 分的獎勵，${v.state === "claimed" ? "領過了" : v.state === "ready" ? "可以領" : "還沒到"}` },
      h("i", { "aria-hidden": "true" }, v.state === "claimed" ? icon("check") : v.at === o.goal ? icon("star") : icon("gift")), h("b", null, String(v.at)));
    if (v.state === "ready") el.addEventListener("click", () => o.onClaim(v));
    return el;
  };
  return h("div", { class: "tkc-pts" },
    h("div", { class: "tkc-today" }, h("span", { class: "tkc-lab" }, "今天"), h("b", { class: "tkc-big" }, `${o.td}`), h("span", { class: "tkc-of" }, `／${o.cap} 分`),
      h("span", { class: "tkc-trough", role: "img", "aria-label": `今天 ${o.td} 分，最多 ${o.cap}` }, h("i", { class: o.td >= o.cap ? "full" : "", style: `width:${pct(o.td, o.cap)}%` }))),
    h("div", { class: "tkc-week" },
      h("div", { class: "tkc-week-h" }, h("span", { class: "tkc-lab" }, "這週"), h("b", { class: "tkc-big" }, `${o.wk}`), h("span", { class: "tkc-of" }, `／${o.goal} 分`),
        next ? h("small", { class: "tkc-next" }, `下一格 ${next.at} 分：${o.milesText(next)}（還差 ${next.at - o.wk} 分）`) : (ready.length ? null : h("small", { class: "tkc-next" }, "這週的獎勵都領了"))),
      h("div", { class: "tkc-track" }, h("span", { class: "tkc-trough wk", role: "img", "aria-label": `這週 ${o.wk} 分，大獎 ${o.goal}` }, h("i", { style: `width:${pct(o.wk, o.goal)}%` })), o.ms.map(pin))),
    ready.length ? h("ul", { class: "tkc-ready" }, ready.map(v => h("li", null, h("span", null, h("b", null, `${v.at} 分`), ` ${o.milesText(v)}`), btn("領", () => o.onClaim(v), "primary small tkc-claim")))) : null);
}

// 領獎的小儀式：畫面中間壹枚印章＋獎勵的字，停壹下就收（動畫只演壹次；聲音用現有的 coin）
export function claimBurst(title, text) {
  const el = h("div", { class: "tkc-burst", role: "status" }, h("div", { class: "tkc-seal", "aria-hidden": "true" }, icon("star")), h("b", null, title), text ? h("p", null, text) : null);
  document.body.append(el); snd("coin");
  setTimeout(() => el.classList.add("out"), 1500); setTimeout(() => el.remove(), 1900);
}

// 今天的交代（任務板，11-20）：今天有交代任務的每位交代人：頭像、名字、在哪、現在說的那句（沒做完 says、做完換 done）；做完的變淡；按了去他那裡。
// items：[{ giver, text, done, go }]，照任務順序；onGo(item) 由呼叫的人處理（關任務板、過去）
export function giverBoard(items, onGo) {
  if (!items.length) return null;
  return h("div", { class: "tkc-giv" }, h("h4", null, "今天的交代"),
    h("ul", null, items.map(it => h("li", { class: it.done ? "done" : "" },
      h("button", { type: "button", class: "tkc-giv-b", title: it.go ? "過去" : "", onClick: () => onGo(it) },
        giverAv(it.giver, { small: true }),
        h("span", { class: "tkc-giv-t" }, h("b", null, giverName(it.giver)), h("small", null, "・在" + (GIVER_WHERE[it.giver] || "館裡")), h("p", null, it.text)),
        it.go ? h("span", { class: "tkc-giv-go", "aria-hidden": "true" }, "→") : null)))));
}
