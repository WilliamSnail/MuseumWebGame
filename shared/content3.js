// ===== 佩佩博物館 第 3 版：新文字（草稿） =====
// Claude 先寫的草稿，Yuga 可以隨便改。這個檔案接在 content.js 後面載入。
// 選項名稱（例如「俄國8+9」「斯拉夫蹲」）要跟設定清單一字不差，委託才判得出來。
// 帶 {x} 的地方，程式會換成名字，請保留 {x}。

// ----- 系統 L：職業（開場選一個） -----
export const JOBS = [
  { id: "detective", name: "偵探", skill: "偵查", desc: "你總會注意到別人沒注意的地方。找不同多十秒，謎語委託有提示。", motto: "畫裡有東西動過。我看見了。" },
  { id: "historian", name: "藝術史學者", skill: "鑑賞", desc: "看過太多名作，骰子騙不了你。十位骰多擲壹顆，取低的。", motto: "每一隻佩佩，都屬於它的時代。" },
  { id: "occultist", name: "神秘學家", skill: "神秘學", desc: "讀過不該讀的書。禁書和隱藏展品扣的理智減半，神話多壹點。", motto: "知道得越多，睡得越少。" },
  { id: "gambler", name: "賭徒", skill: "幸運", desc: "運氣勉強站在你這邊。心情擲兩次取高，孤注一擲不用理智檢定。", motto: "再擲一次。就一次。" },
  { id: "artisan", name: "抱枕職人", skill: "手工藝", desc: "你的手縫過上千個抱枕。做抱枕不花靈感，抱抱枕多回壹點理智。", motto: "填充要剛剛好，人生也是。" },
  { id: "salesman", name: "推銷員", skill: "說服", desc: "你能把任何佩佩賣給任何人。委託的賞金多三成。", motto: "這隻佩佩，跟您非常有緣。" },
];

// ----- 技能是做什麼的（一行） -----
export const SKILL_TEXT = {
  偵查: "看出藏起來的東西：暗門、腳印、畫裡變了的地方。",
  鑑賞: "看出一件東西是真是假、值多少、哪裡不對。",
  神秘學: "知道不該知道的事，例如觸手帽為什麼會餓。",
  幸運: "事情剛好往好的方向走。沒有原因。",
  手工藝: "修東西、拆東西，把破掉的縫回去。",
  說服: "讓別人，或別的東西，照你的意思做。",
};

// ----- 職業卡與技能成長 -----
export const JOB_TEXT = {
  pick: "你是誰？",
  sub: "每一位參觀者都有自己的來歷。這會改變你看佩佩的方式。",
  growth: "昨天用得不錯。你的「{x}」成長了。",
  history: "歷任參觀者",
};

// ----- 系統 J：融合室 -----
export const FUSION_TEXT = {
  intro: "把兩隻佩佩放上融合台。牠們會留下來，世界會多出壹隻。",
  empty: "融合台是空的。從收藏裡拖兩隻上來。",
  ready: "兩隻都就位了。融合台開始發熱。",
  sanSub: "把兩個存在揉成壹個，是一種禁忌。",
  mutate: "突變了。出現了新的可能：「{x}」。",
  recipe: "你發現了配方「{x}」。配方圖鑑多了壹頁。",
  limit: "今天的融合爐已經冷了。明天再來。",
  samePair: "這兩隻今天已經融合過了。讓牠們休息一下。",
};

// ----- 隱藏配方：hint 是還沒發現時顯示的謎 -----
export const RECIPE_TEXT = {
  yiqi: { name: "義氣佩佩", hint: "八加九，等於多少？", found: "兩隻蹲著的8+9，生出了壹隻戴毛帽、講義氣的。八加九，十七。" },
  twins: { name: "更好的自己", hint: "照著鏡子融合，會生出什麼？", found: "兩隻一模一樣的佩佩，生出了稀有壹級的自己。" },
  rainbow: { name: "雨過天晴", hint: "紅的笑了，綠的也笑了。中間會出現什麼？", found: "紅與綠一起開心，生出了虹彩。" },
  tipsy: { name: "微醺的夜晚", hint: "一個笑著躺下，一個哭著躺下。醒來是什麼心情？", found: "牠醒來時有一點開心，有一點傷心。這叫微醺。" },
  handstand: { name: "讚到翻過去", hint: "兩個讚加在一起，世界會變成怎樣？", found: "兩隻比讚的佩佩，生出了壹隻倒立的。世界翻過來了。" },
  forbidden: { name: "不該出生的孩子", hint: "會餓的帽子，配上說不出的形狀。", found: "融合台上多了壹隻。你數不清牠的眼睛，牠已經數完你的了。" },
};

// ----- 系統 K：工坊升級 -----
export const UPGRADE_TEXT = {
  ped7: { name: "第七個展台", desc: "展廳多一個展台。佩佩多一個可以站的地方。" },
  ped8: { name: "第八個展台", desc: "再多一個。八，是個好數字。" },
  dice: { name: "骰子打磨", desc: "擲稀有度時，可以重擲十位那顆骰子，一天三次。" },
  board: { name: "委託板加寬", desc: "委託板多釘一張，每天四張。" },
  fame: { name: "名聲", desc: "外面開始有人談論這裡。參觀者來得更勤了。" },
  forge2: { name: "第二座融合爐", desc: "多一座爐子。每天可以多融合三次。" },
  repair: { name: "修復台", desc: "失敗作和受傷的佩佩，可以修成「修復品」。" },
};

// ----- 系統 M：地下收藏庫（5 層） -----
// check.type："power"＝隊伍強度＋1D10 ≥ target；"skill"＝d100 ≤ 技能＋mod；
//             "san"＝理智檢定 spec；"none"＝一定成功，什麼都不拿。
// mood ＝房間「敵人」的心情（開心／傷心／生氣，或 null）；color ＝房間的顏色（或 null）。
export const CELLAR = [
  {
    floor: 1,
    name: "積灰的儲藏室",
    intro: "樓梯底下是儲藏室。灰塵很厚，上面有小小的腳印。",
    clear: "紙箱底下壓著一頂毛帽。往下的樓梯，比下來的那道還長。",
    rooms: [
      {
        id: "1a", title: "堆滿紙箱的角落",
        lines: ["紙箱上寫著「第壹代，勿丟」。", "其中一個箱子，在輕輕發抖。"],
        mood: "傷心", color: "黃",
        choices: [
          { label: "把壓在上面的箱子搬開", check: { type: "power", target: 11 },
            success: { text: "底下的箱子裡是壹疊舊說明牌。字都還在。", insp: 2 },
            fail: { text: "整疊箱子倒了下來，壓到壹隻佩佩。", san: "1D3", injure: true } },
          { label: "仔細看箱子上的字", check: { type: "skill", skill: "偵查", mod: 10 },
            success: { text: "字的下面還有一行小字：「牠們會長大」。", insp: 2 },
            fail: { text: "灰塵飛進眼睛。你什麼都沒看到。", san: "1D2" } },
          { label: "不要吵醒它", check: { type: "none" },
            success: { text: "你輕輕走開。箱子不抖了。" } },
        ],
      },
      {
        id: "1b", title: "舊海報牆",
        lines: ["牆上貼滿開館海報，每一張的日期都不一樣。", "最舊的一張，日期比這棟樓還早。"],
        mood: null, color: "紅",
        choices: [
          { label: "撕下最舊的那張", check: { type: "power", target: 12 },
            success: { text: "海報背面寫滿了點子。你都記下來了。", insp: 3 },
            fail: { text: "海報撕不下來。它好像長在牆上。", san: "1D3" } },
          { label: "鑑定海報的年代", check: { type: "skill", skill: "鑑賞", mod: 0 },
            success: { text: "這是第壹代的海報。很值錢，但不能賣。", insp: 3 },
            fail: { text: "你算不出年代。海報上的日期在變。", san: "1D3" } },
          { label: "只看不碰", check: { type: "none" },
            success: { text: "你看了一會兒。海報上的佩佩都對你點頭。" } },
        ],
      },
      {
        id: "1c", title: "一張空椅子",
        lines: ["房間中央有一張椅子，椅墊還是溫的。", "旁邊的地上，有壹小堆瓜子殼。"],
        mood: "生氣", color: "綠",
        choices: [
          { label: "坐下來等", check: { type: "san", spec: "0/1D3" },
            success: { text: "沒有人回來。你休息了一下，好多了。", san: "+1D2" },
            fail: { text: "你一直覺得，有人站在你背後。" } },
          { label: "循著瓜子殼找", check: { type: "skill", skill: "偵查", mod: 0 },
            success: { text: "瓜子殼一路通到牆角的洞。洞裡有靈感。", insp: 3 },
            fail: { text: "瓜子殼繞了壹圈，回到椅子下面。", san: "1D2" } },
          { label: "把椅子推開", check: { type: "power", target: 11 },
            success: { text: "椅子底下壓著壹張舊委託單。", insp: 2 },
            fail: { text: "椅子推不動。好像有誰坐在上面。", san: "1D4" } },
        ],
      },
      {
        id: "1d", title: "滴水的水管",
        lines: ["天花板上的水管在滴水。", "滴下來的水，在地上排成了壹個「8」。"],
        mood: "傷心", color: "黑",
        choices: [
          { label: "把水管鎖緊", check: { type: "skill", skill: "手工藝", mod: 10 },
            success: { text: "水停了。地上的8慢慢乾掉。", insp: 2 },
            fail: { text: "水管噴了你們一身。壹隻佩佩著涼了。", injure: true } },
          { label: "用力敲水管", check: { type: "power", target: 13 },
            success: { text: "水管發出很深的回音，像下面有人在回答。", insp: 3 },
            fail: { text: "水管裂開，水淹到了腳踝。", san: "1D3", injure: true } },
          { label: "繞過去", check: { type: "none" },
            success: { text: "你繞過那攤水。8 在你身後，慢慢變成了 9。" } },
        ],
      },
    ],
  },
  {
    floor: 2,
    name: "蓋著白布的雕像廳",
    intro: "這一層很冷。整個大廳，站滿了蓋著白布的雕像。",
    clear: "每一尊雕像都換了位置。口袋裡那本書，回起源室再讀。",
    rooms: [
      {
        id: "2a", title: "熟悉的聲音",
        lines: ["白布底下，傳出很熟悉的聲音。", "這尊雕像，好像也在嘔吐。"],
        mood: null, color: "綠",
        choices: [
          { label: "掀開白布", check: { type: "san", spec: "1/1D6" },
            success: { text: "是壹尊正在嘔吐的佩佩。跟樓上那尊是壹對。", insp: 3 },
            fail: { text: "你看到了它吐出來的東西。" } },
          { label: "隔著布鑑定", check: { type: "skill", skill: "鑑賞", mod: -10 },
            success: { text: "這是樓上那尊的草稿。作者當時很不舒服。", insp: 4 },
            fail: { text: "你越看越不舒服。", san: "1D4" } },
          { label: "不要掀", check: { type: "none" },
            success: { text: "你沒有掀。有些東西，蓋著比較好。" } },
        ],
      },
      {
        id: "2b", title: "排成圓圈的雕像",
        lines: ["九尊雕像排成一圈，中間空了壹個位子。", "白布的形狀，像是在等人。"],
        mood: "生氣", color: "黑",
        choices: [
          { label: "推開其中一尊", check: { type: "power", target: 15 },
            success: { text: "圓圈破了。中間的地板上，有靈感在發光。", insp: 4 },
            fail: { text: "雕像比你想的重。壹隻佩佩被壓到了。", san: "1D3", injure: true } },
          { label: "研究圓圈的排法", check: { type: "skill", skill: "神秘學", mod: 0 },
            success: { text: "這是一種召喚的排法。召喚的是乙輛車。", insp: 3, myth: 1 },
            fail: { text: "你看不懂。但你覺得被它們看懂了。", san: "1D4" } },
          { label: "站到中間的空位", check: { type: "san", spec: "1/1D8" },
            success: { text: "你站了一下，什麼都沒有發生。這樣最好。", insp: 2, myth: 1 },
            fail: { text: "你覺得白布底下，有九雙眼睛一起轉了過來。" } },
        ],
      },
      {
        id: "2c", title: "綁著繩子的書架",
        lines: ["這塊白布底下不是雕像，是一座書架。", "每一本書都綁著繩子，只有一本沒有。"],
        mood: null, color: "黃",
        choices: [
          { label: "拿起沒綁的那本", check: { type: "san", spec: "1/1D4" },
            success: { text: "那本書很輕，輕得不像書。你把它收好了。", myth: 1 },
            fail: { text: "書在你手裡翻了壹頁。不是你翻的。" } },
          { label: "解開其他書的繩子", check: { type: "skill", skill: "手工藝", mod: 0 },
            success: { text: "繩結很複雜，但你解開了。書裡夾著靈感。", insp: 4 },
            fail: { text: "繩子越解越緊，纏住了壹隻佩佩。", san: "1D2", injure: true } },
          { label: "什麼書都不碰", check: { type: "none" },
            success: { text: "你退後一步。書架上的繩子，鬆了壹點點。" } },
        ],
      },
      {
        id: "2d", title: "最大的那尊",
        lines: ["大廳盡頭的那尊，比天花板還高。", "白布垂到地上，布底下有很多隻腳。"],
        mood: "開心", color: null,
        choices: [
          { label: "從布底下鑽過去", check: { type: "power", target: 16 },
            success: { text: "你們鑽過去了。布底下很暖。", insp: 5 },
            fail: { text: "那些腳動了。你們被踢了出來。", san: "1D6", injure: true } },
          { label: "請它讓路", check: { type: "skill", skill: "說服", mod: -10 },
            success: { text: "白布點了點頭，往旁邊挪了一步。", insp: 4 },
            fail: { text: "白布不為所動。你覺得自己被笑了。", san: "1D4" } },
          { label: "閉上眼睛走過去", check: { type: "san", spec: "1/1D6" },
            success: { text: "你閉著眼走過去了。沒看見，就不存在。", insp: 3 },
            fail: { text: "你偷看了壹眼。" } },
        ],
      },
    ],
  },
  {
    floor: 3,
    name: "空畫框的走廊",
    intro: "走廊兩邊掛滿了金框。框裡的畫，都不見了。",
    clear: "最後一個畫框背後，掛著壹把鑰匙。上面刻著「背景」。",
    rooms: [
      {
        id: "3a", title: "只剩壁紙的畫框",
        lines: ["畫框裡只剩壁紙，酒紅色，有花紋。", "花紋在你的眼角，慢慢地爬。"],
        mood: null, color: "紅",
        choices: [
          { label: "盯著花紋看", check: { type: "skill", skill: "鑑賞", mod: 0 },
            success: { text: "你認出來了，這是大廳的壁紙。它也想進畫框。", insp: 4 },
            fail: { text: "花紋爬到了你的袖子上。", san: "1D4" } },
          { label: "撕下壹角", check: { type: "power", target: 17 },
            success: { text: "壁紙後面是另壹層壁紙。你收下了壹角。", insp: 5 },
            fail: { text: "壁紙撕不下來，反而黏住了壹隻佩佩。", san: "1D3", injure: true } },
          { label: "看著地板走過去", check: { type: "none" },
            success: { text: "你只看地板。地板很乾淨。" } },
        ],
      },
      {
        id: "3b", title: "裝著星空的畫框",
        lines: ["這個畫框裡是夜空，星星在動。", "有一顆星星，是兩隻眼睛。"],
        mood: "傷心", color: "黑",
        choices: [
          { label: "數星星", check: { type: "skill", skill: "幸運", mod: 0 },
            success: { text: "你數到第八顆時停了下來。剛剛好。", insp: 4 },
            fail: { text: "你數到了第九顆。它眨了眼。", san: "1D6" } },
          { label: "伸手進畫框", check: { type: "san", spec: "1/1D8" },
            success: { text: "畫框裡很冷，很安靜。你摸到壹顆星星，帶了回來。", insp: 3, myth: 1 },
            fail: { text: "你的手，在畫框裡待得太久了。" } },
          { label: "退後", check: { type: "none" },
            success: { text: "你退後一步。星星回到原本的位置。" } },
        ],
      },
      {
        id: "3c", title: "下著雪的畫框",
        lines: ["這個畫框裡在下雪。", "雪落到框外，在地上積了薄薄一層。"],
        mood: "開心", color: null,
        choices: [
          { label: "踩著雪走過去", check: { type: "power", target: 17 },
            success: { text: "雪很深，但你們走過去了。腳印裡長出了靈感。", insp: 5 },
            fail: { text: "壹隻佩佩凍僵了。", san: "1D3", injure: true } },
          { label: "用帽子接雪", check: { type: "skill", skill: "手工藝", mod: 10 },
            success: { text: "你接了一帽子的雪。它在帽子裡沒有融化。", insp: 4 },
            fail: { text: "雪融了，帽子也濕了。", san: "1D2" } },
          { label: "等雪停", check: { type: "none" },
            success: { text: "雪沒有停。你們決定繞路。" } },
        ],
      },
      {
        id: "3d", title: "原本掛著那幅畫的框",
        lines: ["牌子上寫著：壹群祭司與乙輛車。", "框是空的。地上有輪胎的痕跡。"],
        mood: "生氣", color: "黑",
        choices: [
          { label: "跟著輪胎痕跡走", check: { type: "skill", skill: "偵查", mod: 0 },
            success: { text: "痕跡停在牆邊。牆上有壹道門的形狀。", insp: 5 },
            fail: { text: "痕跡突然變多了。好多輛。", san: "1D6" } },
          { label: "擋住開過來的東西", check: { type: "power", target: 19 },
            success: { text: "你們擋住了。車燈熄了，有人下車道歉。", insp: 6 },
            fail: { text: "你們被撞開了。車裡的祭司對你揮了揮手。", san: "1D6", injure: true } },
          { label: "大喊：這才不是佩佩!", check: { type: "san", spec: "1/1D6" },
            success: { text: "走廊安靜了下來。好像有人同意你。", insp: 3 },
            fail: { text: "回音說：這才是。" } },
        ],
      },
    ],
  },
  {
    floor: 4,
    name: "淹水的檔案室",
    intro: "這一層淹水了。水不冷也不熱，剛好是體溫。",
    clear: "水退了。倒影裡的佩佩全都倒立著，還對你揮手。",
    rooms: [
      {
        id: "4a", title: "漂浮的檔案",
        lines: ["水面上漂著檔案，每一份都是壹位參觀者。", "有一份寫著你的名字，還沒寫完。"],
        mood: "傷心", color: "黃",
        choices: [
          { label: "撈起寫著你名字的那份", check: { type: "san", spec: "1/1D8" },
            success: { text: "上面只寫到今天。你鬆了一口氣。", insp: 4 },
            fail: { text: "上面寫著明天的事。" } },
          { label: "撈起別人的檔案", check: { type: "skill", skill: "偵查", mod: -10 },
            success: { text: "是上壹位參觀者的。最後一行寫著：「蹲下了」。", insp: 5, myth: 1 },
            fail: { text: "紙在你手裡化成了水。", san: "1D4" } },
          { label: "讓它們漂走", check: { type: "none" },
            success: { text: "檔案慢慢漂遠了。你沒有看到結局。" } },
        ],
      },
      {
        id: "4b", title: "泡在水裡的書架",
        lines: ["書架在水裡一路排下去，看不到底。", "最上面一層的書，還是乾的。"],
        mood: null, color: "綠",
        choices: [
          { label: "爬上書架", check: { type: "power", target: 19 },
            success: { text: "你們爬上去了，拿到乾的那幾本。", insp: 6 },
            fail: { text: "書架倒了。壹隻佩佩跟著書沉下去，又被撈了回來。", san: "1D4", injure: true } },
          { label: "潛下去找底", check: { type: "skill", skill: "幸運", mod: -10 },
            success: { text: "你碰到了底。底下是乾的，還有靈感。", insp: 6, myth: 1 },
            fail: { text: "你一直往下游，底一直往下退。", san: "1D8" } },
          { label: "讀書背上的字", check: { type: "skill", skill: "神秘學", mod: 0 },
            success: { text: "每一本的書背都是同一句話。你在起源室讀過。", insp: 4, myth: 2 },
            fail: { text: "你讀懂了其中壹本。你寧可沒有。", san: "1D6" } },
        ],
      },
      {
        id: "4c", title: "管理員的桌子",
        lines: ["桌上的牌子寫著：檔案管理員，外出中。", "外出的日期，是很久以前。"],
        mood: "生氣", color: "黑",
        choices: [
          { label: "幫他把檔案歸位", check: { type: "skill", skill: "手工藝", mod: 0 },
            success: { text: "檔案排好了。桌燈亮了一下，像在道謝。", insp: 5, san: "+1D3" },
            fail: { text: "你排錯了。整疊檔案嘆了一口氣。", san: "1D4" } },
          { label: "翻他的抽屜", check: { type: "skill", skill: "幸運", mod: 0 },
            success: { text: "抽屜裡有壹張紙條：「我去莫斯科了」。", insp: 4 },
            fail: { text: "抽屜裡伸出一隻手，把抽屜關上了。", san: "1D6" } },
          { label: "不打擾", check: { type: "none" },
            success: { text: "你們安靜地經過。椅子轉向了你。" } },
        ],
      },
      {
        id: "4d", title: "水閘",
        lines: ["前面是一道水閘，再下去就是最底層。", "對面有人在敲。敲八下，停一下，再敲九下。"],
        mood: "開心", color: "黃",
        choices: [
          { label: "轉開水閘", check: { type: "power", target: 21 },
            success: { text: "水閘開了。水退下去，露出往下的樓梯。", insp: 6 },
            fail: { text: "水灌了進來。壹隻佩佩被沖得好遠。", san: "1D6", injure: true } },
          { label: "回敲八下，再敲九下", check: { type: "skill", skill: "說服", mod: 0 },
            success: { text: "敲門聲停了。水閘自己打開了。", insp: 5 },
            fail: { text: "對面敲得更大聲了。", san: "1D4" } },
          { label: "等它自己開", check: { type: "san", spec: "1/1D6" },
            success: { text: "等了很久，水閘開了一條縫，剛好夠你們過去。", insp: 2 },
            fail: { text: "你等了很久。久到忘了自己在等什麼。" } },
        ],
      },
    ],
  },
  {
    floor: 5,
    name: "很大的白色房間",
    intro: "最底層很白，白到看不出牆在哪裡。遠處有壹扇小門。",
    clear: "小門關上了。你口袋裡多了壹把鑰匙，刻著「手上拿的東西」。",
    rooms: [
      {
        id: "5a", title: "白色的地平線",
        lines: ["你們走了很久，牆還是很遠。", "地上有一排蹲過的痕跡，每隔八步壹個。"],
        mood: "傷心", color: null,
        choices: [
          { label: "一直走下去", check: { type: "power", target: 20 },
            success: { text: "牆終於近了。回頭看，入口已經不見了。", insp: 5 },
            fail: { text: "走太久了。壹隻佩佩躺平，不肯再走。", san: "1D6", injure: true } },
          { label: "數著蹲痕走", check: { type: "skill", skill: "偵查", mod: 0 },
            success: { text: "第八個和第九個蹲痕之間，有壹條捷徑。", insp: 6 },
            fail: { text: "你數到十七，又從頭開始。", san: "1D6" } },
          { label: "原地休息", check: { type: "none" },
            success: { text: "你們坐下來。白色很安靜，什麼都沒有發生。" } },
        ],
      },
      {
        id: "5b", title: "瓜子殼的山",
        lines: ["白色地板上有壹座小山，全是瓜子殼。", "山頂上，放著一頂毛帽。"],
        mood: "生氣", color: "黃",
        choices: [
          { label: "爬上瓜子山", check: { type: "power", target: 21 },
            success: { text: "山很滑，但你們爬上去了。毛帽裡塞滿了靈感。", insp: 7 },
            fail: { text: "瓜子殼崩了，你們滑回山腳。", san: "1D4", injure: true } },
          { label: "跟山頂的毛帽打招呼", check: { type: "skill", skill: "說服", mod: -10 },
            success: { text: "毛帽點了點頭。山自己矮了下去。", insp: 6 },
            fail: { text: "毛帽沒有理你。", san: "1D6" } },
          { label: "研究這些瓜子殼", check: { type: "skill", skill: "神秘學", mod: -10 },
            success: { text: "每壹顆都嗑得很整齊。這是一種儀式。", insp: 4, myth: 2 },
            fail: { text: "你開始想嗑瓜子，停不下來。", san: "1D6" } },
        ],
      },
      {
        id: "5c", title: "第一位收藏者的椅子",
        lines: ["白色房間中間，有壹張椅子和壹張紙。", "紙上寫著：我先走了。鑰匙在門裡。"],
        mood: "開心", color: "紅",
        choices: [
          { label: "坐上那張椅子", check: { type: "san", spec: "1/1D8" },
            success: { text: "你看見了他看過的東西：所有的可能性。", insp: 5, myth: 2 },
            fail: { text: "椅子不想讓你走。" } },
          { label: "鑑定那張紙", check: { type: "skill", skill: "鑑賞", mod: 0 },
            success: { text: "是第一位收藏者的字跡。墨水還沒乾。", insp: 6 },
            fail: { text: "字跡在你眼前，變成了你的。", san: "1D6" } },
          { label: "把紙摺好收著", check: { type: "none" },
            success: { text: "你把紙收進口袋。也許以後會懂。" } },
        ],
      },
      {
        id: "5d", title: "8+9 的小門", boss: true,
        lines: ["白色的盡頭有壹扇小門，門牌寫著「8+9」。", "門後傳來嗑瓜子的聲音。牠在等你蹲下來。"],
        mood: null, color: null,
        choices: [
          { label: "推開小門", check: { type: "power", target: 23 },
            success: { text: "門開了。牠站起來，拍拍你的肩：兄弟，夠義氣。", insp: 10 },
            fail: { text: "門推不動。門後的牠笑了一聲。", san: "1D10", injure: true } },
          { label: "在門口蹲下", check: { type: "san", spec: "1D3/1D10" },
            success: { text: "你蹲下了，腳跟貼地。門自己開了。", insp: 8, myth: 2 },
            fail: { text: "你蹲下了，就再也不想站起來。" } },
          { label: "跟牠講義氣", check: { type: "skill", skill: "說服", mod: -20 },
            success: { text: "你說了八個字，又說了九個字。門開了。", insp: 9 },
            fail: { text: "牠沒有被說服。你倒是被牠說服了一點。", san: "1D8" } },
        ],
      },
    ],
  },
];

// ----- 第 4 章（走到 B4 時解鎖） -----
export const CHAPTER4 = {
  id: 4,
  title: "第肆章　地下",
  spine: "地下",
  pages: [
    "博物館底下，還有一座博物館。\n沒有人蓋過它。\n它比樓上那座早到了壹點點。",
    "每一隻做壞的佩佩，\n每一隻差一點就存在的佩佩，\n都會慢慢往下沉。",
    "沉到最底下的，叫做可能性。\n它們還沒有名字，\n但已經在排隊了。",
    "最底層有壹扇小門。\n門後蹲著壹隻很講義氣的佩佩，\n替所有還沒出生的佩佩守門。",
    "會計說過，數字後面好像還有東西。\n就是這裡。\n(你感到腳下很深)",
  ],
};

// ----- 第 4 本禁書（在 B2 找到） -----
export const BOOK4 = {
  id: "book4",
  title: "地下收藏目錄",
  spine: "收藏目錄",
  lines: [
    "這是[[地下收藏庫|cellar]]的目錄，共 5 層。",
    "每一層的展品，都是樓上沒做出來的佩佩。",
    "最後壹頁的編號，比[[圖鑑牆|codex]]還多壹號。",
  ],
  san: "1D4/1D10",
  myth: 3,
  successAside: "(你闔上目錄。它在你手裡變重了一點)",
  failAside: "(你開始覺得，自己也在目錄裡)",
};

// ----- 新結局：走完 B5 -----
export const ENDING_CELLAR = {
  title: "地下館長",
  lines: [
    "小門後面，是一張很舊的櫃台。",
    "櫃台上放著乙串鑰匙，跟樓上那串一模一樣。",
    "牠嗑完最後壹顆瓜子，把鑰匙推給你。",
    "「兄弟，下面交給你了。」",
    "從今天起，差一點就存在的佩佩，都歸你管。",
    "你替牠們取名字，替牠們排隊。",
    "有一天，牠們會一隻一隻走上樓梯。",
    "(你感到和諧與平靜，還有一點腳麻)",
  ],
};

// ----- 委託人關係線：每人 5 張，照順序；最後送一個專屬選項 -----
export const CLIENT_LINES = {
  collector: {
    name: "老派收藏家",
    gift: "紳士帽",
    intro: "我收藏了四十年。最近，想把一套東西收齊。",
    finale: "這頂帽子是我年輕時戴的。收藏家不收自己的東西，送你。",
    steps: [
      { text: "先從最基本的開始。一隻不戴帽子、站得直的。", need: { 帽子: "沒有", 姿勢: "站著" }, comment: "很好。收藏要從站得直的開始。" },
      { text: "我年輕時戴棒球帽。要一隻戴棒球帽的，綠色。", need: { 帽子: "棒球帽", 顏色: "綠" }, comment: "像我年輕的時候。只是我沒那麼綠。" },
      { text: "我太太以前最喜歡黃色。要一隻黃的，開心的。", need: { 顏色: "黃", 心情: "開心" }, comment: "她會喜歡的。她以前也是這樣笑。" },
      { text: "最近我常一個人坐著。要一隻也坐著的。", need: { 姿勢: "坐著" }, comment: "我們一起坐了一下午。牠比電視安靜。" },
      { text: "最後一隻。戴皇冠，稀有以上。這套收藏要有個結尾。", need: { 帽子: "皇冠", 稀有度: { not: "普通" } }, comment: "收齊了。四十年，就差這一隻。" },
    ],
  },
  priest: {
    name: "某位祭司",
    gift: "虔誠",
    intro: "畫裡那個人不是我。不過，我想請你幫個忙。",
    finale: "這份心情，是我在祭壇前學會的。現在交給你。",
    steps: [
      { text: "祭壇上需要一隻安靜的。坐著，不要生氣。", need: { 姿勢: "坐著", 心情: { not: "生氣" } }, comment: "很好。牠坐在祭壇上，比蠟燭還穩。" },
      { text: "信眾說祭壇太素了。要一隻紅的，喜氣一點。", need: { 顏色: "紅", 心情: "開心" }, comment: "信眾多了三位。有兩位是來看牠的。" },
      { text: "我需要一隻會施法的，替我壯膽。", need: { 帽子: "巫師帽" }, comment: "牠的法力比我強。我不確定該高興還是難過。" },
      { text: "畫裡那輛車常出現在我夢裡。要一隻生氣的，站著守夜。", need: { 心情: "生氣", 姿勢: "站著" }, comment: "牠在我床邊站了壹整晚。車沒有再來了。" },
      { text: "最後，我想看看真正的佩佩。最普通的那種，什麼都不戴。", need: { 稀有度: "普通", 帽子: "沒有" }, comment: "對。這才是佩佩。我找了好久。" },
    ],
  },
  youth: {
    name: "穿運動服的少年",
    gift: "夜市金",
    intro: "兄弟，聽說你這裡什麼佩佩都做得出來。",
    finale: "這是夜市最亮的顏色。阿嬤說，要送給講義氣的人。",
    steps: [
      { text: "聽說你會做俄國8+9。先來壹隻，看你夠不夠格。", need: { 心情: "俄國8+9" }, comment: "可以。眼神有到。" },
      { text: "要一隻生氣的黑佩佩，站我後面，看起來比較兇。", need: { 心情: "生氣", 顏色: "黑" }, comment: "大家都不敢靠近了。其實牠人很好。" },
      { text: "我阿嬤在夜市擺攤。要一隻開心比讚的，幫她招客人。", need: { 心情: "開心", 姿勢: "比讚" }, comment: "阿嬤說生意變好了。她叫我跟你說謝謝。" },
      { text: "現在教你蹲。腳跟貼地，膝蓋打開。做壹隻給我看。", need: { 姿勢: "斯拉夫蹲" }, comment: "可以。腳跟有貼地。你是自己人了。" },
      { text: "最後壹隻。俄國8+9，斯拉夫蹲。八加九，你知道的。", need: { 心情: "俄國8+9", 姿勢: "斯拉夫蹲" }, comment: "十七。義氣。你是真兄弟。" },
    ],
  },
};

// ----- 每週特展：主題名與規則（一行） -----
export const WEEKLY_TEXT = {
  start32: { name: "回到起點", rule: "只能擺一開始就打開的 32 種組合。" },
  allBlack: { name: "黑色週", rule: "只能擺黑色的佩佩。" },
  allFlat: { name: "全館躺平", rule: "只能擺躺平的佩佩。" },
  failedOnly: { name: "失敗作之夜", rule: "只能擺失敗作。" },
  noHat: { name: "脫帽致敬", rule: "不能擺戴帽子的佩佩。" },
  noLegend: { name: "平凡之美", rule: "不能擺傳說級稀有的佩佩。" },
  pillowWeek: { name: "抱枕週", rule: "只能擺抱枕。" },
  gopnikWeek: { name: "8+9 週", rule: "只能擺俄國8+9 的佩佩。" },
};

// ----- 交換碼 -----
export const TRADE_TEXT = {
  send: "這串字就是這隻佩佩。傳給朋友，貼進去就收到了。",
  receive: "你收到了壹隻佩佩：「{x}」。",
  already: "這串字已經收過了。同一隻佩佩不會來兩次。",
  bad: "這串字看不懂。也許少抄了壹個字。",
};

// ----- 新選項的說明牌（一行） -----
export const NEW_OPTION_TEXT = {
  毛帽: "很暖的毛帽。耳朵那裡，看起來有點兇。",
  紳士帽: "老派收藏家年輕時戴的帽子。戴上會不自覺地點頭致意。",
  微醺: "有一點開心，有一點傷心，臉有一點紅。",
  虔誠: "雙手合十的心情。祭司說，這是在祭壇前學會的。",
  虹彩: "從每個角度看，都是不同的顏色。",
  夜市金: "夜市最亮的那種金。阿嬤說，夠亮才招得到客人。",
  倒立: "讚比到最後，整隻翻了過去。從牠那邊看，倒的是你。",
  花紋壁紙: "跟大廳一樣的酒紅花紋。花紋偶爾會動，請勿在意。",
  星空: "從空畫框裡帶回來的夜空。有一顆星星會眨眼。",
  雪夜: "畫框裡的雪，下到現在還沒停。",
  瓜子: "壹把瓜子。分你壹顆，就是兄弟。",
  小抱枕: "壹個隨身的小抱枕。累了就抱一下。",
  放大鏡: "拿著它，什麼都看得比較清楚。包括不該看的。",
};

// ----- 大廳平面圖：新房間滑過時的一行字 -----
// 狀態列的提示（翊文 11-09：「滑鼠移到心情或理智之類的要有提示怎麼恢復」）。how 是實際做得到的事，規則改了這裡也要改
export const STATUS_TIPS = {
  day: { title: "天數", what: "台灣時間每天 05:00 換壹天，大家都壹樣。" },
  mood: { title: "心情", what: "心情就是**幸運**：做佩佩的時候，1 點心情可以把骰子**壓低 1**。", label: "怎麼恢復", how: ["**每天第壹次進館**擲 1～100：擲出比現在的心情大，就 **+1～10**", "**每日簽到**（有幾天送心情，節日多送）", "**每日任務、每週任務**的獎勵", "看某些**展品**", "**主題展**辦完", "到**賭場餐車**吃東西"] },
  san: { title: "理智", what: "看到嚇人的東西會掉。**理智越低，怪事越多。**", label: "怎麼恢復", how: ["到**抱枕工作台**抱抱枕", "到**委託櫃台**交委託", "**圖鑑**收集完整整壹類", "**地下收藏庫**：帶**躺平**的佩佩，或戴**毛帽**的佩佩", "**賭場餐車**的茶"] },
  insp: { title: "靈感", what: "**做佩佩、解鎖選項**都要花靈感。", label: "怎麼拿到", how: ["逛**畫廊**看展品", "到**委託櫃台**交委託", "**每日簽到、每日任務、每週任務**", "**地下收藏庫**"] },
  chips: { title: "籌碼", what: "只在 Hamachi 賭場用，跟靈感分開，**不是真錢**。點壹下打開賭場。", label: "怎麼拿到", how: ["在**牌桌**贏牌", "開**大禮包**（每天有免費的）", "輸光了可以找 **Yuga** 借"] },
  poss: { title: "可能性", what: "你現在做得出多少種佩佩。", label: "怎麼變多", how: ["到**手作坊**解鎖新的選項"] },
  own: { title: "收藏", what: "你做過的佩佩有幾種。" },
  jobs: { title: "委託", what: "今天還沒交的委託。點壹下到委託櫃台。", label: "交委託可以拿到", how: ["靈感", "理智"] },
};

export const ROOM_HINTS3 = {
  fusion: "融合室：兩隻佩佩，生出第三隻。",
  office: "館長室：花靈感，把博物館升級。",
  cellar: "地下收藏庫：往下的樓梯。帶三隻佩佩一起去。",
  casino: "Hamachi 賭場：荷官 Yuga Bot 在等你。21 點、大禮包、餐車，籌碼不是真錢。",
};

// ----- 禁書的續集（翊文 11-08：「像這種書本可以有續集來讓玩家解開」） -----
// after：讀過哪壹本才看得到；need：怎麼解開（logic3.js 的 sequelCondition；idleOrigin、codexBeyond 是畫面那邊打開的）
// hint：書架上那本蓋著的書，點了會寫的提示。書裡 [[字|動作]] 是可以點的字（動作在 ui_screens1.js 的 BOOK_ACTIONS）
export const BOOK_SEQUELS = [
  { id: "book1b", after: "book1", need: "idleOrigin", title: "佩佩起源考・補遺", spine: "起源考・補遺",
    hint: "上壹本的最後壹頁寫著「無」。在起源室裡，什麼都不做，也是壹種考證。（不要點滑鼠、不要按鍵盤，靜靜地等；書架上這本會越來越亮）",
    lines: ["補遺只有壹頁。", "作者寫：「我什麼都沒做，佩佩就來了。」", "他在頁尾畫了壹個[[圈|void]]，圈裡什麼都沒有。", "你看了很久，覺得圈裡有東西也在看你。"],
    san: "1/1D6", myth: 2, successAside: "(你決定那個圈只是墨水)", failAside: "(你發現自己也在桌上畫了壹個圈)" },
  { id: "book2b", after: "book2", need: "gopnikSquat", title: "莫斯科手記・第九年", spine: "第九年",
    hint: "窗外那壹隻：俄國8+9、斯拉夫蹲。你做得出來嗎？",
    lines: ["第九年，作者不照鏡子了。", "他在[[窗|window]]邊放了壹張小板凳。", "早上，窗外的佩佩沒有來。", "作者低頭看，自己的腳跟貼著地。"],
    san: "1D3/1D8", myth: 3, successAside: "(你把腳跟抬了起來。抬得起來)", failAside: "(你試著把腳跟抬起來。抬不起來)" },
  { id: "book2c", after: "book2b", need: "hallGopnik", title: "莫斯科手記・第十年", spine: "第十年",
    hint: "第十年，窗外不只壹隻。把展廳的每壹個展台，都擺上俄國8+9。",
    lines: ["第十年，窗外蹲滿了佩佩。", "牠們排成壹排，像在等公車。", "作者打開窗，牠們壹起說了壹句話。", "書到這裡就沒了，只剩壹段[[聽不懂的節奏|beat]]。"],
    san: "1D4/1D10", myth: 3, successAside: "(你沒有跟著打拍子。這次沒有)", failAside: "(你已經跟著打了好壹會兒拍子)" },
  { id: "book3b", after: "book3", need: "codexBeyond", title: "圖鑑之外・下壹格", spine: "下壹格",
    hint: "去圖鑑室的牆上，找最後壹格的下壹格。（《圖鑑之外》裡的「圖鑑牆」可以點）",
    lines: ["你找到了那壹格。", "格子裡的佩佩戴著帽子，[[帽子|hat]]在動。", "牠把帽子拿下來，戴在你頭上。", "現在，帽子在你頭上動。"],
    san: "1D4/1D10", myth: 4, successAside: "(你把帽子拿下來了。你以為)", failAside: "(帽子很合。太合了)" },
  { id: "book4b", after: "book4", need: "cellarEnd", title: "地下收藏目錄・最後壹號", spine: "最後壹號",
    hint: "目錄的最後壹號在最下面。走到地下收藏庫的最底層。",
    lines: ["最後壹號沒有編號。", "說明欄寫著：「館長本人」。", "照片是空的。照片的框，是壹面[[鏡子|mirror]]。", "你在鏡子裡看見了編號。"],
    san: "1D3/1D8", myth: 3, successAside: "(你沒有念出那個編號)", failAside: "(你念出了那個編號。是你的)" },
];

// ----- 看懂檢定：看懂了什麼（翊文 11-08：「有沒有告訴你看懂了什麼？的故事線？」） -----
// 壹次掉 5 點以上、看懂檢定又成功時，會先看到這壹句，再發作。看懂過的記在起源室的《看懂的事》，照下面的順序排，拼起來是壹條故事線。
// id：展品 id（strange…）、書的 id（book1…）、cellar1–5（地下收藏庫第幾層）、fusion（融合）、push（孤注壹擲）。
// from：記在《看懂的事》裡時寫「來自哪裡」。text 不用寫「你看懂了：」，畫面會自己加。
export const UNDERSTAND_TEXT = [
  { id: "book1", from: "《佩佩起源考》", text: "作者訪問的 1,000 隻佩佩，說的都是同壹句話。最後壹頁那個「無」，是他照抄下來的。" },
  { id: "book1b", from: "《佩佩起源考・補遺》", text: "圈裡什麼都沒有，所以什麼都可能在裡面。佩佩就是從那裡出來的。" },
  { id: "strange", from: "壹幅奇怪的繪畫", text: "車裡那名祭司，是第壹位收藏者。他沒有搬去莫斯科。他是被載去的。" },
  { id: "book2", from: "《莫斯科手記》", text: "作者在鏡子裡看到的，就是窗外那隻。他們壹直是同壹個。" },
  { id: "book2b", from: "《莫斯科手記・第九年》", text: "腳跟貼地不是壹種姿勢，是壹種承諾：不會再離開。" },
  { id: "book2c", from: "《莫斯科手記・第十年》", text: "那段節奏是八下，停壹下，再九下。地下的水閘，也是這樣敲的。" },
  { id: "statue", from: "雕像", text: "雕像不是在吐。牠是在把吞下去的可能性，壹隻壹隻吐回這個世界。" },
  { id: "hidden", from: "蓋著白布的小神像", text: "神像的每壹隻眼睛，都是壹位參觀者。最新的那隻，剛剛睜開。" },
  { id: "book3", from: "《圖鑑之外》", text: "圖鑑牆的最後壹格不是空的。是留給你的。" },
  { id: "book3b", from: "《圖鑑之外・下壹格》", text: "帽子不是戴在頭上的東西，是住在頭上的東西。牠選了你。" },
  { id: "fusion", from: "融合室", text: "融合不是把兩隻變成壹隻，是把壹隻借給另壹隻。借了，就還不回來。" },
  { id: "push", from: "孤注壹擲", text: "骰子記得你每壹次重擲。牠們在數。" },
  { id: "cellar1", from: "地下收藏庫 B1", text: "灰塵上的小腳印，是你做出來的佩佩留下的。牠們晚上會下來。" },
  { id: "cellar2", from: "地下收藏庫 B2", text: "白布底下的雕像，都是以前的參觀者。他們只是站得太久了。" },
  { id: "cellar3", from: "地下收藏庫 B3", text: "畫框裡的畫沒有被偷走。是牠們自己走下來的。" },
  { id: "book4", from: "《地下收藏目錄》", text: "地下的每壹件，都是樓上「差壹點就做出來」的佩佩。有幾件是你的。" },
  { id: "cellar4", from: "地下收藏庫 B4", text: "水是溫的，因為那是每壹位參觀者流過的眼淚，壹人壹點。" },
  { id: "russia8", from: "俄國8+9 的房間", text: "牠不是在等你蹲下來。牠是在替還沒出生的佩佩守門。" },
  { id: "cellar5", from: "地下收藏庫 B5", text: "這裡就是「無」。《佩佩起源考》的最後壹頁，寫的就是這個房間。" },
  { id: "coop_dust", from: "合作地下：灰塵裡的小佩佩", text: "牠們晚上下來，是在找做出牠們的人。找到了也不會說。" },
  { id: "coop_statue", from: "合作地下：站太久的參觀者", text: "他們不是不想走。他們在等後面的人先走。" },
  { id: "coop_frame", from: "合作地下：畫框裡走下來的", text: "畫不是被看的東西。是看你的東西。" },
  { id: "coop_water", from: "合作地下：水閘後面的那隻", text: "牠數到八，停壹下，再數九。牠在等第十七個人。" },
  { id: "coop_hat", from: "合作地下：住在帽子裡的", text: "你以為你在挑帽子。" },
  { id: "coop_none", from: "合作地下：什麼都沒有", text: "你們壹起走到這裡，發現這裡什麼都沒有。那剛剛是誰在跟著你們？" },
  { id: "book4b", from: "《地下收藏目錄・最後壹號》", text: "館長從來不是壹個人，是每壹位留下來的參觀者，輪流當。" },
];
// 不在上面的來源：隨機壹句（不記進《看懂的事》）
export const UNDERSTAND_FALLBACK = [
  "這間博物館，比它的地基還早。",
  "每壹個「可能」，都有壹隻佩佩在等著被做出來。",
  "佩佩沒有起源，因為佩佩就是起源。",
];

// ----- 起源室：第伍～捌章（翊文 11-08：「起源室的故事線可以長一點嗎」） -----
// need：怎麼打開（seen ＝在畫廊看過哪件展品；unlocks ＝解鎖幾個選項；understood ＝《看懂的事》看懂幾件；ending ＝走到任何壹個結局）
// lockHint：還沒打開時點書背會說的話。{圖鑑格數} 會換成真正的格數。
export const MORE_CHAPTERS = [
  {
    id: 5, title: "第伍章　莫斯科", spine: "莫斯科",
    need: { seen: "russia8" }, lockHint: "推開寫著「8+9」的那扇門之後，這壹章會亮起來。",
    pages: [
      "第壹位收藏者離開那天，\n門口停著乙輛賓士。\n車上坐著幾位祭司。",
      "他們說：上車吧。\n有壹隻佩佩在莫斯科等你，\n已經等了很久。",
      "莫斯科很冷。\n公寓樓下蹲著壹隻佩佩，穿著運動服，\n往旁邊挪了挪，讓出壹個位子。",
      "腳跟貼地很難。\n他練了八年。\n第九年，他終於蹲穩了。",
      "那天晚上他照了鏡子。\n鏡子裡蹲著的，是窗外那隻。\n窗外蹲著的，是他。",
      "他寄了壹張明信片回博物館，沒有署名：\n「牠看起來很想回家，但家在莫斯科。」\n(你好像在委託櫃台看過這張明信片)",
    ],
  },
  {
    id: 6, title: "第陸章　白布", spine: "白布",
    need: { seen: "hidden" }, lockHint: "在畫廊看過蓋著白布的小神像之後，這壹章會亮起來。",
    pages: [
      "開館第壹天，只來了壹位參觀者。\n他在小神像前站了很久。\n隔天早上，神像多了壹隻眼睛。",
      "第二天來了兩位。\n第三天，神像有了六隻眼睛。\n館方替牠蓋上了白布。",
      "白布沒有用。\n守夜的警衛說，晚上聽得到布底下，\n有很多眼睛壹起眨。",
      "後來大家才知道，\n每壹隻眼睛，都是壹位看過佩佩的人。\n看得越久，那隻眼睛就越亮。",
      "最亮的那隻在正中間。\n牠從來不眨眼。\n沒有人知道那是誰的。",
      "你回想自己在畫廊站了多久。\n(你覺得後腦有點癢)",
    ],
  },
  {
    id: 7, title: "第柒章　帳本", spine: "帳本",
    need: { unlocks: 10 }, lockHint: "解鎖 10 個選項之後，這壹章會亮起來。",
    pages: [
      "會計數完了圖鑑牆，\n又往下數。\n{圖鑑格數} 的下壹格，不在牆上。",
      "他在禁書架前坐了七天，\n把每壹本都讀了兩遍。\n第七天，他闔上最後壹本，說：原來是這樣。",
      "他沒有說是怎樣。\n他把算盤留在櫃台上。\n算盤最後壹顆珠子，是壹隻很小的佩佩。",
      "警衛最後壹次看到他，\n是在往地下的樓梯口。\n他抱著壹本目錄，說要下去對帳。",
      "後來有人發現，\n《地下收藏目錄》的筆跡，\n跟會計的帳本壹模壹樣。",
      "帳本的最後壹行寫著：\n「收支平衡。多出來的那壹隻，記在新館長的帳上。」\n(你決定先不要去翻那本帳)",
    ],
  },
  {
    id: 8, title: "第捌章　名牌", spine: "名牌",
    need: { understood: 6, ending: true }, lockHint: "在《看懂的事》裡看懂 6 件事，或走到任何壹個結局之後，這壹章會亮起來。",
    pages: [
      "櫃台上那串鑰匙還在。\n名牌還是空白的。\n旁邊那支筆，墨水是新的。",
      "你數了數館裡的佩佩，\n比你做過的還多壹隻。\n多出來的那隻，蹲在櫃台後面看你。",
      "你想起第壹位收藏者畫的那個圓。\n你也在紙上畫了壹個。\n圓裡什麼都沒有，所以什麼都可能有。",
      "每壹位館長，都在這裡停過。\n收藏者、會計，還有很多你不知道名字的人。\n他們都沒有寫下自己的名字。",
      "後來你才發現，\n名牌上的名字，從來不是自己寫的。\n是上壹位館長，替下壹位寫的。",
      "你拿起筆。\n你還沒決定要寫誰的名字。\n佩佩已經坐在那裡等著了。\n(你感到被期待)",
    ],
  },
];

// ----- 第 4 版：參觀者一位接一位（翊文 11-08，roguelike 的繼承；規則在 shared/legacy.js） -----
// 小優點、小缺點。{欄位名} 會換成 config.js 的 PERKS、FLAWS 裡的數字（不用帶正負號，字裡寫「多」「少」）；{from}、{to} ＝原本和改了之後。
// 都是 Claude 的草稿，Yuga 可以改。
export const TRAIT_TEXT = {
  // 小優點
  deft: { name: "手巧", desc: "做抱枕有 {pillowFree}% 不花靈感。" },
  sweet: { name: "嘴甜", desc: "交委託多拿 {deal} 靈感。" },
  thrifty: { name: "精打細算", desc: "融合少花 {fusion} 靈感（{from} → {to}）。" },
  strong: { name: "力氣大", desc: "地下收藏庫的隊伍強度 +{power}。" },
  quick: { name: "學得快", desc: "技能成長的時候，多長 {growth} 點。" },
  lucky: { name: "好運", desc: "開場心情 +{mood}。" },
  allround: { name: "多才多藝", desc: "拿手以外的技能，起點都 +{others}。" },
  nimble: { name: "手腳俐落", desc: "在地下收藏庫受傷的隊員，早 {injure} 天好（{from} → {to} 天）。" },
  // 小缺點
  darkfear: { name: "怕黑", desc: "在地下收藏庫扣理智時多扣 {cellarSan} 點；但看懂檢定 +{understand}，看懂得比較快。" },
  haggler: { name: "不會講價", desc: "交委託少拿 {deal} 靈感（最少還是拿 1）。" },
  restless: { name: "坐不住", desc: "融合多花 {fusion} 靈感（{from} → {to}）。" },
  weak: { name: "沒力氣", desc: "地下收藏庫的隊伍強度 −{power}。" },
  slow: { name: "慢熱", desc: "技能成長的時候，少長 {growth} 點（最少還是 +1）。" },
  gloomy: { name: "悲觀", desc: "開場心情 −{mood}。" },
  clumsy: { name: "笨手笨腳", desc: "{skillName}的起點 −{skillAdj}。" },
  butter: { name: "手滑", desc: "在地下收藏庫受傷的隊員，晚 {injure} 天好（{from} → {to} 天）。" },
  insomnia: { name: "失眠", desc: "開場理智 −{sanity}（{from} → {to}）。" },
};
// 換人時的畫面（遺物、選職業之後抽小優缺點、館長室的歷任參觀者牆）。{x} 這種由畫面帶入。
export const LEGACY_TEXT = {
  leaveTitle: "{who}要走了", // {who} ＝「阿明（第 1 位參觀者）」，沒有名字是「第 1 位參觀者」（11-08）
  leaveSub: "走之前，留下壹樣東西給下壹位參觀者。",
  relic: "留下壹件收藏當遺物",
  relicDesc: "放進館長室的遺物櫃，寫著「{who}留下的」。下壹位開場心情 +{mood}。",
  relicDescNoMood: "放進館長室的遺物櫃，寫著「{who}留下的」。",
  relicNone: "收藏裡還沒有東西。",
  relicPick: "挑壹件要留下的",
  relicEmpty: "（還沒挑）",
  relicHint: "點壹件；收藏不會少",
  relicOk: "就留這件",
  skill: "把最拿手的技能傳下去",
  skillDesc: "你的「{skill}」是 {value}。下壹位的{skill}起點 +{plus}。",
  none: "什麼都不留",
  back: "回上壹步",
  // 每一位參觀者都從 6 個職業自己選，選好再抽一個小優點、一個小缺點（11-08 翊文：「6 個職業自己選，再抽優缺點」，決定 0028；以前換人時是從 3 位候選人挑）
  drawNote: "選好職業之後，會抽壹個小優點、壹個小缺點。抽到就定了，不能重抽。",
  drawTitle: "抽到的小優點、小缺點",
  drawSub: "{who}是{job}。抽到就定了，不能重抽；館長室的名片上隨時看得到。",
  drawOk: "知道了",
  drawLegacy: "前壹位留下的",
  drawDone: "{who}是{job}。小優點「{perk}」、小缺點「{flaw}」：館長室的名片上看得到。",
  perk: "小優點",
  flaw: "小缺點",
  gotRelic: "{who}留下了「{name}」：開場心情 +{mood}",
  gotRelicNoMood: "{who}留下了「{name}」",
  gotSkill: "{who}把「{skill}」傳下來了：起點 +{plus}",
  relics: "遺物櫃",
  relicLabel: "{who}留下的",
  wallHint: "點壹張卡片，看這位參觀者的詳細。",
  now: "現在",
  empty: "你是第 {x} 位參觀者。前面還沒有人。",
  // 退休換人（11-08 翊文：「好，加些其他的」，決定 0025）
  endEnding: "看完「{ending}」，退休了。",
  endRetire: "自己決定退休了。",
  retireBtn: "退休，換下壹位",
  stayBtn: "繼續當參觀者",
  retireAsk: "{who}要退休嗎？會掛上歷任參觀者牆，位子空出來給下壹位，走之前可以留下壹樣東西。退休了就不能回來。",
  retireYes: "退休",
  retireNo: "再想想",
  officeTitle: "退休",
  officeDesc: "不用等到理智用完，也可以讓這位參觀者退休：掛上歷任參觀者牆，留下壹樣東西給下壹位，在同壹個位子換人。收藏、靈感都留在館裡。",
  officeBtn: "讓這位參觀者退休",
  officeAsk1: "要讓{who}退休嗎？職業、技能、理智、怪癖都會跟著走，收藏和靈感留在館裡。",
  officeAsk2: "真的嗎？{who}退休了就不能回來。",
  notDark: "燈熄了，要先走進那扇門。",
  notBout: "正在發作，等發作過去再說。",
  notCellar: "還在地下收藏庫，先上來。",
  notPicking: "還沒挑職業。",
  notNew: "剛來沒多久，再過 {x} 天才能退休。",
  retired: "{who}退休了。",
};
// 多位參觀者（11-08 翊文：「玩家可以選擇和命名多個參觀者」，決定 0018）：標題畫面的三個位子、取名字、改名字。
// {x} ＝數字；{name} ＝玩家取的名字；{max} ＝名字最多幾個字（config.js 的 LEGACY.nameMax）
export const VISITOR_TEXT = {
  slotsTitle: "館裡的參觀者",
  slotsSub: "最多 {x} 位，共用同壹間博物館：收藏、靈感、解鎖是大家的；理智、心情、職業是每位自己的。",
  cont: "繼續參觀",
  add: "新參觀者",
  rename: "改名字",
  empty: "空位子",
  emptySub: "可以再請壹位參觀者進來，用同壹間博物館。",
  picking: "還在門口，還沒挑職業",
  dark: "燈熄了：要走進那扇門",
  last: "上次玩的",
  here: "也在館裡",
  firstSub: "幫你的第壹位參觀者取個名字（最多 {max} 個字）。接著擲心情、選職業，再抽壹個小優點、壹個小缺點。",
  addSub: "幫這位參觀者取個名字（最多 {max} 個字）。接著擲心情、選職業，再抽壹個小優點、壹個小缺點。",
  renameSub: "新的名字（最多 {max} 個字）。",
  placeholder: "例如：阿明",
  label: "名字",
  next: "下壹步",
  save: "改好了",
  cancel: "算了",
  errEmpty: "先取壹個名字。",
  errLong: "名字最多 {max} 個字。",
  errBad: "名字裡有看不見的字，換壹個試試。",
  // 理智歸零、退休換人時，新的那位還沒有名字：在選職業那一頁取（以前在挑候選人那一頁；key 的名字沒改，決定 0028）
  candName: "這位參觀者叫什麼名字？",
  candNameHint: "不填就叫「第 {x} 位參觀者」。之後在門口可以改。",
  renamed: "改好了：「{name}」。",
  full: "位子都滿了。",
};

// ----- 怪癖的治法：在 2 個不同的遊戲日各做壹次治法那件事，沒做的話壹週後自己消失（決定 0046；0027 是「做完壹件事、20 分鐘」） -----
// 翊文 11-09：「怪癖改留久一點，自動恢復要一週之類的，恢復要做事情兩天，這個引導讓使用者多切換不同參觀者，需要的話可以給提示」
// 得到怪癖時，從現在做得到的裡面抽壹件（shared/logic.js 的 pickQuirkTask）；換日時做不到了會改抽（retaskQuirks）。
//   act：要做的事；chip：狀態列上的短版；where：在哪個房間；hint：再說清楚壹點（{x} 換成不可怕的畫的名字）
export const QUIRK_TASK_TEXT = {
  hug: { act: "抱壹次抱枕", chip: "抱抱枕", where: "抱枕工作台", hint: "今天還沒抱過的抱枕都可以，按住抱壹下。" },
  deliver: { act: "交壹張委託", chip: "交委託", where: "委託櫃台", hint: "櫃台上哪壹張都可以，壹鍵交件也算。" },
  calm: { act: "看壹幅不可怕的畫", chip: "看不可怕的畫", where: "畫廊", hint: "不用理智檢定的畫都可以，例如{x}。" },
};
// 怪癖的進度、期限、提示換參觀者（決定 0046）。{n} {d} {act} {where} 由畫面帶入（數字來自 NUM.quirkTaskDays、NUM.quirkDays）
export const QUIRK_PLAN_TEXT = {
  plan: "要在 {n} 個不同的日子，各到{where}{act}（今天算壹天，不用連續；每天 05:00 換日）。",
  noTask: "現在沒有能做的治法，只能等它過去。",
  todayDone: "今天做過了，改天再做壹次就好。",
  todayDoneMore: "今天做過了，還要再 {need} 天。",
  need: "還要做 {need} 天。",
  chipToday: "今天做過了",
  chipNeed: "還要 {need} 天",
  left: "還有 {d} 天自己好",
  leftNote: "不做的話，還有 {d} 天自己好。",
  step: "「{name}」：今天算壹天了。{rest}",
  stepOne: "改天再{act}壹次就好。",
  stepMore: "還要再 {need} 天，每天{act}壹次。",
  retask: "「{name}」的治法換了：現在{to}（原本的{from}今天做不到）。",
  // 提示換參觀者：怪癖只留在這位身上，時間照樣在走（換人不用花任何東西）
  switchMany: "這段時間可以換別的參觀者玩：怪癖只在這位身上，時間照樣在走。換人不用花靈感，到門口選壹位就好。",
  switchNone: "這段時間可以招壹位新的參觀者來玩：到門口按「新參觀者」（最多 {slots} 位，共用同壹間博物館）。怪癖只在這位身上，時間照樣在走，不用花靈感。",
  btnMany: "去門口換參觀者",
  btnNone: "去門口招新參觀者",
};

// ---------- 第 4 版（11-09，決定 0030）：每日簽到、每週全簽到、節日。全部是草稿，Yuga 可以改 ----------
// 只有簽到拿得到的東西（config.js 的 LIMITED_ITEMS）：名字、哪壹類、說明、「馬上使用」的按鈕字
export const LIMITED_TEXT = {
  "hat-curator": { name: "館員帽", kind: "佩佩部件・帽子", desc: "深藍色的小帽子，帽簷壹圈金線，正中間蓋著壹個紅色的「簽」字印。只有每週全簽到拿得到。", use: "去手作坊戴上" },
  "hat-lantern": { name: "燈籠帽", kind: "佩佩部件・帽子", desc: "紅色的紙燈籠，底下垂著金色的流蘇，戴在頭上會輕輕晃。只有每週全簽到拿得到。", use: "去手作坊戴上" },
  "stand-velvet": { name: "紅絨緞帶", kind: "展台裝飾", desc: "酒紅色的絨布緞帶，掛在展廳每壹座展台的邊上，中間別著金色的小徽章。只是好看，不影響評分。", use: "掛到展台上" },
  "frame-vine": { name: "金藤名牌框", kind: "名牌框", desc: "金色藤蔓纏成的名牌框。展廳的館主名牌、館友名單上你的名字都會換上它。只是好看。", use: "換上名牌框" },
  "mat-star": { name: "星光絨", kind: "抱枕材料", desc: "深藍色的絨布，裡面織了細細的金線，做成抱枕會亮亮的。做壹個抱枕用掉壹份。", use: "去抱枕工作台用" },
  // 兌換所賣的限定頭飾（11-09，決定 0032）。名字、樣子都是草稿，Yuga 可以改
  "hat-rain": { name: "黃雨帽", kind: "佩佩部件・帽子", desc: "鮮黃色的雨帽，後面的帽簷特別長。下雨天地下室會用到。", use: "去手作坊戴上" },
  "hat-chef": { name: "廚師帽", kind: "佩佩部件・帽子", desc: "又高又蓬的白帽子，戴上去就覺得自己會做菜了。", use: "去手作坊戴上" },
  "hat-muff": { name: "毛耳罩", kind: "佩佩部件・帽子", desc: "毛茸茸的粉紅耳罩。寒流來的時候，低語也比較小聲。", use: "去手作坊戴上" },
  "hat-miner": { name: "礦工帽", kind: "佩佩部件・帽子", desc: "黃色的硬殼帽，前面有壹盞小燈。只是好看，照不亮地下。", use: "去手作坊戴上" },
  "hat-wreath": { name: "花環", kind: "佩佩部件・帽子", desc: "用小花編成的圈圈，放在頭頂上。花瓣不知道為什麼壹直不會謝。", use: "去手作坊戴上" },
  "hat-bow": { name: "蝴蝶結", kind: "佩佩部件・帽子", desc: "紅色的大蝴蝶結。招領箱裡撿來的，沒有人來領。", use: "去手作坊戴上" },
  "hat-pot": { name: "鐵鍋帽", kind: "佩佩部件・帽子", desc: "壹口小鐵鍋，握把朝旁邊。戴著走路會輕輕敲出聲音。", use: "去手作坊戴上" },
  "hat-paper": { name: "摺紙帽", kind: "佩佩部件・帽子", desc: "舊報紙摺的帽子，上面的字已經看不清楚了。", use: "去手作坊戴上" },
  // 主題展、每週特展的限定配件（決定 0035）。全部是草稿，Yuga 可以改
  "show-legend": { name: "傳說的金冠", kind: "佩佩部件・帽子", desc: "比皇冠高壹截，壹圈紅絨，五個尖角都頂著小金球。「傳說殿堂」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-angry": { name: "火氣頭帶", kind: "佩佩部件・帽子", desc: "紅色的頭帶，正中間壹小撮火。不燙，只是看起來很有意見。「憤怒之廳」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-tears": { name: "淚滴耳環", kind: "佩佩部件・首飾", desc: "兩滴不會乾的眼淚，掛在頭的兩邊。「淚之廳」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-russia8": { name: "瓜子項鍊", kind: "佩佩部件・首飾", desc: "壹顆壹顆瓜子串成的項鍊，中間那顆最大。吃掉就沒有了，所以沒有人吃。「俄國8+9 特展」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-rainbow": { name: "彩虹圍巾", kind: "佩佩部件・首飾", desc: "紅、綠、黃、黑四條。在佩佩的世界，這就是彩虹。「彩虹」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-hats": { name: "三層帽", kind: "佩佩部件・帽子", desc: "壹頂帽子上面壹頂帽子，上面又壹頂帽子。「帽子展」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-pillows": { name: "枕頭睡帽", kind: "佩佩部件・帽子", desc: "長長的條紋睡帽，尾巴上掛著壹顆小枕頭。「抱枕沙龍」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-joy": { name: "歡笑花環", kind: "佩佩部件・帽子", desc: "壹圈小花。中間那朵在笑，別的花看起來也快要笑了。「歡樂廳」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-flat": { name: "躺平眼罩", kind: "佩佩部件・帽子", desc: "推到頭上的眼罩，上面繡著兩條閉著的眼睛。「躺平區」辦到金才拿得到。", use: "去手作坊戴上" },
  "show-failed": { name: "縫過的領結", kind: "佩佩部件・首飾", desc: "歪壹邊的領結，有壹條看得出來的縫線。「失敗作回顧展」辦到金才拿得到。", use: "去手作坊戴上" },
  "week-allBlack": { name: "黑絨領結", kind: "佩佩部件・首飾", desc: "黑絨做的領結，中間壹顆金色的小釘。每週特展「黑色週」到金才拿得到。", use: "去手作坊戴上" },
  "week-pillowWeek": { name: "小枕頭髮夾", kind: "佩佩部件・帽子", desc: "夾在頭上的小枕頭。真的軟的。每週特展的抱枕週到金才拿得到。", use: "去手作坊戴上" },
  "week-gopnikWeek": { name: "金瓜子項鍊", kind: "佩佩部件・首飾", desc: "瓜子項鍊的金色款。每週特展的 8+9 週到金才拿得到。", use: "去手作坊戴上" },
};
// 兌換所的裝備（11-09，決定 0032）：{n} 換成 config.js 的數字。名字、說明都是草稿
export const GEAR_TEXT = {
  magnifier: { name: "放大鏡", desc: "偵查檢定 +{n}。" },
  coin: { name: "幸運銅板", desc: "幸運檢定 +{n}。" },
  apron: { name: "圍裙", desc: "做抱枕有 {n}% 不花靈感。" },
  abacus: { name: "算盤", desc: "交委託多拿 {n} 靈感。" },
  amulet: { name: "護身符", desc: "看懂檢定的機率低 {n}（比較不會看懂，也就比較不會發瘋）。" },
  gloves: { name: "搬運手套", desc: "地下收藏庫的隊伍強度 +{n}。" },
  lamp: { name: "探險燈", desc: "在地下收藏庫扣理智時少扣 {n} 點（最少還是扣 1 點）。" },
  notebook: { name: "學習筆記", desc: "換日的技能成長多長 {n} 點。" },
};
// 兌換所上的字
export const SHOP_TEXT = {
  title: "兌換所",
  tiers: { common: "普通", fine: "精良", rare: "稀有" },
  why: "週章是做完每週任務拿的，不會過期。這裡可以換裝備、提升技能、買這週限定的頭飾。",
  gearWhy: "裝備放在博物館，換人還在，三位參觀者都可以穿；現在這位最多穿 {n} 件。",
  skillWhy: "只有現在這位參觀者會變強（技能跟著人走）；技能越高越貴，最多到 {cap}。",
  limitedWhy: "這週上架的限定頭飾，下週壹 05:00 換壹批。不算進「全部解鎖」，另外算限定收藏。",
  matWhy: "背包裡的舊畫布、金箔、金線，每 {n} 份（哪壹種都算）換壹枚週章。",
  lessonWhy: "老主顧輪流來教你壹招：花靈感，指定壹個技能 +{dice}。壹天 {n} 堂，技能越高越貴，最多上到 {cap}。",
  trialWhy: "每壹間考壹個技能，用下面挑好的 3 隻進去，只走那壹間。過了，那個技能 +{dice}；壹間壹週可以拿 {n} 次。沒過可以再試，但會掉理智、可能受傷。",
};
// 地下的試煉房間（11-09，決定 0032）：跟 CELLAR 的房間一樣的格式，多一個 skill（過了哪個技能成長）。
// 強度門檻照樓層（B1 11–13、B2 15–16、B3 17–19）。沒有 type none 的選項：不挑戰就過不了。過了不給靈感、不回理智，只給技能成長（NUM.shop.trialSkill）。
export const TRIAL_ROOMS = [
  { id: "t:look", floor: 1, skill: "偵查", title: "兩幅壹樣的畫", intro: "試煉房間：眼力。",
    lines: ["牆上掛著兩幅壹模壹樣的佩佩。", "牌子上寫：「找出哪裡不壹樣，我就教你。」"],
    choices: [
      { label: "壹格壹格比對", check: { type: "skill", skill: "偵查", mod: 0 }, success: { text: "右邊那隻少了壹根睫毛。你的眼睛好像變利了。" }, fail: { text: "看到眼睛發痠，牠們好像在對你眨眼。", san: "1D2" } },
      { label: "把畫搬到燈下看", check: { type: "power", target: 12 }, success: { text: "燈壹照，破綻就出來了。你記住了該看哪裡。" }, fail: { text: "畫框比想像中重，砸到腳了。", injure: true } },
    ] },
  { id: "t:stitch", floor: 1, skill: "手工藝", title: "沒縫完的抱枕", intro: "試煉房間：手藝。",
    lines: ["工作台上有壹個縫到壹半的抱枕，針還插在上面。", "線頭自己動了壹下，像在等你。"],
    choices: [
      { label: "接著縫完", check: { type: "skill", skill: "手工藝", mod: 0 }, success: { text: "最後壹針收得漂亮。抱枕滿意地癱軟下來。" }, fail: { text: "針腳歪得像在尖叫，你不敢再看。", san: "1D2" } },
      { label: "壓住亂動的線頭", check: { type: "power", target: 11 }, success: { text: "按住了。你學會了線頭的脾氣。" }, fail: { text: "線纏上來，有壹隻被絆倒了。", injure: true } },
    ] },
  { id: "t:gaze", floor: 2, skill: "鑑賞", title: "沒有署名的畫", intro: "試煉房間：眼光。",
    lines: ["三幅畫，只有壹幅是真跡。", "另外兩幅在你轉頭的時候，好像換了位置。"],
    choices: [
      { label: "看筆觸認真跡", check: { type: "skill", skill: "鑑賞", mod: -5 }, success: { text: "你指對了。另外兩幅默默把臉轉過去。" }, fail: { text: "你指錯了，三幅畫壹起笑了出來。", san: "1D3" } },
      { label: "盯到它先移開視線", check: { type: "san", spec: "1/1D4" }, success: { text: "它先移開了。你懂得看畫的人也會被看。" }, fail: { text: "你先移開了，後頸涼涼的。" } },
    ] },
  { id: "t:cups", floor: 2, skill: "幸運", title: "三個倒扣的杯子", intro: "試煉房間：手氣。",
    lines: ["桌上三個倒扣的杯子，其中壹個底下有東西在動。", "沒有人叫你選，可是你知道得選壹個。"],
    choices: [
      { label: "憑感覺掀壹個", check: { type: "skill", skill: "幸運", mod: 0 }, success: { text: "底下是壹顆骰子，六點朝上。你覺得今天手很順。" }, fail: { text: "杯子底下的東西摸了你壹下。", san: "1D3" } },
      { label: "三個壹起掀開", check: { type: "power", target: 15 }, success: { text: "全部掀開，牠逃不掉。你摸清了牠的習慣。" }, fail: { text: "杯子飛起來砸中隊伍。", injure: true } },
    ] },
  { id: "t:plate", floor: 3, skill: "神秘學", title: "念不出來的門牌", intro: "試煉房間：學問。",
    lines: ["門牌上的字，每次看都不壹樣。", "門後有人小聲地跟著你念。"],
    choices: [
      { label: "照古書的念法念", check: { type: "skill", skill: "神秘學", mod: -5 }, success: { text: "你念對了。門後的聲音滿意地安靜下來。" }, fail: { text: "念到壹半，舌頭不是你的了。", san: "1D4" } },
      { label: "閉上眼睛跟著念", check: { type: "san", spec: "1/1D6" }, success: { text: "你聽懂了壹點點，不多，剛剛好。" }, fail: { text: "你念了很久才發現門牌在念你。" } },
    ] },
  { id: "t:guard", floor: 3, skill: "說服", title: "不肯開門的守衛", intro: "試煉房間：口才。",
    lines: ["壹尊石膏佩佩擋在門口。", "牠說今天不開放，明天也不開放。"],
    choices: [
      { label: "跟牠講道理", check: { type: "skill", skill: "說服", mod: 0 }, success: { text: "牠想了很久，往旁邊挪了壹步。你學到了講話的節奏。" }, fail: { text: "你講到壹半，牠把你的話再講壹次給你聽。", san: "1D3" } },
      { label: "硬把牠搬開", check: { type: "power", target: 18 }, success: { text: "搬開了。牠還在念，不過你已經聽懂牠怕什麼。" }, fail: { text: "石膏比你想的還重，有壹隻被壓到。", injure: true } },
    ] },
];
// 每週排行榜（決定 0039，shared/board.js）。公告和遊戲裡共用。都是草稿，Yuga 可以改。
// 只寫大家都看得到的東西：不提還沒開放的劇情、不提理智、怪癖、靈感。提醒要鼓勵，不點名誰最後。emoji 放在 board.js（這個檔不放 emoji）
export const BOARD_TEXT = {
  title: "佩佩博物館2　本週榜單",
  period: "本週館內統計已結算（{x}），榜單張貼如下。",
  first: "這是第壹份榜單，還沒有上週可以比，「圖鑑累積」列的是到目前為止的收藏。",
  tipsHead: "館長室的建議",
  nudgesHead: "給館友的小提醒",
  sign: "館長室 敬啟",
  fullNote: "簽滿 {x} 天",
  tips: {
    show: "本週有主題展再撐 1 天就辦完，牆上的主題先別換。",
    cellarRoom: "這週大家地下走得不多。B{x} 新開了房間，可以下去看看。",
    cellar: "這週大家地下走得不多。地下的試煉房間每週都能再挑戰，可以下去看看。",
    stamps: "週章存到 {x} 枚可以換第壹件裝備，到選單的「兌換所」看看。",
    sign: "週壹簽起，簽滿 {x} 天有特別項目可以拿。",
    books: "起源室書架的「每週劇情」頁籤，過了那週也能補讀。",
    codex: "手作坊換個顏色或帽子，圖鑑就可能多壹格。",
    hall: "展廳同壹個主題掛滿 {x} 天、分數夠高，就算辦完壹場展。",
    visit: "逛逛館友的展廳，可能學到對方拿手的技能。",
    tasks: "每週任務做完壹個拿 {x} 枚週章，週章不會過期。",
  },
  nudges: {
    sign: "只差 {x} 天就全勤了，新的壹週再挑戰！",
    show: "的主題展再撐 1 天就辦完，加油！",
    stamps: "再 {x} 枚週章就能換第壹件裝備。",
    deep: "這週走到了 B{x}，比之前更深，恭喜！",
  },
  // 遊戲裡的畫面
  panel: "本週榜單",
  panelLabel: "本週榜單（只有館友看得到）",
  panelPeriod: "統計期間：{x}（週壹 05:00 換週）",
  panelFirst: "這是第壹份榜單，還沒有上週可以比。",
  panelLoading: "正在讀榜單……",
  panelNone: "第壹份榜單還沒貼出來。每週壹早上 5 點多會張貼上壹週的榜單。",
  panelEmpty: "這週還沒有人上榜。下週壹早上再來看看。",
  panelError: "讀不到榜單，等壹下再打開看看。",
  panelLogin: "登入之後才看得到榜單。",
  panelWhere: "榜單只有館友看得到，每週也會貼到館友的 Discord 頻道。",
};
// 簽到卡、簽到日曆上的字
export const SIGNIN_TEXT = {
  title: "今天的簽到",
  sign: "蓋章簽到",
  signed: "今天簽過了",
  why: "每天第壹次進館蓋壹個章。照累計第幾次給東西，七天壹輪；斷了也不會重來。",
  week: "這週（週壹 05:00 到下週壹 05:00）七天都簽到，可以拿這週的特別項目。",
  weekDone: "這週七天都簽到了！",
  freeMode: "自由模式不用簽到：回到挑戰模式再來蓋章。",
  calendar: "簽到日曆",
  useNow: "馬上使用",
  dup: "這個已經有了，換成靈感",
  limitedNote: "限定的東西不算進「全部解鎖」，另外算。",
};
// 節日（shared/holidays.js 的 HOLIDAY_INFO）：名字、節日的話（館方的口吻，之後每週劇情可以拿來用）、公告多寫的、那天畫廊的藝術品
// art 照 HOLIDAY_INFO 的 art 順序：title（標題）、lines（說明牌），可以加 successAside、failAside（看完的旁白）
export const HOLIDAY_TEXT = {
  newyear: { name: "元旦", words: "新的壹年開館了。館長在大門口掛了壹串金色的紙花，說今年的佩佩會更多。", notice: ["大廳的燈換成金色的，櫃台多放了壹盤糖。"],
    art: [{ title: "新年的稀有佩佩", lines: ["帥佩佩圖的旁邊，飄滿了金色的紙花。", "館員說，這是每年第壹天才掛出來的那壹幅。"] }] },
  spring: { name: "春節", days: ["除夕", "初壹", "初二", "初三", "初四", "初五"], words: "過年了。館門口貼了春聯，大廳飄著年糕的味道，連展櫃裡的佩佩看起來都比較開心。", notice: ["除夕到初五每天都是節日，每天簽到都有節日的那壹份。"],
    art: [{ title: "貼著春聯的肖像", lines: ["普通的佩佩肖像兩邊，有人貼了壹副春聯。", "上聯寫「佩佩年年有」，下聯寫「靈感日日來」。"] },
      { title: "掛著燈籠的小雕像", lines: ["大理石的小青蛙頭上，掛著壹盞紅燈籠。", "燈籠沒有點火，卻好像有壹點暖暖的光。"] }] },
  lantern: { name: "元宵節", words: "正月十五，館裡掛滿了燈籠。燈謎寫在燈籠底下，猜中了館員會偷偷多給你壹顆湯圓。", notice: ["畫廊的燈籠下面有燈謎，答案不用寫下來，心裡知道就好。"],
    art: [{ title: "燈籠下的肖像", lines: ["肖像上方垂下兩盞燈籠，光照在佩佩的臉上。", "燈籠下面掛著壹張燈謎：「有眼睛，有嘴巴，不在任何壹個地方。」"] }] },
  peace: { name: "和平紀念日", words: "今天是和平紀念日。館裡安靜壹點，燈光照常。" }, // 紀念日：只在日曆上標出來，沒有公告、外觀、獎勵、藝術品
  children: { name: "兒童節", words: "兒童節。館員在展廳綁了幾顆氣球，小朋友可以在手作坊多待壹下。", notice: ["展廳的氣球不會破，可以放心靠近。"],
    art: [{ title: "綁著氣球的稀有佩佩", lines: ["畫框的角上綁了三顆氣球。", "畫裡的佩佩好像想伸手去抓。"] }] },
  qingming: { name: "清明節", words: "清明。窗外的柳樹發了新芽，館裡的人說話都放輕壹點，想念該想念的人。", notice: ["今天館裡的音樂照常，只是燈光柔壹點。"],
    art: [{ title: "柳枝與肖像", lines: ["肖像的畫框上插了壹枝柳條。", "葉子還是綠的，像剛從外面帶進來。"] }] },
  labor: { name: "勞動節", words: "勞動節。館員們輪流休息，櫃台上多了壹壺茶，誰經過都可以倒壹杯。", notice: ["委託櫃台照常開，只是館員泡茶的時間比較長。"],
    art: [{ title: "休息中的肖像", lines: ["肖像前面放了壹杯冒著熱氣的茶。", "說明牌寫著：今天畫裡的佩佩也放假。"] }] },
  duanwu: { name: "端午節", words: "端午節。館裡掛了艾草，展櫃旁多了壹串粽子。中午立蛋的人排到了門口。", notice: ["粽子是展品，不能吃；要吃的請到櫃台問。"],
    art: [{ title: "粽子旁的小雕像", lines: ["大理石的小青蛙腳邊，放著兩顆粽子。", "粽葉是真的，綁粽子的繩子打了壹個很漂亮的結。"] }] },
  qixi: { name: "七夕", words: "七夕。天黑以後，展廳的天窗剛好看得到兩顆星星，館員說牠們壹年只見壹次。", notice: ["展廳的天窗今天打開，看星星不用買票。"],
    art: [{ title: "星橋下的稀有佩佩", lines: ["畫的上方多了兩顆亮亮的星星，中間有壹條細細的光。", "佩佩抬頭看著，好像在等誰。"] }] },
  ghost: { name: "中元節", words: "中元節。館外的水溝邊放了壹排水燈，晚上走廊特別安靜，最好不要回頭。", notice: ["今天的節日特展有壹幅要擲理智，怕的話看別的就好。"],
    art: [{ title: "水燈前的肖像", lines: ["肖像下方漂著壹盞蓮花水燈。", "你數了數水面上的燈影，好像比燈多了壹個。"], successAside: "(你決定不再數了)", failAside: "(你又數了壹次，還是多壹個)" }] },
  midautumn: { name: "中秋節", words: "中秋節。館長在屋頂架了望遠鏡，大家排隊看月亮，烤肉的味道從後門飄進來。", notice: ["屋頂晚上開放，記得穿外套。"],
    art: [{ title: "月下的稀有佩佩", lines: ["畫的右上角多了壹輪滿月。", "仔細看，月亮上好像也蹲著壹隻圓圓的青蛙。"] },
      { title: "賞月的小雕像", lines: ["大理石的小青蛙抬著頭，頭上是壹輪滿月。", "雕像的眼睛被磨得特別亮，像是看月亮看了很久。"] }] },
  teacher: { name: "教師節", words: "教師節。館員在起源室多放了壹疊書，謝謝每壹位教過我們東西的人。", notice: ["起源室的書可以慢慢看，不會有人催。"],
    art: [{ title: "讀書的肖像", lines: ["肖像前面攤開了壹本書。", "書頁上的字你壹個都看不懂，但你覺得那是好話。"] }] },
  national: { name: "國慶日", words: "國慶日。晚上遠遠看得到煙火，館裡的人都跑到窗邊去看。", notice: ["晚上的煙火從展廳的窗戶看得最清楚。"],
    art: [{ title: "煙火下的稀有佩佩", lines: ["畫的天空開了幾朵煙火。", "顏色跟佩佩身上的壹模壹樣。"] }] },
  chongyang: { name: "重陽節", words: "重陽節。館裡擺了幾盆菊花，館長說今天適合爬樓梯，地下收藏庫的樓梯也算。", notice: ["今天走樓梯的人，館長會在旁邊拍手。"],
    art: [{ title: "菊花旁的肖像", lines: ["肖像旁邊擺了壹盆黃色的菊花。", "花瓣壹片壹片數下去，剛好九片。"] }] },
  dongzhi: { name: "冬至", words: "冬至。天黑得早，館員煮了壹大鍋湯圓。吃了湯圓就大壹歲，佩佩也是。", notice: ["湯圓有紅有白，壹人兩碗為限。"],
    art: [{ title: "湯圓旁的小雕像", lines: ["大理石的小青蛙腳邊，放著壹碗湯圓。", "碗裡有紅有白，最上面那顆好像在看你。"] }] },
  xmas: { name: "聖誕節", words: "聖誕節。大廳立了壹棵小小的樹，掛滿了燈，樹下的禮物盒上都寫著「佩佩收」。", notice: ["樹下的禮物盒是空的，館長說這樣大家才會壹直想著。"],
    art: [{ title: "雪夜的稀有佩佩", lines: ["畫的上方掛了壹串小燈，雪從畫框外面飄進來。", "佩佩頭上那頂帽子，好像是今天才換的。"] }] },
  nye: { name: "跨年夜", words: "跨年夜。館裡的鐘再敲幾下就是新的壹年，大家在大廳等著倒數。", notice: ["半夜十二點館裡照常開，05:00 才換日。"],
    art: [{ title: "快要十二點的肖像", lines: ["肖像上方掛了壹面時鐘，指針停在十二點前。", "館員說，這幅畫每年只在今天走動壹次。"] }] },
};

// 趣味節日（shared/holidays.js 的 FUN_INFO，決定 0044）：名字、館內的話（博物館的口吻，草稿，Yuga 可以改）、hint＝跟遊戲裡哪間房有呼應（沒有就不寫）
export const FUN_TEXT = {
  birdday: { name: "賞鳥日", line: "窗台上來了壹位不買門票的訪客，館員默默把牠登記成常客。" },
  hatday: { name: "帽子日", line: "館員把全館的帽子排成壹排，說今天每壹頂都有被戴到的權利。", hint: "手作坊可以幫佩佩挑壹頂喜歡的帽子。" },
  penguinaware: { name: "企鵝關注日", line: "有人在展廳地板貼了壹排小腳印，說是企鵝走過的路，走到壹半就沒了。" },
  hugday: { name: "擁抱日", line: "館長宣布，今天抱枕不算家具，算同事。", hint: "抱枕工作台的抱枕今天特別想被抱壹下。" },
  squirrel: { name: "松鼠日", line: "後院的橡果又少了幾顆，沒有人抓到犯人。" },
  pieday: { name: "派日", line: "點心被切成八塊，結果每個人都說自己拿到的那塊最小。" },
  kazoo: { name: "卡祖笛日", line: "走廊傳來不成調的嗡嗡聲，找不到是誰，也沒人想找。" },
  puzzleday: { name: "拼圖日", line: "倉庫角落那幅拼了三年的拼圖，今天又多拼上壹片，館員鼓掌了。" },
  groundhog: { name: "土撥鼠日", line: "館員盯著大門口的小洞看了很久，洞也看了館員很久。" },
  carrotcake: { name: "紅蘿蔔蛋糕日", line: "蛋糕上的糖霜畫成壹隻小青蛙，大家都不敢先動手。" },
  icebreakfast: { name: "早餐吃冰淇淋日", line: "休息室的冰箱今天被允許在早上開門，只有今天。" },
  almond: { name: "杏仁日", line: "杏仁在盤子裡排成壹個圈，館員數了三遍，每次都少壹顆。" },
  lovepet: { name: "愛你的寵物日", line: "有位館員在口袋裡藏了壹張寵物的照片，被發現了也不肯收起來。" },
  pizza: { name: "披薩日", line: "披薩盒疊成壹座小塔，館長說這也算展品。" },
  polarbear: { name: "北極熊日", line: "展廳的冷氣開強了壹點，說是讓北極熊來了也不尷尬。" },
  leap: { name: "閏日", line: "四年才開壹次的小門，今天剛好開著。進去的人說裡面什麼也沒有，只是多了壹天。" },
  peanutbutter: { name: "花生醬日", line: "館員用湯匙挖了壹大口，然後花了五分鐘跟自己的上顎談判。" },
  wildlife: { name: "野生動物日", line: "展廳的窗外有壹隻鳥站了很久，像在評分。" },
  pi: { name: "圓周率日", line: "館員把 3.14 寫在門框上，寫到第三位就沒位置了。" },
  frog: { name: "世界青蛙日", line: "畫廊的小青蛙雕像今天被擦得特別亮，連青蛙自己都不好意思。", hint: "畫廊的青蛙雕像今天值得多看壹眼。" },
  happiness: { name: "快樂日", line: "館長要大家今天不用想出理由，開心就好。" },
  sparrow: { name: "麻雀日", line: "麻雀在窗台開會，議題好像是誰的麵包屑比較多。" },
  poetry: { name: "詩歌日", line: "留言板上多了壹首詩，只有兩行，第二行是「我也不知道」。" },
  forests: { name: "森林日", line: "走廊的盆栽被擺成壹排，館員說這叫森林，大家就不敢反駁。" },
  chipsdip: { name: "洋芋片沾醬日", line: "沾醬太濃，洋芋片太薄，館員們展開了壹場無聲的討論。" },
  waffle1: { name: "國際格子鬆餅日", line: "鬆餅上的格子被數了壹遍，每個人數出來的都不壹樣。" },
  aprilfools: { name: "愚人節", line: "櫃台的牌子寫著「今天不營業」，下面有小字：騙你的。" },
  pillow: { name: "國際枕頭大戰日", line: "大廳的抱枕整整齊齊，看起來都在假裝沒事。", hint: "抱枕工作台的抱枕，今天格外有鬥志。" },
  pbj: { name: "花生醬果醬三明治日", line: "三明治被對角切開，這件事在休息室引發了小小的爭議。" },
  beaver: { name: "海狸日", line: "有人用紙箱在走廊搭了壹座小水壩，館員決定假裝沒看到。" },
  zoo: { name: "動物園愛好者日", line: "館員壹致同意：展廳也算半個動物園，區別只在誰會回嘴。" },
  grilledcheese: { name: "烤起司三明治日", line: "起司拉得很長，長到館員得站起來才拉得完。" },
  bat: { name: "蝙蝠日", line: "屋頂上倒掛著幾位訪客，牠們說這樣看展覽比較清楚。" },
  cheeseball: { name: "起司球日", line: "休息室的起司球圓得太標準，大家懷疑是用圓規畫的。" },
  penguinday: { name: "世界企鵝日", line: "櫃台上多了壹隻紙折的企鵝，不倒翁壹樣，怎麼推都不倒。" },
  pretzel: { name: "脆餅日", line: "蝴蝶脆餅的結打得比館員的鞋帶還漂亮。" },
  dance: { name: "國際舞蹈日", line: "擦地板的館員轉了壹圈，大家都以為他是故意的。" },
  jazz: { name: "爵士樂日", line: "走廊的腳步聲今天有了拍子，沒有人提醒他們。" },
  candiedorange: { name: "糖漬橙皮日", line: "橙皮糖黏在盤子上，館員用湯匙跟它拔河。" },
  hoagie: { name: "潛艇堡日", line: "麵包長得離譜，館員們決定當成展品先量壹下尺寸。" },
  hummus: { name: "鷹嘴豆泥日", line: "豆泥被抹成壹個漩渦，漩渦中間放了壹顆橄欖，像眼睛。" },
  museum: { name: "國際博物館日", line: "全世界的博物館今天壹起過生日，我們把大廳的燈擦亮了壹點。", hint: "大廳今天特別亮，進門先繞壹圈。" },
  bee: { name: "蜜蜂日", line: "窗邊的花開了，來了壹隻很忙的訪客，沒空理人。" },
  tea: { name: "國際茶日", line: "壺裡的茶泡到第三輪，味道淡了，故事變多了。" },
  turtle: { name: "烏龜日", line: "走廊上有壹隻小烏龜雕像，全館最準時的就是它，因為它永遠在原地。" },
  taffy: { name: "太妃糖日", line: "糖黏在牙齒上，館員們說話變得很有節奏感。" },
  paperairplane: { name: "紙飛機日", line: "展廳上空飛過三架紙飛機，其中壹架降落在館長的茶杯裡。" },
  hamburger: { name: "漢堡日", line: "香味從餐車壹路飄到走廊，連石像看起來都像在吞口水。", hint: "賭場的餐車今天特別香。" },
  milk: { name: "牛奶日", line: "館員的杯子裡是白色的，大家都假裝沒看到他在偷笑。" },
  eggday: { name: "蛋日", line: "休息室的蛋被排成壹排，沒人敢說哪顆是今天生的。" },
  bicycle: { name: "單車日", line: "走廊靠牆停了壹台腳踏車，已經停了三年，館員說它在等朋友。" },
  doughnut: { name: "甜甜圈日", line: "甜甜圈的洞被拿來當作取景框，每個人都從洞裡看了館長壹眼。" },
  gingerbread: { name: "薑餅日", line: "薑餅人被擺在櫃台，表情壹律是笑，不管你對它說了什麼。" },
  oceans: { name: "海洋日", line: "地下收藏庫的某個角落有點潮，館員說那是遠方的海打了個招呼。" },
  icedtea: { name: "冰茶日", line: "杯子外面起了壹層水珠，壹個人偷偷在上面寫了自己的名字。" },
  play: { name: "國際遊戲日", line: "館長宣布今天的規則只有壹條：不用做出成績。" },
  fudge: { name: "軟糖日", line: "糖切得厚厚的，館員們紛紛表示自己只吃壹小塊，然後又拿了第二塊。" },
  sushi: { name: "壽司日", line: "休息室的壽司排成壹列，像展品壹樣，等著被評論。" },
  yoga: { name: "瑜珈日", line: "館員在走廊拉筋，拉到壹半，有訪客問路，他維持著姿勢回答。" },
  camel: { name: "駱駝日", line: "展廳的壹角有隻駱駝雕像，看起來對壹切都不太在意。" },
  rainforest: { name: "雨林日", line: "植物角落今天噴了很多水霧，館員說這叫雨林，沒人敢反駁。" },
  chocolate: { name: "巧克力日", line: "櫃台的巧克力被融成壹小灘，館員堅持這叫現代藝術。" },
  shark: { name: "鯊魚日", line: "地下室傳出滴水聲，館員說那是鯊魚路過，大家決定不去確認。" },
  macncheese: { name: "起司通心粉日", line: "通心粉彎彎的，每壹條都像在對你點頭。" },
  snake: { name: "蛇日", line: "圖鑑室多了壹條長長的紙帶，館員堅稱那是蛇的蛻皮。" },
  emoji: { name: "表情符號日", line: "公佈欄上貼滿了小圖案，館員用畫的在跟你打招呼。" },
  icecream: { name: "冰淇淋日", line: "冰淇淋球疊了三層，館員說這是結構力學。" },
  appleturnover: { name: "蘋果派餃日", line: "餡料從酥皮的縫裡冒出來，像在探頭看展覽。" },
  lollipop: { name: "棒棒糖日", line: "每位館員嘴裡都含著壹根，開會的時候全部說話含糊不清。" },
  drivethru: { name: "得來速日", line: "大門口有人探出頭問今天有沒有現成的展覽，館員說有，要不要加點。" },
  tiger: { name: "老虎日", line: "紙老虎被擺在展廳門口，沒有任何訪客被嚇到，只有館員有點驕傲。" },
  lasagna: { name: "千層麵日", line: "麵壹層壹層，館員每挖壹層就說壹句話，到最後說不完了。" },
  friendship: { name: "友誼日", line: "留言牌上多了壹句話：「謝謝你上次借我的橡皮擦」。", hint: "展廳可以讓館友來參觀。" },
  cheesecake: { name: "乳酪蛋糕日", line: "蛋糕太重，托盤微微彎了，館員用眼神鼓勵它撐住。" },
  cookie: { name: "巧克力脆片餅乾日", line: "餅乾裡的巧克力分佈得不均勻，館員們開始比誰拿到的那塊多。" },
  mustard: { name: "黃芥末日", line: "壹小罐黃芥末放在櫃台，沒有人記得是誰帶來的。" },
  cat: { name: "貓咪日", line: "窗台上有壹團東西，說是靠枕，但它會動。" },
  lion: { name: "獅子日", line: "館長的頭髮今天特別蓬，大家都不敢說。" },
  elephant: { name: "大象日", line: "展廳的角落有壹塊空地，專門留給壹隻不存在的大象。" },
  lefthand: { name: "左撇子日", line: "館員把剪刀、杯子、門把壹個個換成反的，然後發現大家都在用右手。" },
  potato: { name: "馬鈴薯日", line: "休息室有壹籃馬鈴薯，每壹顆都有個名字，是館員取的。" },
  waffle2: { name: "吃鬆餅日", line: "鬆餅的格子裡積了糖漿，像壹座座小水池。" },
  bananasplit: { name: "香蕉船日", line: "船上放著三種顏色的冰淇淋，館員說這是壹艘有錨的點心。" },
  dog: { name: "狗狗日", line: "有位訪客帶著小狗進館，館員們默默讓出了壹條路。" },
  marshmallow: { name: "烤棉花糖日", line: "棉花糖被烤得微焦，館員小心地吹涼，最後還是燙到了。" },
  trailmix: { name: "綜合堅果日", line: "堅果袋裡什麼都有，就是沒有你想吃的那種。" },
  cheesepizza: { name: "起司披薩日", line: "起司拉得又長又細，館員用壹個很專業的動作切斷它。" },
  salami: { name: "薩拉米香腸日", line: "香腸被切成薄片，館員說可以拿來當書籤，沒人試。" },
  sudoku: { name: "數獨日", line: "公佈欄上有壹格空白，館員們各自填了壹個數字，結果都不壹樣。" },
  teddy: { name: "泰迪熊日", line: "展廳的長椅上坐著壹隻熊，從早上就在，大家都當它是訪客。" },
  milkshake: { name: "奶昔日", line: "吸管太細，奶昔太濃，館員用意志力吸了三分鐘。" },
  peanut: { name: "花生日", line: "花生殼堆成壹座小山，館員在山頂插了壹根牙籤當旗子。" },
  cremedonut: { name: "奶油甜甜圈日", line: "奶油從甜甜圈的另壹邊擠出來，館員的袖子遭殃了。" },
  appledumpling: { name: "蘋果餃日", line: "餃子裡的蘋果很安靜，不像館員那麼愛講話。" },
  cheeseburger: { name: "起司漢堡日", line: "起司融得剛剛好，連館長都放下了手上的公文。", hint: "賭場的餐車今天的香味特別濃。" },
  redpanda: { name: "小熊貓日", line: "走廊的樹枝上掛著壹隻布偶，睡姿跟某位館員很像。" },
  pirate: { name: "海盜說話日", line: "館員們今天說話都帶著「啊」的尾音，連委託櫃台都不例外。", hint: "委託櫃台今天的回答比較像船上的口令。" },
  quesadilla: { name: "烤起司餅日", line: "餅壹折為二，起司在裡面偷偷地等。" },
  chocmilk: { name: "巧克力牛奶日", line: "壹杯巧克力牛奶放在櫃台，館員不確定是誰的，只好壹起喝完。" },
  dictionary: { name: "辭典日", line: "櫃台的辭典被翻到壹頁，上面有壹個字被圈起來，旁邊寫著「真的嗎」。" },
  coffee: { name: "咖啡日", line: "咖啡的香味把整座館叫醒，連石像的眼皮都沒那麼沉了。" },
  smile: { name: "微笑日", line: "留言牌上有人畫了壹個笑臉，隔天另壹個人畫了壹個更大的。" },
  farmanimals: { name: "農場動物日", line: "館員在後院擺了壹個稻草人，它看起來比任何人都更像農場的老大。" },
  octopus: { name: "章魚日", line: "章魚墨水用光了，館員只好把簽名改成用手指畫。" },
  sloth: { name: "樹懶日", line: "走廊慢慢走過壹位同事，三天後才走到對面。" },
  pasta: { name: "義大利麵日", line: "麵煮過頭了，館員說這叫軟硬適中，沒人敢質疑。" },
  mole: { name: "莫耳日", line: "化學課本被擺到櫃台，沒有人記得數字，只記得有壹個很大。" },
  candycorn: { name: "糖果玉米日", line: "三角形的糖果被排成壹排，館員說這是最甜的柵欄。" },
  sandwich: { name: "三明治日", line: "館員把整座館比喻成三明治，大家卻只關心中間那層是什麼。" },
  nachos: { name: "玉米脆片日", line: "脆片上的起司融成壹張網，網住了所有想拿第二片的手。" },
  pickle: { name: "酸黃瓜日", line: "罐子打開的那壹刻，整間休息室都醒了。" },
  bread: { name: "手作麵包日", line: "麵團發酵得太好，快要頂開蓋子，館員在旁邊緊張地守著。" },
  toilet: { name: "廁所日", line: "走廊盡頭的小房間，今天被館員特別擦亮，順便貼了壹張感謝的小卡。" },
  cranberry: { name: "蔓越莓日", line: "紅色的小果子被放在白盤子上，像展品，大家不敢吃。" },
  espresso: { name: "濃縮咖啡日", line: "杯子小小的，咖啡濃濃的，館員壹口氣醒了三天。" },
  parfait: { name: "聖代日", line: "杯子裡壹層壹層，館員用長湯匙挖到底，每壹層都吃出不同的心情。" },
  cake: { name: "蛋糕日", line: "蛋糕上插了壹根蠟燭，沒人知道今天是誰的生日，大家還是唱了。" },
  frenchtoast: { name: "法式吐司日", line: "吐司煎得金黃，館員說這是早餐，但現在已經下午了。" },
  redapple: { name: "吃紅蘋果日", line: "桌上的蘋果被擦得發亮，沒人記得是誰擦的。" },
  fritters: { name: "炸餅日", line: "炸餅炸得金黃，吃的時候發出很響的聲音，館員們互相對看。" },
  cookieday: { name: "餅乾日", line: "壹盤餅乾放在櫃台，三分鐘後變成壹個空盤。" },
  soil: { name: "土壤日", line: "後院的土被翻過壹遍，館員在裡面找到壹顆不知道誰埋的糖果。" },
  brownie: { name: "布朗尼日", line: "布朗尼切成方塊，邊邊的那塊被爭奪得最激烈。" },
  pastry: { name: "糕點日", line: "糕點在盤子裡排成壹個圓，像在開會，主題是誰先被吃掉。" },
  noodlering: { name: "麵圈日", line: "麵被圍成壹個圈，中間的洞大家都在猜是什麼。" },
  monkey: { name: "猴子日", line: "館員學猴子爬上了架子，爬到壹半，館長走了進來，大家壹起假裝在整理。" },
  crossword: { name: "填字遊戲日", line: "公佈欄角落貼了壹張填字，每個人只填了壹格，然後裝作沒事走開。" },
  fruitcake: { name: "水果蛋糕日", line: "蛋糕裡的果乾顏色都很深，館員說這是時間的味道。" },
};
