#!/usr/bin/env python3
"""從角色設定圖裁出地圖上走路用的 3/4 側身圖（去白底）。

用法：
    python3 tools/crop_sprites.py <設定圖資料夾>

資料夾內需要：
    2.jpg  Allan 轉身設定圖（七個角度）
    4.jpg  阿拉蕾角色設定圖
輸出到 assets/img/：allan-walk-r.webp、allan-walk-l.webp、arale-walk-l.webp
表情與全身圖沿用拱豬夜市（Gong_Zhu）專案從同一批設定圖裁好的檔案。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'img'

# (來源檔, 裁切框, 輸出檔)
JOBS = [
    ('2.jpg', (1660, 320, 2000, 1360), 'allan-walk-r.webp'),
    ('2.jpg', (380, 320, 700, 1360), 'allan-walk-l.webp'),
    ('4.jpg', (470, 150, 720, 742), 'arale-walk-l.webp'),
]
HEIGHT = 300


def flood(seed, allowed):
    """8 連通的區域成長（用 numpy 位移代替逐點 BFS）"""
    reach = seed & allowed
    while True:
        grow = reach.copy()
        grow[1:, :] |= reach[:-1, :]
        grow[:-1, :] |= reach[1:, :]
        grow[:, 1:] |= reach[:, :-1]
        grow[:, :-1] |= reach[:, 1:]
        grow[1:, 1:] |= reach[:-1, :-1]
        grow[:-1, :-1] |= reach[1:, 1:]
        grow[1:, :-1] |= reach[:-1, 1:]
        grow[:-1, 1:] |= reach[1:, :-1]
        grow &= allowed
        if (grow == reach).all():
            return reach
        reach = grow


def cutout(img):
    a = np.asarray(img.convert('RGB')).astype(int)
    light = (a.min(axis=2) > 222) & (a.max(axis=2) - a.min(axis=2) < 28)
    border = np.zeros(light.shape, bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    bg = flood(border, light)
    fg = ~bg
    # 只留中間那個角色（鄰居的邊角會被切掉）
    h, w = fg.shape
    seed = np.zeros(fg.shape, bool)
    seed[h // 2 - 20:h // 2 + 20, w // 2 - 20:w // 2 + 20] = True
    body = flood(seed & fg, fg)
    rgba = np.dstack([a, np.where(body, 255, 0)]).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    return out.crop(out.getbbox())


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, box, dest in JOBS:
        im = cutout(Image.open(src / name).crop(box))
        im = im.resize((round(im.width * HEIGHT / im.height), HEIGHT), Image.LANCZOS)
        im.save(OUT / dest, 'WEBP', quality=88, method=6)
        print('✓', dest, im.size)


if __name__ == '__main__':
    main()
