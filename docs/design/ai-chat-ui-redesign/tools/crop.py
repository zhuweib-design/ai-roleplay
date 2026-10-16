"""crop.py —— 把无头截图裁切到 1920x1080 基准画布"""
import sys
from pathlib import Path
from PIL import Image

BASE_W, BASE_H = 1920, 1080
src_dir = Path(sys.argv[1])
for src in sorted(src_dir.glob('_raw-*.png')):
    dst = src_dir / src.name.replace('_raw-', '')
    with Image.open(src) as im:
        w, h = im.size
        if w < BASE_W or h < BASE_H:
            print('SKIP (too small): ' + src.name + ' ' + str(im.size))
            continue
        im.crop((0, 0, BASE_W, BASE_H)).save(dst)
        print('OK ' + dst.name + '  ' + str((BASE_W, BASE_H)))
