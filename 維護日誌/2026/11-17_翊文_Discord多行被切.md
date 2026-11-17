---
日期: 2026-11-17 21:29:38
作者: 翊文
AI: Claude Opus 5.5
類型: 修正
範圍: [tools/ship.cjs, tools/say.cjs, docs/GitHub流程和金鑰.md, test/tools.test.cjs]
PR: 待補
版本: -
測試: test/tools.test.cjs
相關: 決定 0122（集團股開放買賣的 Discord 公告）
狀態: 待合併
---

## 為什麼要改
翊文：「Discord上只有發布這個而已」。「集團股開放買賣」那則用 `npm run ship -- … --say-now "$(cat 檔案)"` 發，Discord 只出現第壹行標題。

## 改了什麼
- 查到原因：Windows 上 `npm run` 經過 cmd.exe，參數裡的換行後面被切掉（`npm run say -- --dry "$(printf '第一行\n第二行')"` 只印出第一行）。gh 的 `-f message=` 本身會送多行（用 GH_DEBUG 對不存在的分支試過，請求內容完整）。
- ship 多 `--say-now-file 檔案`；用 npm run 在 Windows 上直接給 `--say-now` 文字時印提醒。say.cjs 直接寫文字時也提醒改用 `--file`。
- 文件寫明：多行壹定放檔案。
- 用 `npm run say -- --file` 把定案全文補發了壹次。

## 怎麼確認的
- 重現：npm run 傳兩行，只收到第壹行；`--file` 的 dry run 印出全文。
- 補發成功（Actions run 44092787861）。test/tools.test.cjs 全過。

## 還沒做、要注意
- Discord 上留著那則只有標題的，bot 沒刪。

## 給下一個人
多行的 Discord 文字：`ship --say-now-file`、`npm run say -- --file`，不要 `--say-now "$(cat …)"` 走 npm run。
