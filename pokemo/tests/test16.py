import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
exec(open(ROOT+'/tests/test12.py',encoding='utf-8').read().split('async def main')[0])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await (await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2,has_touch=True)).new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+ROOT+'/dist/index.html');await pg.wait_for_timeout(800)
        await pg.click('#btnNew');await pg.wait_for_selector('#dlg.on');await adv(pg)
        await pg.wait_for_selector('#modal.on');await pg.click('#modal button[data-i="0"]')
        await pg.wait_for_selector('#dlg.on');await adv(pg)
        await pg.wait_for_selector('#sStarter.on');await pg.wait_for_timeout(500)
        await pg.click('.stcard[data-id="fireA1"]');await pg.click('#stOk')
        await pg.wait_for_selector('#modal.on');await pg.click('#modal button[data-i="1"]')
        await pg.wait_for_selector('#dlg.on');await adv(pg);await pg.wait_for_timeout(300)
        r=await pg.evaluate("""async()=>{const log=[];window.say=async l=>{log.push(l.length)};window.startGuardBattle=async()=>{log.push('BATTLE')};
          const I=id=>interactNpc(NPCS.find(x=>x.id===id));const F=()=>JSON.stringify(P.flags);
          P.flags={intro:1};P.team[0].lv=12;
          await I('stele');log.push('stele0 '+F());
          await I('cloak');log.push('cloak0 '+F());
          await I('guard');log.push('guard0 '+F());
          await I('zhou');log.push('zhou '+F());
          await I('guard');log.push('guard1 '+F());
          await I('stele');log.push('stele '+F());
          await I('guard');log.push('guard2 '+F());
          await I('cloak');log.push('cloak '+F());
          await I('guard');log.push('guard3 '+F()+questHint());
          return log.join('\\n')}""")
        print(r)
        await pg.evaluate("()=>{G.lock=false;P.x=7.5;P.y=19.8;P.flags.q1=1;P.flags.stele=0;G.face=2}")
        await pg.wait_for_timeout(500);await pg.screenshot(path=ROOT+'/tests/shots/stele.png')
        print(errs);await b.close()
asyncio.run(main())
