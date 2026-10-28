# 多隻對手同時上場：點選目標、溢出傷害換目標、一起出手、全倒才勝利
import os,asyncio
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
OUT=ROOT+'/tests/shots/'
from playwright.async_api import async_playwright
ok=[];bad=[]
def check(n,c,i=''):(ok if c else bad).append(n);print(('PASS ' if c else 'FAIL ')+n,i)
SETG="""(t)=>{const L=[[1,1,1,0,0,0],[1,1,1,0,0,0],[1,1,1,0,0,0],[2,3,4,2,3,4],[3,4,2,3,4,2]];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)grid[r][c]=mkOrb(L[r][c],r,c)}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await (await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2)).new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+ROOT+'/dist/index.html');await pg.wait_for_timeout(600)
        await pg.evaluate("()=>{P=freshPlayer();P.team=[newMon('fireA1',30),newMon('fireA1',30),newMon('waterA1',30)];P.flags={intro:1,truth1:1};loadMap('grass');show('sMap');window.__won=0;window.afterGuardWin=async()=>{window.__won=1};startGuardBattle()}")
        await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(1500)
        st=await pg.evaluate("[B.foes.length,B.foes.map(f=>f.cd).join(),document.querySelectorAll('.foe').length,B.foeScale]")
        check('守衛三隻同時上場、倒數錯開',st[0]==3 and st[2]==3 and len(set(st[1].split(',')))>1,st)
        await pg.screenshot(path=OUT+'d_guard3.png')
        await pg.click('.foe[data-fi="2"]');await pg.wait_for_timeout(200)
        st=await pg.evaluate("[B.tgt,B.enemy===B.foes[2],document.querySelector('.foe.tgt').dataset.fi]")
        check('點選第 3 隻成為目標',st[0]==2 and st[1] and st[2]=='2',st)
        # 讓第 3 隻只剩一點血，一次大傷害：溢出到下一隻
        r=await pg.evaluate("""async()=>{B.foes[2].hp=5;const h0=B.foes.map(f=>f.hp);(%s)(1);B.busy=false;await afterMove();return[h0,B.foes.map(f=>f.hp),B.tgt]}"""%SETG)
        check('目標倒下後，剩下的傷害打到下一隻',r[1][2]==0 and (r[1][0]<r[0][0] or r[1][1]<r[0][1]) and r[2]!=2,r)
        # 一起出手：把兩隻倒數都設成 1
        r=await pg.evaluate("""async()=>{B.busy=false;const al=B.foes.filter(f=>f.hp>0);al.forEach(f=>f.cd=1);const t0=B.teamHp;(%s)(4);B.foes.forEach(f=>{if(f.hp>0){f.maxHp=99999;f.hp=99999}});await afterMove();return[t0-B.teamHp,al.map(f=>f.cd)]}"""%SETG)
        check('倒數到 0 的一起出手、倒數重置',r[0]>0 and all(c==2 for c in r[1]),r)
        # 全部打倒才勝利
        await pg.evaluate("""()=>{B.busy=false;B.foes.forEach(f=>{if(f.hp>0){f.maxHp=50;f.hp=1}});B.teamHp=B.teamMax;(%s)(1);afterMove()}"""%SETG)
        await pg.wait_for_selector('#modal.on',timeout=15000);r=await pg.inner_text('#modal');await pg.click('#modal button');await pg.wait_for_timeout(2000)
        won=await pg.evaluate("window.__won")
        check('三隻都倒下才算勝利',won==1,[r,won])
        # 野生仍是一隻、大圖顯示
        await pg.evaluate("()=>{G.lock=false;startWild()}");await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(1500)
        st=await pg.evaluate("[B.foes.length,document.querySelectorAll('.foe').length,getComputedStyle(document.querySelector('#eCd')).display]")
        check('野生戰：一隻、單隻大圖、顯示倒數',st[0]==1 and st[1]==0 and st[2]!='none',st)
        check('沒有 JS 錯誤',not errs,errs)
        await b.close()
    print(f'\n{len(ok)} 通過，{len(bad)} 失敗',bad)
asyncio.run(main())
