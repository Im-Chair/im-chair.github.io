import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
OUT=ROOT+'/tests/shots/'
async def adv(page):
    for _ in range(80):
        if not await page.evaluate("document.querySelector('#dlg').classList.contains('on')"): return
        await page.click('#dlg', force=True); await page.wait_for_timeout(50)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await (await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2,has_touch=True)).new_page()
        errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.on('console',lambda m:errs.append('console:'+m.text) if m.type=='error' else None)
        await pg.goto('file://'+ROOT+'/dist/index.html')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT+'a_title.png')
        await pg.click('#btnNew')
        await pg.wait_for_selector('#dlg.on'); await adv(pg)
        await pg.wait_for_selector('#modal.on'); await pg.click('#modal button[data-i="0"]')
        await pg.wait_for_selector('#dlg.on'); await adv(pg)
        await pg.wait_for_selector('#sStarter.on'); await pg.wait_for_timeout(600)
        await pg.click('.stcard[data-id="fireA1"]')
        await pg.screenshot(path=OUT+'b_starter.png')
        await pg.click('#stOk'); await pg.wait_for_selector('#modal.on'); await pg.click('#modal button[data-i="1"]')
        await pg.wait_for_selector('#dlg.on'); await adv(pg)
        print('team',await pg.evaluate("JSON.stringify(P.team.map(m=>m.id+' Lv'+m.lv))"))
        # 戰鬥
        await pg.evaluate("()=>{P.x=7.5;P.y=22.5;window.__r=Math.random;startWild()}")
        await pg.wait_for_selector('#sBattle.on'); await pg.wait_for_timeout(1800)
        print('enemy',await pg.evaluate("B.enemy.sp.name+' '+B.enemy.sp.id+' hp'+B.enemy.maxHp+' atk'+B.enemy.atk"))
        await pg.screenshot(path=OUT+'c_battle.png')
        # 守衛戰畫面
        await pg.evaluate("()=>{B.over=true;B=null;show('sMap');startGuardBattle()}")
        await pg.wait_for_selector('#sBattle.on'); await pg.wait_for_timeout(1800)
        await pg.screenshot(path=OUT+'d_guard.png')
        print('guard foes',await pg.evaluate("B.foes.map(w=>w.sp.name+' hp'+w.maxHp+' cd'+w.cd).join(' | ')"))
        # 背包：圖鑑與存檔頁
        await pg.evaluate("()=>{B=null;show('sMap');startMapLoop();G.lock=false;bagTab='dex';openBag()}")
        await pg.wait_for_timeout(300); await pg.screenshot(path=OUT+'e_dex.png')
        await pg.evaluate("()=>{bagTab='sys';renderBag()}")
        await pg.wait_for_timeout(200); await pg.screenshot(path=OUT+'f_sys.png')
        # 調整平衡參數
        await pg.fill('#tCap','20'); await pg.dispatch_event('#tCap','change'); await pg.wait_for_timeout(200)
        print('TUNE',await pg.evaluate("JSON.stringify(TUNE)"))
        print('ERRORS',errs)
        await b.close()
asyncio.run(main())
