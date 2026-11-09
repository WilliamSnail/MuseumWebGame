// Firebase 的網頁設定（決定 0021）。
// 這些不是祕密：官方說網頁設定可以放在網頁裡；保護資料的是 firestore.rules、database.rules.json 和 Functions 的檢查。
// 用哪一個：
//   - npm run dev（開發）：預設連本機的模擬器（emulator）。
//   - npm run build（打包）：連正式的 pepe-museum（決定 0023：只有一個專案，測試都在模擬器）。

export const FIREBASE_PROJECTS = {
  emulator: {
    projectId: "demo-pepe4",
    apiKey: "demo-key",
    authDomain: "demo-pepe4.firebaseapp.com",
    // Realtime Database 的名字（namespace）要跟 Functions 模擬器的 Admin SDK 一樣，是 demo-pepe4（11-08 試出來的；寫成 …-default-rtdb 會寫到兩個不同的資料庫）
    databaseURL: "https://demo-pepe4.firebaseio.com",
    appId: "demo-app",
  },
  // 正式專案 pepe-museum（翊文 11-08 在後台註冊的網頁應用程式「PEPE_MUSEUM」）。網址 pepe-museum.web.app
  prod: {
    apiKey: "AIzaSyDyRttjmwmVvahZgUgjkD0_2ngymYAj57k",
    authDomain: "pepe-museum.firebaseapp.com",
    projectId: "pepe-museum",
    storageBucket: "pepe-museum.firebasestorage.app",
    messagingSenderId: "256538052616",
    appId: "1:256538052616:web:e1e96102dbb9b2a77569bd",
    databaseURL: "https://pepe-museum-default-rtdb.asia-southeast1.firebasedatabase.app", // Realtime Database（新加坡，翊文 11-08 建的）
    // measurementId（G-ZZDKD40JG7）沒有放：不用 Google Analytics，不追蹤玩家
  },
};

// 模擬器的連接埠：跟 firebase.json 的 emulators 一樣（翊文的電腦 8080、9000、4000 被別的程式用了）
// VITE_EMU_SET＝第幾套模擬器（tools/emulators.cjs 的 EMU_SET）：同時測好幾個分支時，連接埠都加 1000×這個數字
const EMU_ADD = 1000 * (Number(((typeof import.meta !== "undefined" && import.meta.env) || {}).VITE_EMU_SET) || 0);
export const EMULATOR_PORTS = { auth: 9099 + EMU_ADD, firestore: 8180 + EMU_ADD, database: 9100 + EMU_ADD, functions: 5101 + EMU_ADD };

// Functions 的地區（functions/index.js 的 setGlobalOptions）
export const FUNCTIONS_REGION = "asia-east1";

export function firebaseTarget() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  return env.VITE_FIREBASE || (env.DEV ? "emulator" : "prod");
}
