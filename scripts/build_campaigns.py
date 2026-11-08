"""Publish source-checked campaign directions without rebuilding political cells."""
import json
from pathlib import Path

from build_data import citation, load_corpus
from build_spacetime import time_range

ROOT = Path(__file__).resolve().parents[1]


def main():
    spec = json.loads((ROOT / 'data/editorial/campaigns.json').read_text(encoding='utf-8'))
    atlas = json.loads((ROOT / 'web/atlas.json').read_text(encoding='utf-8'))
    corpus = load_corpus()
    places = {p['id']: p for p in atlas['places'] + spec['anchors']}
    events = {e['id']: e for e in atlas['events']}
    factions = {f['id'] for f in atlas['factions']}
    records = []
    for record in spec['campaigns']:
        item = {k: v for k, v in record.items() if k not in ('evidence', 'date', 'chapter')}
        item['citations'] = []
        for evidence in record['evidence']:
            if 'event' in evidence:
                event = events[evidence['event']]
                assert event['world'] == record['world'], record['id']
                item['citations'].extend(event['citations'])
            else:
                assert evidence['source'].startswith('sgz-' if record['world'] == 'history' else 'romance-')
                item['citations'].append(citation(corpus, evidence['source'], evidence['phrase']))
        if record['world'] == 'history':
            item['time'] = time_range(record['date'], atlas['calendar']['calendars'])
        else:
            chapter = record['chapter']
            assert all(c['source'] == f'romance-{chapter:03}' for c in item['citations'])
            item['position'] = chapter * 1000 + max(c['paragraph'] for c in item['citations'])
            item['until'] = (chapter + 1) * 1000
            item['chapter'] = chapter
        for side in ('attacker', 'defender'):
            assert item[side]['faction'] in factions, record['id']
            assert (ROOT / f"web/models/{item[side]['model']}.png").is_file()
        for endpoint in ('origin', 'target'):
            if record[endpoint] is None:
                continue
            place = places[record[endpoint]]
            item[endpoint] = {k: place[k] for k in ('id', 'name', 'coordinates', 'precision', 'location_note')}
            if 'location_source' in place:
                item[endpoint]['location_source'] = place['location_source']
        records.append(item)
    assert len({r['id'] for r in records}) == len(records)
    publication = {'note': '已核战役：箭头表示文献所载进攻方向；覆盖进度见"资料与来源"。', 'campaigns': records}
    (ROOT / 'web/campaigns.json').write_text(json.dumps(publication, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'已生成 {len(records)} 条战役，其中 {sum(bool(r["origin"]) for r in records)} 条有方向箭头')


if __name__ == '__main__':
    main()
