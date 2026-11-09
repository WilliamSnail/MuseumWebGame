// 把每週劇情的公告發到 Discord（翊文 11-09：「我想用Discord bot發布訊息」）。
// 這支放訊息的樣子和「發」這個動作。什麼時候發是 tools/announce.cjs（今日館訊早上八點半、活動開跑、預約公告）。
//   週一（d1）：這週的標題、不劇透的大綱、今天那一行。其他天：今天那一行。節日那天再加節日的話。
// 金鑰放 GitHub Secrets：DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID（翊文放的，AI 拿不到，也不要印出來）。沒放就跳過，不報錯。
// node tools/discord_post.cjs --test 發一則測試訊息
// node tools/discord_post.cjs --say  發環境變數 ANNOUNCE 的文字（手動的公告）
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://pepe-museum.web.app";
// 每則公告最後面的連結（翊文 11-09：「每天的公告最後面也給一些遊戲網站連結」）。要加連結加在這裡
const LINKS = [["🎟 入館", SITE]];
const footer = () => LINKS.map(([name, url]) => `${name}：${url}`).join("\n");
const MAX = 2000; // Discord 一則訊息最多 2000 字

// 這週的限時活動（決定 0041）：壞的丟掉、照時間排好（跟遊戲用同一份 shared/events.js）。evs 不給就從 week.json 的 events 整理
let SHARED = null;
const shared = () => SHARED || (SHARED = require("../test/load_shared.cjs").load());
function weekEvents(w) {
  const G = shared();
  return G.cleanEvents(w && w.events, w && w.start, w && w.week).map(ev => ({ date: ev.date, from: ev.from, to: ev.to, title: ev.title, words: ev.words, effect: G.eventEffect(ev), when: G.eventWhen(ev), wd: "一二三四五六日"[G.weekDayNo(ev.date) - 1] }));
}

// 賭場的每週收藏（決定 0042）：週一提壹句這週的收藏；那天 dN.json 有加碼的收藏品或話，就提壹句。壞的不提（跟遊戲用同一份 shared/casino_week.js 整理）
// 回傳 { week: 週一那句（沒有就 ""）, today: [那天的句子] }
function casinoLines(w, d, n) {
  const out = { week: "", today: [] };
  if (!w || !w.week || !w.start) return out;
  const def = shared().casWeekDef({ week: w, days: { [n]: d || {} } }, w.week, w.start);
  if (!def) return out;
  const base = def.items.filter(it => !it.extra);
  if (n === 1) out.week = `🎰 【本週賭場收藏】${def.title}：${base.length} 件，湊齊有紀念品和稱號（籌碼不是錢，什麼都不用花）`;
  def.items.filter(it => it.extra && it.day === n).forEach(it => out.today.push(`🎰 【賭場加碼】多了壹件「${it.name}」，拿不拿都可以`));
  def.notes.filter(x => x.day === n).forEach(x => out.today.push(`🎰 ${x.text}`));
  return out;
}

// 訊息的文字。w ＝ week.json、d ＝ dN.json、n ＝第幾天、hol ＝ holidayOf 回傳的節日（沒有就 null）、evs ＝活動、fun ＝ funDaysOf 回傳的趣味節日（沒有就不寫那壹行，決定 0044）
function dayMessage(w, d, n, hol, evs, fun) {
  evs = evs || weekEvents(w);
  const lines = [];
  if (n === 1) {
    // 博物館的公告口吻（翊文 11-09：「要以稍微更加像博物館的公告方式推出」）
    lines.push("🏛 **佩佩博物館2　本週特展公告**", `📜 地下收藏庫本週主題：〈${w.title}〉`, "", ...(Array.isArray(w.summary) ? w.summary : []), "");
    if (evs.length) lines.push("🎪 【本週限時活動】", ...evs.map(e => `・${e.date.slice(5).replace("-", "/")}（${e.wd}）${e.from}～${e.to}　${e.title}：${e.effect}`), "");
    const cas = casinoLines(w, d, n);
    if (cas.week) lines.push(cas.week, "");
    lines.push(`📣 【今日館訊】${d.board || ""}`);
  } else {
    lines.push("🏛 **佩佩博物館2　今日館訊**", `📜 〈${w.title}〉第 ${n} 日`, "", d.board || "");
  }
  if (hol) lines.push("", `🏮 【本日節慶】${hol.name}。${hol.words || ""}`);
  if (fun && fun.length) lines.push("", `🎈 【今日冷知識】${fun.map(f => `${f.name}：${f.line}`).join("　")}`);
  casinoLines(w, d, n).today.forEach(t => lines.push("", t));
  // 活動當天：今日館訊後面多一段（日期用這週的週一往後算 n - 1 天；沒有活動就不加）
  const day = w && w.start ? shared().addDays(w.start, n - 1) : null;
  evs.filter(e => e.date === day).forEach(e => lines.push("", `🎪 【${e.when}限時活動】${e.from}～${e.to}　${e.title}`, e.words, e.effect + "。錯過了也不會少什麼。"));
  // 每天提醒領大禮包（翊文 11-10：「Discord還會發新劇情和大禮包請大家領吧」）
  lines.push("", "🎁 【今日大禮包】今天的大禮包可以領了：遊戲裡的 Hamachi，或在這裡打 `/pepe-大禮包`。");
  lines.push("", "館長室 敬啟");
  // 連結一定留著：太長只截前面的內容
  const end = "\n\n" + footer(), text = lines.join("\n").trim(), room = MAX - end.length;
  return (text.length > room ? text.slice(0, room - 1) + "…" : text) + end;
}

// 某一天的今日館訊（節日、趣味節日照那天的日期查）
function dayPost(week, n) {
  const w = readJSON(`content/weeks/${week}/week.json`), d = readJSON(`content/weeks/${week}/d${n}.json`), G = shared();
  return dayMessage(w, d, n, d.date ? G.holidayOf(d.date) : null, undefined, d.date ? G.funDaysOf(d.date) : []);
}
// 限時活動開跑（決定 0045）。可能早幾分鐘或晚幾分鐘發，所以寫時間，不寫「現在開始了」
function eventPost(ev) {
  const G = shared();
  return ["🎪 **佩佩博物館2　限時活動開跑**", `📜 〈${ev.title}〉${G.eventWhen(ev)} ${G.eventRange(ev)}`, "", ev.words, "", `✨ ${G.eventEffect(ev)}。錯過了也不會少什麼。`, "", "館長室 敬啟", "", footer()].join("\n");
}

// 發一則。沒有人會被 @（allowed_mentions 空的）。錯誤訊息不含金鑰
async function send(content, env = process.env, fetcher = fetch) {
  const token = env.DISCORD_BOT_TOKEN, channel = env.DISCORD_CHANNEL_ID;
  if (!token || !channel) { console.log("還沒放 DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID，這次不發。"); return false; }
  const res = await fetcher(`https://discord.com/api/v10/channels/${encodeURIComponent(channel)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (https://github.com/WilliamSnail/MuseumWebGame, 1.0)" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`Discord 回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  return true;
}

const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

async function main() {
  if (process.argv.includes("--say")) { // 手動的公告（.github/workflows/discord-announce.yml）：文字從環境變數來，最後面照樣放連結
    const text = String(process.env.ANNOUNCE || "").trim();
    if (!text) { console.log("沒有要發的文字。"); return; }
    const end = "\n\n" + footer();
    const ok = await send((text.length > MAX - end.length ? text.slice(0, MAX - end.length - 1) + "…" : text) + end);
    console.log(ok ? "公告發了。" : "沒發。");
    return;
  }
  if (process.argv.includes("--test")) {
    // 測試：發最新一天真正格式的公告，看長什麼樣
    const dir = path.join(ROOT, "content", "weeks");
    const week = fs.readdirSync(dir).filter(n => /^\d{4}-W\d{2}$/.test(n)).sort().pop();
    const n = week ? Math.max(...fs.readdirSync(path.join(dir, week)).map(f => (f.match(/^d([1-7])\.json$/) || [])[1]).filter(Boolean).map(Number)) : 0;
    const body = week && n > 0 ? dayMessage(readJSON(`content/weeks/${week}/week.json`), readJSON(`content/weeks/${week}/d${n}.json`), n, null) : footer();
    const ok = await send(`（這是測試，之後每天會自動貼這樣的公告）\n\n${body}`.slice(0, MAX));
    console.log(ok ? "測試訊息發了。" : "沒發。");
    return;
  }
  console.log("這支只留 --say、--test。今日館訊和活動開跑是 tools/announce.cjs 發的。");
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { dayMessage, dayPost, eventPost, readJSON, shared, send, footer, MAX };
