# 把生成的材質圖變成可以無縫重複貼的磚（翊文 11-12：板子拆成零件，底的材質要能鋪滿不拉伸）。
# 生成的圖常常「左上亮、右下暗」，邊也接不起來：直接重複貼會看到壹格壹格。這支做兩件事：
#   1. 拉平亮暗：除以很模糊的自己（只留下大範圍的光），再乘回平均亮度。細節（裂紋、紋路）不動。
#   2. 修接縫：跟「往右下錯開半張」的自己混合，邊上用錯開的那張（它的邊是原圖的中間，本來就連著），中間用原圖。
#   --x / --y 只修壹個方向（給只往橫向接的邊條用）。
# 用法（anaconda 的 python）：
#   python tools/make_tile.py 原圖 輸出.webp [--size 512] [--flat 0.18] [--blend 0.25] [--x] [--preview 預覽.png]
#   --flat：模糊半徑佔圖寬的比例（0 = 不拉平）；--blend：邊上混合的寬度佔圖寬的比例；--preview：拼 3x2 張看接縫
import sys, argparse
import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--size", type=int, default=0)
ap.add_argument("--flat", type=float, default=0.18)
ap.add_argument("--blend", type=float, default=0.25)
ap.add_argument("--x", action="store_true"); ap.add_argument("--y", action="store_true")
ap.add_argument("--preview")
ap.add_argument("--q", type=int, default=86)
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
alpha = np.asarray(im)[..., 3].astype(float) / 255
rgb = im.convert("RGB")
H, W = rgb.size[1], rgb.size[0]
x = np.asarray(rgb).astype(float)

if a.flat > 0 and (a.x != a.y):  # 1. 只往壹個方向接的邊條：只拉平那個方向的亮暗（上下的立體光影要留著）
    ax = 0 if a.x else 1
    m = alpha[..., None] if alpha.min() < 0.999 else np.ones_like(x[..., :1])
    prof = (x.mean(axis=2, keepdims=True) * m).sum(axis=ax, keepdims=True) / np.maximum(m.sum(axis=ax, keepdims=True), 1)
    n = prof.size; r = max(4, int(n * a.flat)); k = np.exp(-0.5 * (np.arange(-3 * r, 3 * r + 1) / r) ** 2); k /= k.sum()
    p = np.convolve(np.pad(prof.ravel(), 3 * r, mode="wrap"), k, mode="same")[3 * r:3 * r + n]
    p = p.reshape(prof.shape)
    x = np.clip(x / np.maximum(p, 1) * p.mean(), 0, 255)
elif a.flat > 0:  # 1. 拉平亮暗
    r = max(4, int(W * a.flat))
    low = np.asarray(rgb.filter(ImageFilter.GaussianBlur(r))).astype(float)
    lum = low.mean(axis=2, keepdims=True)
    x = x / np.maximum(lum, 1) * x.mean()
    x = np.clip(x, 0, 255)

do_x = a.x or not a.y; do_y = a.y or not a.x
def weight(n, frac):  # 中間 1、邊上 0，平滑過渡
    t = np.minimum(np.arange(n), np.arange(n)[::-1]) / max(1, frac * n)
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)
# 權重：原圖的接縫（四邊）用 0、錯開那張的接縫（正中間的十字）用 1，其他地方照「離哪個接縫近」平滑過渡。
# （11-12 第壹版用 wx*wy 相乘，十字上不是 1，羊皮紙看得到淡淡的十字線）
yy, xx = np.mgrid[0:H, 0:W].astype(float)
inf = np.full((H, W), 1e9)
d_edge = np.minimum(np.minimum(xx, W - 1 - xx) if do_x else inf, np.minimum(yy, H - 1 - yy) if do_y else inf)
d_cross = np.minimum(np.abs(xx - (W - 1) / 2) if do_x else inf, np.abs(yy - (H - 1) / 2) if do_y else inf)
t = d_edge / np.maximum(d_edge + d_cross, 1e-6)
t = np.clip((t - 0.5) / max(a.blend, 0.02) + 0.5, 0, 1)  # --blend 越小，過渡越窄
w = (t * t * (3 - 2 * t))[..., None]
sh = np.roll(x, (H // 2 if do_y else 0, W // 2 if do_x else 0), axis=(0, 1))
x = x * w + sh * (1 - w)  # 2. 修接縫
al = alpha * w[..., 0] + np.roll(alpha, (H // 2 if do_y else 0, W // 2 if do_x else 0), axis=(0, 1)) * (1 - w[..., 0])

out = Image.fromarray(np.dstack([np.clip(x, 0, 255), al * 255]).astype(np.uint8), "RGBA")
if al.min() > 0.999: out = out.convert("RGB")
if a.size: out = out.resize((a.size, round(a.size * H / W)), Image.LANCZOS)
out.save(a.out, quality=a.q)
g = np.asarray(out.convert("L")).astype(float)
q = max(1, g.shape[0] // 5)
print(f"{a.out}  {out.size[0]}x{out.size[1]}  四角亮度 {g[:q,:q].mean():.0f} {g[:q,-q:].mean():.0f} {g[-q:,:q].mean():.0f} {g[-q:,-q:].mean():.0f}  邊差 左右 {abs(g[:,0]-g[:,-1]).mean():.1f} 上下 {abs(g[0]-g[-1]).mean():.1f}")
if a.preview:
    tw, th = out.size
    pv = Image.new("RGB", (tw * 3, th * 2))
    for i in range(3):
        for j in range(2): pv.paste(out.convert("RGB"), (i * tw, j * th))
    pv.save(a.preview); print(a.preview)
