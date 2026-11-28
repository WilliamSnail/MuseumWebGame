// 全館投票的內容分版（決定 0166；格式 content/README.md「照投票結果分版」；遊戲這邊在 shared/story/vote.js 的 voteDay）
// week_check 用：有分版的內容時，① 這裡查分版本身（三版齊不齊、id、線索、放的位置和日期）② week_check 對三個結果各跑壹遍平常的檢查。
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const asList = v => (Array.isArray(v) ? v : []);
const CATS = [["books", d => d.books], ["adds", d => d.adds], ["show.works", d => (isObj(d.show) ? d.show.works : null)], ["understand", d => d.understand]];

// 回傳 { has, errors }。has：內容裡有沒有任何分版的東西
function voteShape(files, G) {
  const C = G.NUM.story.vote, opts = C.options, errors = [], ids = {};
  const E = (where, msg) => errors.push(`${where}：${msg}`);
  const resultDay = G.taipeiDay(G.voteTimes(C).resultAt);
  let has = false;
  Object.keys(files || {}).sort().forEach(rel => {
    const day = files[rel];
    if (!isObj(day)) return;
    const where = `content/weeks/${rel}`;
    // 全部的 vote 欄位、voteBoard 在哪裡
    const found = [];
    const walk = (v, p) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (isObj(v)) Object.keys(v).forEach(k => { if (k === "vote" || k === "voteBoard") found.push({ p, k }); else walk(v[k], p ? `${p}.${k}` : k); }); };
    walk(day, "");
    if (!found.length) return;
    has = true;
    const m = /^(\d{4}-W\d{2})\/d([1-7])\.json$/.exec(rel);
    if (!m) { E(where, "照投票結果分版的內容只能放在正式週的每天檔（d1～d7）"); return; }
    const date = G.addDays(G.isoMonday(m[1]), +m[2] - 1);
    if (date < resultDay) E(where, `分版的內容要放在公布日（${resultDay}）以後；更早的日子沒有人看得到`);
    found.forEach(f => {
      const okVote = f.k === "vote" && /^(books|adds|show\.works|understand)\[\d+\]$/.test(f.p), okBoard = f.k === "voteBoard" && f.p === "";
      if (!okVote && !okBoard) E(`${where}${f.p ? "." + f.p : ""}`, `${f.k} 不能寫在這裡（vote 只給 books、adds、show.works、understand 的條目；voteBoard 寫在最外層）`);
    });
    if (day.voteBoard !== undefined) {
      const b = day.voteBoard;
      if (!isObj(b) || Object.keys(b).sort().join() !== opts.slice().sort().join() || opts.some(o => typeof b[o] !== "string" || !b[o].trim())) E(`${where}.voteBoard`, `要寫成 { ${opts.join("、")} }，三句都要有字`);
    }
    CATS.forEach(([name, get]) => {
      const list = asList(get(day)).filter(x => isObj(x) && x.vote !== undefined);
      if (!list.length) return;
      const w = `${where}.${name}`;
      list.forEach(x => {
        if (!opts.includes(x.vote)) E(w, `vote「${x.vote}」只能是 ${opts.join("、")}`);
        const key = (name === "understand" ? "u:" : name + ":") + x.id;
        if (ids[key]) E(w, `分版的 id「${x.id}」重複了（${ids[key]}；三版的 id 要各自不同）`); else ids[key] = w;
      });
      const of = o => list.filter(x => x.vote === o), counts = opts.map(o => of(o).length);
      if (counts.some(n => n !== counts[0])) E(w, `三版要齊全：現在 ${opts.map((o, i) => `${o} ${counts[i]} 件`).join("、")}`);
      const clues = opts.map(o => of(o).map(x => x.clue || "").sort().join());
      if (clues.some(c => c !== clues[0])) E(w, "三版的線索要用同壹個 clue id（不然看到的人拿到的線索不一樣）");
      if (name === "show.works" && !asList(get(day)).some(x => isObj(x) && x.vote === undefined)) E(w, "今日特展至少要有壹幅不分版的畫（結果還沒拿到時不能是空的）");
    });
  });
  return { has, errors };
}
// 三個結果各跑壹遍的錯誤、警告併成壹份：三版都有的原樣列，只有某幾版有的前面寫是哪壹版
function voteMerge(runs, key) {
  const seen = new Map();
  runs.forEach(({ vote, result }) => result[key].forEach(msg => { if (!seen.has(msg)) seen.set(msg, []); if (!seen.get(msg).includes(vote)) seen.get(msg).push(vote); }));
  return [...seen].map(([msg, votes]) => (votes.length === runs.length ? msg : `（投票結果 ${votes.join("、")} 的版本）${msg}`));
}
module.exports = { voteShape, voteMerge };
