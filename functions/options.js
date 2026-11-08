// ================================================================
//  全部 Cloud Functions 共用的設定：地區用台灣（asia-east1）、最多開幾台。
//  這個檔一定要最先載入（index.js、party.js 第一行都 import 它）：
//  ES 模組的 import 會先跑完，寫在 index.js 本文裡的 setGlobalOptions 會比 party.js 裡的 onCall 晚，
//  邀請、組隊就會被放到預設的 us-central1，網頁（asia-east1）找不到（11-09 在模擬器發現的）。
// ================================================================
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

setGlobalOptions({ region: "asia-east1", maxInstances: 5 });
initializeApp();
