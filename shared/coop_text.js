// ================================================================
//  合作地下收藏庫的文字（草稿，Yuga 可以改；Yuga 改過的以 Yuga 的為準）。
//  畫面文字用「壹」。規則在 shared/coop.js、coop_flow.js。
// ================================================================

// 全隊的理智壓力：畫面上的感覺（機制 1）。lv ＝第幾級；hint ＝提示；odd ＝這一間發生的怪事，伺服器抽一句，大家看到同一句
export const COOP_PRESSURE_TEXT = [
  { lv: 0, hint: "", odd: [] },
  { lv: 1, hint: "全隊的理智有點低了：空氣變重了。", odd: ["天花板上有東西輕輕走過去。", "你們的影子比你們慢了半拍。", "有人數了壹下隊伍的人數，多了壹個。", "遠處有門關上的聲音。這裡沒有門。"] },
  { lv: 2, hint: "全隊的理智很低：房間裡的大東西開始注意你們了。", odd: ["牆壁在呼吸，而且跟你們同壹個節奏。", "有壹隻佩佩在看不存在的方向。", "地上多了壹串腳印，走得比你們還前面。", "某個很大的東西，在隔壁翻了個身。"] },
  { lv: 3, hint: "全隊的理智快沒了：牠知道你們在這裡。", odd: ["牠就站在你們中間，只是沒有人敢數。", "所有的佩佩壹起轉過頭。", "燈滅了壹下。亮起來的時候，大家都站近了壹點。不是你們走的。", "有人在叫你的名字，用你隊友的聲音。"] },
];

// 這一趟怎麼結束的
export const COOP_OVER_TEXT = {
  done: "大家回到地面了。",
  retreat: "你們決定撤退。走到哪，算到哪。",
  lost: "沒有人走得動了。收藏庫安靜下來。",
  stale: "太久沒有人動，這壹趟就算到這裡。",
};

// 門上的記號（機制 2）。用字不用圖：要能用短句說出來（「我看到 月」）
export const COOP_SYMBOLS = ["月", "眼", "手", "骨", "鑰", "傘", "蛙", "火", "門", "牙"];
// 選項的代號：甲、乙、丙。留守的人看不到選項的字，要靠代號講
export const COOP_LETTERS = ["甲", "乙", "丙", "丁"];

// 快速短句（機制 4）。warp ＝理智低的時候可能變成的別句話；arg："sym" 要選記號、"pick" 要選選項
export const COOP_SAY = [
  { id: "see", text: "我看到「{x}」", arg: "sym" },
  { id: "pick", text: "選{x}", arg: "pick" },
  { id: "avoid", text: "別選{x}", arg: "pick" },
  { id: "go", text: "走這邊", warp: ["走……這邊……？", "走那邊", "不要走"] },
  { id: "wait", text: "等我壹下", warp: ["等……等壹下……牠", "不要等我"] },
  { id: "safe", text: "安全", warp: ["牠在後面", "安……全……？", "不安全"] },
  { id: "scary", text: "太可怕了", warp: ["太……可愛了", "牠很可愛"] },
  { id: "mine", text: "交給我", warp: ["交給牠", "把我交出去"] },
  { id: "trust", text: "相信我", warp: ["不要相信我", "相信牠"] },
  { id: "doubt", text: "我不確定", warp: ["我確定", "我確定牠在"] },
  { id: "yes", text: "好", warp: ["好好好好好", "好……？"] },
  { id: "no", text: "不要", warp: ["要", "不要回頭"] },
];
// 佩佩的叫聲。warp ＝理智低的時候叫出來的樣子
export const COOP_CALLS = [
  { id: "gua", text: "呱", warp: ["呱呱呱呱呱", "……呱？", "（不是呱）"] },
  { id: "wa", text: "哇", warp: ["哇哇哇", "哇……哇……", "（有人在學你）"] },
  { id: "shh", text: "噓", warp: ["噓噓噓噓", "噓……牠醒了"] },
  { id: "guu", text: "咕", warp: ["咕嚕咕嚕", "咕？咕？", "（牠也咕了壹聲）"] },
];

// 畫面上的說明（不破梗）
export const COOP_CLUE_TEXT = {
  hint: "門上有三個記號。每個人只看得到壹部分：用短句說出來，拼起來。三個都對上的那個選項，過起來比較容易。",
  solo: "門上有三個記號，你只看得到壹部分。三個都對上的那個選項，過起來比較容易。",
  ghost: "你是幽靈了：看得到真正的記號，但是不能說話。只能敲壹下，讓壹個選項發抖。",
  guard: "你在監視器前，看不到房間裡的細節。",
};

// 湊證據猜真相（機制 3）。每種證據一個代號；每位住客有三種。猜對了記進《看懂的事》（content3.js 的 UNDERSTAND_TEXT，id 是 understand）
export const COOP_EVIDENCE = { foot: "腳印", smell: "味道", sound: "聲音", photo: "照片", scratch: "抓痕", cold: "冷風", hair: "毛" };
export const COOP_EVIDENCE_LINES = {
  foot: "灰塵上有壹串小腳印，走到牆邊就沒有了。",
  smell: "聞到壹股舊抱枕的味道。這裡沒有抱枕。",
  sound: "有東西在數數。數到八，停壹下，再數九。",
  photo: "地上有壹張照片。照片裡是你們，從背後拍的。",
  scratch: "門框上有抓痕，由下往上，越來越深。",
  cold: "有壹陣冷風，只吹過其中壹個人。",
  hair: "架子上黏著壹撮毛。你們都沒有這個顏色的毛。",
};
export const COOP_RESIDENTS = [
  { id: "dust", name: "灰塵裡的小佩佩", ev: ["foot", "smell", "hair"], desc: "晚上才下來的那些。", understand: "coop_dust" },
  { id: "statue", name: "站太久的參觀者", ev: ["foot", "cold", "photo"], desc: "他們以為還在排隊。", understand: "coop_statue" },
  { id: "frame", name: "畫框裡走下來的", ev: ["scratch", "photo", "sound"], desc: "牠們記得每壹個看過牠們的人。", understand: "coop_frame" },
  { id: "water", name: "水閘後面的那隻", ev: ["sound", "cold", "smell"], desc: "牠在等人把閘打開。", understand: "coop_water" },
  { id: "hat", name: "住在帽子裡的", ev: ["hair", "scratch", "sound"], desc: "牠挑的不是帽子，是頭。", understand: "coop_hat" },
  { id: "none", name: "什麼都沒有", ev: ["cold", "photo", "hair"], desc: "這才是最可怕的答案。", understand: "coop_none" },
];
export const COOP_TRUTH_TEXT = {
  right: "猜對了。這壹層住的，是「{x}」。",
  wrong: "猜錯了。這壹層住的，是「{x}」。牠聽到了。",
  none: "沒有人開口。牠也沒有。",
};

// 兩個人一起才搬得動（機制 8）：每層一件，門口的東西
export const COOP_ITEMS = ["第壹代的大理石展台", "裹著白布的半身像", "空畫框堆成的塔", "泡過水的檔案櫃", "沒有底的白色箱子"];
export const COOP_CARRY_TEXT = {
  ask: "角落有壹件「{x}」。壹隻佩佩抬不動。要兩個人壹左壹右，同時抬。",
  solo: "角落有壹件「{x}」。壹隻佩佩抬不動。館方助手會抬另壹邊。",
  ok: "「{x}」搬回來了。{who}抬得很穩，大家都鬆了壹口氣。",
  slip: "手滑了。「{x}」掉在地上，碎成壹地。有什麼東西，被吵醒了。",
  bump: "{who}都抓同壹邊，撞在壹起。「{x}」摔碎了。有什麼東西，被吵醒了。",
  left: "沒有人抬。「{x}」留在原地，好像有點失望。",
  alone: "{who}壹個人抬不動。「{x}」留在原地。",
  woke: "吵醒的東西還在：這壹間門檻 +1、技能 −5。",
};

// 留守（機制 5）：監視器上怎麼寫
export const COOP_GUARD_TEXT = {
  danger: ["安全", "低", "中", "高"],
  hazard: "有東西",
  hint: "你看得到每間房的危險度，看不到房間裡有什麼。下面的人看得到細節，看不到這張圖。要靠講的。",
  below: "這隊有人留在監視器前，他看得到你們看不到的。",
  hazardHit: "監視器上那個紅點，就在這裡。",
};

// 探險報告（機制 9）的句子
export const COOP_REPORT_TEXT = {
  title: { done: "探險報告", retreat: "探險報告：撤退", lost: "探險報告：沒有人回來", stale: "探險報告：不了了之" },
  save: "{who}的理智只剩 {san}，{by}替他擋下來了。",
  knock: "幽靈{by}敲了壹下，大家跟著選，過了。",
  halluc: "{who}看到 {n} 次不存在的記號。",
  hallucOne: "{who}看到了不存在的「{sym}」。",
  scary: "最驚險的壹間：「{room}」，全隊掉了 {n} 點理智。",
  calm: "這壹趟很平靜。平靜得有點可疑。",
  ghost: "{who}在「{room}」理智歸零了。",
  warp: "{who}想說「{from}」，大家聽到的是「{to}」。",
  carryOk: "{who}把「{item}」搬回來了。",
  carrySlip: "「{item}」摔碎了，碎片現在還在 B{floor}。",
  truthOk: "全隊猜對了：B{floor} 住的是「{x}」。",
  truthNo: "全隊猜錯了：B{floor} 住的是「{x}」。",
  guard: "{who}全程在監視器前面看。",
  funnyNone: "搞笑的壹刻：沒有。大家都很認真，這本身就很好笑。",
};
