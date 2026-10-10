"""小遊戲美術後製：把 ChatGPT 出的原圖裁切、縮圖、轉 webp，放到遊戲讀取的位置。

用法（在專案根目錄）：
    python tools/process_art.py              # 處理 output/imagegen/arcade/ 裡有的原圖
    python tools/process_art.py --src X --dst Y   # 測試用：指定來源與輸出根目錄

原圖檔名（.png / .jpg / .webp 皆可），缺的會略過，所以可以一張一張補：
    icon-sudoku / icon-minesweeper / icon-bulls-cows / icon-solitaire / icon-rpg / icon-tower-orbs
    solitaire-back / solitaire-felt
    minesweeper-flag / minesweeper-mine

規格與 prompt 見 美術需求_ChatGPT出圖.md。只用 Pillow，不是網站的一部分（網站本身仍然零依賴）。
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
EXTS = ('.png', '.jpg', '.jpeg', '.webp')


def center_crop(im, ratio):
    """從中央裁成 寬/高 = ratio。"""
    w, h = im.size
    if w / h > ratio:
        nw = round(h * ratio)
        return im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = round(w / ratio)
    return im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))


def icon(im, size):
    """首頁卡片圖示：正方形滿版（卡片框本身有圓角，圖不用自帶圓角）。"""
    return center_crop(im.convert('RGB'), 1).resize((size, size), Image.LANCZOS)


def card_back(im, w, h):
    """牌背：裁成 5:7。"""
    return center_crop(im.convert('RGB'), w / h).resize((w, h), Image.LANCZOS)


def seamless_tile(im, size):
    """桌布：生成模型給的「無縫」常常有接縫，這裡自己做成可無縫鋪滿。

    1. 拉平大範圍明暗（原圖常常上亮下暗，鋪滿後會變成一格一格的橫紋）：原圖 − 大半徑模糊 + 平均色
    2. 位移交叉淡化：把圖位移半張，四邊就變成原圖內部、一定接得起來，但接縫跑到中央十字；
       再用「中央實、邊緣虛」的遮罩把原圖蓋回中央，接縫就消失了。
    （不用鏡像拼接：鏡像會產生萬花筒般的十字對稱紋，比接縫還明顯）
    """
    im = center_crop(im.convert('RGB'), 1)
    w, h = im.size
    blur = im.filter(ImageFilter.GaussianBlur(w / 8))
    mean = Image.new('RGB', im.size, tuple(round(v) for v in ImageStat.Stat(im).mean))
    flat = ImageChops.add(ImageChops.subtract(im, blur, offset=128), mean, offset=-128)

    shifted = ImageChops.offset(flat, w // 2, h // 2)
    band = w * 0.25  # 邊緣 1/4 是淡化區
    ramp = [min(255, round(255 * min(x, w - 1 - x) / band)) for x in range(w)]
    mx = Image.new('L', (w, 1)); mx.putdata(ramp); mx = mx.resize((w, h))
    my = mx.transpose(Image.Transpose.ROTATE_90)
    mask = ImageChops.darker(mx, my)  # 離任一邊越近越透明
    return Image.composite(flat, shifted, mask).resize((size, size), Image.LANCZOS)


def sprite(im, size):
    """去背小圖示：裁掉透明邊、置中補成正方形（四周留 6% 呼吸空間）。"""
    im = im.convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox is None:
        raise ValueError('整張都是透明的')
    if bbox == (0, 0, *im.size):
        print('    [注意] 沒有透明背景：請在 ChatGPT 要求「透明背景 PNG」重出，否則格子上會是一塊色塊')
    im = im.crop(bbox)
    side = round(max(im.size) * 1.12)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


# 原圖名 → (輸出路徑, 處理函式)
JOBS = {
    **{f'icon-{g}': (f'icons/{g}.webp', lambda im: icon(im, 256))
       for g in ['sudoku', 'minesweeper', 'bulls-cows', 'solitaire', 'rpg', 'tower-orbs']},
    'solitaire-back': ('solitaire/back.webp', lambda im: card_back(im, 300, 420)),
    'solitaire-felt': ('solitaire/felt.webp', lambda im: seamless_tile(im, 512)),
    'minesweeper-flag': ('minesweeper/flag.webp', lambda im: sprite(im, 96)),
    'minesweeper-mine': ('minesweeper/mine.webp', lambda im: sprite(im, 96)),
}


def find_src(src_dir, name):
    for ext in EXTS:
        p = src_dir / (name + ext)
        if p.exists():
            return p
    return None


def main():
    # Windows 主控台多半是 cp950，印不出的字元用 ? 代替，不要整支當掉
    sys.stdout.reconfigure(errors='replace')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', type=Path, default=ROOT / 'output' / 'imagegen' / 'arcade')
    ap.add_argument('--dst', type=Path, default=ROOT)
    args = ap.parse_args()

    done, missing = [], []
    for name, (out, fn) in JOBS.items():
        src = find_src(args.src, name)
        if not src:
            missing.append(name)
            continue
        print(f'  {src.name} -> {out}')
        try:
            result = fn(Image.open(src))
        except Exception as e:  # 單張失敗不影響其他張
            print(f'    [失敗] {e}')
            continue
        dst = args.dst / out
        dst.parent.mkdir(parents=True, exist_ok=True)
        result.save(dst, 'WEBP', quality=88, method=6)
        print(f'    [OK] {result.size[0]}x{result.size[1]}，{dst.stat().st_size // 1024} KB')
        done.append(out)

    print(f'\n完成 {len(done)} 張。', end='')
    if missing:
        print(f'尚未提供（{args.src}）：{", ".join(missing)}')
    else:
        print('全部到齊。')
    if done:
        print('記得把根目錄 sw.js 的 CACHE 版本 +1，已安裝 App 的人才會拿到新圖。')


if __name__ == '__main__':
    main()
