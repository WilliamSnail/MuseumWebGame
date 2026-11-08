# 0013 一起開發的 AI 是 Claude 和 Google Antigravity，規則以 AGENTS.md 為準

- 日期：2026-11-08
- 誰決定：翊文
- 狀態：有效

## 背景

- 翊文 11-08：

  > 「然後這個遊戲也可能多人一起開發，用不同AI，這個也要考慮進去，維護日誌怎麼寫，要人和AI都能看的清楚」
  >
  > 「多AI有可能是claude或google anti Gravity」

- 兩個工具讀的規則檔不一樣：Claude Code 讀 `CLAUDE.md`；Antigravity 會讀 `AGENTS.md`（第三方整理：1.20.3 版起），也會讀 `GEMINI.md`、`.agent/rules/`。

## 決定

- 一起開發的 AI 是 **Claude（Claude Code）** 和 **Google Antigravity**。
- `AGENTS.md` 是唯一的規則檔，所有規矩寫在這裡。
- `CLAUDE.md` 只寫 `@AGENTS.md`（Claude Code 用 `@檔名` 把別的檔帶進來）。Windows 上做符號連結要系統管理員權限，所以用這個寫法。
- **不放 `GEMINI.md`**：第三方整理說兩個都有時，Antigravity 可能以 `GEMINI.md` 為準，兩份不一樣就會照錯的做。
- **不在 `.agent/rules/` 另外寫規矩**，要加就寫回 `AGENTS.md`。
- `AGENTS.md` 保持在一萬字元以內（第三方整理說 Antigravity 每個規則檔大約 12,000 字元上限），細節放 `docs/`。

## 影響

- repo 是唯一的真相：AI 自己的記憶（Claude 的記憶、Antigravity 存的知識）別人看不到，都不算數。要留下來的事寫進維護日誌、決定紀錄、`docs/`。
- 每件事走 PR；Antigravity 自己開瀏覽器測過，也一樣要走 PR。
- commit 和維護日誌的「AI」欄寫用了哪個 AI。
- 「1.20.3 版起讀 AGENTS.md」「12,000 字元」都是第三方整理的說法，上線前要再確認。
- Gemini CLI（GitHub Action）預設讀 `GEMINI.md`，要在設定裡改成讀 `AGENTS.md`（規劃.md 第七節，上線前確認寫法）。

## 什麼時候可以再討論

- 有新的人或新的 AI 工具加入時。
- Claude Code 或 Antigravity 改了讀規則檔的方式時。
- 誰負責核准 PR、兩個 AI 怎麼分工還沒決定（規劃.md 第十節第 15、19 題）。
