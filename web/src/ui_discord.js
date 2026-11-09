// ================================================================
//  「綁定 Discord」（我的帳號裡壹列，決定 0051）
//  翊文 11-09：「能夠連線玩家相應的Discord 帳號，讓玩家可以在discord 直接玩賭場或是斗內等等的」
//  資料從 Functions 來（functions/discord_link.js）；規則在 shared/discord.js；樣式在 css/discord.css。
//    - 登入了才有（我的帳號本來就要登入）。伺服器那邊還沒設定 Discord（configured: false）：整列藏起來，不會有按了沒用的按鈕。
//    - 沒綁定：按「綁定 Discord」拿 6 位數的碼，顯示碼、剩多久、怎麼用；每 4 秒問壹次，綁好了就換成「已綁定」。
//    - 已綁定：可以解除（獎勵不會再送）。
//  ui_login.js 的 openAccount 叫 ADDONS.discordRow()：給它壹列（平常是空的，讀到狀態才長出來）。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { NUM } from "../../shared/config.js";
import { dcNum } from "../../shared/discord.js";
import { nowMs } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { ADDONS, ask, btn, h, note, snd } from "./ui_core.js";

const POLL_MS = 4000;
let last = null; // 上次讀到的狀態：重畫「我的帳號」時先畫這個，不閃壹下

const bonusText = () => `第壹次綁定館方送你 ${dcNum(NUM.discord.linkBonus)} 籌碼（每個帳號只送壹次）。`;
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

NET.on("logout", () => { last = null; });

ADDONS.discordRow = () => {
  const box = h("div", { class: "na-row na-discord", hidden: true });
  let timer = null, tick = null, code = null;
  const stop = () => { clearInterval(timer); clearInterval(tick); timer = tick = null; };
  const err = msg => { snd("error"); note(msg || "現在連不上，等壹下再試。", "bad"); };
  const label = h("span", { class: "na-l" }, "Discord");
  const body = h("div", { class: "nd-body" });
  box.append(label, body);

  const draw = st => {
    stop();
    last = st;
    if (!st || !st.configured) { box.hidden = true; return; } // 伺服器那邊還沒開通：不顯示
    box.hidden = false;
    if (st.linked) { // 已綁定
      body.replaceChildren(
        h("p", { class: "nd-line" }, h("b", null, "已綁定"), "　在 Discord 打 /pepe-籌碼 就看得到你的籌碼。"),
        h("div", { class: "nd-acts" }, btn("解除綁定", async () => {
          if (!(await ask("解除綁定？之後想再綁要重新拿碼（獎勵不會再送）。", "解除", "算了"))) return;
          try { await NET.call("discordUnlink"); note("解除了。"); load(); } catch (e) { err(e.message); }
        }, "small")));
      return;
    }
    if (st.code && st.exp > nowMs()) { // 拿了碼、還沒用
      code = st;
      const left = h("b", { class: "nd-left" });
      const paint = () => {
        const ms = code.exp - nowMs();
        if (ms <= 0) { stop(); load(); return; }
        left.textContent = mmss(ms);
      };
      body.replaceChildren(
        h("p", { class: "nd-line" }, "到 Discord 伺服器打這壹行（只有你看得到回覆）："),
        h("p", { class: "nd-cmd" }, "/pepe-綁定 ", h("b", { class: "nd-code", "aria-label": `綁定碼 ${st.code.split("").join(" ")}` }, st.code)),
        h("p", { class: "nd-line nd-sub" }, "碼還剩 ", left, "，只能用壹次。", bonusText()),
        h("div", { class: "nd-acts" }, btn("換壹個新的碼", () => getCode(), "small")));
      paint();
      tick = setInterval(() => { if (!box.isConnected) { stop(); return; } paint(); }, 1000);
      timer = setInterval(async () => { // 綁好了就換畫面
        if (!box.isConnected) { stop(); return; }
        try { const s = await NET.call("discordLinkState"); if (s && s.linked) { note("Discord 綁定好了。", "good"); draw(s); } } catch (e) { /* 下次再問 */ }
      }, POLL_MS);
      return;
    }
    body.replaceChildren( // 還沒綁
      h("p", { class: "nd-line" }, "把 Discord 接到這個帳號，就能在 Discord 查籌碼、看榜單。", bonusText()),
      h("div", { class: "nd-acts" }, btn("綁定 Discord", () => getCode(), "small")));
  };
  async function getCode() {
    try { const r = await NET.call("discordLinkCode"); draw({ configured: true, linked: false, code: r.code, exp: r.exp }); snd("flip"); }
    catch (e) { err(e.message); }
  }
  async function load() {
    try { draw(await NET.call("discordLinkState")); }
    catch (e) { box.hidden = true; } // 問不到就藏起來：我的帳號別的東西照常
  }
  if (last) draw(last); // 先畫上次的，再背景更新
  load();
  return box;
};
