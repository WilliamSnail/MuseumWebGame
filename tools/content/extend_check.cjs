// 帳本 extend（延伸世界：六週表、人物線、旁證審查；翊文 2026-11-22）的格式檢查。
// 只看格式和對得上，不看寫得好不好。規則在帳本 extend.規則 和 docs/規劃/延伸世界深入規劃.md。
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const asList = v => Array.isArray(v) ? v : [];
const MARKS = /[\s，。、；：！？「」『』（）()\[\]【】《》…—,.;:!?"'·]/g;
const AUDIT_STATUS = ["待審", "審過", "退回"];

// L：帳本；giverIds：交代人 id；E(位置, 訊息) 錯誤；W 警告
function checkExtend(L, E, W, lw) {
  const X = L && L.extend;
  if (X == null) return;
  if (!isObj(X)) { E(`${lw}.extend`, "要是物件"); return; }
  const mys = asList(L.mysteries && L.mysteries.list), mysIds = new Set(mys.map(m => m && m.id));
  const beatIds = new Set(asList(L.revealBeats && L.revealBeats.list).map(b => b && b.id));
  const giverIds = new Set(asList(L.taskGivers && L.taskGivers.list).map(g => g && g.id));
  const grams = new Set();
  mys.forEach(m => [m && m.truth, m && m.understood].forEach(t => { if (typeof t !== "string") return; const x = t.replace(MARKS, ""); for (let i = 0; i + 6 <= x.length; i++) grams.add(x.slice(i, i + 6)); }));
  const weeks = isObj(X.weeks) ? X.weeks : {}, threads = asList(X.threads);
  if (!isObj(X.weeks)) E(`${lw}.extend.weeks`, "要是 { 週: {...} }");
  if (!Array.isArray(X.threads)) E(`${lw}.extend.threads`, "要是陣列");
  const tids = new Set(), byWeek = {}, lastStage = {};
  threads.forEach((t, i) => {
    const w = `${lw}.extend.threads[${i}]`;
    if (!isObj(t)) { E(w, "要是物件"); return; }
    if (!/^t-[a-z]+-\d+$/.test(t.id || "")) E(w, "id 要是 t-人-階（例如 t-number-1）"); else if (tids.has(t.id)) E(w, `id「${t.id}」重複`); else tids.add(t.id);
    if (!/^\d{4}-W\d{2}$/.test(t.week || "")) E(w, "week 要是週的名字");
    else { if (!weeks[t.week]) E(w, `week「${t.week}」不在 extend.weeks 裡`); (byWeek[t.week] = byWeek[t.week] || []).push(t.id); }
    if (giverIds.size && !giverIds.has(t.person)) E(w, `person「${t.person}」不在 taskGivers 裡`);
    if (!Number.isInteger(t.stage) || t.stage < 1 || t.stage > 5) E(w, "stage 要是 1～5");
    { const tm = mys.find(y => y && y.id === t.mystery); if (tm && /^\d{4}-W\d{2}$/.test(tm.closeBy || "") && t.week > tm.closeBy) E(w, `week ${t.week} 晚於 ${t.mystery} 的收線週 ${tm.closeBy}（旁證要在收線前放）`); }
    if (!mysIds.has(t.mystery)) E(w, `mystery「${t.mystery}」不在 mysteries 裡`);
    ["seed", "where", "corroborates"].forEach(k => { if (typeof t[k] !== "string" || !t[k].trim()) E(w, `${k} 要有字`); });
    // 人物線一個人一階一階上：同壹個人，週越晚階越高
    if (t.person && Number.isInteger(t.stage)) { const p = lastStage[t.person]; if (p && (t.week < p.week || (t.week > p.week && t.stage < p.stage))) E(w, `${t.person} 的階要隨週數往上（上壹條是 ${p.week} 的第 ${p.stage} 階）`); lastStage[t.person] = { week: t.week, stage: t.stage }; }
    if (typeof t.seed === "string") { const x = t.seed.replace(MARKS, ""); for (let a = 0; a + 6 <= x.length; a++) if (grams.has(x.slice(a, a + 6))) { E(w, `破梗：seed 的「${x.slice(a, a + 6)}」跟 mysteries 的謎底字句壹樣（旁證只寫看到的）`); break; } }
    const a = t.audit;
    if (!isObj(a)) E(w, "audit 要有（旁證每條都要審；翊文 11-22）");
    else {
      if (!AUDIT_STATUS.includes(a.status)) E(w, `audit.status 要是 ${AUDIT_STATUS.join("、")}`);
      else if (a.status === "審過") {
        if (typeof a.by !== "string" || !a.by.trim()) E(w, "審過的要寫 audit.by（誰審的）");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.on || "")) E(w, "審過的要寫 audit.on（日期）");
        if (asList(a.checks).length < 3) E(w, "審過的 audit.checks 至少列三項檢查");
      } else if (a.status === "退回" && typeof a.note !== "string") E(w, "退回的要在 audit.note 寫原因");
    }
  });
  asList(X.items).forEach((it, i) => {
    const w = `${lw}.extend.items[${i}]`;
    if (!isObj(it)) { E(w, "要是物件"); return; }
    ["id", "name", "book", "lore", "extraPage"].forEach(k => { if (typeof it[k] !== "string" || !it[k].trim()) E(w, `${k} 要有字`); });
    if (!weeks[it.week]) E(w, `week「${it.week}」不在 extend.weeks 裡`); else if (!asList(weeks[it.week].drops).includes(it.id)) E(w, `extend.weeks.${it.week}.drops 要列 ${it.id}`);
    const m = mys.find(y => y && y.id === it.mystery);
    if (!m) E(w, `mystery「${it.mystery}」不在 mysteries 裡`); else if (it.week > m.closeBy) E(w, `week ${it.week} 晚於 ${it.mystery} 的收線週 ${m.closeBy}`);
    [it.lore, it.extraPage].forEach(t => { if (typeof t !== "string") return; const x = t.replace(MARKS, ""); for (let q = 0; q + 6 <= x.length; q++) if (grams.has(x.slice(q, q + 6))) { E(w, `破梗：「${x.slice(q, q + 6)}」跟 mysteries 的謎底字句壹樣`); break; } });
    if (!isObj(it.audit) || it.audit.status !== "審過" || asList(it.audit.checks).length < 3) E(w, "audit 要是審過、checks 至少三項（掉落的來歷每條都要審）");
  });
  // 總表 extend.collect（翊文 11-22：年底壹起收）：每條線哪週收、收在哪個謎底下、四問；只有集團可以寫「不負責：原因」，文化部和已知世界要扛恐懼、代價、佩佩
  const C = X.collect;
  if (C != null) {
    const cw = lw + ".extend.collect", rows = isObj(C) ? asList(C.rows) : [], cids = new Set();
    if (!isObj(C) || !rows.length) E(cw, "要是 { rows: [...] }，至少壹列");
    rows.forEach((r, i) => {
      const w = cw + ".rows[" + i + "]";
      if (!isObj(r)) { E(w, "要是物件"); return; }
      if (!/^c-[a-z0-9-]+$/.test(r.id || "")) E(w, "id 要是 c-xxx"); else if (cids.has(r.id)) E(w, "id「" + r.id + "」重複"); else cids.add(r.id);
      if (typeof r.line !== "string" || !r.line.trim()) E(w, "line 要有字");
      if (!weeks[r.week]) E(w, "week「" + r.week + "」不在 extend.weeks 裡");
      if (typeof r.under !== "string" || !r.under.trim()) E(w, "under 要寫收在哪個謎底下");
      ["dread", "cost", "pepe", "horror"].forEach(k => {
        if (typeof r[k] !== "string" || r[k].trim().length < 4) { E(w, k + " 要有字（寫怎麼做到，或「不負責：原因」）"); return; }
        if (r[k].startsWith("不負責：")) {
          if (r.kind !== "集團") E(w, k + " 只有集團可以寫「不負責」；" + r.kind + " 要自己扛");
          else if (r[k].trim().length < 10) E(w, k + " 的「不負責」要寫原因和同週誰補");
        }
      });
      if (r.id === "c-culture" || r.id === "c-known") ["dread", "cost", "pepe"].forEach(k => { if (typeof r[k] === "string" && r[k].startsWith("不負責")) E(w, r.id + " 的 " + k + " 不能寫不負責（文化部和已知世界要扛）"); });
    });
    ["c-culture", "c-known", "c-grant-threshold", "c-grant-holder", "c-grant-taken"].forEach(id => { if (!cids.has(id)) E(cw, "少了 " + id + " 那列"); });
    ["m-count", "m-world", "m-accountant", "m-capital", "m-guard", "m-queue", "m-ledger", "m-you"].forEach(id => { if (!cids.has("c-" + id)) E(cw, "少了 c-" + id + " 那列（八個謎都要在總表）"); });
    Object.keys(weeks).forEach(k => asList(weeks[k] && weeks[k].lines).forEach(id => { if (!cids.has(id)) E(lw + ".extend.weeks." + k + ".lines", "「" + id + "」不在 extend.collect 裡"); }));
  }
  Object.keys(weeks).forEach(k => {
    const x = weeks[k], w = `${lw}.extend.weeks.${k}`;
    if (!/^\d{4}-W\d{2}$/.test(k)) { E(w, "鍵要是週的名字"); return; }
    if (!isObj(x)) { E(w, "要是物件"); return; }
    ["kind", "question"].forEach(f => { if (typeof x[f] !== "string" || !x[f].trim()) E(w, `${f} 要有字`); });
    if (!Number.isInteger(x.stage) || x.stage < 1 || x.stage > 5) E(w, "stage 要是 1～5");
    asList(x.beats).forEach(b => { if (!beatIds.has(b)) E(w, `beats「${b}」不在 revealBeats 裡`); });
    const ids = asList(x.threads);
    if (ids.length > 2) E(w, `壹週最多兩條人物線（現在 ${ids.length} 條）`);
    ids.forEach(id => { if (!tids.has(id)) E(w, `threads「${id}」不在 extend.threads 裡`); });
    (byWeek[k] || []).forEach(id => { if (!ids.includes(id)) E(w, `extend.threads 的「${id}」寫了這週，卻沒列在這週的 threads`); });
    if (typeof x.conclusion !== "string" || !x.conclusion.trim()) E(w, "conclusion 要有字（這週要讓玩家推出來的結論）");
    const cl = asList(x.clues);
    if (cl.length < 3 || new Set(cl.map(c => c && c.where)).size < 3) E(w, "clues 至少三條、分在三種以上不同的地方（三條線索原則）");
    cl.forEach(c => { if (!isObj(c) || !c.where || !c.what) E(w, "clues 每條要有 where 和 what"); });
    asList(x.closes).forEach(id => { const m = mys.find(y => y && y.id === id); if (!m) E(w, `closes「${id}」不在 mysteries 裡`); else if (m.closeBy !== k) E(w, `closes「${id}」的 closeBy 是 ${m.closeBy}，不是這週（extend.weeks 要跟 mysteries 對得上）`); });
    // 四問自我審查（翊文 11-22）：恐懼、代價、佩佩、嚇人的展品，每週都要寫
    [["dread", "恐懼：這週的問題底下的那壹層"], ["cost", "代價：知道了就回不去的揭露和理智代價"], ["pepe", "佩佩：直接指向牠的線索"], ["horror", "嚇人的展品：這週用的那壹件"]].forEach(([k, label]) => {
      const f = x[k];
      if (!isObj(f)) { E(w, k + " 要有（" + label + "）：{ what, day, where }"); return; }
      if (typeof f.what !== "string" || f.what.trim().length < 8) E(w, k + ".what 要寫這週怎麼做到（8 字以上）");
      if (!/^d[1-7]$/.test(f.day || "")) E(w, k + ".day 要是 d1～d7（放在哪天）");
      if (typeof f.where !== "string" || !f.where.trim()) E(w, k + ".where 要寫放在哪裡");
      if (k === "cost" && (typeof f.san !== "string" || !f.san.trim())) E(w, "cost.san 要寫理智代價（例如 1/1D4）");
      if (k === "cost" && f.understand !== undefined) [f.understand].concat(asList(f.understand && f.understand.more)).forEach((u, j) => {
        const uw = w + ".cost.understand" + (j ? ".more[" + (j - 1) + "]" : "");
        if (!isObj(u)) { E(uw, "要是物件"); return; }
        const parts = String(u.san).split("/").map(t => t.trim()), fail = parts[1] || "", mx = /^([0-9]+)D([0-9]+)$/.exec(fail), pr = t => typeof t === "string" && /^\(.+\)$/.test(t.trim());
        if (parts.length !== 2 || parts[0] !== "0" || !(mx || /^[0-9]+$/.test(fail))) E(uw, "san 要寫「0/失敗的擲法」（成功不扣），例：0/1D4");
        else if ((mx ? +mx[1] * +mx[2] : +fail) > 6) E(uw, "失敗最多扣 6 點");
        if (!pr(u.successAside) || !pr(u.failAside)) E(uw, "successAside、failAside 要有，寫成 (…)");
      });
    });
    // 每週都要有 dayPlan（d1～d7；翊文 11-22，排程每天看今天那壹項）
    if (!isObj(x.dayPlan)) E(w, "dayPlan 要有：{ d1: \"…\", …, d7: \"…\" }（每天放什麼）");
    else ["d1", "d2", "d3", "d4", "d5", "d6", "d7"].forEach(d => { if (typeof x.dayPlan[d] !== "string" || x.dayPlan[d].trim().length < 8) E(w, "dayPlan." + d + " 要寫這天放什麼（8 字以上）"); });
    if (asList(x.leads).length < 3) E(w, "leads 至少要三個去處（三條線索原則、永遠有三個去處）");
    else asList(x.leads).forEach(l => { if (typeof l !== "string" || !l.trim()) E(w, "leads 每個要有字"); });
  });
}
module.exports = { checkExtend };
