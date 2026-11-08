"""Compute centres of actual display unions using the existing map projection."""
import json
import sys
from build_strategic_regions import ROOT, read, interior_center
from shapely import union_all
from shapely.geometry import shape

regions = read('web/strategic-regions.json')
cells = {f['properties']['id']: shape(f['geometry']) for f in regions['features']}
centres = {}
for key in json.load(sys.stdin):
    area = union_all([cells[cell_id] for cell_id in key.split('|')])
    parts = list(area.geoms) if area.geom_type == 'MultiPolygon' else [area]
    centres[key] = {'coordinates': interior_center(area), 'area': area.area,
                    'parts': [{'coordinates': interior_center(part),
                               'rings': [list(part.exterior.coords), *[list(r.coords) for r in part.interiors]]}
                              for part in sorted(parts, key=lambda p: p.area, reverse=True)]}
(ROOT / 'web/faction-labels.json').write_text(
    json.dumps(centres, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'faction_label_centres': len(centres)}))
