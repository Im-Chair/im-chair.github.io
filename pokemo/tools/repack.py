from PIL import Image
import numpy as np
from scipy import ndimage
A='/mnt/user-data/attachments/714e56d0-e4c4-5b71-bb61-cc636b616533/'
SRC={'water':'c965e33b','fire':'b23a60c2','light':'57c8b1ac','dark':'cac0e771'}
def key(im):
    a=np.array(im.convert('RGB')).astype(np.int32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    dist=np.sqrt((r-255)**2+g**2+(b-255)**2)
    alpha=np.clip((dist-80)/90,0,1)
    spill=np.clip(np.minimum(r,b)-g,0,255)
    r2=np.where(alpha<1,r-spill,r);b2=np.where(alpha<1,b-spill,b)
    return np.dstack([np.clip(r2,0,255),g,np.clip(b2,0,255),alpha*255]).astype(np.uint8)
def valley(proj,center,win=70,sm=9):
    p=ndimage.uniform_filter1d(proj.astype(float),sm)
    lo,hi=max(1,center-win),min(len(p)-1,center+win)
    seg=p[lo:hi]
    m=seg.min()
    cand=np.where(seg<=m+1e-6)[0]
    return lo+int(cand[len(cand)//2])   # 最低點區間的中間
CELL=192;SRC_CELL=256;SC=CELL/SRC_CELL
def process(ak,img):
    rgba=key(img);al=(rgba[...,3]>40)
    H,W=al.shape
    ys=[0]+[valley(al.sum(axis=1),SRC_CELL*k) for k in (1,2,3)]+[H]
    atlas=Image.new('RGBA',(CELL*6,CELL*4),(0,0,0,0));boxes=[]
    for r in range(4):
        band=al[ys[r]:ys[r+1]]
        xs=[0]+[valley(band.sum(axis=0),SRC_CELL*k,win=60) for k in range(1,6)]+[W]
        for c in range(6):
            x0,x1,y0,y1=xs[c],xs[c+1],ys[r],ys[r+1]
            sub=rgba[y0:y1,x0:x1].copy()
            a=sub[...,3]>40
            # 只保留與主體相連的部分（以較大的膨脹找主體），避免鄰格殘留邊
            lab,n=ndimage.label(ndimage.binary_dilation(a,iterations=12))
            if n==0: continue
            sizes=ndimage.sum(a,lab,range(1,n+1))
            keep_ids=[]
            for i,s_ in enumerate(sizes):
                comp=(lab==i+1)&a
                ys_,xs_=np.where(comp)
                touches=ys_.min()==0 or ys_.max()==a.shape[0]-1 or xs_.min()==0 or xs_.max()==a.shape[1]-1
                if s_>=0.12*sizes.max() and not (touches and s_<0.3*sizes.max()): keep_ids.append(i+1)
            keep=np.isin(lab,keep_ids)
            sub[...,3]=np.where(keep,sub[...,3],0)
            yy,xx=np.where(sub[...,3]>20)
            if len(xx)==0: continue
            crop=Image.fromarray(sub[yy.min():yy.max()+1,xx.min():xx.max()+1],'RGBA')
            w,h=crop.size
            s=min(SC,(CELL-10)/w,(CELL-8)/h)
            crop=crop.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS)
            atlas.alpha_composite(crop,(c*CELL+(CELL-crop.size[0])//2,r*CELL+CELL-6-crop.size[1]))
            boxes.append((r,c,w,h))
    return atlas,boxes
if __name__=='__main__':
    for ak,fid in SRC.items():
        atlas,boxes=process(ak,Image.open(A+fid+'-image.png'))
        atlas.save(f'newsheets/{ak}.webp',quality=86)
        bg=Image.new('RGB',atlas.size,(60,70,90));bg.paste(atlas,mask=atlas.split()[3]);bg.save(f'newsheets/{ak}_pv.png')
        print(ak,len(boxes),'cells')
