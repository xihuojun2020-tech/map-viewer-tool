"""Source-drawn thirteen-province lines and an independently cited hierarchy.

The 140 CE source is a cropped regional reconstruction, not a cadastral map.
Its blank base declares an equirectangular extent; no city guesses fit the map.
"""
from hashlib import sha256
import json
import re
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from svg.path import parse_path, Move
from shapely.geometry import LineString, Point, box
from source_text import plain_text

NAMES={'Sili':'司隶','Ji':'冀州','Yan':'兖州','Qing':'青州','Xu':'徐州','Yu':'豫州',
       'Jing':'荆州','Yang':'扬州','Yi':'益州','Liang':'凉州','Bing':'并州','You':'幽州','Jiaozhi':'交州'}
ORDER=['司隶','冀州','兖州','青州','徐州','豫州','荆州','扬州','益州','凉州','并州','幽州','交州']
# Exact strings in the pinned gazetteer, not assumptions based on a capital icon.
CENTERS={
    '冀州':('高邑',None,'後漢書/卷110','高邑，故鄗，光武更名。刺史治。'),
    '兖州':('昌邑',None,'後漢書/卷111','〖昌邑〗刺史治。'),
    '青州':('临淄','linzi','後漢書/卷112','臨菑，本齊，刺史治。'),
    '徐州':('郯','tan','後漢書/卷111','〖郯〗本國，刺史治。'),
    '豫州':('谯','qiao','後漢書/卷110','譙，{{*|平陽邑，左傳僖二十三年楚所取。乾谿在南。}}刺史治。'),
    '荆州':('汉寿',None,'後漢書/卷112','漢壽，故索，{{YL|陽嘉三年}}更名，刺史治。'),
    '扬州':('历阳／寿春','shouchun','後漢書/卷112','歷陽，侯國，刺史治。'),
    '益州':('雒','luoxian','後漢書/卷113','〖雒〗刺史治。'),
    '凉州':('陇',None,'後漢書/卷113','〖陇〗刺史治。'),
    '并州':('晋阳','jinyang','後漢書/卷113','〖晋阳〗本唐国。有龙山，晋水所出。刺史治。'),
    '幽州':('蓟','jicheng','後漢書/卷113','〖蓟〗本燕国。刺史治。'),
}


def main():
    source_path=ROOT/'data/references/han-orientaux-140.svg'
    root=ET.parse(source_path).getroot()
    metadata=json.loads((ROOT/'research/han-140-base-metadata.json').read_text(encoding='utf-8'))
    text=metadata['query']['pages'][0]['revisions'][0]['slots']['main']['content']
    assert '|projection=equirectangular' in text and '|latitude=18/42.5' in text and '|longitude=99.5/125.7' in text
    def project(x,y):return [99.5+x/920*26.2,42.5-y/1006*24.5]
    features=[];labels=[];source_lines=[];repairs=[]
    for element in root.iter():
        tag=element.tag.rsplit('}',1)[-1]
        style=element.attrib.get('style','')
        if tag=='path' and 'fill:none;'in style and 'stroke:#520'in style:
            points=[]
            for segment in parse_path(element.attrib['d']):
                if isinstance(segment,Move):
                    continue
                for i in range(33):
                    value=segment.point(i/32);point=(value.real,value.imag)
                    if not points or points[-1]!=point:points.append(point)
            raw_line=LineString(points)
            source_lines.append((element.attrib['id'],raw_line,float(re.search(r'stroke-width:([\d.]+)',style)[1]),'outer'if'stroke-dasharray:none'in style else'province'))
            line=raw_line.intersection(box(0,0,920,1006))
            def convert(coords):return [project(x,y)for x,y in coords]
            geometry={'type':'LineString','coordinates':convert(line.coords)} if line.geom_type=='LineString'else{
                'type':'MultiLineString','coordinates':[convert(p.coords)for p in line.geoms]}
            features.append({'type':'Feature','properties':{'source_path':element.attrib['id'],
                'kind':'outer'if'stroke-dasharray:none'in style else'province','year':140},'geometry':geometry})
        if tag=='text':
            name=''.join(element.itertext())
            if name in NAMES:
                labels.append({'name':NAMES[name],'coordinates':project(float(element.attrib['x'])+20,float(element.attrib['y'])-12)})
    assert {p['name']for p in labels}==set(ORDER)
    for i,(id,line,width,kind)in enumerate(source_lines):
        for point in [line.coords[0],line.coords[-1]]:
            origin=Point(point)
            distance,j=min((origin.distance(other),j)for j,(_,other,_,_)in enumerate(source_lines)if j!=i)
            target,other,target_width,_=source_lines[j]
            if distance<1e-7 or distance>(width+target_width)/2:continue
            destination=other.interpolate(other.project(origin))
            if not box(0,0,920,1006).covers(origin) or not box(0,0,920,1006).covers(destination):continue
            repair={'source_path':id,'target_path':target,'gap_pixels':distance,'ink_overlap_pixels':(width+target_width)/2}
            repairs.append(repair)
            features.append({'type':'Feature','properties':dict(repair,kind=kind,year=140,junction_repair=True,
                status='原图笔画覆盖相交的接点修正；不是新考定古界'),'geometry':{'type':'LineString','coordinates':[project(*point),project(destination.x,destination.y)]}})
    gazetteer=json.loads((ROOT/'data/references/hhs-geography-api.json').read_text(encoding='utf-8'))
    pages={p['title']:p for p in gazetteer['query']['pages']}
    atlas=json.loads((ROOT/'web/atlas.json').read_text(encoding='utf-8'))
    provinces=[]
    for name in ORDER:
        province={'name':name,'label':next(p['coordinates']for p in labels if p['name']==name),
            'note':'按《郡国志》所录时期组织；不代表汉末各年建置沿革已经完成。',
            'commanderies':[p['properties']['id']for p in atlas['national']['commanderies']if p['properties']['province']==name]}
        if name=='幽州':province['review']=json.loads((ROOT/'data/editorial/youzhou-review.json').read_text(encoding='utf-8'))
        if name in CENTERS:
            city,place_id,title,quote=CENTERS[name]
            page=pages[title];revision=page['revisions'][0]
            assert quote in revision['slots']['main']['content']
            province['center']={'name':city,'place_id':place_id,'level':'州治参考','note':'治所依据所录时期，未据此认定当前时间条年份仍在此。',
                'citation':{'title':title,'revision':revision['revid'],'url':f'https://zh.wikisource.org/w/index.php?oldid={revision["revid"]}',
                            'display_quote':plain_text(quote),'paragraph':'治所条目'}}
            if name=='扬州':province['center']['note']='正文记历阳，注引《汉官》记寿春并称与志不同；地图只定位已有的寿春参考点，不把两处合成一座城。'
        else:
            province['center']=None
        provinces.append(province)
    county_groups=[('东海郡','東海郡',[
        ('郯','郯','tan'),('兰陵','蘭陵',None),('戚','戚',None),('朐','朐',None),('襄贲','襄賁','xiaben'),
        ('昌虑','昌慮',None),('承','承',None),('阴平','陰平',None),('利城','利城',None),('合乡','合鄕',None),
        ('祝其','祝其',None),('厚丘','厚丘',None),('赣榆','贛楡',None)]),
        ('琅邪国','琅邪國',[('开阳','開陽','kaitang'),('东武','東武',None),('琅邪','琅邪',None),
        ('东莞','東莞',None),('西海','西海',None),('诸','諸',None),('莒','莒','juxian'),('东安','東安',None),
        ('阳都','陽都',None),('临沂','臨沂',None),('即丘','卽丘',None),('缯','繒',None),('姑幕','姑幕',None)])]
    counties=[]
    page=pages['後漢書/卷111'];revision=page['revisions'][0];original=revision['slots']['main']['content']
    for parent,heading,items in county_groups:
        begin=original.index(f'==={heading}===');end=original.index('\n===',begin+len(heading)+6)
        section=original[begin:end]
        for name,raw,place_id in items:
            at=section.index('〖'+raw);stop=section.find('\n\n',at)
            quote=section[at:stop if stop>=0 else len(section)]
            counties.append({'name':name,'parent':parent,'place_id':place_id,'boundary_status':'待考',
                'note':'文献所录县级条目；古县界与古治所精确位置分别考订。不得把本郡所有县一并视作某势力的实控区。',
                'citation':{'title':page['title'],'revision':revision['revid'],
                    'url':f'https://zh.wikisource.org/w/index.php?oldid={revision["revid"]}',
                    'display_quote':plain_text(quote),'paragraph':f'{parent} · {name}条'}})
    seats=json.loads((ROOT/'data/references/commandery-seats-api.json').read_text(encoding='utf-8'))
    seat_specs=[('kuaiji','會稽郡','山阴县','郡治参考','commandery',
        '會稽郡治所移至[[山阴县_(浙江省)|山陰縣]]（在今浙江[[紹興]]城區），領十五縣',
        '此处标为东汉会稽郡治山阴县的区域参照；郡名、县城和会稽山不合并。定位仍非古城测绘。'),
        ('guangling','廣陵郡','广陵县','县城（郡治分期待核）','local',
        '魏遷郡治於[[淮阴县|淮阴]]，吴[[广陵县]]仍於今[[扬州市]]',
        '二手资料指出三国时期魏迁郡治淮阴、吴仍有广陵县；当前不把扬州参照点当作整个三国时期固定的广陵郡治。')]
    centers={}
    for place_id,title,name,role,level,quote,note in seat_specs:
        page=next(p for p in seats['query']['pages']if p['title']==title);revision=page['revisions'][0]
        assert quote in revision['slots']['main']['content']
        centers[place_id]={'name':name,'role':role,'level':level,'note':note,
            'citation':{'title':'维基百科·'+title,'revision':revision['revid'],
                'url':f'https://zh.wikipedia.org/w/index.php?oldid={revision["revid"]}',
                'display_quote':plain_text(quote),'paragraph':'郡治分期说明（二手资料）'}}
    result={'type':'FeatureCollection','features':features,'labels':labels,'provinces':provinces,
        'counties':counties,'commandery_centers':centers,'junction_repairs':repairs,
        'year':140,'bounds':[99.5,18,125.7,42.5],
        'note':'约140年十三州概略复原。源图未覆盖河西西段及东北外缘；裁切边不能当完整州界。交州在此作规范标签，所录时期为交趾刺史部。',
        'source_url':'https://commons.wikimedia.org/wiki/File:Han_orientaux_140.svg',
        'author':'Zunkir; base by Kanguole','license':'CC BY-SA 4.0','source_sha256':sha256(source_path.read_bytes()).hexdigest()}
    (ROOT/'web/han-administration.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'research/han-140-provenance.json').write_text(json.dumps({k:v for k,v in result.items()if k not in ['features','labels','provinces']},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'州':len(provinces),'出处边线':len(features),'所录治所':sum(p['center']is not None for p in provinces),'已核县级条目':len(counties)},ensure_ascii=False))


if __name__=='__main__':main()
