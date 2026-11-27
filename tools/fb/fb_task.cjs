// Firebase 的固定動作（決定 0038，翊文 11-09：「好，加固定動作」）。
// 由 .github/workflows/firebase-task.yml 跑；金鑰只在 GitHub Secrets，AI 拿不到。AI 只有翊文要求時才能按。
// 只做得到這幾件事，其他一律不做：
//   invite     把一個 Gmail 加進邀請名單（可以帶名字）；之前被停用的會恢復
//   admin-on   設成管理員      admin-off  取消管理員
//   disable    停用邀請（還沒加入的進不來、管理員失效；已經加入的還進得去，踢人要另外做）
//   enable     恢復邀請
//   stats      看大家合起來的數字（只有數字，沒有 email、名字）
//   stock-reroll  清掉莊家「今天調過股價了」的記號，下壹個進賭場的人會重新照當天的行情算壹次。
//                 只動 casinoHouse/main 的 stk.day，不碰股價、不碰任何人的錢包。
//                 什麼時候用：調價那天算錯了（例如 11-14 七支全變 9,996），修好之後要當天就重算，不想等隔天換日。
//   house-ledger  只讀：莊家、博物館資金、海底、修繕基金現在多少；莊家每個來源累計進出多少；
//                 每個錢包的籌碼、借款、憑空和消失的來源。不印名字、uid、email，錢包用 #1、#2 代替（照籌碼排）。
//                 什麼時候用：莊家的錢對不上要查錢流去哪（11-14 莊家 −8.3 億）。
//   stock-status  只讀：台股、美股盤中的伺服器紀錄（有沒有抓到開盤價、錯誤訊息、落後幾分鐘、哪幾支沒新行情）。不讀亂數祕密。
//   econ-status   只讀：casinoHouse/main 和最新壹份日報 casinoReport/日期 裡「經濟用到的欄位」（白名單：錢、債、已知世界的池子、NPC 花費、館方投資、每個來源的累計），
//                 印成 hex 的幾行（ECON_HEX H＝莊家、R＝日報；GitHub 會把祕密裡出現過的字遮成 ***，大括號、base64 結尾都被吃過，所以用只有 0-9a-f 的 hex，帶總長度和檢查碼），直接存成檔餵 node tools/check/econ_check.cjs --ledger。不印名字、uid、email、亂數祕密、錢包。
//   house-size    只讀：莊家（casinoHouse/main）和幾份共用文件有多大、莊家裡哪幾塊最大（只印鍵名和位元組，不印內容）；錢包、存檔印最大、平均，和最大那份裡最大的幾塊（11-27）。
//                 什麼時候用：每次賭場、銀行動作都要整份讀寫莊家，Firestore 壹份最多 1 MB；要知道離上限多遠、哪壹塊在長（11-15 翊文問伺服器負擔）。
//   world-status  只讀：世界經濟（決定 0086）——world/main（備用池、最近一天）、最近 3 天的 worldDays 紀錄、莊家的 house.wh（各集團的健康值 h、狀態、預算倍率）、帳上各單位現在多少（house.wu）、最近一天 NPC 各集團出多少（house.npcs.byUnit）。
//                 什麼時候用：W2 以後確認世界文件有沒有每天寫、W5 以後看哪些集團減薪／緊縮／裁員（管理者看得到每家，財報只給分布）。
//   fn-errors     只讀：Cloud Functions 最近 36 小時 WARNING 以上、或含「日報」「失敗」「Error」「錯」的紀錄（Cloud Logging），每則只印時間、哪個函式、訊息前 300 字；email、uid 樣子的字遮掉。
//                 什麼時候用：某件事沒發生、不知道哪裡出錯（11-15 當天日報沒產生）。
//   invest-status 只讀：館方投資兩個池子的持股、成本、停損、每天記的價，和股價換比例的紀錄（11-17）。
//   advisor-rules-mail  寫：把財經專員「借款新規定」的信（shared/casino/advisor.js 的 casAdvisorRulesLetter，決定 0114）寄給所有「還有借款沒還」而且還沒收過的館友：
//                 每個錢包一個交易：寫 mail/{uid}/items/advisor-rules、錢包記 adv.rules（每人只寄一次；跑第二次不會重寄）。紀錄只印人數，不印 uid、名字。
//                 什麼時候用：借款部分還款、分期上線的那一刻（翊文 11-17：「上線那刻寄給所有還有借款沒還的館友」）。
//   player-invest 只讀：壹位館友（name 填暱稱）的持股、成本、市值、帳面賺賠、槓桿部位、掛單、累計賺賠、借款、淨值（11-17）。名字在紀錄裡遮掉。
//   stock-tw-peg  去證交所抓台股最近壹次收盤（休市時介面回上壹個交易日的），把還沒換過的台股換成「倍數 × 真實價」（shared/casino/stock.js 的 casStockPegNow，
//                 跟換日時壹樣：錢包照比例換股數、市值不變）。只動 casinoHouse/main 的 stk；已經換過的不會再換。
//                 什麼時候用：台股上線在週末，換日找不到收盤、壹直停在起始價（11-15）。
//   client-errors 只讀：網頁回報上來的前端錯誤（決定 0125，clientErrors 集合，7 天）。依訊息分組：次數、最後出現、版本、畫面、視窗大小、位置、stack 前 3 行。不印名字、uid、email（寫入時就清過，這裡再遮壹次）。
//                 什麼時候用：玩家說畫面壞了（11-17 壹鍵交件整塊不見），本機重現不了。
//   digest-now   寫：今天的 Discord 館訊提早發（翊文 11-22：「今天的discord 更新發布可以提早嗎」）。跟伺服器 20:00 的 discordDigestTick 同壹條路：
//                組好 dcDigestPost（今天發布的館方公告）寫進 discordOutbox/digest-日期，discordOutboxSend 撿起來發。同壹天只寫得進壹次，
//                所以 20:00 那次會「寫過了」不再發；之後才加的公告就不會出現在今天這則。今天沒有公告就不寫。紀錄只印字數和有沒有寫成。
// 紀錄裡不印 email、名字：--mask 那一步先遮起來，輸入值從事件檔讀，不經過環境變數。
const fs = require("fs"), path = require("path");

const ACTIONS = ["invite", "admin-on", "admin-off", "disable", "enable", "stats", "stock-reroll", "house-ledger", "stock-status", "econ-status", "stock-tw-peg", "house-size", "fn-errors", "world-status", "player-invest", "invest-status", "client-errors", "advisor-rules-mail", "digest-now"];

// 只讀：函式的錯誤紀錄（見檔頭 fn-errors）。用同壹把金鑰拿 token 呼叫 Cloud Logging 的 entries:list
async function fnErrors(cred, projectId) {
  const tok = (await cred.getAccessToken()).access_token;
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  // console.error 印的字在 Cloud Run 不壹定標成 ERROR（沒結構的 stderr 是 DEFAULT），所以也直接找關鍵字（11-15 日報沒產生，severity 篩出 0 則）
  const filter = `timestamp>="${since}" AND (resource.type="cloud_run_revision" OR resource.type="cloud_function") AND (severity>=WARNING OR textPayload:"日報" OR textPayload:"失敗" OR textPayload:"Error" OR textPayload:"錯")`;
  const r = await fetch("https://logging.googleapis.com/v2/entries:list", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify({ resourceNames: ["projects/" + projectId], filter, orderBy: "timestamp desc", pageSize: 200 }) });
  if (!r.ok) { console.log("讀不到紀錄：" + r.status + " " + (await r.text()).slice(0, 300)); process.exitCode = 1; return; }
  const j = await r.json(), list = j.entries || [];
  const mask = s => String(s).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "（email）").replace(/\b[A-Za-z0-9]{28}\b/g, "（uid）");
  console.log(`最近 36 小時 WARNING 以上或含關鍵字：${list.length} 則（最新在上面）`);
  const seen = new Map();
  for (const e of list) {
    const fn = (e.resource && e.resource.labels && (e.resource.labels.service_name || e.resource.labels.function_name)) || "?";
    const msg = mask(e.textPayload || (e.jsonPayload && (e.jsonPayload.message || JSON.stringify(e.jsonPayload))) || "").replace(/\s+/g, " ").slice(0, 300);
    const key = fn + "|" + msg.slice(0, 120);
    if (seen.has(key)) { seen.get(key).n++; continue; }
    seen.set(key, { t: e.timestamp, sev: e.severity, fn, msg, n: 1 });
  }
  for (const v of seen.values()) console.log(`${v.t.slice(0, 19)}Z ${v.sev} ${v.fn}${v.n > 1 ? `（同樣 ${v.n} 則）` : ""}：${v.msg}`);
}

// 只讀：文件大小（見檔頭 house-size）。大小用 UTF-8 位元組算（Firestore 的上限是 1 MiB ＝ 1,048,576）
async function houseSize(db) {
  const B = s => Buffer.byteLength(typeof s === "string" ? s : JSON.stringify(s == null ? null : s), "utf8");
  const kb = n => (n / 1024).toFixed(1) + " KB";
  const top = (obj, n) => Object.entries(obj || {}).map(([k, v]) => [k, B(v)]).sort((a, b) => b[1] - a[1]).slice(0, n);
  const hs = await db.doc("casinoHouse/main").get();
  if (!hs.exists) { console.log("莊家的文件還不存在"); return; }
  const raw = hs.data().data || "{}", h = JSON.parse(raw), total = B(raw);
  console.log(`莊家 casinoHouse/main：${kb(total)}（上限 1,024 KB 的 ${(total / 1048576 * 100).toFixed(1)}%）`);
  for (const [k, n] of top(h, 15)) {
    console.log(`  ${k}：${kb(n)}`);
    if (n > 20 * 1024 && h[k] && typeof h[k] === "object") for (const [k2, n2] of top(h[k], 6)) console.log(`      ${k}.${k2}：${kb(n2)}`);
  }
  for (const p of ["world/main", "stocksTw/latest", "stocksUs/latest"]) { const s = await db.doc(p).get(); console.log(`${p}：${s.exists ? kb(B(s.data())) : "沒有"}`); }
  const ws = await db.collection("casinoWallets").get(), sizes = ws.docs.map(d => B(d.data().data || d.data()));
  if (sizes.length) console.log(`錢包 ${sizes.length} 個：最大 ${kb(Math.max(...sizes))}、平均 ${kb(sizes.reduce((a, b) => a + b, 0) / sizes.length)}`);
  // 最大的錢包、存檔裡哪幾塊最大（只印鍵名和位元組；11-27 檢查資料庫會不會塞滿）
  const bigOf = (docs, label) => {
    if (!docs.length) return;
    const raws = docs.map(d => d.data().data), lens = raws.map(r => B(r)), i = lens.indexOf(Math.max(...lens));
    console.log(`${label} ${docs.length} 份：最大 ${kb(lens[i])}（上限的 ${(lens[i] / 1048576 * 100).toFixed(1)}%）、平均 ${kb(lens.reduce((a, b) => a + b, 0) / lens.length)}`);
    let o = null; try { o = typeof raws[i] === "string" ? JSON.parse(raws[i]) : raws[i]; } catch (e) { /* 讀不懂就不拆 */ }
    if (o && typeof o === "object") for (const [k, n] of top(o, 6)) console.log(`  最大那份的 ${k}：${kb(n)}`);
  };
  bigOf(ws.docs, "錢包");
  bigOf((await db.collection("saves").get()).docs, "存檔");
  const rp = await db.collection("casinoReport").orderBy("day", "desc").limit(1).get();
  if (!rp.empty) console.log(`最新日報 casinoReport/${rp.docs[0].data().day}：${kb(B(rp.docs[0].data().data || rp.docs[0].data()))}`);
}

// 只讀：世界經濟現況（見檔頭 world-status）。不印名字、uid、email
async function worldStatus(db) {
  const nz = v => (Number.isFinite(+v) ? Math.floor(+v) : 0), fmt = n => nz(n).toLocaleString("en-US"), J = s => (s.exists ? JSON.parse(s.data().data || "{}") : null);
  const { load } = require("../../test/load_shared.cjs"), G = load({ __realMoney: true }), names = {}; for (const u of G.WORLD_UNITS) names[u.id] = u.name; names["u-household"] = "家計"; names.pub = "公共";
  const S = { normal: "一般", cut: "減薪", squeeze: "緊縮", layoff: "裁員" };
  const w = J(await db.doc("world/main").get()), h = J(await db.doc("casinoHouse/main").get());
  console.log(w ? `世界文件 world/main：備用池 ${fmt(w.pool)}　最近一天 ${w.day || "-"}　累計成長看到 ${fmt(w.grownSeen)}` : "世界文件 world/main：還沒有");
  // 最近 3 天：照日期直接拿（11-18：orderBy("__name__","desc") 要 Firestore 建索引，沒建就整個失敗）
  const ds = [0, 1, 2].map(k => new Date(Date.parse((w && w.day ? w.day : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)) + "T00:00:00Z") - k * 864e5).toISOString().slice(0, 10));
  const days = { docs: (await db.getAll(...ds.map(d => db.doc(`worldDays/${d}`)))).filter(d => d.exists) };
  days.docs.forEach(d => { const r = JSON.parse(d.data().data || "{}"); console.log(`  ${d.id}：已知世界 ${fmt(r.world)}　合計 ${fmt(r.total)}　成長 ${r.growth == null ? "-" : fmt(r.growth)}　景氣 ${r.b}　莊家記的日子 ${r.houseDay || "-"}`); });
  if (!h) { console.log("莊家文件還不存在"); return; }
  if (h.wu && h.wu.r) { const a = G.wuAmounts(Object.assign({}, h)); console.log("帳上各單位現在多少（合計＝已知世界）：" + Object.keys(a).map(k => `${names[k] || k} ${fmt(a[k])}`).join("　") + `　已知世界 ${fmt(h.world)}`); }
  if (h.gb) { const sum = o => Object.values(o || {}).reduce((a, v) => a + nz(v), 0); console.log(`佩佩銀行準備金：現金 ${fmt(h.gb.cash)}　欠博物館資金 ${fmt(h.gb.debt)}　集團存款 ${fmt(sum(h.gb.dep))}　放款 ${fmt(sum(h.gb.loan))}　館友新借款沒收回 ${fmt(h.gb.loansOut)}　館債 ${fmt(h.gb.bond)}　莊家存款 ${fmt(h.gb.hdep)}　存款：${Object.entries(h.gb.dep || {}).map(([k, v]) => `${names[k] || k} ${fmt(v)}`).join("、") || "（沒有）"}　放款：${Object.entries(h.gb.loan || {}).map(([k, v]) => `${names[k] || k} ${fmt(v)}`).join("、") || "（沒有）"}`); }
  if (h.wh && h.wh.st) {
    console.log(`各集團健康值（${h.wh.day || "-"}）：`);
    Object.keys(h.wh.st).forEach(k => console.log(`  ${names[k] || k}：h ${h.wh.h[k]}　${S[h.wh.st[k].s]}　預算倍率 ×${G.whMult(h, k).toFixed(2)}　連續低迷 ${h.wh.st[k].low || 0} 週`));
    if (h.wh.unrest) console.log("集團集體不安：" + Object.keys(h.wh.unrest).map(k => `${names[k] || k} ${h.wh.unrest[k]}`).join("　") + (h.wh.mood ? `　｜　展廳氣氛 ${h.wh.mood.v}` : ""));
    if (Array.isArray(h.wh.ev) && h.wh.ev.length) console.log("最近換過狀態：" + h.wh.ev.slice(-8).map(e => `${e.day} ${names[e.unit] || e.unit}→${S[e.to]}`).join("、"));
  } else console.log("house.wh 還沒有（第一次換日才會建）");
  if (h.npcw && h.npcw.san) { const sv = Object.values(h.npcw.san).map(nz); console.log(`NPC 理智（決定 0090）：不是初始值的 ${sv.length} 位${sv.length ? `，最低 ${Math.min(...sv)}、最高 ${Math.max(...sv)}、低於 30 的 ${sv.filter(x => x < 30).length} 位` : ""}`); }
  if (h.npcw) { const bals = Object.values(h.npcw.bal || {}).map(nz); console.log(`NPC 錢包（W6）：${bals.length} 位有錢包、合計 ${fmt(bals.reduce((a, b) => a + b, 0))}　最近一次發薪 ${h.npcw.day || "-"}　被裁中 ${Object.keys(h.npcw.lay || {}).length} 位、換過工作 ${Object.keys(h.npcw.job || {}).length} 位`); if (Array.isArray(h.npcw.ev) && h.npcw.ev.length) console.log("最近換工作：" + h.npcw.ev.slice(-6).map(e => `${e.day} ${e.t === "lay" ? "被裁" : "換到"} ${names[e.to] || names[e.from] || ""}`).join("、")); } else console.log("house.npcw 還沒有（第一次發薪才會建）");
  if (h.npcs && h.npcs.byUnit) console.log(`NPC 最近一天（${h.npcs.day || "-"}）各集團出：` + Object.keys(h.npcs.byUnit).map(k => `${names[k] || k} ${fmt(h.npcs.byUnit[k])}`).join("　"));
}

// 台股手動換真實價（見檔頭 stock-tw-peg）。真實代號只寫在 functions/stock/stock_tw.js，這裡從那個檔讀出來
async function stockTwPeg(db) {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "functions", "stock", "stock_tw.js"), "utf8");
  const m = /TW_SYMBOLS = (\{[^}]+\})/.exec(src);
  if (!m) throw new Error("functions/stock/stock_tw.js 裡找不到 TW_SYMBOLS");
  const syms = JSON.parse(m[1].replace(/(\w+):/g, '"$1":'));
  const ex = Object.values(syms).map(c => `${c === "4743" ? "otc_" : "tse_"}${c}.tw`).join("|");
  const r = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0&_=${Date.now()}`, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://mis.twse.com.tw/stock/fibest.jsp" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("證交所回 " + r.status);
  const j = await r.json(), closes = {};
  let day = null;
  for (const it of (j && Array.isArray(j.msgArray) ? j.msgArray : [])) {
    const id = Object.keys(syms).find(k => syms[k] === it.c), px = parseFloat(it.z) > 0 ? parseFloat(it.z) : parseFloat(it.y);
    if (id && px > 0) { closes[id] = px; day = day || String(it.d || ""); }
  }
  console.log(`證交所：${day || "沒有日期"}，${Object.keys(closes).length} 支有價：` + Object.entries(closes).map(([k, v]) => `${k} ${v}`).join("、"));
  if (Object.keys(closes).length !== Object.keys(syms).length) { console.log("有幾支抓不到，這次不換（不編價）"); process.exitCode = 1; return; }
  const { casStockPegNow } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "..", "shared", "casino", "stock.js")).href);
  const ref = db.doc("casinoHouse/main");
  const done = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const h = JSON.parse(s.data().data || "{}"), out = casStockPegNow(h, closes);
    if (out.length) tx.set(ref, { data: JSON.stringify(h) }, { merge: true });
    return out;
  });
  if (!done) { console.log("莊家的文件還不存在"); return; }
  console.log(done.length ? "換好了：" + done.map(x => `${x.id} ${x.from} → ${x.to}`).join("、") + "。錢包下次進賭場照比例換股數。" : "都換過了，不用換");
}

// 寫：借款新規定的信寄給所有還有借款的館友（見檔頭 advisor-rules-mail）。每個錢包自己一個交易（讀錢包、寫信、記寄過了），重跑不會重寄
async function advisorRulesMail(db, FieldValue) {
  const href = f => require("url").pathToFileURL(path.join(__dirname, "..", "..", "shared", f)).href;
  const { casAdvisorRulesLetter } = await import(href("casino/advisor.js")), { MAIL_DAYS } = await import(href("social/mailbox.js")), { todayStr } = await import(href("core/logic.js"));
  const day = todayStr(), ws = await db.collection("casinoWallets").get();
  let sent = 0, skipped = 0, failed = 0;
  for (const d of ws.docs) {
    try {
      const did = await db.runTransaction(async tx => {
        const s = await tx.get(d.ref);
        if (!s.exists) return false;
        const w = JSON.parse(s.data().data || "null");
        if (!w || typeof w !== "object") return false;
        const letter = casAdvisorRulesLetter(w, day, MAIL_DAYS);
        if (!letter) return false;
        tx.set(d.ref, { data: JSON.stringify(w), updatedAt: FieldValue.serverTimestamp() });
        tx.set(db.doc(`mail/${d.id}/items/${letter.id}`), Object.assign({}, letter.mail, { fromId: null, createdAt: FieldValue.serverTimestamp() }));
        return true;
      });
      if (did) sent++; else skipped++;
    } catch (e) { failed++; }
  }
  console.log(`借款新規定的信：寄出 ${sent} 封；沒借款或寄過了 ${skipped} 個；失敗 ${failed} 個（失敗的重跑壹次就好）。`);
  if (failed) process.exitCode = 1;
}

// 只讀：台股、美股盤中的伺服器紀錄（stocksTw/latest、stocksUs/latest）。不讀亂數祕密，什麼都不寫
//   什麼時候用：股票沒更新、整天休市，要知道是抓不到行情還是別的原因（11-13 美股第壹晚整天休市）
async function stockStatus(db) {
  const short = v => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + "…" : s; };
  for (const [name, p] of [["台股", "stocksTw/latest"], ["美股", "stocksUs/latest"]]) {
    const s = await db.doc(p).get();
    if (!s.exists) { console.log(name + "：還沒有紀錄"); continue; }
    const d = s.data() || {};
    const at = d.updatedAt ? new Date(d.updatedAt).toISOString() : "-";
    console.log(name + "：日期 " + (d.day || "-") + "　開盤第幾分鐘 " + (d.openIdx == null ? "沒開" : d.openIdx) + "　休市 " + !!d.closed + "　第幾段 " + (d.k == null ? "-" : d.k) + "　最後更新 " + at);
    console.log("  錯誤：" + (d.err || "（沒有）"));
    console.log("  落後分鐘：" + (short(d.lag) || "-"));
    console.log("  沒新行情的：" + (short(d.stale) || "-"));
    const log = Array.isArray(d.log) ? d.log.slice(-15) : [];
    console.log("  最近的紀錄：" + (log.length ? "" : "（沒有）"));
    log.forEach(l => console.log("    " + (typeof l === "string" ? l : short(l))));
    if (d.fx != null || d.fxLast != null) console.log("  匯率：今天 " + d.fx + "　昨天 " + d.fxLast);
    console.log("  真實前收盤：" + (short(d.prevReal) || "-"));
    if (d.ser && typeof d.ser === "object") console.log("  盤中前幾個 rel：" + short(Object.fromEntries(Object.keys(d.ser).map(id => [id, (d.ser[id] || []).slice(d.openIdx || 0, (d.openIdx || 0) + 4)]))));
    console.log("  有哪些天：" + Object.keys(d.days || {}).sort().join("、"));
  }
  { const hs = await db.doc("casinoHouse/main").get(), h = hs.exists ? JSON.parse(hs.data().data || "{}") : {}, k = h.stk || {}; // 莊家的股價（圖表基準、換倍數的紀錄）
    console.log("莊家 house.stk：日期 " + (k.day || "-") + "　fx " + k.fx);
    console.log("  px：" + short(k.px)); console.log("  prev：" + short(k.prev)); console.log("  peg.dir：" + short(k.peg && k.peg.dir));
    const days = Object.keys(k.hist || {}).sort().slice(-3); days.forEach(d => console.log("  hist " + d + "：" + short(k.hist[d]))); }
  { const ds = await db.doc("stocksDiv/latest").get(), dd = ds.exists ? ds.data() : null; // 配股息資料（決定 0112）
    console.log("配股息：" + (dd ? "更新 " + (dd.at ? new Date(dd.at).toISOString() : "-") + "　事件 " + (Array.isArray(dd.ev) ? dd.ev.length : 0) + " 筆　沒抓到 " + short(dd.failed || []) : "還沒有紀錄"));
    if (dd && Array.isArray(dd.ev)) dd.ev.slice(-12).forEach(e => console.log("  " + e.ex + " " + e.id + " " + (e.kind === "split" ? "配股 ×" + e.r : "股利 " + e.amt))); }
}

// 只讀：經濟用到的欄位（白名單，不是整份文件）。格式給 tools/check/econ_check.cjs --ledger 吃
// 簡單的檢查碼（不是密碼學的）：econ_check 重算壹次，對不上就說輸出被改過或截斷
function econCrc(s) { let c = 7; for (let i = 0; i < s.length; i++) c = (Math.imul(c, 31) + s.charCodeAt(i)) >>> 0; return c.toString(16).padStart(8, "0"); }
function econPick(h) {
  const o = {}, nz = v => (Number.isFinite(+v) ? Math.floor(+v) : 0), obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  for (const k of ["bankroll", "budget", "museum", "gov", "sea", "world", "ext", "loansOut", "cultureLate"]) if (h[k] != null) o[k] = nz(h[k]);
  if (typeof h.day === "string") o.day = h.day;
  const d = obj(h.debt); o.debt = { budget: nz(d.budget), culture: nz(d.culture), world: nz(d.world) };
  { const wu = obj(h.wu), r = obj(wu.r); if (Object.keys(r).length) o.wu = { r, adj: obj(wu.adj) }; } // 已知世界的帳上分類（W3，決定 0086）
  if (h.cul) o.cul = { paid: nz(obj(h.cul).paid), late: nz(obj(h.cul).late), day: obj(h.cul).day || null, due: obj(h.cul).due || null };
  if (h.npcs) o.npcs = { day: obj(h.npcs).day || null, ticket: nz(obj(h.npcs).ticket), shop: nz(obj(h.npcs).shop), total: nz(obj(h.npcs).total), people: nz(obj(h.npcs).people) };
  const sum = obj(obj(h.inv).sum); if (Object.keys(sum).length) o.inv = { sum: { hold: (Array.isArray(sum.hold) ? sum.hold : []).map(x => ({ name: String(obj(x).name || "").slice(0, 20), n: nz(obj(x).n) })), pnl: Number.isFinite(+sum.pnl) ? Math.floor(+sum.pnl) : 0 } };
  const w = obj(obj(h.led).world), x = obj(obj(h.led).ext); const gl = obj(obj(h.led).gb); o.led = { world: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, nz(v)])), ext: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, nz(v)])), gb: Object.fromEntries(Object.entries(gl).map(([k, v]) => [k, nz(v)])) }; if (obj(h.gb).cash != null || Object.keys(obj(h.gb)).length) { const g = obj(h.gb); o.gb = { cash: nz(g.cash), debt: nz(g.debt), loansOut: nz(g.loansOut), bond: nz(g.bond), hdep: nz(g.hdep), inc: nz(g.inc), dep: Object.fromEntries(Object.entries(obj(g.dep)).map(([k, v]) => [k, nz(v)])), loan: Object.fromEntries(Object.entries(obj(g.loan)).map(([k, v]) => [k, nz(v)])) }; } // 佩佩銀行準備金（決定 0127） // 決定 0126：海外是並列的帳 house.ext
  return o;
}
async function econStatus(db) {
  const hs = await db.doc("casinoHouse/main").get();
  const h = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  // GitHub 會把「祕密裡出現過的字」遮成 ***（金鑰 JSON 裡有大括號，輸出的 { } 全被遮掉），所以輸出 base64，每行 160 字、標第幾份／共幾份，econ_check 照順序接回來
  // 第二次：base64 結尾的「fQ==」剛好等於某個祕密的值，被遮成 ***。改成 hex（只有 0-9a-f）、每行結尾加「.」、帶總長度和檢查碼（econ_check 驗，被改過會說）
  const emit = (kind, obj) => { const b = Buffer.from(JSON.stringify(obj), "utf8").toString("hex"), n = Math.max(1, Math.ceil(b.length / 120)), crc = econCrc(b); for (let i = 0; i < n; i++) console.log(`ECON_HEX ${kind} ${i + 1}/${n} ${b.length} ${crc} ${b.slice(i * 120, (i + 1) * 120)} .`); };
  emit("H", econPick(h));
  const q = await db.collection("casinoReport").orderBy("day", "desc").limit(1).get();
  if (q.empty) { emit("R", null); return; }
  const r = JSON.parse(q.docs[0].data().data || "{}"), sh = (r.snap && r.snap.house) || {};
  const pick = econPick(Object.assign({}, sh, { led: { world: sh.wflow || {}, ext: sh.xflow || {} }, cultureLate: sh.culLate, inv: sh.inv }));
  emit("R", { day: r.day || null, gap: Number.isFinite(+r.gap) ? Math.floor(+r.gap) : null, opening: Number.isFinite(+r.opening) ? Math.floor(+r.opening) : null, house: pick });
}

// 只讀：看錢流去哪。什麼都不寫
async function houseLedger(db) {
  const nz = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
  const fmt = n => nz(n).toLocaleString("en-US");
  const list = o => Object.entries(o || {}).filter(([, v]) => nz(v)).sort((a, b) => Math.abs(nz(b[1])) - Math.abs(nz(a[1]))).map(([k, v]) => `    ${k}：${fmt(v)}`);
  const hs = await db.doc("casinoHouse/main").get();
  const h = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  console.log(`莊家 ${fmt(h.bankroll)}　博物館資金 ${fmt(h.budget)}　海底 ${fmt(h.sea)}　修繕基金 ${fmt(h.museum)}　政府帳 ${fmt(h.gov)}　已知世界 ${fmt(h.world)}　海外（house.ext，可以是負的）${fmt(h.ext)}　莊家記的日子 ${h.day || "-"}`);
  { const ws = await db.doc("world/main").get(), w = ws.exists ? JSON.parse(ws.data().data || "{}") : null; // 世界文件（W2，決定 0086）：備用池要算進已知世界總量
    if (h.wu && h.wu.r) { const r = h.wu.r, adj = h.wu.adj || {}, world = nz(h.world); let s = 0; const parts = Object.keys(r).filter(k => k !== "pub").map(k => { const a = Math.floor(world * +r[k]) + nz(adj[k]); s += a; return `${k} ${fmt(a)}`; }); console.log(`已知世界的帳上分類（W3）：${parts.join("　")}　公共 ${fmt(world - s)}　合計 ${fmt(world)}`); }
    console.log(w ? `世界文件 world/main：備用池 ${fmt(w.pool)}　已知世界合計 ${fmt(nz(h.world) + nz(w.pool))}（莊家的對外帳戶 ${fmt(h.world)}）　最近一天 ${w.day || "-"}　累計成長看到 ${fmt(w.grownSeen)}` : "世界文件 world/main：還沒有"); }
  const led = h.led || {};
  console.log("莊家每個來源累計（正＝進莊家，負＝出莊家）：");
  (list(led.flow).length ? list(led.flow) : ["    （沒有）"]).forEach(l => console.log(l));
  console.log("海外每個來源累計（正＝進海外，負＝出海外；extSplit 是上線那次從已知世界搬出來的）：");
  (list((h.led || {}).ext).length ? list((h.led || {}).ext) : ["    （沒有）"]).forEach(l => console.log(l));
  { const g = h.gb || {}, sum = o => Object.values(o || {}).reduce((a, v) => a + nz(v), 0);
    console.log(`佩佩銀行準備金（house.gb，決定 0127）：現金 ${fmt(g.cash)}　欠博物館資金 ${fmt(g.debt)}　集團存款合計 ${fmt(sum(g.dep))}　放款合計 ${fmt(sum(g.loan))}　館友新借款沒收回 ${fmt(g.loansOut)}　館債本金 ${fmt(g.bond)}　莊家存款 hdep ${fmt(g.hdep)}　今天利息淨收入 ${fmt(g.inc)}`);
    console.log("  存款：" + (Object.keys(g.dep || {}).length ? Object.entries(g.dep).map(([k, v]) => `${k} ${fmt(v)}`).join("　") : "（沒有）") + "\n  放款：" + (Object.keys(g.loan || {}).length ? Object.entries(g.loan).map(([k, v]) => `${k} ${fmt(v)}`).join("　") : "（沒有）"));
    console.log("準備金每個來源累計（正＝進準備金，負＝出準備金）：");
    (list(led.gb).length ? list(led.gb) : ["    （沒有）"]).forEach(l => console.log(l));
    const gw = Object.fromEntries(Object.entries(led.world || {}).filter(([k]) => /^group/.test(k)));
    console.log("已知世界裡集團存放款的來源累計（正＝進已知世界，負＝出已知世界；跟準備金那邊的存款、放款、還款兩邊相反）：");
    (list(gw).length ? list(gw) : ["    （沒有）"]).forEach(l => console.log(l)); }
  console.log("莊家憑空多的（重開）：");
  (list(led.mint).length ? list(led.mint) : ["    （沒有）"]).forEach(l => console.log(l));
  const ws = await db.collection("casinoWallets").get();
  const rows = ws.docs.map(d => { try { return JSON.parse(d.data().data || "{}"); } catch (e) { return {}; } })
    .map(w => ({ chips: nz(w.chips), loan: (w.loan && Array.isArray(w.loan.list) ? w.loan.list : []).reduce((s, x) => s + nz(x && x.owe), 0),
      limit: nz(w.loan && w.loan.limit), mint: (w.led && w.led.mint) || {}, burn: (w.led && w.led.burn) || {},
      // 還是館友的錢、只是不在籌碼裡（11-18：沒算這些，存款、開槓桿、掛買單時對帳會差壹筆）
      bank: w.bank ? nz(w.bank.save) + (Array.isArray(w.bank.terms) ? w.bank.terms.reduce((s, t) => s + nz(t && t.amt), 0) : 0) : 0,
      margin: (w.lev && Array.isArray(w.lev.pos) ? w.lev.pos : []).reduce((s, x) => s + nz(x && x.margin), 0),
      hold: nz(w.gs && w.gs.hold),
      // 館債：館友買了、還沒到期的本金和債權憑證（莊家欠館友的，不是館友手上的錢，不算進館友的錢合計）
      bondOwed: w.bond ? (Array.isArray(w.bond.list) ? w.bond.list.reduce((s, b) => s + nz(b && b.amt), 0) : 0) + nz(w.bond.iou) : 0 }))
    .sort((a, b) => b.chips - a.chips);
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  console.log(`錢包 ${rows.length} 個，籌碼合計 ${fmt(tot("chips"))}`);
  console.log(`錢包不在籌碼裡的：銀行存款 ${fmt(tot("bank"))}　槓桿保證金 ${fmt(tot("margin"))}　集團股買單鎖住 ${fmt(tot("hold"))}　（館友的錢合計 ${fmt(tot("chips") + tot("bank") + tot("margin") + tot("hold"))}）`);
  console.log(`館債（莊家欠館友、還沒到期的本金＋債權憑證）：${fmt(tot("bondOwed"))}　（${rows.filter(r => r.bondOwed > 0).length} 個錢包）`);
  { const bank = nz(h.bankroll) + nz(h.budget) + nz(h.sea) + nz(h.museum) + nz(h.gov) + nz(h.world) + nz(h.ext) + nz(h.gb && h.gb.cash), players = tot("chips") + tot("bank") + tot("margin") + tot("hold");
    console.log(`全館的錢合計（不含在路上的借款、打到一半的注）：${fmt(bank + players)}　＝ 莊家 ${fmt(h.bankroll)} ＋ 博物館資金 ${fmt(h.budget)} ＋ 海底 ${fmt(h.sea)} ＋ 修繕基金 ${fmt(h.museum)} ＋ 政府帳 ${fmt(h.gov)} ＋ 已知世界 ${fmt(h.world)} ＋ 海外 ${fmt(h.ext)} ＋ 銀行準備金 ${fmt(h.gb && h.gb.cash)} ＋ 館友的錢 ${fmt(players)}`); }
  { // 打到一半的錢（不在錢包也不在莊家帳上，所以上面那行對帳會少）：21 點打到一半的注、牌桌上的注、德州撲克桌上的籌碼（沒投入的加投入的，跳過 NPC）。算法同 functions/casino/casino.js 的 reportSnap
    const read = async c => (await db.collection(c).get()).docs.map(d => { try { return JSON.parse(d.data().data || "{}"); } catch (e) { return {}; } });
    const [rs, ts, hds] = [await read("casinoRounds"), await read("casinoTables"), await read("casinoHoldem")];
    const bj = rs.reduce((a, r) => a + (r && r.state === "playing" ? nz(r.bet) : 0), 0) + ts.reduce((a, t) => a + Object.values((t && t.seats) || {}).reduce((b, x) => b + (x && !x.npc && x.bet > 0 && x.out == null ? nz(x.bet) : 0), 0), 0);
    const hd = hds.reduce((a, t) => a + Object.values((t && t.seats) || {}).reduce((b, x) => b + (x && !x.npc ? nz(x.stack) + nz(x.put) : 0), 0), 0);
    const players2 = tot("chips") + tot("bank") + tot("margin") + tot("hold"), bank2 = nz(h.bankroll) + nz(h.budget) + nz(h.sea) + nz(h.museum) + nz(h.gov) + nz(h.world) + nz(h.ext) + nz(h.gb && h.gb.cash);
    console.log(`打牌中（還在牌桌上的錢）：21 點打到一半的注 ${fmt(bj)}（${rs.filter(r => r && r.state === "playing").length} 局）＋ 德州撲克桌上的籌碼 ${fmt(hd)}（${hds.length} 桌）；含打牌中的全館合計：${fmt(bank2 + players2 + bj + hd)}（上面那行不含這兩項，所以有人坐在德州桌上時會比平常少，不是錢不見了）`);
  }
  rows.forEach((r, i) => {
    console.log(`  #${i + 1}　籌碼 ${fmt(r.chips)}　沒還的借款 ${fmt(r.loan)}　借款額度 ${fmt(r.limit)}` + (r.bank || r.margin || r.hold ? `　存款 ${fmt(r.bank)}　保證金 ${fmt(r.margin)}　買單鎖住 ${fmt(r.hold)}` : ""));
    const m = list(r.mint), b = list(r.burn);
    if (m.length) { console.log("    憑空多的："); m.forEach(l => console.log("  " + l)); }
    if (b.length) { console.log("    消失的："); b.forEach(l => console.log("  " + l)); }
  });
}
// 只讀：壹位館友的投資（11-17 翊文：「能問一下 玩家 YUGA chu投資了多少嗎」）。照名字（members 的 nick，大小寫、空白不計）找錢包，
//   用銀行畫面同壹套算法（casStockViewAll、casStockLevView）印持股、成本、市值、帳面賺賠、槓桿部位、掛單、累計賣出賺賠和手續費。
//   名字在紀錄裡被 --mask 遮成 ***；不印 uid、email。館內股的盤中價要亂數祕密（這裡沒有），用今天的開盤價估。
async function playerInvest(db, name) {
  const key = s => String(s || "").replace(/\s+/g, "").toLowerCase();
  const ms = await db.collection("members").get();
  const hits = ms.docs.filter(d => key(d.data().nick) === key(name));
  if (!hits.length) { console.log("找不到這個名字的館友（比對 members 的暱稱，不分大小寫、空白）"); process.exitCode = 1; return; }
  if (hits.length > 1) console.log(`同名的有 ${hits.length} 位，壹位壹位列`);
  const url = p => require("url").pathToFileURL(path.join(__dirname, "..", "..", "shared", p)).href;
  const { casStockViewAll } = await import(url("casino/stock.js"));
  const { casStockLevView } = await import(url("casino/stock_lev.js"));
  const { taipeiDay } = await import(url("core/logic.js"));
  const hs = await db.doc("casinoHouse/main").get();
  const house = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  const t = Date.now(), day = taipeiDay(t);
  const nz = v => (Number.isFinite(+v) ? +v : 0), fmt = n => Math.round(nz(n)).toLocaleString("en-US"), px = n => nz(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  for (const [i, d] of hits.entries()) {
    const ws = await db.doc(`casinoWallets/${d.id}`).get();
    if (!ws.exists) { console.log(`#${i + 1}：沒有錢包（還沒進過賭場、銀行）`); continue; }
    const w = JSON.parse(ws.data().data || "{}");
    const S0 = JSON.parse(JSON.stringify(w.stk || {}));
    const v = casStockViewAll(w, JSON.parse(JSON.stringify(house)), day, null, []);
    const L = casStockLevView(w, JSON.parse(JSON.stringify(house)), day, t);
    const own = v.list.filter(x => x.mine > 0);
    let val = 0, cost = 0;
    console.log(`#${i + 1}　籌碼 ${fmt(w.chips)}　（${day}）`);
    console.log("  持股：" + (own.length ? "" : "（沒有）"));
    for (const x of own) {
      val += nz(x.value); cost += nz(x.costTotal);
      console.log(`    ${x.name}（${x.market === "in" ? "館內" : x.market === "us" ? "美股" : "台股"}）${fmt(x.mine)} 股　現價 ${px(x.price)}　市值 ${fmt(x.value)}　成本 ${fmt(x.costTotal)}　帳面 ${x.pnl >= 0 ? "+" : ""}${fmt(x.pnl)}${x.locked ? `　掛單鎖住 ${fmt(x.locked)} 股` : ""}`);
    }
    if (own.length) console.log(`    合計：市值 ${fmt(val)}　成本 ${fmt(cost)}　帳面 ${val - cost >= 0 ? "+" : ""}${fmt(val - cost)}`);
    const pos = (L && L.positions) || [];
    console.log("  槓桿／放空：" + (pos.length ? "" : "（沒有）"));
    let mg = 0;
    for (const p of pos) { mg += nz(p.margin); console.log(`    ${p.name} ${p.side === "long" ? "做多" : "放空"} ${p.lev} 倍　${fmt(p.qty)} 股　進場 ${px(p.entry)}　現價 ${px(p.now)}　保證金 ${fmt(p.margin)}　帳面 ${p.pnl >= 0 ? "+" : ""}${fmt(p.pnl)}`); }
    if (pos.length) console.log(`    保證金合計 ${fmt(mg)}`);
    const od = Array.isArray(S0.orders) ? S0.orders : [];
    console.log(`  掛單 ${od.length} 張${od.length ? "：" + od.map(o => `${o.kind === "buy" ? "買" : o.kind === "sell" ? "賣" : "停損"} ${o.id} ${fmt(o.n)} 股 @${px(o.px)}`).join("、") : ""}　買單鎖住的籌碼 ${fmt(S0.hold)}`);
    const lv = w.lev || {};
    console.log(`  累計：現股賣出賺賠（扣稅前）${fmt(S0.gain)}　現股手續費 ${fmt(S0.fee)}　槓桿賺賠 ${fmt(lv.gain)}　槓桿手續費＋利息 ${fmt(lv.fee)}`);
    console.log(`  投入合計（持股成本＋保證金＋買單鎖住）：${fmt(cost + mg + nz(S0.hold))}`);
    const ln = w.loan && Array.isArray(w.loan.list) ? w.loan.list : [], owe = ln.reduce((s, x) => s + nz(x && x.owe), 0); // 11-17 翊文：「好，加借款」
    console.log(`  借款：${ln.length ? `${ln.length} 筆，要還合計 ${fmt(owe)}（借了 ${fmt(ln.reduce((s, x) => s + nz(x && x.amt), 0))}）` : "（沒有）"}　借款額度 ${fmt(w.loan && w.loan.limit)}`);
    for (const x of ln) console.log(`    借 ${x.day || "-"}　本金 ${fmt(x.amt)}　要還 ${fmt(x.owe)}　到期 ${x.due || "-"}${x.due && x.due < day ? "（逾期）" : ""}${x.ext ? `　延期 ${x.ext} 次` : ""}`);
    const lvOwed = Array.isArray(lv.owed) ? lv.owed.reduce((s, e) => s + nz(e && e.amt), 0) : 0;
    if (lvOwed) console.log(`  槓桿強平欠的：${fmt(lvOwed)}`);
    console.log(`  淨值（籌碼＋市值＋保證金＋買單鎖住 − 借款${lvOwed ? "、槓桿欠的" : ""}）：${fmt(nz(w.chips) + val + mg + nz(S0.hold) - owe - lvOwed)}`);
  }
}
// 只讀：館方投資（house.inv）的兩個池子、每天記的價、股價換比例的紀錄（11-17 翊文：館方投資帳面 +57280%、又寫「館方虧太多」→ 查持股有沒有跟著換比例）。
//   不印名字、uid、email；只有莊家文件裡的這幾塊。
// 只讀：前端錯誤回報（見檔頭 client-errors）
async function clientErrors(db) {
  const snap = await db.collection("clientErrors").orderBy("lastAt", "desc").limit(300).get();
  const mask = x => String(x == null ? "" : x).replace(/[w.+-]+@[w-]+(?:.[w-]+)+/g, "（email）").replace(/[A-Za-z0-9]{28}/g, "（uid）");
  const g = new Map();
  for (const d of snap.docs) { const e = d.data(), k = (e.msg || "") + "|" + (e.src || ""); const r = g.get(k) || { msg: e.msg, src: e.src, n: 0, last: 0, vers: new Set(), screens: new Set(), sizes: new Set(), stack: e.stack }; r.n += e.n || 1; const t = e.lastAt && e.lastAt.toMillis ? e.lastAt.toMillis() : 0; if (t > r.last) { r.last = t; r.stack = e.stack; } if (e.ver) r.vers.add(e.ver); if (e.screen) r.screens.add(e.screen); if (e.vw) r.sizes.add(e.vw + "x" + e.vh); g.set(k, r); }
  console.log(`前端錯誤：最近 7 天 ${snap.size} 筆記錄、${g.size} 種（最新在上）`);
  for (const r of [...g.values()].sort((a, b) => b.last - a.last)) {
    console.log(`${r.last ? new Date(r.last).toISOString().slice(0, 19) + "Z" : "?"} ×${r.n}　${mask(r.msg)}`);
    console.log(`    位置 ${mask(r.src) || "?"}　版本 ${[...r.vers].join(",") || "?"}　畫面 ${[...r.screens].join(",") || "?"}　視窗 ${[...r.sizes].slice(0, 4).join(",") || "?"}`);
    mask(r.stack).split("\n").slice(0, 3).filter(Boolean).forEach(l => console.log("    " + l));
  }
}
async function investStatus(db) {
  const hs = await db.doc("casinoHouse/main").get();
  const h = hs.exists ? JSON.parse(hs.data().data || "{}") : {};
  const I = h.inv || {}, S = h.stk || {}, J = x => JSON.stringify(x);
  console.log(`館方投資：day ${I.day || "-"}　peg（這份記到第幾次換比例）${I.pegSeq == null ? "（沒有）" : I.pegSeq}`);
  for (const k of Object.keys(I.pool || {})) { const P = I.pool[k] || {}; console.log(`  池子 ${k}：pnl ${P.pnl}　stopUntil ${P.stopUntil || "-"}`); console.log(`    own ${J(P.own || {})}`); console.log(`    cost ${J(P.cost || {})}`); }
  console.log(`  hx（每天跑壹次記的價）：${J(I.hx || {})}`);
  console.log(`  px ${J(I.px || {})}　lastPx ${J(I.lastPx || {})}`);
  console.log(`  cur ${J(I.cur || null)}`);
  console.log(`  last ${J(I.last || null)}`);
  const peg = S.peg || {};
  console.log(`股價換比例：seq ${peg.seq}　dir ${J(peg.dir || {})}`);
  for (const e of peg.ev || []) console.log(`  #${e.seq} ${e.id} ${e.from} → ${e.to}`);
  console.log(`hist 有哪些天：${Object.keys(S.hist || {}).sort().join("、")}`);
}
const NEEDS_EMAIL = ["invite", "admin-on", "admin-off", "disable", "enable"];
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/.]+$/;

// 清掉「今天調過股價了」的記號。只改 casinoHouse/main 的 stk.day，股價、持股、錢包都不動
async function stockReroll(db) {
  const ref = db.doc("casinoHouse/main");
  const snap = await ref.get();
  if (!snap.exists) { console.log("莊家的文件還不存在，不用清"); return; }
  const h = JSON.parse(snap.data().data || "{}");
  if (!h.stk || !h.stk.day) { console.log("本來就沒有「今天調過了」的記號，不用清"); return; }
  const was = h.stk.day;
  delete h.stk.day;
  await ref.set({ data: JSON.stringify(h) }, { merge: true });
  console.log(`清掉了：本來記著 ${was} 調過價。下壹個進賭場的人會重算壹次。`);
}
// 整理輸入。不合規矩丟錯誤（錯誤訊息不含 email）
function parseTask(inputs) {
  const o = inputs || {};
  const action = String(o.action || "").trim();
  if (!ACTIONS.includes(action)) throw new Error("沒有這個動作");
  if (action === "player-invest") { const name = Array.from(String(o.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 40).join(""); if (!name) throw new Error("要填名字"); return { action, name }; }
  if (!NEEDS_EMAIL.includes(action)) return { action };
  const email = String(o.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw new Error("email 的格式不對");
  const name = Array.from(String(o.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 20).join("");
  return { action, email, name };
}

// 這個動作要怎麼改那一筆。exists、data ＝ invites/{email} 現在的樣子。回傳 { write: 要 merge 的欄位或 null, remove: 要刪的欄位, message }
function planTask(task, exists, data) {
  const d = data || {};
  switch (task.action) {
    case "invite":
      return { write: Object.assign({ disabled: false }, task.name ? { name: task.name } : exists ? {} : { name: "" }), remove: [], message: exists ? "這個人本來就在邀請名單上，資料更新了。" : "邀請名單多了壹位。" };
    case "admin-on":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上，先邀請才能設管理員。沒有改任何東西。", fail: true };
      return { write: { admin: true }, remove: [], message: d.admin === true ? "這個人本來就是管理員。" : "設成管理員了。" };
    case "admin-off":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { admin: false }, remove: [], message: "取消管理員了。" };
    case "disable":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { disabled: true }, remove: [], message: "停用了：還沒加入的進不來、管理員失效。已經加入的還進得去。" };
    case "enable":
      if (!exists) return { write: null, remove: [], message: "這個人不在邀請名單上。沒有改任何東西。", fail: true };
      return { write: { disabled: false }, remove: [], message: "恢復了。" };
    default:
      throw new Error("沒有這個動作");
  }
}

const readEvent = () => {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) throw new Error("這支要在 GitHub Actions 裡跑");
  return (JSON.parse(fs.readFileSync(p, "utf8")).inputs) || {};
};

// 看大家合起來的數字
async function stats(db) {
  const count = async q => (await q.count().get()).data().count;
  const inv = db.collection("invites");
  const dayAgo = new Date(Date.now() - 86400000), weekAgo = new Date(Date.now() - 7 * 86400000);
  const rows = [
    ["邀請名單", await count(inv)],
    ["其中管理員", await count(inv.where("admin", "==", true))],
    ["其中停用", await count(inv.where("disabled", "==", true))],
    ["館友（登入過）", await count(db.collection("members"))],
    ["有存檔的", await count(db.collection("saves"))],
    ["最近 24 小時有存檔", await count(db.collection("saves").where("updatedAt", ">=", dayAgo))],
    ["最近 7 天有存檔", await count(db.collection("saves").where("updatedAt", ">=", weekAgo))],
  ];
  rows.forEach(([k, v]) => console.log(`${k}：${v}`));
}

// 寫：今天的館訊提早發（見檔頭 digest-now）。組字照 functions/discord/discord_digest.js 的 digestRun（dcDigestPost），寫法照 outboxPut（create：同壹天第二次寫會失敗）
async function digestText(now = Date.now()) {
  const { pathToFileURL } = require("url"), imp = f => import(pathToFileURL(path.join(__dirname, "..", "..", "shared", f)).href);
  require("../content/notices_build.cjs").write(); // shared/game/notices_data.js 不進 git，先產生
  const { NOTICES, NOTICE_AREAS, noticeArea } = await imp("game/notices.js"), { taipeiDay } = await imp("core/logic.js"), { dcDigestPost } = await imp("discord/out.js");
  const day = taipeiDay(now);
  return { day, text: dcDigestPost(NOTICES, day, noticeArea, NOTICE_AREAS) };
}
async function digestNow(db) {
  const { day, text } = await digestText();
  if (!text) { console.log(`${day} 今天沒有公告，不發`); return; }
  try {
    await db.doc(`discordOutbox/digest-${day}`).create({ kind: "digest", text, status: "pending", at: Date.now() });
    console.log(`${day} 館訊寫進 discordOutbox 了（${[...text].length} 字），伺服器會馬上發；20:00 那次會看到寫過了，不會再發`);
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) { console.log(`${day} 今天的館訊已經寫過了，不會重發`); return; }
    throw e;
  }
}

async function main() {
  const inputs = readEvent();
  if (process.argv.includes("--mask")) { // 這一步在最前面：之後的紀錄都會把它們遮掉
    for (const v of [inputs.email, inputs.name]) { const s = String(v || "").trim(); if (s) { console.log(`::add-mask::${s}`); console.log(`::add-mask::${s.toLowerCase()}`); } }
    return;
  }
  const task = parseTask(inputs);
  const root = path.join(__dirname, "..", "..", "functions", "node_modules");
  const { initializeApp, applicationDefault } = require(path.join(root, "firebase-admin", "lib", "app", "index.js"));
  const { getFirestore, FieldValue } = require(path.join(root, "firebase-admin", "lib", "firestore", "index.js"));
  const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  if (sa.project_id !== "pepe-museum") throw new Error("金鑰不是 pepe-museum 的");
  if (task.action === "fn-errors") { await fnErrors(applicationDefault(), sa.project_id); return; }
  initializeApp({ credential: applicationDefault(), projectId: sa.project_id });
  const db = getFirestore();
  if (task.action === "stats") { await stats(db); return; }
  if (task.action === "stock-reroll") { await stockReroll(db); return; }
  if (task.action === "house-ledger") { await houseLedger(db); return; }
  if (task.action === "stock-status") { await stockStatus(db); return; }
  if (task.action === "econ-status") { await econStatus(db); return; }
  if (task.action === "stock-tw-peg") { await stockTwPeg(db); return; }
  if (task.action === "house-size") { await houseSize(db); return; }
  if (task.action === "world-status") { await worldStatus(db); return; }
  if (task.action === "player-invest") { await playerInvest(db, task.name); return; }
  if (task.action === "invest-status") { await investStatus(db); return; }
  if (task.action === "client-errors") { await clientErrors(db); return; }
  if (task.action === "advisor-rules-mail") { await advisorRulesMail(db, FieldValue); return; }
  if (task.action === "digest-now") { await digestNow(db); return; }
  const ref = db.doc(`invites/${task.email}`);
  const snap = await ref.get();
  const plan = planTask(task, snap.exists, snap.data());
  if (plan.write) await ref.set(Object.assign({}, plan.write, { taskAt: FieldValue.serverTimestamp() }), { merge: true });
  console.log(plan.message);
  if (plan.fail) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error("沒做成：" + String(e.message || e).split("\n")[0].slice(0, 300)); process.exit(1); });
module.exports = { ACTIONS, parseTask, planTask, econPick, econCrc, houseLedger, worldStatus, digestText };
