// 館外股票的名字表（11-13，銀行第三步「股票」的館外那一半）。文字是草稿，Yuga 可以改，Yuga 改過的以 Yuga 的為準。
// 規矩：不寫真公司名、不寫股票代號、不用商標；名字讓人猜得到是哪一家。
// id 是遊戲裡的名字，每天資料（content/stocks/daily.json）也用這個 id。真實的代號只放在 tools/content/stocks_fetch.cjs，不進 shared/。
// kind：stock＝一家店，index＝一籃子的平均（指數）。emo：名字前面的 emoji（11-28，銀行畫面和 Discord 行情都顯示，每支不重複）。
// 館外股的分類（11-19，翊文：美股要有可以縮放的分類）：畫面照這張表的順序分組（可以收合）。id 是 OUT_STOCKS 每支的 cat；改名字、換順序只改這裡
export const OUT_CATS = [
  { id: "tech", name: "科技" },
  { id: "resource", name: "自然資源" },
  { id: "health", name: "醫療生技" },
  { id: "fun", name: "消費娛樂" },
  { id: "money", name: "金融" },
  { id: "travel", name: "觀光運輸" },
  { id: "industry", name: "國防重工" },
  { id: "index", name: "指數基金" },
];
export const OUT_STOCKS = [
  { id: "greeneye", kind: "stock", market: "us", cat: "tech", name: "綠眼顯卡", emo: "👁️", intro: "做會發綠光的顯卡。館裡的畫面、算盤、機器腦袋，大半靠它撐著。" },
  { id: "redclaw", kind: "stock", market: "us", cat: "tech", name: "紅爪晶片", emo: "❤️", intro: "綠眼顯卡的老對手，專做紅色封套的晶片。常常追著跑，偶爾衝到前面。" },
  { id: "nightindex", kind: "index", market: "us", cat: "index", name: "夜光科技指數", emo: "🌃", intro: "夜光街上一整排科技攤位的平均行情。不是一家店，是看整條街今天亮不亮。" },
  { id: "islandforge", kind: "stock", market: "tw", cat: "tech", name: "島上鑄晶坊", emo: "🏝️", intro: "島上那間幫大家蓋晶片的鑄造坊。別人畫圖，它動手燒，缺了它很多攤位會停工。" },
  { id: "silverapple", kind: "stock", market: "us", cat: "tech", name: "銀蘋果工坊", emo: "🍎", intro: "賣銀色小機器的工坊，招牌是被咬一口的蘋果。粉絲很多，新品一出就排隊。" },
  { id: "flashcar", kind: "stock", market: "us", cat: "tech", name: "閃電車行", emo: "⚡", intro: "賣不用加油的電動車。老闆愛放話，股價也跟著跳來跳去。" },
  { id: "squarewin", kind: "stock", market: "us", cat: "tech", name: "方窗軟體", emo: "🪟", intro: "到處都有它的方格視窗，辦公室的桌面大半是它的。慢慢走，很少大起大落。" },
  // market：tw 台股（09:00～13:30 盤中）、us 美股和指數（美東 04:00～16:00，含盤前，決定 0159）。真實代號放 functions/stock/stock_tw.js、stock_us.js，不進這裡
  { id: "handbrain", kind: "stock", market: "tw", cat: "tech", name: "掌心晶片鋪", emo: "📱", intro: "做手機裡那顆小腦袋的晶片鋪。到處都有它的東西，名字卻沒幾個人叫得出來。" },
  { id: "bigassembly", kind: "stock", market: "tw", cat: "tech", name: "巨浪代工廠", emo: "🏭", intro: "幫別人組裝東西的超大工廠，銀色小機器和機房裡的伺服器大半是它的工人裝的。賺的是辛苦錢，量很大。" },
  { id: "trianglepower", kind: "stock", market: "tw", cat: "tech", name: "三角電源行", emo: "🔌", intro: "做電源和散熱風扇的老店，機房裡嗡嗡響的東西大半是它做的。算盤腦袋越熱，它也跟著越熱。" },
  { id: "linetower", kind: "stock", market: "tw", cat: "tech", name: "島線電話行", emo: "☎️", intro: "牽電話線和網路線的老牌電信行，家家戶戶都用它。波動很小，是穩穩當當的選擇。" },
  { id: "brainrack", kind: "stock", market: "tw", cat: "tech", name: "腦袋機架行", emo: "💻", intro: "組筆電，也替機房組放算盤腦袋的大機架。客人是幾家最大的雲端攤位，單子來得快、去得也快。" },
  { id: "cloudcabinet", kind: "stock", market: "tw", cat: "tech", name: "大戶櫃匠", emo: "🗄️", intro: "只接幾個大戶的單，大戶壹打噴嚏就跟著感冒。價錢高，跳起來也兇。" },
  { id: "customchip", kind: "stock", market: "tw", cat: "tech", name: "量身晶片坊", emo: "🧩", intro: "不賣現成的，專替大攤位設計量身訂做的晶片。大單子一來價錢就跳，單子一走也跳。" },
  { id: "voltgrid", kind: "stock", market: "tw", cat: "industry", name: "粗線變壓坊", emo: "🔋", intro: "做變壓器和配電盤的重電老坊，機房和電廠都得向它訂貨。這兩年訂單排得很後面。" },
  { id: "wavefreight", kind: "stock", market: "tw", cat: "travel", name: "大浪押運行", emo: "⚓", intro: "押著壹箱箱貨在海上跑的船運行。海上壹缺貨，它的價錢就像浪頭壹樣高；浪退了，掉得也快。" },
  { id: "ironwing", kind: "stock", market: "tw", cat: "travel", name: "鐵翼搭客行", emo: "✈️", intro: "載人在天上飛的行號。客人壹多就賺，油壹貴就喊痛，天氣壹壞整天的帳都跟著抖。" },
  { id: "plugstation", kind: "stock", market: "tw", cat: "industry", name: "接線電廠所", emo: "🎛️", intro: "替電廠和工廠接粗線、做配電盤的老所。哪裡要蓋新電廠，單子就往哪裡來。" },
  { id: "pillpot", kind: "stock", market: "tw", cat: "health", name: "小罐藥房", emo: "💊", intro: "把藥配成小小壹罐的藥坊，專做別人專利到期的老方子。壹兩罐藥賣得好，價錢就跟著跳。" },
  { id: "needlelab", kind: "stock", market: "tw", cat: "health", name: "針筒夜工坊", emo: "💉", intro: "做新藥的小實驗坊，壹口鍋能不能煮出新藥，全看試驗成不成。成了衝上天，不成就掉下來。" },
  { id: "towerbeam", kind: "stock", market: "tw", cat: "industry", name: "巨塔鋼條行", emo: "🌬️", intro: "替海上大風車打塔架的鋼鐵行。接到壹張大單，幾年都有活幹；單子斷了，價錢也斷。" },
  { id: "coilelder", kind: "stock", market: "tw", cat: "industry", name: "捲線老頭行", emo: "🧶", intro: "專捲粗電線、粗電纜的老行號，電廠、工地、大樓都在用。銅價壹動，它跟著動。" },
  // 11-19 美股新增 18 支（決定 0134）：ext ＝ 不算進「接美股」的景氣平均、不進館方投資（維持既有的錢和景氣不變）；真實代號放 functions/stock/stock_us.js
  { id: "bigshipport", kind: "stock", market: "us", cat: "travel", ext: true, name: "大船遊港", emo: "🛳️", intro: "載著觀光客慢慢晃的大郵輪公司。碼頭人多就賺，風浪壹大、客人不敢上船，價錢跟著晃。" },
  { id: "greenleafclinic", kind: "stock", market: "us", cat: "fun", ext: true, name: "綠葉藥坊", emo: "🌿", intro: "賣綠色小葉子做的東西，規矩壹直在改。哪個地方壹鬆口，它就跳壹下。" },
  { id: "quantumfrog", kind: "stock", market: "us", cat: "tech", ext: true, name: "量子蛙籠", emo: "⚛️", intro: "把青蛙關進量子籠子，研究牠到底跳了還是沒跳。還沒賺錢，故事比帳簿精彩，價錢也跟著故事跳。" },
  { id: "smallcore", kind: "stock", market: "us", cat: "resource", ext: true, name: "小爐心", emo: "☢️", intro: "想蓋巴掌大的小型核電爐的新公司。爐子還沒點著，大家先替它點了壹把火。" },
  { id: "messengerlab", kind: "stock", market: "us", cat: "health", ext: true, name: "信使藥廠", emo: "🧬", intro: "靠捎信給身體的藥出名的藥廠。壹有新疫苗的消息就衝，沒消息就掉。" },
  { id: "oldgamestore", kind: "stock", market: "us", cat: "fun", ext: true, name: "遊戲老店", emo: "🕹️", intro: "賣光碟和遊戲卡匣的老店，店員比客人多。偶爾被壹大群人盯上，價錢就像煮開的水。" },
  { id: "fingerbank", kind: "stock", market: "us", cat: "money", ext: true, name: "指尖銀行", emo: "🏦", intro: "在手機上開張的小銀行，不設櫃台。新客人壹多就漲，利率壹變就抖。" },
  { id: "betkingdom", kind: "stock", market: "us", cat: "fun", ext: true, name: "下注王國", emo: "🎲", intro: "替球賽開盤口的王國。比賽越多、客人越愛猜，它越賺；規矩壹收緊，立刻縮手。" },
  { id: "droidhive", kind: "stock", market: "us", cat: "industry", ext: true, name: "無人蜂巢", emo: "🐝", intro: "造壹群群無人小飛機的蜂巢。軍方的單子壹來就嗡嗡響。" },
  { id: "treadclub", kind: "stock", market: "us", cat: "fun", ext: true, name: "踏車俱樂部", emo: "🚲", intro: "在家裡踩踏車的俱樂部。大家宅在家時紅透半邊天，出門之後，車子就掛起衣服。" },
  { id: "blockpark", kind: "stock", market: "us", cat: "tech", ext: true, name: "積木樂園", emo: "🧱", intro: "孩子們用積木蓋世界的樂園。人潮壹多就漲，壹換流行就空。" },
  { id: "popcornhall", kind: "stock", market: "us", cat: "fun", ext: true, name: "爆米花戲院", emo: "🍿", intro: "連鎖的老戲院，座位比觀眾多。壹部大片救得了壹季，也救不了欠的債。" },
  { id: "blackgoldwell", kind: "stock", market: "us", cat: "resource", ext: true, name: "黑金井", emo: "⛽", intro: "在地底下抽黑色黏稠東西的井。油價壹漲就喘口氣，壹跌就縮回去。" },
  { id: "bluefireyard", kind: "stock", market: "us", cat: "resource", ext: true, name: "藍火氣田", emo: "🔥", intro: "挖藍色火焰的氣田，專供取暖和煮飯。天壹冷就搶手，天壹暖就清閒。" },
  { id: "greenglowmine", kind: "stock", market: "us", cat: "resource", ext: true, name: "青光礦", emo: "⛏️", intro: "挖會發淡淡青光的礦。大家想起核電的時候，它才會被想起來。" },
  { id: "raremountain", kind: "stock", market: "us", cat: "resource", ext: true, name: "稀土山", emo: "🏔️", intro: "壹座挖稀土的山，手機、馬達、風車都向它要貨。誰攔著不給，價錢就跳。" },
  { id: "redcoppermine", kind: "stock", market: "us", cat: "resource", ext: true, name: "赤銅礦坑", emo: "🥉", intro: "挖紅色銅礦的大坑。電線、馬達都靠銅，銅價壹動，它就跟著動。" },
  { id: "richsoilshop", kind: "stock", market: "us", cat: "resource", ext: true, name: "沃土肥坊", emo: "🌾", intro: "賣讓田裡長東西的肥料。糧價好、農人肯花錢時賺，反過來就慢。" },
  // 11-20 美股再加 2 支原物料的 2 倍版（決定 0138）：mult ＝ 它的漲跌是金價、油價的幾倍，景氣市場算平均時漲跌 ÷ mult（當成金價、油價本身）
  { id: "vaultbrick", kind: "stock", market: "us", cat: "resource", ext: true, mult: 2, name: "金庫磚", emo: "🪙", intro: "壹塊塊黃澄澄的金磚，專門跟著金價走，而且壹次走兩倍：金價漲壹步它跳兩步，跌也是。" },
  { id: "blackbarrel", kind: "stock", market: "us", cat: "resource", ext: true, mult: 2, name: "黑油桶", emo: "🛢️", intro: "壹桶桶黑色的原油，專門跟著油價走，而且壹次走兩倍：油價晃壹下它晃兩下，賺賠都放大。" },
  // 11-28 翊文：「美股可以加入 GOOGL」
  { id: "searchshop", kind: "stock", market: "us", cat: "tech", ext: true, name: "彩字搜尋鋪", emo: "🔍", intro: "招牌上的字五顏六色，什麼都能問它；問的人越多，它知道得越多，也越值錢。" },
  // 11-28 翊文：「美股也可以加入 META」
  { id: "facehall", kind: "stock", market: "us", cat: "tech", ext: true, name: "千面鏡廳", emo: "🪞", intro: "整面牆都是鏡子，每個走進來的人都對著鏡子說話；鏡子記得每壹張臉，也把這些臉賣給想看的人。" },
  // 11-28 翊文：「美股也可以加入 AMZN」
  { id: "boxyard", kind: "stock", market: "us", cat: "tech", ext: true, name: "萬箱貨棧", emo: "📦", intro: "倉庫大到看不見盡頭，箱子日夜進出；你想要的東西，它總比你先知道放在哪壹格。" },
  // 11-28 翊文：「美股也可以加入 SPY」：第二個美股指數，比夜光科技指數廣，各行各業都算
  { id: "bigindex", kind: "index", market: "us", cat: "index", ext: true, name: "全城大盤指數", emo: "🏙️", intro: "整座城五百家大店的平均行情，賣什麼的都算進來；不看哪壹家，是看整座城今天過得好不好。" },
];
// 名字前面加 emoji（emo，11-28 翊文「discord上股票有emoji，遊戲上也可以顯示嗎」）：Discord 的晨間、傍晚行情用這張；銀行畫面用 web/src/rooms/bank/bank_emo.js
export const OUT_NAMES_EMO = Object.fromEntries(OUT_STOCKS.map(s => [s.id, s.emo ? `${s.emo} ${s.name}` : s.name]));
