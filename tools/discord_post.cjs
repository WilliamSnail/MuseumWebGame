// 把每週劇情的公告發到 Discord（翊文 11-09：「我想用Discord bot發布訊息」）。
// 自動部署（.github/workflows/deploy.yml）部署完跑這支：這次合併有新的一天（content/weeks/<週>/dN.json）才發，沒有就不發。
//   週一（d1）：這週的標題、不劇透的大綱、今天那一行。其他天：今天那一行。節日那天再加節日的話。
// 金鑰放 GitHub Secrets：DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID（翊文放的，AI 拿不到，也不要印出來）。沒放就跳過，不報錯。
// node tools/discord_post.cjs        照這次合併新加的檔發
// node tools/discord_post.cjs --test 發一則測試訊息
const fs = require("fs"), path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SITE = "https://pepe-museum.web.app";
// 每則公告最後面的連結（翊文 11-09：「每天的公告最後面也給一些遊戲網站連結」）。要加連結加在這裡
const LINKS = [["進遊戲", SITE]];
const footer = () => LINKS.map(([name, url]) => `${name}：${url}`).join("\n");
const MAX = 2000; // Discord 一則訊息最多 2000 字
const DAY_FILE = /^content\/weeks\/(\d{4}-W\d{2})\/d([1-7])\.json$/;

// 這次合併新加了哪幾天（排程一次通常一天）。備用週的檔不算（`content/weeks/備用/` 比對不到）
function newDays(files) {
  return files.map(f => f.match(DAY_FILE)).filter(Boolean).map(m => ({ week: m[1], n: Number(m[2]) }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.n - b.n));
}

// 訊息的文字。w ＝ week.json、d ＝ dN.json、n ＝第幾天、hol ＝ holidayOf 回傳的節日（沒有就 null）
function dayMessage(w, d, n, hol) {
  const lines = [];
  if (n === 1) {
    lines.push(`**本週地下收藏庫：〈${w.title}〉**`, ...(Array.isArray(w.summary) ? w.summary : []), "");
    lines.push(`第 1 天：${d.board || ""}`);
  } else {
    lines.push(`**〈${w.title}〉第 ${n} 天**`, d.board || "");
  }
  if (hol) lines.push("", `今天是${hol.name}。${hol.words || ""}`);
  // 連結一定留著：太長只截前面的內容
  const end = "\n\n" + footer(), text = lines.join("\n").trim(), room = MAX - end.length;
  return (text.length > room ? text.slice(0, room - 1) + "…" : text) + end;
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

function changedFiles() {
  try {
    return execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "--diff-filter=A", "HEAD^1", "HEAD", "--", "content/weeks"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").map(s => s.trim()).filter(Boolean);
  } catch (e) { console.log("讀不到這次合併改了什麼，這次不發：" + e.message.split("\n")[0]); return []; }
}
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

async function main() {
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
  const days = newDays(changedFiles());
  if (!days.length) { console.log("這次合併沒有新的一天，不發。"); return; }
  const { holidayOf } = await import("../shared/holidays.js");
  for (const { week, n } of days) {
    const w = readJSON(`content/weeks/${week}/week.json`), d = readJSON(`content/weeks/${week}/d${n}.json`);
    const ok = await send(dayMessage(w, d, n, d.date ? holidayOf(d.date) : null));
    console.log(ok ? `發了 ${week} 第 ${n} 天。` : "沒發。");
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { newDays, dayMessage, send, MAX };
