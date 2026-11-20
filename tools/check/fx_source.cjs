// fx 的程式拆成好幾支（fx_core、fx_sound、fx_misc、fx_dice、fx_drag，最後 fx.js 組成 FX）。
// 要「整份跑」的測試用 allSource()（拿掉 import／export，照依賴順序接成一段，結尾可以直接用 FX）；
// 只要「掃字串」（R、AMB 在 fx_sound.js）的直接讀對應的檔。
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "..", "..", "web", "src");
const FILES = ["fx_core", "fx_sound", "fx_misc", "fx_dice", "fx_drag", "fx"]; // 被 import 的在前面
const read = name => fs.readFileSync(path.join(DIR, name + ".js"), "utf8");
const strip = src => src.replace(/^import\s[^\n]*;[ \t]*$/gm, "").replace(/^[ \t]*export\s+(?=(?:const|let|function|class|async)\b)/gm, "");
function allSource() { return FILES.map(f => strip(read(f))).join("\n;\n"); }
module.exports = { FILES, read, strip, allSource };
