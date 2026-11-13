// QA：給模擬器裡的某位館友放一份「有 N 隻佩佩的挑戰存檔」，測合作地下、打怪、委託、展廳不用先做佩佩。
// 只連 127.0.0.1 的模擬器。
//   node tools/qa_seed_save.cjs --set 3 --nick 小明 [--pepes 12] [--sanity 64] [--insp 50]
// 沒有這位的存檔就新建（要先登入過一次、或用 npm run emu:call 叫過任何東西，members 才有這個人）。
const { load } = require("../test/load_shared.cjs");
const { toFs, fromFs, firestorePort } = require("./emu_doc.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const SET = Number(arg("set", 8)), NICK = arg("nick", "小明"), N = Number(arg("pepes", 12));
const G = load();
G.setRng(G.mulberry32(Number(arg("seed", 11))));
const P = G.newProfile("challenge");
G.CATS.forEach(c => G.partOf(c).options.forEach(o => { if (!o.forbidden && !o.mix && o.limited !== "show" && o.limited !== "week" && !P.unlocked[c].includes(o.name) && o.name !== "皇冠" && o.name !== "斯拉夫蹲") P.unlocked[c].push(o.name); }));
P.unlockCount = 8;
for (let i = 0; i < N; i++) G.finishMake(P, G.codexPick(Math.floor(G.RNG() * G.BASE_TOTAL)), { natural: 30 + Math.floor(G.RNG() * 60) });
P.sanity = Number(arg("sanity", 64)); P.mood = 60; P.insp = Number(arg("insp", 50));
G.setRng(null);
(async () => {
  const base = `http://127.0.0.1:${firestorePort(SET)}/v1/projects/demo-pepe4/databases/(default)/documents`;
  const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };
  const req = async (url, o) => { const r = await fetch(url, Object.assign({ headers: H }, o)); const j = await r.json(); if (!r.ok) throw new Error(`${r.status}：${JSON.stringify(j).slice(0, 200)}`); return j; };
  const members = (await req(`${base}/members`)).documents || [];
  const m = members.find(d => (d.fields.nick || {}).stringValue === NICK);
  if (!m) throw new Error(`沒有「${NICK}」這位館友：先用 ?user=${NICK} 登入一次，或 npm run emu:call -- --set ${SET} --user ${NICK} casino '{"act":"peek"}'`);
  const uid = m.name.split("/").pop();
  let save = { v: 3, current: "challenge", profiles: {} }, rev = 0;
  try { const d = await req(`${base}/saves/${uid}`); save = JSON.parse(fromFs(d.fields.data)); rev = fromFs(d.fields.rev) || 0; } catch (e) { /* 沒有就新建 */ }
  save.profiles = save.profiles || {}; save.profiles.challenge = P; save.current = "challenge"; save.tutorialDone = true;
  await req(`${base}/saves/${uid}?updateMask.fieldPaths=data&updateMask.fieldPaths=rev`, { method: "PATCH", body: JSON.stringify({ fields: { data: toFs(JSON.stringify(save)), rev: toFs(rev + 1) } }) });
  console.log(`放好了：${NICK}（${uid}）有 ${Object.keys(P.collection || P.pepes || {}).length || N} 隻佩佩、理智 ${P.sanity}、靈感 ${P.insp}，rev ${rev + 1}`);
})().catch(e => { console.error("✗", e.message); process.exit(1); });
