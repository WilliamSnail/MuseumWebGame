// 每天傍晚的「台股收盤＋美股盤前」（翊文 11-27：「傍晚行情 這個還不錯，可以也排成發嗎」）。
// 純函式：給台股、美股的行情文件（stocksTw/latest、stocksUs/latest），組成 Discord 的字。格式跟美股晨間行情（us_close.js）壹樣：每支壹行，遊戲名＋代號、漲跌、遊戲價。
// 台股今天沒開（週末、假日）就只寫美股；美股今天沒有盤前（週末、美國假日）就只寫台股；兩個都沒有回空字串（不發）。
// 誰叫：functions/stock/stock_div.js 的 stockDivTick（台灣每小時 :17），18:17 那次組字寫進 discordOutbox/evening-日期（同壹天只發壹次）。

const evOk = v => typeof v === "number" && isFinite(v) && v > 0;
const evFmt = n => (n >= 100 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const evPct = r => `${r >= 0 ? "▲" : "▼"}${Math.abs(r * 100).toFixed(1)}%`;
const evPick = (list, key) => { let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return list[h % list.length]; };

// 評語：台股、美股盤前各自是漲（平均 > +0.3%）、跌（< −0.3%）或平；照組合挑壹句（同壹天同壹句）
export const EVENING_TALK = {
  bothUp: [
    "白天這邊漲，傍晚那邊也漲。櫃台的人把兩本帳疊在壹起，厚度剛好，可是他說：兩邊都順的日子，最容易忘記有東西沒算進去。",
    "兩邊的數字都往上爬，窗口前的人比平常多，說話也比平常大聲。櫃台的人沒有跟著笑，只是把算盤擦了壹遍，好像在等什麼。",
  ],
  bothDown: [
    "白天跌，傍晚那邊也沒有要漲的樣子。櫃台的人把燈調暗壹點，說：這種日子，看太清楚也沒用，先喝口熱的。",
    "兩本帳都翻到紅字那頁。窗口外的人站得很近，近到玻璃起了壹層霧。櫃台的人在霧上畫了壹條線，線的兩邊，壹邊是今天，壹邊是明天。",
  ],
  twDownUsUp: [
    "白天這邊跌的比漲的多，櫃台的人把下午的單子壓在算盤底下，嘆了壹口氣。可是傍晚窗口壹開，館外那壹邊的數字幾乎全往上爬。櫃台的人看了很久，說：同壹本帳，白天跟晚上，像是兩個人在記。",
    "白天的帳收得不太好看，傍晚那邊卻熱鬧起來。櫃台的人說，館外的風向常常這樣，壹邊下雨，壹邊出太陽，站在窗口的人只能挑壹邊撐傘。",
  ],
  twUpUsDown: [
    "白天這邊收得不錯，傍晚那邊卻壹開門就往下走。櫃台的人把白天賺的那頁摺了壹個角，說：先記好，晚上的事晚上再說。",
    "台股收得漂亮，館外那壹邊的盤前卻有點冷。櫃台的人倒了兩杯茶，壹杯給白天的自己，壹杯給晚上的自己，兩杯都沒喝完。",
  ],
  calm: [
    "兩邊都很安靜，數字只動了壹點點。櫃台的人說，這種傍晚最適合把舊帳再對壹遍，對完，還是差那壹點。",
    "白天沒什麼起伏，傍晚那邊也還在揉眼睛。窗口開著，只有鐘在走，櫃台的人數著鐘聲，數到第八下停了壹下，才數第九下。",
  ],
  twOnly: [
    "今天只有白天這本帳。館外那壹邊休息，窗口的燈留著，櫃台的人說，總要有人看著，數字才不會自己走掉。",
  ],
  usOnly: [
    "白天這邊沒開門，只剩館外那壹邊在動。櫃台的人坐在半暗的窗口，壹個人對著另壹本帳，聽算盤珠子自己滑了壹下。",
  ],
};

// 壹個市場的列：doc 要是今天開過盤的（day 對、openIdx 有值、沒休市）；mult 是遊戲價的倍數（台股 1、美股匯率）
function evRows(doc, day, ids, names, syms, mult) {
  if (!doc || doc.day !== day || doc.openIdx == null || doc.closed) return null;
  const rows = (ids || []).map(id => {
    const c = doc.R && doc.R[id] && doc.R[id].px, p = doc.prevReal && doc.prevReal[id];
    return evOk(c) && evOk(p) ? { id, name: ((names && names[id]) || id) + (syms && syms[id] ? ` ${syms[id]}` : ""), r: c / p - 1, px: c * mult } : null;
  }).filter(Boolean);
  return rows.length >= 3 ? rows : null;
}
function evBlock(rows, L) {
  const s = rows.slice().sort((a, b) => b.r - a.r), up = s.filter(x => x.r > 0.0005), dn = s.filter(x => x.r < -0.0005);
  const line = x => `${x.name} ${evPct(x.r)}（${evFmt(x.px)}）`, ups = up.slice(0, 3), dns = s.slice().reverse().filter(x => x.r < -0.0005).slice(0, 3);
  L.push("📈 漲得最兇：", ...(ups.length ? ups.map(line) : ["沒有壹支在漲"]));
  L.push("📉 跌得最深：", ...(dns.length ? dns.map(line) : ["沒有壹支在跌"]));
  return { n: s.length, up: up.length, dn: dn.length, avg: s.reduce((a, x) => a + x.r, 0) / s.length };
}
const evMood = avg => (avg > 0.003 ? 1 : avg < -0.003 ? -1 : 0);

// o = { day: 台灣日期, tw, us（兩份行情文件）, twIdx: { px, prev } 加權指數（可以沒有）, usDay: 美東今天的日期, names, twIds, usIds, twSyms, usSyms, early: 美股今天提早收盤 }
export function dcEveningText(o) {
  const fx = o.us && (evOk(o.us.fx) ? o.us.fx : evOk(o.us.fxLast) ? o.us.fxLast : null);
  const tw = evRows(o.tw, o.day, o.twIds, o.names, o.twSyms, 1);
  const usAll = fx ? evRows(o.us, o.usDay, o.usIds, o.names, o.usSyms, fx) : null;
  if (!tw && !usAll) return "";
  const L = ["🌇 **Yuga Bot 銀行　傍晚行情**", tw && usAll ? "台股今天收攤了，館外的另壹邊剛醒。櫃台把兩本帳都攤開來：" : tw ? "台股今天收攤了。館外那壹邊今天休息，櫃台只攤開壹本帳：" : "館外的另壹邊剛醒。白天這邊今天沒開，櫃台只攤開壹本帳：", ""];
  let a = null, b = null;
  if (tw) {
    L.push(`🏮 **台股收盤**（${o.day.slice(5)}）`);
    const ix = o.twIdx; // 大盤（翊文 11-27「台股能不能再加個大盤」）：證交所的加權指數，遊戲裡沒有這支股票，只寫點數和漲跌
    if (ix && evOk(ix.px) && evOk(ix.prev)) L.push(`📊 島上大盤（加權指數）　${evFmt(ix.px)}（${evPct(ix.px / ix.prev - 1)}）`);
    a = evBlock(tw, L); L.push(`${a.n} 支裡，漲 ${a.up} 支、跌 ${a.dn} 支、平 ${a.n - a.up - a.dn} 支。`, ""); }
  if (usAll) {
    const idx = usAll.find(x => x.id === "nightindex"), rest = usAll.filter(x => x.id !== "nightindex");
    L.push("🌙 **美股盤前**（價還在動）");
    if (idx) L.push(`📊 ${idx.name}　${evFmt(idx.px)}（${evPct(idx.r)}）`);
    b = evBlock(rest, L); L.push(`${b.n} 支裡，漲 ${b.up} 支、跌 ${b.dn} 支、平 ${b.n - b.up - b.dn} 支。匯率 ${fx}。`, "");
  }
  const T = EVENING_TALK, m1 = a ? evMood(a.avg) : null, m2 = b ? evMood(b.avg) : null;
  const key = !a ? "usOnly" : !b ? "twOnly" : m1 > 0 && m2 > 0 ? "bothUp" : m1 < 0 && m2 < 0 ? "bothDown" : m1 <= 0 && m2 > 0 ? "twDownUsUp" : m1 > 0 && m2 <= 0 ? "twUpUsDown" : m1 < 0 || m2 < 0 ? "bothDown" : "calm";
  L.push(`💬 ${evPick(T[key], o.day)}`, "");
  if (usAll && o.early) L.push("⏰ 美股今天提早收盤，台灣時間凌晨就收攤，要買要賣別睡太早。");
  L.push("——Yuga Bot 銀行");
  return L.join("\n");
}
