"""Limited independent modern-shore alignment check, not ancient geography."""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from georeference_jianan import distance_km

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape


def main():
    reference=json.loads((ROOT/'web/reference.json').read_text(encoding='utf-8'))
    report=json.loads((ROOT/'research/jianan-georeference.json').read_text(encoding='utf-8'))
    coefficients=np.array(report['affine_coefficients'])
    inverse=np.linalg.inv(coefficients[:2,:])
    image=np.array(Image.open(ROOT/'web/assets/jianan-terrain.jpg'))
    water=image[:,:,2].astype(int)>image[:,:,1].astype(int)
    edge=np.zeros(water.shape,bool)
    edge[1:,:]|=water[1:,:]!=water[:-1,:]
    edge[:,1:]|=water[:,1:]!=water[:,:-1]
    points=[]
    for feature in reference['land']['features']:
        geometry=shape(feature['geometry'])
        for polygon in geometry.geoms if hasattr(geometry,'geoms')else[geometry]:
            west,south,east,north=polygon.bounds
            if 108<west and east<112 and 17<south and north<21 and polygon.area>1:
                name='海南岛'
            elif 120<west and 121.5<east<123 and 21<south and north<26 and polygon.area>1:
                name='台湾岛'
            else:
                continue
            ring=np.array(polygon.exterior.coords)
            for direction,index in [('西端',np.argmin(ring[:,0])),('东端',np.argmax(ring[:,0])),
                                    ('南端',np.argmin(ring[:,1])),('北端',np.argmax(ring[:,1]))]:
                lonlat=ring[index]
                x,y=(lonlat-coefficients[2,:])@inverse
                cx,cy=round(x+1),round(y+1)
                yy,xx=np.where(edge[cy-15:cy+16,cx-15:cx+16])
                xx,yy=xx+cx-15,yy+cy-15
                i=np.argmin((xx-(x+1))**2+(yy-(y+1))**2)
                actual=(np.array([xx[i]-1,yy[i]-1,1])@coefficients).tolist()
                points.append({'name':name+direction,'reference_coordinates':lonlat.tolist(),
                    'nearest_source_coast_pixel':[int(xx[i]),int(yy[i])],'source_coordinates':actual,
                    'difference_km':round(distance_km(lonlat,actual),3)})
    assert len(points)==8
    result={'method':'独立公版现代陆地轮廓的两岛四至，对照无文字底图中的邻近岸线像素。不是古代岸线考证。',
        'reference':'Natural Earth 1:50m land from the bundled wide-terrain build; scale 1:50,000,000',
        'limits':'近似现代轮廓加邻近像素方法只能发现明显地理错位；不能代表内陆、河西验证，更不证明古代岸线。',
        'points':points,'median_km':float(np.median([p['difference_km']for p in points])),
        'maximum_km':max(p['difference_km']for p in points)}
    (ROOT/'research/jianan-independent-coast-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k]for k in ['median_km','maximum_km']},ensure_ascii=False))


if __name__=='__main__':main()
