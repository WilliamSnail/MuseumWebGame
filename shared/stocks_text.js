// 館外股票的名字表（11-13，銀行第三步「股票」的館外那一半）。文字是草稿，Yuga 可以改，Yuga 改過的以 Yuga 的為準。
// 規矩：不寫真公司名、不寫股票代號、不用商標；名字讓人猜得到是哪一家。
// id 是遊戲裡的名字，每天資料（content/stocks/daily.json）也用這個 id。真實的代號只放在 tools/stocks_fetch.cjs，不進 shared/。
// kind：stock＝一家店，index＝一籃子的平均（指數）。
export const OUT_STOCKS = [
  { id: "greeneye", kind: "stock", name: "綠眼顯卡", intro: "做會發綠光的顯卡。館裡的畫面、算盤、機器腦袋，大半靠它撐著。" },
  { id: "redclaw", kind: "stock", name: "紅爪晶片", intro: "綠眼顯卡的老對手，專做紅色封套的晶片。常常追著跑，偶爾衝到前面。" },
  { id: "nightindex", kind: "index", name: "夜光科技指數", intro: "夜光街上一整排科技攤位的平均行情。不是一家店，是看整條街今天亮不亮。" },
  { id: "islandforge", kind: "stock", name: "島上鑄晶坊", intro: "島上那間幫大家蓋晶片的鑄造坊。別人畫圖，它動手燒，缺了它很多攤位會停工。" },
  { id: "silverapple", kind: "stock", name: "銀蘋果工坊", intro: "賣銀色小機器的工坊，招牌是被咬一口的蘋果。粉絲很多，新品一出就排隊。" },
  { id: "flashcar", kind: "stock", name: "閃電車行", intro: "賣不用加油的電動車。老闆愛放話，股價也跟著跳來跳去。" },
  { id: "squarewin", kind: "stock", name: "方窗軟體", intro: "到處都有它的方格視窗，辦公室的桌面大半是它的。慢慢走，很少大起大落。" },
];
