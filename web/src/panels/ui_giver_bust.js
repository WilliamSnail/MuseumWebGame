// ================================================================
//  交代人的剪影頭像（11-22 翊文：「現在都長一樣很難分辨」）：每位壹張小 SVG（viewBox 48×48），單色＋底色挖洞，認得出是誰。
//  顏色靠 CSS：currentColor＝剪影色（--fg）、var(--bg)＝挖洞用的底色，都由 .tkc-av 提供（ui_tasks.js 的 GIVER_TONE）。
//  有正式圖的（yuga，GIVER_ART）不用這裡。外型照 content/story/帳本.json taskGivers 的 voice。
// ================================================================
const C = "currentColor", B = "var(--bg)";
const svg = inner => `<svg viewBox="0 0 48 48" aria-hidden="true">${inner}</svg>`;

export const GIVER_BUST = {
  // 堂主：沒人見過本人，只留字條。瓜皮帽、立領長衫，胸前貼壹張字條
  hall: svg(`<circle cx="24" cy="20" r="8.5" fill="${C}"/><path d="M15 17c0-6 4-9.5 9-9.5s9 3.5 9 9.5z" fill="${C}"/><circle cx="24" cy="6.5" r="1.8" fill="${C}"/><rect x="14" y="16.6" width="20" height="1.6" fill="${B}"/>`
    + `<path d="M5 46c1-10 7-15 14-16l5 7 5-7c7 1 13 6 14 16z" fill="${C}"/><path d="M24 37v9" stroke="${B}" stroke-width="1.4"/>`
    + `<rect x="31" y="31" width="10" height="13" rx="1" fill="${C}" stroke="${B}" stroke-width="1.6"/><path d="M33 35h6M33 38h6M33 41h4" stroke="${B}" stroke-width="1.3"/>`),
  // 退休的郵差：前簷帽、斜背的郵包帶、手上壹封信
  postman: svg(`<circle cx="24" cy="21" r="8.5" fill="${C}"/><path d="M14.5 17.5c0-6.5 4-10.5 9.5-10.5s9.5 4 9.5 10.5z" fill="${C}"/><path d="M11 18h26c0 2-1.2 3-3.2 3H14.2c-2 0-3.2-1-3.2-3z" fill="${C}"/><circle cx="24" cy="12.5" r="1.7" fill="${B}"/><rect x="14.5" y="17.4" width="19" height="1.2" fill="${B}"/>`
    + `<path d="M6 46c1-11 8-16 18-16s17 5 18 16z" fill="${C}"/><path d="M12 31l25 15" stroke="${B}" stroke-width="2.6"/>`
    + `<rect x="27" y="35" width="13" height="9" rx="1" fill="${C}" stroke="${B}" stroke-width="1.6"/><path d="M27.8 35.8l5.7 4.6 5.7-4.6" fill="none" stroke="${B}" stroke-width="1.4"/>`),
  // 便利商店店員：側簷的帽、胸前名牌、櫃台上的小帳
  clerk: svg(`<circle cx="24" cy="21" r="8.5" fill="${C}"/><path d="M15 17.5c0-6.5 4-10 9-10s9 3.5 9 10z" fill="${C}"/><path d="M24 16.5h15c0 2.2-1.6 3.4-3.4 3.4H24z" fill="${C}"/><path d="M23.6 7.5v9" stroke="${B}" stroke-width="1.2"/>`
    + `<path d="M7 40c1-6 6-10 17-10s16 4 17 10z" fill="${C}"/><path d="M19 30.5l5 6 5-6" fill="none" stroke="${B}" stroke-width="1.6"/><rect x="29" y="34" width="7" height="3.6" rx=".8" fill="${B}"/>`
    + `<rect x="2" y="40" width="44" height="6" rx="1" fill="${C}"/><rect x="6" y="38" width="11" height="4.6" rx=".8" fill="${C}" stroke="${B}" stroke-width="1.4"/><path d="M11.5 38v4.6" stroke="${B}" stroke-width="1.1"/>`),
  // 阿秤：頭上綁毛巾、肩旁掛壹支秤（橫桿、繩、秤錘）
  scale: svg(`<circle cx="19" cy="21" r="8.5" fill="${C}"/><path d="M10.5 18c0-6 3.6-9.5 8.5-9.5s8.5 3.5 8.5 9.5z" fill="${C}"/><path d="M10.5 16.4h17" stroke="${B}" stroke-width="1.6"/><circle cx="28" cy="16.6" r="2.3" fill="${C}" stroke="${B}" stroke-width="1.2"/>`
    + `<path d="M1 46c1-11 7-16 18-16s17 5 18 16z" fill="${C}"/>`
    + `<path d="M29 9h17" stroke="${C}" stroke-width="2.8" stroke-linecap="round"/><path d="M38 9v13" stroke="${C}" stroke-width="1.6"/><circle cx="38" cy="26.5" r="4.6" fill="${C}"/><circle cx="38" cy="26.5" r="1.6" fill="${B}"/><path d="M33 9v-2.5" stroke="${C}" stroke-width="1.6"/>`),
  // 號碼機：不是人。壹台機器、頂上的燈、螢幕（三位數字）、叫號紙從出口吐出來
  number: svg(`<circle cx="24" cy="7" r="3.2" fill="${C}"/><path d="M24 9.5v3" stroke="${C}" stroke-width="2"/><rect x="8" y="12" width="32" height="27" rx="3.5" fill="${C}"/>`
    + `<rect x="13" y="16.5" width="22" height="10" rx="1.5" fill="${B}"/><rect x="16" y="19" width="3.4" height="5" fill="${C}"/><rect x="22.3" y="19" width="3.4" height="5" fill="${C}"/><rect x="28.6" y="19" width="3.4" height="5" fill="${C}"/>`
    + `<circle cx="17" cy="32" r="2.1" fill="${B}"/><circle cx="24" cy="32" r="2.1" fill="${B}"/><circle cx="31" cy="32" r="2.1" fill="${B}"/><rect x="14" y="36" width="20" height="2.2" fill="${B}"/>`
    + `<path d="M17 37.6h14v8.4l-2.33-1.8-2.33 1.8-2.34-1.8-2.33 1.8-2.34-1.8-1.33 1z" fill="${C}"/><path d="M20 41h8" stroke="${B}" stroke-width="1.2"/>`),
};
