# 瀏覽器測試的片段

翊文 11-09：「整合一下今天的經驗，記好，需要腳本的也寫好」。

驗畫面時少走冤枉路。全部只用在本機（`localhost`）。

## 規則

- **自己開分頁：** `tabs_create`，之後每個動作都帶 `tabId`。預設分頁可能被別的子代理導走，畫面會莫名其妙關掉。測完 `tabs_close`。
- **要截圖或測動畫，先 `tabs_select`：** 分頁在背景時動畫停住，截到半透明的畫面，看起來像壞了，其實沒壞。提示（toast）也不會在背景跳。
- **`?user=` 不會換帳號：** 這個瀏覽器已經登入過就還是那個人。要新帳號換個 port（登入是依網址來源記的），或用 `npm run emu:call -- --user 別人` 當第二個人。
- **搬存檔的問題選「從頭開始」，絕不按「搬上去」。**
- **手機尺寸：** `resize_window` 844×390（橫拿）；手機直拿會先跳「把手機轉橫」的提示。
- **測完 `resize_window` 回 `desktop`。**

## 進遊戲（自由模式）

看賭場、榜單這些畫面最快。`新參觀者` 的流程見下一段。

```js
const W = ms => new Promise(r => setTimeout(r, ms));
const vis = b => b.getBoundingClientRect().width > 0;
const B = t => [...document.querySelectorAll('button')].filter(vis).find(b => b.textContent.trim().startsWith(t));
for (let i = 0; i < 40 && !B('登入') && !B('自由模式') && !B('從頭開始'); i++) await W(400);
if (B('登入') && !B('自由模式')) { B('登入').click(); for (let i = 0; i < 60 && !B('自由模式') && !B('從頭開始'); i++) await W(500); }
if (B('從頭開始')) { B('從頭開始').click(); for (let i = 0; i < 40 && !B('自由模式'); i++) await W(400); }
B('自由模式').click(); await W(2500);
// 關掉公佈欄、導覽。圖示按鈕的字在 aria-label
for (let i = 0; i < 5; i++) { const k = [...document.querySelectorAll('button')].filter(vis).find(b => /^(關閉|關掉|略過)$/.test((b.getAttribute('aria-label') || b.textContent).trim())); if (!k) break; k.click(); await W(700); }
```

右上選單的按鈕（`Hamachi 賭場`、`本週榜單`）不用打開選單也點得到。上面導覽列是 `nav a`，不是 `button`。

## 挑戰模式（要測心情、理智、背包時）

```js
// 先做完上面「從頭開始」那一步，然後按新參觀者
B('新參觀者').click(); await W(1500);
const inp = [...document.querySelectorAll('input')].find(i => i.type === 'text');
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '阿測');
inp.dispatchEvent(new Event('input', { bubbles: true }));
// 一直按流程的按鈕（下壹步、擲骰、選職業、知道了）直到進大廳
const skip = /選單|公佈欄|信箱|簽到|每週劇情|兌換所|榜單|賭場|館友|換參觀者|我的帳號|館友證|音樂|先用直的|登出|算了|自由模式|大廳/;
for (let i = 0; i < 45 && !document.querySelector('.lobby-side'); i++) {
  const list = [...document.querySelectorAll('button')].filter(b => vis(b) && !b.disabled && !skip.test(b.textContent) && !b.closest('nav,header'));
  if (list.length) list[list.length - 1].click();
  await W(900);
}
```

讀心情：`document.body.innerText.match(/心情\s*(\d+)/)`。

## 難走到的情況

用 `npm run emu:doc` 直接改模擬器資料，不要玩到那個狀態：

- 莊家破產：`npm run emu:doc -- --set 8 data casinoHouse/main bankroll=-500000`
- 次數歸零：`npm run emu:doc -- --set 8 data casinoWallets/@小明 ec.n=0`
- 隱身：`npm run emu:doc -- --set 8 field members/@小明 invisible=true`

全館的提示要有人同時動作：`Bash` 用 `run_in_background` 晚幾秒叫 `emu:call`，瀏覽器這邊用 `MutationObserver` 等。兩個一起呼叫的話，工具可能一個跑完才跑下一個，就看不到提示了。
