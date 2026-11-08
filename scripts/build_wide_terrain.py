"""Expand the explicitly modern relief reference to the northern/eastern frontier."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import sys
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
import numpy as np
from PIL import Image
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

BOUNDS=[88,16,139,52]
ZOOM=5


def main():
    cache=ROOT/'tmp'/'terrain-wide';cache.mkdir(parents=True,exist_ok=True)
    def get(url,name):
        path=cache/name
        if not path.exists():
            with urllib.request.urlopen(url,timeout=30) as response: raw=response.read()
            path.write_bytes(raw)
        return path.read_bytes()
    def pos(lon,lat):return (lon+180)/360*2**ZOOM,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**ZOOM
    left,top=pos(BOUNDS[0],BOUNDS[3]);right,bottom=pos(BOUNDS[2],BOUNDS[1])
    x0,y0,x1,y1=math.floor(left),math.floor(top),math.floor(right),math.floor(bottom)
    raster=np.zeros(((y1-y0+1)*256,(x1-x0+1)*256),dtype=np.float32)
    def tile(xy):
        x,y=xy
        raw=get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png',f'{x}-{y}.png')
        rgb=np.asarray(Image.open(BytesIO(raw)).convert('RGB'),dtype=np.float32)
        return x,y,rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
    coords=[(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for x,y,values in pool.map(tile,coords):raster[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=values
    width,height=round((right-left)*256),round((bottom-top)*256)
    raster=np.asarray(Image.fromarray(raster).transform((width,height),Image.Transform.EXTENT,
        ((left-x0)*256,(top-y0)*256,(right-x0)*256,(bottom-y0)*256),resample=Image.Resampling.BILINEAR))
    stops=[-1000,0,50,250,650,1200,2200,3500,5500,8500]
    colors=np.array([[210,226,232],[210,226,232],[218,223,194],[202,214,176],[182,200,160],[186,192,159],[194,180,155],[180,158,139],[194,185,173],[234,232,226]])
    rgb=np.stack([np.interp(raster,stops,colors[:,i]) for i in range(3)],axis=-1)
    dy,dx=np.gradient(raster/4200)
    slope=math.pi/2-np.arctan(np.sqrt(dx*dx+dy*dy));aspect=np.arctan2(-dx,dy)
    light=np.sin(math.pi/4)*np.sin(slope)+np.cos(math.pi/4)*np.cos(slope)*np.cos(5.5-aspect)
    rgb=np.clip(rgb*np.clip(.75+.32*light,.64,1.08)[:,:,None],0,255).astype('uint8');rgb[raster<0]=[210,226,232]
    target=ROOT/'web'/'assets'/'terrain-wide.png';Image.fromarray(rgb).save(target,optimize=True)
    raw=get('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson','land.json')
    land=json.loads(raw)
    clipping=box(*BOUNDS)
    geometries=[shape(f['geometry']).intersection(clipping) for f in land['features'] if shape(f['geometry']).intersects(clipping)]
    merged=unary_union(geometries)
    reference=json.loads((ROOT/'web'/'reference.json').read_text(encoding='utf-8'))
    reference['land']={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'temporal_status':'modern_reference'},'geometry':mapping(merged)}]}
    reference['wide_terrain']={'bounds':BOUNDS,'coordinates':[[88,52],[139,52],[139,16],[88,16]],'path':'assets/terrain-wide.png','note':'现代地势和海岸参照，非古代边界或河岸。'}
    (ROOT/'web'/'reference.json').write_text(json.dumps(reference,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'research'/'wide-terrain.json').write_text(json.dumps({'source':'Terrain Tiles / Mapzen; USGS SRTM/GMTED2010; NOAA ETOPO1',
        'attribution':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','land':'Natural Earth 1:50m land (public domain)',
        'bounds':BOUNDS,'tiles':len(coords),'sha256':sha256(target.read_bytes()).hexdigest(),'image_size':[width,height]},indent=2),encoding='utf-8')
    print(f'wide relief {width}x{height}; {len(coords)} tiles',flush=True)


if __name__=='__main__':main()
