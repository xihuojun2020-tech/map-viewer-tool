"""Original low-poly category models. No archaeological dimensions are implied."""
import json
import math
from pathlib import Path
import struct

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/models'
COLORS={'earth':'aa8259','roof':'424d53','wood':'70493a','plaster':'d7c4a2','stone':'737e7d',
        'road':'bca37a','skin':'b78b68','cloth':'7e7061','blue':'496373','iron':'49565b',
        'red':'904739','yellow':'d9b948','leather':'765b43','horse':'6b4d36','white':'ded4ba'}

class Model:
    def __init__(self):self.faces={k:[] for k in COLORS}
    def tri(self,c,a,b,d):self.faces[c].extend([a,b,d])
    def poly(self,c,p):
        for i in range(1,len(p)-1):self.tri(c,p[0],p[i],p[i+1])
    def box(self,x,y,z,w,h,d,c):
        a,b=x-w/2,x+w/2;l,r=z-d/2,z+d/2;t=y+h
        for p in [[(a,y,l),(a,y,r),(b,y,r),(b,y,l)],[(a,t,l),(b,t,l),(b,t,r),(a,t,r)],
                  [(a,y,l),(b,y,l),(b,t,l),(a,t,l)],[(b,y,r),(a,y,r),(a,t,r),(b,t,r)],
                  [(a,y,r),(a,y,l),(a,t,l),(a,t,r)],[(b,y,l),(b,y,r),(b,t,r),(b,t,l)]]:self.poly(c,p)
    def rod(self,a,b,r,c):
        axis=[b[i]-a[i] for i in range(3)];length=math.sqrt(sum(v*v for v in axis));axis=[v/length for v in axis]
        ref=[0,1,0] if abs(axis[1])<.9 else [1,0,0]
        u=[axis[1]*ref[2]-axis[2]*ref[1],axis[2]*ref[0]-axis[0]*ref[2],axis[0]*ref[1]-axis[1]*ref[0]]
        size=math.sqrt(sum(v*v for v in u));u=[v/size for v in u];v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]]
        rings=[[(p[0]+r*(u[0]*math.cos(i*math.pi/4)+v[0]*math.sin(i*math.pi/4)),p[1]+r*(u[1]*math.cos(i*math.pi/4)+v[1]*math.sin(i*math.pi/4)),p[2]+r*(u[2]*math.cos(i*math.pi/4)+v[2]*math.sin(i*math.pi/4))) for i in range(8)]for p in [a,b]]
        self.poly(c,list(reversed(rings[0])));self.poly(c,rings[1])
        for i in range(8):j=(i+1)%8;self.poly(c,[rings[0][i],rings[0][j],rings[1][j],rings[1][i]])
    def roof(self,x,y,z,w,d,h):
        a=(x-w/2,y,z-d/2);b=(x+w/2,y,z-d/2);c=(x+w/2,y,z+d/2);e=(x-w/2,y,z+d/2)
        u=(x-w*.28,y+h,z);v=(x+w*.28,y+h,z)
        for p in [[a,u,v,b],[b,v,c],[c,v,u,e],[e,u,a]]:self.poly('roof',p)
        self.rod(u,v,.06,'roof')
    def house(self,x,z,w,d,h,y=0):
        self.box(x,y,z,w,h,d,'plaster')
        for dx in [-w*.43,w*.43]:self.box(x+dx,y,z-d*.51,.1,h,.12,'wood')
        self.box(x,y,z-d*.51,w*.3,h*.7,.05,'wood');self.roof(x,y+h,z,w+.4,d+.4,h*.4)
    def write(self,id):
        blob=bytearray();views=[];access=[];primitives=[];mats=[];count=0
        for c,pts in self.faces.items():
            if not pts:continue
            normals=[]
            for i in range(0,len(pts),3):
                a,b,d=pts[i:i+3];u=[b[j]-a[j]for j in range(3)];v=[d[j]-a[j]for j in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=math.sqrt(sum(v*v for v in n));normals.extend([[v/length for v in n]]*3)
            ids=[]
            for values in [pts,normals]:
                flat=[v for p in values for v in p];start=len(blob);blob.extend(struct.pack('<'+'f'*len(flat),*flat));views.append(dict(buffer=0,byteOffset=start,byteLength=len(flat)*4,target=34962));item=dict(bufferView=len(views)-1,componentType=5126,count=len(pts),type='VEC3')
                if values is pts:item.update(min=[min(p[j] for p in pts)for j in range(3)],max=[max(p[j] for p in pts)for j in range(3)])
                access.append(item);ids.append(len(access)-1)
            rgb=[int(COLORS[c][i:i+2],16)/255 for i in [0,2,4]];mats.append(dict(name=c,pbrMetallicRoughness=dict(baseColorFactor=rgb+[1],metallicFactor=.12 if c=='iron' else 0,roughnessFactor=.87),doubleSided=True))
            primitives.append(dict(attributes=dict(POSITION=ids[0],NORMAL=ids[1]),material=len(mats)-1));count+=len(pts)//3
        doc=dict(asset=dict(version='2.0',generator='三国阅读地图：程序化类别模型'),scene=0,scenes=[dict(nodes=[0])],nodes=[dict(mesh=0)],meshes=[dict(primitives=primitives)],materials=mats,accessors=access,bufferViews=views,buffers=[dict(byteLength=len(blob))])
        raw=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);blob+=b'\0'*((-len(blob))%4)
        output=struct.pack('<III',0x46546c67,2,28+len(raw)+len(blob))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(blob),0x004e4942)+blob
        (OUT/f'{id}.glb').write_bytes(output);return {'triangles':count,'bytes':len(output)}

def city(tier):
    m=Model();r=[4,5.2,6.5][tier];height=[1,1.25,1.6][tier]
    m.box(0,-.18,0,r*2+.7,.18,r*2+.7,'earth');m.box(0,.01,0,r*2,.03,.65,'road');m.box(0,.01,0,.65,.03,r*2,'road')
    for z in [-r,r]:
        for x in [-(r+1)/2,(r+1)/2]:m.box(x,0,z,r-1,height,.35,'earth')
        m.house(0,z,2,.9,1,height);m.box(0,0,z,1,height,.37,'wood')
    for x in [-r,r]:m.box(x,0,0,.35,height,2*r,'earth')
    for x in [-r,r]:
        for z in [-r,r]:m.house(x,z,.9,.9,.6,height)
    m.house(0,-r*.43,2.2+tier,1.7+tier*.35,1.3+tier*.35)
    for x in [-r*.55,r*.55]:
        for z in [-r*.35,r*.25,r*.65]:m.house(x,z,1.3,1,.65)
    if tier==2:
        for x in [-1.4,1.4]:m.house(x,0,.7,.7,2.5)
        m.box(0,0,-2.6,7,.22,4,'stone')
    return m

def soldier(m,x,z,kind,y=0):
    c='yellow' if kind=='huangjin' else 'red' if kind=='danyang' else 'blue'
    armor=kind in ['infantry','xianzhen','crossbow','cavalry']
    for dx in [-.15,.15]:m.rod((x+dx,y+.13,z),(x+dx,y+.85,z),.11,'cloth');m.box(x+dx,y,z+.08,.24,.16,.4,'leather')
    m.box(x,y+.8,z,.65,.75,.38,'iron' if armor else c);m.box(x,y+.72,z,.76,.14,.46,'leather')
    for dx in [-.43,.43]:m.rod((x+dx*.8,y+1.4,z),(x+dx,y+.95,z+.15),.11,c)
    m.rod((x,y+1.58,z),(x,y+1.94,z),.22,'skin');m.box(x,y+1.9,z,.46,.17,.45,'iron' if armor else 'cloth')
    if armor:
        for h in [1,1.18,1.36]:m.box(x,y+h,z+.202,.6,.045,.03,'stone')
    if kind=='huangjin':
        m.box(x,y+1.78,z,.48,.13,.47,'yellow');m.box(x+.18,y+1.3,z-.25,.13,.5,.06,'yellow')
    if kind=='danyang':m.box(x,y+1.9,z,.46,.12,.45,'red');m.rod((x+.44,y+.9,z+.1),(x+.75,y+1.95,z+.15),.065,'iron')
    elif kind=='archer':
        ps=[(x+.52,y+.75+i*.22,z+.1+.24*math.sin(i*math.pi/5))for i in range(6)]
        for a,b in zip(ps,ps[1:]):m.rod(a,b,.045,'wood')
        m.rod(ps[0],ps[-1],.012,'white');m.rod((x-.2,y+1.4,z-.3),(x-.2,y+2.1,z-.3),.09,'leather')
    elif kind=='crossbow':
        m.box(x,y+1.1,z+.55,.1,.12,.85,'wood');m.rod((x-.5,y+1.15,z+.8),(x+.5,y+1.15,z+.8),.06,'wood');m.rod((x-.5,y+1.15,z+.8),(x,y+1.15,z+.4),.012,'white');m.rod((x+.5,y+1.15,z+.8),(x,y+1.15,z+.4),.012,'white')
    else:
        m.rod((x+.5,y+.1,z+.2),(x+.5,y+2.8,z+.2),.035,'wood');m.rod((x+.5,y+2.8,z+.2),(x+.5,y+3.1,z+.2),.055,'iron')
        if kind in ['infantry','xianzhen']:
            m.box(x-.46,y+.65,z+.37,.55,.85,.1,'iron' if kind=='xianzhen' else 'leather');m.box(x-.46,y+.7,z+.43,.07,.75,.03,'stone')

def troops(kind):
    m=Model()
    if kind=='cavalry':
        m.box(0,.85,0,.75,.7,1.65,'horse')
        for x in [-.27,.27]:
            for z in [-.57,.57]:m.rod((x,.08,z),(x,1,z),.1,'horse');m.box(x,0,z+.04,.22,.12,.3,'iron')
        m.rod((0,1.1,.55),(0,2,1),.25,'horse');m.box(0,1.85,1.16,.4,.35,.65,'horse')
        for x in [-.13,.13]:m.rod((x,2.1,1),(x,2.4,.98),.065,'horse')
        m.rod((0,1.3,-.8),(0,.5,-1.12),.08,'roof');soldier(m,0,0,kind,1.1)
    else:
        positions=[(-.6,0),(.6,0),(0,-1)] if kind=='xianzhen' else [(0,0)]
        for x,z in positions:soldier(m,x,z,kind)
        if kind=='xianzhen':m.rod((-.85,0,-1),(-.85,3.7,-1),.045,'wood');m.box(-.5,2.8,-1,.65,.65,.025,'red')
    return m

def main():
    OUT.mkdir(exist_ok=True);assets=[]
    for tier,(id,name) in enumerate([('city-county','县城'),('city-commandery','郡国治所'),('city-capital','都城／京畿核心城')]):
        # Dimensions express category silhouettes only.
        model=city(tier);assets.append(dict(id=id,name=name,kind='city',**model.write(id)))
    for id,name in [('infantry','步卒'),('archer','弓手'),('crossbow','弩手'),('cavalry','骑兵'),('xianzhen','陷阵营'),('danyang','丹阳兵'),('huangjin','黄巾诸部')]:assets.append(dict(id=id,name=name,kind='army',**troops(id).write(id)))
    for a in assets:a['url']=f'models/{a["id"]}.glb'
    manifest=dict(assets=assets,license='本项目程序化原创模型；与生成脚本一并提供，类别示意并非具体城址或装备的考古复原。',note='城池大小与队列人数用于辨识类别。黄巾头饰与陷阵营整齐甲具有文字依据，其余细节为艺术设计。')
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'models':len(assets),'triangles':sum(a['triangles']for a in assets),'bytes':sum(a['bytes']for a in assets)},ensure_ascii=False))

if __name__=='__main__':main()
