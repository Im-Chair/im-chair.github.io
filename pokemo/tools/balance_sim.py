import random,sys
R,C=5,6
def groups(g):
    m=[[0]*C for _ in range(R)]
    for r in range(R):
        run=1
        for c in range(1,C+1):
            if c<C and g[r][c]==g[r][c-1]: run+=1
            else:
                if run>=3:
                    for k in range(1,run+1): m[r][c-k]=1
                run=1
    for c in range(C):
        run=1
        for r in range(1,R+1):
            if r<R and g[r][c]==g[r-1][c]: run+=1
            else:
                if run>=3:
                    for k in range(1,run+1): m[r-k][c]=1
                run=1
    return m
def comps(g,m):
    seen=set();out=[]
    for r in range(R):
        for c in range(C):
            if m[r][c] and (r,c) not in seen:
                t=g[r][c];st=[(r,c)];seen.add((r,c));n=0
                while st:
                    a,b=st.pop();n+=1
                    for da,db in((1,0),(-1,0),(0,1),(0,-1)):
                        x,y=a+da,b+db
                        if 0<=x<R and 0<=y<C and m[x][y] and g[x][y]==t and (x,y) not in seen: seen.add((x,y));st.append((x,y))
                out.append((t,n))
    return out
def resolve(g,w):
    res=[]
    while True:
        m=groups(g)
        if not any(any(r) for r in m):break
        res.append(comps(g,m))
        for c in range(C):
            col=[g[r][c] for r in range(R) if not m[r][c]]
            col=[random.choices(range(6),w)[0] for _ in range(R-len(col))]+col
            for r in range(R): g[r][c]=col[r]
    return res
def walk(g,L):
    r,c=random.randrange(R),random.randrange(C)
    for _ in range(L):
        dr,dc=random.choice(((1,0),(-1,0),(0,1),(0,-1)))
        x,y=r+dr,c+dc
        if 0<=x<R and 0<=y<C: g[r][c],g[x][y]=g[x][y],g[r][c];r,c=x,y
def evalres(res,team,atk):
    allg=[x for step in res for x in step];combo=len(allg);dmg=0;ch=0
    for t,n in allg:
        if t==5:ch+=n
        else: dmg+=atk*(1+.25*(n-3))*team.count(t)
    return dmg*(1+.25*(combo-1)),ch
def battle(nteam,pol,knobs,cands=40,always_fail=False):
    cap_pct,cw,need=knobs
    team=[0,1,2,3,4][:nteam]
    w=[1]*5+[cw]
    for a in team:w[a]=1.35
    atk=25;thp=112*nteam;emax=297;ehp=emax;ecd=3;ecdmax=3;eatk=16
    g=[[random.choices(range(6),w)[0] for _ in range(C)] for _ in range(R)]
    while True:
        m=groups(g)
        if not any(any(r) for r in m):break
        resolve(g,w)
    A,Bc=pol;cap=emax*cap_pct/100;charm=0;rolls=0;turn=0
    while turn<80:
        turn+=1
        best=None
        for _ in range(cands):
            h=[row[:] for row in g];walk(h,random.randint(5,16))
            # hash state before resolve: need result of resolve on h (random refill) -> resolve in place
            res=resolve(h,w);d,ch=evalres(res,team,atk)
            sc=A*min(d,cap)/cap+Bc*ch
            if best is None or sc>best[0]:best=(sc,h,d,ch)
        _,g,d,ch=best
        d=min(d,cap);ehp-=d;charm+=ch
        if ehp<=0:return rolls,False,turn,0
        while charm>=need:
            charm-=need;rolls+=1
            if always_fail:continue
            p=min(.95,max(.03,.6*(1+(1-ehp/emax)*1.5)*(1+(5-3)*.06)))
            if (not always_fail) and random.random()<p:return rolls,True,turn,1-ehp/emax
        ecd-=1
        if ecd<=0:
            thp-=eatk*random.uniform(.85,1.15);ecd=ecdmax
            if thp<=0:return rolls,False,turn,0
    return rolls,False,turn,0
if __name__=='__main__':
    knobs=tuple(float(x) for x in sys.argv[1:4]) if len(sys.argv)>3 else (12,1.0,30)
    N=int(sys.argv[4]) if len(sys.argv)>4 else 40
    pols={'damage':(1,0),'balanced':(1,.12),'charm':(.4,.3)}
    print('knobs cap%/cw/need',knobs)
    for nt in(1,2,3):
        for pn,pol in pols.items():
            rs=[battle(nt,pol,knobs) for _ in range(N)]
            print(f'  team={nt} {pn:8s} rolls/battle={sum(r[0] for r in rs)/N:.2f} P(>=1 roll)={sum(r[0]>=1 for r in rs)/N:.2f} P(>=2)={sum(r[0]>=2 for r in rs)/N:.2f} capture={sum(r[1] for r in rs)/N:.2f} turns={sum(r[2] for r in rs)/N:.1f}')
