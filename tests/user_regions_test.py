import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point,box
from shapely.ops import unary_union

class UserRegions(unittest.TestCase):
    def test_source_geometry_is_preserved_and_labels_are_inside(self):
        data=json.loads((ROOT/'web/user-regions.json').read_text(encoding='utf-8'))
        self.assertEqual(data['source']['sha256'],hashlib.sha256((ROOT/'data/references/user-regions.zip').read_bytes()).hexdigest())
        self.assertEqual(len(data['regions']['features']),35)
        for f in data['regions']['features']:
            coordinates=f['geometry']['coordinates'][0]
            self.assertEqual(hashlib.sha256(json.dumps(coordinates,separators=(',',':')).encode()).hexdigest(),f['properties']['geometry_hash'])
        for label in data['labels']:
            areas=[shape(f['geometry']) for f in data['regions']['features'] if f['properties']['id'] in label['ids']]
            self.assertTrue(unary_union(areas).covers(Point(label['coordinates'])),label['name'])
        for id in ['hefei','shouchun']:
            city=next(c for c in data['cities'] if c['id']==id)
            self.assertIn('未说明年代',city['group_note'])
        self.assertEqual(len(data['geography']['features']),25)

    def test_coastal_source_land_is_not_masked_as_sea(self):
        preview=json.loads((ROOT/'web/user-regions.json').read_text(encoding='utf-8'))
        surface=json.loads((ROOT/'web/coastal-reference.json').read_text(encoding='utf-8'))
        original=json.loads((ROOT/'data/references/natural-earth-land-50m.geojson').read_text(encoding='utf-8'))
        original_land=unary_union([shape(f['geometry']) for f in original['features']]).intersection(box(68,12,146,60))
        land=shape(surface['land']['features'][0]['geometry']);water=shape(surface['water']['features'][0]['geometry'])
        self.assertTrue(land.is_valid and water.is_valid)
        self.assertLess(land.intersection(water).area,1e-9)
        self.assertLess(original_land.difference(land).area,1e-9,'不得因原包未画出某岛而删去已有陆地')
        for key in ['land','water','coastline','coastal_patches']:self.assertEqual(preview[key],surface[key])
        patches=unary_union([shape(f['geometry']) for f in surface['coastal_patches']['features']])
        self.assertGreater(patches.area,.5,'原包指示的沿海补齐不能仍被旧海域遮住')
        self.assertLess(patches.intersection(water).area,1e-9)
        for f in surface['coastal_patches']['features']:
            sources=[shape(x['geometry']) for x in preview['regions']['features'] if x['properties']['name']==f['properties']['name']]
            self.assertLess(shape(f['geometry']).difference(unary_union(sources)).area,1e-9)
        self.assertIn('不是考定',surface['coastal_note'])

if __name__=='__main__':unittest.main()
