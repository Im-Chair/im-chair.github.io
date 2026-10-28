import base64,re
import os
ROOT=os.path.dirname(os.path.abspath(__file__))+'/'
R=ROOT+'assets/ui/'
M={'__S_WATER__':'s-water','__S_FIRE__':'s-fire','__S_WOOD__':'s-wood','__S_LIGHT__':'s-light','__S_DARK__':'s-dark','__ORBS__':'orbs','__BOSSES__':'bosses','__BG_WATER__':'bg-water','__BG_FIRE__':'bg-fire','__BG_WOOD__':'bg-wood','__BG_LIGHT__':'bg-light','__BG_DARK__':'bg-dark','__BG_COAST__':'bg-coast','__BG_EMBER__':'bg-ember','__BG_TITLE__':'bg-title'}
t=open(ROOT+'src/template.html',encoding='utf-8').read()
import os,json
NEW=os.environ.get('NEWMON','1')=='1'
t=t.replace('__NEWMON__','true' if NEW else 'false')
ro=json.load(open(ROOT+'data/roster.json'))
slim=[{k:r[k] for k in ['id','name','attr','rar','line','stage','head','row','col','zone','next','evo','st']} for r in ro]
t=t.replace('__ROSTER__',json.dumps(slim,ensure_ascii=False,separators=(',',':')))
NS=ROOT+'assets/monsters/'
if NEW:
    for k,a in {'__S_WATER__':'water','__S_FIRE__':'fire','__S_WOOD__':'wood','__S_LIGHT__':'light','__S_DARK__':'dark'}.items():
        M[k]='NS:'+a
for k,v in M.items():
    path=(NS+v[3:]+'.webp') if v.startswith('NS:') else (R+v+'.webp')
    d='data:image/webp;base64,'+base64.b64encode(open(path,'rb').read()).decode()
    assert k in t,k
    t=t.replace(k,d)
# 角色與地圖素材：assets/chars、assets/art 裡的 webp 自動對應模板裡的 __C_名稱__（站姿）、__P_名稱__（立繪）、__A_名稱__（地圖素材）
import glob
b64=lambda p:'data:image/webp;base64,'+base64.b64encode(open(p,'rb').read()).decode()
for f in glob.glob(ROOT+'assets/chars/*.webp'):
    n=os.path.basename(f)[:-5]
    if n.endswith('_p'):k='__P_'+n[:-2].upper()+'__'
    else:k='__C_'+n.upper()+'__'
    if k in t:t=t.replace(k,b64(f))
for f in glob.glob(ROOT+'assets/art/*.webp'):
    k='__A_'+os.path.basename(f)[:-5].upper()+'__'
    if k in t:t=t.replace(k,b64(f))
left=sorted(set(re.findall(r'__[ACP]_[A-Z0-9_]+__',t)))
assert not left,'模板裡有找不到圖檔的佔位：'+','.join(left)
open(os.environ.get('OUT',ROOT+'dist/index.html'),'w',encoding='utf-8').write(t)
print('built',len(t)//1024,'KB')
