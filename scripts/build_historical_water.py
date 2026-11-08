"""Extract source-attributed research overlays; do not certify a river network."""
from hashlib import sha256
import json
import math
import re
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from svg.path import parse_path, Move
import numpy as np


def changban_reference():
    original=ROOT/'data/references/hydrology-2026-11-06/changban-battle.svg'
    root=ET.parse(original).getroot()
    layer=next(e for e in root if e.get('id')=='layer1')
    assert layer.get('transform')=='translate(-126.40607,-66.803948)'
    nodes={e.get('id'):e for e in layer}
    places={p['id']:p for p in json.loads((ROOT/'web/atlas.json').read_text(encoding='utf-8'))['places']}
    controls=[]
    # All objects share the same parent translation. Fit their un-cropped local
    # coordinates, including each city symbol's own translation.
    for svg_id,place_id in [('Xinye','xinye'),('Fancheng','fancheng'),('Xiangyang','xiangyang'),('Jiangling','jiangling'),('Xiakou','xiakou')]:
        node=nodes[svg_id]
        samples=[s.point(i/16) for s in parse_path(node.get('d')) for i in range(17)]
        x=(min(p.real for p in samples)+max(p.real for p in samples))/2
        y=(min(p.imag for p in samples)+max(p.imag for p in samples))/2
        assert re.fullmatch(r'translate\([-\d.]+,[-\d.]+\)',node.get('transform'))
        dx,dy=map(float,re.findall(r'-?[\d.]+',node.get('transform')))
        controls.append({'source_id':svg_id,'place_id':place_id,'name':places[place_id]['name'],
            'svg':[x+dx,y+dy],'coordinates':places[place_id]['coordinates']})
    a=np.array([c['svg']+[1] for c in controls]);b=np.array([c['coordinates'] for c in controls])
    affine=np.linalg.lstsq(a,b,rcond=None)[0]
    km=np.array([111.32*math.cos(math.radians(31)),111.32])
    residual=np.linalg.norm((a@affine-b)*km,axis=1)
    for i,c in enumerate(controls):
        mask=np.arange(len(a))!=i
        leaveout=np.linalg.lstsq(a[mask],b[mask],rcond=None)[0]
        c.update(fit_error_km=round(float(residual[i]),2),leave_one_out_error_km=round(float(np.linalg.norm((a[i]@leaveout-b[i])*km)),2))
    rms=round(float(np.sqrt(np.mean(residual**2))),2)
    worst=max(c['leave_one_out_error_km'] for c in controls)
    features=[]
    for path_id,name in [('RivièreHan','汉水'),('Yangzi1','长江江陵附近片段'),('Yangzi2','长江夏口附近片段')]:
        node=nodes[path_id];assert node.get('transform') is None
        coordinates=[]
        for segment in parse_path(node.get('d')):
            if isinstance(segment,Move):continue
            for i in range(17):
                p=segment.point(i/16);xy=(np.array([p.real,p.imag,1])@affine).tolist()
                if not coordinates or coordinates[-1]!=xy:coordinates.append(xy)
        props={'id':f'changban-{path_id}','name':f'{name} · 长坂研究示意','from_year':208,'to_year':208,
            'period':'公元208年长坂战役地理关系示意；不作为其他年份河道的变化记录。',
            'source_name':'长坂之战示意图','source_url':'https://commons.wikimedia.org/wiki/File:Bataille_de_Changban.svg',
            'author':'Sixsous、Deadkid_dk、Zhuwq','license':'CC BY-SA 3.0','source_path':path_id,
            'status':'二手战役示意，未经古河道考订；默认关闭。',
            'warning':f'原图无地理坐标。五个地区参照点拟合均方根偏差约{rms}千米，逐点留出检验最大偏差约{worst}千米；本图不提供城址、河岸或战术距离依据。',
            'scope':'只提取源图独立河流路径；长江中间缺段保持断开，未补线、未推定湖岸。',
            'georeference':'在源图局部坐标中进行一次仿射配准；参照点来自本项目已有地区坐标，非独立测绘。未自由拉伸或沿现代河流吸附。'}
        features.append({'type':'Feature','properties':props,'geometry':{'type':'LineString','coordinates':coordinates}})
    return features,{'source_sha256':sha256(original.read_bytes()).hexdigest(),'source_url':props['source_url'],
        'controls':controls,'affine_svg_to_lonlat':affine.tolist(),'fit_rms_km':rms,
        'leave_one_out_max_km':worst,'decision':'只发布208年研究示意，不升级为历史河道；未连接源图缺段。'}


def main():
    original=ROOT/'data/references/yellow-river-courses.svg'
    root=ET.parse(original).getroot()
    base=ET.parse(ROOT/'data/references/eastern-china-base.svg').getroot()
    metadata=json.loads((ROOT/'data/references/eastern-china-base.json').read_text(encoding='utf-8'))
    text=metadata['query']['pages'][0]['revisions'][0]['slots']['main']['content']
    assert '|projection=equirectangular' in text and '|latitude=18/42.5' in text and '|longitude=99.5/125.7' in text
    assert base.get('width')=='920' and base.get('height')=='1006'
    # The derivative uses relative path commands; compare coordinates, not XML
    # strings. These shared base paths demonstrate the unchanged source grid.
    source_paths={p.get('id'):p for p in root.iter() if p.tag.endswith('path')}
    base_paths={p.get('id'):p for p in base.iter() if p.tag.endswith('path')}
    for name in ['Dan river','Fen river','Yi river']:
        a=parse_path(source_paths[name].get('d'));b=parse_path(base_paths[name].get('d'))
        assert len(a)==len(b)
        assert all(abs(x.start-y.start)<1e-6 and abs(x.end-y.end)<1e-6 for x,y in zip(a,b))
    layer=next(g for g in root if g.get('id')=='layer2')
    assert layer.get('transform')=='translate(-488.36943,-123.18858)'
    river=next(e for e in layer if e.get('id')=='path4550')
    assert 'stroke:#ff0000' in river.get('style') and river.get('transform') is None
    points=[]
    for segment in parse_path(river.get('d')):
        if isinstance(segment,Move):continue
        for i in range(17):
            p=segment.point(i/16)
            # Undo the crop by retaining the original full-base coordinates;
            # the red path was drawn after the base's vertical scale transform.
            coordinate=[99.5+p.real/920*26.2,42.5-p.imag/1006*24.5]
            if not points or points[-1]!=coordinate:points.append(coordinate)
    props={'id':'huanghe-eastern-han-reference','name':'东汉黄河下游故道 · 研究示意',
        'period':'来源概括为公元11—1048年；覆盖汉末三国，但不表示这一千年河道完全不变。',
        'source_name':'黄河历次改道示意图','source_url':'https://commons.wikimedia.org/wiki/File:Yellow_River_watercourse_changes.svg',
        'author':'Stevenliuyi','license':'CC BY-SA 4.0','source_path':'path4550',
        'status':'二手图，来源存在争议；仅作研究对照，河道未考定。',
        'warning':'来源页明确指出原图忽略了西汉的重要河道变化。此次只提取其标注的东汉下游线，但该线仍未独立考订，不能作为精确定位或战役淹没范围的依据。',
        'scope':'黄河下游候选线；长江、汉水另有208年战役示意，均未构成考定古河网。',
        'georeference':'沿用原底图公开的等距圆柱投影与经纬范围；共同底图路径核对一致。配准正确不证明历史线路正确。'}
    result={'type':'FeatureCollection','features':[{'type':'Feature','properties':props,
        'geometry':{'type':'LineString','coordinates':points}}]}
    changban,fit=changban_reference()
    result['features'].extend(changban)
    (ROOT/'web/historical-water.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={'source_url':props['source_url'],'source_sha256':sha256(original.read_bytes()).hexdigest(),
        'base_sha256':sha256((ROOT/'data/references/eastern-china-base.svg').read_bytes()).hexdigest(),
        'path':props['source_path'],'points':len(points),'default_visible':False,
        'source_warning':props['warning'],'user_zhihu_url':'https://zhuanlan.zhihu.com/p/1943697695039534400',
        'zhihu_status':'正文请求返回403；未声称已读到帖子，也未使用其图片。',
        'other_checks':['黄河古道研究仓储页面实际返回维护公告，未取得论文全文。','中国国家地理旧图链接返回页面不存在，未据此认定已核读原图。']}
    report['changban']=fit
    (ROOT/'research/historical-water-build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'research_river_segments':len(result['features']),'changban_fit_rms_km':fit['fit_rms_km'],'default_visible':False},ensure_ascii=False))


if __name__=='__main__':main()
