# 館外地圖的素材：把翊文生的 9 張原圖（.claude/交接/圖/館外地圖/ 或 assets/map/）處理成 web/public/map/ 的零件（11-16）
# 用法（anaconda 的 torch 環境，要 PIL、numpy、scipy）：python tools/assets/map_assets.py [原圖資料夾]
# 做的事：M-1 紙底；M-2 取壹格帳頁；M-4 圖釘（裁掉底下多生的介面列）；M-5 地點圖示（切開、把三個英文字塗掉）；
#         M-6 章（紙色去背，線留暗紅色）；M-7 人物剪影章（裁掉介面列）；M-9 霧（黑底轉透明，用 tools/assets/black_to_alpha.py）。M-3、M-8 這次不用（邊用 CSS、路徑用 SVG 畫）。
import os, subprocess, sys, shutil, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets", "map")
OUT = os.path.join(ROOT, "web", "public", "map")
TMP = tempfile.mkdtemp(prefix="map_")
PY = sys.executable
os.makedirs(OUT, exist_ok=True)
f = lambda n: os.path.join(SRC, n)

def cut(img, names, tag):
    p = os.path.join(TMP, tag + ".png"); img.save(p)
    d = os.path.join(TMP, tag); subprocess.run([PY, os.path.join(ROOT, "tools", "assets", "cut_sheet.py"), p, d] + names, check=True)
    for n in names:
        if n == "-": continue
        im = Image.open(os.path.join(d, n + ".png")); im.save(os.path.join(OUT, n + ".webp"), quality=90, method=6)

# M-1 紙底
Image.open(f("M-1_地圖紙底.webp")).convert("RGB").resize((512, 512)).save(os.path.join(OUT, "paper.webp"), quality=82)
# M-2 帳頁：取壹格（綠線之間）
l = Image.open(f("M-2_帳頁行線.webp")).convert("RGB")
l.crop((340, 100, 414, 186)).save(os.path.join(OUT, "ledger.webp"), quality=85)
# M-4 圖釘：只留上面
pins = Image.open(f("M-4_圖釘.webp")).convert("RGB").crop((0, 0, 1024, 410))
cut(pins, ["pin-lit", "pin-outline", "pin-new"], "pins")
# M-7 人物剪影章
sil = Image.open(f("M-7_人物剪影章.webp")).convert("RGB").crop((0, 0, 1024, 405))
cut(sil, ["who-umbrella", "who-postman", "who-chisel", "who-lantern", "who-hat", "who-abacus", "who-scale", "who-scarf", "who-broom", "who-apron"], "who")
# M-5 地點圖示：先把字塗掉（深色的字換成旁邊的底色）
ic = Image.open(f("M-5_地點圖示.webp")).convert("RGB"); a = np.asarray(ic).copy()
def wipe(x0, y0, x1, y1, thr=140):
    box = a[y0:y1, x0:x1].astype(np.float32); lum = box.mean(axis=2)
    light = box[lum > thr + 40]
    fill = np.median(light, axis=0) if len(light) else np.array([225, 200, 150])
    m = lum < thr
    m = ndimage.binary_dilation(m, iterations=1)
    box[m] = fill; a[y0:y1, x0:x1] = box.astype(np.uint8)
for box in [(111, 448, 156, 473), (666, 412, 752, 431), (886, 298, 925, 312)]: wipe(*box)
names = ["icon-lamp", "icon-umbrella", "icon-shop", "icon-market", "icon-bridge", "icon-gate", "icon-mailbox", "icon-cup", "icon-stop", "icon-school", "icon-signboard", "icon-island", "icon-harbour", "icon-pawn", "icon-blank"]
os.environ["CUT_OPEN"] = "0"  # 燈串是細線，不能做「開運算」
cut(Image.fromarray(a), names, "icons")
os.environ["CUT_OPEN"] = "2"
# M-6 章：紙色去背，線留暗紅色
st = np.asarray(Image.open(f("M-6_章.webp")).convert("RGB")).astype(np.float32)
lum = st.mean(axis=2); alpha = np.clip((222 - lum) / 90.0, 0, 1)
rgb = np.zeros_like(st); rgb[...] = (122, 58, 52)
mask = ndimage.binary_dilation(alpha > 0.35, iterations=16)
lab, n = ndimage.label(mask); boxes = ndimage.find_objects(lab)
parts = [(s[0].start, s[1].start, s[0].stop, s[1].stop, i + 1) for i, s in enumerate(boxes) if s and (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 4000]
parts.sort(key=lambda p: (round((p[0] + p[2]) / 2 / 150), p[1]))
snames = ["stamp-ring1", "stamp-ring2", "stamp-ring3", "stamp-square", "stamp-initials", "stamp-header"]
if len(parts) != len(snames): print("章切出", len(parts), "塊，要 6 塊", parts); sys.exit(1)
rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
for nm, (y0, x0, y1, x1, k) in zip(snames, parts):
    own = (lab == k)[y0 - 6:y1 + 6, x0 - 6:x1 + 6]
    p = rgba[y0 - 6:y1 + 6, x0 - 6:x1 + 6].copy(); p[..., 3] = (p[..., 3] * own).astype(np.uint8)
    Image.fromarray(p).save(os.path.join(OUT, nm + ".webp"), quality=90, method=6)
# M-9 霧
subprocess.run([PY, os.path.join(ROOT, "tools", "assets", "black_to_alpha.py"), f("M-9_邊緣霧.webp"), os.path.join(OUT, "fog.webp"), "--crop", "0,130,1024,440", "--resize", "800", "--gamma", "1.2"], check=True)
shutil.rmtree(TMP, ignore_errors=True)
print("好了：", sorted(os.listdir(OUT)))
