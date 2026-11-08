"""Build explicitly approximate display parcels from the published source linework.

The author-drawn borders constrain region growth. Open gaps are interpolated for
display, not promoted to ancient boundaries. Modern land clips the display only.
"""
from collections import defaultdict
from heapq import heappush, heappop
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.build-deps'))
from shapely import union_all, coverage_simplify
from shapely.geometry import shape, mapping, Polygon, Point, box
from shapely.ops import transform, polylabel


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def interior_center(geometry):
    """Place in the largest visible part, in the same projection as the map."""
    earth = 6378137
    def forward(x, y):
        return math.radians(x) * earth, earth * math.log(math.tan(math.pi / 4 + math.radians(y) / 2))
    def inverse(x, y):
        return math.degrees(x / earth), math.degrees(2 * math.atan(math.exp(y / earth)) - math.pi / 2)
    area = transform(forward, geometry)
    if area.geom_type == 'MultiPolygon':
        area = max(area.geoms, key=lambda p: p.area)
    point = polylabel(area, tolerance=750)
    return list(inverse(point.x, point.y))


def display_boundaries(features):
    """Draw administrative edges from the same coverage as the political fill.

    Dissolve local control parcels before drawing commanderies: those splits
    describe display ownership, not newly attested administrative boundaries.
    """
    districts = defaultdict(list)
    provinces = defaultdict(list)
    for feature in features:
        props = feature['properties']
        geometry = shape(feature['geometry'])
        districts[props['source_name']].append(geometry)
        provinces[props['province']].append(geometry)
    district_edges = union_all([union_all(parts).boundary for parts in districts.values()])
    province_edges = union_all([union_all(parts).boundary for parts in provinces.values()])
    outer = union_all([shape(f['geometry']) for f in features]).boundary
    edges = {'commandery': district_edges.difference(province_edges),
             'province': province_edges.difference(outer), 'imperial': outer}
    return {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': {'kind': kind,
         'precision': '概略复原显示边界，与填色共用几何；原始研究线另见出处页。'},
         'geometry': mapping(geometry)} for kind, geometry in edges.items()]}


def refine_display_coverage(features):
    # Remove raster stair steps as a coverage, retaining shared edges and the
    # existing outer footprint. This is display generalisation, not new evidence.
    geometries = coverage_simplify([shape(f['geometry']) for f in features],
                                  .08, simplify_boundary=False)
    for feature, geometry in zip(features, geometries):
        feature['geometry'] = mapping(geometry)


def partition(domain, lines, seeds, bounds, width):
    """Offline, source-constrained interpolation; no randomness or invented bends."""
    west, south, east, north = bounds
    step = (east - west) / width
    height = math.ceil((north - south) / step)
    def pixel(x, y):
        return (x - west) / step, (north - y) / step
    def paint_polygon(draw, polygon):
        draw.polygon([pixel(x, y) for x, y in polygon.exterior.coords], fill=1)
        for ring in polygon.interiors:
            draw.polygon([pixel(x, y) for x, y in ring.coords], fill=0)
    mask = Image.new('L', (width, height)); draw = ImageDraw.Draw(mask)
    for polygon in domain.geoms if domain.geom_type == 'MultiPolygon' else [domain]:
        paint_polygon(draw, polygon)
    valid = np.asarray(mask).astype(bool)
    ink = Image.new('L', (width, height)); draw = ImageDraw.Draw(ink)
    for line in lines:
        for part in line.geoms if line.geom_type == 'MultiLineString' else [line]:
            draw.line([pixel(x, y) for x, y in part.coords], fill=1, width=1)
    barrier = np.asarray(ink).astype(bool)
    distance = np.full((height, width), np.inf)
    labels = np.full((height, width), -1, dtype=np.int32)
    queue = []
    for index, point in enumerate(seeds):
        x, y = (int(v) for v in pixel(*point))
        if not (0 <= x < width and 0 <= y < height and valid[y, x]):
            raise ValueError(f'Source anchor outside display land: {index}, {point}')
        if barrier[y, x]:
            raise ValueError(f'Source anchor lies on a drawn separator: {index}, {point}')
        if labels[y, x] != -1:
            raise ValueError(f'Two source anchors in one raster cell: {index}')
        distance[y, x] = 0; labels[y, x] = index
        heappush(queue, (0, y, x, index))
    # Drawn separators are walls. A component without a named source anchor
    # remains unassigned; it must not become a vast invented western territory.
    neighbours = [(dx, dy, math.hypot(dx, dy)) for dx in [-1, 0, 1] for dy in [-1, 0, 1] if dx or dy]
    while queue:
        cost, y, x, label = heappop(queue)
        if cost != distance[y, x]:
            continue
        for dx, dy, length in neighbours:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < width and 0 <= ny < height and valid[ny, nx]):
                continue
            if barrier[ny,nx] or (dx and dy and (barrier[y,nx] or barrier[ny,x])):
                continue
            value = cost + length
            if value < distance[ny, nx]:
                distance[ny, nx] = value; labels[ny, nx] = label
                heappush(queue, (value, ny, nx, label))
    # Assign only the drawn ink itself to adjacent parcels. Without this pass,
    # a one-pixel separator disconnects every county and a province's "largest
    # component" is just one county, which places its label off-centre.
    queue=[]
    for y,x in np.argwhere(valid & barrier):
        for dx,dy,length in neighbours:
            nx,ny=int(x)+dx,int(y)+dy
            if 0<=nx<width and 0<=ny<height and labels[ny,nx]>=0:
                heappush(queue,(length,int(y),int(x),int(labels[ny,nx])))
    while queue:
        cost,y,x,label=heappop(queue)
        if labels[y,x]>=0:continue
        labels[y,x]=label
        for dx,dy,length in neighbours:
            nx,ny=x+dx,y+dy
            if 0<=nx<width and 0<=ny<height and valid[ny,nx] and barrier[ny,nx] and labels[ny,nx]<0:
                heappush(queue,(cost+length,ny,nx,label))
    # Convert horizontal runs, then simplify the whole coverage together so
    # adjacent parcels retain a shared edge instead of separate rounded borders.
    runs = defaultdict(list)
    for y, row in enumerate(labels):
        changes = np.r_[0, np.flatnonzero(np.diff(row)) + 1, width]
        for x0, x1 in zip(changes[:-1], changes[1:]):
            label = int(row[x0])
            if label >= 0:
                runs[label].append(box(west + x0 * step, north - (y + 1) * step,
                                       west + x1 * step, north - y * step))
    cells = [union_all(runs[i]) for i in range(len(seeds))]
    cells = coverage_simplify(cells, step * 1.2)
    return [cell.intersection(domain) for cell in cells]


def main():
    atlas = read('web/atlas.json')
    reference = read('web/reference.json')
    land = union_all([shape(f['geometry']) for f in reference['land']['features']])
    source = read('web/jianan-boundaries.geojson')
    originals = {f['properties']['source_path']: shape(f['geometry']) for f in source['features']
                 if not f['properties'].get('junction_repair')}
    # The source's open outer strokes form the study envelope. The eastward
    # closure is offshore; the land intersection is modern, not an ancient coast.
    north = list(originals['path10984'].coords)
    south = list(originals['path10986'].coords)
    korea = list(originals['path10988'].coords)
    envelope = Polygon(north + korea + [(136, 16), (south[-1][0], 16)] + south[::-1])
    assert envelope.is_valid
    domain = land.intersection(envelope)
    labels = [l for l in source['labels'] if l['kind'] == '郡国名称']
    regions = partition(domain, [shape(f['geometry']) for f in source['features']], [l['coordinates'] for l in labels], [90, 16, 136, 49], 1380)
    roster = {p['properties']['name']: p['properties'] for p in atlas['national']['commanderies']}
    normalize = lambda name: name[:-1] if name[-1] in '郡国尹' else name
    names = {normalize(name): name for name in roster}
    # These bind a source-era display district to a broad phase background. They
    # do not assert that an earlier administrative unit already had its later name.
    aliases = {'新兴':'太原郡','乐平':'太原郡','汉兴':'右扶风','西平':'金城郡','西郡':'张掖郡',
        '西海':'张掖居延属国','博陵':'安平国','章武':'勃海郡','渤海':'勃海郡','乐陵':'平原郡',
        '带方':'乐浪郡','东莞':'琅邪国','利城':'东海郡','谯郡':'沛国','义阳':'南阳郡',
        '蕲春':'江夏郡','鄱阳':'豫章郡','新都':'丹阳郡','临川':'丹阳郡','庐陵':'豫章郡',
        '章陵':'南阳郡','襄阳':'南郡','南乡':'南阳郡','上庸':'汉中郡','固陵':'巴郡',
        '巴西':'巴郡','宕渠':'巴郡','汶山':'蜀郡','朱提':'犍为郡','江阳':'犍为郡',
        '阴平':'广汉属国','梓潼':'广汉郡','西城':'汉中郡','宜都':'南郡','房陵':'汉中郡',
        '城阳':'琅邪国','甘陵':'清河国'}
    records = []
    for label, geometry in zip(labels, regions):
        parent = aliases.get(label['name']) or names[normalize(label['name'])]
        records.append({'id': label['source_id'], 'name': label['full_name'], 'source_name': label['name'],
            'phase_key': parent, 'province': roster[parent]['province'], 'geometry': geometry,
            'label': interior_center(geometry), 'source_anchor': label['coordinates'],
            'precision': '概略复原：沿建安底稿线网插补显示区块，缺口由算法分配；不是考定古郡县界。'})
    # Explicit town control applies to one local display parcel, never the entire
    # parent district. Only places that actually have control records are split.
    controlled = {p for e in atlas['events'] for p in e['controls']}
    controlled.add('juancheng')  # 194 phase: Cao retained Juancheng during the revolt.
    places = [p for p in atlas['places'] if p['id'] in controlled and p['kind'] != '区域']
    from shapely import voronoi_polygons
    from shapely.geometry import MultiPoint
    features = []
    for record in records:
        geometry = record.pop('geometry')
        towns = [p for p in places if geometry.covers(Point(p['coordinates']))]
        if towns:
            # One seed reserves the unrecorded remainder of this district. Its
            # colour follows the phase; town records only change their own cell.
            seeds = [p['coordinates'] for p in towns] + [record['label']]
            parts = voronoi_polygons(MultiPoint(seeds), extend_to=geometry.envelope, ordered=True).geoms
            for i, part in enumerate(parts):
                cell = part.intersection(geometry)
                props = {**record, 'id': record['id'] + (f'-{towns[i]["id"]}' if i < len(towns) else '-remainder')}
                if i < len(towns):
                    props.update(place_id=towns[i]['id'], name=towns[i]['name'] + '显示区块',
                        precision='概略复原：为单独地点记录划分的显示区块，不是历史县域或实测占领线。')
                features.append({'type':'Feature','properties':props,'geometry':mapping(cell)})
        else:
            features.append({'type':'Feature','properties':record,'geometry':mapping(geometry)})
    refine_display_coverage(features)
    provinces = []
    for province in read('web/han-administration.json')['provinces']:
        area = union_all([shape(f['geometry']) for f in features if f['properties']['province'] == province['name']])
        provinces.append({'name':province['name'],'coordinates':interior_center(area),'geometry':mapping(area),
            'note':'按本显示区块集合计算的内部视觉中心；沿用十三州分组，不等同逐年建置。'})
    # The 140 reference has its own outline and its own centres. It must not use
    # labels calculated from the differently dated Jian'an source.
    early = read('web/han-administration.json')
    outer = {f['properties']['source_path']:shape(f['geometry']) for f in early['features'] if f['properties']['kind'] == 'outer' and not f['properties'].get('junction_repair')}
    # Both outer strokes were split by the source crop. Join only along that
    # crop for the label/display extent, not as a published ancient border.
    early_north = [p for line in outer['path3759'].geoms for p in line.coords]
    early_south = [p for line in outer['path2987'].geoms for p in line.coords]
    early_domain = Polygon(early_north + [(125.7,18)] + early_south).intersection(land).intersection(box(*early['bounds']))
    assert early_domain.is_valid
    early_seeds = [p['label'] for p in early['provinces']]
    early_areas = partition(early_domain, [shape(f['geometry']) for f in early['features']], early_seeds, early['bounds'], 1048)
    early_labels = [{'name':p['name'],'coordinates':interior_center(g),'geometry':mapping(g),
        'note':'依据约140年底稿的可见范围求内部中心；裁切外缘及源图缺口仍为概略范围。'} for p,g in zip(early['provinces'], early_areas)]
    result = {'type':'FeatureCollection','features':features,'display_boundaries':display_boundaries(features),'province_labels':{'140':early_labels,'219':provinces},
        'history':read('data/editorial/territory-phases.json')['history'],
        'source_url':'https://commons.wikimedia.org/wiki/File:Jian%27an_Commanderies.svg',
        'author':'Esiymbro；约140年底稿：Zunkir、Kanguole','license':'CC BY-SA 4.0',
        'note':'用户授权的概略复原显示区块。原图线网约束区域分配，缺口由算法插补，沿现代海陆裁切。分区轮廓、分期归属和有引文的地点记录分别标注；不称逐年考定疆界。'}
    (ROOT/'web/strategic-regions.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'source_districts':len(labels),'display_cells':len(features),'local_control_cells':len(places),
        'province_labels':{k:len(v) for k,v in result['province_labels'].items()}},ensure_ascii=False))


if __name__ == '__main__':
    main()
