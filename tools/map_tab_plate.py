"""圖書館「地圖」頁籤的專用牌子（11-16 翊文：請美術畫）。
程式畫的（不是 AI 生的）：泛黃摺痕的航海圖紙、破邊、虛線航線、左角壹個小羅盤，選好的那塊加紅蠟邊和紅叉。
輸出 web/public/ui2/ui2-tabx-map-1.webp（平常）、-2.webp（選好），尺寸跟其他 tabx 壹樣（約 480x84），
CSS 用 border-image: url(...) 30 40 fill（跟別的牌子同切法），中間會被拉長，所以只有「上下邊、四角」放細節，
中間只放不怕拉長的東西（摺痕是直線、紙紋）。
用法：python tools/map_tab_plate.py [--preview tmp.png]
"""
import math, sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, S = 480, 84, 3  # 輸出大小、超取樣倍數
rnd = random.Random(1116)
rs = np.random.RandomState(1116)


def noise(w, h, scale, seed):
    r = np.random.RandomState(seed)
    small = r.rand(max(2, h // scale + 2), max(2, w // scale + 2))
    im = Image.fromarray((small * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype("float32") / 255


def build(selected):
    w, h = W * S, H * S
    # 紙底：拿館外地圖的紙鋪滿，再染成更黃的茶漬色
    paper = Image.open("web/public/map/paper.webp").convert("RGB")
    base = Image.new("RGB", (w, h))
    for x in range(0, w, paper.width):
        for y in range(0, h, paper.height):
            base.paste(paper, (x, y))
    a = np.asarray(base).astype("float32")
    lum = a.mean(axis=2, keepdims=True) / 255
    tint = np.array([226, 196, 140] if not selected else [240, 214, 160], dtype="float32")
    a = tint * (0.55 + 0.6 * lum)
    # 茶漬：大塊的深淺
    stain = noise(w, h, 90 * S // 3, 7)[..., None]
    a *= 0.88 + 0.22 * stain
    # 邊緣燻黃（離邊越近越深）
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) / (S * 12.0)
    burn = np.clip(1 - d, 0, 1)[..., None]
    a = a * (1 - 0.32 * burn) + np.array([120, 70, 30], dtype="float32") * 0.32 * burn * 0.6
    img = Image.fromarray(np.clip(a, 0, 255).astype("uint8")).convert("RGBA")
    dr = ImageDraw.Draw(img)

    # 摺痕：兩條直的（亮暗成對，像紙折過）；直線拉長不會變形
    for fx in (0.36, 0.69):
        x = int(w * fx)
        dr.line([(x, 0), (x, h)], fill=(110, 70, 30, 120), width=S)
        dr.line([(x + S, 0), (x + S, h)], fill=(255, 245, 215, 120), width=S)
    # 橫的壹條淡折痕只畫在角落以外會被拉長；略過

    # 墨框：細的雙線＋四角圓角裝飾
    ink = (92, 52, 24, 230)
    m = 9 * S
    dr.rectangle([m, m, w - m, h - m], outline=ink, width=S)
    dr.rectangle([m + 4 * S, m + 4 * S, w - m - 4 * S, h - m - 4 * S], outline=(92, 52, 24, 110), width=S)
    # 虛線航線：沿著上下兩條內框畫短虛線（直的方向被拉長只是虛線變長，看起來還是虛線）
    for yv in (m + 4 * S, h - m - 4 * S):
        x = m + 14 * S
        while x < w - m - 14 * S:
            dr.line([(x, yv), (x + 5 * S, yv)], fill=(150, 40, 30, 200 if selected else 150), width=int(1.5 * S))
            x += 10 * S

    # 左上角的小羅盤（在左邊 40px 的角裡，不會被拉長）
    cx, cy, r = 24 * S, h // 2, 11 * S
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ink, width=S)
    dr.ellipse([cx - r + 3 * S, cy - r + 3 * S, cx + r - 3 * S, cy + r - 3 * S], outline=(92, 52, 24, 120), width=S)
    for ang, ln, col in ((0, r + 4 * S, (150, 30, 20, 240)), (90, r + 2 * S, ink), (180, r + 2 * S, ink), (270, r + 2 * S, ink)):
        t = math.radians(ang - 90)
        tip = (cx + math.cos(t) * ln, cy + math.sin(t) * ln)
        l = (cx + math.cos(t + 1.57) * 3 * S, cy + math.sin(t + 1.57) * 3 * S)
        rt = (cx + math.cos(t - 1.57) * 3 * S, cy + math.sin(t - 1.57) * 3 * S)
        dr.polygon([tip, l, rt], fill=col)
    dr.ellipse([cx - S, cy - S, cx + S, cy + S], fill=(240, 220, 170, 255))

    # 右邊角：平常是小小的 × 標記（藏寶的記號），選好換成紅叉＋紅蠟邊
    ex, ey = w - 24 * S, h // 2
    k = 6 * S
    col = (170, 32, 24, 245 if selected else 150)
    dr.line([(ex - k, ey - k), (ex + k, ey + k)], fill=col, width=int(2.2 * S))
    dr.line([(ex - k, ey + k), (ex + k, ey - k)], fill=col, width=int(2.2 * S))

    if selected:
        # 紅蠟邊：外圈壹圈紅，像火漆壓過
        dr.rectangle([S * 2, S * 2, w - S * 3, h - S * 3], outline=(160, 36, 28, 235), width=int(3 * S))

    # 破邊：用雜訊把外緣啃出不規則缺口，做 alpha
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle([4 * S, 4 * S, w - 4 * S, h - 4 * S], fill=255)
    nz = noise(w, h, 5 * S, 11) * 0.6 + noise(w, h, 2 * S, 12) * 0.4
    edge = np.asarray(mask.filter(ImageFilter.GaussianBlur(3 * S))).astype("float32") / 255
    al = np.clip((edge - 0.25 - (nz - 0.5) * 0.9) * 4, 0, 1)
    # 邊要留 1-2px 空白，免得 border-image 邊緣被切
    al[: 2 * S, :] = 0; al[-2 * S:, :] = 0; al[:, : 2 * S] = 0; al[:, -2 * S:] = 0
    arr = np.asarray(img).copy()
    arr[..., 3] = (al * 255).astype("uint8")
    img = Image.fromarray(arr)
    # 外緣壹圈深褐燻邊（讓它在淺色底上也分得出來）
    out = img.resize((W, H), Image.LANCZOS)
    return out


def main():
    prev = None
    if "--preview" in sys.argv:
        prev = sys.argv[sys.argv.index("--preview") + 1]
    ims = [build(False), build(True)]
    for i, im in enumerate(ims, 1):
        im.save(f"web/public/ui2/ui2-tabx-map-{i}.webp", quality=92, method=6)
    if prev:
        sheet = Image.new("RGBA", (W * 2 + 30, H + 20), (40, 30, 24, 255))
        sheet.alpha_composite(ims[0], (10, 10)); sheet.alpha_composite(ims[1], (W + 20, 10))
        sheet.resize((sheet.width * 2, sheet.height * 2)).save(prev)


if __name__ == "__main__":
    main()
