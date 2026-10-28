import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await (await b.new_context(viewport={'width':390,'height':780})).new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+ROOT+'/dist/index.html'); await pg.wait_for_timeout(600)
        print(await pg.evaluate("JSON.stringify([0,1,2,3,4].map(a=>ATTR[a]+':'+[...encPool(a,false),...encPool(a,true)].map(sp=>sp.name+'★'+sp.rar+(sp.next?'→':'（不進化）')).join('、')))"))
        print(await pg.evaluate("""()=>{P=freshPlayer();const t={};['waterB1','waterB2','waterB3','waterF1','fireA1'].forEach(i=>{const m=newMon(i,21);P.team=[m];const o=addExp(m,expNeed(21));t[i]=[m.id,o.join(' ')]});return JSON.stringify(t)}"""))
        print(await pg.evaluate("JSON.stringify({total:Object.keys(SP).length,evolving:Object.values(SP).filter(s=>s.next).length,standalone:Object.values(SP).filter(s=>s.head&&!s.next).length,wildable:Object.values(SP).filter(s=>s.head).length})"))
        print('ERR',errs); await b.close()
asyncio.run(main())
