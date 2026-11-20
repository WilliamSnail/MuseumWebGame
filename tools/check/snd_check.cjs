// 聲音狀態靜態檢查（11-16 翊文：「被嚇退出房間，原本房間的音效不會停」→「徹底檢查，寫好需要的腳本」）
//   npm run snd:check
// 掃程式，找「聲音該停沒停」的結構性問題（不用開瀏覽器、不用聽）：
//   1. fx.js 的 AMB.*（每個房間的環境音）：每個 every()／songCycle()／creepyHook() 的停止函式都要進 timers；每個 fileLoop 都要進 nodes（不然換房間停不掉）
//   2. fileOnce／fileLoop 要接到房間自己的 g（或接在 g 上的小音量），不能直接接 bus（房間換掉不會跟著停）；AMB 外面接 bus 的是刻意的，要在白名單上
//   3. UI 的聲音狀態（UI.ambOver、UI.cellarSnd、UI.ambTimer）只能在 ui_core.js 的 setAmbOver／setCellarSnd 裡改；開的人要有關的人
//   5. 房間有自己的合成旋律（const sched／pad = every）又放整首曲子（songCycle）時，songCycle 要給第 6 個參數 duck，曲子放的時候旋律淡出（11-16「圖書館兩個音樂好像會重疊」）
//   6. 理智低的恐怖音樂放的時候，房間的整首曲子要壓低（11-17 翊文：「理智低的恐怖音樂放的時候 讓房間的鋼琴降低」）：
//      songCycle 的曲子要先過 SONG_GAINS 的小音量鈕（停的時候拿掉），sync() 照恐怖音樂開關調它；房間裡不能自己用 fileOnce 放整首曲子（要走 songCycle）
//   4. 蓋在畫面上的框（.nb-layer）被程式直接拿掉時，要走 nbClose（框關掉才會收賭場、合作的聲音和計時器）
// 有問題 exit 1。test/tools/snd_check.test.cjs 也用它。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// AMB 外面刻意接 bus 的（理智跟著走，不跟房間）：列出來讓人知道，不算錯
const BUS_OK = [
  { re: /dreadLz\[id\] = fileLoop\(c, bus\.heart/, why: "理智低的恐怖音樂 horror-low／edge／bout：跟著理智和發作走，換房不停（刻意）" },
  { re: /fileOnce\(c, bus\.heart, 'pulse-rise'/, why: "理智掉到 15 以下時升高音一次（刻意）" },
];

// 從 src[at] 的左括號開始，回傳括號裡的整段參數（會數巢狀括號）
function callArgs(src, at) {
  let d = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "(") d++;
    else if (src[i] === ")" && --d === 0) return src.slice(at + 1, i).trim();
  }
  return "";
}
function ambEntries(fx) {
  const a = fx.indexOf("const AMB = {"), b = fx.indexOf("function startAmb(");
  const body = fx.slice(a, b), out = [];
  const re = /^      (\w+)\(c, g(?:, own)?\) \{/gm; let m, last = null;
  while ((m = re.exec(body))) { if (last) last.src = body.slice(last.at, m.index); last = { name: m[1], at: m.index }; out.push(last); }
  if (last) last.src = body.slice(last.at);
  return out;
}

function checkFx(fx) {
  const bad = [], info = [];
  const ents = ambEntries(fx);
  if (ents.length < 15) bad.push(`AMB 只找到 ${ents.length} 個房間（讀法壞了？）`);
  for (const e of ents) {
    if (/\bconst\s+(?:sched|pad)\s*=\s*every\(/.test(e.src)) for (const m of e.src.matchAll(/songCycle\(([^;]*?)\);/g)) if (m[1].split(",").length < 6) bad.push(`AMB.${e.name}：有合成旋律又放 songCycle，沒給 duck，兩首會疊在壹起`);
    const timers = [...e.src.matchAll(/timers:\s*\[([^\]]*)\]/g)].map(m => m[1]).join(",");
    for (const m of e.src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(every|songCycle)\(/g)) {
      if (!new RegExp("\\b" + m[1] + "\\b").test(timers)) bad.push(`AMB.${e.name}：${m[1]}（${m[2]}）沒進 timers，換房間不會停`);
    }
    for (const m of e.src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*creepyHook\(/g)) {
      if (!new RegExp("\\b" + m[1] + "\\.timer\\b").test(timers)) bad.push(`AMB.${e.name}：${m[1]}（creepyHook）的 .timer 沒進 timers`);
    }
    // 11-18：房間裡的 fileOnce／creepyHook 要把 own 傳下去（換房間時正在放的淡出停掉、還在下載的不放；「圖書館的音樂退出到大廳還在放」）
    for (const m of e.src.matchAll(/\b(fileOnce|creepyHook)\(c, (?!bus\.)/g)) {
      const call = callArgs(e.src, m.index + m[1].length);
      if (!/,\s*own$/.test(call)) bad.push(`AMB.${e.name}：${m[1]} 沒給 own，換房間不會停：${m[1]}(${call.slice(0, 50)})`);
    }
    if (/\b(?:fileOnce|creepyHook)\(c, (?!bus\.)/.test(e.src) && !/^\s*\w+\(c, g, own\)/.test(e.src)) bad.push(`AMB.${e.name}：用了 fileOnce／creepyHook 但沒收 own 參數`);
    for (const m of e.src.matchAll(/^\s*every\(/gm)) bad.push(`AMB.${e.name}：有 every() 沒接回傳值，停不掉 (${m.index})`);
    for (const m of e.src.matchAll(/fileLoop\(([^)]*)\)(\.n)?/g)) {
      const pre = e.src.slice(Math.max(0, m.index - 60), m.index);
      const asg = /(?:const|let)\s+(\w+)\s*=\s*$/.exec(pre), inObj = /(\w+):\s*$/.exec(pre), lz = /LZ\[id\]\s*=\s*$/.test(pre);
      if (m[2]) continue; // 直接拿 .n
      if (asg && new RegExp("\\b" + asg[1] + "\\.n\\b").test(e.src)) continue;
      if (lz && /nodes\.push\(LZ\[id\]\.n\)/.test(e.src)) continue;
      // 用到才建（例如大廳的限時活動、人潮多那兩首）：X = fileLoop(...)，而且有放進 nodes 的停止物件叫 X.n.stop()
      const late = /([\w.]+(?:\[\w+\])?)\s*=\s*$/.exec(pre); // 也認得 song[pick] = fileLoop(...)，停止物件寫 song[k].n.stop()
      const lateRe = late ? late[1].replace(/\./g, "\\.").replace(/\[\w+\]$/, "\\[\\w+\\]") : null;
      if (!asg && late && new RegExp("\\b" + lateRe + "\\.n\\.stop\\(").test(e.src)) continue;
      if (inObj && /const L = \{/.test(e.src) && /Object\.values\(L\)|L\[/.test(e.src)) continue; // cellar 的 L 表
      bad.push(`AMB.${e.name}：fileLoop(${m[1].split(",")[2] || m[1]}) 沒把 .n 放進 nodes，換房間停不掉`);
    }
    for (const m of e.src.matchAll(/file(Loop|Once)\(c,\s*([\w.]+)/g)) {
      const to = m[2];
      if (/^bus\./.test(to)) bad.push(`AMB.${e.name}：file${m[1]} 接在 ${to}，不是房間的 g，換房間不會跟著停`);
      else if (to !== "g" && !/^\w+G$/.test(to)) bad.push(`AMB.${e.name}：file${m[1]} 接在 ${to}（要接 g 或接到 g 的小音量）`);
    }
    for (const m of e.src.matchAll(/(\w+G)\.connect\((\w+)\)/g)) if (m[2] !== "g") bad.push(`AMB.${e.name}：${m[1]} 接到 ${m[2]}，要接到 g`);
    if (/bus\.(?:amb|sfx|heart)/.test(e.src)) bad.push(`AMB.${e.name}：直接用了 bus，聲音不會跟著房間停`);
  }
  const outside = fx.slice(0, fx.indexOf("const AMB = {")) + fx.slice(fx.indexOf("function startAmb("));
  for (const m of outside.matchAll(/[^\n]*file(Loop|Once)\(c,\s*bus\.\w+[^\n]*/g)) {
    const ok = BUS_OK.find(x => x.re.test(m[0]));
    if (ok) info.push(ok.why); else bad.push(`AMB 外面有 file${m[1]} 接在 bus：${m[0].slice(0, 70)}（刻意的話加進 tools/check/snd_check.cjs 的 BUS_OK）`);
  }
  const st = fx.slice(fx.indexOf("function startAmb("), fx.indexOf("function startDrone("));
  if (!/\(hnd\.timers \|\| \[\]\)\.forEach\(\(s\) => s\(\)\)/.test(st)) bad.push("startAmb().stop() 沒有停 timers");
  if (!/g\.disconnect\(\)/.test(st) || !/hnd\.nodes/.test(st)) bad.push("startAmb().stop() 沒有斷開 g、停 nodes");
  if (!/AMB\[type\]\(c, g, own\)/.test(st) || !/own\.stop\(c\)/.test(st)) bad.push("startAmb() 沒把 own 給房間，或 stop() 沒有 own.stop(c)（房間放的單次檔案換房間停不掉）");
  const sy = fx.slice(fx.indexOf("function sync()"), fx.indexOf("// 瀏覽器要等玩家先點"));
  for (const k of ["ambNow.stop()", "heartStop()", "tinNow.stop()", "droneNow.stop()"]) if (!sy.includes(k)) bad.push(`sync() 沒有 ${k}`);
  // 6. 恐怖音樂時房間的曲子壓低
  const sc = fx.slice(fx.indexOf("function songCycle("), fx.indexOf("function creepyHook("));
  if (!/SONG_GAINS\.add\(/.test(sc) || !/SONG_GAINS\.delete\(/.test(sc)) bad.push("songCycle 的曲子沒有過 SONG_GAINS（恐怖音樂時壓不低），或停的時候沒拿掉");
  if (!/own\.stop\(c/.test(sc) || !/fileOnce\([^;]*, own\)/.test(sc)) bad.push("songCycle 停的時候沒有 own.stop（正在放的曲子會繼續放、還在下載的離開後才響）");
  if (!/songDread/.test(sy) || !/SONG_GAINS\.forEach/.test(sy)) bad.push("sync() 沒有照恐怖音樂調房間曲子的音量（SONG_GAINS）");
  const SONG_IDS = ["bank-music", "lib-piano-a", "lib-piano-b", "cello-commission", "gallery-nostalgic", "gallery-welte"];
  for (const e of ents) for (const m of e.src.matchAll(/fileOnce\([^,]+,[^,]+,\s*'([^']+)'/g)) if (SONG_IDS.includes(m[1])) bad.push(`AMB.${e.name}：整首曲子 ${m[1]} 用 fileOnce 直接放，要走 songCycle（恐怖音樂時才壓得低）`);
  return { bad, info: [...new Set(info)], rooms: ents.map(e => e.name) };
}

function checkUi() {
  const bad = [], info = [];
  const files = fs.readdirSync(path.join(ROOT, "web/src")).filter(f => f.endsWith(".js"));
  const core = rd("web/src/ui_core.js");
  for (const f of files) {
    if (f === "ui_core.js") continue;
    const s = rd("web/src/" + f);
    for (const m of s.matchAll(/UI\.(ambOver|cellarSnd|cellarSndKey|cellarSndFrom|ambHeat|ambTimer)\s*=[^=]/g)) bad.push(`${f}：直接改 UI.${m[1]}（要走 setAmbOver／setCellarSnd）`);
    const opens = [...s.matchAll(/setAmbOver\(\s*"/g)].length, closes = [...s.matchAll(/setAmbOver\(\s*null/g)].length;
    if (opens && !closes) bad.push(`${f}：setAmbOver 開了賭場聲音，沒有關的地方`);
    const snd = [...s.matchAll(/setCellarSnd\(([^)]*)\)/g)].map(m => m[1].trim());
    if (snd.some(a => !a.startsWith("null")) && !snd.some(a => a.startsWith("null")) && !/"room"/.test(s)) bad.push(`${f}：setCellarSnd 設了地下聲音，沒有清掉的地方（也不是 "room"）`);
  }
  if (!/prev === "cellar" && name !== "cellar" && UI\.cellarSndFrom === "room"/.test(core)) bad.push("ui_core.js go()：離開地下收藏庫沒有收 room 設的地下聲音");
  if (!/clearInterval\(UI\.ambTimer\)/.test(core)) bad.push("ui_core.js setAmbOver：沒有 clearInterval(UI.ambTimer)");
  const lg = rd("web/src/ui_login.js"), lo = lg.slice(lg.indexOf('NET.on("logout"'), lg.indexOf("// ---------- 伺服器改了我的存檔"));
  if (!/nbClose/.test(lo)) bad.push("ui_login.js 登出：蓋在上面的框沒有走 nbClose");
  if (!/setAmbOver\(null\)/.test(lo) || !/setCellarSnd\(null\)/.test(lo)) bad.push("ui_login.js 登出：沒有收 setAmbOver／setCellarSnd");
  for (const f of files) for (const m of rd("web/src/" + f).matchAll(/querySelectorAll\("\.nb-layer"\)\.forEach\(([^\n]*)/g))
    if (!/nbClose/.test(m[1])) bad.push(`${f}：把 .nb-layer 直接拿掉（沒走 nbClose）：${m[1].slice(0, 50)}`);
  info.push("心跳（理智 30 以下）、不安低鳴（理智 40 以下）、耳鳴（發作中）：跟著理智和發作走（刻意）",
    "鐘聲（clock-strike）：換畫面不打斷（刻意，ui_core.js startChime）");
  return { bad, info };
}

function run() {
  const fx = checkFx(rd("web/src/fx_sound.js")), ui = checkUi();
  return { bad: [...fx.bad, ...ui.bad], info: [...fx.info, ...ui.info], rooms: fx.rooms };
}
module.exports = { checkFx, checkUi, ambEntries, run };
if (require.main === module) {
  const r = run();
  console.log(`掃了 ${r.rooms.length} 個房間的環境音：${r.rooms.join("、")}`);
  console.log("刻意不跟房間停的：\n  " + r.info.join("\n  "));
  if (r.bad.length) { console.log("\n✗ 有問題：\n  " + r.bad.join("\n  ")); process.exit(1); }
  console.log("\n✓ 聲音狀態的結構檢查都過了");
}
