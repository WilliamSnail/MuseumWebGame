// npm test：一次跑全部的檢查。任何一項沒過，整個就算沒過（CI 也是跑這個）。
// 模擬（sim*.cjs）比較久，不在這裡跑；改數值時自己跑：node test/sim/sim.cjs 1000
const path = require("path");

const root = path.join(__dirname, "..");
require("../tools/content/notices_build.cjs").write(); // shared/game/notices_data.js 不進 git：測試之前先由 content/notices/ 產生
const STEPS = [
  ["規則測試", ["test/game/logic.test.cjs"]],
  ["房間效果的狀態（燈光、人影、旗幟、怪影子；館友自己的理智效果優先、熄燈時收起）", ["test/web/room_mood.test.cjs"]],
  ["賭場、銀行的背景樂：熱鬧程度換算（ambMix）、環境音會建會停會尊重靜音", ["test/web/amb_mix.test.cjs"]],
  ["音效檔（Pixabay）：清單、檔案、來源.md 對得上，程式用到的都有登記", ["test/web/sfx_files.test.cjs"]],
  ["清工作副本：刪 worktree 前先停 git 監看、core.fsmonitor 設 false（11-21）", ["test/tools/wt_clean.test.cjs"]],
  ["聲音狀態檢查（npm run snd:check）：每個房間的環境音計時器都進 timers、檔案都接房間的 g、地下→大廳／賭場框／登出的聲音都收乾淨、該放哪首（ambFor）", ["test/tools/snd_check.test.cjs"]],
  ["音效與特效總表：docs/素材/音效與特效總表.md 跟程式對得上（npm run fx:report），掃 snd／sndFile 的解析", ["test/tools/fx_report.test.cjs"]],
  ["npm run sfx:add：Pixabay 檔名和網頁標題解析、登記到 sfx_files.js 和 來源.md", ["test/tools/sfx_add.test.cjs"]],
  ["地下打鬥的聲音表：合成音效名字和檔案 id 都要存在", ["test/cellar/fight_sfx.test.cjs"]],
  ["進館順序：賭場同桌不會跳過公佈欄和簽到，公告後才問要不要回牌桌", ["test/web/after_enter.test.cjs"]],
  ["每日重要事件清單（只放今天、每種有上限、預告壹則、壞資料不丟錯）", ["test/story/headlines.test.cjs"]],
  ["深夜大廳歌曲字幕：這個時間點顯示哪壹句、內容檔格式", ["test/game/lyrics.test.cjs"]],
  ["交代人壹天兩個任務：挑現在該說哪壹句（giverPick）", ["test/story/giver_pick.test.cjs"]],
  ["新玩家的下一步", ["test/web/guide.test.cjs"]],
  ["公佈欄、信箱", ["test/web/notice.test.cjs"]],
  ["公告一則一個檔：拆檔遷移（id 和順序不變、可以重跑）、合成、舊陣列偵測、併 main 救援", ["test/tools/notices_split.test.cjs"]],
  ["手作坊顯示的地下效果跟地下實際算的一樣", ["test/cellar/cellar_fx.test.cjs"]],
  ["參觀者一位接一位（遺物、選職業抽優缺點、歷任紀錄）", ["test/game/legacy.test.cjs"]],
  ["多位參觀者（換人、位子、名字）", ["test/game/visitors.test.cjs"]],
  ["館友之間（送佩佩、參觀展廳的規則）", ["test/game/gifts.test.cjs"]],
  ["參觀展廳、送佩佩、伺服器的信（Functions 每一步要做的事）", ["test/game/visit.test.cjs"]],
  ["每日簽到、每週全簽到、節日（11-09，決定 0030）", ["test/game/signin.test.cjs"]],
  ["趣味節日（固定日期、第幾個星期幾、閏日、壹天好幾個、大節日不變、不發獎勵、文字乾淨、Discord 冷知識，決定 0044）", ["test/story/funday.test.cjs"]],
  ["主題展辦完（連續 3 天、三級、限定配件、策展手記、每週特展，決定 0035）", ["test/story/themeshow.test.cjs"]],
  ["合作地下收藏庫（投票、強度、技能、理智、受傷、幽靈）", ["test/coop/coop.test.cjs"]],
  ["合作地下的流程（投票時間、掛機、離隊、每天幾趟）", ["test/coop/coop_flow.test.cjs"]],
  ["合作地下好玩的機制（線索、幻覺、變形、幽靈、證據、留守、搬東西、報告、痕跡）", ["test/coop/coop_fun.test.cjs"]],
  ["留下痕跡（留言牌、按讚、影子、幽影）", ["test/coop/coop_trace.test.cjs"]],
  ["合作地下接上打怪物（房間探索完才打守門、打贏才算走完、逃跑、倒下真的受傷、膽量壹趟壹份、看不到別人選什麼，決定 0067、0068）", ["test/coop/coop_fight.test.cjs"]],
  ["合作地下的地圖選路（探索點走原本的房間、遭遇、休息、寶箱、最後守門、地圖不露怪物，地下室改版）", ["test/coop/coop_route.test.cjs"]],
  ["打怪的新玩法（怪物的九種個性、佩佩的顏色和組合、完美招式兩次、引開、鼓舞、分膽、安慰、看清、你適合、助手補位）", ["test/cellar/cellar_traits.test.cjs"]],
  ["地下室改版：打怪物和每層的小地圖（1～4 人、看穿和推的加成、安撫、擋、招式一場一次、守門兩階段、撤退、地圖每天一張、房間一趟走得完，決定 0067）", ["test/cellar/cellar_fight.test.cjs"]],
  ["前端錯誤回報（清掉個資、長度上限、每頁最多 5 筆、每人每分鐘最多 5 筆、同天同樣的算同壹筆、接線，決定 0125）", ["test/game/client_error.test.cjs"]],
  ["邀請、隊伍、一起融合", ["test/coop/party.test.cjs"]],
  ["圖的點擊範圍（背景看不到的部分點不到）", ["test/web/art_hit.test.cjs"]],
  ["每週劇情（任務、獎勵、週章、換日換週、書、劇情線、備用週）", ["test/story/story.test.cjs"]],
  ["線索 → 你看懂了（拿線索不重複、集齊才跳、只跳壹次、靈感壹次、舊存檔、壞資料、提示不破梗、不扣理智、舊週拿不到不卡、W46 d1）", ["test/story/clues.test.cjs"]],
  ["管理員介面的摘要（算得對、壞存檔不丟錯、舊存檔、沒有 email，決定 0033）", ["test/game/admin.test.cjs"]],
  ["兌換所和技能成長（裝備、提升技能、上課、試煉房間、跟館友學、限定頭飾）", ["test/game/shop.test.cjs"]],
  ["每週排行榜（同分、第一週、相減、壞存檔、暱稱清理、2000 字、建議，決定 0039）", ["test/web/board.test.cjs"]],
  ["館友證和典藏冊的摘要（只讀存檔、稀有度分開算、自由模式）", ["test/game/pass.test.cjs"]],
  ["大廳導覽圖上的館友（名單 → 每間房有誰、白名單、放不下的「+N」）", ["test/game/mates.test.cjs"]],
  ["合作試煉（隊伍選試煉房間、各算各的成長、資格不合陪打、次數不多扣、活動加成、離隊和斷線接回去，決定 0041）", ["test/coop/coop_trial.test.cjs"]],
  ["限時活動（時間邊界、台灣時間、開始時在活動內算到走完、多 1 趟、試煉加成、壞資料，決定 0041）", ["test/story/events.test.cjs"]],
  ["Hamachi 賭場（21 點的規則、真的牌組、賠率、看錯牌、錢包、救濟、大禮包、餐車、換小獎、成就和財產、舊資料認領，決定 0040）", ["test/casino/casino.test.cjs"]],
  ["Hamachi 賭場的館友同桌（輪流、同一副牌、時間限制、超時和斷線當停牌、離桌、暗牌不外洩、錢守恆，決定 0040）", ["test/casino/casino_table.test.cjs"]],
  ["地下探險撿籌碼（機率、上限、換日、同房間不重複、莊家守恆、舊錢包、壞資料、不認得的房間，決定 0047）", ["test/casino/casino_find.test.cjs"]],
  ["交委託拿籌碼、委託的靈感打折（數量、一天上限、換日、同一張不重複、莊家守恆、舊錢包、壞資料，決定 0062）", ["test/casino/casino_job.test.cjs"]],
  ["重讀禁書再擲看懂檢定、《看懂的事》的清單和提示（當天不行、隔天可以、一天一次、舊存檔、不外流還沒看懂的內容，決定 0063）", ["test/story/reread.test.cjs"]],
  ["跟 Yuga 借錢（利息、額度、到期直接扣到負的、準時還清額度變高、欠款中也能借、舊錢包，決定 0064）", ["test/casino/loan.test.cjs"]],
  ["招領（理智歸零的參觀者做成招領單、只公開該公開的、幾天內遇得到、自己的遇不到、送回去壹次、獎勵、舊存檔）", ["test/game/lostfound.test.cjs"]],
  ["欠款送參觀者去地下工作（要送的時機、換人上場、每天還 34%、理智 −5 最低 1、還清回來、花靈感補理智，決定 0064）", ["test/game/work.test.cjs"]],
  ["新的大廳（回滾的總開關、舊的大廳還在、11 間房、素材都在、沒有英文字，決定 0066）", ["test/web/lobby2.test.cjs"]],
  ["class 名字（全域 class 不能當 css 前綴、往 html／body 加 class 要先登記，11-13，docs/規則/class名單.md）", ["test/tools/class_names.test.cjs"]],
  ["館內 GDP 和景氣指數（活動次數、四塊算法、成長率要兩段各 7 天、平滑、人太少不算、日報有景氣一段，11-13）", ["test/casino/casino_gdp.test.cjs"]],
  ["邀請 NPC 去賭場（誰邀得動、答應或拒絕、坐進桌子、注從已知世界出、守恆、輸贏上限、離桌退注、台詞，決定 0080，11-14）", ["test/casino/casino_npc.test.cjs"]],
  ["參觀者門票（第一次只記起點、票價照展廳評分、三份分法、每天上限、守恆，11-13）", ["test/casino/casino_ticket.test.cjs"]],
  ["賭場的記帳（每條會動籌碼的路都要記到帳上、守恆、快照相減，11-13）", ["test/casino/casino_book.test.cjs"]],
  ["館外股票的每日漲跌（名字表、縮放和上限、休市不動、缺資料用前一天、資料到了沒、抓資料整理，11-13）", ["test/stock/stocks.test.cjs"]],
  ["賭場的拚經濟（成功、失敗、油水的機率邊界、每日上限、換日、莊家和錢包金額、莊家拚回正、文字界線，決定 0052）", ["test/casino/casino_econ.test.cjs"]],
  ["Yuga Bot 銀行的活存、定存（存領、到期、解約、利息從莊家出、破產不給、補算、守恆、利率順序）", ["test/casino/casino_bank.test.cjs"]],
  ["遊戲價直接照真實價（每分鐘抓、價＝倍數×真實價、漲跌和真實壹樣、超過 3 分鐘沒新價暫停、第壹次換比例市值不變、持有成本、補最近壹次收盤，規劃 2.8l）", ["test/stock/stocks_direct.test.cjs"]],
  ["館方投資海外（莊家和博物館資金超過保留的部分每天投壹點、錢搬給已知世界、停損停利、虧太多暫停、吃緊暫停、日報寫昨天，規劃 2.8f）", ["test/casino/casino_invest.test.cjs"]],
  ["存股數的地方都跟著換比例、除權（錢包、館方兩個池子、全館持股數；shared/ 用到 .own[ 的檔都要登記，11-17）", ["test/stock/holders_follow.test.cjs"]],
  ["旅客理智分岔（互動上限、7 天均線、每段週結算、先有預兆、恢復、variants 的選法、賭場邀請和委託有接上）", ["test/npc/npc_branch.test.cjs"]],
  ["銀行金流頁籤的資料（每個來源歸線、方向、淨額、led0 相減、只給合計）", ["test/casino/flow_hub.test.cjs"]],
  ["銀行館內經濟的幾個帳（books：餘額、昨天變化、進出最大的幾筆）", ["test/casino/casino_books.test.cjs"]],
  ["帳的正負號對帳（莊家／博物館資金／修繕基金／已知世界的每個來源方向、兩邊相反、名字、日報文字、掃程式；npm run books:sign）", ["test/casino/books_sign.test.cjs"]],
  ["文化部館債 30 天內還清（每天至少還剩餘÷剩下天數、博物館資金墊、逾期記帳、日報寫出來、館方投資不動還款的錢）", ["test/casino/casino_culture.test.cjs"]],
  ["NPC 經濟接線（行程每天抽去哪幾家、館內股人數用行程加總、全館計數、GDP 的投資看股票淨流入）", ["test/npc/npc_econ.test.cjs"]],
  ["NPC 買畫（每場最多壹位 NPC 出價、錢從已知世界來、預算和壹天上限、抬高第二價、玩家的畫賣給 NPC、守恆）", ["test/npc/npc_art.test.cjs"]],
  ["NPC 來館花錢（門票不分紅給玩家、店裡花錢進莊家或博物館資金、已知世界付、每人每天和全館每天上限、GDP、日報）", ["test/npc/npc_spend.test.cjs"]],
  ["經濟自我檢查腳本（規則面全過、帳面摘要標得出異常、吃緊和館債逾期會紅字）", ["test/tools/econ_check.test.cjs"]],
  ["劇情經濟事件（外資 NPC、館債簽收窗口、畫價凍結、莊家提早還貸款、對帳日、預告）", ["test/world/econ_events.test.cjs"]],
  ["已知世界的池子（買賣股票槓桿門票貸款撥款都是搬、只有每天成長憑空、吃緊時賣出有上限暫停貸款、文化部借款計利息、日報壹段，規劃 2.12）", ["test/casino/casino_world.test.cjs"]],
  ["股價小數兩位（成本進位、收入捨去、手續費進位、稅捨去、損益四捨五入、槓桿強平價和停損停利是小數、守恆，決定 0108）", ["test/stock/stock_decimal.test.cjs"]],
  ["館外股票照真實股價的比例（倍數、換股數市值不變、開盤拉回有上限賺不到、真實價、畫面欄位，規劃 2.8h）", ["test/stock/casino_stock_peg.test.cjs"]],
  ["台股盤中解析：沒有成交價時用買賣中間價，不會被當成沒新行情", ["test/stock/stock_tw_mis.test.cjs"]],
  ["新玩家的起始籌碼由文化部補助（從已知世界搬、記 cultureStart、人數上限、池子吃緊、舊錢包不動，決定 0082）", ["test/casino/culture_start.test.cjs"]],
  ["限定帽子的能力（探索加成、少扣理智、擋損失、回理智、打怪招式、館內效果、說明文字，決定 0085）", ["test/game/limited_fx.test.cjs"]],
  ["三支經濟腳本（價格總表、寫死金額掃描、正式站帳面的檢查，翊文 11-15）", ["test/tools/econ_scripts.test.cjs"]],
  ["館外股倍數改了（台股 ×1、美股 ×32，決定 0081）：舊的換過的再換壹次、錢包市值不變、之後不再換", ["test/stock/stock_repeg.test.cjs"]],
  ["水位三人合計（朱翊文從 11-20 起算、起點是進來那刻的淨值、虧的不扣、門檻照舊、預設不收他的名字，決定 0148）", ["test/casino/pool_three.test.cjs"]],
  ["找 NPC 一起下地下（誰邀得動、答應率、禮物錢守恆、NPC 當隊員自己投票、離隊、只剩 NPC 就結束、壹起下去紀錄、每日任務 withNpc，決定 0149）", ["test/coop/coop_npc.test.cjs"]],
  ["股票成交紀錄（館外股、館內股、集團股、槓桿的成交都記進 w.tl，最近 50 筆環狀、掛單成交標記、只多記不改錢、50 筆大小、view 新的在前名字查好）", ["test/stock/trade_log.test.cjs"]],
  ["館內五家店的股票（營業時間、盤中曲線、05:00 跳空 K＝0.03、不同的人、買賣守恆、上限、畫面格式，規劃 2.8a／2.8b／2.8g）", ["test/stock/casino_stock_in.test.cjs"]],
  ["莊家跟整個經濟接軌（破產借錢重開、記債、還債、破產分級、借款額度上限、守恆，規劃 2.11／2.11a）", ["test/casino/casino_house.test.cjs"]],
  ["館債（每週壹期、利率照莊家、照天數計息、到期、博物館資金墊、憑證補付、上限、守恆、利率順序）", ["test/casino/casino_bond.test.cjs"]],
  ["藝術市場（稀有度、價格放久了／景氣反向／搶手、一天變動小、買賣守恆、價差短線必虧、上限、舊存檔、壞資料、畫面資料，11-14）", ["test/casino/casino_art.test.cjs"]],
  ["再看收藏的畫（壹幅壹天壹次靈感、收藏壹天 ≤ 6、跟今日特展不重複領、可怕的畫每次擲理智、上限滿了不擲、habituate）和拍賣收標信（11-14）", ["test/casino/art_review.test.cjs"]],
  ["銀行廳的財報頁（沒日報給 null、景氣夾範圍、新聞照資料挑、壞資料）", ["test/casino/casino_bankecon.test.cjs"]],
  ["股票（館外七支、停盤、手續費、換日調價、莊家曝險上限、守恆）", ["test/stock/casino_stock.test.cjs"]],
  ["美股照當天美元對台幣匯率（遊戲價 ＝ 匯率 × 美金價、不換股數、沒有匯率用昨天或 ×32、壞匯率不收，11-16）", ["test/stock/stock_us_fx.test.cjs"]],
  ["台股盤中（開盤價才開、15 分鐘錨點加隨機、橋、種子祕密、停盤、掛單照盤中價檢查、view 的盤中資料、守恆，規劃 2.8d）", ["test/stock/stocks_tw.test.cjs"]],
  ["美股盤中（美東開盤時間含日光節約、整個交易日模擬含冬令夏令國定假日、停盤、掛單當天有效和睡前掛單、05:00 換日不重複算、view 欄位、守恆、解析行情，規劃 2.8i）", ["test/stock/stocks_us.test.cjs"]],
  ["股票限價單、停損單（鎖籌碼和股、跳空用觸發價、過期、取消、上限、守恆）", ["test/stock/casino_stock_order.test.cjs"]],
  ["股票槓桿、放空、當沖、信用等級（保證金、強平價、跳空穿過、收盤自動平倉、放空損益、上限、信用、美股擋掉、莊家和已知世界兩種對手盤守恆，規劃 2.8b／2.8j，規則先做）", ["test/stock/casino_stock_lev.test.cjs"]],
  ["槓桿隔天補發（館內股賺超過莊家壹天賠付上限記欠條、隔天補、莊家 ≤ 0 不付、帳守恆）和新手 2 倍信用解鎖（11-14，翊文）", ["test/stock/casino_stock_lev_owed.test.cjs"]],
  ["停損停利（槓桿）和館內股的限價單、停損單（規劃 2.8k）", ["test/stock/casino_stock_stops.test.cjs"]],
  ["館內股真的市場 × 槓桿、放空、限價單、停損停利、強平、隔天才回來的單和部位（照真的成交流程，決定 0113）", ["test/stock/in_market_flow.test.cjs"]],
  ["借款部分還款、分期（先還利息再還本金、最低金額、次數、分期期表和手續費、逾期只扣那一期、額度只降一次、賣股還債部分還、守恆，決定 0114）", ["test/casino/loan_part.test.cjs"]],
  ["館內股真的市場（旅客散客照各店人數下單、價格由買賣推、漲跌停、開盤 ＝ 昨天收盤、館友衝擊、惰性推進、守恆，決定 0113）", ["test/stock/in_market.test.cjs"]],
  ["配股息（除息日開始時持有的人領、已知世界付、股利所得稅進政府帳、當天才買不領、配股、事件壞資料、守恆，決定 0112）", ["test/stock/stock_div.test.cjs"]],
  ["Jerry 也收文化部資助、Yuga 再收 5 億、水位看兩人合計賺的、兩人各收壹隻（決定 0143）", ["test/casino/gift_multi.test.cjs"]],
  ["莊家壹次性提前重開（決定 0141）", ["test/casino/house_early_reopen.test.cjs"]],
  ["政府帳每天搬進公共機構、政府撥 30 億給文化部（決定 0140）", ["test/casino/gov_sweep.test.cjs"]],
  ["營業稅、娛樂稅（NPC、散客的店裡花費和門票，內含進政府帳、牌桌不課、守恆，決定 0111）", ["test/npc/npc_tax.test.cjs"]],
  ["股票證交稅 0.3%（台股、館內股；美股不收）、平均成本、持股明細欄位（規劃 2.8f 補）", ["test/stock/casino_stock_tax.test.cjs"]],
  ["賭場的實況和斗內（開播、搶不走、到期和離線算下播、斗內金額範圍和守恆、不能斗自己、不夠錢、每日上限、收款上限、換日、壞資料、實況主沒有錢包、資料庫規則，決定 0053）", ["test/casino/casino_live.test.cjs"]],
  ["交代人互動（閒聊、來訪、臨時拜託、送禮、交談紀錄、Lv3 稱號，決定 0151）", ["test/social/giver.test.cjs"]],
  ["交代人資料打包（shared/npc/givers.js 跟上 content/givers）", ["test/tools/givers_pack.test.cjs"]],
  ["交代人熟識度和旅客好感度（門檻、每天上限、只增不減、Lv3 發稱號進稱號系統、旅客答應率加成、不給籌碼，決定 0151、0150 補充二）", ["test/social/npcrel.test.cjs"]],
  ["德州撲克 2 人桌（牌力、買入、盲注、動作規則、抽水、有效籌碼、壹天對同壹人上限、超時、離座、看到的樣子、亂打 300 手錢守恆，決定 0150）", ["test/casino/holdem.test.cjs"]],
  ["佩佩轉盤、差壹畫（格子、賠率和優勢、不可能必賺、單轉最多贏、莊家吃緊、守恆、對帳，決定 0150）", ["test/casino/wheel.test.cjs"]],
  ["館友證的賭場摘要（成就、財產、換小獎、本週收藏；只讀、空錢包全空、欄位固定，11-21）", ["test/casino/pass_view.test.cjs"]],
  ["Hamachi 賭場的每週收藏（換週歸零、過期不懲罰、重複領不行、條件邊界、壞資料、舊錢包、同桌和單人都算、只由伺服器算，決定 0042）", ["test/casino/casino_week.test.cjs"]],
  ["稱號到處看得到（公開哪一個、讀回來檢查、館友名單、導覽圖、每週榜單、資料庫規則只放寬 titles，決定 0050）", ["test/game/titles.test.cjs"]],
  ["Hamachi 賭場的連勝連敗（連贏回心情、連輸扣理智、平手不算、歸零、每天上限、換日、舊錢包、理智最低留 1、自由模式、重複送同一局，決定 0049）", ["test/casino/casino_streak.test.cjs"]],
  ["手機轉橫的提示（先用直的記在裝置上、鎖橫向失敗不丟錯、landscape.css 只在手機橫拿和直拿才生效，決定 0043）", ["test/web/orient.test.cjs"]],
  ["動畫減量不會讓東西看不到", ["test/web/motion.test.cjs"]],
  ["說明文字標重點", ["test/web/mark.test.cjs"]],
  ["公告發到 Discord", ["test/discord/discord.test.cjs"]],
  ["Discord 聯動第一步的規則（解析 interaction、綁定碼、打錯擋、加入連結、公開的字沒有 email、指令清單，決定 0051）", ["test/discord/discord_bot.test.cjs"]],
  ["Discord 聯動第三步的文字和按鈕（指令選項、按鈕 custom_id、21 點訊息、餐車選單、把理智拿掉、21 點併單、規則只有壹套、不先回再做，決定 0051）", ["test/discord/discord_play.test.cjs"]],
  ["Yuga Bot 交代的任務（giver 的文字、說完 done 不重複、舊存檔、壞資料、Discord 的 says 不帶理智、借錢規則只有壹套、/pepe-借錢，決定 0051）", ["test/discord/yuga.test.cjs"]],
  ["每日任務活躍積分（每天 120 封頂、補做進那天、里程碑、拿滿 120 多壹份、舊制的天不變，決定 0146）", ["test/casino/task_points.test.cjs"]],
  ["每日任務、每週積分的籌碼（存檔和伺服器都有才付、壹天 2 個、里程碑壹格壹次、禮盒、莊家不夠先不付、守恆，決定 0146）", ["test/casino/task_chips.test.cjs"]],
  ["Discord 聯動第二步的規則（遊戲大事發到頻道：事件的字只有暱稱、冷卻、太舊的不發、不 @ 任何人、token 不進 repo、部署流程、模擬器不連真的 Discord，決定 0051）", ["test/discord/discord_out.test.cjs"]],
  ["預約公告（時間換算、不重發、工作流程對得上）", ["test/discord/announce.test.cjs"]],
  ["每天排程的幫手（day:plan 今天要做什麼、day:check 一次檢查）", ["test/story/day_plan.test.cjs"]],
  ["每日排程優化（11-16）：ship 只改內容跳過本機測試、day:check --strict、day:new 骨架、day:pr 草稿、ledger reveal／written／day／apply、npm run issue", ["test/tools/sched_tools.test.cjs"]],
  ["CI 不跳過任何測試（run_all、ci.yml、deploy.yml 都沒有偷跳；ship 的內容判斷共用，11-16）", ["test/tools/ci_skip.test.cjs"]],
  ["函式這包的指紋（沒變就不部署函式，deploy.yml，11-16）", ["test/tools/fn_hash.test.cjs"]],
  ["部署前要不要重跑測試（tree 跟 PR 的 CI 測過的完全一樣才跳過，其他照跑；deploy.yml 的 test／prepare 並行、deploy 等兩個，11-16）", ["test/tools/deploy_gate.test.cjs"]],
  ["給 AI 重複用的腳本", ["test/tools/tools.test.cjs"]],
  ["ship／gh_lib 等 CI、等部署：用 REST 輪詢 run 的狀態、網路短暫錯誤重試、不再因 gh run watch 中斷誤報失敗（11-16）", ["test/tools/gh_wait.test.cjs"]],
  ["每天新關卡的工具（每種打法每一層都過檢查、少寫預告會說、調難度、今天的點放進地圖，決定 0067）", ["test/tools/new_level.test.cjs"]],
  ["交過的委託不能再交", ["test/story/commission_keep.test.cjs"]],
  ["每週任務的旁白", ["test/story/story_words.test.cjs"]],
  ["functions 用到的名字都有 import（11-15：casino.js 少 import NUM，日報每天 ReferenceError）", ["test/tools/functions_imports.test.cjs"]],
  ["Discord 每天 20:00 的更新彙整（今天的館方公告、分段、長度上限，11-15）", ["test/discord/discord_digest.test.cjs"]],
  ["npm run fb：按固定動作、存結果、跟上次比（11-15）", ["test/tools/fb_run.test.cjs"]],
  ["Firebase 的固定動作", ["test/tools/fb_task.test.cjs"]],
  ["每週劇情的內容檢查擋得住壞的內容", ["test/story/week_check.test.cjs"]],
  ["每週劇情的內容（content/weeks、帳本、排程設定）", ["tools/content/week_check.cjs"]],
  ["館內 NPC 的內容檢查（欄位、名字不重複、預算在那一級而且每位不壹樣、不破梗、不露臉、打包給伺服器，11-14 步驟 3）", ["test/npc/npc_check.test.cjs"]],
  ["館外地圖（打包跟上、兩階亮度、補讀、透明片、新點，11-16）", ["test/web/map.test.cjs"]],
  ["館內 NPC 的純函式（打包給網頁、故事線解鎖、抽展廳旅客、展廳留言、委託人名單一致，11-14）", ["test/npc/npc.test.cjs"]],
  ["館內 NPC 的內容（content/npc）", ["tools/check/npc_check.cjs"]],
  ["交代人互動台詞的檢查擋得住壞的（決定 0151）", ["test/tools/givers_check.test.cjs"]],
  ["交代人互動台詞（content/givers）", ["tools/check/givers_check.cjs"]],
  ["世界經濟的名單和腳本（單位的樹、兩層加總、股票只掛一處、劇情單位、NPC 的隸屬、world:unit／npc／gdp，決定 0086）", ["test/world/world.test.cjs"]],
  ["世界經濟的名單（content/world/units ＋ NPC 的 job）", ["tools/check/world_check.cjs"]],
  ["賣股還債（不受壹人壹天賣出上限、賣的錢先補負數再照到期順序還借款、最多賣到剛好夠還、館外館內股、帳對得上，決定 0093 第 2 件）", ["test/casino/casino_debt.test.cjs"]],
  ["各房間即時人數、館內股盤中價格跟著到店人數走（房間對照、人數對得上、修正不改開盤價、沒名單不修正，決定 0094）", ["test/npc/npc_rooms.test.cjs"]],
  ["旅客卡的資料（只給已經發生的、理智和錢包只給分級、劇情角色不給，決定 0096）", ["test/npc/npc_card.test.cjs"]],
  ["財經專員（欠了不少錢才出現、借款延期手續費、每筆壹次、賣股順序、個人信壹人壹封、帳對得上，決定 0093 第 3 件）", ["test/casino/casino_advisor.test.cjs"]],
  ["集團股的槓桿、放空、掛單（推價、莊家曝險、強平、換日還原、莊家付不起、掛單鎖錢成交、守恆，決定 0124）", ["test/stock/world_gstock_lev.test.cjs"]],
  ["世界集團的股票（上市、買賣推價、漲跌停、上限、股利、增資、庫藏股、股票股利、分割、分拆、指數、經濟和股價互相影響、守恆，決定 0121）", ["test/stock/world_gstock.test.cjs"]],
  ["海外帳（館外股是對外投資：買賣、股利記在「海外（真實市場）」，本地集團不動、賣可以讓它是負的、舊的累計壹次搬家、金流頁籤的線接到海外，決定 0121）", ["test/world/world_ext.test.cjs"]],
  ["集團往來和佩佩銀行（往來表照名單長、狀態和景氣縮放、新增集團照預設、銀行存款放款、向博物館資金借、錢守恆、存款算健康值，決定 0127）", ["test/world/world_trade_flows.test.cjs"]],
  ["金流圖的家計和 NPC 錢包（發薪水、NPC 和散客花的錢記出錢的單位、單位端點加起來等於世界流水、線不重複，決定 0128）", ["test/world/flow_wage.test.cjs"]],
  ["佩佩銀行跟賭場分開（新借款、館債、存款利息由 gb 出、舊借款還莊家、莊家水位上繳 hdep、盈餘 30／70、舊館債搬一次、60 天亂數守恆，決定 0130）", ["test/casino/bank_split.test.cjs"]],
  ["銀行規則與小提示（有集團股、金流、佩佩銀行分頁，不寫過時的話，數字讀設定）", ["test/casino/bank_help.test.cjs"]],
  ["銀行頁的日期防呆（mdShift 壞日期回「—」不丟錯；ui_bank.js 不直接用 toISOString／Date.parse，11-18 玩家的 Invalid time value）", ["test/casino/bank_date.test.cjs"]],
  ["文化部資助壹位館友（只壹次、不是借款、錢從 u-culture 出、守恆、信讀 CAS_GIFT、金流圖有線，決定 0131）", ["test/casino/culture_gift.test.cjs"]],
  ["館門口池子的水位（跟著被資助那位館友的淨值、門檻 1.5 倍、每天一小格、連續確認、門檻那晚旗標、天亮收完重設、不動錢、view 不洩漏，決定 0132）", ["test/casino/pool.test.cjs"]],
  ["替佩佩取名、門檻那晚過去收走壹個名字（挑最新取名的、沒取過收融合稱號那隻、館友號碼、重新取名小圓章、短信和收據、不動錢，決定 0133）", ["test/casino/pool_take.test.cjs"]],
  ["館外股費用照真實（台股手續費 0.05、美股 0、利息 0.02、借券 0.08、台股當沖稅 0.15，館內股和集團股照舊，守恆，決定 0136）", ["test/stock/stock_fee_real.test.cjs"]],
  ["費率的字跟設定壹致（槓桿規則、銀行說明、行情表、確認單、館方公告；美股 0 寫免手續費；改設定字跟著變，決定 0136）", ["test/stock/fee_text.test.cjs"]],
  ["海外科技集團改名跨海科技集團（單位、景氣市場、集團股名稱、畫面；id 不變，決定 0139）", ["test/world/cross_sea_name.test.cjs"]],
  ["美股新增 18 支和館外股分類（OUT_CATS、每支 cat、view 的 cats、新股 ext 不改既有景氣和館方投資、自然資源市場，決定 0134）", ["test/stock/out_stocks_cat.test.cjs"]],
  ["景氣分市場（每個市場自己的景氣、接真實台股美股、放大 1.5、會回平均、影響來館頻率和花錢、愛解悶的 NPC、財報只給分級，決定 0121）", ["test/world/world_market.test.cjs"]],
  ["財報各行業景氣的白話摘要（11-20）", ["test/stock/market_summary.test.cjs"]],
  ["集團之間的交易（放款、貨款、營收、整天陸續發生、借款整週分散、財報的往來，決定 0119、0120）", ["test/world/world_trade.test.cjs"]],
  ["世界分帳（已知世界的錢分給單位、家計、公共：總和等於 house.world、成長按權重分、新玩家補助從文化部出、名單打包跟上，W3，決定 0086）", ["test/world/world_split.test.cjs"]],
  ["調數值的總入口 npm run tune（acorn 只換那個值、unit／npc 叫現有的腳本、檢查沒過就還原、--dry，決定 0089）", ["test/tools/tune.test.cjs"]],
  ["世界文件（world/main、換日第壹次才記、成長是兩次的差、不改莊家、搬錢總和不變且預設關閉，W2，決定 0086）", ["test/world/world_doc.test.cjs"]],
  ["內容檢查（content.js）", ["test/content/check.cjs"]],
  ["內容檢查（systems_text.js）", ["test/content/check_systems.cjs"]],
  ["特效在 Node 載得起來", ["test/fx/node-check.cjs"]],
  ["ES 模組接得上", ["test/esm_smoke.mjs"]],
  ["import／export 都對得上（沒有漏 import、ui_core 沒 import 後面的檔）", ["tools/check/check_imports.cjs"]],
  ["維護日誌的格式", ["tools/check/log_check.cjs"]],
  ["程式的規矩（shared/ 是純函式、無限動畫要在白名單、.replace(字串, 字串)、新加的畫面文字用壹、改名對照；每條的測試，11-20）", ["test/tools/code_rules.test.cjs"]],
  ["程式的規矩檢查本體（對現在的 repo 跑壹遍）", ["tools/check/code_rules.cjs"]],
  ["畫面版面檢查 npm run ui:check（不開瀏覽器：畫面清單、量測程式、報告整理、AGENTS.md 有寫；真的開瀏覽器太慢，改畫面的人自己跑，11-20）", ["test/tools/ui_check.test.cjs"]],
  ["搬家前的舊檔清理（只刪清單上、不在 git 裡的；ship 上線前會跑，11-20）", ["test/tools/clean_stale.test.cjs"]],
  ["資料夾的規矩（最上層只放清單裡的、模擬放 test/sim/、shared 子資料夾、檔名不用數字結尾、單檔不超過 1,200 行、web/src 不繞圈，11-20）", ["tools/check/repo_rules.cjs"]],
];

// 同時跑好幾項（翊文 11-13：「你能優化一下測試嗎」）：以前壹項排完才跑下壹項，現在壹次跑「核心數 − 1」項。
// 每項本來就是自己的 Node 程式；會寫檔的（tools.test）都用自己的暫存資料夾、伺服器用隨機 port，同時跑不會打架。
// 結果還是照上面的順序印。TEST_JOBS=1 ＝ 照舊壹項壹項跑（懷疑同時跑出問題時用）。--slow：最後列出最慢的 10 項。
const os = require("os");
const { spawn } = require("../tools/dev/child.cjs");
const JOBS = Math.max(1, Number(process.env.TEST_JOBS) || Math.max(2, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
const t0 = Date.now();
const results = new Array(STEPS.length);
let next = 0, printed = 0, failed = 0;
function flush() {
  while (printed < STEPS.length && results[printed]) {
    const { name, ok, out } = results[printed];
    console.log(`${ok ? "✓" : "✗"} ${name}：${out[out.length - 1] || ""}`);
    if (!ok) console.log(out.map(l => "    " + l).join("\n"));
    printed++;
  }
}
function runOne(i) {
  const [name, args] = STEPS[i], t = Date.now();
  return new Promise(done => {
    const p = spawn(process.execPath, args, { cwd: root });
    let buf = "";
    p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
    p.stdout.on("data", d => { buf += d; }); p.stderr.on("data", d => { buf += d; });
    p.on("error", e => { buf += String(e && e.message); });
    p.on("close", code => {
      const ok = code === 0;
      if (!ok) failed++;
      results[i] = { name, ok, out: buf.trim().split("\n"), ms: Date.now() - t };
      flush();
      done();
    });
  });
}
async function worker() { while (next < STEPS.length) await runOne(next++); }
Promise.all(Array.from({ length: Math.min(JOBS, STEPS.length) }, worker)).then(() => {
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  if (process.argv.includes("--slow")) {
    console.log("\n最慢的 10 項：");
    results.slice().sort((a, b) => b.ms - a.ms).slice(0, 10).forEach(r => console.log(`  ${(r.ms / 1000).toFixed(1)} 秒　${r.name}`));
  }
  console.log(failed ? `\n${failed} 項沒過（${sec} 秒，同時跑 ${JOBS} 項）` : `\n全部通過（${sec} 秒，同時跑 ${JOBS} 項）`);
  process.exit(failed ? 1 : 0);
});
