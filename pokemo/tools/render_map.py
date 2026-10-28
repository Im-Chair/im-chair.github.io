# 用遊戲本身的繪圖程式輸出整張地圖（tools 用，不是遊戲的一部分）
import asyncio,base64,sys,os
from playwright.async_api import async_playwright
MID=sys.argv[1];OUT=sys.argv[2];TSZ=int(sys.argv[3]) if len(sys.argv)>3 else 32
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+os.path.abspath(os.path.dirname(__file__)+'/../dist/index.html'));await pg.wait_for_timeout(1200)
        d=await pg.evaluate(f"""()=>{{P=freshPlayer();P.flags={{intro:1}};loadMap('{MID}');P.x=CUR.spawn.x;P.y=CUR.spawn.y;
          TS={TSZ};mdpr=1;mw=MW*TS;mh=MH*TS;mapCv.style.width=mw+'px';mapCv.style.height=mh+'px';mapCv.width=mw;mapCv.height=mh;
          drawMap(1000);return mapCv.toDataURL('image/png')}}""")
        open(OUT,'wb').write(base64.b64decode(d.split(',')[1]));print(errs);await b.close()
asyncio.run(main())
