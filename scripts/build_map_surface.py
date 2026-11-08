"""Make the bundled modern land outline visible above opaque relief images."""
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union


def main():
    path=ROOT/'web/reference.json'
    reference=json.loads(path.read_text(encoding='utf-8'))
    extent=box(*reference['wide_terrain']['bounds'])
    land=unary_union([shape(f['geometry'])for f in reference['land']['features']])
    water=extent.difference(land)
    coastline=land.boundary.difference(extent.boundary)
    def collection(geometry):
        return {'type':'FeatureCollection','features':[{'type':'Feature',
            'properties':{'temporal_status':'modern_reference'},'geometry':mapping(geometry)}]}
    reference['water']=collection(water)
    reference['coastline']=collection(coastline)
    reference['sea_labels']=[['渤海',120.2,39.0],['黄海',123,34.5],['东海',125,28],['南海',116,19]]
    path.write_text(json.dumps(reference,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'water_valid':water.is_valid,'coastline_valid':coastline.is_valid,
                      'scope':'现代海陆参照；不是三国岸线复原'},ensure_ascii=False))


if __name__=='__main__':main()
