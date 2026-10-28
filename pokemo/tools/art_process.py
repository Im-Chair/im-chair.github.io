# 把 art_in/ 裡 ChatGPT 出的原圖切好、去背、縮到遊戲尺寸，放進 assets/
# 用法：python3 tools/art_process.py            （處理 art_in/ 裡所有認得的檔名）
# 檔名規則見 docs/ART_PROMPTS.md：cN_tiles / cN_objects / cN_char_<名>（_p＝立繪）/ cN_boss_<屬性>
import os,sys,json,re
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN=os.path.join(ROOT,'art_in');A=os.path.join(ROOT,'assets')
TILE=128            # 地磚每格輸出大小
OBJ_H=360           # 物件輸出高度上限
CHAR_H=202          # 站姿每格高度
PORT_H=240          # 立繪高度
BG_SIZE=(1024,683)  # 戰鬥背景輸出尺寸
BOSS_CELL=288       # bosses.webp 每格大小（4 欄×2 列）
BOSS_SLOT={'boss_water':(0,0),'boss_fire':(1,0),'boss_wood':(2,0),'boss_light':(3,0),'boss_dark':(0,1)}   # 先沿用現有 5 格；之後的首領會擴充
OBJ_KEYS=['tree1','tree2','house','fountain','sign','gate','rock','bush','special']
CH_MAP={'c1':'grass','c2':'coast','c3':'ember'}   # 章節 → 素材後綴

def key(im):   # 洋紅去背（含邊緣溢色處理）
    a=np.array(im.convert('RGB')).astype(np.int32);r,g,b=a[...,0],a[...,1],a[...,2]
    dist=np.sqrt((r-255)**2+g**2+(b-255)**2);alpha=np.clip((dist-80)/90,0,1)
    spill=np.clip(np.minimum(r,b)-g,0,255)
    r2=np.where(alpha<1,r-spill,r);b2=np.where(alpha<1,b-spill,b)
    return Image.fromarray(np.dstack([np.clip(r2,0,255),g,np.clip(b2,0,255),alpha*255]).astype(np.uint8),'RGBA')

def parts(rgba,n,merge=14):   # 找出 n 個主要物體（相近的碎片會合併）
    al=np.array(rgba)[...,3]>40
    lab,k=ndimage.label(ndimage.binary_dilation(al,iterations=merge))
    sizes=ndimage.sum(al,lab,range(1,k+1));ids=np.argsort(sizes)[::-1][:n]+1
    out=[]
    for i in ids:
        ys,xs=np.where((lab==i)&al);out.append((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
    return out

def grid_lines(T,n):   # 自動找格線（ChatGPT 的格子常常不等寬）
    g=np.abs(np.diff(T,axis=0)).sum(2).mean(1);g=ndimage.uniform_filter1d(g,3);H=len(g)+1
    ys=[0]+[int(H*k/n-H/(3*n))+int(np.argmax(g[int(H*k/n-H/(3*n)):int(H*k/n+H/(3*n))])) for k in range(1,n)]+[H]
    return ys

def do_tiles(path,out):
    T=np.array(Image.open(path).convert('RGB')).astype(float)
    ys=grid_lines(T,4);xs=grid_lines(T.transpose(1,0,2),4)
    img=Image.open(path).convert('RGB');atlas=Image.new('RGB',(TILE*4,TILE*4))
    for r in range(4):
        for c in range(4):
            atlas.paste(img.crop((xs[c]+2,ys[r]+2,xs[c+1]-2,ys[r+1]-2)).resize((TILE,TILE),Image.LANCZOS),(c*TILE,r*TILE))
    atlas.save(out,quality=88);return f'格線 x={xs} y={ys}'

def do_objects(path,suffix):   # 先照 3×3 格切，再取每格裡最大的物體
    rgba=key(Image.open(path));W,H=rgba.size;res=[]
    for i,k in enumerate(OBJ_KEYS):
        r,c=divmod(i,3);cell=rgba.crop((c*W//3,r*H//3,(c+1)*W//3,(r+1)*H//3))
        o=main_part(cell)   # 只留這格的主體，鄰格伸進來的碎片去掉
        s=min(1,OBJ_H/o.height);o=o.resize((max(1,int(o.width*s)),max(1,int(o.height*s))),Image.LANCZOS)
        name=f'{k}_{suffix}';o.save(os.path.join(A,'art',name+'.webp'),quality=88);res.append(f'{name} {o.size}')
    return res

def main_part(cell,merge=10):   # 留下這格裡最大的物體，裁到剛好
    al=np.array(cell)[...,3]>40;lab,k=ndimage.label(ndimage.binary_dilation(al,iterations=merge))
    big=1+int(np.argmax(ndimage.sum(al,lab,range(1,k+1))));arr=np.array(cell);arr[...,3]=np.where(lab==big,arr[...,3],0)
    out=Image.fromarray(arr,'RGBA');return out.crop(out.getbbox())

def facing(im):   # 回傳 <0 朝左、>0 朝右：看頭部的膚色（臉）偏在頭的哪一邊
    a=np.array(im).astype(int);h=int(a.shape[0]*.38);a=a[:h]
    al=ndimage.binary_opening(a[...,3]>100,iterations=6)   # 去掉細長的武器
    if al.sum()==0:return 0
    lab,k=ndimage.label(al);big=1+int(np.argmax(ndimage.sum(al,lab,range(1,k+1))));al=lab==big   # 只看頭那一塊
    r,g,b=a[...,0],a[...,1],a[...,2];mx=np.maximum(np.maximum(r,g),b);mn=np.minimum(np.minimum(r,g),b)
    skin=al&(r>g)&(g>b)&(r-b>35)&(r>165)&(g>105)&((mx-mn)<150)   # 膚色：比棕色頭髮亮
    if skin.sum()<20:return 0
    xs=np.where(al)[1];cx=(xs.min()+xs.max())/2
    return np.where(skin)[1].mean()-cx

def do_char(path,name):
    rgba=key(Image.open(path));W,H=rgba.size;cells=[]
    for i in range(4):   # 先切成 4 欄，每欄只留最大的那個人（武器伸進隔壁欄的部分會被去掉）
        cell=rgba.crop((i*W//4,0,(i+1)*W//4,H));cells.append(main_part(cell))
    hmax=max(c.height for c in cells);s=(CHAR_H-4)/hmax
    frames=cells
    # 側面兩格：看臉（膚色）在頭部的哪一側，判斷實際朝向；第 3 格放朝左、第 4 格放朝右。兩格同向時，用鏡像補另一邊
    f2,f3=frames[2],frames[3];d2,d3=facing(f2),facing(f3)
    if d2<0 and d3>0:pass
    elif d2>0 and d3<0:f2,f3=f3,f2
    elif d2<0 and d3<0:f3=f2.transpose(Image.FLIP_LEFT_RIGHT)
    else:f2=f3.transpose(Image.FLIP_LEFT_RIGHT)
    frames[2],frames[3]=f2,f3;frames=[f.resize((max(1,int(f.width*s)),max(1,int(f.height*s))),Image.LANCZOS) for f in frames]
    cw=max(f.width for f in frames)+4;sheet=Image.new('RGBA',(cw*4,CHAR_H),(0,0,0,0))
    for i,f in enumerate(frames):sheet.alpha_composite(f,(i*cw+(cw-f.width)//2,CHAR_H-2-f.height))
    sheet.save(os.path.join(A,'chars',name+'.webp'),quality=90)
    return {'cw':cw,'ch':CHAR_H}

def do_portrait(path,name):
    rgba=key(Image.open(path));b=parts(rgba,1,10)[0];o=rgba.crop(b);s=PORT_H/o.height
    o=o.resize((int(o.width*s),PORT_H),Image.LANCZOS);o.save(os.path.join(A,'chars',name+'_p.webp'),quality=90);return o.size

def do_boss(path,bid):
    rgba=key(Image.open(path));b=parts(rgba,1,20)[0];o=rgba.crop(b);s=min((BOSS_CELL-8)/o.width,(BOSS_CELL-8)/o.height)
    o=o.resize((int(o.width*s),int(o.height*s)),Image.LANCZOS)
    sheet=Image.open(os.path.join(A,'ui','bosses.webp')).convert('RGBA');c,r=BOSS_SLOT[bid]
    cell=Image.new('RGBA',(BOSS_CELL,BOSS_CELL),(0,0,0,0));cell.alpha_composite(o,((BOSS_CELL-o.width)//2,BOSS_CELL-4-o.height))
    sheet.paste(cell,(c*BOSS_CELL,r*BOSS_CELL));sheet.save(os.path.join(A,'ui','bosses.webp'),quality=90);return o.size

def main():
    meta_p=os.path.join(A,'chars','meta.json');meta=json.load(open(meta_p))
    for fn in sorted(os.listdir(IN)):
        m=re.match(r'(c\d)_(tiles|objects|bg|char_([a-z0-9_]+?)(_p)?|(boss_[a-z0-9]+))\.png$',fn)
        if not m:continue
        p=os.path.join(IN,fn);ch=m.group(1);what=m.group(2)
        if what=='tiles':print(fn,do_tiles(p,os.path.join(A,'art',f'tiles_{CH_MAP[ch]}.webp')))
        elif what=='objects':print(fn,do_objects(p,CH_MAP[ch]))
        elif what=='bg':o=Image.open(p).convert('RGB').resize(BG_SIZE,Image.LANCZOS);o.save(os.path.join(A,'ui',f'bg-{CH_MAP[ch]}.webp'),quality=85);print(fn,o.size)
        elif m.group(3) and m.group(4):print(fn,do_portrait(p,m.group(3)))
        elif m.group(3):r=do_char(p,m.group(3));meta[m.group(3)]={**meta.get(m.group(3),{}),**r};print(fn,r)
        elif m.group(5):print(fn,do_boss(p,m.group(5)))
    json.dump(meta,open(meta_p,'w'),ensure_ascii=False)
if __name__=='__main__':main()
