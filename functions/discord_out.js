import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Discord 聯動第二步：遊戲大事發到頻道（決定 0051，規則 shared/discord_out.js）
//  遊戲裡的交易成功「之後」，把事件寫進 discordOutbox/{id}（outboxPut：寫不進去只記錄，永遠不丟錯，所以不會讓原本的交易失敗）。
//  discordOutboxSend（onDocumentCreated）撿起來發到頻道：
//    - 同壹件事只發壹次：文件的名字就是事件的身分（create 第二次會失敗），發送前在交易裡把 pending 改成 sending（Eventarc 重複送也不會發兩次）
//    - 冷卻：同壹種事件預設 10 分鐘最多壹則（斗內 1 分鐘），記在 discordOutboxState/{kind}；冷卻中的不補發，標 skipped
//    - 太舊（寫進去超過 30 分鐘）的不發
//    - 發失敗：記 failed 和短短的原因（不含 token），**不重試**（onDocumentCreated 預設不重試，這裡也不自己重試）
//  Token 從 process.env 讀：DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID。部署時 .github/workflows/deploy.yml 暫時寫進 functions/.env（部署完刪掉）。
//    沒有就不發、不報錯（標 skipped: no-token）。不用 defineSecret（secret 不存在會讓整個部署失敗）。token 不進 repo、不進 log。
//  **模擬器絕不連真的 Discord**：FUNCTIONS_EMULATOR === "true" 的時候，完全不看環境變數裡的 token，也不呼叫 fetch；
//    改成把「會發的訊息」寫進 discordTestSent/{id}。測試用 discordTest/out 控制：{ token: true/false（有沒有 token）, fail: true（發送失敗）}。
//  放哪裡（都只有 Functions 碰得到）：discordOutbox/{id}（kind、text、status、at…）、discordOutboxState/{kind}（{ at }）、模擬器才有 discordTest/out、discordTestSent/{id}。
// ================================================================
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { dcOutBody, dcOutEvent, dcOutGate, dcOutStale } from "./shared/discord_out.js";

const db = () => getFirestore();
const EMU = () => process.env.FUNCTIONS_EMULATOR === "true";
const API = "https://discord.com/api/v10";
const outRef = id => db().doc(`discordOutbox/${id}`);
const stateRef = key => db().doc(`discordOutboxState/${key}`);

// 設定：{ token, channel, fake, fail }。模擬器永遠是假的
export async function outConfig() {
  if (EMU()) {
    let c = {};
    try { const s = await db().doc("discordTest/out").get(); if (s.exists) c = s.data(); } catch (e) { /* 沒有就用預設 */ }
    return { token: c.token === true ? "emulator-fake-token" : "", channel: "emulator-channel", fake: true, fail: c.fail === true };
  }
  return { token: String(process.env.DISCORD_BOT_TOKEN || "").trim(), channel: String(process.env.DISCORD_CHANNEL_ID || "").trim(), fake: false, fail: false };
}
// 錯誤訊息不留 token
const redact = (s, token) => { let t = String(s == null ? "" : s).replace(/Bot\s+\S+/g, "Bot ***"); if (token) t = t.split(token).join("***"); return t.slice(0, 200); };
const channelOk = c => /^\d{5,25}$/.test(String(c));

// 對 Discord 做壹個請求（POST 新訊息、PATCH 改訊息）。回傳 JSON。模擬器：寫進 discordTestSent，不連網路
export async function discordCall(cfg, method, path, body, docId, fetcher) {
  if (cfg.fake) {
    if (cfg.fail) throw new Error("（模擬器）Discord 發送失敗");
    const mid = method === "PATCH" ? path.split("/").pop() : "fake-" + docId;
    await db().doc(`discordTestSent/${docId}`).set({ method, content: body.content, mentions: JSON.stringify(body.allowed_mentions), messageId: mid, at: Date.now() });
    return { id: mid };
  }
  if (EMU()) throw new Error("模擬器不准連真的 Discord"); // 雙重保險
  if (typeof fetcher !== "function") fetcher = fetch;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetcher(`${API}${path}`, {
      method, signal: ctl.signal,
      headers: { Authorization: `Bot ${cfg.token}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (https://pepe-museum.web.app, 1.0)" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Discord 回 ${res.status}：${redact(await res.text(), cfg.token)}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}
export const postMessage = (cfg, text, docId, fetcher) => discordCall(cfg, "POST", `/channels/${encodeURIComponent(cfg.channel)}/messages`, dcOutBody(text), docId, fetcher);
export const editMessage = (cfg, messageId, text, docId, fetcher) => discordCall(cfg, "PATCH", `/channels/${encodeURIComponent(cfg.channel)}/messages/${encodeURIComponent(messageId)}`, dcOutBody(text), docId, fetcher);

// ---------- 寫進 outbox（交易成功之後叫；永遠不丟錯） ----------
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("寫 outbox 逾時")), ms); })]).finally(() => clearTimeout(t)); };
export async function outboxPut(ev, extra) {
  try {
    if (!ev) return false;
    await withTimeout(outRef(ev.id).create(Object.assign({ kind: ev.kind, text: ev.text, status: "pending", at: Date.now() }, extra || {})), 3000);
    return true;
  } catch (e) {
    if (!(e && (e.code === 6 || /already exists/i.test(String(e.message))))) console.error("discordOutbox：寫不進去", ev && ev.kind, e && e.message); // 6＝同壹件事寫過了，不是錯誤
    return false;
  }
}
const safe = async fn => { try { return await fn(); } catch (e) { console.error("discordOutbox：組不出事件", e && e.message); return false; } };

// 莊家的錢在這壹步前後的變化 → 事件。before、after：這個交易前後莊家的錢；nick：做這件事的人（桌上有好幾個人就不給）；
// settled：這步結算了壹手 21 點（破產是那壹手打的）；rescued：拚經濟把莊家從負的拚回來；t：這個交易的時間（當事件的身分）
export const outHouse = ({ before, after, nick, settled, rescued, t }) => safe(async () => {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
  const key = String(t || Date.now());
  if (rescued) return outboxPut(dcOutEvent("rescued", { nick, key }));
  if (before >= 0 && after < 0) return outboxPut(dcOutEvent(settled && nick ? "breaker" : "broke", { nick, key }));
  return false;
});
export const outJoin = (uid, nick) => safe(() => outboxPut(dcOutEvent("join", { nick, key: uid })));
export const outLiveOn = (seq, nick) => safe(() => outboxPut(dcOutEvent("liveOn", { nick, key: seq })));
export const outDonate = (msgId, from, to, n) => safe(() => outboxPut(dcOutEvent("donate", { from, to, n, key: msgId })));

// ---------- 發送 ----------
// 回傳 { act: "sent"|"skipped"|"failed"|"already"|"gone", reason? }。測試也直接叫這個
export async function processOutbox(id, now = Date.now(), fetcher) {
  const cfg = await outConfig(), ref = outRef(id);
  const verdict = await db().runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) return { act: "gone" };
    const d = s.data();
    if (d.status !== "pending") return { act: "already" };
    const st = await tx.get(stateRef(d.kind)); // 讀都做完才寫
    const skip = reason => { tx.update(ref, { status: "skipped", reason, doneAt: now }); return { act: "skipped", reason }; };
    if (typeof d.text !== "string" || !d.text) return skip("empty");
    if (dcOutStale(d.at, now)) return skip("old");
    if (!cfg.token || (!cfg.fake && !channelOk(cfg.channel))) return skip("no-token"); // 沒設定就不發，也不佔冷卻
    if (!dcOutGate(st.exists ? st.data() : null, d.kind, now).send) return skip("cooldown");
    tx.set(stateRef(d.kind), { at: now });
    tx.update(ref, { status: "sending", startedAt: now });
    return { act: "send", text: d.text };
  });
  if (verdict.act !== "send") return verdict;
  try {
    const r = await postMessage(cfg, verdict.text, id, fetcher);
    await ref.update({ status: "sent", doneAt: Date.now(), messageId: r && r.id ? String(r.id) : null });
    return { act: "sent" };
  } catch (e) {
    const why = redact(e && e.message, cfg.token);
    console.error("discordOutbox：發不出去", id.split("-")[0], why);
    try { await ref.update({ status: "failed", error: why, doneAt: Date.now() }); } catch (e2) { /* 記不下來也不影響 */ }
    return { act: "failed", reason: why };
  }
}

export const discordOutboxSend = onDocumentCreated("discordOutbox/{id}", async event => {
  try { await processOutbox(event.params.id); }
  catch (e) { console.error("discordOutboxSend：出錯", e && e.message); } // 不丟錯：不要重試
});
