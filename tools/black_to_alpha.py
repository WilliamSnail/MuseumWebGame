# 黑底的素材（霧、光暈）轉成透明：亮度當透明度，顏色統一成壹個色。
# 用法（anaconda 的 torch 環境，要 PIL、numpy）：
#   python tools/black_to_alpha.py 輸入.webp 輸出.webp [--color 253,248,230] [--crop 0,130,1024,440] [--gamma 1.0] [--resize 寬]
# 做法：亮度（0～255）÷255 當 alpha（可用 --gamma 調曲線），RGB 全部填 --color，輸出 RGBA。
# 第壹個用途：館外地圖的邊緣霧（11-16，docs/素材/館外地圖素材清單.md 的 M-9）。
import sys
import numpy as np
from PIL import Image

a = sys.argv[1:]
src, out = a[0], a[1]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
color = [int(x) for x in opt("--color", "253,248,230").split(",")]
gamma = float(opt("--gamma", "1.0"))
im = Image.open(src).convert("RGB")
if "--crop" in a:
    x0, y0, x1, y1 = [int(x) for x in opt("--crop", "").split(",")]
    im = im.crop((x0, y0, x1, y1))
if "--resize" in a:
    w = int(opt("--resize", "0")); im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
v = np.asarray(im).astype(np.float32).mean(axis=2) / 255.0
alpha = np.clip(v, 0, 1) ** gamma
rgba = np.zeros((*v.shape, 4), np.uint8)
rgba[..., :3] = color
rgba[..., 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(rgba).save(out, quality=88)
print("存了", out, im.width, "x", im.height)
