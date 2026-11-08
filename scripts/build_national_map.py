"""Build shared, explicitly approximate commandery/county geography and phase maps."""
from collections import defaultdict
import json
import math
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import Polygon, shape, mapping
from shapely.ops import unary_union
from shapely import set_precision
from build_data import converter, load_corpus, citation
from source_text import plain_text


def compact(value):
    if isinstance(value,dict):return {k:compact(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [compact(x) for x in value]
    return round(value,4) if isinstance(value,float) else value


def feature(geometry,properties):
    # Raw decimal rounding collapsed narrow clipping fragments into invalid rings.
    # Quantize topology before serialization instead of rounding rings independently.
    geometry=set_precision(geometry,.0001)
    return {'type':'Feature','properties':properties,'geometry':compact(mapping(geometry))}


def main():
    geo=json.loads((ROOT/'data/editorial/national-geography.json').read_text(encoding='utf-8'))
    phases=json.loads((ROOT/'data/editorial/territory-phases.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'data/editorial/catalog.json').read_text(encoding='utf-8'))
    corpus=load_corpus();traditional=converter()
    reference=json.loads((ROOT/'web/reference.json').read_text(encoding='utf-8'))
    land=unary_union([shape(f['geometry']) for f in reference['land']['features']])
    hhs=json.loads((ROOT/'data/references/hhs-geography-api.json').read_text(encoding='utf-8'))
    refs=[]
    for page in hhs['query']['pages']:
        rev=page['revisions'][0]
        refs.append({'id':f'hhs-{page["title"].split("卷")[-1]}','title':page['title'],'revision':rev['revid'],
                     'url':f'https://zh.wikisource.org/w/index.php?oldid={rev["revid"]}','text':rev['slots']['main']['content']})
    districts={};occupied=Polygon()
    order=['徐州','兖州','青州','冀州','幽州','并州','司隶','豫州','荆州','扬州','益州','交州','凉州']
    def shift(y):return .11*math.sin(y*2.1)
    for name in order:
        province=next(x for x in geo['provinces'] if x['name']==name)
        outer=Polygon(province['outline'])
        if not outer.is_valid:raise ValueError(f'Invalid province sketch: {name}')
        outer=outer.intersection(land).difference(occupied)
        occupied=unary_union([occupied,outer])
        for south,north,cuts,names in province['bands']:
            middle=(south+north)/2
            for i,label in enumerate(names):
                west,east=cuts[i:i+2]
                polygon=Polygon([(west+shift(south),south),(east+shift(south),south),(east+shift(middle),middle),
                                 (east+shift(north),north),(west+shift(north),north),(west+shift(middle),middle)])
                result=outer.intersection(polygon)
                if result.is_empty or result.area<.0001:raise ValueError(f'Empty commandery sketch: {label}')
                districts[label]={'geometry':result,'province':name}
    county_geometries=[];county_occupied=Polygon()
    for county in geo['counties']:
        polygon=Polygon(county['outline'])
        if not polygon.is_valid:raise ValueError(f'Invalid county: {county["name"]}')
        polygon=polygon.intersection(land).difference(county_occupied)
        if polygon.is_empty:raise ValueError(f'Empty county: {county["name"]}')
        county_occupied=unary_union([county_occupied,polygon])
        county_geometries.append((county,polygon))
    # Correct the coarse parent mesh at the explicitly catalogued county parcels.
    # The county sketches remain illustrative, not claims of measured ancient borders.
    for name,record in districts.items():
        own=[p for c,p in county_geometries if c['commandery']==name]
        foreign=[p for c,p in county_geometries if c['commandery']!=name]
        record['geometry']=unary_union([record['geometry'].difference(unary_union(foreign)),*own])
    sources=[]
    commanderies=[]
    for i,(name,record) in enumerate(districts.items()):
        aliases={'巨鹿郡':['鉅鹿郡'],'沛国':['沛國'],'吴郡':['呉郡']}.get(name,[])
        found=None
        for doc in refs:
            for token in [name,traditional(name),*aliases]:
                at=doc['text'].find(token)
                if at>=0:
                    found={'source':doc['id'],'title':doc['title'],'revision':doc['revision'],'url':doc['url'],
                           'quote':doc['text'][max(0,at-15):at+len(token)+35]}
                    display=plain_text(doc['text'])
                    clean_at=display.index(token)
                    found['display_quote']=display[max(0,clean_at-15):clean_at+len(token)+35]
                    break
            if found:break
        if not found:raise ValueError(f'Gazetteer name not found: {name}')
        point=record['geometry'].representative_point()
        commanderies.append(feature(record['geometry'],{'id':f'cmd-{i:03}','name':name,'province':record['province'],
            'label':[point.x,point.y],'citation':found,'precision':geo['precision']}))
    counties=[]
    for i,(county,polygon) in enumerate(county_geometries):
        counties.append(feature(polygon,{'id':f'county-{county["place_id"]}','place_id':county['place_id'],
            'name':county['name'],'commandery':county['commandery'],'precision':county['precision'],
            'boundary_status':'待考'}))
    factions={f['id']:f for f in catalog['factions']}
    factions.update({f['id']:f for f in phases['additional_factions']})
    factions['wei']={**factions['wei'],'color':'#52749a'}
    factions['shu']={**factions['shu'],'color':'#4f865d'}
    frontier=[]
    for item in geo['frontier']:
        polygon=Polygon(item['outline']).intersection(land)
        if polygon.is_empty:raise ValueError(f'Empty frontier: {item["id"]}')
        point=polygon.representative_point()
        cite=citation(corpus,item['source'],item['phrase']) if item['source'] else None
        frontier.append(feature(polygon,{'id':item['id'],'name':item['name'],'kind':item['kind'],
            'color':factions[item['id']]['color'],'label':[point.x,point.y],'citation':cite,
            'precision':'综合汉末三世纪文献的活动范围示意；非逐年疆界，可与行政名义范围重叠。'}))
    event_records=[]
    for event in catalog['events']:
        cite=citation(corpus,event['source'],event['phrase'])
        event_records.append({**event,'citation':cite,'position':event['year'] if event['world']=='history' else corpus[event['source']]['number']*1000+cite['paragraph']})
    bindings={c['place_id']:c['commandery'] for c in geo['counties']}
    bindings.update({'langya':'琅邪国','donghai':'东海郡','beihai':'北海国','taishan':'泰山郡','runan':'汝南郡',
       'haixi':'广陵郡','guandu':'河南尹','tongguan':'弘农郡','hulao':'河南尹','yijing':'涿郡','jiange':'广汉郡',
       'dingjun':'汉中郡','qishan':'汉阳郡','jieting':'汉阳郡','wuzhang':'右扶风','jincheng':'金城郡'})
    narrative=[]
    for anchor in phases['narrative_anchors']:
        key=f'romance-{anchor["chapter"]:03}'
        cite=citation(corpus,key,anchor['phrase'])
        if cite['paragraph']==1:raise ValueError(f'Narrative header cannot establish completed event: {key}')
        narrative.append({**anchor,'position':anchor['chapter']*1000+cite['paragraph'],'citation':cite})
    narrative.sort(key=lambda x:x['position'])
    def frame(world,position):
        if world=='history':
            phase=max((p for p in phases['history'] if p['year']<=position),key=lambda x:x['year'])
            anchor_position=phase['year'];title=phase['title'];ref_year=phase['year'];cite=None
        else:
            candidates=[p for p in narrative if p['position']<=position]
            if not candidates:return None
            anchor=candidates[-1];ref_year=anchor['reference_year'];anchor_position=anchor['position'];cite=anchor['citation']
            phase=max((p for p in phases['history'] if p['year']<=ref_year),key=lambda x:x['year'])
            title=anchor['title']
        owners=dict(phase['owners'])
        if world=='romance':
            owners.update(anchor['owner_overrides'])
        relevant=[e for e in event_records if e['world']==world and anchor_position<=e['position']<=position]
        overrides=dict(anchor['place_overrides']) if world=='romance' else {}
        for event in sorted(relevant,key=lambda x:(x['position'],x.get('order',0))):
            for key,owner in event['controls'].items():
                if key=='xuzhou':
                    for name,record in districts.items():
                        if record['province']=='徐州':owners[name]=owner
                else:overrides[key]=owner
        if world=='romance' and relevant and relevant[-1]['position']>anchor_position:
            title=relevant[-1]['title'];cite=relevant[-1]['citation']
        controls={place:owners[parent] for place,parent in bindings.items()}
        controls.update(overrides)
        controls['xuzhou']=owners['彭城国']
        if world=='history' and position==194:controls['juancheng']='cao'
        pieces=defaultdict(list)
        for name,record in districts.items():
            geometry=record['geometry']
            changing=[p for c,p in county_geometries if c['commandery']==name and controls[c['place_id']]!=owners[name]]
            if changing:geometry=geometry.difference(unary_union(changing))
            pieces[owners[name]].append(geometry)
        for county,polygon in county_geometries:
            if controls[county['place_id']]!=owners[county['commandery']]:pieces[controls[county['place_id']]].append(polygon)
        features=[]
        for owner,polygons in pieces.items():
            combined=unary_union(polygons)
            if not combined.is_valid:raise ValueError(f'Invalid dissolved territory {world} {position} {owner}')
            largest=max(list(combined.geoms),key=lambda x:x.area) if combined.geom_type=='MultiPolygon' else combined
            point=largest.representative_point()
            features.append(feature(combined,{'id':owner,'name':factions[owner]['name'],'color':factions[owner]['color'],
                'label':[point.x,point.y],'area':combined.area,'kind':'阶段势力示意区'}))
        note=phase['note'] if world=='history' else ('按已读原著节点校准的全国阶段推定；背景郡域逐条核文未毕，色块为阶段范围。'+anchor['note'])
        return {'position':position,'reference_year':ref_year,'title':title,'note':note,
                'source_ids':phase['source_ids'],'citation':cite,'controls':controls,'commandery_owners':owners,
                'features':features}
    history_positions=sorted({p['year'] for p in phases['history']}|{e['position'] for e in event_records if e['world']=='history'})
    romance_positions=sorted({p['position'] for p in narrative}|{e['position'] for e in event_records if e['world']=='romance'})
    result={'version':2,'precision':geo['precision'],'commandery_epoch':geo['commandery_epoch'],
        'commanderies':commanderies,'counties':counties,'frontier':frontier,
        'history':[frame('history',p) for p in history_positions],
        'romance':[f for p in romance_positions if (f:=frame('romance',p)) is not None],
        'factions':list(factions.values()),'bindings':bindings,
        'sources':[{k:v for k,v in doc.items() if k!='text'}|{'review_status':'郡国名称与所属名录参考，非边界矢量来源'} for doc in refs]}
    path=ROOT/'web/national-map.json';path.write_text(json.dumps(compact(result),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={'commanderies':len(commanderies),'counties':len(counties),'frontier_regions':len(frontier),
        'history_frames':len(result['history']),'romance_frames':len(result['romance']),
        'geometric_note':'构建验证只验证几何和引用存在，不等同历史界线考定。', 'bytes':path.stat().st_size}
    (ROOT/'research/national-map-build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
