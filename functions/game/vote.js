// ================================================================
//  全館投票（決定 0162、0166；規則在 shared/story/vote.js，數字和時間在 NUM.story.vote）
//  storyVote { op: "peek" }                          看現在的狀態（階段、自己的票、公布後的結果、館史）
//  storyVote { op: "vote", choice, name? }           投票或改票（時間窗、一人一票、名字檢查都在伺服器）
//  Firestore（只有 Functions 讀寫；firestore.rules 沒開的路徑一律不准，所以看不到別人的）：
//    storyVotes/{投票 id}                 全館的票數（沒有誰投什麼）和公布後的結果
//    storyVotes/{投票 id}/ballots/{uid}   那個人自己的那壹票（改票要知道原本投什麼；只回給本人）
//    houseHistory/{投票 id}               館史：公布後寫壹次
//  公布不另外排程：公布時間到了，第壹個來看的人觸發結算（同壹個交易，只會算壹次）。
//  不碰籌碼、不碰存檔。模擬器可以帶 testNow（毫秒）假裝現在是什麼時候；正式環境不理它。
// ================================================================
import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { needMember } from "../coop/party.js";
import { nowMs } from "../shared/core/logic.js";
import { NUM } from "../shared/core/config.js";
import { voteCast, voteHistory, voteSettle, voteView } from "../shared/story/vote.js";

const EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
const db = () => getFirestore();
const tallyRef = id => db().doc(`storyVotes/${id}`);
const ballotRef = (id, uid) => db().doc(`storyVotes/${id}/ballots/${uid}`);
const historyCol = () => db().collection("houseHistory");

export const storyVote = onCall(async req => {
  const me = await needMember(req), d = req.data || {}, C = NUM.story.vote;
  if (d.op !== "peek" && d.op !== "vote") throw new HttpsError("invalid-argument", "沒有這個動作");
  const clock = () => (EMULATOR && Number.isFinite(d.testNow) ? d.testNow : nowMs());
  const out = await db().runTransaction(async tx => {
    const t = clock();
    const [ts, bs] = await Promise.all([tx.get(tallyRef(C.id)), tx.get(ballotRef(C.id, me.uid))]);
    let state = ts.exists ? ts.data() : null, mine = bs.exists ? bs.data() : null, cast = null;
    if (d.op === "vote") {
      cast = voteCast(state, mine, { choice: d.choice, name: d.name }, t, C);
      if (cast.ok && cast.changed) {
        state = cast.state; mine = cast.mine;
        tx.set(tallyRef(C.id), Object.assign({}, state, { updatedAt: FieldValue.serverTimestamp() }));
        tx.set(ballotRef(C.id, me.uid), mine);
      }
    }
    // 公布時間到了、還沒結算：算壹次、寫館史（投票的時間窗裡不會走到這裡，所以上面的寫入和這裡不會同時發生）
    const s = voteSettle(state, t, C);
    if (s.settled) {
      state = s.state;
      tx.set(tallyRef(C.id), Object.assign({}, state, { updatedAt: FieldValue.serverTimestamp() }));
      tx.set(historyCol().doc(C.id), voteHistory(state.result, C));
    }
    return { t, state, mine, cast, fresh: s.settled ? voteHistory(state.result, C) : null };
  });
  const hs = await historyCol().get();
  // 模擬器用 testNow 往回看時，還沒公布的那壹則不給
  const history = hs.docs.map(x => x.data()).filter(h => h && h.at <= out.t).sort((a, b) => b.at - a.at);
  const view = voteView(out.state, out.mine, out.t, history, C);
  const refused = out.cast && !out.cast.ok ? out.cast : null;
  return Object.assign({ ok: !refused }, refused ? { why: refused.why, reason: refused.reason } : null, view);
});
