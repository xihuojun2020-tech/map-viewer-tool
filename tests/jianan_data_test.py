from collections import Counter
import json
from pathlib import Path
import sys
import unittest

import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point


class JiananData(unittest.TestCase):
    def test_source_paths_survive_projection_without_legend_samples_or_closure(self):
        source=json.loads((ROOT/'research/jianan-source-extraction.json').read_text(encoding='utf-8'))
        published=json.loads((ROOT/'web/jianan-boundaries.geojson').read_text(encoding='utf-8'))
        report=json.loads((ROOT/'research/jianan-georeference.json').read_text(encoding='utf-8'))
        originals=[f for f in published['features']if not f['properties'].get('junction_repair')]
        self.assertEqual(len(originals),138)
        self.assertEqual(Counter(f['properties']['kind']for f in originals),{'commandery':121,'province':14,'imperial':3})
        self.assertEqual(len(source['excluded_legend_paths']),5)
        coefficients=np.array(report['affine_coefficients'])
        for raw,feature in zip(source['boundaries'],originals):
            self.assertEqual(raw['id'],feature['properties']['source_path'])
            self.assertNotIn(raw['id'],source['excluded_legend_paths'])
            self.assertTrue(shape(feature['geometry']).is_valid)
            self.assertEqual(len(raw['points']),len(feature['geometry']['coordinates']))
            expected=np.column_stack([np.array(raw['points']),np.ones(len(raw['points']))])@coefficients
            self.assertTrue(np.allclose(expected,feature['geometry']['coordinates']))
        for repair in published['junction_repairs']:
            self.assertLessEqual(repair['gap_pixels'],repair['ink_overlap_pixels'])
        for label in published['labels']:
            if 'reference_area' in label:self.assertTrue(shape(label['reference_area']).contains(Point(label['coordinates'])))

    def test_withheld_controls_and_chinese_labels_have_explicit_scope(self):
        report=json.loads((ROOT/'research/jianan-georeference.json').read_text(encoding='utf-8'))
        self.assertEqual(Counter(c['role']for c in report['controls']),{'fit':24,'holdout':8})
        fit={tuple(c['source_svg'])for c in report['controls']if c['role']=='fit'}
        held={tuple(c['source_svg'])for c in report['controls']if c['role']=='holdout'}
        self.assertFalse(fit & held)
        self.assertLessEqual(report['median_holdout_km'],10)
        self.assertLessEqual(report['p90_holdout_km'],25)
        self.assertIn('同一地形',report['limits'][0])
        reference=json.loads((ROOT/'web/jianan-reference.json').read_text(encoding='utf-8'))
        self.assertEqual(len(reference['labels']),149)
        for label in reference['labels']:
            self.assertNotRegex(label['name'],'[A-Za-z]')
            self.assertTrue(label['note'])
            for review in label['epoch_reviews']:
                self.assertTrue(review['citations'])
                for cite in review['citations']:
                    self.assertNotRegex(cite['display_quote'],'[A-Za-z]')
        yiyang=next(p for p in reference['labels'] if p['name']=='义阳')
        self.assertIn('晚于219年',yiyang['epoch_reviews'][0]['note'])


if __name__=='__main__':unittest.main()
