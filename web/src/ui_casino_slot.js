// =====================================================================
//  大禮包的拉霸機（翊文 11-09：「抽大禮包的過程不夠好，要有拉霸感的精緻動畫」）
//  結果是伺服器決定的：這裡先轉，伺服器回來才知道停在哪裡。只有演出，不影響結果。
//  五輪從左停到右，幾顆星就停幾個 ★。停法在 shared/casino.js 的 casSlotPlan。
//  動畫減量：不轉，直接顯示結果（字要看得到）。
// =====================================================================
import { casNum, casSlotPlan } from "../../shared/casino.js";
import { FX } from "./fx.js";
import { h, holdFor, motionOff, snd } from "./ui_core.js";

const REELS = 5, LOOP = 20, CELLS = 64;
const PLAIN = ["♠", "♥", "♦", "♣"];
const pick = a => a[Math.floor(Math.random() * a.length)];
const cellClass = sym => "sl-cell " + (sym === "★" ? "s-star" : sym === "♥" || sym === "♦" ? "s-red" : "s-dark");
const setCell = (el, sym) => { el.textContent = sym; el.className = cellClass(sym); };

export function slotMachine(o = {}) {
  const reels = [];
  for (let i = 0; i < REELS; i++) {
    // 前 LOOP 格和接下來 LOOP 格一樣，轉起來才接得上
    const head = Array.from({ length: LOOP }, () => (Math.random() < .2 ? "★" : pick(PLAIN)));
    const syms = Array.from({ length: CELLS }, (_, k) => (k < LOOP * 2 ? head[k % LOOP] : pick(PLAIN)));
    const strip = h("div", { class: "sl-strip" }, syms.map(s => h("div", { class: cellClass(s) }, s)));
    reels.push({ strip, el: h("div", { class: "sl-reel" }, strip), anim: null, y: -LOOP * 0 });
  }
  const bulbs = n => h("span", { class: "sl-bulbs", "aria-hidden": "true" }, Array.from({ length: n }, () => h("i", { class: "sl-bulb" })));
  const stars = Array.from({ length: REELS }, () => h("span", { class: "sl-star" }, "★"));
  const plateText = h("b", { class: "sl-plate-t" }, o.idle || "拉下拉桿，開壹包");
  const plate = h("div", { class: "sl-plate", role: "status" }, plateText);
  const lever = h("button", { type: "button", class: "sl-lever", "aria-label": "拉下拉桿，開壹包", onClick: () => { if (o.onPull) o.onPull(); } },
    h("span", { class: "sl-arm" }, h("i", { class: "sl-knob" })), h("span", { class: "sl-socket" }));
  const windowEl = h("div", { class: "sl-window", title: "轉的時候點壹下，直接看結果" }, reels.map(r => r.el), h("i", { class: "sl-payline", "aria-hidden": "true" }));
  const el = h("div", { class: "sl-machine", "aria-label": "大禮包拉霸機" },
    h("div", { class: "sl-top" }, bulbs(7), h("span", { class: "sl-name" }, "大禮包"), bulbs(7)),
    h("div", { class: "sl-body" }, windowEl, lever),
    h("div", { class: "sl-stars", "aria-hidden": "true" }, stars),
    plate);

  let hurry = false, spinning = false;
  windowEl.addEventListener("click", () => { if (spinning) hurry = true; });

  const cellH = () => (reels[0].strip.firstChild.offsetHeight || 60);
  const nowY = r => {
    try { return new DOMMatrixReadOnly(getComputedStyle(r.strip).transform).m42; } catch (e) { return 0; }
  };
  function clearWin() {
    for (let i = 1; i <= 5; i++) el.classList.remove("sl-win" + i);
    stars.forEach(s => s.classList.remove("sl-on"));
    el.querySelectorAll(".sl-hit").forEach(c => c.classList.remove("sl-hit"));
  }
  function plateSet(text, chips) {
    plateText.textContent = text;
    // 每次換壹個新的數字格：上壹包還在跑的數字才不會跑回來
    const plateNum = h("span", { class: "sl-plate-n" });
    plate.replaceChildren(plateText, plateNum);
    if (chips == null) return;
    plateNum.dataset.v = "0";
    plateNum.textContent = "+0";
    FX.countTo(plateNum, chips, { duration: motionOff() ? 0 : 800, format: n => `+${casNum(n)}` });
    if (motionOff()) plateNum.textContent = `+${casNum(chips)}`;
  }
  // 拉桿、開始轉
  function spin() {
    clearWin();
    hurry = false; spinning = true;
    el.classList.add("sl-spinning");
    lever.classList.remove("sl-pull"); void lever.offsetWidth; lever.classList.add("sl-pull");
    plateSet("轉動中……");
    snd("whoosh");
    if (motionOff()) return;
    const h1 = cellH();
    reels.forEach((r, i) => {
      if (r.anim) r.anim.cancel();
      r.strip.style.transform = "";
      r.strip.classList.add("sl-blur");
      const dist = LOOP * h1;
      r.anim = r.strip.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-dist}px)` }],
        { duration: 760 + i * 40, iterations: Infinity, easing: "linear", delay: i * 70 });
    });
  }
  // 停一輪：停在第 t 格（畫面中間那排）。沒中星的時候，下面那格常常放 ★：差壹點的感覺
  function stopReel(i, step) {
    const r = reels[i], h1 = cellH(), cells = r.strip.children;
    const cur = motionOff() ? 0 : nowY(r);
    const at = Math.max(0, Math.floor(-cur / h1));
    const t = Math.min(CELLS - 2, at + 10 + Math.floor(Math.random() * 4));
    setCell(cells[t], step.star ? "★" : pick(PLAIN));
    setCell(cells[t - 1], pick(PLAIN));
    setCell(cells[t + 1], !step.star && step.near ? "★" : pick(PLAIN));
    const final = -(t - 1) * h1;
    const dur = hurry ? 90 : step.dur;
    const done = () => {
      if (r.anim) { try { r.anim.cancel(); } catch (e) { /* 已經停了 */ } r.anim = null; }
      r.strip.style.transform = `translateY(${final}px)`;
      r.strip.classList.remove("sl-blur");
      if (step.star) { cells[t].classList.add("sl-hit"); stars[i].classList.add("sl-on"); snd("coin"); }
      else snd("click");
    };
    if (motionOff()) { done(); return Promise.resolve(); }
    if (r.anim) r.anim.cancel();
    r.strip.style.transform = `translateY(${cur}px)`;
    r.anim = r.strip.animate(
      [{ transform: `translateY(${cur}px)` }, { transform: `translateY(${final - 12}px)`, offset: .86, easing: "cubic-bezier(.3,0,.3,1)" }, { transform: `translateY(${final}px)` }],
      { duration: dur, easing: "cubic-bezier(.2,.65,.3,1)", fill: "forwards" });
    later0(() => r.strip.classList.remove("sl-blur"), dur * .55);
    // 分頁在背景時動畫不走：不要卡住，時間到就停好
    return Promise.race([r.anim.finished.catch(() => {}), holdFor(dur + 180)]).then(done);
  }
  const later0 = (fn, ms) => setTimeout(fn, ms);
  // 停在這一包。fast：全開時每包很快
  async function land(pack, opt = {}) {
    if (!spinning && !motionOff()) spin();
    const plan = casSlotPlan(pack.stars, !!opt.fast);
    for (let i = 0; i < REELS; i++) {
      const step = plan[i];
      if (step.tease && !hurry) { el.classList.add("sl-tease"); snd("drum"); }
      await stopReel(i, step);
      el.classList.remove("sl-tease");
      if (!hurry && step.gap) await holdFor(motionOff() ? 0 : step.gap);
    }
    spinning = false;
    el.classList.remove("sl-spinning");
    el.classList.add("sl-win" + pack.stars);
    plateSet(pack.name, pack.chips);
    snd(pack.stars >= 4 ? "revLegend" : pack.stars === 3 ? "revSuper" : pack.stars === 2 ? "revRare" : "revCommon");
    if (pack.stars >= 4 && FX.goldDust) FX.goldDust(el, pack.stars === 5 ? 3200 : 1600);
    if (pack.stars === 5) setTimeout(() => snd("crit01"), 500);
  }
  // 伺服器沒開成：停下來，什麼都沒中
  async function abort(text) {
    hurry = true;
    for (let i = 0; i < REELS; i++) await stopReel(i, { star: false, near: false, dur: 90 });
    spinning = false;
    el.classList.remove("sl-spinning");
    plateSet(text || "沒開成，等壹下再試。");
  }
  return {
    el, spin, land, abort,
    say: t => plateSet(t),
    enable: on => { lever.disabled = !on; },
    idle: t => { if (!el.classList.contains("sl-spinning") && ![1, 2, 3, 4, 5].some(n => el.classList.contains("sl-win" + n))) plateSet(t); },
    get hurried() { return hurry; },
    rush: () => { hurry = true; },
  };
}
