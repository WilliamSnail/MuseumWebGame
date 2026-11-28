// 每天早上的「美股昨夜收盤」（翊文 11-27：「能讓銀行每天早上時順便更新美股收盤價的漲跌資訊嗎」「我是說Discord上發布」「要實際數字，但是用遊戲風格發布」）。
// 純函式：給美股行情文件（stocksUs/latest 收盤後的樣子）和名字表，組成 Discord 的字；沒有開過盤、資料不夠就回空字串（不發）。
// 價格寫真實的美元價，前面加 $（翊文 11-28「可以用美金嗎…標註壹下美元$」）；最後壹行附館內匯率（遊戲價 ＝ 匯率 × 美元價，決定 0081）。漲跌 ＝ 真實收盤 ÷ 真實前收 − 1（跟銀行畫面壹樣）。名字後面加真實代號（由呼叫的人傳進來）。
// 誰叫：functions/stock/us_close_public.js（公開的 /data/us_close.json）；tools/content/announce.cjs 在今日館訊同壹個時間讀它、發到 Discord（usclose-日期，同壹天只發壹次）。

export const usdFmt = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ucOk = v => typeof v === "number" && isFinite(v) && v > 0;
const ucPct = r => `${r >= 0 ? "▲" : "▼"}${Math.abs(r * 100).toFixed(1)}%`;
// 2026-11-27 → 11-27；那天是星期五就回「下週壹」，不然「今天」
const ucNext = day => { const d = new Date(day + "T12:00:00Z"); return d.getUTCDay() === 5 ? "下週壹傍晚" : "今天傍晚"; };

// 每日評語（翊文 11-27「再後面加壹個遊戲風格的每日評語看看」）：照昨夜大盤（指數）漲跌分五種心情，用日期挑壹句（同壹天同壹句）；有單支漲跌超過 8% 就講那壹支
export const US_CLOSE_TALK = {
  bigUp: [
    "櫃台的算盤昨夜打得特別響，響到守夜的人以為有人在敲門。今天早上，窗口外的地上還留著壹排排隊時踩出來的印子，有幾個，鞋尖是朝著櫃台裡面的。",
    "夜光燈亮到天亮，館外的人好像忘了收攤這件事。櫃台的人把帳本多翻了好幾頁才寫得下，寫完伸個懶腰說：這種日子，帳最容易對不上。",
    "今天窗口的玻璃上，留下不少興奮的指紋。櫃台的人擦了三遍，第四遍時發現有壹個指紋是從玻璃裡面按上來的，就沒有再擦了。",
    "昨夜窗口收進來的錢，疊得比平常高壹截。櫃台的人數完，又多數了壹遍。數字是對的，只是第二遍數到最後，好像有誰在旁邊跟著小聲數。",
  ],
  up: [
    "帳本上的數字往上爬了壹點。櫃台的人沒有笑，只是把筆蓋好，說：漲的時候最要記清楚，跌的時候，大家就只記得自己。",
    "漲的比跌的多，窗口前的人走路都輕快了壹點。不過櫃台的人說，帳還是差那壹點，昨天差、今天也差，差的那壹點從來不跟著行情走。",
    "館外的風往這邊吹，帶來壹點點暖。櫃台把窗開了壹條縫，風裡有咖啡和印表機的味道，還有壹點點，說不出來是什麼的味道。",
    "小漲的夜晚最好睡。櫃台的人說，昨夜他只醒來壹次，聽見算盤自己撥了壹顆珠子，撥完就安靜了。早上去看，帳剛好多了壹筆。",
  ],
  flat: [
    "昨夜館外很安靜，數字幾乎沒動，像有人屏住呼吸。櫃台的人也跟著屏住了，等到天亮才發現，整晚只有時鐘在走。",
    "漲跌都很小。櫃台的人數了兩遍，還是同壹個數；數第三遍之前，他想了想，決定不要數了。有些晚上，數字不動比較好。",
    "窗口開著，沒什麼人來，算盤上的珠子壹顆都沒撥。只有門口的鈴響過壹次，櫃台的人抬頭，門外沒有人，地上也沒有腳印。",
    "平淡的晚上。櫃台的人把昨天的單子壹張張摺好放回抽屜，抽屜比昨天難關壹點，好像裡面多了壹張他沒收過的單子。",
  ],
  down: [
    "櫃台今天收到的單子，紙都有點皺，像被人在手心裡握了很久。櫃台的人壹張張攤平，說：跌不可怕，可怕的是半夜壹直起來看。",
    "跌的比漲的多。窗口外，有人站了很久，什麼都沒買，也什麼都沒賣。櫃台的人倒了壹杯熱茶放在窗台上，等他回頭，杯子已經空了。",
    "帳本翻到這壹頁，墨好像淡了壹點。櫃台的人重新描了壹遍數字，描完發現，昨天那行的字也跟著淡了。",
    "小跌的夜裡，館外的燈壹盞壹盞熄得比平常早。櫃台的人留了窗口那盞，說總要有人看著帳，不然數字會自己走掉。",
  ],
  bigDown: [
    "昨夜的燈熄得很早。櫃台的人把帳本合上，又打開，又合上，最後壓了壹塊紙鎮在上面，好像怕裡面的數字半夜跑出來。",
    "窗口前的地板，今天比平常涼。櫃台的人說，大跌的隔天都是這樣，有人在窗口前蹲了壹整晚，蹲到天亮才走，什麼都沒說。",
    "櫃台的人說，這種夜裡，最好不要數第二遍。他昨晚數了，數到壹半，算盤多出壹顆珠子，他到現在還沒找到那顆是從哪裡來的。",
    "大跌。櫃台今天早上沒有開燈，只點了壹根蠟燭。他說燈太亮的話，帳本上那些紅字會壹直看著他。",
  ],
  jump: [
    "{name}昨夜跳得太高，櫃台的人抬頭看了很久，脖子都酸了。他說：跳那麼高的，通常也要找地方落下來，窗口今天多擺壹張椅子。",
    "{name}的單子疊得比窗口還高。櫃台的人只說了壹句：先別急，明天還有。說完把最上面那張壓平，發現背面有人用鉛筆寫了壹個數字。",
  ],
  drop: [
    "{name}昨夜摔得很重，櫃台替它多點了壹盞燈。燈點到天亮，燈芯旁邊多了壹圈小小的、圓圓的灰，像有誰蹲在那裡守了壹夜。",
    "{name}的帳頁皺成壹團。櫃台的人把它撫平，夾回原位，然後在旁邊寫了壹行小字。他不讓別人看，只說：這種事，記壹次就好。",
  ],
};
const ucPick = (list, day) => { let h = 0; for (const ch of String(day)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return list[h % list.length]; };
export function dcUsCloseTalk(idxR, top, bottom, day) {
  const T = US_CLOSE_TALK;
  if (top && top.r >= 0.08 && (!bottom || top.r >= -bottom.r)) return ucPick(T.jump, day).split("{name}").join(top.base);
  if (bottom && bottom.r <= -0.08) return ucPick(T.drop, day).split("{name}").join(bottom.base);
  const r = Number.isFinite(idxR) ? idxR : 0;
  return ucPick(r >= 0.015 ? T.bigUp : r > 0.002 ? T.up : r <= -0.015 ? T.bigDown : r < -0.002 ? T.down : T.flat, day);
}

// doc：{ day, openIdx, closed, R: { id: { px } }, prevReal: { id: 前收 }, fx, fxLast }；names：{ id: 遊戲名 }；ids：美股 id 的順序；early：那天是不是提早收盤
// syms：{ id: 真實代號 }（翊文 11-27「順便把英文代號也放上來」；代號只放 functions/stock/stock_us.js，由那邊傳進來，shared 不存）
export function dcUsCloseText(doc, names, ids, early, syms) {
  if (!doc || doc.openIdx == null || doc.closed || !/^\d{4}-\d{2}-\d{2}$/.test(String(doc.day))) return "";
  const fx = ucOk(doc.fx) ? doc.fx : ucOk(doc.fxLast) ? doc.fxLast : null;
  if (!fx) return "";
  const rows = (ids || []).map(id => {
    const c = doc.R && doc.R[id] && doc.R[id].px, p = doc.prevReal && doc.prevReal[id];
    return ucOk(c) && ucOk(p) ? { id, base: (names && names[id]) || id, name: ((names && names[id]) || id) + (syms && syms[id] ? ` ${syms[id]}` : ""), r: c / p - 1, px: c } : null;
  }).filter(Boolean);
  if (rows.length < 3) return "";
  const idx = rows.find(x => x.id === "nightindex"), rest = rows.filter(x => x.id !== "nightindex").sort((a, b) => b.r - a.r);
  const up = rest.filter(x => x.r > 0.0005), down = rest.filter(x => x.r < -0.0005), flat = rest.length - up.length - down.length;
  const line = x => `${x.name} ${ucPct(x.r)}（${usdFmt(x.px)}）`;
  const L = ["🌅 **Yuga Bot 銀行　晨間行情**", `館外的市場昨夜收攤了（美東 ${doc.day.slice(5)}${early ? "，提早收盤" : ""}）。櫃台照收盤價記好了帳：`, ""];
  if (idx) L.push(`📊 ${idx.name}　${usdFmt(idx.px)}（${ucPct(idx.r)}）`);
  const ups = rest.slice(0, 3).filter(x => x.r > 0), downs = rest.slice().reverse().slice(0, 3).filter(x => x.r < 0); // 每支壹行（翊文 11-27：「這樣排版比較好」）
  L.push("📈 漲得最兇：", ...(ups.length ? ups.map(line) : ["沒有"]));
  L.push("📉 跌得最深：", ...(downs.length ? downs.map(line) : ["沒有"]));
  L.push(`${rest.length} 支裡，漲 ${up.length} 支、跌 ${down.length} 支、平 ${flat} 支。價格是美元；館內匯率 ${fx}。`, "");
  L.push(`💬 ${dcUsCloseTalk(idx ? idx.r : NaN, rest[0], rest[rest.length - 1], doc.day)}`, "");
  L.push(`${ucNext(doc.day)}盤前，窗口再開。`, "——Yuga Bot 銀行");
  return L.join("\n");
}
