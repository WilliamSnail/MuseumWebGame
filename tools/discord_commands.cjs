// 把 Yuga Bot 的斜線指令（/pepe-…）註冊到佩佩博物館的 Discord 伺服器（guild commands，決定 0051）。
// 指令清單在 shared/discord.js 的 dcCommands()；這支只負責送出去。送的是「整份取代」：清單裡沒有的舊指令會被拿掉。
//
//   node tools/discord_commands.cjs --print   只印清單，不連 Discord（沒有金鑰也能跑，測試用）
//   node tools/discord_commands.cjs           註冊。要三樣東西（環境變數）：
//       DISCORD_BOT_TOKEN        Bot token（密碼：只放 GitHub Secrets，不進 repo、不貼給 AI）
//       DISCORD_APPLICATION_ID   Application ID（不是密碼）
//       DISCORD_GUILD_ID         伺服器 ID（不是密碼）
// 在 GitHub 上手動按：.github/workflows/discord-commands.yml（Actions → 註冊 Discord 斜線指令）
const COMMANDS = () => require("../test/load_shared.cjs").load().dcCommands();

// 回傳 { url, headers, body }（純函式，測試用）。缺什麼就丟錯，說清楚缺哪個
function request(env = process.env) {
  const need = ["DISCORD_BOT_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID"].filter(k => !String(env[k] || "").trim());
  if (need.length) throw new Error(`缺 ${need.join("、")}：沒有金鑰就不能註冊（--print 可以只看清單）。`);
  const app = String(env.DISCORD_APPLICATION_ID).trim(), guild = String(env.DISCORD_GUILD_ID).trim();
  if (!/^\d{5,25}$/.test(app) || !/^\d{5,25}$/.test(guild)) throw new Error("DISCORD_APPLICATION_ID、DISCORD_GUILD_ID 要是數字（Discord 開發者模式複製來的 ID）。");
  return {
    url: `https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,
    headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}`, "Content-Type": "application/json", "User-Agent": "PepeMuseumBot (https://pepe-museum.web.app, 1)" },
    body: JSON.stringify(COMMANDS().map(c => JSON.parse(JSON.stringify(c)))),
  };
}

const redact = (s, token) => { let t = String(s).replace(/Bot\s+\S+/g, "Bot ***"); if (token) t = t.split(token).join("***"); return t; }; // 錯誤訊息不留 token

async function main(argv = process.argv.slice(2), env = process.env, fetcher = fetch) {
  const list = COMMANDS();
  if (argv.includes("--print")) {
    list.forEach(c => console.log(`/${c.name}${(c.options || []).map(o => ` <${o.name}>`).join("")}　${c.description}`));
    console.log(`共 ${list.length} 個。沒有送出去。`);
    return { printed: list.length };
  }
  const req = request(env);
  const res = await fetcher(req.url, { method: "PUT", headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`Discord 回 ${res.status}：${(await res.text()).slice(0, 300).replace(/Bot\s+\S+/g, "Bot ***")}`);
  const out = await res.json();
  console.log(`註冊好了：${out.length} 個指令 → ${out.map(c => "/" + c.name).join(" ")}`);
  return { registered: out.length };
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { request, main, redact };
