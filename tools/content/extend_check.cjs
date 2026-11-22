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
    if (asList(x.leads).length < 3) E(w, "leads 至少要三個去處（三條線索原則、永遠有三個去處）");
    else asList(x.leads).forEach(l => { if (typeof l !== "string" || !l.trim()) E(w, "leads 每個要有字"); });
  });
}
module.exports = { checkExtend };
