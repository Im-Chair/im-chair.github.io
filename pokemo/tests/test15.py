import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(ROOT+'/tests/shots',exist_ok=True)
import asyncio,sys
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
        print(await pg.evaluate("JSON.stringify(skillList(SP[P.team[0].id]).map(x=>x[0]+SKILLS[x[1]].n))"))
        # all species have 5 unique skills
        print(await pg.evaluate("JSON.stringify(Object.values(SP).filter(s=>s.head!==undefined||s.line).map(s=>new Set(skillList(s).map(x=>x[1])).size).reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{}))"))
        # story gate
        await pg.evaluate("()=>{G.lock=true;}")
        r=await pg.evaluate("async()=>{const o=[];P.flags={};const n=NPCS.find(x=>x.id==='guard');window.say=async l=>{o.push(JSON.stringify(l).slice(0,40))};await interactNpc(n);return o.join('|')+' g='+!!P.flags.guardDone}")
        print('guard blocked:',r)
        # battle skills
        await pg.evaluate("()=>{G.lock=false;P.team[0].lv=12;P.x=7.5;P.y=22.5;startWild()}")
        await pg.wait_for_selector('#sBattle.on');await pg.wait_for_timeout(2200)
        await pg.screenshot(path=ROOT+'/tests/shots/skill_b.png')
        print(await pg.evaluate("JSON.stringify({sk:B.skch,id:skillOf(P.team[0])})"))
        for cdv in range(2):
            await pg.evaluate("()=>{B.skch=B.skch.map(()=>999);renderBattle()}")
            print(await pg.evaluate("(async()=>{const id=skillOf(P.team[0]);const before=[B.enemy.hp,B.teamHp,grid.flat().filter(o=>o.t===5).length];await useSkill(0);return JSON.stringify([id,before,[B.enemy.hp,B.teamHp,grid.flat().filter(o=>o.t===5).length],B.skch])})()"))
            await pg.evaluate("()=>{P.team[0].sk=skillList(SP[P.team[0].id])[1][1]}")
        # test every skill type
        res=await pg.evaluate("""(async()=>{const out=[];for(const id of Object.keys(SKILLS)){P.team[0].lv=12;window.skillOf=()=>id;B.busy=false;B.over=false;B.enemy.hp=B.enemy.maxHp;B.teamHp=Math.round(B.teamMax*.5);B.skch=B.skch.map(()=>999);
          const ch0=grid.flat().filter(o=>o.t===5).length;const b0=[B.enemy.hp,B.teamHp];try{await useSkill(0)}catch(e){out.push(id+' ERR '+e.message);continue}
          out.push(id+':'+(B.enemy.hp-b0[0])+'/'+(B.teamHp-b0[1])+'/c'+(grid.flat().filter(o=>o.t===5).length-ch0)+' amp'+B.amp+' lure'+B.lure+' shd'+B.shield+' ecd'+B.enemy.cd)}return out.join(' ')})()""")
        print(res)
        print(errs);await b.close()
asyncio.run(main())
