"""小遊戲美術後製：把 ChatGPT 出的原圖裁切、縮圖、轉 webp，放到遊戲讀取的位置。

用法（在專案根目錄）：
    python tools/process_art.py              # 處理 output/imagegen/arcade/ 裡有的原圖
    python tools/process_art.py --src X --dst Y   # 測試用：指定來源與輸出根目錄

原圖檔名（.png / .jpg / .webp 皆可），缺的會略過，所以可以一張一張補：
    icon-sudoku / icon-minesweeper / icon-bulls-cows / icon-solitaire / icon-rpg / icon-tower-orbs / icon-drift-ark / icon-tetris / icon-pokemo / icon-outpost / icon-neon-danmaku / icon-sky-frontier / icon-shrine
    cover-<遊戲>（首頁彩色封面，13 款；大作 900×600、小品 600×600，清單見下方 COVER_SIZE；輸出 covers/<遊戲>.webp）
    solitaire-back / solitaire-felt
    minesweeper-flag / minesweeper-mine
    relic-<id> / trait-<id> / boss-<id> / event-<id> / node-<id> / unlock-<id>（轉珠之塔地城，id 見下方 RG_ART）
    sf-<id>（天穹拓荒的方塊、怪物、人物、背景，id 見下方 SF_ART）

聖林神廟（shrine）另有一組，原圖放 output/imagegen/shrine/（--shrine-src 可改），輸出到 shrine/art/ 並產生 index.json：
    m-<id>（怪物，2x2 四格）／n-<id>（NPC，單張正面）／sheet-props、sheet-items、sheet-equip（各 4x4 共 16 格）
    以及 p-／i-／e-<id> 單張補圖（優先於圖表切出來的）。id 與格位順序見下方 SH_*，細節見 美術需求_ChatGPT出圖.md 第 16 節
    hero（英雄，4 欄 × 3 列 12 格 → 取代 shrine/art/hero.webp）、boss-forest／fire／water／temple（首領 → boss_*.webp），
    這兩類是固定檔名，不列入 index.json

規格與 prompt 見 美術需求_ChatGPT出圖.md。只用 Pillow，不是網站的一部分（網站本身仍然零依賴）。
"""
import argparse
import json
import sys
import re
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

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

# 首頁封面：(寬, 高) → 遊戲清單。大作＝橫幅 3:2（900×600），小品＝方形 1:1（600×600）。
# 要跟根 index.html 兩個區塊的卡片一致；rpg-next 與 rpg 共用 covers/rpg.webp，不另出圖
COVER_DIR = 'covers'
COVER_QUALITY = 82
COVER_SIZE = {
    (900, 600): ['pokemo', 'shrine', 'rpg', 'tower-orbs', 'drift-ark', 'outpost', 'sky-frontier', 'border-lord', 'xiuxian'],   # 深掘礦工已併入天穹拓荒
    (600, 600): ['sudoku', 'minesweeper', 'bulls-cows', 'solitaire', 'tetris', 'neon-danmaku', 'blizzard-cabin'],
}


def cover(im, size):
    """首頁封面：從原圖中央裁成目標比例再縮到 size（寬, 高）。"""
    w, h = size
    return center_crop(im.convert('RGB'), w / h).resize(size, Image.LANCZOS)


# 原圖名 → (輸出路徑, 處理函式)
JOBS = {
    **{f'icon-{g}': (f'icons/{g}.webp', lambda im: icon(im, 256))
       for g in ['sudoku', 'minesweeper', 'bulls-cows', 'solitaire', 'rpg', 'tower-orbs', 'drift-ark', 'tetris', 'pokemo', 'outpost', 'neon-danmaku', 'sky-frontier', 'shrine']},
    # 首頁彩色封面：原圖 cover-<遊戲>，輸出 covers/<遊戲>.webp（品質 82）。尺寸依 COVER_SIZE 分大作／小品
    **{f'cover-{g}': (f'{COVER_DIR}/{g}.webp', (lambda s: lambda im: cover(im, s))(size))
       for size, games in COVER_SIZE.items() for g in games},
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


# ================= 聖林神廟（shrine）=================
# id 要跟 shrine/index.html 的 ICON_OF／P_ART、game.js 的 MON_ART、maps.js 的 npc id 一致
SH_DIR = 'shrine/art'
SH_MON = ['slime', 'slime-water', 'slime-mush', 'slime-ember', 'knight', 'goblin', 'archer']
SH_NPC = ['chief', 'smith', 'merchant', 'traveler', 'trainer', 'villager']
# 圖表：原圖名 → 由左到右、由上到下 16 格的 id
SH_SHEETS = {
    'sheet-props': ['p-chest', 'p-chest-open', 'p-pot', 'p-pot-broken', 'p-brazier', 'p-brazier-lit', 'p-block', 'p-plate',
                    'p-altar', 'p-pillar', 'p-pillar-broken', 'p-campfire', 'p-board', 'p-hook', 'p-stake', 'p-gate'],
    'sheet-items': ['i-coin', 'i-heart', 'i-key', 'i-bomb', 'i-boomerang', 'i-lantern', 'i-hookshot', 'i-piece',
                    'i-relic-forest', 'i-relic-fire', 'i-relic-water', 'i-shard', 'i-ore', 'i-core-forest', 'i-core-fire', 'i-core-water'],
    'sheet-equip': ['e-wood_sword', 'e-iron_sword', 'e-flame_sword', 'e-star_sword', 'e-wood_shield', 'e-iron_shield', 'e-prism_shield', 'e-cloth',
                    'e-scale_mail', 'e-ember_mail', 'e-wind_boots', 'e-lucky_ring', 'e-sword_crest', 'i-potion', 'i-arrow', 'i-heart-full'],
}
SH_ITEM_EDGE = {'p': 192, 'e': 192, 'i': 128}   # 小物件長邊縮到幾 px（依 id 前綴）
# 首領原圖 boss-<key> → 成品檔名（temple 對應 boss_time，檔名沿用現行）
SH_BOSS = {'forest': 'boss_forest', 'fire': 'boss_fire', 'water': 'boss_water', 'temple': 'boss_time'}
HERO_CELL = (204, 154)    # 英雄圖集每格大小；成品 4 欄 × 4 列＝816×616，格式要跟 shrine/index.html 的 HERO_CW／HERO_CH 一致
HERO_BODY = 150           # 站立格的人高（px），要跟 shrine/index.html 的 HERO_BODY 一致
BOSS_SIDE = 384           # 首領成品是正方形
SH_ID_RE = re.compile(r'^[mnpie]-')               # index.json 只收這幾類，art/ 裡原本的 hero、mon 等不列


def remove_bg(im, tol=40):
    """去背。已有透明就原樣用；整張不透明且四角顏色幾乎一致時，從邊緣做容差洪水填充去背，
    再內縮 1px 去掉邊緣色邊。回傳 RGBA。"""
    im = im.convert('RGBA')
    a = im.getchannel('A')
    w, h = im.size
    if sum(1 for v in a.resize((64, 64)).getdata() if v < 250) > 40:
        return im  # 本來就有透明背景
    rgb = im.convert('RGB')
    k = max(2, min(w, h) // 100)
    corners = [rgb.crop(b).resize((1, 1), Image.BOX).getpixel((0, 0))
               for b in ((0, 0, k, k), (w - k, 0, w, k), (0, h - k, k, h), (w - k, h - k, w, h))]
    bg = tuple(round(sum(c[i] for c in corners) / 4) for i in range(3))
    if max(abs(c[i] - bg[i]) for c in corners for i in range(3)) > 24:
        print('    [注意] 沒有透明背景、四角顏色也不一致：無法自動去背，請重出透明背景 PNG')
        return im
    # 與底色差距小的像素＝背景候選（0），其餘＝前景（255）；再只留下「接到邊緣」的背景候選
    r, g, b = ImageChops.difference(rgb, Image.new('RGB', im.size, bg)).split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 0 if v <= tol else 255)
    seeds = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for xy in seeds:
        if mask.getpixel(xy) == 0:
            ImageDraw.floodfill(mask, xy, 128)
    alpha = mask.point(lambda v: 0 if v == 128 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(3))   # 內縮 1px：去掉半透明邊上沾到的底色
    out = im.copy()
    out.putalpha(alpha)
    return out


def alpha_bbox(im, thr=16):
    return im.getchannel('A').point(lambda v: 255 if v > thr else 0).getbbox()


def fit_long_edge(im, edge, margin=2):
    """裁到不透明範圍、四邊留 margin px，長邊縮到 edge。"""
    bb = alpha_bbox(im)
    if bb is None:
        raise ValueError('整張都是透明的')
    im = im.crop(bb)
    k = edge / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (im.width + margin * 2, im.height + margin * 2), (0, 0, 0, 0))
    out.paste(im, (margin, margin))
    return out


def shrine_monster(im):
    """怪物：2×2 四格（待機、移動、攻擊、受傷）→ 四格同一縮放比例、腳底對齊格底、水平置中，
    放進 256×256 的格，輸出 512×512。"""
    im = remove_bg(im)
    w, h = im.size
    cells = []
    for r in range(2):
        for c in range(2):
            cell = im.crop((c * w // 2, r * h // 2, (c + 1) * w // 2, (r + 1) * h // 2))
            bb = alpha_bbox(cell)
            if bb is None:
                raise ValueError(f'第 {r * 2 + c + 1} 格是空的')
            cells.append(cell.crop(bb))
    k = min(240 / max(c.width for c in cells), 240 / max(c.height for c in cells))
    out = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        cw, ch = max(1, round(cell.width * k)), max(1, round(cell.height * k))
        cell = cell.resize((cw, ch), Image.LANCZOS)
        out.paste(cell, ((i % 2) * 256 + (256 - cw) // 2, (i // 2) * 256 + 256 - 4 - ch), cell)
    return out


def shrine_npc(im):
    """NPC：取不透明範圍、縮到高 256（腳底就是圖底）。"""
    im = remove_bg(im)
    bb = alpha_bbox(im)
    if bb is None:
        raise ValueError('整張都是透明的')
    im = im.crop(bb)
    return im.resize((max(1, round(im.width * 256 / im.height)), 256), Image.LANCZOS)


def components(alpha, step=4, merge=2, min_cells=6):
    """不透明連通塊：先縮成 1/step 的粗格（區塊內有任何不透明就算），膨脹 merge 格讓彼此很近的碎塊連在一起，
    再用 BFS 標號。回傳 [bbox]（原圖像素座標）；太小的雜點（少於 min_cells 粗格）丟掉。"""
    w, h = alpha.size
    gw, gh = -(-w // step), -(-h // step)
    mask = alpha.point(lambda v: 255 if v > 16 else 0).resize((gw, gh), Image.BOX).point(lambda v: 255 if v > 0 else 0)
    grown = mask.filter(ImageFilter.MaxFilter(merge * 2 + 1))
    gp, mp = grown.load(), mask.load()
    seen = [[False] * gw for _ in range(gh)]
    found = []
    for sy in range(gh):
        for sx in range(gw):
            if gp[sx, sy] == 0 or seen[sy][sx]:
                continue
            q = deque([(sx, sy)])
            seen[sy][sx] = True
            n = 0
            x0, y0, x1, y1 = gw, gh, 0, 0
            while q:
                x, y = q.popleft()
                if mp[x, y]:  # 只統計真正有東西的粗格，膨脹出來的不算
                    n += 1
                    x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < gw and 0 <= ny < gh and gp[nx, ny] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if n >= min_cells:
                found.append((x0 * step, y0 * step, min(w, (x1 + 1) * step), min(h, (y1 + 1) * step)))
    return found


def best_cuts(alpha, bb, axis, n=4, size=None, search=0.12):
    """一個橫跨多格的連通塊：沿 4 等分格線找切線。每條格線附近（±search 格）挑不透明像素最少的那一欄／列當切線，
    這樣格線有一點偏也切得開。回傳 bb 範圍內的切線座標（含兩端）。"""
    lo, hi = (bb[0], bb[2]) if axis == 0 else (bb[1], bb[3])
    step = size / n
    cuts = [lo]
    thr = alpha.point(lambda v: 255 if v > 16 else 0)
    for k in range(1, n):
        g = round(k * step)
        if not (lo + 8 < g < hi - 8):
            continue
        best, bv = g, None
        for t in range(max(lo + 4, g - int(step * search)), min(hi - 4, g + int(step * search)) + 1):
            box = (t, bb[1], t + 1, bb[3]) if axis == 0 else (bb[0], t, bb[2], t + 1)
            v = thr.crop(box).histogram()[255]
            if bv is None or v < bv:
                best, bv = t, v
        cuts.append(best)
    cuts.append(hi)
    return cuts


def slice_grid(im, cols, rows, label):
    """圖表 -> {(列, 欄): RGBA 圖（未縮放）}。格線不準也沒關係：依各物件中心落在哪一格來指派，
    同一格有多塊就合併；黏在一起、明顯比一格大的連通塊，沿格線附近最空的切線切開再各自取範圍。
    沒東西的格不會出現在結果裡（由呼叫端決定要不要警告）。"""
    im = remove_bg(im)
    w, h = im.size
    alpha = im.getchannel('A')
    cw, ch = w / cols, h / rows
    cellmap = {}

    def put(bb):
        key = (min(rows - 1, max(0, int((bb[1] + bb[3]) / 2 / ch))), min(cols - 1, max(0, int((bb[0] + bb[2]) / 2 / cw))))
        cellmap.setdefault(key, []).append(bb)

    for bb in components(alpha):
        if (bb[2] - bb[0]) > cw * 1.3 or (bb[3] - bb[1]) > ch * 1.3:
            print(f'    [注意] {label}：有物件黏在一起（{bb}），沿格線切開')
            xs = best_cuts(alpha, bb, 0, n=cols, size=w) if (bb[2] - bb[0]) > cw * 1.3 else [bb[0], bb[2]]
            ys = best_cuts(alpha, bb, 1, n=rows, size=h) if (bb[3] - bb[1]) > ch * 1.3 else [bb[1], bb[3]]
            for j in range(len(ys) - 1):
                for i in range(len(xs) - 1):
                    sub = alpha.crop((xs[i], ys[j], xs[i + 1], ys[j + 1]))
                    sb = sub.point(lambda v: 255 if v > 16 else 0).getbbox()
                    if sb:
                        put((xs[i] + sb[0], ys[j] + sb[1], xs[i] + sb[2], ys[j] + sb[3]))
        else:
            put(bb)
    out = {}
    for key, bbs in cellmap.items():
        bb = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
        out[key] = im.crop(bb)
    return out


def slice_sheet(im, ids, label):
    """4x4 圖表 -> {id: RGBA 圖（未縮放）}；某格沒東西會印警告並略過。"""
    cells = slice_grid(im, 4, 4, label)
    out = {}
    for i, oid in enumerate(ids):
        c = cells.get((i // 4, i % 4))
        if c is None:
            print(f'    [警告] {label} 第 {i // 4 + 1} 列第 {i % 4 + 1} 欄（{oid}）找不到物件，略過')
            continue
        out[oid] = c
    return out


def shrine_hero(im):
    """英雄：原圖 4 欄（站立、走路A、走路B、攻擊）× 3 列（正面、側面朝右、背面）共 12 格，
    轉成遊戲讀的 4 欄 × 4 列圖集（每格 204×154，共 816×616）：列＝下（正面）、左（側面鏡射）、右（側面）、上（背面）。
    12 格用同一個縮放比例（正面站立格人高＝HERO_BODY），腳底貼齊格底、水平置中；
    某格（攻擊格伸出武器）比格子寬或高時，只把那一格等比縮到塞得下，不裁切。"""
    cells = slice_grid(im, 4, 3, 'hero')
    missing = [f'第{r + 1}列第{c + 1}欄' for r in range(3) for c in range(4) if (r, c) not in cells]
    if missing:
        raise ValueError('找不到物件：' + '、'.join(missing))
    k = HERO_BODY / cells[(0, 0)].height   # 以正面站立格為準（人高＝HERO_BODY），其餘 11 格同一比例
    cw, ch = HERO_CELL
    out = Image.new('RGBA', (cw * 4, ch * 4), (0, 0, 0, 0))
    # 原圖列 → 成品列；側面（原圖第 2 列）同時產生右（2）與鏡射的左（1）
    for sr, dsts in ((0, [(0, False)]), (1, [(2, False), (1, True)]), (2, [(3, False)])):
        for c in range(4):
            cell = cells[(sr, c)]
            kk = min(k, (cw - 2) / (cell.width * 1.0), (ch - 1) / (cell.height * 1.0))   # 超出才縮：只縮該格
            sp = cell.resize((max(1, round(cell.width * kk)), max(1, round(cell.height * kk))), Image.LANCZOS)
            slot = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            slot.paste(sp, ((cw - sp.width) // 2, ch - 1 - sp.height))
            for dr, mirror in dsts:
                out.paste(slot.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if mirror else slot, (c * cw, dr * ch))
    return out


def shrine_boss(im):
    """首領：取不透明範圍，等比縮到塞滿 384×384（留 4px 邊）、底部貼齊、水平置中。
    遊戲用 drawImage(im, -w/2, -h, w, h) 畫（寬高皆為 size），所以成品必須是正方形。"""
    im = remove_bg(im)
    bb = alpha_bbox(im)
    if bb is None:
        raise ValueError('整張都是透明的')
    im = im.crop(bb)
    k = (BOSS_SIDE - 8) / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (BOSS_SIDE, BOSS_SIDE), (0, 0, 0, 0))
    out.paste(im, ((BOSS_SIDE - im.width) // 2, BOSS_SIDE - 4 - im.height))
    return out


def process_shrine(src_dir, dst_root):
    """處理 shrine 原圖，回傳成功輸出的檔名清單。"""
    if not src_dir.is_dir():
        return []
    out_dir = dst_root / SH_DIR
    done = []

    def emit(oid, result):
        out_dir.mkdir(parents=True, exist_ok=True)
        dst = out_dir / f'{oid}.webp'
        result.save(dst, 'WEBP', quality=88, method=6)
        print(f'    [OK] {oid}.webp  {result.size[0]}x{result.size[1]}，{dst.stat().st_size // 1024} KB')
        done.append(dst.name)

    def safe(name, fn):
        try:
            fn()
        except Exception as e:  # 單張失敗不影響其他張
            print(f'    [失敗] {name}：{e}')

    singles = {}  # id → 單張原圖路徑（優先於圖表）
    for oid in [i for ids in SH_SHEETS.values() for i in ids]:
        p = find_src(src_dir, oid)
        if p:
            singles[oid] = p

    for mid in SH_MON:
        p = find_src(src_dir, f'm-{mid}')
        if p:
            print(f'  {p.name} -> {SH_DIR}/m-{mid}.webp')
            safe(p.name, lambda: emit(f'm-{mid}', shrine_monster(Image.open(p))))
    for nid in SH_NPC:
        p = find_src(src_dir, f'n-{nid}')
        if p:
            print(f'  {p.name} -> {SH_DIR}/n-{nid}.webp')
            safe(p.name, lambda: emit(f'n-{nid}', shrine_npc(Image.open(p))))

    p = find_src(src_dir, 'hero')   # 沒有 hero 原圖就不動現有的 hero.webp
    if p:
        print(f'  {p.name} -> {SH_DIR}/hero.webp（12 格 → 4x4 圖集）')
        safe(p.name, lambda: emit('hero', shrine_hero(Image.open(p))))
    for key, oid in SH_BOSS.items():
        p = find_src(src_dir, f'boss-{key}')
        if p:
            print(f'  {p.name} -> {SH_DIR}/{oid}.webp')
            safe(p.name, lambda: emit(oid, shrine_boss(Image.open(p))))

    for sheet, ids in SH_SHEETS.items():
        p = find_src(src_dir, sheet)
        if not p:
            continue
        print(f'  {p.name} -> {len(ids)} 格')

        def run(p=p, ids=ids, sheet=sheet):
            for oid, im in slice_sheet(Image.open(p), ids, sheet).items():
                if oid in singles:
                    print(f'    {oid}：有單張原圖，略過圖表裡的')
                    continue
                emit(oid, fit_long_edge(im, SH_ITEM_EDGE[oid[0]]))
        safe(p.name, run)
    for oid, p in singles.items():
        print(f'  {p.name} -> {SH_DIR}/{oid}.webp（單張）')
        safe(p.name, lambda: emit(oid, fit_long_edge(remove_bg(Image.open(p)), SH_ITEM_EDGE[oid[0]])))
    return done


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
    ap.add_argument('--shrine-src', type=Path, default=ROOT / 'output' / 'imagegen' / 'shrine', help='聖林神廟原圖資料夾')
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
        result.save(dst, 'WEBP', quality=COVER_QUALITY if out.startswith(COVER_DIR + '/') else 88, method=6)
        print(f'    [OK] {result.size[0]}x{result.size[1]}，{dst.stat().st_size // 1024} KB')
        done.append(out)

    done += process_shrine(args.shrine_src, args.dst)

    # 遊戲會先讀這份清單，只對清單裡有的圖發請求（沒有的維持 emoji 或程式繪製）
    for manifest in (RG_DIR, SF_DIR):
        folder = args.dst / manifest
        if folder.is_dir():
            names = sorted(f.stem for f in folder.glob('*.webp'))
            (folder / 'index.json').write_text(json.dumps(names), encoding='utf-8')

    # 聖林神廟：清單只收 m-／n-／p-／i-／e- 開頭的成品（art/ 裡原本的 hero、mon 等不列）
    sh = args.dst / SH_DIR
    if sh.is_dir():
        names = sorted(f.stem for f in sh.glob('*.webp') if SH_ID_RE.match(f.stem))
        if names or (sh / 'index.json').exists():
            (sh / 'index.json').write_text(json.dumps(names), encoding='utf-8')

    print(f'\n完成 {len(done)} 張。', end='')
    if missing:
        print(f'尚未提供（{args.src}）：{", ".join(missing)}')
    else:
        print('全部到齊。')
    if done:
        print('記得把根目錄 sw.js 的 CACHE 版本 +1（轉珠之塔的圖則是 tower-orbs/sw.js），已安裝 App 的人才會拿到新圖。')


if __name__ == '__main__':
    main()
