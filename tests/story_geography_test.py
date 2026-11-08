import json
from pathlib import Path
import sys
import unittest
import sqlite3

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point

class StoryGeography(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'web/atlas.json').read_text(encoding='utf-8'))
        cls.features={f['properties']['id']:f for f in cls.data['story_geography']['features']}

    def test_reading_landmarks_have_original_mentions_and_explicit_approximation(self):
        self.assertEqual(len(self.features),25)
        with sqlite3.connect(ROOT/'data/atlas.sqlite') as db:
            saved={id:json.loads(value) for id,value in db.execute("SELECT id,json FROM entities WHERE type='story_geography'")}
        self.assertEqual(set(saved),set(self.features))
        for feature in self.features.values():
            props=feature['properties'];geometry=shape(feature['geometry'])
            self.assertEqual(saved[props['id']],dict(props,geometry=feature['geometry']))
            self.assertTrue(geometry.is_valid)
            self.assertLess(geometry.distance(Point(props['label'])),1e-8)
            self.assertIn('阅读场景示意',props['precision'])
            for cite in props['citations']:
                doc=json.loads((ROOT/'data/corpus'/f'{cite["source"]}.json').read_text(encoding='utf-8'))
                paragraph=next(p for p in doc['paragraphs'] if p['id']==cite['paragraph'])
                self.assertIn(cite['phrase'],paragraph['text'])
                self.assertEqual(cite['position'],doc['number']*1000+paragraph['id'])
        yi=self.features['story-yi']['properties']['citations'][0]
        self.assertEqual(yi['source'],'romance-019','沂水侯的爵号不得作为河流场景依据')

    def test_main_confluences_read_as_connected_waterways(self):
        for tributary,main in [('han','yangtze'),('wei','yellow'),('luo','yellow'),('si','huai'),('yi','si'),('bai','han'),('ruxu','yangtze')]:
            a=self.features[f'story-{tributary}'];b=self.features[f'story-{main}']
            self.assertLess(shape(b['geometry']).distance(Point(a['geometry']['coordinates'][-1])),1e-8,(tributary,main))
        for id in ['story-dongting','story-poyang']:
            self.assertEqual(self.features[id]['geometry']['type'],'Point','湖泊只定位，不生成无依据的古湖界')

if __name__=='__main__':unittest.main()
