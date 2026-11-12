// ================================================================
//  打怪物的畫面（地下室改版，決定 0067、0068；規劃 docs/地下室改版規劃.md 第八節「一眼看得出要怎麼做」）
//  規則在 shared/cellar_fight.js、shared/coop_fight.js；伺服器在 functions/coop.js。這個檔只畫伺服器給的樣子，什麼都不算。
//  ui_coop.js 在 phase 是 "fight" 的時候叫 fightStage（上面的舞台）和 fightCard（下面的卡片）。
//  第八節的十條：最上面一行寫現在要做什麼；能按的有框有字；按之前就看得到結果；下一招是一句白話、指到誰；
//    壓力和理智用條；誰選好了、還剩幾秒一直看得到；結果寫得出為什麼；手機按鈕在下半部、夠大。
//  怪物的圖還沒生成（docs/地下室素材清單.md）：先用程式畫的剪影。素材好了換 foeArt 就好。
// ================================================================
import { NUM } from "../../shared/config.js";
import { FIGHT_MOVES } from "../../shared/cellar_fight.js";
import { btn, h, itemHTML, snd } from "./ui_core.js";

const ACT_TEXT = { push: "推", see: "看穿", calm: "安撫", guard: "擋", flee: "逃跑", retreat: "撤退", point: "指出弱點" };
const MOVE_TEXT = { cap: "棒球帽：擋下這壹招", crown: "皇冠：這壹下骰子最大", tentacle: "觸手帽：大力推（自己扣理智）", wizard: "巫師帽：大家的推都加", beanie: "毛帽：回壹點理智", rest: "躺平：回壹點理智", squat: "斯拉夫蹲：這回合不會倒", cheer: "比讚：下回合大家的推都加" };
const INTENT_ICON = { hit: "撲", scare: "嚇", all: "全", grow: "多" };
const odds = n => (n >= 85 ? "幾乎壹定成" : n >= 65 ? "大概七成" : n >= 45 ? "大概壹半" : n >= 25 ? "大概三成" : "很難");

// 生好的圖（翊文 11-12，原圖 assets/cellar2/，tools/cut_frames.py 切成一條）：
//   怪物一張三格：平常、出招、安靜下來（[格寬, 格高]）；特效一條 n 格；行動圖示一條六格
const FOE_ART = { f1a: [300, 284], f1b: [300, 270], f1g: [188, 300], f2a: [296, 295], f2b: [300, 256], f2g: [240, 300], f3a: [260, 300], f3b: [249, 300], f3g: [276, 300], f4a: [253, 300], f4b: [300, 300], f4g: [300, 300], f5a: [252, 300], f5b: [252, 300], f5g: [252, 300] };
const FX_ART = { push: 7, see: 6, san: 6, stamp: 6, calm: 6, guard: 6, brave: 12, grow: 6, flee: 6, phase: 8 }; // 格數要跟 fight.css 的 steps(N) 一樣
const ACT_ICON = { push: 0, see: 1, calm: 2, guard: 3, flee: 4, retreat: 5 };
// 招式圖示一條 16 格（原圖後面兩排是重複的，只用前 8 格）
const MOVE_ICON = { cap: 0, crown: 1, tentacle: 2, wizard: 3, beanie: 4, rest: 5, squat: 6, cheer: 7 };
export const moveIcon = mv => (mv in MOVE_ICON ? h("span", { class: "fg-ico mv", style: { backgroundPosition: `${(MOVE_ICON[mv] * 100 / 15).toFixed(3)}% 0` }, "aria-hidden": "true" }) : null);
export const actIcon = act => (act in ACT_ICON ? h("span", { class: "fg-ico", style: { backgroundPosition: `${ACT_ICON[act] * 20}% 0` }, "aria-hidden": "true" }) : null);
export const fightFx = (kind, cls = "") => (FX_ART[kind] ? h("div", { class: `fg-fx k-${kind} ${cls}`, style: { "--n": FX_ART[kind] }, "aria-hidden": "true" }) : null);
// 新的一回合結算出來才演一次（畫面每次有人選都會重畫，不能每次都演）
let shownRound = "";
function freshRound(v) {
  const r = v.last && v.last.round;
  if (!r || !r.events) return null;
  const key = `${v.fight.foe}:${r.round}:${v.fight.phase}`;
  if (key === shownRound) return null;
  shownRound = key;
  return r;
}
// 怪物：有圖的用圖（三個姿勢），還沒有圖的先畫壹塊蓋著布的剪影，兩點反光。第二階段布滑下來壹點
function foeSprite(f, lunge) {
  const a = FOE_ART[f.foe];
  if (!a) return h("div", { class: "fg-foe-art", html: foeArt(f) });
  return h("div", { class: "fg-foe-art", role: "img", "aria-label": "怪物" },
    h("div", { class: "fg-sprite" + (lunge ? " lunge" : ""), style: { backgroundImage: `url(/cellar2/foe-${f.foe}.webp)`, "--ar": (a[0] / a[1]).toFixed(3) } }));
}
function foeArt(f) {
  const dim = f.phase === 2 ? 0.55 : 0.82;
  return `<svg viewBox="0 0 200 200" role="img" aria-label="看不清楚的東西"><ellipse cx="100" cy="184" rx="62" ry="9" fill="rgba(0,0,0,.28)"/><path d="M38 182 C34 120 52 46 100 40 C148 46 166 120 162 182 C140 172 126 190 100 180 C74 190 60 172 38 182 Z" fill="rgba(34,26,40,${dim})" stroke="rgba(214,178,94,.55)" stroke-width="2"/><path d="M58 150 C70 132 78 160 92 140 M110 146 C120 128 132 158 144 138" fill="none" stroke="rgba(214,178,94,.25)" stroke-width="2"/><circle class="fg-eye" cx="84" cy="96" r="4" fill="#F6E6B4"/><circle class="fg-eye" cx="116" cy="96" r="4" fill="#F6E6B4"/></svg>`;
}
const nameOf = (v, id) => (id === "helper" ? "館方助手" : (v.members.find(m => m.id === id) || {}).name || "");

// 舞台：怪物、下壹招的牌子、壓力條、每個人的座位（誰選好了）。mine ＝我這回合剛選的（畫面先記著的）
export function fightStage(v, mine = null) {
  const f = v.fight, fv = v.fightView || {};
  const waiting = (fv.waiting || []).filter(id => !(mine && id === v.me)); // 自己按了就馬上算選好（不用等伺服器回來）
  const pct = Math.max(0, Math.min(100, Math.round(f.hp / Math.max(1, f.hpMax) * 100)));
  const myPush = (fv.options || []).find(o => o.act === "push");
  const cut = myPush ? Math.max(0, Math.round((f.hp - myPush.lo) / Math.max(1, f.hpMax) * 100)) : pct; // 你推了大概會扣到哪（淡色預告）
  const it = f.intent || {};
  // 剛結算的這一回合：怪物有出手就換「出招」的姿勢一下；推、看穿成功、自己扣理智各演一次特效
  const fresh = freshRound(v), ev = fresh ? fresh.events : [];
  const foeHit = ev.some(e => e.t === "foe" && !e.cancel);
  const pushed = ev.some(e => e.t === "push"), saw = ev.some(e => e.t === "see" && e.ok);
  const myLoss = ev.some(e => e.t === "foe" && ((e.hit === v.me && e.san) || (e.hits || []).some(x => x.id === v.me && x.san)));
  // 膽量把這一下擋住了（沒扣理智）：自己座位上的燈亮起來
  const myBrave = ev.some(e => e.t === "foe" && (e.kind === "scare" || e.kind === "all") && ((e.hit === v.me && !e.san && !e.blocked) || (e.hits || []).some(x => x.id === v.me && !x.san && !x.blocked)));
  const calmed = ev.some(e => e.t === "calm" && e.ok), grew = ev.some(e => e.t === "foe" && e.kind === "grow" && !e.cancel), phased = ev.some(e => e.t === "phase");
  const guards = new Set(ev.filter(e => e.t === "guard").map(e => e.for || e.id));
  const seats = f.seats.map(s => h("div", { class: "fg-seat" + (s.id === v.me ? " me" : "") + (s.ghost ? " ghost" : "") + (s.out ? " gone" : "") + (it.to === s.id ? " aimed" : "") },
    s.id === v.me && myLoss ? fightFx("san", "on-seat") : s.id === v.me && myBrave ? fightFx("brave", "on-seat") : guards.has(s.id) ? fightFx("guard", "on-seat") : null,
    h("b", { class: "fg-who" }, s.helper ? "館方助手" : nameOf(v, s.id) + (s.id === v.me ? "（你）" : ""),
      s.helper ? null : h("i", { class: "fg-ok" + (waiting.includes(s.id) ? "" : " on") }, s.out ? "走了" : s.ghost ? "倒了" : waiting.includes(s.id) ? "在想…" : "選好了")),
    h("div", { class: "fg-pepes" }, s.pepes.map(p => h("div", { class: "fg-pepe" + (p.down ? " down" : ""), title: p.down ? "倒下了（受傷）" : `強度 ${p.power}` },
      h("div", { class: "fg-art", html: itemHTML({ kind: "pepe", key: p.key, pick: p.pick, perfect: p.perfect }) }), h("small", null, p.down ? "受傷" : `強度 ${p.power}`))))));
  return h("div", { class: "fg-stage fl" + v.floor + (f.phase === 2 ? " p2" : "") },
    h("div", { class: "fg-foe" },
      h("div", { class: "fg-intent k-" + (it.kind || "none"), role: "status" }, h("i", null, INTENT_ICON[it.kind] || "？"), h("span", null, "下壹招：", h("b", null, fv.intent || "……"))),
      h("div", { class: "fg-foe-box" }, foeSprite(f, foeHit), phased ? fightFx("phase") : pushed ? fightFx("push") : null, saw ? fightFx("see") : calmed ? fightFx("calm") : null, grew ? fightFx("grow") : null),
      h("h3", { class: "fg-name" }, fv.name || "？", f.boss ? h("small", null, f.phase === 2 ? "　第二階段" : "　守門") : h("small", null, `　等級 ${f.rank || 1}`)),
      h("div", { class: "fg-bar", role: "img", "aria-label": `壓力 ${f.hp}／${f.hpMax}` }, h("i", { class: "cut", style: { width: pct + "%" } }), h("i", { class: "now", style: { width: cut + "%" } }), h("span", null, `壓力 ${f.hp}／${f.hpMax}`)),
      f.weak ? h("p", { class: "fg-flag" }, `弱點找到了：推 ×${NUM.fight.weakMult}`) : null),
    h("div", { class: "fg-seats" }, seats));
}

// 上壹回合發生了什麼：壹行壹件事，寫得出為什麼
function roundLines(v, r) {
  if (!r || !r.events) return [];
  const n = id => nameOf(v, id);
  return r.events.map(e => {
    if (e.t === "auto") return `${n(e.id)} 沒選，當成擋`;
    if (e.t === "retreat") return `${n(e.id)} 撤回地面`;
    if (e.t === "flee") return !e.enough ? "想逃的人不到壹半，沒逃" : e.ok ? "逃掉了" : `沒逃掉（擲 ${e.roll}，要 ${e.target} 以下）`;
    if (e.t === "point") return `${n(e.id)} 指出了弱點`;
    if (e.t === "move") return `${n(e.id)} 用了${(MOVE_TEXT[e.move] || e.move).split("：")[0]}${e.n ? `（${e.move === "rest" || e.move === "beanie" ? "理智 +" : "+"}${e.n}）` : ""}`;
    if (e.t === "see") return `${n(e.id)} 看穿（${e.skill}，擲 ${e.roll}，要 ${e.target} 以下）：${e.ok ? "找到弱點" : "沒看出來"}`;
    if (e.t === "calm") return `${n(e.id)} 安撫（擲 ${e.roll}，要 ${e.target} 以下）：${e.ok ? `牠靜了壹點，壓力 −${e.n}` : "沒用"}`;
    if (e.t === "guard") return e.for && e.for !== e.id ? `${n(e.id)} 擋在 ${n(e.for)} 前面` : `${n(e.id)} 擋著`;
    if (e.t === "push") return `${n(e.id)} 推：壓力 −${e.n}${e.weak ? "（打到弱點）" : ""}${e.mode === "crown" ? "（皇冠）" : e.mode === "tentacle" ? "（觸手帽）" : ""}${e.tap ? "（時機抓得好 +" + e.tap + "）" : ""}${e.san ? `，自己理智 −${e.san}` : ""}`;
    if (e.t === "phase") return "布滑了下來。牠還沒完：第二階段";
    if (e.t === "win") return "牠安靜下來了。可以登記了";
    if (e.t === "ghost") return `${n(e.id)} ${e.why === "san" ? "撐不住了" : "帶的佩佩都倒了"}`;
    if (e.t === "over") return e.over === "away" ? "拖太久，牠自己走掉了" : e.over === "lose" ? "大家都倒了" : null;
    if (e.t === "foe") {
      if (e.cancel) return "牠這壹招被安撫下來，沒出手";
      const soft = e.soft ? "（被安撫過，變弱）" : "";
      if (e.kind === "grow") return `牠又多了壹點：壓力 +${e.n}${soft}`;
      if (e.kind === "all") return "牠對大家出手：" + (e.hits || []).map(x => `${n(x.id)} ${x.blocked ? "被擋下" : x.san ? "理智 −" + x.san : "膽量擋住了"}`).join("、") + soft;
      if (e.miss) return "牠撲了個空";
      if (e.blocked) return `${n(e.blocked)} 擋下了這壹招`;
      const who = e.cover ? `${n(e.cover)} 替 ${n(e.to)} 擋：` : `${n(e.hit)}：`;
      if (e.kind === "scare") return `牠嚇人。${who}${e.san ? "理智 −" + e.san : "膽量擋住了"}${soft}`;
      if (e.dodge) return `牠撲過來。${who}躲開了${soft}`;
      return `牠撲過來。${who}${e.down ? "壹隻佩佩倒下，受傷了" : "沒事"}${soft}`;
    }
    return null;
  }).filter(Boolean);
}

// 有些回合可以按時機：圈縮到金線的時候按。只加不扣；動畫減量的人不用按，直接算「按得好」
function tapRing(done) {
  if (document.body.classList.contains("reduce-motion")) { done(1); return null; }
  const start = performance.now(), DUR = 1300, AT = 0.78;
  let over = false;
  const finish = n => { if (over) return; over = true; box.remove(); done(n); };
  const box = h("div", { class: "fg-tap", role: "dialog", "aria-label": "抓時機" },
    h("p", null, "圈縮到金線的時候，按壹下"),
    h("button", { class: "fg-ring", type: "button", onclick: () => { const t = (performance.now() - start) / DUR, d = Math.abs(t - AT); snd(d < 0.07 ? "coin" : "click"); finish(d < 0.07 ? 2 : d < 0.17 ? 1 : 0); } }, h("i", { class: "goal" }), h("i", { class: "shrink", style: { animationDuration: DUR + "ms" } }), h("b", null, "按！")),
    h("small", null, "不按也沒關係，只是少壹點點"));
  setTimeout(() => finish(0), DUR + 150);
  return box;
}

// 卡片：最上面壹行寫現在要做什麼；四顆大按鈕，第二行寫結果；招式；逃跑和撤退；自己的理智和膽量
// api ＝ { act(data)：送出去, mine：我這回合選的, setMine(pick) }
export function fightCard(v, me, api) {
  const f = v.fight, fv = v.fightView || {}, opts = fv.options || [], mine = api.mine || (v.votes && v.votes[v.me]) || null;
  const seat = f.seats.find(s => s.id === v.me) || {};
  const waiting = (fv.waiting || []).filter(id => id !== v.me).map(id => nameOf(v, id));
  const picked = !!mine;
  const title = !fv.can && !opts.length ? "你在旁邊看" : seat.ghost ? "你倒了。可以指壹次弱點" : picked ? (waiting.length ? `選好了。等 ${waiting.join("、")}` : "結算中……") : "現在：選你這回合的行動";
  const card = h("div", { class: "note-card room-card cx-card fg-card" }, h("i", { class: "pin" }));
  const send = (pick, o) => {
    const go = tap => { api.setMine(Object.assign({}, pick, { tap })); api.act(Object.assign({}, pick, { tap })); snd("click"); };
    if (o && o.tap && (pick.act === "push" || pick.act === "crown" || pick.act === "tentacle")) { const ring = tapRing(go); if (ring) card.append(ring); }
    else go(0);
  };
  const desc = o => {
    if (o.act === "push" || o.act === "crown" || o.act === "tentacle") return `壓力 −${o.lo}～${o.hi}${o.tap ? "　可以抓時機" : ""}`;
    if (o.act === "see") return o.ok ? `${odds(o.chance)}。成了之後推 ×${NUM.fight.weakMult}` : o.why;
    if (o.act === "calm") return `${odds(o.chance)}。牠這壹招變弱或取消`;
    if (o.act === "guard") return "這回合受的傷減半";
    if (o.act === "flee") return `${odds(o.chance)}。要 ${fv.fleeNeed || 1} 個人壹起選；沒有獎勵`;
    if (o.act === "retreat") return "你自己回地面，拿到的都留著";
    if (o.act === "point") return o.ok ? "隊友的推會變強" : o.why;
    return o.ok ? "" : o.why;
  };
  const big = opts.filter(o => ["push", "see", "calm", "guard", "point"].includes(o.act));
  const moves = opts.filter(o => o.move);
  const exits = opts.filter(o => o.act === "flee" || o.act === "retreat");
  const mk = (o, cls) => btn([h("b", null, o.move ? moveIcon(o.act) : actIcon(o.act), o.move ? (MOVE_TEXT[o.act] || o.act).split("：")[0] : ACT_TEXT[o.act] || o.act), h("small", null, o.move && o.ok ? (MOVE_TEXT[o.act] || "").split("：")[1] || desc(o) : desc(o))],
    () => send({ act: o.act }, o), cls + (mine && mine.act === o.act ? " cx-on" : ""), { disabled: !o.ok, "aria-pressed": String(!!(mine && mine.act === o.act)) });
  const last = v.last && v.last.round ? roundLines(v, v.last.round) : [];
  const sanPct = Math.max(0, Math.min(100, seat.san || 0));
  card.append(
    h("h2", { class: "room-title fg-now" }, title, h("span", { class: "cx-clock" })),
    last.length ? h("div", { class: "fg-log" }, h("b", null, `第 ${v.last.round.round - (v.last.round.over ? 0 : 1)} 回合`), h("ul", null, last.map(l => h("li", null, l)))) : h("p", { class: "pt-sub" }, `牠先亮出下壹招，大家再各選壹個行動，壹起結算。最多打 ${fv.limit || NUM.fight.maxRounds} 回合。`),
    h("div", { class: "fg-acts" }, big.map(o => mk(o, "fg-act a-" + o.act))),
    moves.length ? h("div", { class: "fg-moves" }, h("span", { class: "fg-lab" }, "招式（壹場壹次）"), moves.map(o => mk(o, "fg-move small"))) : null,
    h("div", { class: "cx-card-foot fg-foot" },
      h("div", { class: "fg-me" }, h("span", null, `理智 ${seat.san ?? "—"}`), h("i", { class: "fg-san" }, h("i", { style: { width: sanPct + "%" } })), seat.brave ? h("span", { class: "fg-brave", title: "有隊友壯膽：扣理智的時候先扣膽量" }, `膽量 ${seat.brave}`) : null),
      exits.map(o => mk(o, "ghost small fg-exit"))),
    picked ? h("p", { class: "pt-hint" }, "時間到之前可以改。") : null);
  return card;
}
export const fightMoveNames = () => Object.keys(FIGHT_MOVES);
