# 把 assets/panel-kit/ 的原圖做成畫面上組板子用的九宮格圖（翊文 11-12，docs/素材生成.md）。
# 九宮格圖：四角是原圖的角、四邊是可以重複接的邊、中間是可以重複貼的底；CSS 用
#   border-image: url(...) C fill / 寬度 round
# 角固定、邊和中間只重複不拉伸，所以什麼大小都不變形。
# 用法（anaconda 的 python，在專案資料夾）：python tools/build_panel_kits.py
# 輸出到 web/public/kit/，印出每張的大小和 CSS 要填的切線（slice）。
import os
import numpy as np
from PIL import Image, ImageFilter

K = "assets/panel-kit/"; O = "web/public/kit/"
os.makedirs(O, exist_ok=True)

def key_green(path):  # 綠背景 → 透明（邊上的綠色反光也壓掉）
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    al = np.clip(1 - (d - 25) / 55, 0, 1)
    a[..., 1] = np.where(d > 0, np.maximum(r, b) + np.minimum(d, 8), g)
    A = Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA"); im.putalpha(A)
    return im

def seam_x(im, band=24):  # 橫向接縫：兩端的顏色往中間混，透明度兩端取平均（撕邊、雕花的輪廓不糊掉）
    a = np.asarray(im).astype(float); W = a.shape[1]
    sh = np.roll(a, W // 2, axis=1)
    x = np.arange(W); d = np.minimum(x, W - 1 - x)
    w = np.clip(d / max(1, W * 0.35), 0, 1); w = (w * w * (3 - 2 * w))[None, :, None]
    out = a.copy(); out[..., :3] = a[..., :3] * w + sh[..., :3] * (1 - w)
    al = a[..., 3]; m = (al[:, :1] + al[:, -1:]) / 2
    t = np.clip(d / band, 0, 1)[None, :]
    out[..., 3] = al * t + m * (1 - t)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")

def seam_xy(im):  # 兩個方向（中間的底）：沿用 make_tile 的做法，跟錯開半張的自己混
    a = np.asarray(im.convert("RGB")).astype(float); H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    de = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    dc = np.minimum(np.abs(xx - (W - 1) / 2), np.abs(yy - (H - 1) / 2))
    t = de / np.maximum(de + dc, 1e-6); t = np.clip((t - .5) / .6 + .5, 0, 1); w = (t * t * (3 - 2 * t))[..., None]
    sh = np.roll(a, (H // 2, W // 2), axis=(0, 1))
    return Image.fromarray(np.clip(a * w + sh * (1 - w), 0, 255).astype(np.uint8)).convert("RGBA")

def quads(im, boxes):
    return {n: im.crop(b) for n, b in boxes.items()}

def nine(tl, tr, bl, br, top, bottom, left, right, center, C, T):
    S = 2 * C + T
    at = Image.new("RGBA", (S, S))
    for img, pos in [(tl, (0, 0)), (tr, (C + T, 0)), (bl, (0, C + T)), (br, (C + T, C + T)),
                     (top, (C, 0)), (bottom, (C, C + T)), (left, (0, C)), (right, (C + T, C)), (center, (C, C))]:
        at.alpha_composite(img, pos)
    return at

def save(im, name, q=88):
    im.save(O + name, quality=q, method=6); print(f"{name}  {im.size[0]}x{im.size[1]}  {os.path.getsize(O + name) // 1024} KB")

# ---------- 第 2 套：釘在牆上的羊皮紙告示（2-3 四塊紙；邊和中間也從同壹張拿，顏色才接得上） ----------
pc = key_green(K + "parch-corners-raw.png")
Q = quads(pc, {"tl": (42, 44, 460, 460), "tr": (564, 44, 980, 460), "bl": (44, 564, 460, 979), "br": (564, 564, 981, 981)})
C, T = 150, 140
tl = Q["tl"].crop((0, 0, C, C)); tr = Q["tr"].crop((Q["tr"].size[0] - C, 0, Q["tr"].size[0], C))
bl = Q["bl"].crop((0, Q["bl"].size[1] - C, C, Q["bl"].size[1])); br = Q["br"].crop((Q["br"].size[0] - C, Q["br"].size[1] - C, Q["br"].size[0], Q["br"].size[1]))
# 邊：2-3 自己的邊取長壹點的壹段（260px），再接上左右翻過來的同壹段 → 520px 壹輪，接縫天生對得上。
# （試過：只取 140px 重複像郵票齒孔；用 2-2 的長撕邊，撕口太粗、縮小後壹塊壹塊的。11-12）
def mirror_x(im):
    out = Image.new("RGBA", (im.size[0] * 2, im.size[1])); out.alpha_composite(im, (0, 0)); out.alpha_composite(im.transpose(Image.FLIP_LEFT_RIGHT), (im.size[0], 0)); return out
seg = 260; T = seg * 2
qw = Q["tl"].size[0]
top = mirror_x(Q["tl"].crop((qw - seg - 6, 0, qw - 6, C)))
bottom = mirror_x(Q["bl"].crop((Q["bl"].size[0] - seg - 6, Q["bl"].size[1] - C, Q["bl"].size[0] - 6, Q["bl"].size[1])))
lv = Q["tl"].crop((0, Q["tl"].size[1] - seg - 6, C, Q["tl"].size[1] - 6)).rotate(-90, expand=True)
left = mirror_x(lv).rotate(90, expand=True)
rv = Q["tr"].crop((Q["tr"].size[0] - C, Q["tr"].size[1] - seg - 6, Q["tr"].size[0], Q["tr"].size[1] - 6)).rotate(-90, expand=True)
right = mirror_x(rv).rotate(90, expand=True)
inner = Q["tl"].crop((C, C, C + seg, C + seg))  # 中間：紙的裡面，上下左右都翻過來接，壹樣天生無縫
c2 = mirror_x(inner); center = Image.new("RGBA", (T, T)); center.alpha_composite(c2, (0, 0)); center.alpha_composite(c2.transpose(Image.FLIP_TOP_BOTTOM), (0, seg))
save(nine(tl, tr, bl, br, top, bottom, left, right, center, C, T), "notice9.webp")
print("  notice9：border-image-slice", C, "fill")

# ---------- 第 3 套：大廳的金框（3-3 四個角；金條從角上的框拿，才跟角接得上） ----------
gc = key_green(K + "gold-corners-raw.webp")
G = quads(gc, {"tl": (14, 14, 450, 450), "tr": (574, 14, 1011, 450), "bl": (14, 574, 451, 1010), "br": (573, 574, 1010, 1011)})
# 角上的雕花另外存（大的框才疊上去）；九宮格只放框條的部分
for n, q in G.items(): save(q, f"gold-orn-{n}.webp")
F, TF = 52, 60  # 框條的寬（原圖 1024 上大約 52px）
w0 = G["tl"].size[0]
tlf = G["tl"].crop((0, 0, F, F)); trf = G["tr"].crop((G["tr"].size[0] - F, 0, G["tr"].size[0], F))
blf = G["bl"].crop((0, G["bl"].size[1] - F, F, G["bl"].size[1])); brf = G["br"].crop((G["br"].size[0] - F, G["br"].size[1] - F, G["br"].size[0], G["br"].size[1]))
topf = seam_x(G["tl"].crop((w0 - TF - 4, 0, w0 - 4, F)))
botf = seam_x(G["bl"].crop((G["bl"].size[0] - TF - 4, G["bl"].size[1] - F, G["bl"].size[0] - 4, G["bl"].size[1])))
leftf = seam_x(G["tl"].crop((0, G["tl"].size[1] - TF - 4, F, G["tl"].size[1] - 4)).rotate(-90, expand=True)).rotate(90, expand=True)
rightf = seam_x(G["tr"].crop((G["tr"].size[0] - F, G["tr"].size[1] - TF - 4, G["tr"].size[0], G["tr"].size[1] - 4)).rotate(-90, expand=True)).rotate(90, expand=True)
save(nine(tlf, trf, blf, brf, topf, botf, leftf, rightf, Image.new("RGBA", (TF, TF)), F, TF), "gold9.webp")
print("  gold9：border-image-slice", F, "（不要 fill，中間透出底色）")

# 酒紅花紋、羊皮紙的底（重複貼的磚）
wine = Image.open(K + "wine-raw.webp").convert("RGB")
os.system(f'python tools/make_tile.py {K}wine-raw.webp {O}wine.webp --size 512 --flat 0.25 --blend 0.6 --q 84')
os.system(f'python tools/make_tile.py {K}parch-raw.webp {O}parch.webp --size 512 --flat 0.1 --blend 0.6 --q 84')

# ---------- 捲軸：左右兩頭固定，中間的紙從左邊那塊平的紙拿 ----------
sc = key_green(K + "scroll-ends-raw.png")
L = sc.crop((19, 30, 320, 992)); R = sc.crop((704, 30, 1006, 992))
# 中間的紙：用羊皮紙的底（捲軸平的那段有明暗，重複起來變直條紋，11-12 手機截圖看到的），顏色對到捲軸的紙，
# 上下的透明照捲軸平的那段（紙的上下緣在哪裡）
MW = 240
col = np.asarray(L.crop((245, 0, 255, L.size[1]))).astype(float)
al_col = col[..., 3].mean(1)
paper = col[al_col > 250][..., :3].reshape(-1, 3).mean(0)
pt = np.asarray(Image.open(K + "parch-tile.webp").convert("RGB").resize((MW, MW))).astype(float)
pt = pt / pt.reshape(-1, 3).mean(0) * paper
reps = int(np.ceil(L.size[1] / MW)); pt = np.vstack([pt if i % 2 == 0 else pt[::-1] for i in range(reps)])[:L.size[1]]
mid = Image.fromarray(np.dstack([np.clip(pt, 0, 255), np.repeat(al_col[:, None], MW, 1)]).astype(np.uint8), "RGBA")
SW = 220  # 兩頭各留多寬（軸＋捲起來的紙＋壹點平的紙）
Lw = L.crop((0, 0, SW, L.size[1])); Rw = R.crop((R.size[0] - SW, 0, R.size[0], R.size[1]))
at = Image.new("RGBA", (SW * 2 + mid.size[0], L.size[1]))
at.alpha_composite(Lw, (0, 0)); at.alpha_composite(mid, (SW, 0)); at.alpha_composite(Rw, (SW + mid.size[0], 0))
save(at, "scroll9.webp")
print("  scroll9：border-image-slice 上 130 左右", SW, "下 110 fill；repeat 寫 round stretch（直的方向拉長軸）")
# 上下拉的捲軸（翊文 11-12：「隊伍規則的卷軸改成上下拉如何」）：同壹張轉 90 度，軸在上下兩頭。
# 內容變長時是紙變長（直的 round），軸只往橫的方向拉（stretch）；手機很窄、內容很長也不會把軸拉得很長。
sv = at.rotate(-90, expand=True)
save(sv, "scrollv9.webp")
print("  scrollv9：border-image-slice 上", SW, "右 130 下", SW, "左 110 fill；repeat 寫 stretch round")
