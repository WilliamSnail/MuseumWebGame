// 交代人互動台詞的檢查：node tools/check/givers_check.cjs（npm test 會跑）
// 檢查 content/givers/<id>.json（規劃在 docs/規劃/交代人互動規劃.md，決定 0151）。
// 規矩：id 要在帳本 taskGivers.list、檔名＝id；每句 40 字內；不放英文字母（只有 yuga 的 R）和阿拉伯數字；
//   畫面上的字用「壹」不用「一」；不寫贏輸賺賠、不催、不叫人掏錢；不碰謎底（規劃第 5 節的字）；
//   每個時段要有閒聊，不在的時段要有字條；稱呼四級都要有。
//   第三批：chat.mention（Lv2 起提到別人）、title（稱號）、pairs（串門子，記在字母順序在前那位的檔）。
// 別的檔可以 require：checkGivers({ givers, ledger })
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const G = require("../../test/load_shared.cjs").load();
const DIR = path.join(ROOT, "content", "givers");
const LEDGER = path.join(ROOT, "content", "story", "帳本.json");
const MAX = 40;
const NAME_MAX = 8; // 代入 {name} 時，名字最長算幾個字
const SLOTS = ["morning", "noon", "evening", "night"];
// 臨時拜託連到的現有動作（不放籌碼動作：存錢、買賣；拜託不給籌碼）
const KINDS = ["visit", "sendPepe", "eat", "lostbox", "casinoCollection", "cellar", "cellarExhibit", "spot", "read", "stock", "auction", "tell"];
// 送禮喜好只認這五個欄位（數值平衡 11-21：伺服器只認這些）；失敗作只能放在稀有度
const GIFT_CATS = ["稀有度", "心情", "顏色", "帽子", "姿勢"];
const NOPE = ["贏", "輸", "賺", "賠", "掏錢", "趕快", "快點", "最後機會", "別錯過", "再來", "多玩", "加碼", "下注", "梭哈", "連贏", "手氣"];
// 規劃第 5 節：撥款信那條線和後面的季才揭的事
const SPOILERS = ["池子", "水位", "門檻", "名牌", "文化部", "收走", "請離開", "請跟我來", "會計", "排隊", "警衛", "水閘", "交接", "下壹位館長", "總帳", "別的館", "120", "禮包"];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const len = s => [...String(s)].length;

function readGivers(dir = DIR) {
  const givers = [], bad = [];
  if (!fs.existsSync(dir)) return { givers, bad };
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); o.__file = f; givers.push(o); } catch (e) { bad.push(`content/givers/${f}：JSON 讀不了（${e.message}）`); }
  }
  return { givers, bad };
}

// 台詞檔只能往後加（規劃 9.2）：交談紀錄只存句子 id（<id>:<欄位>:<序>），中間拿掉或插入，舊紀錄就會指到別句。
// content/givers/_ids.json 記每個陣列目前的句數和稱號 id；句數變少、欄位不見、稱號 id 改了都會擋。
// 句子真的要拿掉：改完跑 node tools/check/givers_check.cjs --update --allow-shrink（並寫進決定或日誌）。
function snapshotIds(givers) {
  const out = {};
  const walk = (p, v) => {
    if (Array.isArray(v)) { out[p] = v.length; v.forEach((x, i) => { if (Array.isArray(x) || isObj(x)) walk(`${p}[${i}]`, x); }); }
    else if (isObj(v)) for (const k of Object.keys(v)) walk(p ? `${p}.${k}` : k, v[k]);
    else if (p.endsWith("title.id")) out[p] = String(v);
  };
  for (const g of givers) walk(g.id, Object.fromEntries(Object.entries(g).filter(([k]) => !["id", "__file", "name", "where"].includes(k))));
  return out;
}
function checkIds(givers, snap) {
  const now = snapshotIds(givers), errors = [];
  for (const [k, v] of Object.entries(snap || {})) {
    if (!(k in now)) errors.push(`content/givers：${k} 不見了（台詞檔只能往後加；真的要拿掉用 --update --allow-shrink）`);
    else if (typeof v === "number" && now[k] < v) errors.push(`content/givers：${k} 從 ${v} 句變成 ${now[k]} 句（台詞檔只能往後加，不能拿掉或重排）`);
    else if (typeof v === "string" && now[k] !== v) errors.push(`content/givers：${k} 從「${v}」改成「${now[k]}」（稱號 id 改了，舊的稱號會對不上）`);
  }
  return errors;
}

function checkGivers({ givers = [], bad = [], ledger = null, ids: snap = null } = {}) {
  const errors = bad.slice();
  const E = (w, m) => errors.push(`${w}：${m}`);
  const ids = new Set(((ledger && ledger.taskGivers && ledger.taskGivers.list) || []).map(g => g.id));
  const seen = new Set();
  const line = (w, s, id) => {
    if (typeof s !== "string" || !s.trim()) return E(w, "要有字");
    const t = s.replace(/\{name\}/g, "名".repeat(NAME_MAX));
    if (len(t) > MAX) E(w, `太長了（${len(t)} 字，最多 ${MAX}）`);
    if (s.includes("一")) E(w, "畫面上的字用「壹」，不要用「一」");
    const u = id === "yuga" ? s.replace(/R/g, "阿") : s;
    if (/[A-Za-z]/.test(u.replace(/\{name\}/g, ""))) E(w, "不要有英文字母（只有 yuga 可以寫 R）");
    if (/[0-9]/.test(s)) E(w, "不要有阿拉伯數字");
    const n = NOPE.find(x => s.includes(x)); if (n) E(w, `不能寫「${n}」（不寫贏輸賺賠、不催、不叫人掏錢）`);
    const p = SPOILERS.find(x => s.includes(x)); if (p) E(w, `不能寫「${p}」（撥款信那條線、後面才揭的事）`);
  };
  const list = (w, a, min, id) => { if (!Array.isArray(a)) return E(w, "要是陣列"); if (a.length < min) E(w, `至少 ${min} 句（現在 ${a.length}）`); a.forEach((s, i) => line(`${w}[${i}]`, s, id)); };
  const extra = (g, w) => {
    if (g.story === undefined && g.errands === undefined && g.gift === undefined) return; // 第一批的檔還沒有第二批欄位
    const st = g.story;
    if (!isObj(st) || !Array.isArray(st.parts) || st.parts.length !== 3) E(`${w}.story`, "要有 parts（3 段）和 last");
    else { st.parts.forEach((p, i) => { if (!Array.isArray(p) || p.length !== 3) E(`${w}.story.parts[${i}]`, "每段 3 句"); else list(`${w}.story.parts[${i}]`, p, 3, g.id); }); line(`${w}.story.last`, st.last, g.id); }
    if (!Array.isArray(g.errands) || g.errands.length < 3) E(`${w}.errands`, "臨時拜託至少 3 件");
    else g.errands.forEach((e, i) => {
      const ew = `${w}.errands[${i}]`;
      if (!isObj(e) || !KINDS.includes(e.kind)) return E(ew, `kind 只能是 ${KINDS.join("、")}`);
      line(`${ew}.ask`, e.ask, g.id); line(`${ew}.done`, e.done, g.id);
      if (e.kind === "tell") { if (!ids.has(e.to) || e.to === g.id) E(ew, "tell 要有 to，是另壹位交代人"); } else if (e.to !== undefined) E(ew, "只有 tell 可以有 to");
    });
    const gf = g.gift;
    if (!isObj(gf)) return E(`${w}.gift`, "要有 gift");
    for (const k of ["likes", "dislikes"]) {
      if (!isObj(gf[k])) { E(`${w}.gift.${k}`, "要是物件（欄位是稀有度、心情、顏色、帽子、姿勢）"); continue; }
      for (const [cat, names] of Object.entries(gf[k])) {
        if (!GIFT_CATS.includes(cat)) { E(`${w}.gift.${k}.${cat}`, `欄位只能是 ${GIFT_CATS.join("、")}`); continue; }
        (Array.isArray(names) ? names : []).forEach(n => { const ok = n === "失敗作" ? cat === "稀有度" : G.optOf(cat, n); if (!ok) E(`${w}.gift.${k}.${cat}`, `「${n}」不是圖鑑裡的選項`); });
      }
    }
    if (!Object.keys(gf.likes || {}).length) E(`${w}.gift.likes`, "至少有壹個喜好");
    list(`${w}.gift.love`, gf.love, 2, g.id); list(`${w}.gift.ok`, gf.ok, 2, g.id); list(`${w}.gift.off`, gf.off, 2, g.id); list(`${w}.gift.first`, gf.first, 1, g.id);
  };
  for (const g of givers) {
    const w = `content/givers/${g.__file || g.id}`;
    if (!g.id || !ids.has(g.id)) E(w, `id「${g.id}」不在帳本 taskGivers.list`);
    if (g.__file && g.__file !== `${g.id}.json`) E(w, "檔名要跟 id 一樣");
    if (seen.has(g.id)) E(w, "id 重複"); seen.add(g.id);
    if (!isObj(g.call)) E(w, "要有 call（稱呼四級 0～3）");
    else for (const lv of [0, 1, 2, 3]) { const c = g.call[lv]; line(`${w}.call.${lv}`, c, g.id); if (typeof c === "string" && len(c) > 12) E(`${w}.call.${lv}`, "稱呼最多 12 字"); }
    const c = g.chat;
    if (!isObj(c)) { E(w, "要有 chat"); continue; }
    const away = isObj(g.away) ? g.away : {};
    for (const s of SLOTS) {
      if ((c[s] || []).length) list(`${w}.chat.${s}`, c[s], 3, g.id);
      else if (!(away[s] || []).length) E(`${w}.chat.${s}`, "這個時段沒有閒聊，也沒有字條（away）");
    }
    for (const s of Object.keys(away)) { if (!SLOTS.includes(s)) E(`${w}.away.${s}`, `時段只能是 ${SLOTS.join("、")}`); else list(`${w}.away.${s}`, away[s], 2, g.id); }
    list(`${w}.chat.annoyed`, c.annoyed, 3, g.id);
    list(`${w}.chat.lowSan`, c.lowSan, 3, g.id);
    list(`${w}.chat.named`, c.named, 3, g.id);
    if (!isObj(c.yesterday)) E(`${w}.chat.yesterday`, "要有 yesterday：task、visit、gift");
    else for (const k of ["task", "visit", "gift"]) list(`${w}.chat.yesterday.${k}`, c.yesterday[k], 1, g.id);
    // 第三批：Lv2 起提到別人、稱號、串門子
    if (c.mention !== undefined) {
      if (!isObj(c.mention)) E(`${w}.chat.mention`, "要是物件（對方 id → 句子陣列）");
      else for (const [o, a] of Object.entries(c.mention)) {
        if (o === g.id || !ids.has(o)) E(`${w}.chat.mention.${o}`, "要是另壹位交代人的 id");
        list(`${w}.chat.mention.${o}`, a, 1, g.id);
      }
    }
    const t = g.title;
    if (t !== undefined) {
      if (!isObj(t)) E(`${w}.title`, "要有 id、name、desc");
      else {
        if (!/^[a-z0-9]{1,20}$/.test(t.id || "")) E(`${w}.title.id`, "稱號 id 要是小寫英數 1～20 字");
        line(`${w}.title.name`, t.name, g.id); if (typeof t.name === "string" && len(t.name) > 12) E(`${w}.title.name`, "稱號最多 12 字");
        line(`${w}.title.desc`, t.desc, g.id);
      }
    }
    if (g.pairs !== undefined) {
      if (!isObj(g.pairs)) E(`${w}.pairs`, "要是物件（對方 id → 串門子）");
      else for (const [o, p] of Object.entries(g.pairs)) {
        const pw = `${w}.pairs.${o}`;
        if (!ids.has(o) || o === g.id) { E(pw, "要是另壹位交代人的 id"); continue; }
        if (!(g.id < o)) E(pw, "串門子只記在字母順序在前那位的檔（對話紀錄也記在那位名下）");
        if (!isObj(p)) { E(pw, "要有 where、slot、talks"); continue; }
        line(`${pw}.where`, p.where, g.id);
        if (!SLOTS.includes(p.slot)) E(`${pw}.slot`, `時段只能是 ${SLOTS.join("、")}`);
        if (p.day !== undefined && p.day !== "sun") E(`${pw}.day`, "day 目前只有 sun（週日）");
        if (!Array.isArray(p.talks) || !p.talks.length) { E(`${pw}.talks`, "至少壹段對話"); continue; }
        p.talks.forEach((tk, i) => {
          const tw = `${pw}.talks[${i}]`;
          if (!Array.isArray(tk) || tk.length < 2 || tk.length > 3) return E(tw, "每段 2～3 句");
          tk.forEach((l, j) => {
            if (!isObj(l) || ![g.id, o].includes(l.by)) return E(`${tw}[${j}]`, "by 要是這兩位其中壹位");
            line(`${tw}[${j}]`, l.say, l.by);
          });
        });
      }
    }
    extra(g, w);
  }
  for (const id of ids) if (givers.length && !seen.has(id)) E("content/givers", `帳本有交代人「${id}」，但沒有 ${id}.json`);
  if (snap) errors.push(...checkIds(givers, snap));
  return { errors };
}

module.exports = { checkGivers, readGivers, SLOTS, snapshotIds, checkIds };

if (require.main === module) {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const { givers, bad } = readGivers();
  const IDS = path.join(DIR, "_ids.json");
  if (process.argv.includes("--update")) {
    const old = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {};
    const errs = process.argv.includes("--allow-shrink") ? [] : checkIds(givers, old);
    if (errs.length) { console.log(errs.map(e => "✗ " + e).join("\n")); process.exit(1); }
    fs.writeFileSync(IDS, JSON.stringify(snapshotIds(givers), null, 1) + "\n");
    console.log("寫好 content/givers/_ids.json");
  }
  const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : null;
  const r = checkGivers({ givers, bad, ledger, ids });
  if (r.errors.length) { console.log(r.errors.map(e => "✗ " + e).join("\n")); process.exit(1); }
  console.log(`交代人台詞：${givers.length} 位，都過`);
}
