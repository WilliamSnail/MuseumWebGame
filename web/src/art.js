// ===== ART：所有 SVG 圖（原創的圓青蛙；不是 Pepe the Frog 的樣子）=====
// 每個選項都是登記表裡獨立的一塊：加新選項只要加一筆，不必重畫整隻青蛙。
// 不認得的選項名稱會用合理的預設樣子畫出來。
export const ART = (() => {
  let uid = 0;
  const nid = p => "pa" + p + (++uid).toString(36);
  const INK = "#1D1D1B", MUTE = "#8A8A85", HAIR = "#E4E2DC";
  const COLORS = {
    紅: ["#E8735F", "#A9473A"], 綠: ["#7DC35B", "#3F8F4A"], 黃: ["#F2CF4E", "#AD891C"], 黑: ["#4B4B48", "#1D1D1B"],
    藍: ["#6C9BE0", "#2F5BA8"], 紫: ["#A989DD", "#5E3F9A"], 粉: ["#F2A7BE", "#B5627C"], 白: ["#F3F1EA", "#9A988F"], 橘: ["#F29A4A", "#B0611C"],
    虹彩: ["#C9CCE0", "#62708F"], 夜市金: ["#E2B53E", "#8A5F12"],
  };
  // 漸層色：身體用整隻共用的漸層（userSpaceOnUse），COLORS 裡是給介面色塊用的單色近似
  const GRAD = {
    虹彩: { a: [44, 56, 160, 184], stops: [[0, "#F6C2D6"], [.45, "#A9DDD5"], [.75, "#CFE3B4"], [1, "#F2D894"]], belly: "#FFF7EF" },
    夜市金: { a: [100, 52, 100, 190], stops: [[0, "#FFF1AE"], [.3, "#F2C64E"], [.55, "#C99327"], [.75, "#F4D068"], [1, "#A9761A"]], belly: "#F8E08E", shine: 1 },
  };
  const TINT = {
    紅: "hue-rotate(-115deg) saturate(1.4)", 綠: "none", 黃: "hue-rotate(-55deg) saturate(1.5) brightness(1.1)", 黑: "grayscale(1) brightness(0.45)",
    藍: "hue-rotate(100deg)", 紫: "hue-rotate(150deg) saturate(.9)", 粉: "hue-rotate(-150deg) saturate(.7) brightness(1.15)", 白: "grayscale(1) brightness(1.45)", 橘: "hue-rotate(-80deg) saturate(1.4)",
    虹彩: "saturate(1.25) hue-rotate(25deg) brightness(1.08)", 夜市金: "sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.08)",
  };
  const RARITY_COLORS = { 普通: "#A8A8A2", 稀有: "#3B6FD6", 超稀有: "#8A4FD8", 傳說級稀有: "#C99A2E", 不可名狀: "#3A2E4F" };
  const DEF = { 稀有度: "普通", 心情: "開心", 顏色: "綠", 帽子: "沒有", 姿勢: "站著" };
  const FIT0 = { hatY: 0, hatS: 1, handX: 0, handY: 0 };
  const asList = v => (Array.isArray(v) ? v : v ? [v] : []).filter(x => typeof x === "string" && x);
  const hashStr = t => [...String(t)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
  const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
  const n = v => Math.round(v * 10) / 10;
  const colorOf = name => COLORS[name] || (h => [`hsl(${h},52%,64%)`, `hsl(${h},45%,32%)`])(hashStr(name) % 360);
  const full = pick => { const p = Object.assign({}, DEF); for (const k in pick || {}) if (pick[k] != null && pick[k] !== "") p[k] = String(pick[k]); return p; };
  const svgOpen = (vb, label, extra = "") => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"${label != null ? ` role="img" aria-label="${esc(label)}"` : ""}${extra}>`;
  const spark = (x, y, s, c, a = "") => `<path d="M${n(x)} ${n(y - s)}Q${n(x)} ${n(y)} ${n(x + s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + s)}Q${n(x)} ${n(y)} ${n(x - s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - s)}Z" fill="${c}"${a}/>`;
  const ln = (d, c, w = 3, a = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${a}/>`;
  const flat = (s, c = "currentColor") => s.replace(/(fill|stroke|stop-color)="(?!none)[^"]*"/g, `$1="${c}"`).replace(/ opacity="[^"]*"/g, "");
  const PUPILS = 'style="transform:translate(calc(var(--gx,0)*4px),calc(var(--gy,0)*4px))"';
  const SW = 2.5, TEAR = "#7CC3EE", MOUTH = "#7A2630", TONGUE = "#FF8FA3", BLUSH = "#FF8FA3";

  // ---------- 姿勢（幾何 + 手腳），不認得的用「站著」 ----------
  // parts：[種類, cx, cy, rx, ry, 旋轉, 圖層]；種類 arm/leg 在運動服心情會變成袖子/褲管；圖層 b=身體後面、f=身體前面
  const sym = list => list.concat(list.map(([k, x, y, rx, ry, r, l]) => [k, 200 - x, y, rx, ry, -r, l]));
  // hold：手上拿東西的位置 [x, y, 方式, 左右]；hang = 拿在手上垂著、lay = 放在旁邊地上、foot = 倒立時掛在腳上
  const POSE = {
    // 站著跟坐著要壹眼分得出來（翊文 11-08：「長太像了」）：站著身體高、底下露出兩條腿；坐著矮矮寬寬坐在坐墊上，腳往前伸
    站著: { cy: 112, rx: 54, ry: 50, ey: 72, ex: 25, er: 18, wr: 11.5, hold: [151, 140, "hang", 1], parts: sym([["leg", 81, 168, 9, 14, 3, "b"], ["foot", 78, 183, 15, 6, 0, "b"], ["arm", 49, 122, 9, 17, -12, "b"]]) },
    坐著: { cy: 133, rx: 66, ry: 42, ey: 93, ex: 27, er: 18, wr: 11.5, seat: 1, hold: [165, 148, "hang", 1], parts: sym([["arm", 38, 141, 10, 15, -10, "b"], ["foot", 60, 179, 17, 8.5, -14, "f"]]) },
    躺平: { cy: 160, rx: 76, ry: 27, ey: 136, ex: 24, er: 15, wr: 9.5, flat: 1, mo: 26, bo: 22, hs: .82, hold: [158, 174, "lay", 1, 1.2], parts: sym([["foot", 40, 181, 16, 6, -10, "b"], ["arm", 23, 166, 16, 7, -18, "b"]]) },
    比讚: { cy: 122, rx: 58, ry: 54, ey: 78, ex: 26, er: 18, wr: 11.5, thumb: 1, hold: [47, 146, "hang", -1], parts: sym([["foot", 80, 177, 15, 7, 0, "b"]]).concat([["arm", 46, 128, 10, 16, -12, "b"]]) },
    // 斯拉夫蹲：腳跟貼地、膝蓋大開、身體壓低、前臂擱在膝蓋上、手垂著
    斯拉夫蹲: { cy: 134, rx: 54, ry: 44, ey: 92, ex: 26, er: 18, wr: 11.5, mo: 34, bo: 30, squat: 1, hold: [177, 156, "hang", 1, 1],
      parts: sym([["foot", 46, 182, 19, 6, 0, "f"], ["leg", 38, 165, 10, 17, 8, "f"], ["leg", 48, 149, 23, 13, -12, "f"], ["arm", 44, 137, 19, 6.5, 6, "f"], ["foot", 24, 151, 6, 9.5, 10, "f"]]) },
    // 倒立：用正立的座標畫，整隻轉 180°（手撐地、腳朝天）；帽子放在旁邊地上
    倒立: { cy: 120, rx: 54, ry: 50, ey: 78, ex: 26, er: 18, wr: 11.5, inv: 1, hold: [72, 190, "foot", 1, 1.1],
      parts: sym([["arm", 49, 74, 9, 27, -5, "b"], ["foot", 46, 43, 12, 6, 0, "b"], ["leg", 82, 171, 9.5, 15, 10, "b"], ["foot", 78, 186, 15, 6.5, 0, "b"]]) },
  };
  const poseOf = name => POSE[name] || POSE.站著;
  // 坐著的坐墊：酒紅色的圓坐墊，中間壹顆釦子，兩邊金色流蘇（畫在身體後面，露出下面和兩側）
  const seatSVG = sil => sil ? `<ellipse cx="100" cy="176" rx="80" ry="13" fill="currentColor"/>`
    : `<ellipse cx="100" cy="183" rx="84" ry="8" fill="#2A0A10" opacity=".25"/><ellipse cx="100" cy="176" rx="80" ry="13" fill="#A33445" stroke="#5E1622" stroke-width="2.5"/>`
      + ln("M30 175Q100 165 170 175", "#C8576A", 2) + `<circle cx="100" cy="182" r="2.4" fill="#5E1622"/><circle cx="20" cy="177" r="3.4" fill="#E2B53E"/><circle cx="180" cy="177" r="3.4" fill="#E2B53E"/>`;
  // 運動服：深藍、兩條白線（不是三條）
  const SUIT = "#262C40", SUIT_D = "#141826", STRIPE = "#F4F2EC";
  const stripes = (cx, cy, rx, ry, rot) => {
    const v = ry >= rx, a = v ? rx * .36 : ry * .36, L = (v ? ry : rx) * .72;
    const d = v ? `M${n(cx - a)} ${n(cy - L)}V${n(cy + L)}M${n(cx + a)} ${n(cy - L)}V${n(cy + L)}` : `M${n(cx - L)} ${n(cy - a)}H${n(cx + L)}M${n(cx - L)} ${n(cy + a)}H${n(cx + L)}`;
    return ln(d, STRIPE, 1.5, rot ? ` transform="rotate(${rot} ${n(cx)} ${n(cy)})"` : "");
  };
  const limb = (q, suit) => { const [k, cx, cy, rx, ry, rot] = q, el = E(cx, cy, rx, ry, rot); return suit && (k === "arm" || k === "leg") ? el.replace("/>", ` fill="${SUIT}" stroke="${SUIT_D}"/>`) + stripes(cx, cy, rx, ry, rot) : el; };
  const thumb = (fill, dark, suit) => `<g fill="${fill}" stroke="${dark}" stroke-width="${SW}" stroke-linejoin="round">${limb(["arm", 156, 114, 10, 16, -28], suit)}<rect x="159.5" y="71" width="10" height="22" rx="5"/><circle cx="165" cy="98" r="12"/></g>` + ln("M156 96h8M156 102h8", dark, 1.8);
  // 瓜子（黑底白紋）；殼 = 裂開的半片
  const seed = (x, y, r, s = 1) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${r}) scale(${s})"><path d="M-6 0Q-1-3.6 5 0Q-1 3.6-6 0Z" fill="#2B2B2A"/>` + ln("M-3.8-.9L2.8-.5M-3.8.9L2.8.5", "#D9D6CC", .8) + `</g>`;
  const shell = (x, y, r) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${r}) scale(1.4)"><path d="M0 0L-7-3.2Q-3.2-4.6 0 0ZM0 0L-7 1.6Q-3.6 3.6 0 0Z" fill="#2B2B2A"/>` + ln("M-1.5-.9L-5.5-2.8", "#CFCBC0", .6) + `</g>`;

  // ---------- 心情（臉），不認得的用平靜微笑 ----------
  const MOODS = {
    開心: c => c.x ? {
      closed: 1, blush: .85,
      mouth: `<path d="M78 ${c.my - 6}Q100 ${c.my + 34} 122 ${c.my - 6}Z" fill="${MOUTH}" stroke="${c.dark}" stroke-width="${SW}" stroke-linejoin="round"/><ellipse cx="100" cy="${c.my + 15}" rx="10" ry="6.5" fill="${TONGUE}"/>`,
      over: [-1, 1].map(s => `<path d="M${100 + s * (c.ex + 17)} ${c.ey + 4}q${s * 6} 6 ${s * 2} 12q${-s * 6}-4 ${-s * 2}-12z" fill="${TEAR}"/>` + ln(`M${100 + s * (c.ex + 26)} ${c.ey - 14}l${s * 8}-6M${100 + s * (c.ex + 30)} ${c.ey - 2}l${s * 10}-1M${100 + s * (c.ex + 28)} ${c.ey + 10}l${s * 8}4`, c.dark, 2)).join(""),
    } : {
      look: [[0, 0], [0, 0]], pr: 4.8, hl: 1, blush: .55,
      mouth: `<path d="M84 ${c.my - 2}Q100 ${c.my + 22} 116 ${c.my - 2}Z" fill="${MOUTH}" stroke="${c.dark}" stroke-width="${SW}" stroke-linejoin="round"/><ellipse cx="100" cy="${c.my + 9}" rx="7" ry="4.5" fill="${TONGUE}"/>`,
    },
    傷心: c => {
      const len = Math.min(c.x ? 100 : 58, 186 - c.ey - 10), w = c.x ? 10 : 6;
      const streams = [-1, 1].map(s => `M${100 + s * 36} ${c.ey + 10}q${s * 4} ${len / 2} ${-s * 2} ${len}`).join("");
      return {
        look: [[0, 3], [0, 3]], pr: 4.6, hl: 2, blush: .45,
        brow: ln(`M${100 - c.ex - 12} ${c.ey - 20}L${100 - c.ex + 10} ${c.ey - 27}M${100 + c.ex + 12} ${c.ey - 20}L${100 + c.ex - 10} ${c.ey - 27}`, c.dark, 2.5),
        mouth: c.x ? `<path d="M84 ${c.my + 12}Q100 ${c.my - 14} 116 ${c.my + 12}Q100 ${c.my + 5} 84 ${c.my + 12}Z" fill="${MOUTH}" stroke="${c.dark}" stroke-width="${SW}" stroke-linejoin="round"/>` : ln(`M88 ${c.my + 8}Q100 ${c.my - 3} 112 ${c.my + 8}`, c.dark, 3),
        over: `<path d="${streams}" stroke="${TEAR}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".85"/>` +
          (c.x ? [-1, 1].map(s => `<ellipse cx="${100 + s * 34}" cy="${c.ey + 10 + len}" rx="14" ry="3.5" fill="${TEAR}" opacity=".6"/>` + `<circle cx="${100 + s * 52}" cy="${c.ey + 4}" r="3" fill="${TEAR}"/><circle cx="${100 + s * 58}" cy="${c.ey + 16}" r="2" fill="${TEAR}"/>`).join("") : ""),
      };
    },
    生氣: c => {
      const t = c.ey - 30, k = c.x ? 1.35 : 1;
      const puff = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * k)}"/>`;
      const vein = (x, y) => ln(`M${x - 7} ${y - 2}q5 0 5-5M${x + 2} ${y - 7}q0 5 5 5M${x + 7} ${y + 2}q-5 0-5 5M${x - 2} ${y + 7}q0-5-5-5`, "#D9473A", 2.5);
      return {
        look: [[0, 1], [0, 1]], pr: c.x ? 3 : 3.6, blush: .95,
        brow: ln(`M${100 - c.ex - 16} ${c.ey - 26}L${100 - c.ex + 12} ${c.ey - 15}M${100 + c.ex + 16} ${c.ey - 26}L${100 + c.ex - 12} ${c.ey - 15}`, c.dark, c.x ? 5 : 4),
        mouth: c.x
          ? `<rect x="82" y="${c.my - 5}" width="36" height="16" rx="4" fill="#fff" stroke="${c.dark}" stroke-width="${SW}"/>` + ln(`M82 ${c.my + 3}h36M91 ${c.my - 5}v16M100 ${c.my - 5}v16M109 ${c.my - 5}v16`, c.dark, 1.8)
          : `<rect x="86" y="${c.my - 2}" width="28" height="11" rx="3" fill="#fff" stroke="${c.dark}" stroke-width="${SW}"/>` + ln(`M95 ${c.my - 2}v11M105 ${c.my - 2}v11`, c.dark, 1.8),
        over: `<g fill="#D6D5CF" opacity=".9">${puff(44, t + 2, 7) + puff(34, t - 10, 5) + puff(156, t + 2, 7) + puff(166, t - 10, 5) + (c.x ? puff(28, t - 22, 4) + puff(172, t - 22, 4) : "")}</g>` + vein(150, t - 12) + (c.x ? vein(52, t - 16) + (c.img ? "" : `<ellipse cx="100" cy="${c.cy}" rx="${c.rx - 4}" ry="${c.ry - 4}" fill="#E0503F" opacity=".14"/>`) : ""),
      };
    },
    // 俄國8+9：俄羅斯街頭屁孩。深色運動服（兩條白線）、一邊眉毛挑高、得意的歪嘴笑、嘴角叼瓜子、地上一些瓜子殼
    "俄國8+9": c => {
      const yj = c.my + 13, dy = (yj - c.cy) / c.ry, x = c.x;
      let outfit = "";
      if (!c.img && Math.abs(dy) < .97) {
        const dx = n(c.rx * Math.sqrt(1 - dy * dy)), bot = n(c.cy + c.ry * .84);
        const side = s => [6, 11].map(ins => { const pts = []; for (let i = 0; i <= 6; i++) { const y = yj + 6 + (bot - yj - 6) * i / 6, t = (y - c.cy) / (c.ry - ins); if (Math.abs(t) < 1) pts.push(`${n(100 + s * (c.rx - ins) * Math.sqrt(1 - t * t))} ${n(y)}`); } return pts.length > 1 ? "M" + pts.join("L") : ""; }).join("");
        outfit = `<path d="M${n(100 - dx)} ${yj}Q${n(100 - dx * .4)} ${yj - 3} 92 ${yj + 2}L100 ${yj + 15}L108 ${yj + 2}Q${n(100 + dx * .4)} ${yj - 3} ${n(100 + dx)} ${yj}A${c.rx} ${c.ry} 0 ${yj < c.cy ? 1 : 0} 1 ${n(100 - dx)} ${yj}Z" fill="${SUIT}" stroke="${SUIT_D}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M93.5 ${yj + 3}L100 ${yj + 13}L106.5 ${yj + 3}Z" fill="${STRIPE}"/>` + ln(side(-1) + side(1), STRIPE, 1.8) + ln(`M100 ${yj + 15}V${n(c.cy + c.ry - 4)}`, "#59607A", 1.4) + ln(`M${n(100 - dx * .5)} ${yj - 1}Q91 ${yj} 100 ${yj + 15}Q109 ${yj} ${n(100 + dx * .5)} ${yj - 1}`, "#3D4666", 3) + `<rect x="98.2" y="${yj + 15}" width="3.6" height="6" rx="1" fill="#C9C7C0"/>`;
      }
      const sh = (c.x ? [[100, 187, 8], [170, 186, -25], [32, 186, 18], [124, 190, 40], [62, 191, -10]] : [[100, 187, 8], [170, 186, -25], [32, 186, 18]]).map(a => shell(...a)).join("");
      return {
        suit: !c.img, outfit, under: c.img ? "" : sh,
        look: [[0, 1], [0, 1]], pr: x ? 3.8 : 4.3, hl: 1, blush: .18,
        brow: ln(`M${100 - c.ex - 12} ${c.ey - (x ? 29 : 25)}Q${100 - c.ex} ${c.ey - (x ? 41 : 34)} ${100 - c.ex + 12} ${c.ey - (x ? 29 : 26)}`, c.dark, 3.2) + ln(`M${100 + c.ex - 13} ${c.ey - 19}L${100 + c.ex + 13} ${c.ey - 24}`, c.dark, 3.6),
        mouth: ln(x ? `M84 ${c.my + 3}Q99 ${c.my + 10} 116 ${c.my - 4}` : `M86 ${c.my + 4}Q99 ${c.my + 8} 113 ${c.my - 1}`, c.dark, 3) + ln(x ? `M116 ${c.my - 4}l3-3` : `M113 ${c.my - 1}l3-2.5`, c.dark, 2.4) + seed(81, c.my + 5, 14, 1.5),
        over: c.img ? sh : x ? shell(66, c.my - 6, -40) + ln(`M73 ${c.my - 2}l7 2M72 ${c.my + 3}l7 1`, c.dark, 1.4, ' opacity=".6"') : "",
      };
    },
  };
  MOODS.俄國8 = MOODS["俄國8+9"];   // 舊存檔的名字
  const bubble = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#EAF6FB" fill-opacity=".6" stroke="#8CC6DC" stroke-width="1.2"/><circle cx="${n(x - r * .35)}" cy="${n(y - r * .35)}" r="${n(r * .25)}" fill="#fff"/>`;
  // 微醺：瞇成彎彎的笑眼（不是半垂的眼皮）、臉頰特別紅、打嗝的小泡泡
  MOODS.微醺 = c => ({
    closed: 1, blush: .9, blushC: "#FF6F86", blushK: c.x ? 1.45 : 1.25,
    mouth: ln(`M88 ${c.my + 2}Q94 ${c.my + 8} 100 ${c.my + 3}Q106 ${c.my + 9} 112 ${c.my + 2}`, c.dark, 3),
    over: bubble(119, c.my - 8, 4.5) + (c.x ? bubble(129, c.my - 21, 6.5) + bubble(138, c.my - 37, 3) + (c.img ? "" : `<ellipse cx="100" cy="${c.ey + (c.bo || 31)}" rx="${c.ex + 18}" ry="6" fill="#FF6F86" opacity=".28"/>`) + ln(`M${100 - c.ex - 22} ${c.ey - 26}q5-6 10 0t10 0M${100 + c.ex + 4} ${c.ey - 30}q5-6 10 0t10 0`, c.dark, 1.6, ' opacity=".6"') : ""),
  });
  // 虔誠：閉眼、安詳的小微笑、頭上一圈淡淡的細光環
  MOODS.虔誠 = c => {
    const hy = c.img ? c.ey - 44 : c.ey - 26, x = c.x;
    const halo = (x ? `<ellipse cx="100" cy="${hy}" rx="46" ry="13" fill="#F6E3A1" opacity=".3"/>` + ln(`M100 ${hy - 12}v-9M80 ${hy - 10}l-4-8M120 ${hy - 10}l4-8M62 ${hy - 4}l-8-4M138 ${hy - 4}l8-4`, "#E2C266", 1.5, ' opacity=".8"') : "") +
      `<ellipse cx="100" cy="${hy}" rx="${x ? 34 : 30}" ry="${x ? 7.5 : 6.5}" fill="none" stroke="#D9B44A" stroke-width="${x ? 2.4 : 1.6}" opacity="${x ? .95 : .7}"/>`;
    return { closed: 2, blush: .35, mouth: ln(`M93 ${c.my + 3}Q100 ${c.my + 8} 107 ${c.my + 3}`, c.dark, 2.6), under: c.img ? "" : halo, over: (c.img ? halo : "") + (x ? spark(100 - c.ex - 30, c.ey + 4, 5, "#E2C266") + spark(100 + c.ex + 30, c.ey - 6, 4, "#E2C266") : "") };
  };
  const calm = c => ({ look: [[0, 0], [0, 0]], pr: 4.5, hl: 1, blush: .5, mouth: ln(`M90 ${c.my + 2}Q100 ${c.my + 10} 110 ${c.my + 2}`, c.dark, 3) });

  // ---------- 帽子：底邊在 y=h、中心 x=100；不認得的畫一頂毛帽 ----------
  const HATS = {
    沒有: { h: 0, svg: () => "" },
    棒球帽: { h: 30, svg: h => `<path d="M128 ${h - 3}Q158 ${h - 8} 172 ${h + 1}Q150 ${h + 6} 126 ${h + 3}Z" fill="#2F5BA8" stroke="#22427C" stroke-width="${SW}" stroke-linejoin="round"/><path d="M65 ${h + 2}Q64 ${h - 38} 100 ${h - 38}Q136 ${h - 38} 135 ${h + 2}Z" fill="#3E6FC8" stroke="#22427C" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M100 ${h - 37}V${h + 1}M66 ${h - 4}Q100 ${h - 9} 134 ${h - 4}`, "#22427C", 1.5) + `<circle cx="100" cy="${h - 38}" r="3" fill="#22427C"/><circle cx="84" cy="${h - 18}" r="5" fill="#FAFAF7"/>` },
    巫師帽: { h: 68, svg: h => `<path d="M72 ${h}Q90 ${h - 30} 116 ${h - 68}Q112 ${h - 30} 128 ${h}Z" fill="#6B4FA8" stroke="#3F2A70" stroke-width="${SW}" stroke-linejoin="round"/><ellipse cx="100" cy="${h}" rx="40" ry="7" fill="#5A3F94" stroke="#3F2A70" stroke-width="${SW}"/>` + ln(`M80 ${h - 10}Q100 ${h - 14} 121 ${h - 10}`, "#E7B93E", 3) + spark(102, h - 30, 7, "#F2CF4E") + spark(112, h - 50, 3.5, "#F2CF4E") },
    皇冠: { h: 32, svg: h => `<path d="M72 ${h}L75 ${h - 27}L88 ${h - 13}L100 ${h - 32}L112 ${h - 13}L125 ${h - 27}L128 ${h}Z" fill="#E7B93E" stroke="#A57C14" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M73 ${h - 6}H127`, "#A57C14", 1.5) + `<circle cx="100" cy="${h - 12}" r="3.5" fill="#D9473A"/><circle cx="85" cy="${h - 7}" r="2.5" fill="#3B6FD6"/><circle cx="115" cy="${h - 7}" r="2.5" fill="#3B6FD6"/><circle cx="75" cy="${h - 28}" r="2.5" fill="#F2CF4E"/><circle cx="100" cy="${h - 33}" r="2.5" fill="#F2CF4E"/><circle cx="125" cy="${h - 28}" r="2.5" fill="#F2CF4E"/>` },
    觸手帽: { h: 66, svg: h => {
      const T = [`M88 ${h - 18}C80 ${h - 32} 64 ${h - 32} 64 ${h - 45}C64 ${h - 54} 75 ${h - 56} 77 ${h - 49}`, `M96 ${h - 21}C94 ${h - 38} 85 ${h - 48} 90 ${h - 58}C94 ${h - 65} 102 ${h - 62} 98 ${h - 56}`, `M105 ${h - 21}C108 ${h - 35} 118 ${h - 42} 115 ${h - 54}C112 ${h - 62} 104 ${h - 59} 107 ${h - 53}`, `M113 ${h - 17}C123 ${h - 26} 137 ${h - 27} 136 ${h - 40}C135 ${h - 48} 126 ${h - 47} 128 ${h - 42}`];
      return T.map(d => ln(d, "#6E4E9A", 9) + ln(d, "#B592DC", 5.5)).join("") +
        `<g fill="#EADCF8"><circle cx="70" cy="${h - 37}" r="1.4"/><circle cx="66" cy="${h - 45}" r="1.3"/><circle cx="89" cy="${h - 44}" r="1.4"/><circle cx="91" cy="${h - 54}" r="1.2"/><circle cx="114" cy="${h - 41}" r="1.4"/><circle cx="116" cy="${h - 50}" r="1.2"/><circle cx="130" cy="${h - 29}" r="1.4"/><circle cx="135" cy="${h - 36}" r="1.2"/></g>` +
        `<path d="M74 ${h + 2}Q74 ${h - 24} 100 ${h - 24}Q126 ${h - 24} 126 ${h + 2}Z" fill="#4B3768" stroke="#2C2040" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M75 ${h - 4}Q100 ${h - 9} 125 ${h - 4}`, "#2C2040", 1.5) +
        `<path d="M91 ${h - 13}Q100 ${h - 21} 109 ${h - 13}Q100 ${h - 5} 91 ${h - 13}Z" fill="#F4EEFB"/><ellipse cx="100" cy="${h - 13}" rx="1.6" ry="3.6" fill="#6B2FA0"/>`;
    } },
    // 毛帽：酒紅色針織帽 + 毛球；紳士帽：黑色高帽 + 酒紅緞帶
    毛帽: { h: 46, svg: h => `<path d="M67 ${h + 1}Q66 ${h - 38} 100 ${h - 39}Q134 ${h - 38} 133 ${h + 1}Z" fill="#A33445" stroke="#5E1622" stroke-width="${SW}" stroke-linejoin="round"/>` + ln([76, 88, 100, 112, 124].map(x => `M${x} ${h - 11}q-3-6 0-12q3-6 0-12`).join(""), "#7E2433", 1.3, ' opacity=".8"') + `<rect x="64" y="${h - 10}" width="72" height="13" rx="6" fill="#8A2838" stroke="#5E1622" stroke-width="${SW}"/>` + ln([72, 80, 88, 96, 104, 112, 120, 128].map(x => `M${x} ${h - 8}v9`).join(""), "#5E1622", 1.1) + `<circle cx="100" cy="${h - 41}" r="8.5" fill="#F3E6C4" stroke="#B9A57A" stroke-width="2" stroke-dasharray="1.6 1.4"/>` },
    紳士帽: { h: 54, svg: h => `<ellipse cx="100" cy="${h}" rx="40" ry="6.5" fill="#262626" stroke="#0E0E0E" stroke-width="${SW}"/><path d="M77 ${h - 1}L79 ${h - 50}Q100 ${h - 54} 121 ${h - 50}L123 ${h - 1}Q100 ${h + 3} 77 ${h - 1}Z" fill="#232323" stroke="#0E0E0E" stroke-width="${SW}" stroke-linejoin="round"/><path d="M78 ${h - 15}Q100 ${h - 12} 122 ${h - 15}L122.6 ${h - 5}Q100 ${h - 1} 77.4 ${h - 5}Z" fill="#7A1F2B"/>` + ln(`M84 ${h - 46}L83 ${h - 18}`, "#5A5A58", 2.2, ' opacity=".7"') + ln(`M78 ${h - 15}Q100 ${h - 12} 122 ${h - 15}`, "#A8404E", 1) },
    // 第 4 版（11-09，決定 0030）：只有每週全簽到拿得到的帽子（樣子是草稿）。館員帽：深藍小帽、金帶、正中間一顆紅色的印；燈籠帽：紅紙燈籠、金色的蓋子和流蘇
    館員帽: { h: 36, svg: h => `<path d="M70 ${h - 3}L66 ${h - 31}Q100 ${h - 41} 134 ${h - 31}L130 ${h - 3}Z" fill="#26345C" stroke="#141C36" stroke-width="${SW}" stroke-linejoin="round"/><ellipse cx="100" cy="${h - 32}" rx="34" ry="7" fill="#33467A" stroke="#141C36" stroke-width="${SW}"/>` +
      `<rect x="69" y="${h - 13}" width="62" height="7" fill="#D9AE3E" stroke="#8A6A12" stroke-width="1.2"/><path d="M72 ${h - 2}Q100 ${h + 10} 128 ${h - 2}Q100 ${h + 3} 72 ${h - 2}Z" fill="#141C36"/>` +
      `<circle cx="100" cy="${h - 23}" r="7" fill="#C8362C" stroke="#7E1A14" stroke-width="1.2"/>` + ln(`M96.5 ${h - 25.5}h7M96.5 ${h - 21}h7M100 ${h - 28}v9`, "#F6E7C8", 1.2) },
    燈籠帽: { h: 66, svg: h => `<rect x="78" y="${h - 7}" width="44" height="8" rx="2.5" fill="#C99A2E" stroke="#8A6512" stroke-width="1.5"/><ellipse cx="100" cy="${h - 31}" rx="33" ry="25" fill="#D9382E" stroke="#8E1E18" stroke-width="${SW}"/>` +
      ln(`M100 ${h - 55}V${h - 7}M84 ${h - 53}Q75 ${h - 31} 84 ${h - 8}M116 ${h - 53}Q125 ${h - 31} 116 ${h - 8}`, "#9E241C", 1.4) + `<ellipse cx="90" cy="${h - 39}" rx="7" ry="10" fill="#F58A6E" opacity=".45"/>` +
      `<rect x="82" y="${h - 60}" width="36" height="8" rx="2.5" fill="#C99A2E" stroke="#8A6512" stroke-width="1.5"/>` + ln(`M100 ${h - 60}V${h - 64}`, "#8A6512", 2) + `<circle cx="100" cy="${h - 65}" r="2.6" fill="#C99A2E"/>` +
      ln(`M133 ${h - 28}q5 10 2 22M136 ${h - 28}q7 10 5 20`, "#E2B53E", 1.6) },
    // 第 4 版（11-09，決定 0032）：兌換所賣的限定頭飾（樣子是草稿；戴在遊戲自己的青蛙上）
    // 黃雨帽：鮮黃的圓頂、後面的帽簷特別長（往右垂下去）
    黃雨帽: { h: 34, svg: h => `<path d="M60 ${h + 2}Q100 ${h + 11} 138 ${h + 2}Q160 ${h + 3} 172 ${h + 19}Q148 ${h + 11} 128 ${h + 9}Q100 ${h + 13} 72 ${h + 9}Q62 ${h + 8} 60 ${h + 2}Z" fill="#E5AE1E" stroke="#94700E" stroke-width="${SW}" stroke-linejoin="round"/>` +
      `<path d="M67 ${h + 3}Q66 ${h - 34} 100 ${h - 34}Q134 ${h - 34} 133 ${h + 3}Q100 ${h + 9} 67 ${h + 3}Z" fill="#F4C93A" stroke="#94700E" stroke-width="${SW}" stroke-linejoin="round"/>` +
      ln(`M100 ${h - 33}V${h + 5}M82 ${h - 28}Q76 ${h - 12} 76 ${h + 4}M118 ${h - 28}Q124 ${h - 12} 124 ${h + 4}`, "#B98F1E", 1.4) + `<ellipse cx="85" cy="${h - 20}" rx="6" ry="9" fill="#FFF0A8" opacity=".6"/>` },
    // 廚師帽：白色、又高又蓬，底下一圈帽帶
    廚師帽: { h: 60, svg: h => `<path d="M74 ${h - 11}Q54 ${h - 28} 72 ${h - 42}Q74 ${h - 62} 100 ${h - 58}Q126 ${h - 62} 128 ${h - 42}Q146 ${h - 28} 126 ${h - 11}Z" fill="#FBFAF4" stroke="#A9A595" stroke-width="${SW}" stroke-linejoin="round"/>` +
      ln(`M86 ${h - 16}Q84 ${h - 32} 88 ${h - 44}M100 ${h - 16}V${h - 46}M114 ${h - 16}Q116 ${h - 32} 112 ${h - 44}`, "#C9C5B6", 1.5) +
      `<rect x="72" y="${h - 13}" width="56" height="15" rx="3.5" fill="#EFECE0" stroke="#A9A595" stroke-width="${SW}"/>` },
    // 毛耳罩：頭頂一條帶子，兩邊粉紅色毛茸茸的耳罩
    毛耳罩: { h: 12, svg: h => ln(`M60 ${h + 24}Q58 ${h - 14} 100 ${h - 14}Q142 ${h - 14} 140 ${h + 24}`, "#7A4E94", 5.5) + ln(`M60 ${h + 24}Q58 ${h - 14} 100 ${h - 14}Q142 ${h - 14} 140 ${h + 24}`, "#A67CC0", 2.2) +
      [58, 142].map(x => `<circle cx="${x}" cy="${h + 31}" r="14.5" fill="#F4A9C0" stroke="#B9627E" stroke-width="2" stroke-dasharray="2.4 1.6"/><circle cx="${x}" cy="${h + 31}" r="7.5" fill="#FBD3DF"/>`).join("") },
    // 礦工帽：黃色硬殼帽，前面一盞小燈
    礦工帽: { h: 38, svg: h => `<path d="M66 ${h}Q65 ${h - 37} 100 ${h - 37}Q135 ${h - 37} 134 ${h}Z" fill="#E8A91F" stroke="#8C640C" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M100 ${h - 36}V${h - 28}M78 ${h - 30}Q72 ${h - 16} 72 ${h - 2}M122 ${h - 30}Q128 ${h - 16} 128 ${h - 2}`, "#B58314", 1.6) +
      `<rect x="57" y="${h - 4}" width="86" height="9" rx="4.5" fill="#D29A18" stroke="#8C640C" stroke-width="${SW}"/><rect x="88" y="${h - 25}" width="24" height="17" rx="3" fill="#4A4A4A" stroke="#222" stroke-width="1.6"/><circle cx="100" cy="${h - 17}" r="7" fill="#FFF3A8" stroke="#C99A2E" stroke-width="1.6"/>` + spark(100, h - 17, 4, "#FFFFFF") },
    // 花環：綠色的圈，上面一圈小花
    花環: { h: 11, svg: h => `<ellipse cx="100" cy="${h - 2}" rx="37" ry="8" fill="none" stroke="#5E9A4A" stroke-width="4.5"/>` +
      [[64, 0, "#F4A9C0"], [76, -7, "#FFF6D6"], [90, -10, "#F2CF4E"], [106, -10, "#F4A9C0"], [122, -7, "#FFF6D6"], [136, 0, "#F2CF4E"], [120, 5, "#F4A9C0"], [100, 7, "#FFF6D6"], [80, 5, "#F2CF4E"]].map(([x, d, c]) => {
        const y = h - 2 + d;
        return [[0, -4], [3.8, -1.2], [2.4, 3.2], [-2.4, 3.2], [-3.8, -1.2]].map(([a, b]) => `<circle cx="${x + a}" cy="${y + b}" r="2.9" fill="${c}" stroke="#A98A5E" stroke-width=".6"/>`).join("") + `<circle cx="${x}" cy="${y}" r="1.9" fill="#D9842E"/>`;
      }).join("") },
    // 蝴蝶結：紅色的大蝴蝶結，放在頭頂上
    蝴蝶結: { h: 28, svg: h => [1, -1].map(s => `<path d="M100 ${h - 11}Q${100 + s * 16} ${h - 34} ${100 + s * 37} ${h - 24}Q${100 + s * 42} ${h - 12} ${100 + s * 36} ${h + 1}Q${100 + s * 18} ${h + 3} 100 ${h - 7}Z" fill="#D9382E" stroke="#8E1E18" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M${100 + s * 9} ${h - 12}Q${100 + s * 22} ${h - 18} ${100 + s * 30} ${h - 18}M${100 + s * 9} ${h - 9}Q${100 + s * 20} ${h - 7} ${100 + s * 29} ${h - 5}`, "#A8281F", 1.5)).join("") +
      `<rect x="91" y="${h - 17}" width="18" height="15" rx="5" fill="#E85A4E" stroke="#8E1E18" stroke-width="${SW}"/>` },
    // 鐵鍋帽：一口小鐵鍋，握把朝旁邊
    鐵鍋帽: { h: 34, svg: h => `<rect x="130" y="${h - 25}" width="38" height="7" rx="3.5" fill="#3B3B3B" stroke="#1E1E1E" stroke-width="1.8"/><path d="M67 ${h}L72 ${h - 30}Q100 ${h - 36} 128 ${h - 30}L133 ${h}Q100 ${h + 7} 67 ${h}Z" fill="#8C9299" stroke="#464B50" stroke-width="${SW}" stroke-linejoin="round"/>` +
      `<ellipse cx="100" cy="${h - 31}" rx="28" ry="4.6" fill="#5F656B" stroke="#464B50" stroke-width="1.8"/>` + ln(`M82 ${h - 22}L80 ${h - 2}`, "#C8CDD2", 3, ' opacity=".8"') + ln(`M92 ${h - 22}L91 ${h - 8}`, "#C8CDD2", 1.8, ' opacity=".6"') },
    // 摺紙帽：舊報紙摺的三角帽，上面有幾行看不清楚的字（只有線條）
    摺紙帽: { h: 46, svg: h => `<path d="M62 ${h - 1}L100 ${h - 46}L138 ${h - 1}Z" fill="#EFE8D2" stroke="#857D66" stroke-width="${SW}" stroke-linejoin="round"/><path d="M57 ${h - 3}H143L138 ${h + 8}H62Z" fill="#E2DAC0" stroke="#857D66" stroke-width="${SW}" stroke-linejoin="round"/>` +
      ln(`M100 ${h - 45}V${h - 3}`, "#B5AD94", 1.2) + ln(`M86 ${h - 20}H96M83 ${h - 14}H96M80 ${h - 8}H96M104 ${h - 20}H114M104 ${h - 14}H117M104 ${h - 8}H120M68 ${h + 2}H132`, "#8F876E", 1.3) },
  };
  const beanie ={ h: 40, svg: h => `<path d="M68 ${h + 1}Q68 ${h - 36} 100 ${h - 36}Q132 ${h - 36} 132 ${h + 1}Z" fill="#5FAF68" stroke="#2F6E38" stroke-width="${SW}" stroke-linejoin="round"/><rect x="66" y="${h - 9}" width="68" height="11" rx="5" fill="#4C9A56" stroke="#2F6E38" stroke-width="${SW}"/>` + ln(`M78 ${h - 8}v9M90 ${h - 8}v9M100 ${h - 8}v9M110 ${h - 8}v9M122 ${h - 8}v9`, "#2F6E38", 1.2) + `<circle cx="100" cy="${h - 38}" r="7" fill="#F6F1D6" stroke="#2F6E38" stroke-width="${SW}"/>` };
  const hatOf = name => HATS[name] || beanie;
  // ---------- 主題展、每週特展的限定配件（11-09，決定 0035，樣子都是草稿） ----------
  // 帽子一樣畫在頭頂（h、svg）。首飾沒有 h，改寫 wear（g 是 wearGeo 算的位置）：畫在身體上，倒立時跟著身體轉。
  const flowerAt = (x, y, r, c, core = "#F6D45A") => [0, 72, 144, 216, 288].map(a => `<circle cx="${n(x + r * Math.sin(a * Math.PI / 180))}" cy="${n(y - r * Math.cos(a * Math.PI / 180))}" r="${n(r * .72)}" fill="${c}" stroke="#B0708A" stroke-width=".8"/>`).join("") + `<circle cx="${x}" cy="${y}" r="${n(r * .7)}" fill="${core}" stroke="#A57C14" stroke-width=".8"/>`;
  const miniPillow = (x, y, s, c = "#F3E6C4", d = "#A08A62") => `<g transform="translate(${n(x)} ${n(y)}) scale(${s})"><path d="M-13-9Q0-6 13-9Q10 0 13 9Q0 6-13 9Q-10 0-13-9Z" fill="${c}" stroke="${d}" stroke-width="1.8" stroke-linejoin="round"/><circle r="2.2" fill="${d}"/></g>`;
  const bowTie = (g, c, d, rot, extra = "") => `<g transform="translate(100 ${n(g.ny + 2)}) rotate(${rot})"><path d="M-3-3L-22-12Q-26 0-22 12L-3 3Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M3-3L22-12Q26 0 22 12L3 3Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><rect x="-5" y="-5.5" width="10" height="11" rx="2.5" fill="${c}" stroke="${d}" stroke-width="2"/>${extra}</g>`;
  // 瓜子串成一圈：沿著脖子的弧線擺
  const seedNecklace = (g, fill, line, cord) => {
    const q = t => { const x0 = 100 - g.nw + 5, x1 = 100 + g.nw - 5, y0 = g.ny - 12, yc = g.ny + 18; return [(1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * 100 + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * yc + t * t * y0]; };
    const bead = (x, y, r, s) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(r)}) scale(${s})"><path d="M-6 0Q-1-3.6 5 0Q-1 3.6-6 0Z" fill="${fill}" stroke="${line}" stroke-width=".5"/>` + ln("M-3.8-.9L2.8-.5M-3.8.9L2.8.5", line, .8) + `</g>`;
    let s = ln(`M${n(q(0)[0])} ${n(q(0)[1])}Q100 ${n(g.ny + 18)} ${n(q(1)[0])} ${n(q(1)[1])}`, cord, 1.5);
    [.1, .22, .34, .66, .78, .9].forEach(t => { const [x, y] = q(t), [x2, y2] = q(t + .02); s += bead(x, y, Math.atan2(y2 - y, x2 - x) * 180 / Math.PI + 90, 1); });
    const [mx, my] = q(.5);
    return s + bead(mx, my + 6, 90, 1.9);
  };
  Object.assign(HATS, {
    傳說的金冠: { h: 46, svg: h => `<path d="M66 ${h}L61 ${h - 28}L80 ${h - 14}L87 ${h - 40}L100 ${h - 20}L113 ${h - 40}L120 ${h - 14}L139 ${h - 28}L134 ${h}Z" fill="#F2C744" stroke="#9A7010" stroke-width="${SW}" stroke-linejoin="round"/>` +
      `<path d="M65 ${h - 11}H135L134 ${h}H66Z" fill="#B3262E" stroke="#9A7010" stroke-width="1.5"/>` + [78, 100, 122].map((x, i) => `<circle cx="${x}" cy="${h - 5.5}" r="${i === 1 ? 3.6 : 2.6}" fill="${i === 1 ? "#E9F3FF" : "#FFE28A"}" stroke="#7A5A10" stroke-width=".9"/>`).join("") +
      [[61, 28], [87, 40], [113, 40], [139, 28]].map(([x, y]) => `<circle cx="${x}" cy="${h - y - 1}" r="3" fill="#FFE28A" stroke="#9A7010" stroke-width="1"/>`).join("") + spark(100, h - 30, 4.5, "#FFF6CF") },
    火氣頭帶: { h: 30, svg: h => `<path d="M140 ${h - 6}L156 ${h + 2}L150 ${h - 9}L158 ${h - 16}L140 ${h - 11}Z" fill="#B82C24" stroke="#7E1A14" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M63 ${h + 3}Q100 ${h - 7} 137 ${h + 3}L137 ${h - 9}Q100 ${h - 19} 63 ${h - 9}Z" fill="#D9382E" stroke="#8E1E18" stroke-width="${SW}" stroke-linejoin="round"/>` + ln(`M66 ${h - 4}Q100 ${h - 13} 134 ${h - 4}`, "#F58A6E", 1.2) +
      `<path d="M100 ${h - 34}C90 ${h - 25} 88 ${h - 19} 91 ${h - 13}Q100 ${h - 9} 109 ${h - 13}C113 ${h - 21} 106 ${h - 24} 100 ${h - 34}Z" fill="#F58A2E" stroke="#B3451A" stroke-width="1.6" stroke-linejoin="round"/><path d="M100 ${h - 25}C96 ${h - 21} 95 ${h - 17} 97 ${h - 14}Q100 ${h - 12} 103 ${h - 14}C105 ${h - 18} 103 ${h - 21} 100 ${h - 25}Z" fill="#FFE28A"/>` },
    淚滴耳環: { h: 0, wear: g => [-1, 1].map(sd => { const x = 100 + sd * g.ax, y = g.ay; return ln(`M${n(x)} ${n(y - 5)}Q${n(x + sd * 3)} ${n(y - 1)} ${n(x)} ${n(y + 2)}`, "#C99A2E", 1.8) + `<path d="M${n(x)} ${n(y + 2)}Q${n(x - 6.5)} ${n(y + 12)} ${n(x)} ${n(y + 17)}Q${n(x + 6.5)} ${n(y + 12)} ${n(x)} ${n(y + 2)}Z" fill="${TEAR}" stroke="#3E8FBE" stroke-width="1.5"/><ellipse cx="${n(x - 1.8)}" cy="${n(y + 10)}" rx="1.3" ry="2.6" fill="#fff" opacity=".85"/>`; }).join("") },
    瓜子項鍊: { h: 0, wear: g => seedNecklace(g, "#2B2B2A", "#D9D6CC", "#6B5A3E") },
    彩虹圍巾: { h: 0, wear: g => {
      const cols = ["#D9463A", "#4FA34F", "#EDBE2E", "#2B2B2A"], tx = n(100 + g.nw * .42);
      return cols.map((c, i) => ln(`M${n(100 - g.nw)} ${n(g.ny - 11 + i * 5)}Q100 ${n(g.ny + 7 + i * 5)} ${n(100 + g.nw)} ${n(g.ny - 11 + i * 5)}`, c, 5.4)).join("") +
        `<g transform="translate(${tx} ${n(g.ny + 4)}) rotate(-8)">${cols.map((c, i) => `<rect x="${-11 + i * 5.5}" y="0" width="5.5" height="27" fill="${c}"/>`).join("")}${ln("M-9 27v5M-3.5 27v5M2 27v5M7.5 27v5", "#6B5A3E", 1.3)}</g>`;
    } },
    三層帽: { h: 62, svg: h => `<path d="M88 ${h - 42}L100 ${h - 62}L112 ${h - 42}Z" fill="#6B4FA8" stroke="#3F2A70" stroke-width="${SW}" stroke-linejoin="round"/><circle cx="100" cy="${h - 62}" r="2.6" fill="#E7B93E"/>` +
      `<rect x="80" y="${h - 42}" width="40" height="16" rx="2" fill="#A33445" stroke="#5E1622" stroke-width="${SW}"/><ellipse cx="100" cy="${h - 42}" rx="24" ry="4" fill="#C8576A" stroke="#5E1622" stroke-width="1.6"/>` +
      `<path d="M128 ${h - 3}Q158 ${h - 8} 172 ${h + 1}Q150 ${h + 6} 126 ${h + 3}Z" fill="#2F5BA8" stroke="#22427C" stroke-width="${SW}" stroke-linejoin="round"/><path d="M65 ${h + 2}Q64 ${h - 30} 100 ${h - 30}Q136 ${h - 30} 135 ${h + 2}Q100 ${h + 8} 65 ${h + 2}Z" fill="#3D6FC4" stroke="#22427C" stroke-width="${SW}" stroke-linejoin="round"/>` },
    枕頭睡帽: { h: 50, svg: h => `<path d="M67 ${h + 2}Q70 ${h - 38} 110 ${h - 44}Q144 ${h - 48} 156 ${h - 18}Q138 ${h - 30} 128 ${h - 25}Q134 ${h - 10} 133 ${h + 2}Q100 ${h + 8} 67 ${h + 2}Z" fill="#EEF2FA" stroke="#5A6C96" stroke-width="${SW}" stroke-linejoin="round"/>` +
      ln(`M75 ${h - 16}Q100 ${h - 26} 124 ${h - 12}M88 ${h - 33}Q110 ${h - 40} 130 ${h - 32}`, "#7E93C4", 4) + `<path d="M66 ${h - 4}Q100 ${h + 3} 134 ${h - 4}L134 ${h + 3}Q100 ${h + 10} 66 ${h + 3}Z" fill="#7E93C4" stroke="#5A6C96" stroke-width="1.6" stroke-linejoin="round"/>` + miniPillow(158, h - 10, .85) },
    歡笑花環: { h: 16, svg: h => [[68, 4, "#F7B6C8"], [83, -3, "#FFFFFF"], [117, -3, "#FFFFFF"], [132, 4, "#F7B6C8"]].map(([x, dy, c]) => flowerAt(x, h + dy - 6, 6.2, c)).join("") + flowerAt(100, h - 9, 8.6, "#F58FB0") +
      `<circle cx="97" cy="${h - 10.5}" r=".9" fill="#5E3A10"/><circle cx="103" cy="${h - 10.5}" r=".9" fill="#5E3A10"/>` + ln(`M96.6 ${h - 8.2}Q100 ${h - 5.6} 103.4 ${h - 8.2}`, "#5E3A10", 1) },
    躺平眼罩: { h: 24, svg: h => ln(`M62 ${h + 1}Q100 ${h - 10} 138 ${h + 1}`, "#2A2F4A", 4) + `<path d="M70 ${h - 3}Q70 ${h - 22} 100 ${h - 22}Q130 ${h - 22} 130 ${h - 3}Q115 ${h + 2} 100 ${h - 3}Q85 ${h + 2} 70 ${h - 3}Z" fill="#3B4470" stroke="#1F2440" stroke-width="${SW}" stroke-linejoin="round"/>` +
      ln(`M78 ${h - 12}Q85 ${h - 7} 92 ${h - 12}M108 ${h - 12}Q115 ${h - 7} 122 ${h - 12}`, "#E8E2C8", 2) + `<text x="133" y="${h - 16}" font-size="11" font-family="serif" fill="#8A95C8">z</text><text x="141" y="${h - 23}" font-size="8" font-family="serif" fill="#8A95C8">z</text>` },
    縫過的領結: { h: 0, wear: g => bowTie(g, "#B8554A", "#6E2A22", -17, ln("M-16-5L-14-1M-12-7L-10-2M-8-6L-6-2", "#F3E6C4", 1.2) + ln("M-18-7L-5-3", "#F3E6C4", .9, ' stroke-dasharray="2 1.6"') + `<rect x="10" y="-5" width="9" height="9" fill="#D9B98A" stroke="#6E2A22" stroke-width="1" stroke-dasharray="1.8 1.4"/>`) },
    // 每週特展的（換色共用畫法）：黑絨領結、金瓜子項鍊共用上面兩個；小枕頭髮夾用睡帽尾巴那顆枕頭
    黑絨領結: { h: 0, wear: g => bowTie(g, "#2B2B2E", "#0E0E10", 0, ln("M-18-6L-7-2M18-6L7-2", "#55555C", 1.2) + `<circle r="2.2" fill="#E2B53E" stroke="#8A6512" stroke-width=".8"/>`) },
    小枕頭髮夾: { h: 10, svg: h => ln(`M112 ${h + 2}L146 ${h - 7}`, "#C99A2E", 2.6) + miniPillow(130, h - 6, 1.05, "#F7CBD8", "#B0708A") },
    金瓜子項鍊: { h: 0, wear: g => seedNecklace(g, "#E2B53E", "#8A6512", "#C99A2E") },
  });
  // 首飾的位置：ny、nw 是脖子（嘴巴下面）的高度、身體在那裡的半寬；ax、ay 是耳環掛的地方（眼睛外側，不超出身體）
  const wearGeo = g => {
    const half = y => g.rx * Math.sqrt(Math.max(0, 1 - ((y - g.cy) / g.ry) ** 2));
    const ny = g.ey + (g.mo || 36) + (g.squat ? 14 : g.flat ? 12 : 24), ay = g.ey + (g.bo || 31) - 12; // 開心的嘴張得很大：脖子要再低一點，才不會蓋到嘴；蹲著的前臂擋在兩邊，只畫中間
    return { ny, nw: g.squat ? Math.min(half(ny), 36) : half(ny), ax: Math.min(half(ay) - 1, g.ex + g.er + 7), ay };
  };

  // ---------- 稀有度光暈（只有 o.fx 才畫） ----------
  const AURA = {
    普通: (id, c) => glow(id, c, .16),
    稀有: (id, c) => glow(id, c, .22) + spark(36, 52, 5, c, ' opacity=".5"') + spark(166, 70, 4, c, ' opacity=".45"'),
    超稀有: (id, c) => glow(id, c, .28) + spark(34, 50, 6, c, ' opacity=".55"') + spark(168, 64, 5, c, ' opacity=".5"') + spark(170, 150, 4, c, ' opacity=".4"'),
    傳說級稀有: (id, c) => glow(id, c, .3) + `<circle class="spin" style="transform-box:fill-box;transform-origin:center" cx="100" cy="112" r="88" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 9" opacity=".55"/>` + spark(30, 60, 6, c, ' opacity=".6"') + spark(172, 56, 5, c, ' opacity=".6"'),
    不可名狀: (id, c) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity=".2"/><stop offset=".55" stop-color="#4A3A66" stop-opacity=".42"/><stop offset=".8" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><ellipse cx="100" cy="110" rx="99" ry="94" fill="url(#${id})"/>` +
      [[30, 66, 1.25, -12], [168, 44, 1, 10], [172, 140, .85, -6]].map(([x, y, s, r]) => `<g class="f-void-eye" opacity=".8" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M-10 0Q0-8 10 0Q0 8-10 0Z" fill="#EDE7F6" stroke="#2A2238" stroke-width=".8"/><ellipse rx="2.2" ry="5" fill="#2A2238"/></g>`).join(""),
  };
  const glow = (id, c, a) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${a}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><circle cx="100" cy="112" r="94" fill="url(#${id})"/>`;

  // ---------- 背景（框起來的背板，畫在青蛙後面）；沒有 = 不畫 ----------
  // 每個背景都畫滿 -100..300 的範圍（圖樣用 userSpaceOnUse），所以抱枕可以滿版印
  const BIG = `x="-100" y="-100" width="400" height="400"`;
  const dmask = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0-15C5-9 8-4 0 6C-8-4-5-9 0-15ZM0 6C6 8 10 13 6 17C4 13 2 11 0 11C-2 11-4 13-6 17C-10 13-6 8 0 6ZM-9-4C-14-6-15-11-11-13C-12-9-10-7-7-6ZM9-4C14-6 15-11 11-13C12-9 10-7 7-6Z"/><circle cy="-18" r="1.6"/></g>`;
  const dots = list => list.map(([x, y, r, a]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFF6DA" opacity="${a}"/>`).join("");
  const dome = (x, s, top) => `<g transform="translate(${x} ${top}) scale(${s})"><rect x="-11" y="22" width="22" height="80"/><path d="M-15 24C-15 10 0 4 0-10C0 4 15 10 15 24Z"/>${ln("M0-10V-20", "#1A2034", 1.6)}</g>`;
  const BGS = {
    花紋壁紙: id => `<pattern id="${id}p" width="36" height="44" patternUnits="userSpaceOnUse"><g fill="#8C3140">${dmask(18, 16) + dmask(0, 38) + dmask(36, 38) + dmask(0, -6) + dmask(36, -6)}</g></pattern>` +
      `<rect ${BIG} fill="#6B1E2A"/><rect ${BIG} fill="url(#${id}p)" opacity=".8"/><rect x="-100" y="150" width="400" height="150" fill="#4E1520"/><rect x="-100" y="147" width="400" height="4" fill="#C99A2E"/>` + ln("M-100 156H300", "#3B0F18", 1.2) + ln("M28 162V300M100 162V300M172 162V300", "#3B0F18", 1, ' opacity=".6"'),
    星空: id => `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#121936"/><stop offset=".75" stop-color="#34396E"/></linearGradient><pattern id="${id}s" width="70" height="60" patternUnits="userSpaceOnUse">${dots([[8, 10, .9, .9], [30, 4, .6, .6], [52, 18, 1.2, 1], [18, 34, .7, .7], [44, 44, .9, .8], [64, 52, .6, .5], [6, 52, .8, .6], [36, 24, .5, .5]])}</pattern>` +
      `<rect ${BIG} fill="url(#${id}g)"/><rect ${BIG} fill="url(#${id}s)"/>` + spark(42, 44, 4, "#FFF1C2") + spark(118, 30, 2.6, "#FFF1C2") + spark(170, 100, 3, "#FFF1C2") +
      `<circle cx="150" cy="50" r="15" fill="#F3E6C4"/><circle cx="157" cy="45" r="13" fill="#1A2244"/><path d="M-100 172Q-20 150 60 166T220 160T300 168V300H-100Z" fill="#0F1430"/>`,
    雪夜: id => `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset=".2" stop-color="#232C46"/><stop offset=".8" stop-color="#56617F"/></linearGradient><pattern id="${id}w" width="46" height="46" patternUnits="userSpaceOnUse">${[[6, 8, 1.4], [26, 4, 1], [40, 20, 1.7], [14, 28, 1.1], [32, 38, 1.5], [4, 42, .9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".85"/>`).join("")}</pattern>` +
      `<rect ${BIG} fill="url(#${id}g)"/><g fill="#1A2034">${dome(58, .8, 112) + dome(134, 1.1, 96) + dome(176, .6, 124)}<rect x="-100" y="146" width="140" height="60"/><rect x="82" y="138" width="34" height="60"/><rect x="152" y="150" width="148" height="60"/></g>` +
      `<g fill="#F2C46B" opacity=".85"><rect x="10" y="152" width="4" height="5"/><rect x="24" y="152" width="4" height="5"/><rect x="90" y="146" width="4" height="5"/><rect x="104" y="146" width="4" height="5"/><rect x="131" y="134" width="6" height="8" rx="3"/><rect x="190" y="158" width="4" height="5"/></g>` +
      `<path d="M-100 170Q0 160 100 168T300 166V300H-100Z" fill="#EEF2F7"/><rect ${BIG} fill="url(#${id}w)"/>`,
  };
  const BG0 = () => `<rect ${BIG} fill="#EFE4CC"/>`;     // 不認得的背景：一塊羊皮紙色
  const backdrop = (name, full) => {
    const id = nid("b"), B = (BGS[name] || BG0)(id);
    if (full) return B;
    return `<filter id="${id}f" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter><mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect x="17" y="17" width="166" height="166" rx="16" fill="#fff" filter="url(#${id}f)"/></mask>` +
      `<radialGradient id="${id}v" cx=".5" cy=".45" r=".72"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>` +
      `<g class="f-bg" mask="url(#${id}m)">${B}<rect x="16" y="16" width="168" height="168" fill="url(#${id}v)"/><rect x="22" y="22" width="156" height="156" rx="11" fill="none" stroke="#E8D7A8" stroke-width="1" opacity=".35"/></g>`;
  };

  // ---------- 手上拿的東西：(0,0) 是手握的地方，東西往下垂 ----------
  const ITEMS = {
    瓜子: { tilt: 6, lay: "rotate(-90)", svg: () => `<path d="M-8 3L-10 26Q0 29 10 26L8 3Z" fill="#D8B98A" stroke="#8A6A3E" stroke-width="1.6" stroke-linejoin="round"/><rect x="-8.8" y="-2" width="17.6" height="6" rx="1.5" fill="#C9A673" stroke="#8A6A3E" stroke-width="1.6"/>` + ln("M-6 8L-7.5 24", "#B89565", 1) + seed(1, 16, -70, .95) },
    小抱枕: { tilt: 0, lay: "translate(0 -10) rotate(-45)", svg: () => `<g transform="translate(0 13) rotate(45)"><path d="${pPath(0, 0, 17, 17, 4.5, 4)}" fill="#EFE3CC" stroke="#B39E78" stroke-width="1.5"/><circle r="3.6" fill="#7DC35B"/><circle cx="-1.3" cy="-1" r=".8" fill="#1D1D1B"/><circle cx="1.3" cy="-1" r=".8" fill="#1D1D1B"/></g>` + C(0, 1.5, 1.6, "#C99A2E") + C(0, 24.5, 1.6, "#C99A2E") + C(-11.5, 13, 1.6, "#C99A2E") + C(11.5, 13, 1.6, "#C99A2E") },
    放大鏡: { rigid: 1, lay: "rotate(90)", svg: () => `<rect x="-2.4" y="-8" width="4.8" height="17" rx="2.2" fill="#6A4428" stroke="#3E2614" stroke-width="1.2"/><rect x="-3.2" y="-11" width="6.4" height="4" rx="1" fill="#C99A2E"/><circle cy="-20" r="9.5" fill="#DDEFF5" fill-opacity=".55" stroke="#B8892A" stroke-width="2.6"/>` + ln("M-5-23Q-4-26-1-27", "#fff", 1.4) },
  };
  const GIFT = { tilt: 0, lay: "rotate(0)", svg: () => `<rect x="-8" y="6" width="16" height="14" rx="1.5" fill="#F3E6C4" stroke="#8A6A3E" stroke-width="1.4"/><rect x="-1.6" y="6" width="3.2" height="14" fill="#A33445"/>` + ln("M0 0V6M0 6q-6-5-6 0M0 6q6-5 6 0", "#A33445", 1.4) };
  const holdItem = (name, x, y, mode, side, fill, dark, sil, sc = 1.3) => {
    const I = ITEMS[name] || GIFT;
    const tf = mode === "lay" ? I.lay : mode === "foot" ? (I.rigid ? "rotate(180)" : "") : `rotate(${side * (I.rigid ? 18 : I.tilt)})`;
    let s = `<g class="f-item" transform="translate(${n(x)} ${n(y)})${tf ? " " + tf : ""} scale(${sc})">${I.svg()}</g>`;
    if (mode === "hang") s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="6.5" ry="6" fill="${fill}" stroke="${dark}" stroke-width="${SW}"/>`;
    return sil ? flat(s) : s;
  };

  // ---------- 組一隻青蛙 ----------
  const ALIAS = { 俄國8: "俄國8+9", "俄國8+9": "俄國8" };
  const NEWKEYS = { 背景: 1, 手上拿的東西: 1 };   // 新分類是「沒有」時不算進挑圖的雜湊，舊存檔挑到的圖不變
  const pickImg = (p, custom) => {
    if (!custom) return null;
    let pool = asList(custom[p.心情]);
    if (!pool.length && ALIAS[p.心情]) pool = asList(custom[ALIAS[p.心情]]);
    if (!pool.length) pool = asList(custom["全部"]);
    return pool.length ? pool[hashStr(Object.entries(p).filter(([k, v]) => !(NEWKEYS[k] && v === "沒有")).map(e => e[1]).join("|")) % pool.length] : null;
  };
  const E = (cx, cy, rx, ry, rot) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${rot ? ` transform="rotate(${rot} ${n(cx)} ${n(cy)})"` : ""}/>`;
  // 自己的圖 + 斯拉夫蹲：圖放低一點，下面補簡單的膝蓋和腳
  const IMG_SQUAT_LEGS = sym([["foot", 46, 183, 19, 6, 0], ["leg", 38, 170, 10, 14, 8], ["leg", 46, 158, 21, 12, -12]]);
  const PUPILS_INV = 'style="transform:translate(calc(var(--gx,0)*-4px),calc(var(--gy,0)*-4px))"';
  const has = v => v && v !== "沒有";

  function build(pick, o = {}) {
    const p = full(pick), sil = !!o.silhouette, print = !!o.print, x = !!o.extreme;
    const cls = c => print ? "" : ` class="${c}"`;
    const [fill0, dark0] = colorOf(p.顏色), GR = !sil && GRAD[p.顏色];
    let defs = "", fig = "", headTop, box, suit = 0, fillC = fill0;
    if (GR) { const gid = nid("c"); defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${GR.a[0]}" y1="${GR.a[1]}" x2="${GR.a[2]}" y2="${GR.a[3]}">${GR.stops.map(([q, c]) => `<stop offset="${q}" stop-color="${c}"/>`).join("")}</linearGradient>`; fillC = `url(#${gid})`; }
    const fill = sil ? "currentColor" : fillC, dark = sil ? "currentColor" : dark0;
    const img = pickImg(p, o.custom);
    const f = Object.assign({}, FIT0, img ? o.fit || {} : {});
    const g = poseOf(p.姿勢), H = hatOf(p.帽子), mood = MOODS[p.心情] || calm;
    const inv = g.inv ? (H.h ? 90 : 100) : 0;     // 倒立：轉 180° 的中心 x（有帽子時往左挪，帽子放右邊地上）
    const grp = s => s ? `<g fill="${fill}" stroke="${dark}" stroke-width="${SW}">${s}</g>` : "";
    if (img) {
      const squat = g === POSE.斯拉夫蹲;
      const IM = g === POSE.坐著 ? { x: 22, y: 50, w: 156, h: 136 } : squat ? { x: 30, y: 40, w: 140, h: 124 } : { x: 22, y: 38, w: 156, h: 148 };
      const at = `x="${IM.x}" y="${IM.y}" width="${IM.w}" height="${IM.h}"`;
      headTop = IM.y + 2;
      if (sil) {
        const mid = nid("m");
        defs += `<mask id="${mid}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><image href="${esc(img)}" ${at} preserveAspectRatio="xMidYMid meet"/></mask>`;
        fig = `<rect ${at} fill="currentColor" mask="url(#${mid})"/>`;
      } else fig = `<image href="${esc(img)}" ${at} preserveAspectRatio="xMidYMid meet" style="filter:${TINT[p.顏色] || "none"}"/>`;
      if (squat) fig += grp(IMG_SQUAT_LEGS.map(q => E(q[1], q[2], q[3], q[4], q[5])).join(""));
      if (g.seat) fig = seatSVG(sil) + fig; // 自己的圖坐著，也坐在坐墊上
      if (x && !sil) fig += mood({ ex: 40, ey: headTop + 34, my: headTop + 70, cy: 120, rx: 60, ry: 50, dark: dark0, fill: fill0, x: 1, img: 1 }).over || "";
      box = { top: headTop, head: IM.y + IM.h * .52, waist: IM.y + IM.h * .78, bottom: squat ? 189 : IM.y + IM.h };
      if (H.wear) fig += sil ? flat(H.wear(wearGeo({ cy: IM.y + IM.h * .6, rx: IM.w * .36, ry: IM.h * .42, ey: IM.y + IM.h * .22, ex: IM.w * .17, er: 14, mo: IM.h * .28, bo: IM.h * .24 }))) : `<g${cls("f-wear")}>${H.wear(wearGeo({ cy: IM.y + IM.h * .6, rx: IM.w * .36, ry: IM.h * .42, ey: IM.y + IM.h * .22, ex: IM.w * .17, er: 14, mo: IM.h * .28, bo: IM.h * .24 }))}</g>`; // 自己的圖也戴得上首飾（決定 0035）：照圖的比例估
      if (g.inv) { fig = `<g transform="rotate(180 100 112)">${fig}</g>` + grp(E(52, 182, 12, 5) + E(148, 182, 12, 5)); headTop = 186; box = { top: 38, head: 186, waist: 186, bottom: 188, crop: { head: [100, 190], waist: [60, 190] } }; }
    } else {
      const xs = [100 - g.ex, 100 + g.ex], fl = !!o.failed;
      const er = [g.er, fl ? g.er - 4 : g.er], wr = [g.wr, fl ? g.wr * .62 : g.wr];
      const my = g.ey + (g.mo || 36), by = g.ey + (g.bo || 31);
      const m = sil ? {} : mood({ ex: g.ex, ey: g.ey, my, cy: g.cy, rx: g.rx, ry: g.ry, bo: g.bo, dark, fill, x });
      suit = m.suit;
      const limbs = layer => grp(g.parts.filter(q => q[6] === layer).map(q => limb(q, suit)).join(""));
      headTop = g.ey - g.er + 2;
      fig = (m.under || "") + (g.seat ? seatSVG(sil) : "") + limbs("b") + grp(xs.map((cx, i) => E(cx, g.ey, er[i], er[i])).join("") + E(100, g.cy, g.rx, g.ry)) +
        `<g fill="${fill}">${xs.map((cx, i) => E(cx, g.ey, er[i] - SW / 2, er[i] - SW / 2)).join("")}</g>`;
      if (!sil) {
        const look = m.look || [[0, 0], [0, 0]];
        const belly = p.顏色 === "黑" ? "#8A8A85" : GR ? GR.belly : "#F6F1D6";
        fig += g.flat ? E(100, g.cy + 9, g.rx * .55, g.ry * .45).replace("/>", ` fill="${belly}" opacity=".7"/>`) : E(100, g.cy + 14, g.rx * .6, g.ry * .55).replace("/>", ` fill="${belly}"/>`);
        if (GR && GR.shine) fig += E(100 - g.rx * .5, g.cy - g.ry * .38, g.rx * .2, g.ry * .1, -38).replace("/>", ` fill="#fff" opacity=".55"/>`) + xs.map(cx => ln(`M${cx - 11} ${g.ey - 7}Q${cx - 8} ${g.ey - 13} ${cx - 2} ${g.ey - 14}`, "#FFF6CF", 2, ' opacity=".8"')).join("") + spark(100 + g.rx * .62, g.cy + g.ry * .2, 4, "#FFF6CF");
        fig += (m.outfit || "") + limbs("f");
        if (fl) fig += ln(`M${n(100 + g.rx * .62)} ${n(g.cy - g.ry * .55)}Q${n(100 + g.rx * .42)} ${g.cy} ${n(100 + g.rx * .6)} ${n(g.cy + g.ry * .55)}`, dark, 1.8) +
          ln([-.4, -.15, .12, .38].map(t => { const yy = g.cy + t * g.ry * 1.9, xx = 100 + g.rx * (.5 + Math.abs(t) * .22); return `M${n(xx - 5)} ${n(yy - 1)}l10 2`; }).join(""), dark, 1.6) +
          ln(`M100 ${n(g.cy - g.ry + 2)}l-3 6l5 4l-4 6`, dark, 1.6);
        const bk = (x && p.心情 === "生氣" ? 1.3 : 1) * (m.blushK || 1);
        fig += [-1, 1].map(s => E(100 + s * (g.ex + 8), by, 9 * bk, 5 * bk).replace("/>", ` fill="${m.blushC || BLUSH}" opacity="${m.blush}"/>`)).join("");
        let whites = "", pup = "";
        xs.forEach((cx, i) => {
          if (m.closed) { whites += ln(m.closed === 2 ? `M${cx - 8} ${g.ey - 1}Q${cx} ${g.ey + 7} ${cx + 8} ${g.ey - 1}` : `M${cx - 8} ${g.ey + 3}Q${cx} ${g.ey - 9} ${cx + 8} ${g.ey + 3}`, dark, 3.2); return; }
          const k = wr[i] / g.wr, px = n(cx + look[i][0] * k), py = n(g.ey + 1 + look[i][1] * k);
          whites += `<circle cx="${cx}" cy="${g.ey}" r="${n(wr[i])}" fill="#fff"/>`;
          pup += `<circle cx="${px}" cy="${py}" r="${n(m.pr * k)}" fill="${INK}"/>`;
          if (m.hl) pup += `<circle cx="${n(px + 1.8 * k)}" cy="${n(py - 1.8 * k)}" r="${n(1.7 * k)}" fill="#fff"/>`;
          if (m.hl === 2) pup += `<circle cx="${n(px - 1.6 * k)}" cy="${n(py + 2 * k)}" r="${n(1 * k)}" fill="#fff"/>`;
        });
        fig += `<g${cls("f-eyes")}>${whites}<g${cls("f-pupils")}${print ? "" : " " + (inv ? PUPILS_INV : PUPILS)}>${pup}</g></g>` + (m.brow || "") + (m.mouth || "") + (m.over || "");
      } else fig += limbs("f");
      if (H.wear) fig += sil ? flat(H.wear(wearGeo(g))) : `<g${cls("f-wear")}>${H.wear(wearGeo(g))}</g>`; // 首飾（決定 0035）：畫在倒立轉過去之前，會跟著身體轉
      box = { top: headTop, head: g.ey + (g.flat ? 34 : 48), waist: g.flat ? 190 : g.cy + g.ry * .38, bottom: g.flat ? 190 : 187 };
      if (inv) { fig = `<g transform="rotate(180 ${inv} 111)">${fig}</g>`; headTop = 186; box = { top: 30, head: 186, waist: 186, bottom: 188, crop: { head: [104, 190], waist: [56, 190] } }; }
    }
    if (g.thumb) fig += `<g transform="translate(${n(f.handX)} ${n(f.handY)})">${thumb(fill, dark, suit)}</g>`;
    if (has(p.手上拿的東西)) {
      const [hx, hy, mode, side, isc] = img ? (g.flat ? [158, 174, "lay", 1, 1.2] : [166, 146, "free", 1]) : g.hold || POSE.站著.hold;
      fig += mode === "foot" ? holdItem(p.手上拿的東西, 2 * inv - hx, 222 - hy, mode, side, fill, dark, sil, isc) : holdItem(p.手上拿的東西, hx, hy, mode, side, fill, dark, sil, isc);
    }
    let hat = { x: 100, y: headTop, s: 1 };
    if (H.h) {
      const hs = H.svg(headTop), sc = f.hatS * (img ? 1 : g.hs || 1) * (g.inv ? .62 : 1), hx = g.inv ? 172 : 100;
      fig += `<g${cls("f-hat")}><g transform="translate(${hx} ${n(headTop + f.hatY)}) scale(${n(sc * 100) / 100}) translate(-100 ${-headTop})">${sil ? flat(hs) : hs}</g></g>`;
      if (!g.inv) box.top = headTop - H.h * sc + f.hatY;
      hat = { x: hx, y: headTop + f.hatY, s: n(sc * 100) / 100 };
    }
    if (o.perfect && !sil) fig += `<g${cls("f-perfect")}>${g.inv ? spark(146, 30, 7, "#C99A2E") + spark(156, 43, 3.2, "#E2BE5C") : spark(150, headTop - 4, 7, "#C99A2E") + spark(160, headTop + 9, 3.2, "#E2BE5C")}</g>`;
    if (img && g.flat) { fig = `<g transform="translate(0 8) translate(100 120) rotate(-90) scale(.8) translate(-100 -120)">${fig}</g>`; headTop = 66; box = { top: 66, head: 150, waist: 190, bottom: 190 }; hat = { x: 100, y: 66, s: hat.s }; }
    // 太高的帽子：整隻縮一點，帽尖不會被切掉
    const k = Math.min(1, 178 / (186 - Math.min(box.top, headTop)));
    let tf = k < 1 ? `translate(100 186) scale(${n(k * 1000) / 1000}) translate(-100 -186)` : "";
    if (o.failed) {
      const fid = nid("f");
      defs += `<filter id="${fid}"><feColorMatrix type="saturate" values=".55"/></filter>`;
      tf = `translate(100 186) scale(1.08 .86) skewX(-6) translate(-100 -186) ` + tf;
      fig = `<g transform="${tf.trim()}" filter="url(#${fid})">${fig}</g>`;
    } else if (tf) fig = `<g transform="${tf}">${fig}</g>`;
    const sy = o.failed ? .86 * k : k, T = y => n(186 - (186 - y) * sy), cr = box.crop || {};
    return { p, g, inv: img ? 0 : inv, defs, fig, headTop: T(headTop), hat: { x: n(100 + (hat.x - 100) * k), y: T(hat.y), s: n(hat.s * k * 100) / 100 },
      box: { top: T(box.top), head: T(box.head), waist: T(box.waist), bottom: T(box.bottom), crop: { head: (cr.head || [box.top, box.head]).map(T), waist: (cr.waist || [box.top, box.waist]).map(T), full: [T(box.top), T(box.bottom)] } } };
  }

  function frog(pick, o = {}) {
    const b = build(pick, o), p = b.p;
    let defs = b.defs, pre = "";
    if (!o.silhouette) {
      if (has(p.背景) && !o.noBg) pre += backdrop(p.背景);
      if (o.fx) pre += (AURA[p.稀有度] || AURA.普通)(nid("a"), RARITY_COLORS[p.稀有度] || RARITY_COLORS.普通);
      const sid = nid("s");
      defs += `<radialGradient id="${sid}"><stop offset="0" stop-color="${INK}" stop-opacity=".16"/><stop offset=".65" stop-color="${INK}" stop-opacity=".06"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>`;
      pre += `<ellipse cx="${b.inv ? 2 * b.inv - 100 : 100}" cy="187" rx="${b.g.flat || b.g === POSE.斯拉夫蹲 ? 88 : 66}" ry="8" fill="url(#${sid})"/>`;
    }
    return svgOpen("0 0 200 200", `${p.稀有度}${p.心情}${p.顏色}佩佩`, o.silhouette ? ' fill="currentColor"' : "") +
      (defs ? `<defs>${defs}</defs>` : "") + pre + `<g class="f-breathe" style="transform-origin:100px 186px">${b.fig}</g></svg>`;
  }
  const headTop = (pick, o = {}) => build(pick, { custom: o.custom, fit: o.fit, silhouette: 1 }).headTop;
  // 帽子底邊中心與縮放：倒立時帽子放在右邊地上
  const hatSpot = (pick, o = {}) => build(pick, { custom: o.custom, fit: o.fit, silhouette: 1 }).hat;

  // ---------- 抱枕：尺寸（印多少）、材質（印起來的質感）、填充（形狀）各自獨立 ----------
  const PSIZE = { 小抱枕: { w: 108, h: 90, crop: "head" }, 標準: { w: 154, h: 112, crop: "waist" }, 等身大: { w: 94, h: 182, crop: "full" } };
  const PFILL = { 軟綿綿: { r: .36, b: 12, hk: 1, shade: .2 }, 剛剛好: { r: .13, b: -7, hk: 1, shade: .14, ears: 1 }, 硬梆梆: { r: .07, b: 0, hk: .88, shade: .06, box: 1 } };
  const pPath = (cx, cy, w, h, r, b) => {
    const x0 = n(cx - w / 2), x1 = n(cx + w / 2), y0 = n(cy - h / 2), y1 = n(cy + h / 2), R = n(r);
    const cap = L => Math.sign(b) * Math.min(Math.abs(b), Math.max(L, 0) * .22), bh = cap(w - 2 * r), bv = cap(h - 2 * r);
    return `M${n(x0 + R)} ${y0}Q${cx} ${n(y0 - bh)} ${n(x1 - R)} ${y0}Q${x1} ${y0} ${x1} ${n(y0 + R)}Q${n(x1 + bv)} ${n(cy)} ${x1} ${n(y1 - R)}Q${x1} ${y1} ${n(x1 - R)} ${y1}Q${cx} ${n(y1 + bh)} ${n(x0 + R)} ${y1}Q${x0} ${y1} ${x0} ${n(y1 - R)}Q${n(x0 - bv)} ${n(cy)} ${x0} ${n(y0 + R)}Q${x0} ${y0} ${n(x0 + R)} ${y0}Z`;
  };
  const PMAT = {
    棉布: { fab: "#F4EFE4", edge: "#CFC5B2" },
    絨毛: { fab: "#F7F1E8", edge: "#DCD1BF", fuzzy: 1 },
    桃皮絨: { fab: "#F5F1EA", edge: "#CBC3B5", gloss: 1 },
    星光絨: { fab: "#2E3A6E", edge: "#151C3E", gloss: 1, star: 1 }, // 簽到限定的材料（11-09，決定 0030）：深藍絨布織了金線，亮亮的
  };

  function pillow(pick, printPick, o = {}) {
    const p = Object.assign({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, pick || {});
    const S = PSIZE[p.尺寸] || PSIZE.標準, F = PFILL[p.填充] || PFILL.剛剛好, M = PMAT[p.材質] || PMAT.棉布;
    const w = S.w, h = n(S.h * F.hk), cx = 100, cy = n(97 + (S.h - h) / 2);
    const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2, r = Math.min(w, h) * F.r;
    const id = nid("p"), d = pPath(cx, cy, w, h, r, F.b);
    let defs = `<clipPath id="${id}c"><path d="${d}"/></clipPath><radialGradient id="${id}s"><stop offset="0" stop-color="${INK}" stop-opacity=".15"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${id}g" cx=".42" cy=".36" r=".78"><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#6E6352" stop-opacity="${F.shade}"/></radialGradient>`;
    let s = `<ellipse cx="100" cy="${n(Math.min(y1 + (F.box ? 12 : 6), 195))}" rx="${n(w * .56)}" ry="6" fill="url(#${id}s)"/>`;
    s += `<rect x="${n(x1 - w * .2 - 10)}" y="${n(y1 - 5 + (F.box ? 7 : 0))}" width="10" height="13" rx="1.5" fill="#3F8F4A"/>`;
    if (F.box) s += `<path d="${pPath(cx, cy + 7, w, h, r, F.b)}" fill="#E4DCCD" stroke="${M.edge}" stroke-width="2"/>`;
    if (M.fuzzy) defs += `<filter id="${id}z" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="${id}b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".9"/></filter>`;
    const fz = M.fuzzy ? ` filter="url(#${id}z)"` : "";
    s += `<path d="${d}" fill="${M.fab}" stroke="${M.edge}" stroke-width="${M.fuzzy ? 3 : 2}"${fz}/>`;
    let inner = "";
    if (printPick) {
      const b = build(printPick, { custom: o.custom, fit: o.fit, perfect: o.perfect, failed: o.failed, print: 1 }), B = b.box;
      const Q = B.crop, bx = S.crop === "head" ? [46, Q.head[0] - 4, 108, Q.head[1] - Q.head[0] + 6] : S.crop === "waist" ? [20, Q.waist[0] - 4, 160, Q.waist[1] - Q.waist[0] + 4] : [36, Q.full[0] - 6, 128, Q.full[1] - Q.full[0] + 10];
      const m = S.crop === "full" ? 5 : 9, vw = w - 2 * m, vh = S.crop === "waist" ? h - m : h - 2 * m, ar = vw / vh;
      let [bx0, by0, bw, bh] = bx;
      if (bw / bh > ar) { const nh = bw / ar; by0 -= S.crop === "waist" ? nh - bh : (nh - bh) / 2; bh = nh; } else { const nw = bh * ar; bx0 -= (nw - bw) / 2; bw = nw; }
      // 印到布邊：視窗蓋住整個抱枕（多 pad 給鼓起的邊），主體仍落在內框裡，邊緣交給抱枕形狀去切
      const k = vw / bw, pad = 8, vx = x0 - pad, vy = y0 - pad, VW = w + 2 * pad, VH = h + 2 * pad;
      bx0 -= (m + pad) / k; by0 -= (m + pad) / k; bw = VW / k; bh = VH / k;
      const fc = colorOf(b.p.顏色)[0];
      const bc = S.crop === "head" ? [100, (Q.head[0] + Q.head[1]) / 2 + 6, 54] : S.crop === "waist" ? [100, Q.waist[1] - 46, 76] : [100, (Q.full[0] + Q.full[1]) / 2, 78];
      let deco = `<circle cx="${n(bc[0])}" cy="${n(bc[1])}" r="${bc[2]}" fill="${fc}" opacity=".16"/>`;
      if (has(b.p.背景) && !o.noBg) deco = backdrop(b.p.背景, 1);
      else if (S.crop === "full") deco += [[52, -1], [150, 1], [60, 1], [146, -1]].map(([xx, t], i) => spark(xx, t < 0 ? by0 + 18 + i * 10 : by0 + bh - 24 - i * 8, 6 - i, fc, ' opacity=".35"')).join("");
      inner = `<g${M.fuzzy ? ` filter="url(#${id}b)" opacity=".93"` : M.gloss ? ' opacity=".96"' : ""}><svg x="${n(vx)}" y="${n(vy)}" width="${n(VW)}" height="${n(VH)}" viewBox="${n(bx0)} ${n(by0)} ${n(bw)} ${n(bh)}" overflow="hidden">${b.defs ? `<defs>${b.defs}</defs>` : ""}${deco}${b.fig}</svg></g>`;
    }
    inner += `<path d="${d}" fill="url(#${id}g)"/>`;
    if (M.star) inner += [[.16, .2, 4], [.82, .16, 3], [.9, .62, 3.6], [.1, .74, 3], [.5, .1, 2.4], [.36, .86, 2.6], [.7, .88, 3.2]].map(([px, py, r]) => spark(x0 + w * px, y0 + h * py, r, "#F2D894", ' opacity=".9"')).join("");
    if (M.gloss) {
      defs += `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset=".27" stop-color="#fff" stop-opacity=".42"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity=".22"/><stop offset=".72" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#B8AE9C" stop-opacity=".18"/></linearGradient>`;
      inner += `<path d="${d}" fill="url(#${id}l)"/>`;
    }
    if (F.ears) inner += ln(`M${n(x0 + 6)} ${n(y0 + 14)}q10 2 14 12M${n(x1 - 6)} ${n(y0 + 14)}q-10 2-14 12M${n(x0 + 6)} ${n(y1 - 14)}q10-2 14-12M${n(x1 - 6)} ${n(y1 - 14)}q-10-2-14-12`, "#B5AA95", 1.2, ' opacity=".55"');
    if (F.r > .3) inner += `<ellipse cx="${n(cx - w * .2)}" cy="${n(y0 + h * .2)}" rx="${n(w * .2)}" ry="${n(h * .09)}" fill="#fff" opacity=".35"/>`;
    s += `<g clip-path="url(#${id}c)">${inner}</g>`;
    if (!M.fuzzy && !M.gloss) s += `<path d="${pPath(cx, cy, w - 13, h - 13, Math.max(r - 5, 2), F.b * .85)}" fill="none" stroke="#BDB19B" stroke-width="1.2" stroke-dasharray="3 2.6"/>`;
    if (M.fuzzy) s += `<path d="${d}" fill="none" stroke="#EFE7DA" stroke-width="5" stroke-dasharray=".1 3.2" stroke-linecap="round"${fz}/>`;
    if (M.gloss) s += `<path d="${d}" fill="none" stroke="#fff" stroke-width="1" opacity=".7" transform="translate(-.8 -.8)"/>`;
    if (F.box) s += `<path d="${pPath(cx, cy, w - 5, h - 5, Math.max(r - 2, 1), 0)}" fill="none" stroke="#D3C9B6" stroke-width="1.6"/>`;
    return svgOpen("0 0 200 200", `${p.尺寸}${p.材質}抱枕`) + `<defs>${defs}</defs>${s}</svg>`;
  }

  // ---------- 展品：o.variant 0 原作、1..3 各有一處不同（找不同） ----------
  const XHEAD = 'class="x-head" style="transform-box:fill-box;transform-origin:center;transform:rotate(calc(var(--gx,0)*6deg))"';
  const XPUP = `class="x-pupils" ${PUPILS}`;
  const C = (cx, cy, r, f, a = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"${a}/>`;
  const lg = (id, stops, v = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${v ? 0 : 1}" y2="${v ? 1 : 0}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`;
  const rg = (id, stops, a = "") => `<radialGradient id="${id}"${a}>${stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`).join("")}</radialGradient>`;
  // 一顆合起來的青蛙頭（兩個眼泡 + 圓臉），回傳 [輪廓, 填色蓋線]
  const blob = (cx, cy, rx, ry, ex, ey, er, fill, stroke, sw) =>
    `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}">${C(cx - ex, ey, er, fill) + C(cx + ex, ey, er, fill)}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></g><g fill="${fill}">${C(cx - ex, ey, er - sw / 2, fill) + C(cx + ex, ey, er - sw / 2, fill)}</g>`;

  const EXHIBITS = {};
  EXHIBITS.portrait = { vb: "0 0 240 300", label: "最普通的佩佩肖像", draw: (v, id) => {
    let s = `<defs>${lg(id + "a", [[0, "#3C4135"], [1, "#1E211B"]])}${rg(id + "b", [[0, "#77745A", .75], [1, "#77745A", 0]], ' cx=".5" cy=".42" r=".55"')}${rg(id + "h", [[0, "#A9C682"], [.55, "#7FA05D"], [1, "#56723F"]], ' cx=".36" cy=".3" r=".85"')}</defs>`;
    s += `<rect width="240" height="300" fill="url(#${id}a)"/><ellipse cx="120" cy="150" rx="130" ry="140" fill="url(#${id}b)"/>`;
    s += `<g fill="#A29E78" opacity=".1"><ellipse cx="44" cy="62" rx="44" ry="11" transform="rotate(-24 44 62)"/><ellipse cx="200" cy="96" rx="38" ry="9" transform="rotate(18 200 96)"/><ellipse cx="30" cy="190" rx="30" ry="8" transform="rotate(-8 30 190)"/><ellipse cx="206" cy="200" rx="32" ry="10" transform="rotate(30 206 200)"/></g>`;
    if (v === 2) s += `<g transform="translate(196 52) rotate(-20)"><ellipse cx="-3" cy="-3" rx="4" ry="2.5" fill="#C9C7B5" opacity=".75" transform="rotate(-30)"/><ellipse cx="3" cy="-3" rx="4" ry="2.5" fill="#C9C7B5" opacity=".75" transform="rotate(30)"/><ellipse rx="2.6" ry="4" fill="#141412"/></g>`;
    s += `<path d="M14 300Q24 236 78 222Q120 212 162 222Q216 236 226 300Z" fill="#2A2730"/>` + ln("M60 262Q74 240 98 232M182 262Q168 240 144 232", "#3D3946", 3);
    s += `<g ${XHEAD}>${blob(120, 166, 70, 52, 28, 118, 21, `url(#${id}h)`, "#3E5A2F", 2.5)}<ellipse cx="120" cy="196" rx="40" ry="16" fill="#D7D7A8" opacity=".35"/>` +
      `<g>${C(92, 118, 13, "#F4F1E6") + C(148, 118, 13, "#F4F1E6")}<g ${XPUP}>${C(93, 120, 5.4, v === 1 ? "#B8322A" : "#1D1D1B") + C(149, 120, 5.4, "#1D1D1B") + C(95, 118, 1.8, "#fff") + C(151, 118, 1.8, "#fff")}</g></g>` +
      `<ellipse cx="82" cy="160" rx="10" ry="5" fill="#E39A8E" opacity=".4"/><ellipse cx="158" cy="160" rx="10" ry="5" fill="#E39A8E" opacity=".4"/>` + ln("M104 172Q120 182 136 172", "#3E5A2F", 3) + `</g>`;
    s += `<path d="M76 213Q120 240 164 213Q173 227 157 237Q139 247 120 241Q101 247 83 237Q67 227 76 213Z" fill="#E7E1D1"/>` + ln("M90 230Q96 236 104 236M136 236Q144 236 150 230M120 232V241", "#BDB6A2", 1.4);
    if (v !== 3) s += `<ellipse cx="120" cy="252" rx="7" ry="9" fill="#C99A2E"/><ellipse cx="120" cy="252" rx="3.5" ry="5" fill="#8E2A2A"/>`;
    return s;
  } };

  const priest = (x, y, k, flame = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-19 0C-17-30-12-52 0-72C12-52 17-30 19 0Z" fill="#2F2B35"/>` + ln("M-6-6L-4-34M7-4L5-30", "#3B3642", 1.4) +
    `<path d="M-9-50Q0-65 9-50Q9-40 0-38Q-9-40-9-50Z" fill="#121015"/><rect x="-2" y="-36" width="4" height="10" fill="#E6DFCB"/><ellipse cx="-5" cy="-28" rx="3.6" ry="2.6" fill="#3A3540"/><ellipse cx="5" cy="-28" rx="3.6" ry="2.6" fill="#3A3540"/>` +
    (flame ? C(0, -40, 8, "#F2C14E", ' opacity=".18"') + `<ellipse cx="0" cy="-39.5" rx="1.9" ry="3.4" fill="#F4C95A"/>` : "") + `</g>`;
  EXHIBITS.strange = { vb: "0 0 320 240", label: "奇怪的畫", draw: (v, id) => {
    let s = `<defs>${lg(id + "a", [[0, "#3B3E4E"], [.62, "#6C6A72"], [.63, "#4A4744"], [1, "#2F2D2C"]])}${lg(id + "g", [[0, "#9AA5B1"], [1, "#5E6872"]])}<clipPath id="${id}w"><path d="M146 145L156 127Q158 125 162 125H176V145Z"/></clipPath></defs>`;
    s += `<rect width="320" height="240" fill="url(#${id}a)"/>` + C(56, 40, 12, "#E6E1D3", ' opacity=".85"') + C(60, 37, 11, "#55576A", ' opacity=".35"') + `<ellipse cx="160" cy="196" rx="170" ry="16" fill="#fff" opacity=".05"/>`;
    s += priest(98, 152, .68) + priest(160, 138, .6) + priest(226, 152, .68);
    s += `<path d="M84 176V160Q86 150 100 148L126 146L142 124Q146 120 154 120H198Q206 120 210 126L224 146L240 148Q252 150 252 162V176Z" fill="#222226"/>` + ln("M88 160H250", "#46464E", 1.5) + ln("M178 147V174M164 156h6M192 156h6", "#3A3A42", 1.4);
    s += `<path d="M146 145L156 127Q158 125 162 125H176V145Z" fill="url(#${id}g)"/><path d="M181 145V125H198Q202 125 204 128L216 145Z" fill="url(#${id}g)"/>`;
    s += `<g clip-path="url(#${id}w)"><g ${XHEAD}><path d="M152 146Q152 133 157 131Q157 126 161 128Q163.5 125.5 166 128Q170 126 170 131Q175 133 175 146Z" fill="#2A2630"/><path d="M157 141Q163 134 169 141Q163 145 157 141Z" fill="#141217"/>` +
      (v === 3 ? `<g ${XPUP}>${C(161, 140, 1.6, "#E9F2C6") + C(165.5, 140, 1.6, "#E9F2C6")}</g>` : "") + `</g></g>`;
    s += [112, 222].map(x => C(x, 178, 15, "#1A1A1D") + C(x, 178, 12, "#1F1F23") + C(x, 178, 5, "#5E5E66")).join("");
    s += `<rect x="244" y="152" width="8" height="7" rx="2" fill="${v === 2 ? "#FFF4C8" : "#BEB9A6"}"/><rect x="84" y="152" width="6" height="7" rx="2" fill="#6A2A2A"/>`;
    if (v === 2) s += `<path d="M252 151L304 140V176L252 162Z" fill="#F7EBB5" opacity=".32"/>`;
    s += priest(48, 214, .95, v !== 1) + priest(118, 234, 1.05) + priest(208, 234, 1.05) + priest(278, 214, .95);
    return s;
  } };

  EXHIBITS.rare = { vb: "0 0 240 300", label: "很帥的佩佩", draw: (v, id) => {
    const lens = v === 2 ? "#D9473A" : INK;
    const star = Array.from({ length: 20 }, (_, i) => { const a = Math.PI * i / 10 - Math.PI / 2, r = i % 2 ? 13 : 27; return `${n(196 + r * Math.cos(a))},${n(54 + r * Math.sin(a))}`; }).join(" ");
    let s = `<defs><pattern id="${id}d" width="9" height="9" patternUnits="userSpaceOnUse">${C(4.5, 4.5, 2, "#fff", ' opacity=".42"')}</pattern></defs>`;
    s += `<rect width="240" height="300" fill="#F6C432"/><path d="M0 0H240L0 250Z" fill="#E94B7A"/><path d="M0 0H240L0 250Z" fill="url(#${id}d)"/>`;
    s += `<circle cx="120" cy="146" r="86" fill="#3DB8D9" stroke="${INK}" stroke-width="5"/>`;
    if (v !== 1) s += `<polygon points="${star}" fill="#FFE24A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<path d="M26 300Q36 236 90 226H150Q204 236 214 300Z" fill="${INK}"/>` + ln("M70 252Q80 240 96 236", "#fff", 4, ' opacity=".5"');
    s += `<g ${XHEAD}>${blob(120, 162, 74, 56, 30, 106, 23, "#5CD16A", INK, 5)}<path d="M176 128Q204 166 172 208Q190 166 176 128Z" fill="#2FA44A"/>` +
      `<g fill="${lens}"><path d="M60 94H116Q119 94 118 98L114 116Q112 125 102 125H76Q66 125 64 116L58 99Q58 94 60 94Z"/><path d="M180 94H124Q121 94 122 98L126 116Q128 125 138 125H164Q174 125 176 116L182 99Q182 94 180 94Z"/><rect x="114" y="96" width="12" height="5"/></g>` +
      ln("M72 112L84 100M80 116L94 102M136 112L148 100M144 116L158 102", "#fff", 3, ' opacity=".85"') +
      C(76, 166, 9, "#F57A9C") + C(164, 166, 9, "#F57A9C") + ln("M96 180Q122 194 148 174M144 172l6 6", INK, 5) + `</g>`;
    if (v === 3) s += `<path d="M42 230L28 254H38L31 274L50 247H40L48 230Z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    return s;
  } };

  EXHIBITS.statue = { vb: "0 0 220 300", label: "嘔吐的佩佩雕像", draw: (v, id) => {
    let s = `<defs>${lg(id + "a", [[0, "#ECEBE6"], [1, "#DCDAD3"]])}${rg(id + "m", [[0, "#FFFFFD"], [.6, "#EEEDE8"], [1, "#CDCBC3"]], ' cx=".38" cy=".32" r=".8"')}${lg(id + "w", [[0, "#D9F0F2"], [1, "#A9D6DD"]])}</defs>`;
    s += `<rect width="220" height="300" fill="url(#${id}a)"/><path d="M48 228V92Q48 40 110 40Q172 40 172 92V228Z" fill="#E2E0D9"/><rect y="292" width="220" height="8" fill="#D6D4CD"/>`;
    s += `<rect x="56" y="228" width="108" height="60" fill="#EFEEE9" stroke="#CFCDC6" stroke-width="1.2"/><rect x="142" y="228" width="22" height="60" fill="#E1DFD8"/><rect x="46" y="216" width="128" height="12" rx="1" fill="#F6F5F1" stroke="#CFCDC6" stroke-width="1.2"/><rect x="50" y="286" width="120" height="7" fill="#E6E4DE" stroke="#CFCDC6" stroke-width="1.2"/>`;
    if (v !== 3) s += `<rect x="86" y="250" width="48" height="14" rx="1" fill="#CDBB8E" stroke="#A8925F" stroke-width="1"/>` + ln("M93 255H127M97 259H123", "#8F7A4C", 1);
    if (v === 1) s += ln("M66 230l6 9l-3 8l7 9l-2 9l5 6", "#9A978E", 1.4);
    s += `<g ${XHEAD}>` + `<g fill="url(#${id}m)" stroke="#C3C1B9" stroke-width="1.6"><ellipse cx="80" cy="214" rx="15" ry="6"/><ellipse cx="134" cy="214" rx="15" ry="6"/><ellipse cx="62" cy="190" rx="9" ry="14" transform="rotate(-10 62 190)"/></g>` +
      blob(106, 184, 48, 34, 20, 151, 15, `url(#${id}m)`, "#C3C1B9", 1.6) + ln("M72 196q14 6 22 2q8-4 16 4M120 170q10 4 12 14M88 206q10 3 20-1", "#CFCDC5", 1, ' opacity=".9"') +
      C(86, 151, 9, "#F8F7F3", ' stroke="#D4D2CA" stroke-width="1"') + C(126, 151, 9, "#F8F7F3", ' stroke="#D4D2CA" stroke-width="1"') + `<g ${XPUP}>${v === 2 ? C(87, 152, 3.6, "#3A3A38") : ""}</g>` +
      `<ellipse cx="114" cy="175" rx="7.5" ry="6" fill="#C2C0B8"/><ellipse cx="114" cy="176" rx="5" ry="3.8" fill="#B3B1A9"/>` +
      `<path d="M118 174C150 156 180 176 187 226C190 250 192 266 192 282" fill="none" stroke="url(#${id}w)" stroke-width="7" stroke-linecap="round" opacity=".92"/>` + ln("M121 172C148 160 174 174 182 214", "#fff", 1.8, ' opacity=".85"') +
      C(176, 250, 2, "#BFE3E8") + C(200, 262, 1.6, "#BFE3E8") + C(184, 284, 1.8, "#BFE3E8") + `</g>`;
    s += `<path d="M175 284Q192 298 209 284Z" fill="#F2F1EC" stroke="#C3C1B9" stroke-width="1.4"/><ellipse cx="192" cy="284" rx="17" ry="4" fill="#CFE9EC" stroke="#C3C1B9" stroke-width="1.4"/>`;
    return s;
  } };

  EXHIBITS.hidden = { vb: "0 0 220 300", label: "隱藏展品", draw: (v, id) => {
    const eye = (x, y, r, red) => ({ w: `<path d="M${x - r * 1.6} ${y}Q${x} ${y - r * 1.3} ${x + r * 1.6} ${y}Q${x} ${y + r * 1.3} ${x - r * 1.6} ${y}Z" fill="#EDE6CF" stroke="#2B3A31" stroke-width="1"/>`, p: C(x, y, n(r * .55), red ? "#C0392B" : "#1D1D1B") });
    const E7 = [[94, 150, 6.5], [110, 166, 4.5, v === 1], [84, 170, 3.2], [98, 184, 4], [108, 140, 3], [90, 200, 3], [106, 204, 3.4]].map(a => eye(...a));
    let s = `<defs>${rg(id + "s", [[0, "#575066", .9], [1, "#575066", 0]], ' cx=".5" cy=".1" r=".75"')}${lg(id + "g", [[0, "#DDEBF0", .16], [1, "#DDEBF0", .05]])}${rg(id + "i", [[0, "#6F8F78"], [1, "#3D5546"]], ' cx=".35" cy=".3" r=".8"')}</defs>`;
    s += `<rect width="220" height="300" fill="#211E27"/><rect width="220" height="300" fill="url(#${id}s)"/><path d="M98 0H122L172 70H48Z" fill="#fff" opacity=".04"/>`;
    s += `<rect x="44" y="232" width="132" height="14" fill="#38323F"/><rect x="92" y="212" width="36" height="22" fill="#4A4453"/><ellipse cx="110" cy="212" rx="18" ry="4" fill="#5A5363"/>`;
    s += `<g ${XHEAD}>${blob(110, 182, 34, 30, 16, 150, 11, `url(#${id}i)`, "#26352C", 1.8)}<ellipse cx="110" cy="211" rx="30" ry="5" fill="#C99A2E" opacity=".85"/>` + E7.map(e => e.w).join("") + `<g ${XPUP}>${E7.map(e => e.p).join("")}</g>` +
      `<path d="M108 136Q120 126 134 138Q147 150 146 176Q149 204 157 234H118Q123 208 115 190Q108 168 108 136Z" fill="#F1EFEA"/>` + ln("M122 140Q130 170 128 230M136 146Q142 180 146 232M114 160Q120 190 118 230", "#CFCBC2", 1.2) +
      (v === 3 ? `<path d="M131 198Q137 193 143 198Q137 203 131 198Z" fill="#EDE6CF" stroke="#2B3A31" stroke-width="1"/><g ${XPUP}>${C(137, 198, 1.8, "#1D1D1B")}</g>` : "") + `</g>`;
    if (v !== 2) s += `<rect x="52" y="222" width="30" height="15" fill="#ECE8DE"/>` + ln("M56 227H78M56 232H72", "#9A968C", 1);
    s += `<rect x="40" y="70" width="140" height="176" fill="url(#${id}g)" stroke="#AEB9C2" stroke-width="1.2" stroke-opacity=".7"/><path d="M40 70L56 56H196L180 70Z" fill="#DDE8EE" fill-opacity=".1" stroke="#AEB9C2" stroke-opacity=".6"/><path d="M180 70L196 56V232L180 246Z" fill="#DDE8EE" fill-opacity=".05" stroke="#AEB9C2" stroke-opacity=".6"/>` +
      `<path d="M60 70L40 98V118L74 70ZM150 70L82 246H92L160 70Z" fill="#fff" opacity=".07"/>`;
    s += `<rect x="32" y="246" width="156" height="40" fill="#2E2935" stroke="#443D4D"/><rect x="32" y="246" width="156" height="4" fill="#443D4D"/>`;
    return s;
  } };

  EXHIBITS.russia8 = { vb: "0 0 200 320", label: "8+9號門", draw: (v, id, o) => {
    let s = `<rect width="200" height="320" fill="#EFEEE9"/><rect y="298" width="200" height="22" fill="#E4E2DB"/>` + ln("M0 298H200", "#D6D4CC", 1.2) + `<rect x="38" y="34" width="124" height="266" fill="#E4E2DC"/>`;
    if (!o.open) {
      s += `<rect x="46" y="42" width="108" height="256" fill="#F8F7F3" stroke="#D9D7D0"/><rect x="60" y="92" width="80" height="80" rx="2" fill="none" stroke="#E2E0D9" stroke-width="1.5"/><rect x="60" y="190" width="80" height="92" rx="2" fill="none" stroke="#E2E0D9" stroke-width="1.5"/>`;
      s += `<g transform="rotate(${v === 3 ? 18 : 0} 100 68)"><rect x="82" y="58" width="36" height="20" rx="3" fill="#E9E5DA" stroke="#CDC8BA"/><text x="100" y="73" font-size="13" text-anchor="middle" fill="#5E5E59" font-family="Georgia,'Times New Roman',serif">8+9</text></g>`;
      if (v !== 1) s += C(140, 186, 5, "#A6A6A0") + `<rect x="126" y="184" width="16" height="4.5" rx="2.2" fill="#8A8A85"/>`;
      if (v === 2) s += C(100, 128, 3, "#D2D0C8", ' stroke="#9C9C96" stroke-width="1"');
      s += `<rect x="46" y="296" width="108" height="2" fill="#D2D0C8"/>`;
    } else {
      const fr = build({ 心情: "俄國8+9", 姿勢: "斯拉夫蹲", 顏色: "綠" }, {});
      const fig = fr.fig.replace(/f-pupils/g, "x-pupils").replace(/ class="f-[a-z]+"/g, "");
      s += `<rect x="46" y="42" width="108" height="256" fill="#FDFDFB"/><path d="M46 298L72 222H128L154 298Z" fill="#F2F1EC"/><rect x="72" y="92" width="56" height="130" fill="#FFFFFF"/>` +
        ln("M46 42L72 92M154 42L128 92M46 298L72 222M154 298L128 222M72 92H128M72 222H128M72 92V222M128 92V222", "#E4E2DC", 1) + `<rect x="92" y="60" width="16" height="3" rx="1.5" fill="#ECEBE5"/>`;
      s += `<ellipse cx="100" cy="259" rx="36" ry="4" fill="#1D1D1B" opacity=".08"/><g ${XHEAD}><svg x="58" y="180" width="84" height="84" viewBox="0 0 200 200">${fr.defs ? `<defs>${fr.defs}</defs>` : ""}${fig}</svg></g>`;
      s += `<path d="M46 42L66 56V284L46 298Z" fill="#F3F2EE" stroke="#D9D7D0"/>`;
    }
    return s;
  } };

  const exhibitDiffs = {
    portrait: [null, { x: 92, y: 119, r: 16 }, { x: 196, y: 52, r: 14 }, { x: 120, y: 252, r: 14 }],
    strange: [null, { x: 48, y: 176, r: 13 }, { x: 260, y: 157, r: 20 }, { x: 163, y: 138, r: 13 }],
    rare: [null, { x: 196, y: 54, r: 30 }, { x: 120, y: 109, r: 46 }, { x: 38, y: 252, r: 20 }],
    statue: [null, { x: 74, y: 250, r: 20 }, { x: 86, y: 151, r: 14 }, { x: 110, y: 257, r: 22 }],
    hidden: [null, { x: 110, y: 166, r: 11 }, { x: 67, y: 229, r: 17 }, { x: 137, y: 198, r: 11 }],
    russia8: [null, { x: 134, y: 186, r: 16 }, { x: 100, y: 128, r: 12 }, { x: 100, y: 68, r: 22 }],
  };

  function exhibit(id, o = {}) {
    const v = [1, 2, 3].includes(+o.variant) ? +o.variant : 0, X = EXHIBITS[id];
    if (!X) return svgOpen("0 0 240 300", "展品") + `<rect width="240" height="300" fill="#F1F0EB"/>` + ln("M60 210L100 150L130 190L150 170L180 210Z", "#C9C7C0", 2) + C(160, 110, 12, "none", ' stroke="#C9C7C0" stroke-width="2"') + `</svg>`;
    return svgOpen(X.vb, X.label + (o.open ? "（開著）" : "")) + X.draw(v, nid("x"), o) + (o.hol ? holOnArt(o.hol, X.vb) : "") + `</svg>`; // o.hol：節日特展的小裝飾（11-09，決定 0030）
  }

  // ---------- 地下收藏庫各層（320×180），越往下越怪；o.cleared = 燈亮了 ----------
  const lamp = (x, y, lit, id) => (lit ? `<radialGradient id="${id}L" cx="${x}" cy="${y + 10}" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFC66B" stop-opacity=".55"/><stop offset=".45" stop-color="#FFB24A" stop-opacity=".18"/><stop offset="1" stop-color="#FFB24A" stop-opacity="0"/></radialGradient><rect class="cs-glow" width="320" height="180" fill="url(#${id}L)"/>` : "") +
    ln(`M${x} 0V${y}`, "#1A1614", 1.2) + `<path d="M${x - 9} ${y + 8}L${x - 5} ${y}H${x + 5}L${x + 9} ${y + 8}Z" fill="#2E2925" stroke="#14110F" stroke-width=".8"/>` + C(x, y + 10, 3.4, lit ? "#FFE7A3" : "#6E6A64") + (lit ? C(x, y + 10, 8, "#FFE7A3", ' opacity=".35"') : "");
  const crate = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#7E6044" stroke="#4E3722" stroke-width="1.4"/>` + ln(`M${x} ${y + h / 3}H${x + w}M${x} ${y + 2 * h / 3}H${x + w}`, "#5E4630", 1) + ln(`M${x + 3} ${y + 3}L${x + w - 3} ${y + h - 3}M${x + w - 3} ${y + 3}L${x + 3} ${y + h - 3}`, "#5E4630", 1.6);
  const sheet = (x, y, w, h, bumps) => `<rect x="${x - w * .42}" y="${y + h}" width="${w * .84}" height="10" fill="#3C414C"/><path d="M${x - w / 2} ${y + h}C${x - w / 2} ${y + h * .35} ${x - w * .3} ${y} ${x} ${y}C${x + w * .3} ${y} ${x + w / 2} ${y + h * .35} ${x + w / 2} ${y + h}Q${x + w / 4} ${y + h - 4} ${x} ${y + h}Q${x - w / 4} ${y + h - 4} ${x - w / 2} ${y + h}Z" fill="#E2E0DA"/>` +
    (bumps ? C(x - w * .2, y + 3, w * .14, "#E2E0DA") + C(x + w * .2, y + 3, w * .14, "#E2E0DA") : "") + ln(`M${x - w * .18} ${y + h * .3}Q${x - w * .26} ${y + h * .7} ${x - w * .3} ${y + h}M${x + w * .12} ${y + h * .25}Q${x + w * .2} ${y + h * .65} ${x + w * .22} ${y + h}`, "#B4B1A9", 1);
  const paper = (x, y, r, a = 1) => `<g transform="translate(${x} ${y}) rotate(${r})" opacity="${a}"><rect x="-7" y="-5" width="14" height="10" fill="#EDE6D3"/>${ln("M-5-2H4M-5 1H3", "#A69E8A", .7)}</g>`;
  const SCENES = {
    1: { label: "積灰的儲藏室", draw: id => `<defs>${lg(id + "w", [[0, "#3D3631"], [1, "#2A2522"]])}</defs><rect width="320" height="180" fill="url(#${id}w)"/><rect y="132" width="320" height="48" fill="#4A3F37"/>` + ln("M0 146H320M0 162H320", "#3E342D", 1) +
      `<path d="M146 134L152 62Q172 56 198 60L206 134Z" fill="#CFC8BC"/><path d="M206 134L212 82Q226 78 240 82L244 134Z" fill="#BDB5A8"/>` + ln("M162 66Q166 100 160 134M184 62Q180 98 188 134M224 84Q222 110 226 134", "#A39B8E", 1) +
      crate(20, 96, 54, 38) + crate(74, 106, 42, 28) + crate(30, 62, 40, 34) + crate(252, 98, 50, 36) + crate(262, 70, 34, 28) +
      ln("M300 0Q306 14 320 18M308 0Q312 8 320 10M296 0L320 24", "#6E655C", .7, ' opacity=".7"') + [[40, 40], [96, 30], [120, 70], [210, 40], [236, 26], [280, 54], [128, 110], [190, 22]].map(([x, y]) => C(x, y, 1.1, "#E8DCC6", ' opacity=".35"')).join(""), lamp: [160, 22] },
    2: { label: "蓋著白布的雕像廳", draw: id => `<defs>${lg(id + "w", [[0, "#30353F"], [1, "#22262E"]])}</defs><rect width="320" height="180" fill="url(#${id}w)"/><path d="M0 180L110 110H210L320 180Z" fill="#2B2F38"/>` +
      ln("M110 110L40 180M140 110L120 180M170 110L190 180M200 110L270 180M74 132H246M42 152H278", "#3A3F4A", 1) +
      sheet(150, 74, 22, 34) + sheet(180, 78, 18, 30) + sheet(112, 66, 34, 46, 1) + sheet(212, 70, 30, 42) + sheet(54, 62, 46, 70) + sheet(270, 58, 48, 74), lamp: [160, 20] },
    3: { label: "空畫框走廊", draw: id => {
      const fl = (x1, y1, x2, y2, h1, h2) => `<path d="M${x1} ${y1}L${x2} ${y2}V${y2 + h2}L${x1} ${y1 + h1}Z" fill="#1B0B0F" stroke="#C99A2E" stroke-width="2.2" stroke-linejoin="round"/>`;
      return `<rect width="320" height="180" fill="#2A0E14"/><path d="M0 0L134 66V104L0 180Z" fill="#5A1822"/><path d="M320 0L186 66V104L320 180Z" fill="#4E141D"/><rect x="134" y="66" width="52" height="38" fill="#1A080C"/><path d="M0 180L134 104H186L320 180Z" fill="#24110F"/><path d="M118 180L152 104H168L202 180Z" fill="#6B1E2A"/>` +
        fl(14, 34, 54, 50, 92, 62) + fl(70, 56, 94, 64, 50, 36) + fl(106, 70, 120, 74, 28, 20) + fl(306, 34, 266, 50, 92, 62) + fl(250, 56, 226, 64, 50, 36) + fl(214, 70, 200, 74, 28, 20) +
        `<g ${XHEAD}><path d="M272 82Q279 77 286 82Q279 87 272 82ZM290 81Q297 76 304 81Q297 86 290 81Z" fill="#EDE4CF"/><g ${XPUP}>${C(279, 82, 2, "#1D1D1B") + C(297, 81, 2, "#1D1D1B")}</g></g>`;
    }, lamp: [160, 18] },
    4: { label: "淹水的檔案室", draw: id => {
      const shelf = (x, w) => `<rect x="${x}" y="30" width="${w}" height="130" fill="#2C2620" stroke="#1A1612" stroke-width="2"/>` + [52, 86, 120].map(y => `<rect x="${x}" y="${y}" width="${w}" height="3" fill="#1A1612"/>` + Array.from({ length: Math.floor((w - 6) / 7) }, (_, i) => `<rect x="${x + 4 + i * 7}" y="${y - 18 + (i % 3) * 2}" width="5" height="${18 - (i % 3) * 2}" fill="${["#6B4B3A", "#4E5A48", "#7A6A4A", "#5A3E46"][i % 4]}"/>`).join("")).join("");
      return `<defs>${lg(id + "w", [[0, "#1F3036"], [1, "#14232A"]])}${lg(id + "q", [[0, "#2F6470", .88], [1, "#123038", .96]])}</defs><rect width="320" height="180" fill="url(#${id}w)"/>` + shelf(14, 92) + shelf(214, 92) + shelf(124, 72) +
        `<rect y="118" width="320" height="62" fill="url(#${id}q)"/>` + ln("M0 118H320", "#8FC4CC", 1.2, ' opacity=".6"') + ln("M30 126h26M90 132h40M180 124h30M240 136h44M60 150h36M200 156h50", "#8FC4CC", .8, ' opacity=".35"') +
        paper(70, 118, -12) + paper(150, 120, 8) + paper(236, 117, 20) + paper(110, 122, -30) + paper(200, 64, 25, .9) + paper(96, 40, -18, .85) + paper(262, 30, 40, .8) + paper(46, 82, 10, .9);
    }, lamp: [160, 14] },
    5: { label: "很大的白色房間", draw: () => `<rect width="320" height="180" fill="#F7F6F2"/><path d="M0 180L112 122H208L320 180Z" fill="#EFEDE6"/><rect x="112" y="48" width="96" height="74" fill="#FBFAF7"/>` +
      ln("M0 0L112 48M320 0L208 48M0 180L112 122M320 180L208 122M112 48H208V122H112Z", "#E4E2DC", 1) +
      `<rect x="153" y="97" width="14" height="25" fill="#FFFFFF" stroke="#C9C7C0" stroke-width=".8"/><rect x="155.5" y="100" width="9" height="4.5" rx=".8" fill="#ECE9E0" stroke="#C9C7C0" stroke-width=".4"/><text x="160" y="103.6" font-size="3.6" text-anchor="middle" fill="#6B6B66" font-family="Georgia,serif">8+9</text>` + C(164.5, 111, .7, "#9C9C96") + `<ellipse cx="160" cy="123" rx="11" ry="1.2" fill="#1D1D1B" opacity=".06"/>`, lamp: [160, 26] },
  };
  function cellarScene(floor, o = {}) {
    const f = Math.min(5, Math.max(1, Math.round(+floor) || 1)), S = SCENES[f], id = nid("k");
    return svgOpen("0 0 320 180", `B${f} ${S.label}`) + S.draw(id) + lamp(S.lamp[0], S.lamp[1], !!o.cleared, id) + `</svg>`;
  }

  // ---------- 職業徽章（64×64，鍍金邊） ----------
  const JOBS = {
    detective: ["偵探", `<circle cx="28" cy="28" r="9"/><path d="M34.5 34.5L44 44" stroke-width="4"/><path d="M23.5 25.5a5 5 0 0 1 3.5-3"/>`],
    historian: ["歷史學家", `<rect x="17" y="19" width="30" height="26" rx="1"/><rect x="21.5" y="23.5" width="21" height="17"/><path d="M23 38l6-6 4 4 3-3 5 5"/><circle cx="37" cy="28" r="1.6"/>`],
    occultist: ["神祕學家", `<path d="M32 14L49 44H15Z"/><path d="M23 35.5Q32 28 41 35.5Q32 43 23 35.5Z"/><circle cx="32" cy="35.5" r="2.6" fill="#F3E6C4"/><path d="M32 8v3M22 10.5l1.6 2.6M42 10.5l-1.6 2.6"/>`],
    gambler: ["賭徒", `<rect x="15" y="25" width="17" height="17" rx="3.5" transform="rotate(-12 23.5 33.5)"/><rect x="32" y="19" width="17" height="17" rx="3.5" transform="rotate(14 40.5 27.5)"/><g fill="#F3E6C4" stroke="none"><circle cx="23.5" cy="33.5" r="1.7"/><circle cx="19.6" cy="29.6" r="1.5"/><circle cx="27.4" cy="37.4" r="1.5"/><circle cx="37.2" cy="23.4" r="1.5"/><circle cx="43.8" cy="31.6" r="1.5"/></g>`],
    artisan: ["工匠", `<path d="M15 40Q14 33 22 33H42Q50 33 49 40Q50 47 42 47H22Q14 47 15 40Z"/><path d="M22 12L41 36" stroke-width="2.6"/><ellipse cx="22.5" cy="12.6" rx="1.4" ry="2.6" transform="rotate(-38 22.5 12.6)"/><path d="M22 13Q12 20 20 26Q28 30 24 36" stroke-width="1.4"/>`],
    salesman: ["業務員", () => `<g transform="translate(12.8 13.6) scale(1.6)" stroke-width="1.4">${ICONS.handshake}</g>`],
  };
  function jobBadge(id) {
    const J = JOBS[id] || ["職業", `<path d="M32 17l4.3 8.8 9.7 1.4-7 6.8 1.7 9.6L32 39.1l-8.7 4.5 1.7-9.6-7-6.8 9.7-1.4z"/>`], g = nid("j");
    const beads = Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return C(n(32 + 29 * Math.cos(a)), n(32 + 29 * Math.sin(a)), .9, "#FFF3C4", ' opacity=".75"'); }).join("");
    return svgOpen("0 0 64 64", J[0]) + `<defs>${lg(g + "a", [[0, "#F6DE8E"], [.5, "#C99A2E"], [1, "#8E6516"]], 0)}${rg(g + "b", [[0, "#8E2C3A"], [1, "#4A131E"]], ' cx=".4" cy=".35" r=".8"')}</defs>` +
      `<circle cx="32" cy="32" r="29" fill="url(#${g}b)" stroke="url(#${g}a)" stroke-width="5"/>${beads}<circle cx="32" cy="32" r="24.3" fill="none" stroke="#E7C766" stroke-width=".8" opacity=".75"/>` +
      `<g fill="none" stroke="#F3E6C4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${typeof J[1] === "function" ? J[1]() : J[1]}</g></svg>`;
  }

  // ---------- 融合祭壇（320×200，只是背景；青蛙由 HTML 放在兩個銅盤上） ----------
  const altarSpots = { left: { x: 92, y: 97 }, right: { x: 228, y: 97 }, center: { x: 160, y: 97 } };
  function altar() {
    const g = nid("t");
    const plate = (x, y) => `<ellipse cx="${x}" cy="${y + 3}" rx="47" ry="11" fill="#6B4A16"/><ellipse cx="${x}" cy="${y}" rx="46" ry="10" fill="url(#${g}b)" stroke="#7A5418" stroke-width="1.4"/><ellipse cx="${x}" cy="${y}" rx="34" ry="7" fill="none" stroke="#8E6516" stroke-width="1" opacity=".8"/><ellipse cx="${x}" cy="${y}" rx="20" ry="4" fill="none" stroke="#FFF0B0" stroke-width=".8" opacity=".6"/>`;
    return svgOpen("0 0 320 200", "融合祭壇") + `<defs>${lg(g + "m", [[0, "#FBFAF6"], [.6, "#E8E5DD"], [1, "#CFCBC1"]])}${lg(g + "b", [[0, "#F6DE8E"], [.45, "#D4A53A"], [1, "#9A6E1C"]], 0)}${lg(g + "f", [[0, "#F1EFE9"], [1, "#D9D5CB"]])}<filter id="${g}g" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>` +
      `<ellipse cx="160" cy="189" rx="160" ry="9" fill="#1D1D1B" opacity=".2"/><rect x="8" y="166" width="304" height="18" rx="1.5" fill="url(#${g}f)" stroke="#B9B4A8"/><rect x="18" y="152" width="284" height="15" rx="1.5" fill="#ECE9E2" stroke="#B9B4A8"/>` +
      `<rect x="34" y="114" width="252" height="39" fill="url(#${g}f)" stroke="#B9B4A8"/>` + ln("M50 122q20 8 34 2t30 10M200 132q24-10 44 0t30-6M120 146q14-6 30 0", "#C9C4B8", 1, ' opacity=".9"') +
      ln("M34 119H286M34 148H286", "#C99A2E", 1.2, ' opacity=".75"') + `<rect x="60" y="124" width="64" height="19" rx="2" fill="none" stroke="#D8D3C7"/><rect x="196" y="124" width="64" height="19" rx="2" fill="none" stroke="#D8D3C7"/><circle cx="160" cy="133.5" r="11" fill="#F6F3EC" stroke="#C99A2E" stroke-width="1.6"/><circle cx="156.5" cy="133.5" r="5" fill="none" stroke="#C99A2E" stroke-width="1.3"/><circle cx="163.5" cy="133.5" r="5" fill="none" stroke="#C99A2E" stroke-width="1.3"/>` +
      `<path d="M30 84H290L308 104H12Z" fill="url(#${g}m)" stroke="#B9B4A8" stroke-linejoin="round"/><rect x="10" y="104" width="300" height="11" fill="#EEEBE4" stroke="#B9B4A8"/>` + ln("M12 109.5H308", "#C99A2E", 1, ' opacity=".7"') +
      plate(92, 97) + plate(228, 97) +
      `<path d="M138 97H182" stroke="#3A2A1A" stroke-width="5" stroke-linecap="round"/><g class="altar-glow"><path d="M138 97H182" stroke="#FFC24A" stroke-width="6" stroke-linecap="round" filter="url(#${g}g)" opacity=".9"/><path d="M139 97H181" stroke="#FFE9A8" stroke-width="2" stroke-linecap="round"/>${C(160, 97, 3.2, "#FFF4CF")}</g></svg>`;
  }

  // ---------- 細線圖示（24×24） ----------
  const dot = (x, y, r = 1.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
  const P = d => `<path d="${d}"/>`;
  const SPK = "M12 3.5c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z";
  const ICONS = {
    dice: `<rect x="4" y="4" width="16" height="16" rx="3"/>` + dot(8.5, 8.5) + dot(15.5, 8.5) + dot(12, 12) + dot(8.5, 15.5) + dot(15.5, 15.5),
    lock: `<rect x="5" y="11" width="14" height="9" rx="2"/>` + P("M8 11V8a4 4 0 0 1 8 0v3M12 14.5v2"),
    unlock: `<rect x="5" y="11" width="14" height="9" rx="2"/>` + P("M8 11V8a4 4 0 0 1 7.6-1.7M12 14.5v2"),
    gear: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/>` + P("M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"),
    sound: P("M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"),
    mute: P("M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5l5 5M20.5 9.5l-5 5"),
    menu: P("M4 7h16M4 12h16M4 17h16"),
    close: P("M6 6l12 12M18 6L6 18"),
    share: `<circle cx="17" cy="6" r="2.5"/><circle cx="7" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/>` + P("M9.2 10.8l5.6-3.4M9.2 13.2l5.6 3.4"),
    copy: `<rect x="8" y="8" width="12" height="12" rx="2"/>` + P("M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"),
    undo: P("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"),
    back: P("M15 5l-7 7 7 7"),
    check: P("M5 12.5l4.5 4.5L19 7.5"),
    book: P("M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"),
    star: P("M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"),
    heart: P("M12 20s-7.5-4.6-7.5-10.2A4 4 0 0 1 12 7.3a4 4 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"),
    upload: P("M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"),
    trash: P("M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"),
    frog: `<circle cx="8" cy="7.5" r="3"/><circle cx="16" cy="7.5" r="3"/>` + P("M5.3 9C3.4 11.5 3.6 18.5 12 19.5c8.4-1 8.6-8 6.7-10.5M9 14.2q3 2 6 0") + dot(8, 7.8, .9) + dot(16, 7.8, .9),
    eye: P("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z") + `<circle cx="12" cy="12" r="3"/>`,
    pillow: P("M5 6.5Q12 4.6 19 6.5Q20.6 12 19 17.5Q12 19.4 5 17.5Q3.4 12 5 6.5zM5 6.5l-1.5-1.5M19 6.5l1.5-1.5M5 17.5L3.5 19M19 17.5l1.5 1.5"),
    hall: `<rect x="5" y="4" width="14" height="10.5" rx="1"/>` + P("M8 12l3-3 2.2 2.2 1.4-1.4L17 12M3.5 20h17M8 17h8"),
    codex: `<rect x="4" y="4" width="16" height="16" rx="2"/>` + P("M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"),
    commission: P("M5 16.5a7 7 0 0 1 14 0zM3.5 16.5h17M12 9.5V8M10.5 8h3M7 19.5h10"),
    gallery: `<rect x="3.5" y="5" width="17" height="14" rx="1"/><rect x="6.5" y="8" width="11" height="8"/>`,
    workshop: P("M20 4l-8.5 8.5M11.5 12.5c-2-.6-4 .4-4.6 2.4-.5 1.9-1.5 4-3.4 4.6 3 .6 6.5.1 7.8-2.1.9-1.5.8-3.4.2-4.9z"),
    lobby: P("M3 9l9-5 9 5zM5.5 9v9M9.8 9v9M14.2 9v9M18.5 9v9M3 20.5h18"),
    origin: P("M12 20v-8M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 14.5c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"),
    library: `<rect x="7.5" y="3.5" width="13" height="13" rx="1.5"/>` + P("M4.5 7v11.5A1.5 1.5 0 0 0 6 20h11.5M10 14l3-3.5 2.5 2.5 1.5-1.5 2 2") + `<circle cx="11.3" cy="7.3" r="1.1"/>`,
    plus: P("M12 5v14M5 12h14"),
    minus: P("M5 12h14"),
    arrowLeft: P("M19 12H5M11 6l-6 6 6 6"),
    arrowRight: P("M5 12h14M13 6l6 6-6 6"),
    info: `<circle cx="12" cy="12" r="8.5"/>` + P("M12 11v5.5") + dot(12, 7.9, 1),
    sparkle: P(SPK + "M19 3v3.5M17.25 4.75h3.5"),
    refresh: P("M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"),
    fusion: `<circle cx="9" cy="13" r="5"/><circle cx="15" cy="13" r="5"/>` + P("M12 3v3.2M10.4 4.6h3.2"),
    office: P("M3.5 11.5h17M5.5 11.5V20M18.5 11.5V20M5.5 15.5h6M11.5 11.5V20M15 11.5V8.5l3-3M16.6 4.4l3.1 1.8"),
    stairs: P("M3.5 20h4.5v-4h4v-4h4V8h4.5M6.5 3.5v6M4.3 7.3l2.2 2.2 2.2-2.2"),
    key: `<circle cx="7.5" cy="12" r="3.8"/>` + P("M11.3 12h9.2M17.5 12v3M20.5 12v2.5"),
    shield: P("M12 3.5l7 2.6v5.4c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6.1zM9 12l2.2 2.2L15.3 10"),
    scroll: P("M7 6.5a2.5 2.5 0 0 1 2.5-2.5H18a2.5 2.5 0 0 1 0 5h-1.5M7 6.5V17M16.5 6.5V17.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1 0-5h1M9 9.5h5M9 13h5"),
    mail: `<rect x="3.5" y="6" width="17" height="12.5" rx="2"/>` + P("M4.2 7.2l7.8 6.1 7.8-6.1"), // 信箱（11-08）
    user: `<circle cx="12" cy="8.5" r="3.6"/>` + P("M5 19.5c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"), // 我的帳號（11-08）
    users: `<circle cx="9" cy="9" r="3.1"/><circle cx="16.6" cy="10" r="2.5"/>` + P("M3.5 19c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5M14.6 14.4c.6-.2 1.3-.3 2-.3 2.2 0 3.9 1.5 4.4 4.4"), // 館友（11-08）
    medal: P("M8 3.5l4 7 4-7M6.5 3.5h11") + `<circle cx="12" cy="15.5" r="5"/>` + P("M12 13.2l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"),
    magnifier: `<circle cx="10.5" cy="10.5" r="6"/>` + P("M15 15l5.5 5.5M7.5 9a3.2 3.2 0 0 1 2.5-2"),
    hammer: P("M12.5 6l3-3 5.5 5.5-3 3zM14 7.5l-9.4 9.4a1.6 1.6 0 0 0 2.3 2.3l9.4-9.4"),
    mask: P("M4.5 5c5 1.8 10 1.8 15 0v6.5c0 4.4-3.4 8-7.5 8s-7.5-3.6-7.5-8zM8.3 10.3q1.4-1.1 2.8 0M12.9 10.3q1.4-1.1 2.8 0M9.3 14.3q2.7 2.2 5.4 0"),
    handshake: P("M2.5 9l3-3 3.5 1.5M21.5 9l-3-3-5.5 1.6-3.6 3.2a1.3 1.3 0 0 0 1.8 1.9L14 11l4 3.6M5.5 6l-.8 7.4 4.8 4.4a1.4 1.4 0 0 0 2-2M18.5 6l.6 7.6-1.1 1M8.6 14.6l2.6 2.4M10.4 12.8l3 2.8M12.2 11.6l3 2.6"),
    hat: P("M6.5 16.5h11M8.5 16.5V8.2Q12 6.6 15.5 8.2v8.3M8.5 13h7M4.5 19.5h15"),
    palette: P("M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9s-.8-1.5-.8-2.3.7-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.1-3.8-7.7-8.5-7.7z") + `<circle cx="7.6" cy="11" r="1.2"/><circle cx="10.2" cy="7.4" r="1.2"/><circle cx="14.4" cy="7.4" r="1.2"/>`,
    hand: P("M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.8a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6-5.5 6S6.4 18.2 5.3 15.6l-1.4-3.2a1.4 1.4 0 0 1 2.5-1.2L8 13.5"),
    hourglass: P("M6.5 3.5h11M6.5 20.5h11M8 3.5V6c0 2.6 4 4.4 4 6s-4 3.4-4 6v2.5M16 3.5V6c0 2.6-4 4.4-4 6s4 3.4 4 6v2.5M9.8 18.6h4.4L12 16.4z"),
    lamp: `<rect x="7.5" y="8" width="9" height="10" rx="2"/>` + P("M9 8l1-3.5h4l1 3.5M10 18v2.5h4V18M12 11v3.5M8.5 4.5a4 3 0 0 1 7 0"), // 探險燈（兌換所，決定 0032）
  };
  ICONS.cellar = ICONS.stairs;
  ICONS.calendar = `<rect x="4" y="5.5" width="16" height="14.5" rx="2"/>` + P("M4 10.5h16M8.5 3.5v4M15.5 3.5v4M8 14h2M12 14h2M16 14h.5M8 17h2M12 17h2"); // 簽到日曆（11-09）
  const icon = name => `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || `<circle cx="12" cy="12" r="4"/>`}</svg>`;

  // ---------- 平面圖：每間房是可以點的區塊（11 間 + 大廳） ----------
  const NAMES = { casino: "賭場", gallery: "畫廊", origin: "起源室", workshop: "手作坊", pillow: "抱枕工作台", commission: "委託櫃台", codex: "圖鑑室", hall: "我的展廳", library: "圖庫", fusion: "融合室", office: "館長室", cellar: "地下收藏庫", lobby: "大廳" };
  const PLAN = {
    land: { vb: "0 0 1000 600", fs: 22, isz: 34, ent: [570, 570], lobby: { d: "M330 280H670V570H470V440H330Z", box: [330, 280, 340, 160] },
      rooms: [["origin", 30, 30, 220, 170], ["gallery", 250, 30, 320, 170], ["codex", 570, 30, 220, 170], ["office", 790, 30, 180, 170], ["workshop", 30, 200, 300, 185], ["pillow", 30, 385, 170, 185], ["casino", 200, 385, 130, 185], ["commission", 330, 200, 340, 80], ["cellar", 330, 440, 140, 130], ["hall", 670, 200, 300, 123], ["library", 670, 323, 300, 124], ["fusion", 670, 447, 300, 123]],
      doors: [["v", 250, 115], ["v", 570, 115], ["v", 790, 115], ["h", 140, 200], ["h", 450, 200], ["h", 880, 200], ["h", 500, 280, 70], ["v", 330, 332], ["v", 330, 412, 36], ["v", 470, 505], ["h", 115, 385], ["v", 670, 240, 40], ["v", 670, 385], ["v", 670, 508], ["h", 820, 323], ["h", 820, 447]] },
    port: { vb: "0 0 600 900", fs: 26, isz: 38, ent: [300, 870], lobby: { d: "M230 430H370V870H230Z", box: [230, 430, 140, 440] },
      rooms: [["origin", 30, 30, 200, 150], ["codex", 230, 30, 180, 150], ["office", 410, 30, 160, 150], ["gallery", 30, 180, 360, 150], ["fusion", 390, 180, 180, 150], ["workshop", 30, 330, 200, 200], ["pillow", 30, 530, 200, 190], ["casino", 30, 720, 200, 150], ["commission", 230, 330, 140, 100], ["hall", 370, 330, 200, 200], ["library", 370, 530, 200, 190], ["cellar", 370, 720, 200, 150]],
      doors: [["v", 230, 105], ["v", 410, 105], ["h", 130, 180], ["h", 490, 180], ["v", 390, 255], ["h", 300, 330], ["h", 300, 430, 60], ["v", 230, 480], ["v", 230, 625], ["v", 230, 795], ["v", 370, 480], ["v", 370, 625], ["v", 370, 795], ["h", 130, 530], ["h", 470, 530]] },
  };
  // 地下收藏庫：往下的樓梯（平面圖畫法：一階一階的踏板 + 往下箭頭）
  const stairsPlan = (x, y, w, h, done = 0) => {
    let d = "", lit = "";
    const y0 = y + h * .64, gap = (h * .36 - 10) / 5;
    for (let i = 0; i < 5; i++) { const seg = `M${n(x + 14 + i * 4)} ${n(y0 + 2 + i * gap)}H${n(x + w - 30 - i * 4)}`; if (i < done) lit += seg; else d += seg; }
    const ax = x + w - 18;
    return `<g class="fp-stairs" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" pointer-events="none">${lit ? `<path class="fp-step-on" d="${lit}"/>` : ""}<path opacity=".45" d="${d}M${n(x + 14)} ${n(y + h * .64 - 4)}V${n(y + h - 8)}M${n(x + w - 30)} ${n(y + h * .64 - 4)}V${n(y + h - 8)}"/><path opacity=".45" d="M${n(ax)} ${n(y + h * .62)}V${n(y + h - 12)}M${n(ax - 4)} ${n(y + h - 16)}l4 4 4-4"/></g>`;
  };
  function floorPlan(o = {}) {
    const L = o.portrait ? PLAN.port : PLAN.land, names = Object.assign({}, NAMES, o.names || {});
    const inner = (key, x, y, w, h, prog) => {
      const name = String(names[key] ?? key), len = Math.max([...name].length, 1), f = n(Math.min(L.fs, (w - 30) / len));
      const pf = n(L.fs * .78), bar = prog && prog.pct != null, bw = Math.min(w - 40, 120);
      const cx = x + w / 2, cy = y + h / 2, horiz = h < 130 && w >= 200;
      const extra = prog ? 8 + pf + (bar ? 10 : 0) : 0;
      let S = L.isz;
      if (!horiz && S + 12 + f + extra > h - 16) { const s2 = S - (S + 12 + f + extra - (h - 16)); S = s2 >= 22 ? s2 : 0; } // 擠不下就把圖示縮小，再不行就拿掉
      let ix, iy, tx, ty, colW = len * f;
      if (horiz) {
        if (prog) colW = Math.max(colW, [...prog.text].length * pf * .82, bar ? bw * .8 : 0);
        const tot = S + 12 + colW; ix = cx - tot / 2; iy = cy - S / 2; tx = ix + S + 12 + colW / 2; ty = cy + f * .36 - extra / 2;
      } else { const top = cy - (S + (S ? 12 : 0) + f + extra) / 2; ix = cx - S / 2; iy = top; tx = cx; ty = top + S + (S ? 10 : 0) + f * .86; }
      let out = S ? `<g class="fp-icon" transform="translate(${n(ix)} ${n(iy)}) scale(${n(S / 24 * 100) / 100})" fill="none" stroke="currentColor" stroke-width="${n(1.7 * 24 / S * 100) / 100}" stroke-linecap="round" stroke-linejoin="round">${ICONS[key === "casino" ? "dice" : key] || ICONS.lobby}</g>` : "";
      out += `<text class="fp-label" x="${n(tx)}" y="${n(ty)}" text-anchor="middle" font-size="${f}" font-family="inherit">${esc(name)}</text>`;
      if (prog) {
        const py = ty + 8 + pf * .9, cls = "fp-prog" + (prog.done ? " done" : "");
        out += `<g class="${cls}" pointer-events="none"><text class="fp-prog-text" x="${n(tx)}" y="${n(py)}" text-anchor="middle" font-size="${pf}" font-family="inherit">${esc(prog.text)}</text>`;
        if (bar) { const bx = tx - bw / 2, by = py + 7, p = Math.max(0, Math.min(1, prog.pct)); out += `<rect class="fp-prog-track" x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="4" rx="2"/><rect class="fp-prog-fill" x="${n(bx)}" y="${n(by)}" width="${n(bw * p)}" height="4" rx="2"/>`; }
        out += "</g>";
      }
      return out;
    };
    let s = svgOpen(L.vb, "博物館平面圖", ' class="fp"');
    const LB = L.lobby.box;
    s += `<g class="fp-lobby"><path class="fp-shape fp-lobby-shape" d="${L.lobby.d}"/>${inner("lobby", ...LB)}</g>`;
    // 新解開的東西（11-08）：房間右上角壹塊金色小牌子「新」（o.fresh ＝ { 房間: 件數 }，畫的時候蓋掉原本那顆小圓點）
    const freshTag = (x, y, w) => {
      const th = n(L.fs * 1.05), tw = n(L.fs * 1.7), tx = n(x + w - tw - 8), ty = n(y + 8);
      return `<g class="fp-fresh" pointer-events="none"><rect class="fp-fresh-plate" x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="3"/><rect class="fp-fresh-line" x="${n(tx + 2.5)}" y="${n(ty + 2.5)}" width="${n(tw - 5)}" height="${n(th - 5)}" rx="2"/><text class="fp-fresh-t" x="${n(tx + tw / 2)}" y="${n(ty + th * .74)}" text-anchor="middle" font-size="${n(L.fs * .74)}" font-family="inherit">新</text></g>`;
    };
    for (const [key, x, y, w, h] of L.rooms) {
      const name = String(names[key] ?? key), st = key === "cellar", prog = (o.progress || {})[key], fr = (o.fresh || {})[key];
      s += `<g class="fp-room${fr ? " is-fresh" : ""}" data-room="${key}" tabindex="0" role="button" aria-label="${esc(name)}${prog ? "：" + esc(prog.text) : ""}${fr ? "（有新解開的東西）" : ""}"><rect class="fp-shape" x="${x}" y="${y}" width="${w}" height="${h}"/>${st ? stairsPlan(x, y, w, h, prog ? prog.steps || 0 : 0) : ""}${inner(key, x, y, w, st ? h * .62 : h, prog)}<circle class="fp-dot" cx="${x + w - 18}" cy="${y + 18}" r="6"/>${fr ? freshTag(x, y, w) : ""}</g>`;
    }
    const [ex, ey] = L.ent;
    let dr = "", arcs = "";
    for (const [t, x, y, len = 44] of [...L.doors, ["h", ex, ey, 70]]) {
      dr += t === "v" ? `<rect x="${x - 4}" y="${y - len / 2}" width="8" height="${len}"/>` : `<rect x="${x - len / 2}" y="${y - 4}" width="${len}" height="8"/>`;
      if (len < 60) arcs += t === "v" ? `M${x} ${y - len / 2}A${len} ${len} 0 0 1 ${x + len} ${y + len / 2}` : `M${x - len / 2} ${y}A${len} ${len} 0 0 0 ${x + len / 2} ${y + len}`;
    }
    s += `<g class="fp-doors" pointer-events="none" aria-hidden="true"><g style="fill:var(--fp-floor,#fff)">${dr}</g><path d="${arcs}" fill="none" stroke="#E4E2DC" stroke-width="1"/>` +
      `<path d="M${ex} ${ey + 26}V${ey + 8}M${ex - 7} ${ey + 15}l7-7 7 7" fill="none" stroke="${MUTE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text class="fp-entrance" x="${ex + 16}" y="${ey + 24}" font-size="${o.portrait ? 15 : 13}" fill="${MUTE}" font-family="inherit">入口</text></g>`;
    return s + `</svg>`;
  }

  // ---------- 印章 ----------
  function stamp(text) {
    const t = String(text ?? ""), len = [...t].length, id = nid("t"), red = "#B33A2E";
    const fs = len <= 1 ? 40 : len === 2 ? 31 : len === 3 ? 24 : n(Math.max(9, 76 / len));
    return svgOpen("0 0 120 120", t || "印章") + `<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".85" seed="3" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3 2.5" result="m"/><feComposite in="d" in2="m" operator="in"/></filter><path id="${id}a" d="M25 62A35 35 0 0 1 95 62"/></defs>` +
      `<g filter="url(#${id})" transform="rotate(-8 60 60)" fill="none" stroke="${red}"><circle cx="60" cy="60" r="52" stroke-width="4.5"/><circle cx="60" cy="60.5" r="44.5" stroke-width="1.6"/>` +
      `<text font-size="9.5" letter-spacing="2" fill="${red}" stroke="none" font-family="'Noto Serif TC','Source Han Serif TC','PMingLiU',serif"><textPath href="#${id}a" startOffset="50%" text-anchor="middle">佩佩博物館</textPath></text>` +
      spark(31, 74, 3.5, red, ' stroke="none"') + spark(89, 74, 3.5, red, ' stroke="none"') +
      `<text x="60" y="${n(68 + fs * .34)}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${red}" stroke="none" font-family="'Noto Serif TC','Source Han Serif TC','PMingLiU','Songti TC',serif">${esc(t)}</text></g></svg>`;
  }

  // ---------- 第 4 版（11-09，決定 0030）：節日、簽到 ----------
  // 節日的小裝飾：都畫在 100×100 的格子裡。畫廊節日特展的畫、導覽列的小圖示共用。
  // at：放在畫的哪裡（tr 右上、tl 左上、br 右下、bl 左下、top 上面中間、sides 兩邊整條）
  // 都是自己畫的簡單形狀；有青蛙的地方用遊戲自己的圓青蛙（不畫 Pepe 的樣子）
  const frogDot = (x, y, s, c, a = "") => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"${a}>${C(-6, -6, 5, c) + C(6, -6, 5, c)}<ellipse cx="0" cy="2" rx="11" ry="8"/></g>`;
  const ray = (x, y, r, c, k) => Array.from({ length: k }, (_, i) => { const a = i * 2 * Math.PI / k, c1 = Math.cos(a), s1 = Math.sin(a); return ln(`M${n(x + c1 * r * .35)} ${n(y + s1 * r * .35)}L${n(x + c1 * r)} ${n(y + s1 * r)}`, c, 1.8); }).join("") + C(x, y, 2.4, c);
  const HOL = {
    lantern: { at: "tr", svg: () => ln("M50 0V12", "#6E4A1A", 2) + `<rect x="38" y="11" width="24" height="7" rx="2" fill="#C99A2E"/><ellipse cx="50" cy="44" rx="25" ry="27" fill="#D9382E" stroke="#8E1E18" stroke-width="2"/>` +
      ln("M50 17V71M38 19Q30 44 38 69M62 19Q70 44 62 69", "#9E241C", 1.4) + `<ellipse cx="42" cy="36" rx="6" ry="10" fill="#F58A6E" opacity=".5"/><rect x="40" y="70" width="20" height="6" rx="2" fill="#C99A2E"/>` + ln("M46 76V94M50 76V97M54 76V94", "#E2B53E", 1.6) },
    couplet: { at: "sides", svg: () => `<rect x="4" y="4" width="14" height="92" rx="1.5" fill="#C8362C" stroke="#8E1E18" stroke-width="1"/><rect x="82" y="4" width="14" height="92" rx="1.5" fill="#C8362C" stroke="#8E1E18" stroke-width="1"/>` +
      [14, 30, 46, 62, 78].map(y => C(11, y, 2.6, "#E9C05A") + C(89, y, 2.6, "#E9C05A")).join("") },
    confetti: { at: "top", svg: () => [[12, 18, "#E9C05A", 20], [28, 8, "#C8362C", -30], [44, 22, "#3B6FD6", 10], [60, 10, "#E9C05A", 40], [76, 20, "#7DC35B", -15], [90, 8, "#C8362C", 25], [20, 38, "#3B6FD6", -40], [52, 40, "#E9C05A", 15], [82, 36, "#C8362C", -10]]
      .map(([x, y, c, r]) => `<rect x="${x - 3}" y="${y - 1.6}" width="6" height="3.2" rx=".8" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join("") + ln("M2 4Q20 24 40 6T80 8T100 4", "#E9C05A", 1.6) + spark(36, 56, 4, "#F2D894") + spark(70, 52, 3, "#F2D894") },
    balloon: { at: "tr", svg: () => [[34, 30, "#E8735F"], [56, 22, "#F2CF4E"], [74, 36, "#6C9BE0"]].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="15" fill="${c}" stroke="#5A4630" stroke-width="1"/>` + ln(`M${x} ${y + 15}Q${x - 4} ${y + 40} 52 96`, "#5A4630", 1) + `<ellipse cx="${x - 4}" cy="${y - 6}" rx="3" ry="5" fill="#fff" opacity=".45"/>`).join("") },
    willow: { at: "tl", svg: () => ln("M4 4Q40 10 60 40Q74 62 70 96", "#6B5232", 2.2) + [[16, 10], [28, 16], [40, 24], [50, 34], [58, 46], [64, 58], [68, 70], [69, 84]].map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? 6 : -6)}" cy="${y + 4}" rx="3.2" ry="8" fill="${i % 3 ? "#8CC66A" : "#6FAF55"}" transform="rotate(${i % 2 ? -30 : 30} ${x} ${y})"/>`).join("") },
    tea: { at: "br", svg: () => `<path d="M22 50H70Q70 82 46 84Q22 82 22 50Z" fill="#F3EEE2" stroke="#8A7A5C" stroke-width="2"/><path d="M70 56Q86 56 82 68Q78 76 66 74" fill="none" stroke="#8A7A5C" stroke-width="2"/><ellipse cx="46" cy="86" rx="32" ry="6" fill="#D9CFBA" stroke="#8A7A5C" stroke-width="1.5"/><ellipse cx="46" cy="52" rx="23" ry="4" fill="#B98A4A"/>` + ln("M36 40q-6-8 0-16q6-8 0-16M50 40q-6-8 0-16q6-8 0-16", "#BFB6A6", 1.8, ' opacity=".8"') },
    zongzi: { at: "br", svg: () => [[34, 60, 1], [64, 66, .85]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-30L24 18H-24Z" fill="#5E9A48" stroke="#2F5A28" stroke-width="2" stroke-linejoin="round"/><path d="M0-30L8 18H-6Z" fill="#7DB65E"/>` + ln("M-15 0H15M-20 10H20", "#C9A86A", 2.4) + `</g>`).join("") + ln("M34 30Q50 14 64 42", "#C9A86A", 1.6) },
    stars: { at: "top", svg: () => spark(18, 30, 9, "#FFF1C2") + spark(82, 26, 9, "#FFF1C2") + C(18, 30, 14, "#FFF1C2", ' opacity=".18"') + C(82, 26, 14, "#FFF1C2", ' opacity=".18"') + ln("M26 32Q50 4 74 28", "#E8DDB2", 1.4, ' stroke-dasharray="1.5 4" opacity=".9"') + [[34, 20], [44, 14], [56, 13], [66, 18]].map(([x, y]) => C(x, y, 1.6, "#FFF6DA")).join("") },
    waterlamp: { at: "bl", svg: () => `<ellipse cx="50" cy="84" rx="44" ry="8" fill="#2E4E66" opacity=".55"/>` + [-50, -25, 0, 25, 50].map(r => `<ellipse cx="50" cy="66" rx="7" ry="18" fill="#F2A7BE" stroke="#B5627C" stroke-width="1" transform="rotate(${r} 50 80)"/>`).join("") + `<ellipse cx="50" cy="80" rx="20" ry="5" fill="#E78FA8"/><path d="M50 48Q56 56 50 62Q44 56 50 48Z" fill="#FFD36B"/>` + C(50, 56, 10, "#FFD36B", ' opacity=".25"') + `<ellipse cx="50" cy="92" rx="10" ry="2" fill="#FFD36B" opacity=".35"/>` },
    moon: { at: "tr", svg: () => C(54, 44, 40, "#FFF3C4", ' opacity=".22"') + C(54, 44, 30, "#FBEBB0") + C(44, 34, 5, "#EED98E") + C(66, 52, 7, "#EED98E") + C(50, 60, 3.5, "#EED98E") + frogDot(56, 44, .9, "#D9C37A", ' opacity=".7"') },
    book: { at: "br", svg: () => `<path d="M8 40Q30 32 50 42Q70 32 92 40V82Q70 74 50 84Q30 74 8 82Z" fill="#F6F0DE" stroke="#7A6A4A" stroke-width="2" stroke-linejoin="round"/>` + ln("M50 42V84", "#7A6A4A", 1.6) + ln("M16 48Q30 44 42 50M16 58Q30 54 42 60M16 68Q30 64 42 70M58 50Q70 44 84 48M58 60Q70 54 84 58M58 70Q70 64 84 68", "#B7AA8A", 1.2) + `<circle cx="80" cy="26" r="9" fill="#D9473A"/>` + ln("M80 17q2-6 6-6", "#5E9A48", 2) },
    firework: { at: "top", svg: () => ray(28, 34, 20, "#F2CF4E", 12) + ray(72, 28, 16, "#E8735F", 12) + ray(52, 60, 12, "#A989DD", 10) },
    chrys: { at: "bl", svg: () => ln("M50 96Q48 76 52 60", "#4E7A3A", 2.4) + `<ellipse cx="38" cy="80" rx="10" ry="4" fill="#5E9A48" transform="rotate(-30 38 80)"/><ellipse cx="62" cy="74" rx="10" ry="4" fill="#5E9A48" transform="rotate(30 62 74)"/>` + Array.from({ length: 16 }, (_, i) => `<ellipse cx="50" cy="30" rx="3.4" ry="15" fill="${i % 2 ? "#F2C94E" : "#E2A92E"}" transform="rotate(${i * 22.5} 50 44)"/>`).join("") + C(50, 44, 7, "#C98A1E") },
    tangyuan: { at: "br", svg: () => `<path d="M12 54H88Q86 88 50 90Q14 88 12 54Z" fill="#F3EEE2" stroke="#8A7A5C" stroke-width="2"/><ellipse cx="50" cy="54" rx="38" ry="7" fill="#F7EBD2" stroke="#8A7A5C" stroke-width="1.5"/>` + [[34, 50, "#F7F5EF"], [48, 47, "#EE8C8C"], [62, 50, "#F7F5EF"], [42, 54, "#EE8C8C"], [56, 54, "#F7F5EF"]].map(([x, y, c]) => C(x, y, 6.5, c, ' stroke="#CDBFA6" stroke-width=".8"')).join("") + ln("M18 66Q50 74 82 66", "#C8362C", 1.4, ' opacity=".6"') },
    xmas: { at: "top", svg: () => ln("M0 10Q25 30 50 12T100 10", "#3F6B3A", 1.6) + [[8, 15, "#E8735F"], [22, 23, "#F2CF4E"], [36, 21, "#6C9BE0"], [50, 13, "#E8735F"], [64, 19, "#7DC35B"], [78, 22, "#F2CF4E"], [92, 13, "#6C9BE0"]].map(([x, y, c]) => C(x, y + 4, 3.6, c) + C(x, y + 4, 7, c, ' opacity=".25"')).join("") + [[14, 46], [40, 40], [66, 50], [88, 42], [28, 62], [76, 64]].map(([x, y]) => C(x, y, 2, "#fff", ' opacity=".85"')).join("") },
    clock: { at: "top", svg: () => C(50, 46, 32, "#F6F0DE", ' stroke="#8A6A12" stroke-width="3"') + Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return C(n(50 + Math.sin(a) * 26), n(46 - Math.cos(a) * 26), i % 3 ? 1.2 : 2.2, "#5A4630"); }).join("") + ln("M50 46L48 24M50 46L60 40", "#2A2218", 2.6) + C(50, 46, 2.6, "#C8362C") + ln("M50 14V6", "#8A6A12", 3) },
  };
  HOL.spring = HOL.lantern; // 春節的外觀用燈籠
  // 放到畫上：照 at 決定位置，大小是畫寬的 4 成（sides 是兩邊整條）
  function holOnArt(look, vb) {
    const D = HOL[look];
    if (!D) return "";
    const [, , W, H] = String(vb).split(" ").map(Number);
    if (D.at === "sides") return `<g transform="scale(${n(W / 100)} ${n(H / 100)})" opacity=".95">${D.svg()}</g>`;
    const sz = W * .4, m = W * .03;
    const x = D.at === "tl" || D.at === "bl" ? m : D.at === "top" ? (W - sz) / 2 : W - sz - m, y = D.at === "br" || D.at === "bl" ? H - sz - m : m;
    return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(sz / 100)})">${D.svg()}</g>`;
  }
  // 導覽列、簽到卡、日曆上的節日小圖示（不認得的不畫）
  function holidayIcon(look) { const D = HOL[look]; return D ? svgOpen("0 0 100 100", null, ' aria-hidden="true" class="hol-ic"') + D.svg() + `</svg>` : ""; }
  // 節日的雕像：大理石的圓青蛙坐在台座上（遊戲自己的青蛙；不是 Pepe 的樣子）。節日的東西由 o.hol 加上去
  EXHIBITS.holstatue = { vb: "0 0 220 300", label: "節日的小雕像", draw: (v, id) => {
    let s = `<defs>${lg(id + "a", [[0, "#E9E6DC"], [1, "#D6D2C6"]])}${rg(id + "m", [[0, "#FFFFFD"], [.6, "#EEEDE8"], [1, "#CDCBC3"]], ' cx=".38" cy=".32" r=".8"')}</defs>`;
    s += `<rect width="220" height="300" fill="url(#${id}a)"/><path d="M40 236V100Q40 48 110 48Q180 48 180 100V236Z" fill="#DEDAD0"/><rect y="292" width="220" height="8" fill="#CFCBBF"/>`;
    s += `<rect x="58" y="232" width="104" height="58" fill="#EFEEE9" stroke="#CFCDC6" stroke-width="1.2"/><rect x="48" y="222" width="124" height="12" rx="1" fill="#F6F5F1" stroke="#CFCDC6" stroke-width="1.2"/><rect x="86" y="252" width="48" height="14" rx="1" fill="#CDBB8E" stroke="#A8925F" stroke-width="1"/>` + ln("M93 257H127M97 261H123", "#8F7A4C", 1);
    s += `<g ${XHEAD}><g fill="url(#${id}m)" stroke="#C3C1B9" stroke-width="1.6"><ellipse cx="84" cy="218" rx="15" ry="6"/><ellipse cx="136" cy="218" rx="15" ry="6"/></g>` + blob(110, 186, 46, 34, 20, 150, 15, `url(#${id}m)`, "#C3C1B9", 1.6) +
      C(90, 148, 8.5, "#F8F7F3", ' stroke="#D4D2CA" stroke-width="1"') + C(130, 148, 8.5, "#F8F7F3", ' stroke="#D4D2CA" stroke-width="1"') + `<g ${XPUP}>${C(91, 146, 2.6, "#9C9A92") + C(131, 146, 2.6, "#9C9A92")}</g>` + ln("M98 196Q110 204 122 196", "#B9B7AE", 2) + `</g>`;
    return s;
  } };
  // 展台裝飾：紅絨緞帶（掛在每一座展台的邊上，中間別一顆金色徽章）；只是好看
  function standDeco(id) {
    if (id !== "stand-velvet") return "";
    return svgOpen("0 0 120 34", null, ' aria-hidden="true" class="stand-deco-svg"') + `<path d="M2 4Q30 26 60 10Q90 26 118 4V10Q90 32 60 16Q30 32 2 10Z" fill="#8E2233" stroke="#5E1622" stroke-width="1.2"/>` + ln("M4 8Q30 28 60 13Q90 28 116 8", "#C8576A", 1.2, ' opacity=".7"') +
      ln("M8 10V30M112 10V30", "#C99A2E", 1.4) + C(8, 31, 2.2, "#E2B53E") + C(112, 31, 2.2, "#E2B53E") + C(60, 14, 6.5, "#E2B53E", ' stroke="#8A6512" stroke-width="1.2"') + spark(60, 14, 3.2, "#FFF1C2") + `</svg>`;
  }
  // 名牌框的角：金色藤蔓（左上角的樣子；其他角由畫面轉過去）
  function nameCorner(id) {
    if (id !== "frame-vine") return "";
    return svgOpen("0 0 40 40", null, ' aria-hidden="true" class="name-corner-svg"') + ln("M3 37V14Q3 3 14 3H37", "#C99A2E", 2.6) + ln("M8 30Q8 10 28 8", "#E2B53E", 1.4) +
      [[6, 22, -30], [12, 12, -60], [22, 6, -80], [5, 30, -10]].map(([x, y, r]) => `<ellipse cx="${x + 3}" cy="${y}" rx="2.4" ry="5" fill="#B98A1E" transform="rotate(${r} ${x} ${y})"/>`).join("") + C(14, 14, 2.4, "#F2D894") + `</svg>`;
  }

  const silhouette = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M7 13a6 6 0 1 1 12 0a6 6 0 1 1-12 0ZM21 13a6 6 0 1 1 12 0a6 6 0 1 1-12 0ZM5 25a15 11 0 1 1 30 0a15 11 0 1 1-30 0ZM9 34.5a5 3 0 1 1 10 0a5 3 0 1 1-10 0ZM21 34.5a5 3 0 1 1 10 0a5 3 0 1 1-10 0Z"/></svg>`;

  return {
    frog, headTop, pillow, exhibit, exhibitDiffs, floorPlan, icon, stamp, silhouette, COLORS, RARITY_COLORS, TINT,
    hatSpot, cellarScene, jobBadge, altar, altarSpots,
    holidayIcon, standDeco, nameCorner, // 第 4 版（11-09，決定 0030）：節日的小圖示、展台裝飾、名牌框
    // 登記表：設計者加新選項時可以直接加一筆（例如 ART.parts.HATS.牛仔帽 = { h: 30, svg: h => "..." }）
    parts: { POSE, MOODS, HATS, AURA, PSIZE, PFILL, PMAT, EXHIBITS, ICONS, BGS, ITEMS, GRAD, SCENES, JOBS, HOL },
  };
})();
