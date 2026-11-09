// ================================================================
//  留下痕跡給別人的畫面（好玩的機制 7）。規則在 shared/coop_trace.js；伺服器在 functions/coop_trace.js 的 coopTrace。
//  - 地下收藏庫（單人）和合作地下的房間裡，都看得到館友的留言牌、最後的影子、半透明走過去的幽影。
//  - 走過這一間才能留言牌。字都是固定的，不能打字。
//  - 讀 /traces（館友都讀得到），寫都走 Functions。
//  單人的畫面（ui_screens3.js）只留一個小接口：ADDONS.cellarTraces、cellarResolved、cellarZero、cellarFloorDone。
// ================================================================
import { fromKey, isFree, nowMs } from "../../shared/logic.js";
import { TRACE, SIGN_TEMPLATES, recentWisps, signText } from "../../shared/coop_trace.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, UI, btn, h, itemHTML, note, snd } from "./ui_core.js";

const CACHE_MS = 15000;
const cache = new Map(); // 路徑 → { at, val }
async function readCached(path, force) {
  const c = cache.get(path);
  if (!force && c && Date.now() - c.at < CACHE_MS) return c.val;
  const val = await NET.read(path);
  cache.set(path, { at: Date.now(), val });
  return val;
}
const on = () => !!(UI.net && P && !isFree(P) && NET.me);

// 一間房的痕跡：一塊一塊畫（留言牌、影子）。o.canSign：走過這一間了，可以留
export function traceBox(roomId, o = {}) {
  const box = h("div", { class: "tr-box" });
  if (!on()) return box;
  const meId = NET.me.id;
  const draw = v => {
    if (!box.isConnected && o.live) return;
    const signs = Object.values((v && v.signs) || {}).sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.at || 0) - (a.at || 0)).slice(0, TRACE.roomShow);
    const shadows = Object.values((v && v.shadows) || {}).sort((a, b) => (b.at || 0) - (a.at || 0));
    const kids = [];
    if (signs.length) kids.push(h("div", { class: "tr-signs" }, signs.map(s => h("div", { class: "tr-sign" },
      h("b", null, signText(s.tpl, s.word)), h("small", null, s.nick),
      s.by === meId ? h("span", { class: "tr-likes" }, `讚 ${s.likes || 0}`)
        : btn(`讚 ${s.likes || 0}`, async e => {
          e.currentTarget.disabled = true;
          try { await NET.call("coopTrace", { act: "like", room: roomId, id: s.id }); snd("coin"); refresh(true); }
          catch (err) { note(err.message || "讚不了。", "bad"); }
        }, "small tr-like", { disabled: !!(s.likedBy && s.likedBy[meId]) })))));
    if (shadows.length) kids.push(h("div", { class: "tr-shadows" }, shadows.map(s => {
      const line = h("span", { class: "tr-shadow-say", hidden: true }, s.choice ? `${s.nick} 在這裡理智歸零了。他最後選了「${s.choice}」。` : `${s.nick} 在這裡理智歸零了。`);
      return h("button", { type: "button", class: "tr-shadow", "aria-label": `${s.nick} 留下的影子`, onClick: () => { line.hidden = !line.hidden; snd("eerie"); } }, h("i", { "aria-hidden": "true" }), h("span", null, "壹個影子"), line);
    })));
    if (o.canSign) kids.push(signForm(roomId, () => refresh(true)));
    box.replaceChildren(...kids);
  };
  const refresh = force => readCached(`traces/rooms/${roomId}`, force).then(draw).catch(() => {});
  refresh(false);
  return box;
}
// 留一句話：選一個格式、選一個字
function signForm(roomId, done) {
  const wrap = h("div", { class: "tr-form" });
  const closed = () => wrap.replaceChildren(btn("留壹塊牌子", () => openTpl(), "small"));
  const openTpl = () => wrap.replaceChildren(...SIGN_TEMPLATES.map(t => btn(t.text.split("{x}").join("＿＿"), () => openWord(t), "small")), btn("算了", closed, "small ghost"));
  const openWord = t => wrap.replaceChildren(...t.words.map(w => btn(signText(t.id, w), () => send(t, w), "small")), btn("算了", closed, "small ghost"));
  const send = async (t, w) => {
    wrap.replaceChildren(h("span", { class: "pt-hint" }, "釘上去……"));
    try {
      await NET.flush().catch(() => {});
      await NET.call("coopTrace", { act: "sign", room: roomId, tpl: t.id, word: w });
      snd("submit");
      note(`牌子留好了：「${signText(t.id, w)}」。每人最多 ${TRACE.signMax} 塊，舊的會被換掉。`, "good");
      wrap.replaceChildren(h("span", { class: "pt-hint" }, "牌子釘好了。"));
      done();
    } catch (e) { snd("error"); note(e.message || "留不了。", "bad"); closed(); }
  };
  closed();
  return wrap;
}
// 幽影：進一間房，偶爾有館友的佩佩半透明地走過去
export async function traceWisp(stage, floor) {
  if (!on() || !stage) return;
  if (Math.random() >= TRACE.wispChance) return; // 只是演出，不用共用的骰子
  const all = await readCached(`traces/floors/${floor}/wisps`);
  const list = recentWisps(all, NET.me.id, nowMs());
  if (!list.length || !stage.isConnected) return;
  const w = list[Math.floor(Math.random() * list.length)];
  const el = h("div", { class: "tr-wisp", "aria-hidden": "true" }, h("div", { class: "tr-wisp-art", html: itemHTML({ kind: "pepe", key: w.key, pick: fromKey(w.key) }) }), h("small", null, w.nick));
  stage.append(el);
  el.addEventListener("animationend", () => el.remove());
  setTimeout(() => el.remove(), 9000);
}
// 按讚的靈感：進地下收藏庫時領（伺服器改存檔，所以先送上去）
let claimedAt = 0;
export async function claimMyLikes() {
  if (!on() || UI.saveHold || Date.now() - claimedAt < 60000) return;
  claimedAt = Date.now();
  const n = await NET.read(`traces/likes/${NET.me.id}`);
  if (!(n > 0)) return;
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("coopTrace", { act: "claim" });
    if (r && r.gain) note(`有館友讚了你的牌子：+${r.gain} 靈感。`, "good");
  } catch (e) { /* 下次再領 */ }
}

// ---------- 單人的地下收藏庫 ----------
ADDONS.cellarTraces = (room, floor, stage) => {
  if (!on()) return null;
  traceWisp(stage, floor);
  return h("div", { class: "tr-single" }, traceBox(room.id, { canSign: !!P.cellar.cleared[room.id] }));
};
// 走完這一間：可以留牌子了
ADDONS.cellarResolved = (room, result) => { if (on()) result.append(h("div", { class: "tr-single" }, traceBox(room.id, { canSign: true }))); };
// 理智在這一間歸零：留一個影子（伺服器自己再看存檔）
ADDONS.cellarZero = (room, choice) => {
  if (!on()) return;
  NET.flush().catch(() => {}).then(() => NET.call("coopTrace", { act: "shadow", room: room.id, choice })).catch(() => {});
};
// 走完一層：別人之後看得到你的佩佩走過去
ADDONS.cellarFloorDone = (floor, keys) => {
  if (!on()) return;
  const key = (keys || []).find(Boolean);
  if (key) NET.call("coopTrace", { act: "pass", floor, key }).catch(() => {});
};
