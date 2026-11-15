# 0088 公用的 statView：數值怎麼看，分級只寫一處

- 日期：2026-11-15 21:00:00
- 誰決定：翊文（「這些數值要在哪裡可以看得到也想一下，寫個公用的方式，這樣以後哪邊都好呼叫」）；設計由數值平衡擬
- 狀態：有效（第一版）；三個理智值的接資料等 `docs/理智值提案.md` 翊文定案

## 決定

1. `shared/stat_view.js`：`statView(kind, id, data) → { value, band, label, tone, hint, pub } | null`、`statBandOf(kind, value)`。**分級的門檻和名字只寫在這一個檔**（健康值的門檻讀 W5 的 `NUM.casino.worldDoc.health`）；畫面、日報、Discord、腳本、伺服器回傳給畫面都叫它，不各自算。
2. 第一版有資料的：`unitHealth`（吃緊／偏弱／普通／很好，用「小於」，跟 W5 換狀態同一組）、`unitState`（一般／減薪／緊縮／裁員）、`budgetMult`（多一點／照常／保守／很省）。`whCard` 的分布、`world:health` 已經改成叫它。
3. 三個理智值（`npcSan`、`unitUnrest`、`crowdMood`）的**分級表先放著**，資料還沒有，所以回 `null`；翊文定案提案之後才接資料。
4. **玩家看分級和一句話，不看數字**（`pub`；`value` 只有腳本和管理者用）。畫面層的公用元件（`statBadge`、`statBar`）交給美術統籌，吃的欄位就是回傳的 `{ band, label, tone, hint }`。

## 還沒做

- 畫面元件、日報／Discord 改叫它（日報現在的句子沒有用到分級）。
- 三個理智值本身（提案 `docs/理智值提案.md`，等翊文定）。
