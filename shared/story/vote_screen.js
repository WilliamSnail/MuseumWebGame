// ================================================================
//  全館投票的畫面要用的判斷（決定 0162、0166；畫面 web/src/panels/ui_vote.js，字在 vote_text.js）
//  只算「現在畫什麼、哪裡看得到入口、能不能按送出」。投票本身的規則（時間窗、壹人壹票、名字檢查、統計）在 vote.js，伺服器 storyVote 用；
//  時間和數字是 NUM.story.vote、選項的名字和擋下來的句子是 VOTE_TEXT，這裡不另外寫。
//  畫面只照伺服器回的那壹包畫：{ ok, why?, reason?, phase, now, opensAt, closesAt, resultAt, mine, changesLeft, result, history }。
//  能不能投壹律看 phase（公布以後 changesLeft 還是可能是 1）。純函式：「現在」由呼叫的人給（毫秒）。
// ================================================================
import { NUM } from "../core/config.js";
import { VOTE_TEXT } from "../core/systems_text.js";
import { sanFxTier } from "../social/room_mood.js";
import { voteName, votePhase, voteTimes } from "./vote.js";
import { VOTE_SCREEN_TEXT } from "./vote_text.js";

export const VOTE_SCREEN = {
  beforeMs: 24 * 3600000,      // 開投前多久開始看得到入口（翊文：開投前壹天起）
  afterMs: 7 * 24 * 3600000,   // 公布後大廳和任務板的入口留多久；之後從館友證看
  understandId: "u-m-you",     // 「投之前還有幾頁沒翻」看的那件看懂的事（shared/story/clues.js 的 understandView）
};
const voteUiNum = v => typeof v === "number" && Number.isFinite(v);
export function voteUiSay(text, data) { return Object.keys(data || {}).reduce((t, k) => t.split("{" + k + "}").join(String(data[k])), String(text)); }
export function voteUiOption(id) { return VOTE_TEXT.options[id] || ""; }

// 三個時間：伺服器回過就照回應的，還沒回就照設定
export function voteUiTimes(view, C = NUM.story.vote) {
  const set = voteTimes(C), pick = k => (view && voteUiNum(view[k]) ? view[k] : set[k]);
  return { opensAt: pick("opensAt"), closesAt: pick("closesAt"), resultAt: pick("resultAt") };
}
// 照時間算現在是哪壹段（切法跟伺服器同壹支 votePhase）
export function voteUiPhaseAt(now, t) {
  const iso = ms => new Date(ms).toISOString();
  return votePhase(now, { opens: iso(t.opensAt), closes: iso(t.closesAt), result: iso(t.resultAt) });
}
// 大廳、任務板的入口看不看得到
export function voteUiShow(now, t) { return now >= t.opensAt - VOTE_SCREEN.beforeMs && now < t.resultAt + VOTE_SCREEN.afterMs; }
// 館友證和投票畫面本身：開投前壹天起壹直看得到（寫下的名字、館史要留著）
export function voteUiEver(now, t) { return now >= t.opensAt - VOTE_SCREEN.beforeMs; }

// 畫面現在是哪壹種：before／pick（開著、還沒投）／mine（投了、還能改）／locked（投了、不能改）／counting／result
export function voteUiMode(view) {
  const p = view && view.phase;
  if (p === "before" || p === "counting" || p === "result") return p;
  if (p !== "open") return null;
  if (!view.mine) return "pick";
  return view.changesLeft > 0 ? "mine" : "locked";
}
// 名字欄：幾個字、能不能送。檢查用伺服器同壹支 voteName；不改玩家打的字：送出的是去掉頭尾空白的那串，太長不截斷、只擋送出
export function voteUiName(raw, C = NUM.story.vote) {
  const name = String(typeof raw === "string" ? raw : "").trim(), checked = voteName(name, C);
  const plain = voteName(name, Object.assign({}, C, { nameMax: Infinity, banned: [] })); // 只拿「算幾個字」
  const len = plain.ok ? [...plain.name].length : plain.why === "noName" ? 0 : [...name].length;
  return { name, len, ok: checked.ok, clean: checked.ok ? checked.name : "", why: checked.ok ? null : checked.why };
}
// 擋下來的那句：伺服器有給理由就用它的，沒有就用備用的（VOTE_TEXT.no）
export function voteUiWhy(why, reason, C = NUM.story.vote) {
  if (typeof reason === "string" && reason.trim()) return reason;
  const known = Object.prototype.hasOwnProperty.call(VOTE_TEXT.no, why);
  return known ? voteUiSay(VOTE_TEXT.no[why], { n: why === "longName" ? C.nameMax : C.changes }) : VOTE_SCREEN_TEXT.otherNo;
}
// 送出鈕：能不能按、下面那句、要送什麼。mine：現在已經投的那壹票（改票時比「是不是壹樣」）
export function voteUiForm(draft, mine, C = NUM.story.vote) {
  const T = VOTE_SCREEN_TEXT.form, choice = draft && draft.choice;
  if (!C.options.includes(choice)) return { ok: false, hint: T.pick, data: null };
  const data = { op: "vote", choice };
  let clean = "";
  if (choice === C.nameChoice) {
    const n = voteUiName(draft.name, C);
    if (!n.ok) return { ok: false, hint: voteUiWhy(n.why, null, C), data: null };
    data.name = n.name; clean = n.clean;
  }
  if (mine && mine.choice === choice && String(mine.name || "") === clean) return { ok: false, hint: T.same, data: null };
  return { ok: true, hint: T.ready, data };
}
// 台灣時間的「12/12（六）05:00」
export function voteUiWhen(ms) {
  if (!voteUiNum(ms)) return "";
  const d = new Date(ms + 8 * 3600000), two = n => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${"日一二三四五六"[d.getUTCDay()]}）${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
// 倒數：1 天以上寫到小時，1 小時以上寫到分，再下去寫到秒
export function voteUiLeft(ms) {
  const s = Math.max(0, Math.ceil((+ms || 0) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  if (d) return `${d} 天 ${h} 小時`;
  if (h) return `${h} 小時 ${m} 分`;
  return m ? `${m} 分 ${x} 秒` : `${x} 秒`;
}
// 理智低（跟畫廊、大廳的怪事同壹個門檻 NUM.sanFx.tiers[0]），燈熄了、理智用完也算
export function voteUiShaky(sanity, dark) { return !!dark || (voteUiNum(sanity) && sanity <= 0) || sanFxTier(sanity, false) > 0; }
// 比例長條：固定照三個選項的順序（不排名），只有百分比
export function voteUiShares(result, C = NUM.story.vote) {
  const share = (result && result.share) || {};
  return C.options.map(id => ({ id, label: voteUiOption(id), pct: Math.max(0, Math.min(100, Math.round(+share[id] || 0))), win: !!result && result.winner === id }));
}
// 投之前還有幾頁沒翻（understandView 的 near）；沒有資料就是 0（畫面什麼都不畫）
export function voteUiPages(near, id = VOTE_SCREEN.understandId) {
  const x = Array.isArray(near) ? near.find(n => n && n.id === id) : null;
  return x && x.left > 0 ? Math.floor(x.left) : 0;
}
// 大廳、任務板那張卡：{ key, title, sub, go, todo }。view 是伺服器的回應（還沒有就照時間畫）
export function voteUiEntry(now, view, C = NUM.story.vote) {
  const t = voteUiTimes(view, C);
  if (!voteUiShow(now, t)) return null;
  const T = VOTE_SCREEN_TEXT.entry, phase = voteUiPhaseAt(now, t), fresh = view && view.phase === phase ? view : null;
  const mine = view && view.mine, winner = fresh && fresh.result && fresh.result.winner;
  const key = phase === "open" && mine ? "voted" : phase === "result" && !winner ? "resultWait" : phase;
  const when = voteUiWhen(phase === "before" ? t.opensAt : phase === "open" ? t.closesAt : t.resultAt);
  const choice = voteUiOption(phase === "result" ? winner : mine && mine.choice);
  // 還沒問到伺服器（view 沒有）時不說「你還沒投」
  const sub = key === "open" && !view ? voteUiSay(VOTE_SCREEN_TEXT.open.close, { when }) : voteUiSay(T[key].sub, { when, choice });
  return { key, title: T[key].title, sub, go: T[key].go, todo: key === "open" && !!view };
}
// 館友證那壹塊（只有自己的版本）：寫下的名字、投了什麼、能不能看館史；什麼都沒有就 null
export function voteUiPass(view, C = NUM.story.vote) {
  if (!view) return null;
  const m = view.mine, history = Array.isArray(view.history) && view.history.length > 0;
  if (!m && !history) return null;
  const name = m && m.choice === C.nameChoice && m.name ? String(m.name) : "";
  return { name, choice: m ? voteUiOption(m.choice) : "", history };
}
