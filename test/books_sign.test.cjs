// 帳的正負號對帳（tools/books_sign_check.cjs）：npm test 會跑。對不上就印出哪個帳、哪個來源、預期和實際
const { run } = require("../tools/books_sign_check.cjs");
const { probs } = run();
if (probs.length) { console.log(`FAIL 正負號對帳 ${probs.length} 項`); probs.forEach(p => console.log("  ✗ " + p)); console.log("0 passed, 1 failed（帳的正負號；node tools/books_sign_check.cjs 看全部）"); process.exit(1); }
console.log("1 passed, 0 failed（帳的正負號：對帳、符號表、兩邊相反、名字、日報文字、掃程式）");
