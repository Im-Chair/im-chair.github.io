# 把 docs 的 .md 轉成給人看的 PDF（需要：pip install markdown playwright）
# 用法：python3 tools/md2pdf.py
import os,asyncio,markdown
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS=[('docs/GAME_PLAN.md','遊戲規劃書 v1.11.pdf'),('docs/STORY.md','《珠界：歸一之子》故事設定集 v1.11.pdf')]
CSS="""body{font-family:'Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif;font-size:12pt;line-height:1.65;color:#1b1f2a;margin:0}
h1{font-size:22pt;border-bottom:3px solid #3d5fa8;padding-bottom:6px}h2{font-size:17pt;margin-top:26px;border-bottom:1px solid #c5cbe0;padding-bottom:4px}h3{font-size:14pt;margin-top:20px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12pt;page-break-inside:auto}tr{page-break-inside:avoid}
th,td{border:1px solid #b9c0d6;padding:5px 7px;vertical-align:top}th{background:#eef1f8}
code{font-family:'Noto Sans Mono CJK TC',monospace;font-size:11pt;background:#f1f3f8;padding:0 3px;border-radius:3px}
blockquote{border-left:4px solid #9fb0d8;margin:8px 0;padding:2px 12px;color:#3a4256;background:#f6f8fc}
img{max-width:100%;display:block;margin:10px auto}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page()
        for src,out in JOBS:
            md=open(os.path.join(ROOT,src),encoding='utf-8').read()
            body=markdown.markdown(md,extensions=['tables','fenced_code'])
            html=f"<!doctype html><html lang='zh-Hant'><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"
            tmp=os.path.join(ROOT,os.path.dirname(src),'_tmp_print.html');open(tmp,'w',encoding='utf-8').write(html)
            await pg.goto('file://'+tmp);await pg.wait_for_timeout(300)
            await pg.pdf(path=os.path.join(ROOT,out),format='A4',margin={'top':'16mm','bottom':'16mm','left':'15mm','right':'15mm'},print_background=True,
                         display_header_footer=True,header_template='<span></span>',footer_template="<div style='font-size:9pt;width:100%;text-align:center;color:#888'><span class='pageNumber'></span> / <span class='totalPages'></span></div>")
            os.remove(tmp);print('輸出',out)
        await b.close()
asyncio.run(main())
