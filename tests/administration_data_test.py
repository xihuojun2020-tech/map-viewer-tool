import json
from pathlib import Path
import re
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point
from shapely.ops import unary_union
from scripts.source_text import plain_text


class AdministrationData(unittest.TestCase):
    def test_modern_water_mask_preserves_city_land_and_names_its_epoch(self):
        reference=json.loads((ROOT/'web/reference.json').read_text(encoding='utf-8'))
        water=shape(reference['water']['features'][0]['geometry'])
        land=unary_union([shape(f['geometry'])for f in reference['land']['features']])
        self.assertTrue(water.is_valid)
        self.assertAlmostEqual(water.intersection(land).area,0,places=8)
        self.assertTrue(water.covers(Point(124,34)))
        self.assertFalse(water.covers(Point(118.34,34.62)))
        self.assertEqual(reference['water']['features'][0]['properties']['temporal_status'],'modern_reference')

    def test_administrative_hierarchy_and_references_do_not_create_territory(self):
        data=json.loads((ROOT/'web/han-administration.json').read_text(encoding='utf-8'))
        self.assertEqual({p['name']for p in data['provinces']},{'司隶','冀州','兖州','青州','徐州','豫州','荆州','扬州','益州','凉州','并州','幽州','交州'})
        roster=[key for p in data['provinces']for key in p['commanderies']]
        self.assertEqual(len(roster),105);self.assertEqual(len(set(roster)),105)
        self.assertEqual(len(data['counties']),26)
        self.assertTrue(all(f['geometry']['type']in['LineString','MultiLineString']for f in data['features']))
        self.assertNotIn('faction',data)
        self.assertIn('未覆盖',data['note'])
        pages=json.loads((ROOT/'data/references/hhs-geography-api.json').read_text(encoding='utf-8'))['query']['pages']
        texts={p['title']:plain_text(p['revisions'][0]['slots']['main']['content'])for p in pages}
        records=[p['center']for p in data['provinces']if p['center']]+data['counties']
        for record in records:
            citation=record['citation']
            self.assertIn(citation['display_quote'],texts[citation['title']])
            self.assertIsNone(re.search('[A-Za-z]',citation['display_quote']))
        for record in data['commandery_centers'].values():
            self.assertIsNone(re.search('[A-Za-z]',record['citation']['display_quote']))
        self.assertTrue(all(c['boundary_status']=='待考'for c in data['counties']))


if __name__=='__main__':unittest.main()
