# 把綠底（還有白色間隔條）的素材總表去背、切開（翊文 11-11：「兩張總表是 JPG（綠底），要自己去背、切開」）。
# 用法（anaconda 的 python，要 PIL、numpy、scipy）：
#   python tools/cut_sheet.py 總表.jpg 輸出資料夾 名字1 名字2 ...
# 名字照「由上到下、同一列由左到右」的順序給；個數要跟切出來的壹樣，不壹樣會印出每塊的位置讓你對。
# 做法：
#   1. 綠色（g 比 r、b 都大很多）→ 透明；邊緣半透明，顏色去掉綠色（把 g 壓到 max(r, b)）。
#   2. 白色間隔條（很白、很平）也當背景。
#   3. 發光的外圈原本被綠底混成黃綠色：半透明的地方把顏色換成暖金色（照 card-active.png 的處理）。
#   4. 用連通區塊找出每壹塊，太小的（雜點）丟掉，每塊多留 6px 邊。
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
names = sys.argv[3:]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]

# 綠的程度：g 比另外兩色多多少（0～1）
# 只認綠幕那種很亮的純綠（g 很高、r、b 很低），東西本身的綠色（綠章、綠點，比較暗或比較灰）不算
green = np.clip((g - np.maximum(r, b) - 60) / 80.0, 0, 1) * np.clip((g - 150) / 60.0, 0, 1)
# 白色間隔，和白跟綠交界那壹條淡綠
white = (((r > 225) & (g > 225) & (b > 225)) | ((g > 200) & (r > 170) & (b > 170) & (g - np.maximum(r, b) > 15))).astype(np.float32)
alpha = 1.0 - np.maximum(green, white)

# 去綠：把 g 壓到 max(r, b) 附近
g2 = np.minimum(g, np.maximum(r, b) + 10)
rgb = np.stack([r, g2, b], -1)
# 發光的半透明外圈改暖金色
semi = (alpha > 0.02) & (alpha < 0.85)
gold = np.array([235, 190, 95], np.float32)
rgb[semi] = rgb[semi] * 0.35 + gold * 0.65

mask = alpha > 0.5
mask = ndimage.binary_opening(mask, iterations=2)
lab, n = ndimage.label(mask)
boxes = ndimage.find_objects(lab)
H, W = mask.shape
parts = []
for i, sl in enumerate(boxes):
    if sl is None: continue
    ys, xs = sl
    h, w = ys.stop - ys.start, xs.stop - xs.start
    if h * w < 2500: continue
    parts.append((ys.start, xs.start, ys.stop, xs.stop))
# 同壹列（中心高度差不多）由左到右
parts.sort(key=lambda p: (round(((p[0] + p[2]) / 2) / 60), p[1]))
# 把同壹列的再照 y 中心分組，避免高度不同排錯
rows = []
for p in sorted(parts, key=lambda p: (p[0] + p[2]) / 2):
    cy = (p[0] + p[2]) / 2
    if rows and abs(rows[-1][0] - cy) < max(40, (p[2] - p[0]) * 0.35):
        rows[-1][1].append(p)
    else:
        rows.append([cy, [p]])
ordered = [q for _, ps in rows for q in sorted(ps, key=lambda p: p[1])]
for i, p in enumerate(ordered):
    print(i + 1, "y", p[0], p[2], "x", p[1], p[3], "size", p[3] - p[1], "x", p[2] - p[0])
if len(names) != len(ordered):
    print("名字", len(names), "個，切出來", len(ordered), "塊：對不上，沒有存")
    sys.exit(1)
os.makedirs(out, exist_ok=True)
# 這壹塊的連通區塊編號：框裡出現最多的那個（不是 0）
def majority(lab, p):
    v = lab[p[0]:p[2], p[1]:p[3]].ravel()
    v = v[v > 0]
    return np.bincount(v).argmax()
rgba = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
pad = 6
# 每塊只留自己那壹塊（旁邊別塊的角、雜線都去掉）；邊緣多擴幾格，留住半透明的光
for nm, p in zip(names, ordered):
    if nm == "-": continue
    y0, x0, y1, x1 = p
    own = ndimage.binary_dilation(lab == majority(lab, p), iterations=pad + 4)
    y0, x0, y1, x1 = max(0, y0 - pad), max(0, x0 - pad), min(H, y1 + pad), min(W, x1 + pad)
    piece = rgba[y0:y1, x0:x1].copy()
    piece[..., 3] = (piece[..., 3] * own[y0:y1, x0:x1]).astype(np.uint8)
    Image.fromarray(piece).save(os.path.join(out, nm + ".png"))
    print("存了", nm, x1 - x0, "x", y1 - y0)
