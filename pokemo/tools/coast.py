# 產生碎鏡海岸 ASCII 地圖（30×40）
W,H=30,40
g=[['.']*W for _ in range(H)]
def put(x,y,c):
    if 0<=x<W and 0<=y<H:g[y][x]=c
def rect(x1,y1,x2,y2,c):
    for y in range(y1,y2+1):
        for x in range(x1,x2+1):put(x,y,c)
h=lambda x,y:((x*73856093)^(y*19349663))%100
def shore(y):
    if y<=11:return 20
    if 14<=y<=16:return 27
    if y<=24:return 23
    return 24
for y in range(H):
    rect(shore(y),y,W-1,y,'~')
    if y>=12:rect(shore(y)-2,y,shore(y)-1,y,'=')        # 沙灘
rect(0,0,19,1,'#');rect(0,0,1,H-1,'#')
rect(0,H-2,W-1,H-1,'#')
# 禁區（北）
rect(2,2,19,11,'=');rect(2,2,4,11,'r');rect(7,3,16,7,'~');rect(17,4,19,7,'~')   # 內灣接海
rect(5,2,6,2,'r')
# 封鎖牆
rect(2,12,shore(12)-1,12,'#');put(15,12,'G');put(2,13,'r')
# 主路
rect(14,13,15,37,'=');rect(14,38,15,39,'=')
# 西側岩岸：石頭＋高草
for y in range(14,25):
    for x in range(2,9):
        v=h(x*3+1,y*7+2)
        g[y][x]='r' if v<22 else (',' if v<80 else '.')
# 中央沙丘草叢、東側近海草叢
rect(9,15,12,21,',');rect(17,17,20,23,',')
for (x,y) in [(9,15),(12,21),(17,17),(20,23)]:put(x,y,'.')
# 岩岸山道（西側出口，往赤燼荒原；落石擋住）
rect(0,14,3,15,'=');put(1,14,'r');put(1,15,'r');put(2,13,'S')
# 燈塔岬
rect(16,15,26,15,'=');put(26,14,'S')
# 漁村（南）
rect(16,31,23,32,'=');rect(24,31,27,32,'d')   # 往碼頭的路＋碼頭木棧道（伸進海裡）
put(17,33,'F');put(13,36,'S');put(21,29,'S')
for (x,y) in [(3,34),(11,27),(20,35),(8,26),(21,26)]:put(x,y,'*')
for (x,y) in [(10,25),(19,25)]:put(x,y,'b')
rows=[''.join(r) for r in g]
assert all(len(r)==W for r in rows) and len(rows)==H
print('\n'.join(f"   '{r}'," for r in rows))
