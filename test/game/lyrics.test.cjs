// 深夜大廳歌曲字幕：shared/game/lyrics.js 的 lyricAt，加內容檔 content/lyrics/lobby-night.json 的格式
const assert = require("assert");
const { load } = require("../load_shared.cjs");
const LY = require("../../content/lyrics/lobby-night.json");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const L = [{ t: 10, text: "甲", kind: "choir" }, { t: 14, text: "乙", kind: "choir" }, { t: 20, kind: "gap" }, { t: 30, text: "丙", kind: "whisper", end: 33 }];
T("還沒開始、沒有時間：不顯示", G => { assert.strictEqual(G.lyricAt(L, 5), null); assert.strictEqual(G.lyricAt(L, null), null); assert.strictEqual(G.lyricAt(null, 12), null); });
T("到下壹句開始前都顯示這壹句", G => { assert.strictEqual(G.lyricAt(L, 10).text, "甲"); assert.strictEqual(G.lyricAt(L, 13.9).text, "甲"); assert.strictEqual(G.lyricAt(L, 14).text, "乙"); });
T("最長顯示 6 秒：乙從 14 到 20 就是 gap", G => { assert.strictEqual(G.lyricAt(L, 19.9).text, "乙"); assert.strictEqual(G.lyricAt(L, 20), null); assert.strictEqual(G.lyricAt(L, 25), null); });
T("有 end 就用 end", G => { assert.strictEqual(G.lyricAt(L, 32.9).text, "丙"); assert.strictEqual(G.lyricAt(L, 33), null); });
T("內容檔：照時間排、每句有 kind、有字的才有句子、不超過歌的長度", () => {
  const ks = ["choir", "whisper", "gap"];
  LY.lines.forEach((l, i) => { assert.ok(ks.includes(l.kind), "kind 不對：" + i); assert.ok(typeof l.t === "number" && l.t >= 0 && l.t < 137, "t 不對：" + i); if (i) assert.ok(l.t > LY.lines[i - 1].t, "要照時間排：" + i); assert.ok(l.kind === "gap" ? !l.text : !!l.text, "gap 沒字、其他要有字：" + i); if (l.end != null) assert.ok(l.end > l.t && l.end <= 137, "end 不對：" + i); });
  assert.ok(LY.lines.some(l => l.text === "那不是館員"));
});
console.log(`歌詞字幕：${pass} 項通過、${fail} 項沒過`);
process.exit(fail ? 1 : 0);
