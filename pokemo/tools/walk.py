from PIL import Image
import numpy as np
from repack import key,process
A='/mnt/user-data/attachments/714e56d0-e4c4-5b71-bb61-cc636b616533/'
# wood
#atlas,boxes=process('wood',Image.open(A+'0612ba63-image.png'))
#atlas.save('newsheets/wood.webp',quality=86)
#bg=Image.new('RGB',atlas.size,(60,70,90));bg.paste(atlas,mask=atlas.split()[3]);bg.save('newsheets/wood_pv.png');print('wood',len(boxes))
# walk
im=Image.open(A+'c91c1083-image.png');rgba=key(im);W,H=im.size
cw0,ch0=W/3,H/4
order=[0,3,1,2]  # face0 front=row0, face1 back=row3, face2 left=row1, face3 right=row2
frames={}
for f in range(4):
    r=order[f]
    row=[]
    for c in range(3):
        x0,x1,y0,y1=int(c*cw0),int((c+1)*cw0),int(r*ch0),int((r+1)*ch0)
        sub=rgba[y0:y1,x0:x1].copy()
        yy,xx=np.where(sub[...,3]>40)
        top=yy<yy.min()+0.35*(yy.max()-yy.min())
        hx=xx[top].mean()
        row.append((sub,xx.min(),xx.max(),yy.min(),yy.max(),hx))
    frames[f]=row
gh=max(b[4]-b[3]+1 for f in frames for b in frames[f]);gw=max(b[2]-b[1]+1 for f in frames for b in frames[f])
print(gh,gw)
CH_=202;s=(CH_-4)/gh
CWc=int(round((gw+20/s)*s))
out=Image.new('RGBA',(CWc*3,CH_*4),(0,0,0,0))
for f in range(4):
    
    for c in range(3):
        sub,x0,x1,y0,y1,hx=frames[f][c]
        cx=hx
        halfw=(gw/2)+10/s
        L=int(round(cx-halfw));R=int(round(cx+halfw))
        pad=np.zeros((sub.shape[0],max(0,-L)+max(0,R-sub.shape[1])+sub.shape[1],4),np.uint8)
        full=np.zeros((sub.shape[0],sub.shape[1]+200,4),np.uint8);full[:,100:100+sub.shape[1]]=sub
        win=full[y0:y1+1,L+100:R+100]
        t=Image.fromarray(win,'RGBA');t=t.resize((CWc,round((y1-y0+1)*s)),Image.LANCZOS)
        out.alpha_composite(t,(c*CWc,f*CH_+CH_-2-t.size[1]))
out.save('chars/main_walk.webp',quality=88)
bgp=Image.new('RGB',out.size,(60,110,60));bgp.paste(out,mask=out.split()[3]);bgp.save('chars/main_walk_pv.png')
print(CWc,CH_)
