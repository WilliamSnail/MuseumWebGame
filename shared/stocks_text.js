// 館外股票的名字表（11-13，銀行第三步「股票」的館外那一半）。文字是草稿，Yuga 可以改，Yuga 改過的以 Yuga 的為準。
// 規矩：不寫真公司名、不寫股票代號、不用商標；名字讓人猜得到是哪一家。
// id 是遊戲裡的名字，每天資料（content/stocks/daily.json）也用這個 id。真實的代號只放在 tools/stocks_fetch.cjs，不進 shared/。
// kind：stock＝一家店，index＝一籃子的平均（指數）。
export const OUT_STOCKS = [
  { id: "greeneye", kind: "stock", market: "us", name: "綠眼顯卡", intro: "做會發綠光的顯卡。館裡的畫面、算盤、機器腦袋，大半靠它撐著。" },
  { id: "redclaw", kind: "stock", market: "us", name: "紅爪晶片", intro: "綠眼顯卡的老對手，專做紅色封套的晶片。常常追著跑，偶爾衝到前面。" },
  { id: "nightindex", kind: "index", market: "us", name: "夜光科技指數", intro: "夜光街上一整排科技攤位的平均行情。不是一家店，是看整條街今天亮不亮。" },
  { id: "islandforge", kind: "stock", market: "tw", name: "島上鑄晶坊", intro: "島上那間幫大家蓋晶片的鑄造坊。別人畫圖，它動手燒，缺了它很多攤位會停工。" },
  { id: "silverapple", kind: "stock", market: "us", name: "銀蘋果工坊", intro: "賣銀色小機器的工坊，招牌是被咬一口的蘋果。粉絲很多，新品一出就排隊。" },
  { id: "flashcar", kind: "stock", market: "us", name: "閃電車行", intro: "賣不用加油的電動車。老闆愛放話，股價也跟著跳來跳去。" },
  { id: "squarewin", kind: "stock", market: "us", name: "方窗軟體", intro: "到處都有它的方格視窗，辦公室的桌面大半是它的。慢慢走，很少大起大落。" },
  // market：tw 台股（09:00～13:30 盤中）、us 美股和指數（美東 09:30～16:00 盤中，11-14 規劃 2.8i）。真實代號放 functions/stock_tw.js、stock_us.js，不進這裡
  { id: "handbrain", kind: "stock", market: "tw", name: "掌心晶片鋪", intro: "做手機裡那顆小腦袋的晶片鋪。到處都有它的東西，名字卻沒幾個人叫得出來。" },
  { id: "bigassembly", kind: "stock", market: "tw", name: "巨浪代工廠", intro: "幫別人組裝東西的超大工廠，銀色小機器和機房裡的伺服器大半是它的工人裝的。賺的是辛苦錢，量很大。" },
  { id: "trianglepower", kind: "stock", market: "tw", name: "三角電源行", intro: "做電源和散熱風扇的老店，機房裡嗡嗡響的東西大半是它做的。算盤腦袋越熱，它也跟著越熱。" },
  { id: "linetower", kind: "stock", market: "tw", name: "島線電話行", intro: "牽電話線和網路線的老牌電信行，家家戶戶都用它。波動很小，是穩穩當當的選擇。" },
];
