// ================================================================
//  全館投票的畫面字（決定 0162、0166；畫面 web/src/panels/ui_vote.js，判斷 shared/story/vote_screen.js）
//  草稿，Yuga 可以改。只放畫面自己的字：選項的名字和擋下來的備用句子用 VOTE_TEXT（core/systems_text.js），館史的標題和內文由伺服器的回應給。
//  不放任何結局和謎底（那些只在帳本）。{when}、{left}、{choice}、{name}、{n}、{max} 由程式帶入。
// ================================================================
export const VOTE_SCREEN_TEXT = {
  title: "全館投票",
  ledger: "館　帳",
  blankMark: "（空欄）",
  lead: "帳上有壹格是空的。這壹格怎麼辦，全館壹起決定。",
  desc: { write: "在空欄裡寫壹個名字。", blank: "讓那壹格繼續空著。", return: "把那支筆放回原來的地方。" },
  field: { blank: "（空著）", return: "（筆放回去了）" },
  rules: ["壹人壹票。", "截止前可以改 {n} 次。", "寫下的名字只有你自己看得到。"],
  name: { label: "要寫在空欄裡的名字", hold: "寫在這裡", count: "{n}／{max} 字" },
  form: { pick: "先在三個裡選壹個。", same: "跟現在這壹票壹樣，不用送。", ready: "按下去還會再問壹次。" },
  send: "寫進帳裡", sendEdit: "改成這壹票", sending: "寫進帳裡……", picked: "選好了",
  confirm: { title: "寫進帳裡？", editTitle: "確定改票？", choice: "你選的是", name: "要寫的名字", last: "這是最後壹次改票，改完就鎖住。", yes: "確定送出", no: "再想想" },
  shaky: "你的手在抖。", shakyNote: "選什麼、寫什麼，還是照你按的送出。",
  before: { head: "{when} 開投", left: "還有 {left}", what: "到時候在這三個裡選壹個（開投後才能選）：" },
  open: { close: "{when} 截止", left: "還有 {left}" },
  mine: { head: "你的票寫進帳裡了", chose: "你選了", name: "你寫下的名字", own: "只有你自己看得到。", ownHere: "名字寫在帳頁那壹格，只有你自己看得到。", can: "截止前還能改 {n} 次。", change: "改我的票", cancel: "不改了", locked: "已經改過了，這壹票鎖住了。" },
  counting: { head: "投票截止了", when: "{when} 公布", left: "還有 {left}", mine: "你投的是", none: "你這次沒有投。" },
  result: { head: "全館選了", share: "全館的比例", written: "寫進館史", mine: "你當初選的", none: "你這次沒有投。", nobody: "這次沒有人投票。", wait: "結果還在抄，等壹下再翻。", toHistory: "看館史" },
  pages: { text: "投之前：還有 {n} 頁你沒翻。", go: "看疑點簿" },
  tabs: { before: "預告", open: "投票", counting: "等公布", result: "結果", history: "館史" },
  history: { empty: "館史還是空的。投票結果公布以後，第壹則會寫在這裡。", share: "當時的比例" },
  otherNo: "館裡沒收下這壹票。", // 認不得的 why
  net: { loading: "翻帳中……", peek: "連不上館裡，現在看不到帳。", vote: "送出去的時候斷線了。同壹票再送壹次，不會多扣改票次數。", retry: "再試壹次", resend: "再送壹次" },
  entry: {
    before: { title: "帳上有壹格是空的", sub: "全館投票・{when} 開投", go: "先看看" },
    open: { title: "全館投票：那壹格空欄", sub: "{when} 截止・你還沒投", go: "去投" },
    voted: { title: "你的票寫進帳裡了", sub: "你選了「{choice}」・{when} 截止", go: "看看" },
    counting: { title: "投票截止了", sub: "{when} 公布", go: "看看" },
    result: { title: "全館投票公布了", sub: "全館選了「{choice}」", go: "看結果" },
    resultWait: { title: "全館投票公布了", sub: "打開看全館選了什麼", go: "看結果" },
    chip: "投票",
  },
  pass: { title: "全館投票", name: "你在帳上寫下的名字（只有自己看得到）", chose: "你投了「{choice}」", open: "打開投票", history: "看館史" },
  off: "全館投票要登入、在挑戰模式才看得到。",
};
