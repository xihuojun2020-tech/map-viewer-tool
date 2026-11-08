import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from shapely.geometry import shape,Point
from shapely import union_all


class StrategicRegions(unittest.TestCase):
    def test_display_lines_share_fill_edges_without_double_strokes(self):
        data=json.loads((ROOT/'web/strategic-regions.json').read_text(encoding='utf-8'))
        cell_edges=union_all([shape(f['geometry']).boundary for f in data['features']])
        lines=[shape(f['geometry']) for f in data['display_boundaries']['features']]
        for line in lines:self.assertLess(line.difference(cell_edges).length,1e-8)
        self.assertAlmostEqual(sum(g.length for g in lines),union_all(lines).length,places=7)

    def test_faction_centres_stay_inside_current_owned_parcels(self):
        data=json.loads((ROOT/'web/strategic-regions.json').read_text(encoding='utf-8'))
        cells={f['properties']['id']:shape(f['geometry']) for f in data['features']}
        centres=json.loads((ROOT/'web/faction-labels.json').read_text(encoding='utf-8'))
        for key,centre in centres.items():
            area=union_all([cells[cell_id] for cell_id in key.split('|')])
            self.assertTrue(area.contains(Point(centre['coordinates'])),key)
            self.assertAlmostEqual(area.area,centre['area'])
            parts=[shape({'type':'Polygon','coordinates':p['rings']}) for p in centre['parts']]
            self.assertLess(area.symmetric_difference(union_all(parts)).area,1e-8)

    def test_display_coverage_centres_and_local_control(self):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        data=read('web/strategic-regions.json')
        cells=[shape(f['geometry']) for f in data['features']]
        self.assertTrue(all(g.is_valid and not g.is_empty for g in cells))
        merged=union_all(cells)
        self.assertLess(abs(sum(g.area for g in cells)-merged.area),1e-7)
        land=union_all([shape(f['geometry'])for f in read('web/reference.json')['land']['features']])
        self.assertLess(merged.difference(land).area,1e-7)
        for epoch,labels in data['province_labels'].items():
            self.assertEqual(len(labels),13)
            for label in labels:self.assertTrue(shape(label['geometry']).contains(Point(label['coordinates'])),(epoch,label['name']))
        places={p['id']:p for p in read('web/atlas.json')['places']}
        local=[f for f in data['features']if f['properties'].get('place_id')]
        self.assertEqual({f['properties']['place_id']for f in local},{'tan','xiapi','xiaopei','pengcheng','juancheng'})
        for f in local:self.assertTrue(shape(f['geometry']).covers(Point(places[f['properties']['place_id']]['coordinates'])))
        self.assertTrue(all('概略复原'in f['properties']['precision']for f in data['features']))

    def test_historical_water_retains_source_dispute(self):
        data=json.loads((ROOT/'web/historical-water.json').read_text(encoding='utf-8'))
        river=next(f for f in data['features'] if f['properties']['source_path']=='path4550')
        self.assertIn('争议',river['properties']['status'])
        self.assertEqual(river['properties']['source_path'],'path4550')
        self.assertTrue(shape(river['geometry']).is_valid)
        self.assertGreater(len(river['geometry']['coordinates']),2)
        self.assertIn('西汉',river['properties']['warning'])
        changban=[f for f in data['features'] if f['properties'].get('from_year')==208]
        self.assertEqual({f['properties']['source_path'] for f in changban},{'RivièreHan','Yangzi1','Yangzi2'})
        for f in changban:
            self.assertTrue(shape(f['geometry']).is_valid)
            self.assertEqual(f['properties']['license'],'CC BY-SA 3.0')
            self.assertIn('留出检验',f['properties']['warning'])
        report=json.loads((ROOT/'research/historical-water-build.json').read_text(encoding='utf-8'))['changban']
        self.assertEqual(len(report['controls']),5)
        self.assertGreater(report['leave_one_out_max_km'],50,'源图的低精度不得被拟合残差掩盖')


if __name__=='__main__':unittest.main()
