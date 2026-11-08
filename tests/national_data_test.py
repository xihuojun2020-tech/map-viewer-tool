import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point


class NationalMapData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'web/atlas.json').read_text(encoding='utf-8'))
        cls.national=cls.data['national']

    def test_complete_gazetteer_roster_and_explicit_sketch_precision(self):
        units=self.national['commanderies']
        self.assertEqual(len(units),105)
        self.assertEqual(len({x['properties']['name'] for x in units}),105)
        self.assertEqual(len({x['properties']['province'] for x in units}),13)
        for unit in units:
            self.assertIn('概略',unit['properties']['precision'])
            self.assertIn('quote',unit['properties']['citation'])

    def test_published_geometry_and_county_anchors(self):
        places={x['id']:x for x in self.data['places']}
        for kind in ['commanderies','counties','frontier']:
            for item in self.national[kind]:
                with self.subTest(kind=kind,id=item['properties']['id']):
                    geometry=shape(item['geometry'])
                    self.assertTrue(geometry.is_valid)
                    if kind=='counties':self.assertTrue(geometry.covers(Point(places[item['properties']['place_id']]['coordinates'])))

    def test_phase_colors_and_regime_endings(self):
        for world in ['history','romance']:
            for frame in self.national[world]:
                colors=[f['properties']['color'] for f in frame['features']+self.national['frontier']]
                self.assertEqual(len(colors),len(set(colors)))
                for feature in frame['features']:self.assertTrue(shape(feature['geometry']).is_valid)
        last=self.national['history'][-1]
        self.assertEqual(last['position'],280)
        self.assertEqual({f['properties']['id'] for f in last['features']},{'jin'})

    def test_novel_source_anchors_are_not_chapter_titles(self):
        for frame in self.national['romance']:
            cite=frame['citation']
            self.assertGreater(cite['paragraph'],1)
            source_chapter=int(cite['source'].split('-')[-1])
            self.assertLessEqual(source_chapter*1000+cite['paragraph'],frame['position'])


if __name__=='__main__':unittest.main()
