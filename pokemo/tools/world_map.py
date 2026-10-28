# 畫世界地圖（各地圖相對位置、連接通道、解鎖條件）。用法：python3 tools/world_map.py 輸出.png
import sys,math
from PIL import Image,ImageDraw,ImageFont
OUT=sys.argv[1] if len(sys.argv)>1 else 'world.png'
W,H=1600,1200
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
F=lambda s:ImageFont.truetype(FONT,s,index=3)
f30,f24,f20,f17=F(30),F(24),F(20),F(17)
AC={'水':(61,165,255),'火':(255,90,60),'木':(67,192,90),'光':(255,216,74),'暗':(155,93,229),'混':(200,200,210),'全':(255,122,200)}
im=Image.new('RGB',(W,H),(14,18,40));d=ImageDraw.Draw(im)
# 海（東）
d.polygon([(1400,0),(W,0),(W,H),(1380,H),(1440,900),(1370,640),(1430,380),(1380,160)],fill=(22,58,110))
d.text((1460,560),'海',font=f30,fill=(120,180,255))
# 裂痕（中央）
crack=[(650,280),(700,330),(660,420),(720,500),(680,590),(740,660),(690,760),(740,850),(800,840),(760,760),(820,660),(760,590),(800,500),(740,420),(780,330),(730,270)]
d.polygon(crack,fill=(6,6,12),outline=(120,80,170))
d.text((800,860),'大地的裂痕',font=f20,fill=(170,130,220))
# 天空（浮島）
d.ellipse([70,90,540,330],fill=(36,46,90));d.text((100,110),'天上',font=f20,fill=(170,190,240))
N={ # 代號: (x,y,章,名稱,屬性字)
 'grass':(820,1060,'1','翠風草原・初芽鎮','木光'),
 'coast':(1220,860,'2','碎鏡海岸','水'),
 'ember':(1180,470,'3','赤燼荒原','火'),
 'marsh':(800,150,'4','霧語沼林','木暗'),
 'sky':(300,220,'5','天穹浮島','光'),
 'abyss':(720,720,'6','無光深淵','暗'),
 'capital':(250,600,'7','守界盟王都','混'),
 'throne':(720,420,'8','歸一王座','全'),
 'tower':(400,1060,'9','無盡之塔（番外）','全'),
}
def box(k):
    x,y,c,n,a=N[k];tw=max(d.textlength(n,font=f24)+90,190);h=70
    return (x-tw/2,y-h/2,x+tw/2,y+h/2)
def edge(a,b,label,sub,style='solid',col=(230,230,240),bend=0,lp=0.5,loff=(0,0)):
    x1,y1=N[a][:2];x2,y2=N[b][:2]
    mx,my=(x1+x2)/2,(y1+y2)/2;nx,ny=-(y2-y1),(x2-x1);L=math.hypot(nx,ny) or 1;cx,cy=mx+nx/L*bend,my+ny/L*bend
    pts=[((1-t)**2*x1+2*(1-t)*t*cx+t*t*x2,(1-t)**2*y1+2*(1-t)*t*cy+t*t*y2) for t in [i/60 for i in range(61)]]
    for i in range(60):
        if style=='dash' and i%4>=2:continue
        if style=='dot' and i%3!=0:continue
        d.line([pts[i],pts[i+1]],fill=col,width=5 if style=='solid' else 4)
    t=lp;lx=(1-t)**2*x1+2*(1-t)*t*cx+t*t*x2+loff[0];ly=(1-t)**2*y1+2*(1-t)*t*cy+t*t*y2+loff[1]
    w=max(d.textlength(label,font=f20),d.textlength(sub,font=f17))+18
    d.rounded_rectangle([lx-w/2,ly-28,lx+w/2,ly+28],8,fill=(24,30,62),outline=col,width=2)
    d.text((lx-d.textlength(label,font=f20)/2,ly-26),label,font=f20,fill=col)
    d.text((lx-d.textlength(sub,font=f17)/2,ly+1),sub,font=f17,fill=(190,198,230))
G=(255,214,74)
edge('grass','coast','守界關口（關門）','打贏賽倫後開',bend=-60,loff=(10,10))
edge('coast','ember','岩岸山道','打贏潮生後開（落石清除）',bend=-40)
edge('ember','marsh','焦林小徑','打贏燼後開',bend=60)
edge('marsh','sky','風口崖・雲雀載你飛上去','打贏獵牙後開',style='dot',col=(150,210,255),bend=50)
edge('sky','abyss','雲雀降落裂痕邊・灰鴉的繩梯','打贏瑟菲後開',style='dot',col=(150,210,255),bend=-90,lp=0.3,loff=(60,10))
edge('abyss','capital','歸一會舊地道 → 麵包坊地窖','打贏黑鋒後開',bend=-40,lp=0.5,loff=(0,30))
edge('capital','throne','裂痕觀望台・五核光橋','打贏奧瑞、五核到齊',col=G,bend=-60,lp=0.5,loff=(0,-30))
edge('grass','capital','守界盟官道','沒有通行令；第 7 章後開放',style='dash',col=(170,170,190),bend=-80,lp=0.55,loff=(0,0))
edge('grass','tower','古碑','第 8 章通關後化為塔的入口',style='dash',col=(255,122,200),lp=0.5,loff=(-20,-75))
for k,(x,y,c,n,a) in N.items():
    x1,y1,x2,y2=box(k)
    d.rounded_rectangle([x1,y1,x2,y2],12,fill=(30,38,78),outline=(255,255,255),width=3)
    for i,ch in enumerate(a):d.rectangle([x1+6,y1+8+i*(54/len(a)),x1+16,y1+8+(i+1)*(54/len(a))],fill=AC[ch])
    d.ellipse([x1+24,y-17,x1+58,y+17],fill=(255,255,255));d.text((x1+41-d.textlength(c,font=f24)/2,y-16),c,font=f24,fill=(20,24,50))
    d.text((x1+66,y-17),n,font=f24,fill=(255,255,255))
    at='／'.join({'木':'木','光':'光','水':'水','火':'火','暗':'暗','混':'混合','全':'全屬性'}[ch] for ch in a)
    d.text((x2-d.textlength(at,font=f17)-10,y2+4),at,font=f17,fill=(200,206,235))
d.text((N['grass'][0]-60,N['grass'][1]-72),'★ 起點',font=f20,fill=G)
d.text((40,20+300),'',font=f20)
# 圖例
lx,ly=1000,1110
d.text((40,1150),'實線＝走路通過　點線＝雲雀飛行　虛線＝特殊開放　走過的路都能往回走；碰過的療癒泉之間可以直接傳送',font=f20,fill=(220,224,245))
d.text((40,20),'珠界 世界地圖（提案）',font=f30,fill=(255,255,255))
im.save(OUT);print(OUT)
