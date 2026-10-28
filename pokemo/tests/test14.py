import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
OUT=ROOT+'/tests/shots/'
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
        await pg.evaluate("()=>{let b=null;for(let y=5;y<MH-5&&!b;y++)for(let x=5;x<MW-5;x++)if(map[y][x]===T.TG&&map[y][x+1]===T.TG&&map[y+1][x]===T.TG&&map[y-1][x]===T.TG&&map[y+2][x]===T.TG){b=[x,y];break}P.x=b[0]+.5;P.y=b[1]+.5;G.face=0;G.moving=false;window.__b=b}")
        await pg.wait_for_timeout(400);await pg.screenshot(path=OUT+'grass.png');print(await pg.evaluate('JSON.stringify(__b)'))
        for i,(face,mv) in enumerate([(0,1),(3,1),(2,1),(1,1)]):
            await pg.evaluate(f"()=>{{G.face={face};G.moving=true}}")
            for k in range(2):
                await pg.wait_for_timeout(95 if k==0 else 140)
                await pg.screenshot(path=OUT+f'w{i}{k}.png',clip={'x':130,'y':530,'width':130,'height':110})
        await pg.screenshot(path=OUT+'full.png');print(await pg.evaluate('JSON.stringify([P.x,P.y,CH.main.img.naturalWidth,CH.main.img.complete])'),errs);await b.close()
asyncio.run(main())
