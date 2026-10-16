"""zoom.py —— 裁切并放大局部区域，用于细节验证"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1]); dst = Path(sys.argv[2])
box = tuple(int(x) for x in sys.argv[3].split(','))
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
with Image.open(src) as im:
    crop = im.crop(box)
    w, h = crop.size
    crop.resize((int(w * scale), int(h * scale)), Image.LANCZOS).save(dst)
    print('OK ' + dst.name + ' ' + str((int(w * scale), int(h * scale))))
