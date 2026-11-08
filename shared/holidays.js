// ================================================================
//  台灣的節日表（2026～2028）、節日的外觀、節日的藝術品（決定 0030）
//  翊文 11-09：「還要有考慮台灣節日特別活動」「每日有特別的節日時，外觀主題要改一下下(當天而已)，然後劇情可能可以提到有關的」
//             「節慶也要新增節慶相關的畫廊的畫或雕像等等的藝術品，並且整合到劇情線」
//
//  日期怎麼來的（農曆的節日、節氣，兩個來源對過，一天都沒差；維護日誌 11-09_翊文_每日簽到.md 有完整的表）：
//    1. 香港天文台「公曆與農曆日期對照表」2026、2027、2028（T2026e.txt 這幾個檔）。香港、台灣都是 UTC+8，農曆的日子一樣。
//    2. 中央氣象署「日曆資料表」115、116、117 年（cwa.gov.tw/Data/astronomy/2026cal.pdf 這幾個檔）。
//    另外對了放假的公告：115 年休假日一覽表（依行政院人事行政總處 115 年辦公日曆表）、116 年辦公日曆表的新聞（端午 6/9、中秋 9/15）。
//    2029 年以後還沒放進來：要加的話照上面兩個來源查，再在 test/signin.test.cjs 加已知的日期。
//
//  一天＝台灣時間 05:00 到隔天 05:00（決定 0019）：節日那天也是照 todayStr() 的日期，凌晨 04:59 還算前一天。
//  純函式：只讀傳進來的日期字串（"YYYY-MM-DD"），不碰時鐘、不碰畫面。
//  之後每週劇情（docs/每週劇情.md）要用：holidayOf(日期) 回傳名字、主題、「節日的話」、那天的藝術品。
//  文字在 content3.js 的 HOLIDAY_TEXT（草稿，Yuga 可以改）；獎勵的數字在 config.js 的 NUM.signin。
// ================================================================
import { NUM } from "./config.js";
import { HOLIDAY_TEXT } from "./content3.js";

export const HOLIDAY_YEARS = [2026, 2027, 2028];

// 每個節日：
//   kind   國定（國定假日）、傳統（傳統節日、節氣）、紀念（紀念日：不換外觀、不發獎勵、不貼節日公告）
//   fixed  每年同一天（"MM-DD"）；dates：每年不一樣的（農曆、節氣），照年份寫
//   look   外觀的主題（body 的 class 是 holiday-主題；畫廊的藝術品也用它畫小裝飾）。紀念日沒有
//   art    那天畫廊「節日特展」的藝術品：base 是用遊戲已經有的哪一種畫（web/src/art.js 的 ART.exhibit），statue 是新畫的節日雕像；
//          look 是畫上加的小裝飾；san 是看的時候的理智檢定（不寫＝不可怕）。標題、說明牌在 HOLIDAY_TEXT[節日].art
//   同一天有兩個節日（2028-04-04 兒童節、清明節）：照這張表的順序，前面的算「那天的節日」，外觀和獎勵只給一份。
export const HOLIDAY_INFO = [
  { key: "newyear", kind: "國定", fixed: "01-01", look: "confetti", art: [{ base: "rare", look: "confetti" }] },
  { key: "spring", kind: "傳統", look: "spring", art: [{ base: "portrait", look: "couplet" }, { base: "holstatue", look: "lantern" }],
    dates: { 2026: ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21"], 2027: ["2027-02-05", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-02-10"], 2028: ["2028-01-25", "2028-01-26", "2028-01-27", "2028-01-28", "2028-01-29", "2028-01-30"] } }, // 除夕到初五
  { key: "lantern", kind: "傳統", look: "lantern", art: [{ base: "portrait", look: "lantern" }], dates: { 2026: ["2026-03-03"], 2027: ["2027-02-20"], 2028: ["2028-02-09"] } }, // 元宵：正月十五
  { key: "peace", kind: "紀念", fixed: "02-28", look: null, art: [] }, // 和平紀念日：安靜的一天，只在日曆上標出來
  { key: "children", kind: "國定", fixed: "04-04", look: "balloon", art: [{ base: "rare", look: "balloon" }] },
  { key: "qingming", kind: "傳統", look: "willow", art: [{ base: "portrait", look: "willow" }], dates: { 2026: ["2026-04-05"], 2027: ["2027-04-05"], 2028: ["2028-04-04"] } }, // 清明（節氣）
  { key: "labor", kind: "國定", fixed: "05-01", look: "tea", art: [{ base: "portrait", look: "tea" }] },
  { key: "duanwu", kind: "傳統", look: "zongzi", art: [{ base: "holstatue", look: "zongzi" }], dates: { 2026: ["2026-06-19"], 2027: ["2027-06-09"], 2028: ["2028-05-28"] } }, // 端午：五月初五
  { key: "qixi", kind: "傳統", look: "stars", art: [{ base: "rare", look: "stars" }], dates: { 2026: ["2026-08-19"], 2027: ["2027-08-08"], 2028: ["2028-08-26"] } }, // 七夕：七月初七
  { key: "ghost", kind: "傳統", look: "waterlamp", art: [{ base: "portrait", look: "waterlamp", san: "0/1D3" }], dates: { 2026: ["2026-08-27"], 2027: ["2027-08-16"], 2028: ["2028-09-03"] } }, // 中元：七月十五
  { key: "midautumn", kind: "傳統", look: "moon", art: [{ base: "rare", look: "moon" }, { base: "holstatue", look: "moon" }], dates: { 2026: ["2026-09-25"], 2027: ["2027-09-15"], 2028: ["2028-10-03"] } }, // 中秋：八月十五
  { key: "teacher", kind: "國定", fixed: "09-28", look: "book", art: [{ base: "portrait", look: "book" }] }, // 教師節（孔子誕辰紀念日）
  { key: "national", kind: "國定", fixed: "10-10", look: "firework", art: [{ base: "rare", look: "firework" }] },
  { key: "chongyang", kind: "傳統", look: "chrys", art: [{ base: "portrait", look: "chrys" }], dates: { 2026: ["2026-10-18"], 2027: ["2027-10-08"], 2028: ["2028-10-26"] } }, // 重陽：九月初九
  { key: "dongzhi", kind: "傳統", look: "tangyuan", art: [{ base: "holstatue", look: "tangyuan" }], dates: { 2026: ["2026-12-22"], 2027: ["2027-12-22"], 2028: ["2028-12-21"] } }, // 冬至（節氣）
  { key: "xmas", kind: "傳統", fixed: "12-25", look: "xmas", art: [{ base: "rare", look: "xmas" }] },
  { key: "nye", kind: "傳統", fixed: "12-31", look: "confetti", art: [{ base: "portrait", look: "clock" }] }, // 跨年
];

// "YYYY-MM-DD" 往後 n 天（UTC 算，跟 logic.js 的 addDays 一樣；這個檔不 import logic.js，名字不能跟它重複）
export function holAddDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// 一個節日在某一年的日子（照順序）
export function holidayDates(info, year) {
  if (info.fixed) return HOLIDAY_YEARS.includes(+year) ? [`${year}-${info.fixed}`] : [];
  return (info.dates && info.dates[year]) || [];
}
// 全部節日的每一天：[{ date, key, i（那個節日的第幾天）, n（一共幾天） }]，照日期排
export const HOLIDAY_DAYS = (() => {
  const out = [];
  HOLIDAY_INFO.forEach((info, order) => HOLIDAY_YEARS.forEach(y => {
    const ds = holidayDates(info, y);
    ds.forEach((date, i) => out.push({ date, key: info.key, i, n: ds.length, order }));
  }));
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
})();

const holInfo = key => HOLIDAY_INFO.find(x => x.key === key) || null;
const holText = key => (typeof HOLIDAY_TEXT !== "undefined" && HOLIDAY_TEXT[key]) || { name: key, words: "", notice: [], art: [] };

// 節日的藝術品：id 是 "hx-節日-第幾件"。回傳跟畫廊的展品一樣的格式（exhibitById 用得到），多了 holiday、look
export function holidayExhibitById(id) {
  const m = /^hx-([a-z]+)-(\d+)$/.exec(String(id));
  if (!m) return null;
  const info = holInfo(m[1]), i = +m[2];
  if (!info || !info.art[i]) return null;
  const a = info.art[i], t = (holText(info.key).art || [])[i] || {};
  const ex = { id, art: a.base, look: a.look, holiday: info.key, title: t.title || "節日的藝術品", label: t.label || ("觀看" + (t.title || "節日的藝術品")), lines: t.lines || [] };
  if (a.san) ex.san = a.san;
  ["aside", "successAside", "failAside"].forEach(k => { if (t[k]) ex[k] = t[k]; });
  return ex;
}
export function holidayExhibitIds(key) { const info = holInfo(key); return info ? info.art.map((_, i) => `hx-${key}-${i}`) : []; }

// 這一天的節日（可能有兩個）。每一個：
//   key、name（名字）、dayName（春節那幾天寫「除夕」「初壹」…，其他跟 name 一樣）、kind、look（外觀；紀念日是 null）
//   words（節日的話，館方的口吻，之後每週劇情可以拿來用）、from／to（這次節日的第一天、最後一天）、day（第幾天，從 1 算）
//   reward（那天簽到多拿的：{ insp, mood, mat }；紀念日是 null）、art（那天畫廊節日特展的藝術品，exhibitById 的格式）
export function holidaysOn(date) {
  return HOLIDAY_DAYS.filter(d => d.date === date).map(d => {
    const info = holInfo(d.key), T = holText(d.key), year = +date.slice(0, 4);
    const ds = holidayDates(info, year);
    const quiet = info.kind === "紀念";
    const S = (NUM.signin && NUM.signin.holiday) || { insp: 0, mood: 0, mat: 0 };
    return {
      key: d.key, id: `${d.key}-${year}`, name: T.name, dayName: (T.days && T.days[d.i]) || T.name, kind: info.kind, look: info.look || null,
      words: T.words || "", from: ds[0], to: ds[ds.length - 1], day: d.i + 1, days: d.n,
      reward: quiet ? null : { insp: S.insp || 0, mood: S.mood || 0, mat: S.mat || 0 },
      art: holidayExhibitIds(d.key).map(holidayExhibitById),
    };
  });
}
export function holidayOf(date) { return holidaysOn(date)[0] || null; }

// body 要加的 class（節日的外觀）。沒有節日、紀念日：""。date 照 todayStr()，所以 05:00 換日時外觀跟著換
export function holidayClass(date) {
  const h = holidayOf(date);
  return h && h.look ? "holiday-" + h.look : "";
}
// 那一天畫廊的節日特展（紀念日沒有）
export function holidayExhibits(date) {
  const h = holidayOf(date);
  return h ? h.art : [];
}
// 某個月有哪些節日：{ "YYYY-MM-DD": [節日, …] }（month 從 1 算）
export function holidaysInMonth(year, month) {
  const pre = `${year}-${String(month).padStart(2, "0")}-`, out = {};
  HOLIDAY_DAYS.filter(d => d.date.startsWith(pre)).forEach(d => { if (!out[d.date]) out[d.date] = holidaysOn(d.date); });
  return out;
}
// 下一個節日（今天也算；紀念日不算）：{ date, holiday } 或 null
export function nextHoliday(today) {
  const d = HOLIDAY_DAYS.find(x => x.date >= today && holInfo(x.key).kind !== "紀念");
  return d ? { date: d.date, holiday: holidaysOn(d.date)[0] } : null;
}

// 公佈欄的節日公告（shared/notices.js 的格式）：節日前 NUM.signin.noticeBefore 天發布，節日最後一天下架；紀念日不貼
// 一次節日一則（春節除夕到初五是同一則）
export function holidayNotices(today) {
  const before = (NUM.signin && NUM.signin.noticeBefore) || 0, out = [];
  const seen = new Set();
  HOLIDAY_DAYS.forEach(d => {
    const info = holInfo(d.key);
    if (info.kind === "紀念") return;
    const year = +d.date.slice(0, 4), id = `hol-${d.key}-${year}`;
    if (seen.has(id)) return;
    seen.add(id);
    const ds = holidayDates(info, year), from = ds[0], to = ds[ds.length - 1];
    const publish = holAddDays(from, -before);
    if (today < publish || today > to) return;
    const T = holText(d.key), h = holidaysOn(from)[0], R = h && h.reward;
    const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
    const when = from === to ? `${md(from)} 05:00 到隔天 05:00（台灣時間）。` : `${md(from)} 05:00 到 ${md(holAddDays(to, 1))} 05:00（台灣時間），壹共 ${ds.length} 天。`;
    const gift = R ? [`節日那天${ds.length > 1 ? "每天" : ""}簽到多壹份：靈感 +${R.insp}、心情 +${R.mood}${R.mat ? `、星光絨 ×${R.mat}` : ""}。`] : [];
    out.push({
      id, v: 1, cat: "特展活動", tags: ["活動"], importance: "normal", holiday: d.key,
      title: `${T.name}：館裡的節日特展`, publish, expire: to, start: from, end: to,
      sections: [["內容", [T.words].concat(T.notice || [], h && h.art.length ? [`畫廊多了「節日特展」：${h.art.map(a => "《" + a.title + "》").join("、")}，只有節日那天看得到。`] : [])], ["時間", [when]], ["獎勵", gift.concat(["館裡的燈和裝飾也會換壹下，過了 05:00 自己換回來（設定裡可以關掉）。"])]],
      cta: { label: "打開簽到日曆", panel: "calendar" },
    });
  });
  return out;
}
