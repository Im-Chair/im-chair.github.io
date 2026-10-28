import json
# 每條進化線：(代號, 中文名[3], 英文外觀[3], 星數[3], 活動區域, 三圍倍率[hp,atk,rec])
W=[
 ('A',['泡泡獺','浪花獺','滄浪獺王'],['small otter pup covered in soap-bubble foam, big round eyes','sleek otter riding a swirl of wave, white foam mane','majestic sea-otter king wearing pearl armor and a crown of water arcs'],[2,4,6],[1,2],[1,1,1]),
 ('B',['水母芽','月暈水母','星海水母后'],['tiny translucent jellyfish with a sprout on top, cute face','glowing moon-halo jellyfish with long ribbon tentacles','queen jellyfish with starry transparent veil and coral crown'],[2,4,6],[2],[.9,1.2,1]),
 ('C',['苔甲龜','珊瑚龜','深海守護龜'],['baby turtle with a mossy shell','turtle with coral growing on its shell','giant ancient sea turtle with glowing rune shell and a tiny temple on its back'],[2,4,6],[2,6],[1.2,.9,.9]),
 ('D',['鰭仔','飛鰭魚龍','瀾海龍'],['tiny blue fish with oversized fins','flying-fish dragon with wing-like fins','regal sea dragon with golden horns and a flowing white beard'],[2,4,6],[2,8],[1,1.1,1]),
 ('E',['雪團靈','霜花精','冰河女王'],['round snowball spirit with tiny blue eyes','frost fairy with ice-flower petals','ice queen spirit with crystalline gown and glacier crown'],[2,4,6],[6],[.95,1,1.2]),
 ('F',['沙貝仔','珍珠貝','虹彩巨貝'],['baby clam peeking out of a sand-colored shell','pink clam holding a glowing pearl','giant iridescent shell guardian with a pearl cluster and seaweed tentacles'],[3,5,7],[2,4],[1.05,1.05,.95]),
]
WS=[('潮汐精靈','tiny humanoid water sprite holding a crescent-moon wand',5),('深淵鮟鱇','deep-sea anglerfish with a glowing lantern lure',5),('海馬使者','elegant seahorse knight holding a trident',6),('暴風鯨·歐申','colossal legendary storm whale with lightning clouds on its back',7)]
F=[
 ('A',['火苗蜥','熔尾蜥','炎獄蜥龍'],['baby lizard with a small flame on its tail tip','lizard with lava-crack scales and a flaming tail','large fire drake with magma armor and wings'],[2,4,6],[1,3],[1,1,1]),
 ('B',['燼雛','赤羽鳥','朱焰鳳'],['ember chick with ash-gray down and glowing orange tips','red-feathered bird with trailing fire','vermilion phoenix with long flame tail feathers'],[2,4,6],[3],[.9,1.2,1]),
 ('C',['熔岩團','岩漿石偶','火山巨像'],['small blob of molten lava with eyes and rock bits','stone golem with glowing magma veins','volcano-shaped titan with an erupting crater head'],[2,4,6],[3],[1.2,.95,.85]),
 ('D',['焰尾狐','緋焰狐','煌焰九尾'],['fox kit with a flame-tipped tail','red fox with two fiery tails and ember markings','majestic nine-tailed fire fox with golden flames'],[2,4,6],[1,3],[.95,1.1,1]),
 ('E',['燭火靈','鬼火燈籠','煉獄燈王'],['candle-shaped spirit with a flame head','floating paper-lantern ghost with orange flame','giant dark-iron lamp king with a burning chandelier crown'],[2,4,6],[7],[1,1,1.1]),
 ('F',['炭蟲','熾甲蟲','赤焰蠍王'],['charcoal beetle larva with glowing cracks','armored beetle with a red-hot shell','scorpion king with flaming stinger and obsidian armor'],[3,5,7],[3],[1.05,1.1,.9]),
]
FS=[('火精靈','small humanoid flame sprite dancing',5),('烈日獅','lion with a mane of sun rays',6),('灰燼騎士','knight in charred armor holding an ember sword',6),('炎龍·赤霄','legendary crimson dragon engulfed in flames, wings spread wide',7)]
D=[
 ('A',['嫩芽鹿','青角鹿','世界樹聖鹿'],['baby deer with sprouts for antlers','deer with leafy antlers and moss on its back','sacred stag whose antlers are a glowing tree with petals'],[2,4,6],[1,4],[1,1,1]),
 ('B',['蘑菇仔','毒傘菇','菇王'],['cute mushroom creature with a red cap and white dots','purple spotted mushroom wizard with a spore cloud','giant mushroom king with a crown cap and tiny mushroom vassals'],[2,4,6],[1,4],[1.15,.9,1]),
 ('C',['樹苗精','老樹精','古樹魔王'],['walking sapling with two leaves and tiny roots','ancient treant with a face in its bark','colossal gnarled tree demon with a glowing green core'],[2,4,6],[4],[1.2,1,.8]),
 ('D',['花蕾靈','綻花精','百花女皇'],['flower bud fairy with closed petals','blooming flower dryad with a petal skirt','flower queen on a giant bloom throne surrounded by butterflies'],[2,4,6],[1],[.9,1,1.2]),
 ('E',['藤蔓蛇','荊棘蛇','森蛇王'],['small vine snake with a leaf tail','thorny rose-vine serpent with blossoms','huge forest serpent coiled around a tree with a thorn crown'],[2,4,6],[4],[1,1.15,.9]),
 ('F',['葉蟲','翠繭','森羽蝶'],['green caterpillar wearing leaf armor','jade cocoon with glowing eyes inside','giant emerald butterfly with leaf-vein wings'],[3,5,7],[1,4],[1,.95,1.1]),
]
DS=[('森林精靈','elf-like forest sprite with a flower hat',5),('風信兔','wind-sailing rabbit with seed-pod ears',5),('苔石熊','mossy stone bear with a small flower garden on its back',6),('世界樹之靈·艾爾','legendary guardian spirit of the world tree with glowing branches',7)]
L=[
 ('A',['光暈兔','聖耳兔','輝月兔王'],['rabbit with a soft halo glow','rabbit with long glowing holy ears','regal moon rabbit king with a crescent staff'],[2,4,6],[1,5],[1,1,1]),
 ('B',['光雛','聖光梟','曙光神梟'],['fluffy golden chick with a tiny halo','golden owl with radiant wings','dawn owl god with sunburst wings'],[2,4,6],[5],[.9,1,1.3]),
 ('C',['光鬃獅仔','星尾獅','日冕獅王'],['lion cub with a golden mane tuft','lion with a star-tipped tail','lion king with a solar corona mane'],[2,4,6],[5],[.95,1.15,1]),
 ('D',['光羽童','守護天使','熾翼天使'],['cherub child with tiny wings','armored guardian angel holding a shield','six-winged seraph with a flaming sword'],[2,4,6],[5,7],[1,1.1,1]),
 ('E',['光晶塊','稜鏡精','虹光水晶龍'],['floating crystal fragment with a face','prism spirit splitting light into rainbows','rainbow crystal dragon'],[2,4,6],[6],[1.1,1,1]),
 ('F',['雲絨羊','彩雲獨角獸','星河天馬'],['fluffy cloud lamb','unicorn pony made of soft clouds','majestic starry pegasus'],[3,5,7],[5],[1,1,1.15]),
]
LS=[('星光精靈','tiny star-shaped light sprite',5),('聖杯騎士','paladin knight with a chalice-shaped shield',6),('白金麒麟','white-gold qilin with flame-like clouds',6),('創世光龍·露米','legendary creation light dragon with radiant wings',7)]
K=[
 ('A',['影貓','夜行貓','冥影貓王'],['shadow kitten with a violet flame tail','sleek black cat with glowing eyes and star patterns','demon cat king with a crown of shadow flames'],[2,4,6],[4,7],[.95,1.1,1]),
 ('B',['夜蝠','暗翼蝠','夜幕飛龍'],['small bat with huge ears','bat with violet shimmering wing membranes','night wyvern with starry wings'],[2,4,6],[7],[.9,1.15,1]),
 ('C',['骨仔','幽冥骷髏','骸骨魔龍'],['tiny skeleton with an oversized skull','skeleton knight with ghost-flame eyes','bone dragon burning with purple soulfire'],[2,4,6],[7],[1.15,.9,1]),
 ('D',['小幽靈','怨靈','無面王'],['small white-and-purple ghost','grieving wraith wrapped in chains','faceless ghost king in tattered royal robes'],[2,4,6],[7,8],[1,1,1.15]),
 ('E',['影狼崽','暗瞳狼','噬月狼王'],['shadow wolf pup','dark wolf with luminous eyes','giant wolf king devouring the moon'],[2,4,6],[4],[1,1.2,.9]),
 ('F',['小惡魔','魔界使者','深淵領主'],['imp with a tiny trident','demon envoy in a robe with curved horns','abyssal lord with towering horns and a long cape'],[3,5,7],[8],[1,1.1,1]),
]
KS=[('夢魘精靈','nightmare sprite wearing a sleepy mask',5),('暗影刺客','hooded shadow assassin with twin daggers',6),('鐮刀小死神','little reaper holding an oversized scythe',6),('終焉魔龍·維爾','legendary dark dragon with violet void flames',7)]
ATT=[('water','水',W,WS),('fire','火',F,FS),('wood','木',D,DS),('light','光',L,LS),('dark','暗',K,KS)]
LET='ABCDEF'
def stats(r,s):
    import math
    return [round(80*(r-1)**.6*s[0]),round(16*(r-1)**.6*s[1]),round(9*(r-1)**.5*s[2])]
PAT={'water':['c3','c2s','c2s','c3','sc2','none'],'fire':['c3','c3','c2s','c2s','sc2','none'],'wood':['c3','none','c2s','c3','sc2','c3'],'light':['c3','c2s','c3','c2s','none','c3'],'dark':['c3','c2s','c2s','c3','c2s','sc2']}
roster=[];sheets={}
for ai,(ak,an,lines,singles) in enumerate(ATT):
    cells=[]
    for li,(code,names,descs,stars,zones,mul) in enumerate(lines):
        row=li//2; c0=(li%2)*3
        ids=[f'{ak}{code}{k+1}' for k in range(3)]
        pat=PAT[ak][li]
        nxt={'c3':{0:1,1:2},'c2s':{0:1},'sc2':{1:2},'none':{}}[pat]
        evolved=set(nxt.values())
        for k in range(3):
            r=stars[k]
            evo=None
            if k in nxt: evo=16 if (pat=='c3' and k==0) else 32 if pat=='c3' else 22
            head=k not in evolved
            zone=[min(8,z+k) for z in zones] if head else []
            roster.append(dict(id=ids[k],name=names[k],attr=ai,rar=r,line=ak+code,pattern=pat,stage=k+1,head=head,row=row,col=c0+k,
                zone=zone,next=ids[nxt[k]] if k in nxt else None,evo=evo,
                st=stats(r,mul),desc=descs[k]))
            cells.append((row,c0+k,names[k],descs[k]))
    for si,(nm,ds,r) in enumerate(singles):
        roster.append(dict(id=f'{ak}S{si+1}',name=nm,attr=ai,rar=r,line=ak+'S',pattern='none',stage=1,head=True,row=3,col=si,zone=[[3,5,6,8][si]],next=None,evo=None,st=stats(r,[1.1,1.15,1.1]),desc=ds))
        cells.append((3,si,nm,ds))
    cells.append((3,4,f'{an}之精靈','a small glowing orb-shaped elemental spirit with a cute face, element: '+ak))
    cells.append((3,5,f'{an}之結晶','a cluster of glowing crystals, element: '+ak))
    sheets[ak]=cells
json.dump(roster,open('/home/claude/orb-rpg/monsters/roster.json','w'),ensure_ascii=False,indent=1)
print(len(roster),'monsters; evolving:',sum(1 for m in roster if m['next']),'; standalone:',sum(1 for m in roster if not m['next'] and m['head']))
STYLE=("Cute collectible-monster game art, Japanese anime illustrated style, clean outlines, soft cel shading, vivid colors, "
"every creature is a full-body front-facing 3/4 view with a charming face, same style and same size as the reference image. ")
md=["# 怪物出圖指南（5 張圖，每張 24 格）\n",
"## 共通規格\n",
"- 每個屬性一張圖，**6 欄 × 4 列、共 24 格**，每格一隻，格與格之間要留白，不要邊框、不要文字。",
"- 背景請用純洋紅色（#FF00FF），我會去背；不要在背景上放陰影或地面。",
"- 每格的怪物要**完整放在格子內**，大小接近，不要超出格子。",
"- 風格請附上你原本的怪物圖（例如 s-fire.png）當參考，一起送出，並說「same style and size as the reference」。",
"- 若 ChatGPT 一次畫 24 格會崩，可以拆成「上半（第 1～2 列，12 格）」和「下半（第 3～4 列，12 格）」兩張，我會自己接起來；請照順序命名，例如 `water_上.png`、`water_下.png`。",
"- 同一條進化線的三階要看得出是同一隻（顏色、特徵延續），第 1 階小、第 2 階中、第 3 階大且華麗。\n",
"## 通用開頭（每張都先貼這段）\n","```\n"+STYLE+"Draw a 6-column by 4-row grid sprite sheet on a flat solid magenta (#FF00FF) background. Each cell contains exactly one creature, evenly spaced with generous margins, no borders, no text, no shadows. Cells are listed row by row, left to right.\n```\n"]
for ak,an,lines,singles in ATT:
    md.append(f"## {an}屬性（{ak}.png）\n")
    md.append("```\nElement theme: "+{'water':'water, ocean, ice','fire':'fire, lava, ember','wood':'forest, plants, flowers','light':'holy light, gold, white','dark':'shadow, purple, undead'}[ak]+".\n")
    for r in range(4):
        row=[x for x in sheets[ak] if x[0]==r]
        row.sort(key=lambda x:x[1])
        md.append(f"Row {r+1}: "+" | ".join(f"[{x[1]+1}] {x[3]}" for x in row))
    md.append("```\n")
    md.append("| 格 | 名稱 | 星 |\n|---|---|---|")
    for m in [m for m in roster if m['attr']==[a[0] for a in ATT].index(ak)]:
        md.append(f"| 第{m['row']+1}列第{m['col']+1}格 | {m['name']} | ★{m['rar']} |")
    md.append("")
open('/home/claude/orb-rpg/monsters/怪物出圖指南.md','w',encoding='utf-8').write("\n".join(md))
print('guide ok')
