# 第 2 章完整流程：收信 → 阿鯨 → 禁區的門 → 鹽婆 → 打柏 → 名錄 → 潛水（殘卷貳）→ 打潮生 → 水核、門開、落石清、第二封信
import os,asyncio
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True);OUT=ROOT+'/tests/shots/'
from playwright.async_api import async_playwright
ok=[];bad=[]
def check(n,c,i=''):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,i)
SETG="""()=>{const L=[[1,1,1,0,0,0],[1,1,1,0,0,0],[1,1,1,0,0,0],[2,3,4,2,3,4],[3,4,2,3,4,2]];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)grid[r][c]=mkOrb(L[r][c],r,c)}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await (await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2)).new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+ROOT+'/dist/index.html');await pg.wait_for_timeout(600)
        async def modal_click(i=0,timeout=8000):
            await pg.wait_for_selector('#modal.on',timeout=timeout);t=await pg.inner_text('#modal');await pg.click(f'#modal button[data-i="{i}"]');await pg.wait_for_timeout(400);return t
        async def win_battle():
            await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(1300)
            await pg.evaluate("()=>{B.busy=false;B.foes.forEach(f=>{f.maxHp=10;f.hp=1});(%s)();afterMove()}"%SETG)
            await modal_click(0,15000);await pg.wait_for_timeout(1500)
        await pg.evaluate("""()=>{P=freshPlayer();P.name='夜';P.team=[newMon('fireA1',30),newMon('fireA1',30),newMon('waterA1',30)];
            P.flags={intro:1,q1:1,stele:1,truth1:1,guardDone:1};P.scrolls=[0];loadMap('grass');show('sMap');resizeMap();startMapLoop();
            window.say=async()=>{};changeMap('coast',15,37.3,1)}""")
        t=await modal_click();check('第一次到海岸收到賽倫的信（一）','賽倫的信（一）' in t,t[:20])
        F="()=>JSON.stringify(P.flags)"
        async def npc(i):await pg.evaluate(f"async()=>{{G.lock=false;await interactNpc(NPCS.find(n=>n.id==='{i}'))}}")
        async def tile(t,x,y):await pg.evaluate(f"async()=>{{G.lock=false;await interactTile(T.{t},{x},{y})}}")
        await npc('chaosheng');f=await pg.evaluate(F);check('潛水前潮生不開打','c2_' not in f and await pg.evaluate("cur")=='sMap',f)
        await tile('GATE',15,12);f=await pg.evaluate("P.flags.c2_chain||0");check('沒見過阿鯨前，門只是鎖著',f==0)
        await npc('ajing');await tile('GATE',15,12);await npc('yanpo')
        await tile('DOOR',19,29);f=await pg.evaluate("[P.flags.c2_jing,P.flags.c2_chain,P.flags.c2_box,P.flags.c2_roster||0]");check('阿鯨→門→鹽婆；沒打柏進不了哨所',f==[1,1,1,0],f)
        await pg.evaluate("()=>{G.lock=false;interactNpc(NPCS.find(n=>n.id==='bo'))}");await win_battle()
        f=await pg.evaluate("[P.flags.c2_bo,CURID,cur]");check('打贏柏',f[0]==1 and f[2]=='sMap',f)
        await tile('DOOR',19,29);await npc('ajing')
        f=await pg.evaluate("[P.flags.c2_roster,P.flags.c2_dive,P.scrolls.includes(1),SCROLLS[1].x.length>0]");check('名錄→潛水取得殘卷貳',f==[1,1,True,True],f)
        await pg.evaluate("()=>{G.lock=false;interactNpc(NPCS.find(n=>n.id==='chaosheng'))}")
        await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(1300)
        st=await pg.evaluate("[B.foes.map(f=>f.sp.name+' Lv'+f.lv).join('、'),B.foeName]");print('潮生隊伍',st)
        await pg.screenshot(path=OUT+'e_chaosheng.png')
        await pg.evaluate("()=>{B.busy=false;B.foes.forEach(f=>{f.maxHp=10;f.hp=1});(%s)();afterMove()}"%SETG)
        await modal_click(0,15000)
        t=await modal_click(0,15000);check('打贏潮生後收到賽倫的信（二）','賽倫的信（二）' in t,t[:20])
        await pg.wait_for_timeout(500)
        f=await pg.evaluate("[P.flags.c2_done,P.cores.join(),map[12][15],map[14][1],map[15][1],activeNpcs().map(n=>n.id).join(),questHint()]")
        check('水核、禁區門打開、山道落石清除',f[0]==1 and f[1]=='0' and f[2]==4 and f[3]==4 and f[4]==4,f)
        check('潮生移到禁區裡、小豆出現','chaosheng2' in f[5] and 'xiaodou2' in f[5] and ',chaosheng,' not in ','+f[5]+',',f[5])
        await npc('xiaodou2');f=await pg.evaluate("P.flags.song2");check('小豆第二段歌謠',f==1)
        await pg.evaluate("()=>{bagTab='scroll';openBag()}");await pg.wait_for_timeout(300)
        txt=await pg.inner_text('#bagBody');check('背包殘卷頁有水核與兩封信','水核' in txt and '賽倫的信（二）' in txt)
        await pg.screenshot(path=OUT+'e_bag_scroll.png')
        check('沒有 JS 錯誤',not errs,errs)
        await b.close()
    print(f'\n{len(ok)} 通過，{len(bad)} 失敗',bad)
asyncio.run(main())
