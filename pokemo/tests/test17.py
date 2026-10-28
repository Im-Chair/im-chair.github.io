# 地圖資料化（v1.3）：第 1 張地圖與舊版一致、舊存檔相容、關門→碎鏡海岸→回來、戰敗送回、各地遇怪表
import os,sys,json,asyncio
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
OUT=ROOT+'/tests/shots/'
OLD=os.path.abspath(sys.argv[1]) if len(sys.argv)>1 else None   # 可選：舊版 dist/index.html，用來比對第 1 張地圖
from playwright.async_api import async_playwright
exec(open(ROOT+'/tests/test12.py',encoding='utf-8').read().split('async def main')[0])
ok=[];bad=[]
def check(name,cond,info=''):
    (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name,info)
async def walk(pg,key,ms):
    await pg.keyboard.down(key);await pg.wait_for_timeout(ms);await pg.keyboard.up(key);await pg.wait_for_timeout(150)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2,has_touch=True)
        if OLD:
            po=await ctx.new_page();await po.goto('file://'+OLD);await po.wait_for_timeout(500)
            old=await po.evaluate("JSON.stringify(map)");await po.close()
        pg=await ctx.new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+ROOT+'/dist/index.html');await pg.wait_for_timeout(600);await pg.evaluate('()=>{window.__rnd=Math.random}')
        if OLD:
            new=await pg.evaluate("JSON.stringify(map)")
            check('第1張地圖圖塊與舊版完全一致',old==new)
        # 舊存檔（沒有 map 欄位、關門已開）
        await pg.evaluate("""()=>{const s={v:1,name:'夜',x:13.5,y:7.5,team:[{id:'fireA1',lv:14,exp:0,iv:{hp:1,atk:1,rec:1},uid:1}],box:[],dex:{fireA1:2},items:{potion:3,candy:1},flags:{intro:1,q1:1,stele:1,truth1:1,guardDone:1},scrolls:[0],hpFrac:1,uid:1};
            localStorage.setItem('orbrpg_save_v3',JSON.stringify(s))}""")
        await pg.reload();await pg.wait_for_timeout(600)
        await pg.click('#btnCont');await pg.wait_for_timeout(900)
        st=await pg.evaluate("[CURID,map[4][13],map[3][13],areaName(),activeNpcs().map(n=>n.id).join()]")
        check('舊存檔讀入第1張地圖',st[0]=='grass',st)
        check('關門已開(4,13)(3,13)為路',st[1]==4 and st[2]==4)
        check('賽倫已離開',('guard' not in st[4]))
        await pg.evaluate("()=>{Math.random=()=>0.99}")   # 不遇怪
        await walk(pg,'ArrowUp',1800);await pg.wait_for_timeout(900)
        await pg.wait_for_selector('#modal.on',timeout=5000);letter=await pg.inner_text('#modal');await pg.click('#modal button');await pg.wait_for_timeout(300)
        check('到海岸收到賽倫的信（一）','賽倫的信（一）' in letter)
        st=await pg.evaluate("[CURID,P.map,P.x,P.y,areaName(),$('#hudName').textContent,encPool(0,false).length]")
        check('往北走過關門→碎鏡海岸',st[0]=='coast' and st[1]=='coast',st)
        check('海岸有水屬性 ★2 可遇',st[6]>0)
        await pg.screenshot(path=OUT+'c_coast_entry.png')
        # 存檔帶地圖
        sv=await pg.evaluate("JSON.parse(localStorage.getItem('orbrpg_save_v3')).map")
        check('存檔記錄目前地圖',sv=='coast',sv)
        # 告示牌、NPC、禁區門
        lines=await pg.evaluate("""async()=>{const L=[];const o=window.say;window.say=async l=>{L.push(JSON.stringify(l))};
            await interactTile(T.SIGN,13,36);await interactTile(T.GATE,15,12);await interactNpc(NPCS.find(n=>n.id==='ajing'));
            L.push(questHint());window.say=o;G.lock=false;return L}""")
        print(lines);check('海岸告示牌',('碎鏡海岸' in lines[0]))
        # 往北走進漁村、草叢
        await pg.evaluate("()=>{P.x=6.5;P.y=19.5}");await pg.wait_for_timeout(400);await pg.screenshot(path=OUT+'c_coast_rocks.png')
        await pg.evaluate("()=>{P.x=15.0;P.y=14.5}");await pg.wait_for_timeout(400);await pg.screenshot(path=OUT+'c_coast_gate.png')
        await pg.evaluate("()=>{P.x=15.0;P.y=30.5}");await pg.wait_for_timeout(400);await pg.screenshot(path=OUT+'c_coast_village.png')
        # 遇怪用海岸的表
        dist=await pg.evaluate("""()=>{const o=Math.random;let s=7;Math.random=()=>{s=(s*16807)%2147483647;return s/2147483647};
            const run=(x,y)=>{P.x=x;P.y=y;const c=[0,0,0,0,0];let lvok=true;for(let i=0;i<400;i++){const e=pickWild();c[e.attr]++;const L=e.sp.rar>=3?CHAPTERS[2].lvHi:CHAPTERS[2].lv2;if(e.lv<L[0]||e.lv>L[1])lvok=false}return[c,lvok]};
            const r={sea:run(19.5,20.5),rock:run(4.5,18.5)};Math.random=o;return r}""")
        print('海邊草叢 水火木光暗',dist['sea'][0],'岩岸草叢',dist['rock'][0])
        check('等級都在第 2 章範圍內',dist['sea'][1] and dist['rock'][1])
        check('海邊水屬性最多',dist['sea'][0][0]==max(dist['sea'][0]))
        check('岩岸火屬性比海邊多',dist['rock'][0][1]>dist['sea'][0][1]*2)
        check('光暗少量出現',0<dist['sea'][0][3]+dist['sea'][0][4]<60)
        # 戰敗→送回海岸療癒泉
        await pg.evaluate("()=>{Math.random=()=>0.5;startWild()}");await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>{onDefeat()}");await pg.wait_for_selector('#modal.on',timeout=8000)
        txt=await pg.inner_text('#modal');await pg.click('#modal button');await pg.wait_for_timeout(1200)
        st=await pg.evaluate("[CURID,P.x,P.y]")
        check('戰敗送回海岸漁村',st[0]=='coast' and abs(st[1]-15)<.01 and abs(st[2]-33.5)<.01,[st,txt[:40]])
        # 往南走回草原
        await pg.evaluate("()=>{Math.random=()=>0.99;P.x=15.0;P.y=37.3;G.lock=false}")
        await walk(pg,'ArrowDown',1500);await pg.wait_for_timeout(900)
        st=await pg.evaluate("[CURID,P.x,P.y,areaName()]")
        check('往南走回翠風草原關口',st[0]=='grass' and st[3]=='守界關口',st)
        await pg.screenshot(path=OUT+'c_back_grass.png')
        # 新遊戲：關門關著、不能傳送
        await pg.evaluate("()=>{P.flags.guardDone=0;refreshMap();P.x=13.5;P.y=5.6}")
        st=await pg.evaluate("[map[4][13],solidAt(13,4)]")
        check('未打贏賽倫時關門是實心的',st[0]==8 and st[1],st)
        # 第 1 章：小豆與歌謠
        r=await pg.evaluate("""async()=>{const L=[];const o=window.say;window.say=async l=>{L.push(l.length)};
            await changeMap('grass',13.5,30.5,0);P.flags={intro:1,q1:1};await interactNpc(NPCS.find(x=>x.id==='xiaodou'));
            window.say=o;G.lock=false;return[!!P.flags.song,L]}""")
        check('小豆唱歌',r[0] and r[1]==[5],r)
        await pg.evaluate("()=>{P.x=18.5;P.y=34.6}");await pg.wait_for_timeout(400);await pg.screenshot(path=OUT+'c_xiaodou.png')
        # 療癒泉傳送：兩邊都摸過後，從海岸傳回草原
        await pg.evaluate("()=>{P.springs=[];window.__say=window.say;window.say=async()=>{}}")
        await pg.evaluate("async()=>{await changeMap('coast',15,33.5,0);G.lock=false}");await pg.wait_for_timeout(300)
        await pg.evaluate("()=>{interactTile(T.FOUNT,17,33)}");await pg.wait_for_timeout(400)
        one=await pg.evaluate("[P.springs.join(),document.querySelector('#modal').classList.contains('on')]")
        check('只摸過一個療癒泉時沒有傳送選單',one==['coast',False],one)
        await pg.evaluate("async()=>{G.lock=false;await changeMap('grass',13.5,31.5,0);G.lock=false;interactTile(T.FOUNT,16,31)}");await pg.wait_for_timeout(1200)
        await pg.wait_for_selector('#modal.on');await pg.click('#modal button[data-i="1"]');await pg.wait_for_timeout(1500)
        st=await pg.evaluate("[CURID,P.x,P.y,P.springs.join()]")
        check('從草原療癒泉傳送到海岸',st[0]=='coast' and abs(st[2]-33.5)<.01,st)
        await pg.evaluate("()=>{window.say=window.__say}")
        # 守衛轉珠：演出後回傳 Combo 數
        r=await pg.evaluate("""async()=>{let sd=12345;Math.random=()=>{sd=sd*16807%2147483647;return sd/2147483647};B={};const out=[];for(let i=0;i<12;i++)out.push(await foeTurn([3,5]));B=null;return out}""")
        print('守衛轉珠（排 3～5 組）實際 Combo：',r)
        check('對手轉珠：Combo 不低於排好的下限、有時有天降',min(r)>=3 and max(r)>3 and len(set(r))>1,r)
        check('沒有 JS 錯誤',not errs,errs)
        await b.close()
    print(f'\n{len(ok)} 通過，{len(bad)} 失敗',bad)
asyncio.run(main())
