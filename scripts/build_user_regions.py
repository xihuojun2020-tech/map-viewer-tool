"""Build the separate, undated preview from the user's six KML documents."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import Polygon,Point,shape,mapping,box
from shapely.ops import unary_union
from build_strategic_regions import interior_center

NS={'k':'http://www.opengis.net/kml/2.2'}
GROUP_COLORS={'曹魏':'#8da8bd','东吴':'#95b79c','蜀汉':'#cbb078','周边部落':'#bcb1a3','其他参考区':'#b7b4ae'}
PALETTE=['#c5b29e','#a9bdad','#b1b7cb','#c9bd91','#a1bfc4','#c4a7a1','#b0bea0','#b8acc1','#b2c5bb','#c2b9ac','#d1b0a0','#a8b2be']

def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
def fc(features):return {'type':'FeatureCollection','features':features}
def feature(geometry,properties):return {'type':'Feature','geometry':mapping(geometry),'properties':properties}

def main():
    archive=ROOT/'data/references/user-regions.zip'
    documents={}
    with ZipFile(archive) as z:
        for info in z.infolist():
            name=info.filename if info.flag_bits&0x800 else info.filename.encode('cp437').decode('gbk')
            if not name.endswith('.kml'):continue
            root=ET.fromstring(z.read(info));records=[]
            for mark in root.findall('.//k:Placemark',NS):
                name_text=mark.findtext('k:name',namespaces=NS).strip()
                coordinates=[[float(v) for v in token.split(',')[:2]] for token in mark.find('.//k:coordinates',NS).text.split()]
                area=Polygon(coordinates)
                if not area.is_valid:raise ValueError(f'{name}：{name_text}存在无效边界')
                key=sha256(json.dumps(coordinates,separators=(',',':')).encode()).hexdigest()
                records.append((name_text,area,key))
            documents[name]=records
    ownership={key:group for group in GROUP_COLORS if group!='其他参考区' for _,_,key in documents[group+'.kml']}
    names=sorted({name for name,_,_ in documents['三国历史地图.kml']})
    colors={name:PALETTE[i%len(PALETTE)] for i,name in enumerate(names)}
    regions=[];name_groups=defaultdict(list);country_groups=defaultdict(list)
    for i,(name,area,key) in enumerate(documents['三国历史地图.kml']):
        group=ownership.get(key,'其他参考区')
        props={'id':f'user-region-{i}','name':name,'group':group,'color':colors[name],'group_color':GROUP_COLORS[group],
               'label':interior_center(area),'bounds':list(area.bounds),'source':'三国历史地图.kml','geometry_hash':key}
        if name in ['夫挹','余娄','葱茈羌','呼得']:props['name_note']='保留原文件名称，制图依据待考。'
        regions.append(feature(area,props));name_groups[name].append(area);country_groups[group].append(area)
    labels=[{'name':name,'coordinates':interior_center(unary_union(areas)),'ids':[f['properties']['id'] for f in regions if f['properties']['name']==name],
             'frontier':all(f['properties']['group']=='周边部落' for f in regions if f['properties']['name']==name)} for name,areas in name_groups.items()]
    groups=[]
    for name,areas in country_groups.items():
        centre=unary_union(areas).centroid
        central_area=min(areas,key=lambda area:area.distance(centre))
        groups.append({'name':name,'color':GROUP_COLORS[name],'coordinates':interior_center(central_area)})
    atlas=read('web/atlas.json');seats={s['place_id']:s for s in read('web/jianan-boundaries.geojson')['seat_records']}
    cities=[]
    for p in atlas['places']:
        if p['kind']=='区域':continue
        city={k:p[k] for k in ['id','name','aliases','coordinates','location_note']}
        city['level']=seats[p['id']]['level'] if p['id'] in seats else ('county' if p['kind']=='县治' else 'local')
        city['regions']=[f['properties']['id'] for f in regions if shape(f['geometry']).covers(Point(p['coordinates']))]
        if p['id'] in ['hefei','shouchun']:city['group_note']='原包归属东吴；年代与归属待考。'
        cities.append(city)
    geography=fc([{'type':'Feature','geometry':f['geometry'],'properties':{k:f['properties'][k] for k in ['id','name','kind','aliases','label','min_zoom','summary','precision','geometry_note']}} for f in atlas['story_geography']['features']])
    extent=box(68,12,146,60)
    raw_land=read('data/references/natural-earth-land-50m.geojson')
    land=unary_union([shape(f['geometry']) for f in raw_land['features']]).intersection(extent)
    # Only the source's coastal mainland/island outlines contribute land additions.
    # Interior administrative gaps and tribal ranges cannot establish a coastline.
    coastal_names={'幽州','青州','扬州','交州','朱崖洲','夷洲'}
    patches=[feature(shape(f['geometry']).difference(land),{'name':f['properties']['name']})
             for f in regions if f['properties']['name'] in coastal_names]
    land=unary_union([land,*[shape(f['geometry']) for f in patches]])
    surface={'land':fc([feature(land,{})]),'water':fc([feature(extent.difference(land),{})]),
             'coastline':fc([feature(land.boundary.difference(extent.boundary),{})]),'coastal_patches':fc(patches),
             'coastal_note':'现代海陆底图结合原包沿海轮廓补齐陆地显示，补齐处为平面底色。按现代海陆裁切，非三国古海岸。'}
    (ROOT/'web/coastal-reference.json').write_text(json.dumps(surface,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    reference=read('web/reference.json')
    result={'regions':fc(regions),'boundaries':fc([feature(unary_union([shape(f['geometry']).boundary for f in regions]),{})]),'labels':labels,'groups':groups,
            'cities':cities,'geography':geography,**surface,'terrain':reference['wide_terrain'],
            'source':{'archive':'三国地图分布.zip','sha256':sha256(archive.read_bytes()).hexdigest(),'features':len(regions),'period':'原文件未注明年代',
                      'note':'仅供来源轮廓对照；原包分组不是逐期实控资料，郡县边界未包含。','license':'原包未附作者与许可说明，来源仍待核对。'}}
    (ROOT/'web/user-regions.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'regions':len(regions),'labels':len(labels),'cities':len(cities),'geography':len(geography['features'])},ensure_ascii=False))

if __name__=='__main__':main()
