// Validator for shared/content3.js（第 4 版：ES 模組）. Usage: node check3.cjs [sharedDir]
// Loads config.js, content.js, content3.js as separate scripts in ONE context (like the browser),
// so a name clash between files fails here too.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const dir = process.argv[2] || path.join(__dirname, "..", "..", "shared");
const file3 = path.join(dir, "content3.js");
const raw3 = fs.readFileSync(file3, "utf8");
if (/^\s*import\b/m.test(raw3)) { console.error("content3.js 不准 import"); process.exit(1); }
const unexport = t => t.replace(/^export\s+/gm, ""); // 第 4 版：拿掉 export，照舊當成一般程式檢查
const src3 = unexport(raw3);

const NAMES = ["BOARD_TEXT", "JOBS", "SKILL_TEXT", "JOB_TEXT", "FUSION_TEXT", "RECIPE_TEXT", "UPGRADE_TEXT", "CELLAR", "CHAPTER4", "BOOK4",
  "ENDING_CELLAR", "CLIENT_LINES", "WEEKLY_TEXT", "TRADE_TEXT", "NEW_OPTION_TEXT", "ROOM_HINTS3", "BOOK_SEQUELS", "UNDERSTAND_TEXT", "UNDERSTAND_FALLBACK", "MORE_CHAPTERS", "TRAIT_TEXT", "LEGACY_TEXT", "VISITOR_TEXT", "QUIRK_TASK_TEXT", "LIMITED_TEXT", "SIGNIN_TEXT", "HOLIDAY_TEXT", "GEAR_TEXT", "SHOP_TEXT", "TRIAL_ROOMS"]; // QUIRK_TASK_TEXT：怪癖的治法（11-09，決定 0027）；VISITOR_TEXT：多位參觀者的位子、取名字（11-08）；BOOK_SEQUELS：禁書的續集；UNDERSTAND_TEXT／FALLBACK：看懂檢定看懂了什麼；TRAIT_TEXT、LEGACY_TEXT：參觀者的小優缺點、換人的畫面（都是 11-08）

const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

if (/^\s*(import|export)\b/m.test(src3)) err("file contains import/export");
for (const n of NAMES) if (!new RegExp("^const " + n + " = ", "m").test(src3)) err("missing top-level `const " + n + " = `");
const declared = [...src3.matchAll(/^(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[2]);
for (const d of declared) if (!NAMES.includes(d)) err("extra top-level declaration: " + d);

const ctx = vm.createContext({});
for (const f of ["config.js", "content.js", "content3.js"]) {
  const p = path.join(dir, f);
  try {
    vm.runInContext(unexport(fs.readFileSync(p, "utf8")), ctx, { filename: p });
  } catch (e) {
    console.error("EVAL FAILED in " + f + ":", e.message);
    process.exit(1);
  }
}
const C = vm.runInContext("({" + NAMES.join(",") + "})", ctx);
const CFG = vm.runInContext("({PEPE_PARTS, RECIPES, UPGRADES, SKILLS, WEEKLY_IDS, CELLAR_REWARDS})", ctx);

// ---- option lists ----
// BASE = no forbidden, no mutant, no gift options, and no deco (new) categories
const BASE = {};
for (const part of CFG.PEPE_PARTS) {
  if (part.deco) continue;
  BASE[part.name] = part.options.filter((o) => !o.forbidden && !o.mutant && !o.gift && !o.limited).map((o) => o.name); // limited：簽到限定（11-09，決定 0030）
}
const SKILLS = ["偵查", "鑑賞", "神秘學", "幸運", "手工藝", "說服"];
const MOODS = ["開心", "傷心", "生氣"];
const COLORS = ["紅", "綠", "黃", "黑"];
const NEW_OPTS = ["毛帽", "紳士帽", "微醺", "虔誠", "虹彩", "夜市金", "倒立", "花紋壁紙", "星空", "雪夜", "瓜子", "小抱枕", "放大鏡"];
if (!BASE["心情"].includes("俄國8+9") || !BASE["姿勢"].includes("斯拉夫蹲")) err("config.js does not have 俄國8+9 / 斯拉夫蹲 as expected");
// cross-check against config.js
{
  const cfgNew = [];
  const giftOf = {};
  for (const part of CFG.PEPE_PARTS) for (const o of part.options) {
    if (o.mutant || o.gift || o.key) cfgNew.push(o.name);
    if (o.gift) giftOf[o.gift] = o.name;
  }
  const a = [...cfgNew].sort().join(","), b = [...NEW_OPTS].sort().join(",");
  if (a !== b) err("NEW_OPTS differ from config.js mutant/gift/key options: config=" + a + " | expected=" + b);
  globalThis.__giftOf = giftOf;
  if (JSON.stringify(CFG.SKILLS) !== JSON.stringify(SKILLS)) err("SKILLS differ from config.js");
  globalThis.__cfgIds = {
    recipes: CFG.RECIPES.map((r) => r.id).sort().join(","),
    upgrades: CFG.UPGRADES.map((u) => u.id).sort().join(","),
    weekly: [...CFG.WEEKLY_IDS].sort().join(","),
  };
}

// ---- generic string checks ----
const EMOJI = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}]/u;
const SIMPLIFIED = "个们这说时会来为发么门头见东还过对开进车书乐写买卖线红绿黄气画图馆长让选项种现样动后吗话认识读谁欢难观览记页题级传赞绒软刚质愿运实际经历节点钥签灵创宝贝谢问间专广场护体锁边轻钟应该号兴备脑声响电网络带与从仅众优伤华单卫叶听园团国处够夺奋宝实宽导将尔层岁岛币师帐庆库异张弹归当录忆态总恋恶惊惯战户执扩扫扬换据挥损击扑节苏荣药获营术机杀杂权条极标树桥梦检楼欧汉没济灭热无爱犹狮猫环电画畅疗盘睁矿码砖确礼积称稳穷窃竞笔筑简类纪约纯纸纹练组细织终经结给绝统继续维编缘罗罚职联肃胜脸芦苍虽虾规视觉触计议讯讲许论设访证评诗试该详语误请诸课调谈谱负贡财责贤败货贪购贯费贴贵贸贺资赏赛赢赶趋跃践踪轨轮载较辆辈达违连迟适递逻遗邮钱铁银链错键闪闭闯闲闻阅队阳阴阶陆陈险随隐雾静须预领频颜额风飞饭饮饰马驾骑鱼鸟鸡麦齐龙龟务业丝丢两严丧个临为举义乌乐乔习书买乱争亏亚产亲亿仅仆仇们价众优会伞伟传伤伦伪体佣侠侣侦侧侨俭债倾偿储儿兑党兰关兴兹养兽冈册写军农冯冲决况冻净凉减凑凤凭凯击凿刘则刚创删别刮制刹剂剑剧劝办务动励劲劳势勋匀区医华协单卖卢卫却厂厅历厉压厌厕厘厢厦厨县参双发变叙叠只台叶号叹吓吕吗吨听启吴呐呕员呛呜咏咙咸响哑哗唤啧啬喷嗳嘱团园围国图圆圣场坏块坚坛坝坞坟坠垄垒垦埘壳壶处备复够头夸夹夺奋奖妆妇妈妩娄娱娲婴婶孙学宁宝实宠审宪宫宽宾对寻导寿将尔尘尝尧层属屿岁岂岗岛岭峡币师帅帐带帧帮帼庄庆庐库应庙庞废开异弃张弥弯弹强归录彦彻径忆忧怀态怂怜总恋恒恳恶恼悦悬惊惧惨惩惫惭惯愤愿慑懒戏战户执扩扪扫扬扰抚抛抢护报担拟拢拣拥拦拧拨择挂挚挛挝挟挠挡挣挤挥捞损捡换捣据掳掷掸掺揽搀搁搂搅携摄摆摇摊撑撵擞攒敌数斋斓斗斩断无旧时旷昙昼显晋晒晓晕晖暂术朴机杀杂权杨杰极构枪柜标栈栋栏树样桥桨梦检棂椭楼榄榉槛橱欢欧歼毁毕毙气汇汉汤沟没沥沦沧泞泪泻泼泽洁洒浅浆浇浊测济浏浑浓涂涛涝涡涣润涨涩渊渐渔渗温湾湿溃滚满滤滥滨滩潇潜潴澜濒灭灯灵灾灿炉炜点炼烁烂烛烟烦烧烫热焕爱爷牍牵犹狈狞独狭狮狱狲猎猪猫献獭玛环现玺琏琐琼瓒瓯电画畅疗疮疯痒痨痴瘫癣皑皱盏盐监盖盘眯睁瞒矫矿码砖砚确础碍礼祷祸离秃种秽积称稳穷窍窑窜窝窥竖竞笃笔笋笼筑筛筝签简箩篮篱类粜粮紧纠纤约级纪纫纬纯纱纲纳纵纷纸纹纺纽线练组细织终绊绍经绑绒结绕绘给络绝统绢绣继绩绪续绳维绵综绿缀缓编缘缚缝缠缩缴网罗罚罢羡翘耸耻聂聋职联聪肃肠肤肾肿胀胁胆胜胧脉脏脑脓脚脱脸腊腻腾舆舰舱艰艳艺节芜芦苇苍苏苹范茎茧荐荡荣荤药莱莲获莹莺萝萤营萧萨蓝蔼蕴虏虑虚虫虽虾蚀蚁蚂蛮蜡蝇蝉蝎蝼螨衅衔补衬袄袜袭装裤见观规觅视览觉触誉计订认讥讨让训议讯记讲讳讶许论讽设访诀证评识诈诉诊词译试诗诚话诞询该详诫诬语误诱说诵请诸诺读课谁调谅谈谊谋谍谎谐谓谚谜谢谣谦谨谬谭谱谴贝贞负贡财责贤败账货质贩贪贫购贮贯贱贴贵贷贸费贺贼贾贿赁资赋赌赎赏赐赔赖赚赛赞赠赢赵赶趋跃践踪踊蹿躏轨轩转轮软轰轴轻载轿较辅辆辈辉辐辑输辖辗辩辫边辽达迁过迈运还这进远违连迟迹适选逊递逻遗邓邮邻郁郑酝酱酿释里鉴銮针钉钓钙钞钟钠钢钥钦钩钮钱钻铁铃铅铜铝铭铲银铸铺链销锁锄锅锈锋锐错锡锣锤锦键锯锻镀镇镜镶长门闪闭问闯闰闲间闷闸闹闺闻阀阁阅阐阔队阳阴阵阶际陆陈陕险随隐隶难雏雳雾霁霉静靥鞑韦韧韩页顶项顺须顽顾顿预领颇频颗题颜额颠颤风飘飞饥饭饮饰饱饲饵饶饺饼馆馈首马驮驯驰驱驳驴驶驹驻驼驾骂骄骆骇验骏骑骗骚鱼鲁鲜鲸鸟鸡鸣鸥鸦鸭鸽鹅鹉鹊鹏鹤鹰麦黄齐齿龄龙龟";
const TRAD_OK = new Set([..."帽坐躺枕尺寸材填充稀奇硬干并宁范匙感窗准袋伙呢骨只台叶号里朴后术面才余云凶巩松仇佣刮制匀咏咸夸斗杰痴眯蝎郁霉首"]);
const SIMP_SET = new Set([...SIMPLIFIED].filter((ch) => !TRAD_OK.has(ch)));
const strings = [];
const NAMED_OK = /^(TRAIT_TEXT|LEGACY_TEXT|VISITOR_TEXT|GEAR_TEXT|SHOP_TEXT|BOARD_TEXT)\./; // 參觀者一位接一位（11-08）：數字由程式帶入，可以寫 {mood}、{from} 這種；VISITOR_TEXT 可以寫 {name}、{max}；GEAR_TEXT、SHOP_TEXT（決定 0032）可以寫 {n}、{cap}、{dice}
function walk(v, p) {
  if (typeof v === "string") {
    strings.push([p, v]);
    if (!v.trim()) err("empty string at " + p);
    if (EMOJI.test(v)) err("emoji at " + p + ": " + v);
    for (const ch of v) if (SIMP_SET.has(ch)) err("simplified char '" + ch + "' at " + p + ": " + v);
    if (/[着]/.test(v)) err("'着' (use 著) at " + p);
    if (/[這那哪心家夜眼手水框房]里/.test(v)) err("'里' (use 裡) at " + p + ": " + v);
    if (/\{(?!x\}|圖鑑格數\})/.test(v) && !(NAMED_OK.test(p) && !/\{(?![A-Za-z]+\})/.test(v))) err("stray brace at " + p); // {圖鑑格數}：書裡由程式帶入真正的格數（11-08）；TRAIT_TEXT、LEGACY_TEXT 可以用 {英文名字}（11-08，下面另外檢查）
    if (/俄國8(?!\+9)/.test(v)) err("old name 俄國8 (use 俄國8+9) at " + p + ": " + v);
  } else if (Array.isArray(v)) {
    if (v.length === 0) err("empty array at " + p);
    v.forEach((x, i) => walk(x, p + "[" + i + "]"));
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) walk(v[k], p + "." + k);
  } else if (v === null) {
    // allowed only for CELLAR mood/color; checked below
    if (!/^CELLAR\[\d\]\.rooms\[\d\]\.(mood|color)$/.test(p)) err("null at " + p);
  } else if (typeof v !== "number" && typeof v !== "boolean") {
    err("unexpected value type at " + p + ": " + typeof v);
  }
}
for (const n of NAMES) walk(C[n], n);

const len = (s) => [...s].length;
const isStr = (s) => typeof s === "string" && s.trim().length > 0;
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function keysExactly(o, keys, p, optional = []) {
  if (!isObj(o)) return err(p + " is not an object");
  for (const k of keys) if (!(k in o)) err(p + " missing key " + k);
  for (const k of Object.keys(o)) if (!keys.includes(k) && !optional.includes(k)) err(p + " has extra key " + k);
}
const paren = (s) => /^\(.+\)$/.test(s);

// ---- JOBS / SKILL_TEXT / JOB_TEXT ----
{
  const want = [["detective", "偵查"], ["historian", "鑑賞"], ["occultist", "神秘學"], ["gambler", "幸運"], ["artisan", "手工藝"], ["salesman", "說服"]];
  if (!Array.isArray(C.JOBS) || C.JOBS.length !== 6) err("JOBS must be 6");
  C.JOBS.forEach((j, i) => {
    keysExactly(j, ["id", "name", "skill", "desc", "motto"], "JOBS[" + i + "]");
    if (j.id !== want[i][0] || j.skill !== want[i][1]) err("JOBS[" + i + "] id/skill must be " + want[i]);
  });
  keysExactly(C.SKILL_TEXT, SKILLS, "SKILL_TEXT");
  keysExactly(C.JOB_TEXT, ["pick", "sub", "growth", "history"], "JOB_TEXT");
}

// ---- FUSION_TEXT / RECIPE_TEXT / UPGRADE_TEXT ----
keysExactly(C.FUSION_TEXT, ["intro", "empty", "ready", "sanSub", "mutate", "recipe", "limit", "samePair"], "FUSION_TEXT");
{
  const ids = ["yiqi", "twins", "rainbow", "tipsy", "handstand", "forbidden"];
  keysExactly(C.RECIPE_TEXT, ids, "RECIPE_TEXT");
  for (const id of ids) keysExactly(C.RECIPE_TEXT[id], ["name", "hint", "found"], "RECIPE_TEXT." + id);
  if (C.RECIPE_TEXT.yiqi.name !== "義氣佩佩") err("RECIPE_TEXT.yiqi.name must be 義氣佩佩");
  const names = ids.map((id) => C.RECIPE_TEXT[id].name);
  if (new Set(names).size !== names.length) err("duplicate recipe names");
  const ups = ["ped7", "ped8", "dice", "board", "fame", "forge2", "repair"];
  keysExactly(C.UPGRADE_TEXT, ups, "UPGRADE_TEXT");
  for (const u of ups) keysExactly(C.UPGRADE_TEXT[u], ["name", "desc"], "UPGRADE_TEXT." + u);
}

// ---- {x} placement ----
const NEEDS_X = ["JOB_TEXT.growth", "FUSION_TEXT.mutate", "FUSION_TEXT.recipe", "TRADE_TEXT.receive", "QUIRK_TASK_TEXT.calm.hint"];
for (const [p, s] of strings) {
  const has = /\{x\}/.test(s);
  if (NEEDS_X.includes(p) && !has) err(p + " needs {x}");
  if (!NEEDS_X.includes(p) && has && !NAMED_OK.test(p)) err("{x} in unexpected place " + p);
}
// ---- QUIRK_TASK_TEXT：怪癖的治法，每種都要有四句（11-09，決定 0027；種類跟 logic.js 的 QUIRK_TASKS 一樣） ----
keysExactly(C.QUIRK_TASK_TEXT, ["hug", "deliver", "calm"], "QUIRK_TASK_TEXT");
for (const k of ["hug", "deliver", "calm"]) keysExactly(C.QUIRK_TASK_TEXT[k], ["act", "chip", "where", "hint"], "QUIRK_TASK_TEXT." + k);
// ---- TRAIT_TEXT：跟 config.js 的 PERKS、FLAWS 一一對上；{欄位名} 要是那個優缺點有的欄位（11-08） ----
{
  const T = vm.runInContext("({ PERKS: typeof PERKS !== 'undefined' ? PERKS : null, FLAWS: typeof FLAWS !== 'undefined' ? FLAWS : null })", ctx);
  if (!Array.isArray(T.PERKS) || !Array.isArray(T.FLAWS)) err("config.js needs PERKS and FLAWS");
  else {
    const all = T.PERKS.concat(T.FLAWS);
    if (T.PERKS.length < 8 || T.FLAWS.length < 8) err("PERKS and FLAWS need at least 8 each");
    const ids = all.map((t) => t.id);
    if (new Set(ids).size !== ids.length) err("duplicate PERKS/FLAWS id");
    if (Object.keys(C.TRAIT_TEXT).sort().join(",") !== [...ids].sort().join(",")) err("TRAIT_TEXT ids differ from config PERKS/FLAWS");
    const names = new Set();
    for (const t of all) {
      const tx = C.TRAIT_TEXT[t.id];
      if (!tx) continue;
      keysExactly(tx, ["name", "desc"], "TRAIT_TEXT." + t.id);
      if (names.has(tx.name)) err("duplicate trait name " + tx.name);
      names.add(tx.name);
      for (const m of String(tx.desc).matchAll(/\{([A-Za-z]+)\}/g)) {
        if (!(m[1] in t) && !["from", "to"].includes(m[1])) err("TRAIT_TEXT." + t.id + ".desc uses {" + m[1] + "} but config has no such field");
      }
    }
  }
}

// ---- CELLAR ----
const DICE = /^[1-9]\d*D[1-9]\d*$/;
const SAN_LOSS = /^([1-9]\d*D[1-9]\d*|[1-9]\d*)$/;
const SAN_GAIN = /^\+([1-9]\d*D[1-9]\d*|[1-9]\d*)$/;
const SPEC = /^(0|[1-9]\d*|[1-9]\d*D[1-9]\d*)\/([1-9]\d*|[1-9]\d*D[1-9]\d*)$/;
// 強度門檻的範圍：2026-11-08 跑完 test/sim_cellar.js 後調高（原本 B1 7–9 … B5 15–18，收藏 40 隻時幾乎都過）
const RANGES = { 1: [11, 13], 2: [15, 16], 3: [17, 19], 4: [19, 21], 5: [20, 23] };
const stats = { rooms: 0, choices: 0, types: { power: 0, skill: 0, san: 0, none: 0 }, skills: {}, moods: {}, colors: {}, insp: {} };
function checkOutcome(o, p) {
  keysExactly(o, ["text"], p, ["insp", "san", "myth", "injure"]);
  if (!isObj(o)) return;
  if ("insp" in o && !(Number.isInteger(o.insp) && o.insp > 0)) err(p + ".insp must be a positive integer");
  if ("myth" in o && !(Number.isInteger(o.myth) && o.myth > 0)) err(p + ".myth must be a positive integer");
  if ("injure" in o && o.injure !== true) err(p + ".injure must be true if present");
  if ("san" in o && !(typeof o.san === "string" && (SAN_LOSS.test(o.san) || SAN_GAIN.test(o.san)))) err(p + ".san bad expression: " + o.san);
}
{
  const F = C.CELLAR;
  if (!Array.isArray(F) || F.length !== 5) err("CELLAR must have 5 floors");
  const roomIds = new Set();
  F.forEach((fl, fi) => {
    const p = "CELLAR[" + fi + "]";
    keysExactly(fl, ["floor", "name", "intro", "clear", "rooms"], p);
    if (fl.floor !== fi + 1) err(p + ".floor should be " + (fi + 1));
    if (!Array.isArray(fl.rooms) || fl.rooms.length !== 4) err(p + ".rooms must be 4 (B5: 3 + boss)");
    let floorInsp = 0;
    (fl.rooms || []).forEach((r, ri) => {
      const rp = p + ".rooms[" + ri + "](" + r.id + ")";
      stats.rooms++;
      keysExactly(r, ["id", "title", "lines", "mood", "color", "choices"], rp, ["boss"]);
      const expId = fl.floor + "abcd"[ri];
      if (r.id !== expId) err(rp + " id should be " + expId);
      if (roomIds.has(r.id)) err(rp + " duplicate id");
      roomIds.add(r.id);
      if ("boss" in r && !(r.boss === true && fl.floor === 5 && ri === 3)) err(rp + " boss flag only on the last B5 room");
      if (!Array.isArray(r.lines) || r.lines.length !== 2) err(rp + ".lines must be 2");
      if (!(r.mood === null || MOODS.includes(r.mood))) err(rp + ".mood invalid: " + r.mood);
      if (!(r.color === null || COLORS.includes(r.color))) err(rp + ".color invalid: " + r.color);
      stats.moods[r.mood] = (stats.moods[r.mood] || 0) + 1;
      stats.colors[r.color] = (stats.colors[r.color] || 0) + 1;
      if (!Array.isArray(r.choices) || r.choices.length < 2 || r.choices.length > 3) err(rp + ".choices must be 2-3");
      let nonNone = 0;
      (r.choices || []).forEach((c, ci) => {
        const cp = rp + ".choices[" + ci + "]";
        stats.choices++;
        const ck = c.check || {};
        const t = ck.type;
        if (!["power", "skill", "san", "none"].includes(t)) { err(cp + " bad check.type " + t); return; }
        stats.types[t]++;
        if (t !== "none") nonNone++;
        if (t === "none") keysExactly(c, ["label", "check", "success"], cp);
        else keysExactly(c, ["label", "check", "success", "fail"], cp);
        if (t === "power") {
          keysExactly(ck, ["type", "target"], cp + ".check");
          const [lo, hi] = RANGES[fl.floor];
          if (!Number.isInteger(ck.target) || ck.target < lo || ck.target > hi) err(cp + " power target " + ck.target + " not in " + lo + "-" + hi);
        } else if (t === "skill") {
          keysExactly(ck, ["type", "skill", "mod"], cp + ".check");
          if (!SKILLS.includes(ck.skill)) err(cp + " bad skill " + ck.skill);
          if (!Number.isInteger(ck.mod) || ck.mod < -20 || ck.mod > 20) err(cp + " mod out of range");
          stats.skills[ck.skill] = (stats.skills[ck.skill] || 0) + 1;
        } else if (t === "san") {
          keysExactly(ck, ["type", "spec"], cp + ".check");
          if (!SPEC.test(ck.spec || "")) err(cp + " bad san spec " + ck.spec);
        } else {
          keysExactly(ck, ["type"], cp + ".check");
          const s = c.success || {};
          if (["insp", "san", "myth", "injure"].some((k) => k in s)) err(cp + " none-type success must gain nothing");
        }
        checkOutcome(c.success, cp + ".success");
        if (t !== "none") checkOutcome(c.fail, cp + ".fail");
        if (t === "san" && c.fail && "san" in c.fail) warn(cp + " san-check fail also carries san (double loss?)");
        if (c.success && c.success.insp) floorInsp = Math.max(floorInsp, c.success.insp);
        if (len(c.label) > 14) warn(cp + " label longer than 14: " + c.label);
      });
      if (nonNone === 0) err(rp + " needs at least one non-none choice");
    });
    stats.insp["B" + fl.floor] = floorInsp;
  });
}

// ---- CHAPTER4 / BOOK4 / ENDING_CELLAR ----
{
  const ch = C.CHAPTER4;
  keysExactly(ch, ["id", "title", "spine", "pages"], "CHAPTER4");
  if (ch.id !== 4) err("CHAPTER4.id must be 4");
  if (!/^第肆章　/.test(ch.title)) err("CHAPTER4.title must start with 第肆章　");
  if (!isStr(ch.spine) || len(ch.spine) > 6) err("CHAPTER4.spine 1-6 chars");
  if (!Array.isArray(ch.pages) || ch.pages.length !== 5) err("CHAPTER4.pages must be 5");
  ch.pages.forEach((pg, j) => {
    const lines = pg.split("\n");
    if (lines.length < 2 || lines.length > 5) err("CHAPTER4.pages[" + j + "] 2-5 lines");
    lines.forEach((l) => { if (!l.trim()) err("CHAPTER4.pages[" + j + "] blank line"); if (len(l) > 30) warn("CHAPTER4 line > 30: " + l); });
  });
  const b = C.BOOK4;
  keysExactly(b, ["id", "title", "spine", "lines", "san", "myth", "successAside", "failAside"], "BOOK4");
  if (b.id !== "book4" || b.san !== "1D4/1D10" || b.myth !== 3) err("BOOK4 id/san/myth mismatch");
  if (!isStr(b.spine) || len(b.spine) > 6) err("BOOK4.spine 1-6 chars");
  if (!Array.isArray(b.lines) || b.lines.length !== 3) err("BOOK4.lines must be 3");
  if (!paren(b.successAside) || !paren(b.failAside)) err("BOOK4 asides must be (…)");
  const e = C.ENDING_CELLAR;
  keysExactly(e, ["title", "lines"], "ENDING_CELLAR");
  if (e.title !== "地下館長") err("ENDING_CELLAR.title must be 地下館長");
  if (!Array.isArray(e.lines) || e.lines.length < 7 || e.lines.length > 9) err("ENDING_CELLAR.lines must be 7-9");
  // name clashes with content.js books/chapters
  const prevBooks = vm.runInContext("FORBIDDEN_BOOKS.map(b => b.spine + '|' + b.title)", ctx).join(",");
  if (prevBooks.includes(b.spine) || prevBooks.includes(b.title)) err("BOOK4 title/spine clashes with content.js");
  const prevSpines = vm.runInContext("STORY_CHAPTERS.map(c => c.spine)", ctx);
  if (prevSpines.includes(ch.spine)) err("CHAPTER4 spine clashes with content.js");
}

// ---- CLIENT_LINES ----
function valueList(v) {
  if (typeof v === "string") return { mode: "in", list: [v] };
  if (Array.isArray(v)) return { mode: "in", list: v };
  if (isObj(v) && Object.keys(v).length === 1 && "not" in v) return { mode: "not", list: Array.isArray(v.not) ? v.not : [v.not] };
  return null;
}
{
  const want = { collector: ["老派收藏家", "紳士帽"], priest: ["某位祭司", "虔誠"], youth: ["穿運動服的少年", "夜市金"] };
  keysExactly(C.CLIENT_LINES, Object.keys(want), "CLIENT_LINES");
  for (const [k, [name, gift]] of Object.entries(want)) {
    const L = C.CLIENT_LINES[k], p = "CLIENT_LINES." + k;
    keysExactly(L, ["name", "gift", "intro", "finale", "steps"], p);
    if (L.name !== name || L.gift !== gift) err(p + " name/gift must be " + name + "/" + gift);
    if (!Array.isArray(L.steps) || L.steps.length !== 5) err(p + ".steps must be 5");
    const seen = new Set();
    L.steps.forEach((s, i) => {
      const sp = p + ".steps[" + i + "]";
      keysExactly(s, ["text", "need", "comment"], sp);
      if (!isObj(s.need) || !Object.keys(s.need).length) return err(sp + ".need empty");
      const sig = JSON.stringify(s.need);
      if (seen.has(sig)) err(sp + " duplicate need within the line");
      seen.add(sig);
      for (const [cat, v] of Object.entries(s.need)) {
        if (!(cat in BASE)) { err(sp + ".need bad category " + cat); continue; }
        const vl = valueList(v);
        if (!vl || !vl.list.length) { err(sp + ".need." + cat + " bad shape"); continue; }
        for (const o of vl.list) if (!BASE[cat].includes(o)) err(sp + ".need." + cat + " not a BASE option: " + o);
        const ok = BASE[cat].some((o) => (vl.mode === "in" ? vl.list.includes(o) : !vl.list.includes(o)));
        if (!ok) err(sp + ".need." + cat + " unsatisfiable");
      }
    });
  }
}

// ---- WEEKLY / TRADE / NEW_OPTION / ROOM_HINTS3 ----
{
  const ids = ["start32", "allBlack", "allFlat", "failedOnly", "noHat", "noLegend", "pillowWeek", "gopnikWeek"];
  keysExactly(C.WEEKLY_TEXT, ids, "WEEKLY_TEXT");
  for (const id of ids) keysExactly(C.WEEKLY_TEXT[id], ["name", "rule"], "WEEKLY_TEXT." + id);
  keysExactly(C.TRADE_TEXT, ["send", "receive", "already", "bad"], "TRADE_TEXT");
  keysExactly(C.NEW_OPTION_TEXT, NEW_OPTS, "NEW_OPTION_TEXT");
  keysExactly(C.ROOM_HINTS3, ["fusion", "office", "cellar", "casino"], "ROOM_HINTS3");
}

// ---- ids must match config.js ----
{
  const ids = globalThis.__cfgIds;
  if (Object.keys(C.RECIPE_TEXT).sort().join(",") !== ids.recipes) err("RECIPE_TEXT ids differ from config RECIPES: " + ids.recipes);
  if (Object.keys(C.UPGRADE_TEXT).sort().join(",") !== ids.upgrades) err("UPGRADE_TEXT ids differ from config UPGRADES: " + ids.upgrades);
  if (Object.keys(C.WEEKLY_TEXT).sort().join(",") !== ids.weekly) err("WEEKLY_TEXT ids differ from config WEEKLY_IDS: " + ids.weekly);
  for (const [k, L] of Object.entries(C.CLIENT_LINES)) if (globalThis.__giftOf[k] !== L.gift) err("CLIENT_LINES." + k + ".gift should be " + globalThis.__giftOf[k] + " per config");
  const floors = Object.keys(CFG.CELLAR_REWARDS).map(Number).sort().join(",");
  if (floors !== C.CELLAR.map((f) => f.floor).join(",")) err("CELLAR floors differ from CELLAR_REWARDS");
}

// ---- forbidden topics ----
for (const [p, s] of strings) if (/4chan|meme|迷因|Pepe the Frog|川普|政治|adidas|愛迪達|伏特加|cheeki/i.test(s)) err("forbidden reference at " + p + ": " + s);

// ---- length report ----
for (const [p, s] of strings) {
  if (/^CHAPTER4\.pages/.test(p)) continue;
  if (len(s) > 30) warn("> 30 chars at " + p + " (" + len(s) + "): " + s);
}

let total = 0;
for (const [, s] of strings) total += len(s);
console.log("strings:", strings.length, "total chars:", total);
console.log("cellar:", JSON.stringify(stats));
if (warns.length) console.log("\nWARNINGS (" + warns.length + "):\n  " + warns.join("\n  "));
if (errors.length) {
  console.log("\nERRORS (" + errors.length + "):\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("\nOK: all checks passed");
