import sys,itertools
from multiprocessing import Pool
import sim
def run(args):
    knobs,nt,pn=args
    pols={'damage':(1,0),'balanced':(1,.12),'charm':(.4,.3)}
    N=24
    rs=[sim.battle(nt,pols[pn],knobs,cands=30,always_fail=True) for _ in range(N)]
    return knobs,nt,pn,sum(r[0] for r in rs)/N,sum(r[0]>=1 for r in rs)/N,sum(r[2] for r in rs)/N
if __name__=='__main__':
    ks=[(c,w,n) for c in(9,12) for w in(1.2,1.4) for n in(16,20)]
    jobs=[(k,nt,pn) for k in ks for nt in(1,2,3) for pn in('damage','balanced','charm')]
    with Pool() as p:res=p.map(run,jobs,chunksize=2)
    d={}
    for k,nt,pn,rl,p1,t in res:d[(k,nt,pn)]=(rl,p1,t)
    print('cap cw need | balanced triggers (1/2/3 mon) | charm triggers (1/2/3) | turns')
    for k in ks:
        print(k,' | '.join(' '.join(f'{d[(k,nt,pn)][0]:.2f}' for nt in(1,2,3)) for pn in('damage','balanced','charm')),'|',' '.join(f'{d[(k,nt,"charm")][2]:.0f}' for nt in(1,2,3)))
