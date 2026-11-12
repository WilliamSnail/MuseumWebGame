# 把綠底的「一張好幾格」切成一樣大的格子，排成一條（webp），給 CSS 一格一格播或挑一格用。
# 翊文 11-12 生的地下室素材：怪物三個姿勢、特效六～七格、按鈕圖示六個、地圖的點五個（docs/地下室素材清單.md）。
# 跟 tools/cut_sheet.py 不同：
#   - 不把白色當背景（白布、白紙是東西本身）。
#   - 照「每一排幾格」切：--rows 6 是一排六格；--rows 4,3 是上排四格、下排三格。
#     排和排之間、格和格之間找最寬的空白切；找不到空白（貼在一起）就平均切。
#   - 每一格用同一個框裁（所有格子內容的聯集），格子裡的位置不動：蓋章往下、灰塵散開這種動作會留著，播起來也不會跳。
# 用法（anaconda 的 python，要 PIL、numpy、scipy）：
#   python tools/cut_frames.py 原圖 輸出.webp --rows 3 [--cell 300] [--split]
#   --cell   每格最大邊（縮小用，不放大）
#   --split  另外每格存一個檔：輸出-1.webp、輸出-2.webp…
# 會印一行 JSON：{"n":格數,"w":格寬,"h":格高}。CSS：background-size: (n×100%) 100%，第 i 格 background-position: i/(n-1)×100%。
import sys, json, argparse
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--rows", required=True)
ap.add_argument("--cell", type=int, default=0)
ap.add_argument("--split", action="store_true")
a = ap.parse_args()
rows = [int(x) for x in a.rows.split(",")]

im = np.asarray(Image.open(a.src).convert("RGB")).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
# 綠幕：g 比 r、b 都多很多（亮的、暗的綠幕都認得）。東西本身比較灰的綠不算
dom = g - np.maximum(r, b)
green = np.clip((dom - 45) / 50.0, 0, 1) * np.clip((g - 90) / 40.0, 0, 1)
alpha = 1.0 - green
# 半透明的地方（發光、灰塵、邊緣）原本混了綠幕的顏色：把綠幕減回去，c = (看到的 - (1-α)×綠幕) / α
key = np.median(im[green > 0.95], axis=0) if (green > 0.95).any() else np.array([0, 255, 0], np.float32)
semi = (alpha > 0.03) & (alpha < 0.97)
a3 = alpha[..., None]
un = (im - (1 - a3) * key) / np.maximum(a3, 0.03)
rgb = np.where(semi[..., None], un, im).clip(0, 255)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
g2 = np.clip(g, np.minimum(r, b) * 0.85, np.maximum(r, b))  # 剩下的綠光壓掉（最多變黃），也不要減過頭變洋紅
rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
mask = ndimage.binary_opening(alpha > 0.3, iterations=1)
H, W = mask.shape

def cuts(proj, n, length):
    """在投影（每一行／列有幾個點）上找 n-1 個切點：從平均切的位置往兩邊找，最近的空白（最少點）的那一條；
    半格之內都沒有空白就切在點最少的地方"""
    if n <= 1: return [0, length]
    step = length / n
    out = []
    for k in range(1, n):
        ideal = round(step * k)
        lo, hi = max(1, round(ideal - step * 0.45)), min(length - 1, round(ideal + step * 0.45))
        seg = proj[lo:hi]
        best = seg.min()
        cand = np.nonzero(seg == best)[0] + lo
        out.append(int(cand[np.argmin(np.abs(cand - ideal))]))
    return [0] + out + [length]

ys = cuts(mask.sum(1), len(rows), H)
cells = []  # (y0, y1, x0, x1)
for ri, n in enumerate(rows):
    y0, y1 = ys[ri], ys[ri + 1]
    xs = cuts(mask[y0:y1].sum(0), n, W)
    for k in range(n): cells.append((y0, y1, xs[k], xs[k + 1]))

# 每格內容的範圍（相對格子的左上角），取聯集；格子大小不一樣時，用格子的中心對齊
boxes = []
for (y0, y1, x0, x1) in cells:
    m = mask[y0:y1, x0:x1]
    yy, xx = np.nonzero(m)
    if len(yy) == 0: boxes.append(None); continue
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    boxes.append((y0 + yy.min() - cy, y0 + yy.max() + 1 - cy, x0 + xx.min() - cx, x0 + xx.max() + 1 - cx))
got = [bx for bx in boxes if bx]
by0 = min(bx[0] for bx in got) - 6; by1 = max(bx[1] for bx in got) + 6
bx0 = min(bx[2] for bx in got) - 6; bx1 = max(bx[3] for bx in got) + 6
ch, cw = int(round(by1 - by0)), int(round(bx1 - bx0))
frames = []
for (y0, y1, x0, x1) in cells:
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    fy0, fx0 = int(round(cy + by0)), int(round(cx + bx0))
    f = np.zeros((ch, cw, 4), np.uint8)
    # 只拿這一格裡面的（別格伸過來的不要）
    sy0, sy1 = max(fy0, y0), min(fy0 + ch, y1); sx0, sx1 = max(fx0, x0), min(fx0 + cw, x1)
    if sy1 > sy0 and sx1 > sx0: f[sy0 - fy0:sy1 - fy0, sx0 - fx0:sx1 - fx0] = rgba[sy0:sy1, sx0:sx1]
    frames.append(Image.fromarray(f, "RGBA"))
if a.cell and max(cw, ch) > a.cell:
    s = a.cell / max(cw, ch)
    cw, ch = max(1, round(cw * s)), max(1, round(ch * s))
    frames = [f.resize((cw, ch), Image.LANCZOS) for f in frames]
strip = Image.new("RGBA", (cw * len(frames), ch), (0, 0, 0, 0))
for i, f in enumerate(frames): strip.paste(f, (i * cw, 0))
strip.save(a.out, "WEBP", quality=86, method=6)
if a.split:
    base = a.out[:-5] if a.out.endswith(".webp") else a.out
    for i, f in enumerate(frames): f.save(f"{base}-{i + 1}.webp", "WEBP", quality=86, method=6)
print(json.dumps({"n": len(frames), "w": cw, "h": ch}))
