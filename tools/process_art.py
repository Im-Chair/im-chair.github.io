"""小遊戲美術後製：把 ChatGPT 出的原圖裁切、縮圖、轉 webp，放到遊戲讀取的位置。

用法（在專案根目錄）：
    python tools/process_art.py              # 處理 output/imagegen/arcade/ 裡有的原圖
    python tools/process_art.py --src X --dst Y   # 測試用：指定來源與輸出根目錄

原圖檔名（.png / .jpg / .webp 皆可），缺的會略過，所以可以一張一張補：
    icon-sudoku / icon-minesweeper / icon-bulls-cows / icon-solitaire / icon-rpg / icon-tower-orbs / icon-drift-ark / icon-tetris / icon-pokemo / icon-outpost / icon-deep-miner / icon-neon-danmaku / icon-sky-frontier
    solitaire-back / solitaire-felt
    minesweeper-flag / minesweeper-mine
    relic-<id> / trait-<id> / boss-<id> / event-<id> / node-<id> / unlock-<id>（轉珠之塔地城，id 見下方 RG_ART）
    sf-<id>（天穹拓荒的方塊、怪物、人物、背景，id 見下方 SF_ART）

規格與 prompt 見 美術需求_ChatGPT出圖.md。只用 Pillow，不是網站的一部分（網站本身仍然零依賴）。
"""
import argparse
import json
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


def trimmed(im):
    """裁掉透明邊；沒有透明背景時提醒重出。"""
    im = im.convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox is None:
        raise ValueError('整張都是透明的')
    if bbox == (0, 0, *im.size):
        print('    [注意] 沒有透明背景：請在 ChatGPT 要求「透明背景 PNG」重出，否則遊戲裡會是一塊色塊')
    return im.crop(bbox)


def cell_fill(im, size):
    """貼滿一格（門、機器、原木這類要填滿方塊的物件）。"""
    return trimmed(im).resize((size, size), Image.LANCZOS)


def cell_floor(im, size):
    """等比縮進一格、貼齊底部（箱子、火把這類放在地上的物件）。"""
    im = trimmed(im)
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, size - im.height))
    return canvas


def figure(im, height):
    """人物與怪物：裁掉透明邊、保持比例，遊戲依碰撞框決定實際大小。"""
    im = trimmed(im)
    return im.resize((max(1, round(im.width * height / im.height)), height), Image.LANCZOS)


def h_seam(im, ratio, width):
    """左右可無縫相接、保留透明：位移半張後，把原圖蓋回中央，接縫藏在淡化區裡。"""
    im = center_crop(im.convert('RGBA'), ratio)
    w, h = im.size
    band = w * 0.14
    ramp = [min(255, round(255 * min(x, w - 1 - x) / band)) for x in range(w)]
    mask = Image.new('L', (w, 1))
    mask.putdata(ramp)
    out = Image.composite(im, ImageChops.offset(im, w // 2, 0), mask.resize((w, h)))
    return out.resize((width, round(width / ratio)), Image.LANCZOS)


# 天穹拓荒：處理方式 → 原圖 id 清單（去掉 sf- 就是輸出檔名）。tile-<key> 要跟 sky-frontier/index.html 的 TILE_DEFS 一致。
SF_DIR = 'sky-frontier/art'
SF_ART = {
    (lambda im: seamless_tile(im, 256)): [f'tile-{k}' for k in ('dirt', 'sand', 'stone', 'cobble', 'deep', 'seal', 'bedrock', 'plank', 'brick', 'cloud', 'ruin', 'lava')]
        + ['cave-dirt', 'cave-stone', 'cave-deep', 'wall_wood', 'wall_stone', 'wall_brick'],
    (lambda im: h_seam(im, 1, 64)): ['tile-moss', 'tile-frost'],
    (lambda im: cell_fill(im, 64)): [f'tile-{k}' for k in ('o_coal', 'o_iron', 'o_gold', 'o_crystal', 'o_blue', 'o_aether', 'o_star', 'log', 'leaves', 'glass', 'ladder', 'door', 'gate', 'gateopen', 'lamp', 'lamp-on', 'drill', 'seller', 'notgate', 'delay', 'clock')],
    (lambda im: cell_floor(im, 64)): [f'tile-{k}' for k in ('dooropen', 'mushroom', 'torch', 'chest', 'bench', 'furnace', 'anvil', 'bed', 'boundary', 'board', 'stele', 'lever', 'lever-on', 'plate', 'sapling', 'crop', 'crop-ripe', 'altar')],
    (lambda im: figure(im, 128)): ['player', 'npc-scrap', 'npc-artisan'] + [f'mob-{k}' for k in ('slug', 'walker', 'bat', 'bomber', 'archer', 'golem', 'flame', 'wraith')],
    (lambda im: figure(im, 256)): [f'mob-{k}' for k in ('warden', 'skylord', 'starfall')] + ['bg-island-1', 'bg-island-2', 'bg-island-3'],
    (lambda im: cell_floor(im, 128)): ['bg-sun', 'bg-moon'],
    (lambda im: center_crop(im.convert('RGBA'), 3 / 2).resize((1536, 1024), Image.LANCZOS)): ['bg-far', 'bg-mid'],  # 遊戲內左右交替翻轉相接
}


# 轉珠之塔地城的圖示：種類 → (輸出邊長, id 清單)。id 要跟 tower-orbs/rogue.js 的 RG_RELIC / RG_TRAIT /
# RG_BOSS / RG_EVENT / RG_NODE / RG_UNLOCK 一致（新增時兩邊都加）。全部輸出到 tower-orbs/rg/<種類>-<id>.webp
RG_DIR = 'tower-orbs/rg'
RG_ART = {
    'relic': (128, ['ember', 'fuel', 'ash', 'wildfire', 'tide', 'coral', 'abyss', 'grail', 'spring', 'halo',
                    'prism', 'harmony', 'rainbow', 'cell', 'coil', 'dynamo',
                    'core', 'greed', 'glass', 'watch', 'rage', 'chain', 'bell']),
    'trait': (64, ['rage', 'twin', 'regen', 'drain', 'shell', 'ward', 'venom', 'curse']),
    'boss': (96, ['seal', 'barrier', 'shift']),
    'event': (256, ['altar', 'gamble', 'wanderer', 'fountain', 'chest']),
    'node': (96, ['battle', 'elite', 'event', 'shop', 'rest', 'boss']),
    'unlock': (96, ['gold', 'relics', 'lead4', 'asc', 'kit']),
}

# 原圖名 → (輸出路徑, 處理函式)
JOBS = {
    **{f'icon-{g}': (f'icons/{g}.webp', lambda im: icon(im, 256))
       for g in ['sudoku', 'minesweeper', 'bulls-cows', 'solitaire', 'rpg', 'tower-orbs', 'drift-ark', 'tetris', 'pokemo', 'outpost', 'deep-miner', 'neon-danmaku', 'sky-frontier']},
    'solitaire-back': ('solitaire/back.webp', lambda im: card_back(im, 300, 420)),
    'solitaire-felt': ('solitaire/felt.webp', lambda im: seamless_tile(im, 512)),
    'minesweeper-flag': ('minesweeper/flag.webp', lambda im: sprite(im, 96)),
    'minesweeper-mine': ('minesweeper/mine.webp', lambda im: sprite(im, 96)),
    **{f'{k}-{i}': (f'{RG_DIR}/{k}-{i}.webp', (lambda n: lambda im: sprite(im, n))(n))
       for k, (n, ids) in RG_ART.items() for i in ids},
    **{f'sf-{i}': (f'{SF_DIR}/{i}.webp', fn) for fn, ids in SF_ART.items() for i in ids},
    # 珠界主畫面按鍵框：遊戲裡拉成 4:1，兩張都存在才會換上
    'pokemo-btn': ('pokemo/art/ui-btn.webp', lambda im: trimmed(im).resize((640, 160), Image.LANCZOS)),
    'pokemo-btn-pri': ('pokemo/art/ui-btn-pri.webp', lambda im: trimmed(im).resize((640, 160), Image.LANCZOS)),
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

    # 遊戲會先讀這份清單，只對清單裡有的圖發請求（沒有的維持 emoji 或程式繪製）
    for manifest in (RG_DIR, SF_DIR):
        folder = args.dst / manifest
        if folder.is_dir():
            names = sorted(f.stem for f in folder.glob('*.webp'))
            (folder / 'index.json').write_text(json.dumps(names), encoding='utf-8')

    print(f'\n完成 {len(done)} 張。', end='')
    if missing:
        print(f'尚未提供（{args.src}）：{", ".join(missing)}')
    else:
        print('全部到齊。')
    if done:
        print('記得把根目錄 sw.js 的 CACHE 版本 +1（轉珠之塔的圖則是 tower-orbs/sw.js），已安裝 App 的人才會拿到新圖。')


if __name__ == '__main__':
    main()
