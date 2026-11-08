"""Repair source-ink junctions and place labels inside identified reference faces.

This produces research geometry, never certified ancient administrative borders.
Only gaps already covered by the two original SVG stroke widths are joined.
Coastal openings and larger gaps remain open; no modern shoreline is added.
"""
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.build-deps'))
from shapely.geometry import LineString, Point, mapping
from shapely.ops import unary_union, polygonize, polylabel
from source_text import plain_text


def main():
    read = lambda p: json.loads((ROOT / p).read_text(encoding='utf-8'))
    source = read('research/jianan-source-extraction.json')
    published = read('web/jianan-boundaries.geojson')
    affine = read('research/jianan-georeference.json')['affine_coefficients']
    def project(point):
        x, y = point
        return [x * affine[0][i] + y * affine[1][i] + affine[2][i] for i in range(2)]
    widths = {}
    for element in ET.parse(ROOT / 'web/assets/jianan-219.svg').getroot().iter():
        match = re.search(r'stroke-width:([\d.]+)', element.get('style', ''))
        if match:
            widths[element.get('id')] = float(match[1])
    records = source['boundaries']
    lines = [LineString(b['points']) for b in records]
    repairs = []
    connectors = []
    for index, (record, line) in enumerate(zip(records, lines)):
        for end, point in [(0, line.coords[0]), (-1, line.coords[-1])]:
            origin = Point(point)
            distance, target_index = min((origin.distance(other), j) for j, other in enumerate(lines) if j != index)
            if distance < 1e-7:
                continue
            target = records[target_index]
            ink_overlap = (widths[record['id']] + widths[target['id']]) / 2
            if distance > ink_overlap:
                continue
            destination = lines[target_index].interpolate(lines[target_index].project(origin))
            bridge = LineString([point, destination.coords[0]])
            connectors.append(bridge)
            repairs.append({'source_path': record['id'], 'endpoint': end, 'target_path': target['id'],
                'source_pixels': [list(point), list(destination.coords[0])], 'gap_pixels': distance,
                'ink_overlap_pixels': ink_overlap, 'basis': '两段原图笔画覆盖相交；仅连接中心线的源图绘制误差，不推断新的古界。'})
    faces = list(polygonize(unary_union(lines + connectors)))
    source_labels = {x['id']: x for x in source['labels']}
    labels = read('web/jianan-reference.json')['labels']
    # Only names with an explicit epoch review get a formal suffix. A 140 CE
    # kingdom name cannot establish the same status in the 219 reference.
    names = {n: n + '郡' for n in ['襄阳', '南乡', '新兴', '西平', '阴平', '乐平', '带方', '章武', '义阳', '临川', '谯', '乐陵']}
    candidates = {}
    for label in labels:
        original = source_labels[label['source_id']]
        center = [(original['x'] + original['end']) / 2, original['y'] - 5]
        candidates[label['source_id']] = center
    identities = {}
    for i, face in enumerate(faces):
        identities[i] = [l['source_id'] for l in labels if l['kind'] == '郡国名称' and face.contains(Point(candidates[l['source_id']]))]
    for label in labels:
        point = candidates[label['source_id']]
        label['source_anchor'] = [label['x'], label['y']]
        label['placement'] = '原图文字中部；尚未确认闭合辖区'
        if label['kind'] == '郡国名称':
            for i, face in enumerate(faces):
                if identities[i] == [label['source_id']]:
                    anchor = polylabel(face, tolerance=.5)
                    point = [anchor.x, anchor.y]
                    label['placement'] = '单一原图郡名对应研究面，内部视觉中心；年代与古界仍待考'
                    label['reference_area'] = mapping(face)
                    break
        label['coordinates'] = project(point)
        label['source_label_center'] = point
        label['full_name'] = names.get(label['name'], label['name']) if label['kind'] == '郡国名称' else label['name'] + '城'
    # Seeds checked against the source's province strokes and constituent names.
    # Several coastal provinces are open; seeds do not manufacture province faces.
    seeds = {'司隶':[1160,660], '冀州':[1530,470], '兖州':[1555,620], '青州':[1750,530],
        '徐州':[1680,740], '豫州':[1450,740], '荆州':[1300,1090], '扬州':[1640,1040],
        '益州':[900,1110], '凉州':[620,440], '并州':[1310,500], '幽州':[1730,330], '交州':[1150,1460]}
    published['province_labels'] = [{'name': name, 'coordinates': project(point), 'source_coordinates': point,
        'note': '建安研究底稿内部标注点；州界存在跨期建置，非逐年考定州域。'} for name, point in seeds.items()]
    # Rebuild from source every time; do not duplicate earlier connectors.
    published['features'] = [f for f in published['features'] if not f['properties'].get('junction_repair')]
    for i, repair in enumerate(repairs):
        kind = next(r['kind'] for r in records if r['id'] == repair['source_path'])
        published['features'].append({'type':'Feature', 'properties':{'id':f'join-{i}', 'kind':kind,
            'source_path':repair['source_path'], 'junction_repair':True, 'status':repair['basis']},
            'geometry':{'type':'LineString', 'coordinates':[project(p) for p in repair['source_pixels']]}})
    published['labels'] = labels
    published['junction_repairs'] = repairs
    pages = read('data/references/late-han-seats-api.json')['query']['pages']
    seat_specs = [
        ('xiangyang', 'commandery', '襄阳郡治', '襄阳郡', '[[治所]]在[[襄阳县]]（今[[湖北省]][[襄阳市]][[汉水]]南[[襄城区]]）'),
        ('xiapi', 'commandery', '下邳郡治', '下邳郡', '[[治所]]在[[下邳县]]（今[[江苏省]][[睢宁县]]西北）'),
        ('pengcheng', 'commandery', '彭城郡国治所参考', '彭城郡', "郡治在'''彭城縣'''（縣治在今[[江蘇省]][[徐州市]]）"),
        ('xu', 'capital', '汉帝驻跸许都', '颍川郡', '[[曹操]]迁[[汉献帝]]到郡内许县，这里成为东汉名义上的首都'),
    ]
    published['seat_records'] = []
    for place_id, level, role, title, quote in seat_specs:
        page = next(p for p in pages if p['title'] == title)
        rev = page['revisions'][0]
        assert quote in rev['slots']['main']['content']
        published['seat_records'].append({'place_id':place_id, 'level':level, 'role':role, 'reference_year':219,
            'note':'建安断面治所参考，采用有修订号的二手地理资料；不表示全部年代身份相同。',
            'citation':{'title':'维基百科·'+title, 'revision':rev['revid'], 'paragraph':'治所沿革（二手资料）',
                'url':f'https://zh.wikipedia.org/w/index.php?oldid={rev["revid"]}', 'display_quote':plain_text(quote)}})
    for label in published['labels']:
        if 'reference_area' in label:
            label['reference_area']['coordinates'] = [[project(p) for p in ring] for ring in label['reference_area']['coordinates']]
    (ROOT/'web/jianan-boundaries.geojson').write_text(json.dumps(published, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    print(json.dumps({'source_ink_joins':len(repairs), 'labels_inside_identified_reference_faces':sum('reference_area' in l for l in labels), 'labels':len(labels)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
