// 在線名單（館友名單）。規劃.md 第三節「館友名單、上線」。
// - 連上 WebSocket、送了 hello 就算在線。
// - 畫面送 where 告訴伺服器「我在哪個房間」。
// - beatTimeoutMs（60 秒）沒收到任何訊息算離線；awayAfterMs（5 分鐘）沒動算「離開」。
// - 斷線後等 offlineGraceMs 才算離線，重新整理頁面不會閃一下離線、又跳一次「上線了」。
// - 隱身：別人看到你離線；自己看得到自己真的狀態。隱身時不更新「最後上線」。
// - 名單有變就送給每個人（每個人收到的「自己」那一列不一樣，所以一個一個做）。
import { CLOSE } from "./protocol.js";

export function createPresence({ cfg, store, log }) {
  const people = new Map(); // 帳號 id → { conns: Set, room, activeAt, graceTimer }
  const conns = new Set();  // 已經 hello 過的連線
  let timer = null;

  function send(conn, obj) {
    if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj));
  }

  // 這個人現在算不算連著（斷線還在寬限期內也算）
  function connected(p) { return !!p && (p.conns.size > 0 || !!p.graceTimer); }

  function statusOf(acc, viewerId, now) {
    const p = people.get(acc.id);
    if (!connected(p)) return "offline";
    if (acc.invisible && viewerId !== acc.id) return "offline";
    return now - p.activeAt > cfg.awayAfterMs ? "away" : "online";
  }

  // 給 viewerId 看的名單。沒有 email。
  function roster(viewerId, now = Date.now(), accounts = store.accounts()) {
    return accounts.map(acc => {
      const status = statusOf(acc, viewerId, now);
      const p = people.get(acc.id);
      const row = {
        id: acc.id,
        nick: acc.nick,
        status,                                    // online／away／offline
        room: status === "offline" ? null : (p && p.room) || null,
        lastSeen: status === "offline" ? acc.last_seen_at || null : null,
      };
      if (acc.id === viewerId) { row.me = true; row.invisible = !!acc.invisible; }
      return row;
    });
  }

  // 等一下再一起送；每條連線只在內容有變時才送
  function broadcastSoon() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const now = Date.now();
      const accounts = store.accounts();
      for (const conn of conns) {
        const players = roster(conn.account.id, now, accounts);
        const json = JSON.stringify(players);
        if (json === conn.lastRoster) continue;
        conn.lastRoster = json;
        send(conn, { t: "roster", players, at: new Date(now).toISOString() });
      }
    }, cfg.rosterDelayMs);
  }

  function personOf(id) {
    let p = people.get(id);
    if (!p) { p = { conns: new Set(), room: null, activeAt: Date.now(), graceTimer: null }; people.set(id, p); }
    return p;
  }

  const hub = {
    // 這個帳號現在開了幾條
    connCount(id) { const p = people.get(id); return p ? p.conns.size : 0; },

    // 送一則訊息給某個帳號開著的每一條（每個分頁）。回傳送到幾條；不在線就是 0（要等他上線的事放信箱）。
    // 11-08 主線加的：送佩佩的「有新的信」「存檔被伺服器改了」、之後的邀請都用這個。
    sendTo(id, obj) {
      const p = people.get(id);
      if (!p) return 0;
      let n = 0;
      for (const conn of p.conns) { if (conn.ws.readyState === 1) { conn.ws.send(JSON.stringify(obj)); n++; } }
      return n;
    },

    // hello 通過之後呼叫：送 welcome（含名單），也告訴別人
    join(conn) {
      const acc = conn.account;
      const p = personOf(acc.id);
      if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
      const wasConnected = p.conns.size > 0;
      p.conns.add(conn);
      p.activeAt = Date.now();
      conns.add(conn);
      if (!acc.invisible) store.touchSeen(acc.id);
      if (!wasConnected) log(`上線：#${acc.id} ${acc.nick}`);
      const players = roster(acc.id);
      conn.lastRoster = JSON.stringify(players);
      send(conn, {
        t: "welcome",
        v: conn.version,
        me: { id: acc.id, nick: acc.nick, invisible: !!acc.invisible },
        beatEvery: cfg.beatEveryMs,
        limits: conn.limits,
        roster: players,
        at: new Date().toISOString(),
      });
      broadcastSoon();
    },

    // 連線關掉時呼叫（可以叫很多次，只算一次）
    leave(conn) {
      if (conn.left || !conn.account) return;
      conn.left = true;
      conns.delete(conn);
      const acc = conn.account;
      const p = people.get(acc.id);
      if (!p) return;
      p.conns.delete(conn);
      if (p.conns.size > 0) return broadcastSoon();
      const done = () => {
        p.graceTimer = null;
        if (p.conns.size > 0) return;
        people.delete(acc.id);
        const now = store.account(acc.id);
        if (now && !now.invisible) store.touchSeen(acc.id);
        log(`離線：#${acc.id} ${acc.nick}`);
        broadcastSoon();
      };
      if (cfg.offlineGraceMs > 0) p.graceTimer = setTimeout(done, cfg.offlineGraceMs);
      else done();
    },

    // 收到任何一則訊息（ws.js 會先記 conn.beatAt）
    beat(conn, msg) {
      const p = people.get(conn.account.id);
      if (p && msg.active) { p.activeAt = Date.now(); broadcastSoon(); }
    },

    where(conn, msg) {
      const p = people.get(conn.account.id);
      if (!p) return;
      p.room = msg.room;
      p.activeAt = Date.now();
      broadcastSoon();
    },

    // 暱稱、隱身改了（PUT /api/me）：更新每條連線上的帳號資料，重送名單
    accountChanged(id) {
      const acc = store.account(id);
      if (!acc) return;
      const p = people.get(id);
      if (p) for (const c of p.conns) c.account = acc;
      // 變成隱身的那一刻，就是別人看到的「最後上線」
      if (acc.invisible && connected(p)) store.touchSeen(id);
      broadcastSoon();
    },

    // 定時檢查：太久沒心跳的斷掉；「離開」的狀態也在這裡變
    sweep(now = Date.now()) {
      for (const conn of conns) {
        if (now - conn.beatAt > cfg.beatTimeoutMs) {
          log(`心跳逾時：#${conn.account.id}`);
          try { conn.ws.close(CLOSE.noBeat.code, "no heartbeat"); } catch { /* 已經關了 */ }
          hub.leave(conn);
          // 對方如果真的斷了，關閉的握手不會回來，過一下直接切掉
          setTimeout(() => { try { conn.ws.terminate(); } catch { /* 已經關了 */ } }, 2000).unref?.();
        }
      }
      if (conns.size) broadcastSoon();
    },

    roster,
    onlineIds() { return [...people.keys()].filter(id => connected(people.get(id))); },

    // 伺服器要關了：在線的人記下最後上線
    close() {
      if (timer) { clearTimeout(timer); timer = null; }
      for (const [id, p] of people) {
        if (p.graceTimer) clearTimeout(p.graceTimer);
        const acc = store.account(id);
        if (acc && !acc.invisible) store.touchSeen(id);
      }
      people.clear();
      conns.clear();
    },
  };
  return hub;
}
