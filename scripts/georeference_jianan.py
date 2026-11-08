"""Recover the source crop using its geolocated topographic tile family.

24 image correspondences fit an affine transform; 8 other patches are withheld.
This verifies image placement only, not historic boundary/settlement accuracy.
Dependencies are the existing Pillow and numpy; no online calls at build time.
"""
from hashlib import sha256
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PATCHES = [
    (200,180),(500,160),(850,160),(1150,200),(1450,150),(1650,200),(1950,180),(2200,260),
    (300,480),(600,500),(900,520),(1200,510),(1450,600),(1650,600),(2180,480),(2260,500),
    (280,850),(650,800),(950,850),(1200,820),(1500,850),(700,1200),(1000,1200),(1350,1400),
    (120,650),(500,310),(1050,340),(1550,420),(2130,300),(500,1400),(1000,1620),(1600,1150),
]


def distance_km(a, b):
    lon1,lat1,lon2,lat2=map(math.radians,[*a,*b])
    return 12742*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2)))


def main():
    source=ROOT/'web/assets/jianan-terrain.jpg'
    image=np.asarray(Image.open(source).convert('L'),dtype=float)
    tiles={}
    hashes={str(source.relative_to(ROOT)):sha256(source.read_bytes()).hexdigest()}
    for title in ['Topographic30deg N30E90.png','Topographic30deg N30E120.png','Topographic30deg N0E90.png']:
        path=ROOT/'data/references'/title
        tiles[title]=np.asarray(Image.open(path).convert('L'),dtype=float)
        hashes[str(path.relative_to(ROOT))]=sha256(path.read_bytes()).hexdigest()
    controls=[]
    for index,(x,y) in enumerate(PATCHES):
        east=120 if x>=1800 else 90
        north=30 if y>=960 else 60
        title=f'Topographic30deg N{north-30}E{east}.png'
        tile=tiles[title]
        # Tile descriptions define 30 degrees across 1800 pixels. Seed crop was
        # identified by the same terrain features, not by ancient city proxies.
        expected_x=x-(1800 if east==120 else 0)
        expected_y=y+840-(1800 if north==30 else 0)
        patch=image[y-20:y+21,x-20:x+21]
        patch=patch-patch.mean()
        norm=(patch*patch).sum()
        if norm==0:
            raise ValueError(f'Control {index+1} is a featureless patch: {(x,y)}')
        best=(-1,None,None)
        for dy in range(-12,13):
            for dx in range(-12,13):
                tx,ty=expected_x+dx,expected_y+dy
                target=tile[ty-20:ty+21,tx-20:tx+21]
                target=target-target.mean()
                target_norm=(target*target).sum()
                if target_norm==0:
                    continue  # Constant sea colour cannot establish a correspondence.
                corr=float((patch*target).sum()/np.sqrt(norm*target_norm))
                if corr>best[0]:best=(corr,tx,ty)
        corr,tx,ty=best
        controls.append({'id':index+1,'role':'fit' if index<24 else 'holdout',
                         'source_svg':[x-1,y-1], 'tile':title, 'tile_pixel':[tx,ty],
                         'coordinates':[east+tx/60,north-ty/60], 'correlation':round(corr,6)})
    fit=[c for c in controls if c['role']=='fit']
    matrix=np.array([[*c['source_svg'],1]for c in fit])
    coefficients=np.linalg.lstsq(matrix,np.array([c['coordinates']for c in fit]),rcond=None)[0]
    def project(point):return (np.array([*point,1])@coefficients).tolist()
    for control in controls:
        control['predicted']=project(control['source_svg'])
        control['error_km']=round(distance_km(control['coordinates'],control['predicted']),6)
    errors=[c['error_km'] for c in controls if c['role']=='holdout']
    report={'method':'同源地形瓦片图像相关配准；等经纬度图幅上的仿射变换',
            'control_origin':'来源作者公开的30度、1800像素瓦片；不是古城点位或古界考证控制。',
            'limits':['检验点未参与拟合，但来自同一地形底图系列；尚未完成独立测绘源的地理验证。',
                      '匹配零残差不代表古界零误差；源图本身的年代、绘制与底图地理精度另行核验。',
                      '图幅说明存在复制错误：南段部分说明误写为零至六十度，按30度分幅及拼接连续性核对；不是完整坐标参考系统元数据。'],
            'control_selection_note':'原候选海面图块（2000，480）无灰度变化，不能定位；在拟合前改用（2180，480）。八个检验点未更换。',
            'source_hashes':hashes,'fit_count':24,'holdout_count':8,'controls':controls,
            'affine_coefficients':coefficients.tolist(),'median_holdout_km':float(np.median(errors)),
            'p90_holdout_km':float(np.percentile(errors,90)),
            'worst_correlation':min(c['correlation']for c in controls),
            'publication_status':'配准研究边线，未经古界逐段复核，不作为县域或诸侯实控面'}
    (ROOT/'research/jianan-georeference.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    # Use the plan's positional thresholds. JPEG noise lowers correlation in
    # flat terrain; it is reported, not disguised as a historical accuracy gate.
    if report['median_holdout_km']>10 or report['p90_holdout_km']>25:
        raise ValueError('Image registration did not pass; report saved, map not published')
    extraction=json.loads((ROOT/'research/jianan-source-extraction.json').read_text(encoding='utf-8'))
    features=[]
    for index,line in enumerate(extraction['boundaries']):
        features.append({'type':'Feature','properties':{'id':index+1,'source_path':line['id'],'kind':line['kind'],
             'reference_year':219,'status':'源图配准研究边线，古界待复核'},
             'geometry':{'type':'LineString','coordinates':[project(p)for p in line['points']]}})
    result={'type':'FeatureCollection','features':features,'source':'jianan-219','license':'CC BY-SA 4.0',
            'attribution':'Esiymbro; original source and modification notice: assets/DATA-NOTICES.txt',
            'note':'州界部分采用220年后分划；保持开口，不自动构造县域或势力面。'}
    reference=json.loads((ROOT/'web/jianan-reference.json').read_text(encoding='utf-8'))
    result['labels']=[{'name':label['name'],'kind':label['kind'],'coordinates':project([label['x'],label['y']])}
                      for label in reference['labels']]
    (ROOT/'web/jianan-boundaries.geojson').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({k:report[k]for k in ['fit_count','holdout_count','median_holdout_km','p90_holdout_km','worst_correlation']},ensure_ascii=False))


if __name__=='__main__':main()
