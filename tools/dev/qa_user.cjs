// QA：一個指令備好壹個測試帳號（11-21 測試 session：以前要分三步——emu_call peek、qa_seed_save、再用「開 lv0 德州桌再離開」建錢包文件）。
//   npm run qa:user -- --set 7 --nick 聊乙 [--pepes 12] [--sanity 64] [--insp 50] [--hall 3] [--no-save] [--no-wallet]
// 做的事：登入（跟網頁壹樣的帳號）→ 建 members → 放壹份有 N 隻佩佩的挑戰存檔（呼叫 qa_seed_save）→ 建錢包文件（emu_doc data 才改得到）。
// 只連 127.0.0.1 的模擬器。
const path = require("path");
const { spawnSync } = require("./child.cjs");
const { asUser } = require("./emu_lib.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(`--${k}`);

// 錢包文件要「做過壹個寫錢包的動作」才有。giver visit 只加壹點熟識度；做完把熟識度清掉，不留痕跡
async function ensureWallet(set, u, nick) {
  const r = await u.call("casino", { act: "giver", op: "visit", id: "scale" });
  if (!r || !r.result) throw new Error("建不了錢包文件：" + JSON.stringify(r).slice(0, 200));
  const run = spawnSync(process.execPath, [path.join(__dirname, "emu_doc.cjs"), "--set", String(set), "data", `casinoWallets/@${nick}`, "npcRel={}"], { encoding: "utf8" });
  if (run.status) throw new Error(run.stdout + run.stderr);
}
async function main() {
  const set = Number(arg("set", 8)), nick = arg("nick", "");
  if (!nick) throw new Error("用法：npm run qa:user -- --set 7 --nick 聊乙 [--pepes 12] [--no-save] [--no-wallet]");
  const u = await asUser(set, nick);
  console.log(`帳號 ${nick}（uid ${u.uid}）登入好了，members 建好了。`);
  if (!has("no-save")) {
    const a = ["--set", String(set), "--nick", nick];
    for (const k of ["pepes", "sanity", "insp", "hall", "seed"]) if (arg(k)) a.push(`--${k}`, arg(k));
    const r = spawnSync(process.execPath, [path.join(__dirname, "qa_seed_save.cjs"), ...a], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
    if (r.status) process.exit(r.status);
  }
  if (!has("no-wallet")) { await ensureWallet(set, u, nick); console.log("錢包文件建好了（熟識度已清空）。"); }
}
if (require.main === module) main().catch(e => { console.error("✗", e.message); process.exit(1); });
