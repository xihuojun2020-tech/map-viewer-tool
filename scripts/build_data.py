"""Publish verified editorial events, lexical name candidates and SQLite corpus."""
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3
from collections import Counter
from source_text import plain_text, reading_paragraphs
from build_spacetime import apply_spacetime

ROOT = Path(__file__).resolve().parents[1]


def load_corpus():
    corpus = {p.stem: json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT / 'data' / 'corpus').glob('*.json'))}
    for document in corpus.values():
        document['paragraphs'] = reading_paragraphs(document)
    return corpus


def converter():
    pairs = {}
    for line in (ROOT / 'web' / 'assets' / 'STCharacters.txt').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('\t')
            pairs[key] = value.split()[0]
    return lambda value: ''.join(pairs.get(char, char) for char in value)


def citation(corpus, source, phrase):
    doc = corpus[source]
    for paragraph in doc['paragraphs']:
        at = paragraph['text'].find(phrase)
        if at >= 0:
            text = paragraph['text']
            quote = text[max(0, at - 35): at + len(phrase)]
            display = paragraph['display_text']
            clean_phrase = plain_text(phrase)
            clean_at = display.find(clean_phrase)
            if clean_at < 0:
                continue  # A navigation heading is not an occurrence in the text.
            return {'source': source, 'title': doc['title'], 'paragraph': paragraph['id'],
                    'revision': doc['revision'], 'url': doc['url'], 'quote': quote, 'phrase': phrase,
                    'display_quote': display[max(0, clean_at - 35):clean_at + len(clean_phrase)]}
    raise ValueError(f'Quotation missing: {source}: {phrase}')


def main():
    data = json.loads((ROOT / 'data' / 'editorial' / 'catalog.json').read_text(encoding='utf-8'))
    data['calendar'] = json.loads((ROOT / 'web' / 'calendar.json').read_text(encoding='utf-8'))
    national = json.loads((ROOT / 'web' / 'national-map.json').read_text(encoding='utf-8'))
    data['national']={k:v for k,v in national.items() if k not in ('factions','sources')}
    data['factions']=national['factions']
    corpus = load_corpus()
    traditional = converter()
    people_by_name = {person['name']: person['id'] for person in data['people']}
    for event in data['events']:
        event['citation'] = citation(corpus, event['source'], event['phrase'])
        doc = corpus[event['source']]
        event['position'] = event['year'] if event['world'] == 'history' else doc['number'] * 1000 + event['citation']['paragraph']
        event['person_ids'] = [people_by_name[name] for name in event['people']]
    all_paragraphs = [(doc, p) for doc in corpus.values() for p in doc['paragraphs']]
    retained = []
    unmatched = []
    for person in data['people']:
        # These are literal name candidates. They do not prove identity, dates or historicity.
        names = list(dict.fromkeys([person['name'], traditional(person['name']), *person['aliases']]))
        mentions = []
        worlds = set()
        for doc, para in all_paragraphs:
            display = para['display_text']
            found = next((name for name in names if name in display and name in para['text']), None)
            if found:
                worlds.add(doc['world'])
                at = para['text'].index(found)
                clean_at = display.index(found)
                mentions.append({'source': doc['id'], 'paragraph': para['id'], 'world': doc['world'],
                                 'position': doc['number'] * 1000 + para['id'],
                                 'matched': found, 'quote': para['text'][max(0, at - 25): at + len(found) + 85],
                                 'display_quote':display[max(0, clean_at - 25):clean_at + len(found) + 85]})
        if mentions:
            person['aliases'] = names[1:]
            person['mention_count'] = len(mentions)
            person['worlds'] = sorted(worlds)
            person['mentions'] = mentions
            retained.append(person)
        else:
            unmatched.append({'name': person['name'], 'reason': '在本次文本中未匹配到种子名称；不得据此认定不存在或虚构。'})
    data['people'] = retained
    for person in data['people']:
        person['facts'] = []
    people = {p['name']:p for p in data['people']}
    profiles = json.loads((ROOT / 'data' / 'editorial' / 'profiles.json').read_text(encoding='utf-8'))
    for profile in profiles:
        cite = citation(corpus, profile['source'], profile['phrase'])
        doc = corpus[profile['source']]
        people[profile['name']]['facts'].append({**profile, 'citation':cite, 'world':doc['world'],
                                                'position':doc['number']*1000+cite['paragraph']})
    sources = [{'id': key, 'title': doc['title'], 'url': doc['url'], 'revision': doc['revision'],
                'world':doc['world'], 'number': doc['number'], 'paragraph_count': doc['paragraph_count'],
                'review_status':'已下载；逐段审核进度见覆盖统计'} for key,doc in corpus.items()]
    sources += [
        {'id':'editorial-geography','title':'本项目区域级地名定位','url':None,'review_status':'编辑参照点，不是古城址测绘资料',
         'note':'地点名称与文献逐步关联；坐标是今地或地区级锚点，地点卡保留待考项。'},
        {'id':'editorial-boundary','title':'本项目原创徐州样区概略范围','url':None,'review_status':'编辑示意，非考定州界',
         'note':'根据样区地点位置整理的示意轮廓；不来自CHGIS，不声称精确实控边界。'},
    ]
    data['sources'] = sources
    data['sources'].extend(national['sources'])
    apply_spacetime(data, corpus, citation)
    geography=json.loads((ROOT/'data/editorial/story-geography.json').read_text(encoding='utf-8'))
    research_water=json.loads((ROOT/'web/historical-water.json').read_text(encoding='utf-8'))
    features=[]
    for item in geography['features']:
        geometry=item['geometry']
        if 'append_research_path' in item:
            river=next(f for f in research_water['features'] if f['properties']['source_path']==item['append_research_path'])
            geometry['coordinates'].extend(river['geometry']['coordinates'][1:])
        quotes=[]
        for evidence in item['evidence']:
            cite=citation(corpus,evidence['source'],evidence['phrase'])
            quotes.append({**cite,'position':corpus[evidence['source']]['number']*1000+cite['paragraph']})
        properties={k:v for k,v in item.items() if k not in ('geometry','evidence','append_research_path')}
        features.append({'type':'Feature','geometry':geometry,'properties':{**properties,'citations':quotes}})
    data['story_geography']={'type':'FeatureCollection','note':geography['note'],'features':features}
    data['chapters'] = [{'number': d['number'], 'source':d['id'], 'paragraphs':d['paragraph_count'],
                         'reviewed_events':sum(e['source']==d['id'] for e in data['events'])}
                        for d in sorted(corpus.values(), key=lambda d:d['number']) if d['world']=='romance']
    data['coverage'] = {'downloaded': len(corpus), 'expected':185, 'history_volumes':sum(d['world']=='history' for d in corpus.values()),
                        'romance_chapters':sum(d['world']=='romance' for d in corpus.values()),
                        'places':len(data['places']), 'people_candidates':len(retained), 'unmatched_candidates':len(unmatched),
                        'events':len(data['events']), 'reviewed_sources':len({e['source'] for e in data['events']}),
                        'story_geography':len(features),
                        'history_events':sum(e['world']=='history' for e in data['events']),
                        'romance_events':sum(e['world']=='romance' for e in data['events']),
                        'profile_facts':len(profiles),
                        'activities':len(data['activities']),
                        'people_with_activities':len({r['person_id'] for r in data['activities'] if 'person_id' in r}),
                        'undated_activities':sum(r.get('time') is None for r in data['activities'] if r['world']=='history'),
                        'hydrology_records':len(data['hydrology']), 'administrative_changes':len(data['administrative_changes']),
                        'commanderies':len(national['commanderies']), 'county_sketches':len(national['counties']),
                        'frontier_regions':len(national['frontier']),
                        'note':'核心全文已保存，支持年/月/七日时段、人物活动与行政沿革。默认显示原著山川示意；全国逐月实控与人物行踪见"资料与来源"。'}
    history=[e for e in data['events'] if e['world']=='history']
    data['coverage']['time_precision']=dict(Counter(e['time']['precision'] for e in history))
    data['coverage']['control_precision']=dict(Counter(e['time']['precision'] for e in history if e['controls']))
    places={p['id']:p for p in data['places']}
    coverage={'note':'月份无记录不代表没有变化；点位接管不代表全郡县界或全国逐周资料已齐。',
        'time_precision':data['coverage']['time_precision'],'control_precision':data['coverage']['control_precision'],
        'by_year':dict(sorted(Counter(e['year'] for e in history).items())),
        'by_region':dict(Counter(places[p]['region'] for e in history for p in set(e['places']))),
        'by_kind':dict(Counter(e['kind'] for e in history)),
        'records':[{'id':e['id'],'title':e['title'],'time':e['time'],'places':e['places'],'controls':e['controls']} for e in history]}
    (ROOT/'research/chronology-coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8')
    output = ROOT / 'web' / 'atlas.json'
    if output.exists():
        previous = json.loads(output.read_text(encoding='utf-8'))
        previous_content = {k: v for k, v in previous.items() if k != 'built_at'}
        data['built_at'] = previous['built_at'] if data == previous_content else datetime.now(timezone.utc).isoformat()
    else:
        data['built_at'] = datetime.now(timezone.utc).isoformat()
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')),encoding='utf-8')
    (ROOT / 'research' / 'unmatched-names.json').write_text(json.dumps(unmatched, ensure_ascii=False, indent=2), encoding='utf-8')
    db_path = ROOT / 'data' / 'atlas.sqlite'
    db = sqlite3.connect(db_path)
    with db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,title TEXT,revision INTEGER,world TEXT,url TEXT);
        CREATE TABLE IF NOT EXISTS paragraphs(document_id TEXT,number INTEGER,text TEXT,PRIMARY KEY(document_id,number),FOREIGN KEY(document_id) REFERENCES documents(id));
        CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,type TEXT,name TEXT,json TEXT);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,world TEXT,position INTEGER,json TEXT);
        CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY,world TEXT,json TEXT);
        DELETE FROM paragraphs; DELETE FROM documents; DELETE FROM entities; DELETE FROM events; DELETE FROM activities;
        ''')
        for doc in corpus.values():
            db.execute('INSERT INTO documents VALUES(?,?,?,?,?)',(doc['id'],doc['title'],doc['revision'],doc['world'],doc['url']))
            db.executemany('INSERT INTO paragraphs VALUES(?,?,?)',[(doc['id'],p['id'],p['text']) for p in doc['paragraphs']])
        for kind, items in [('place',data['places']),('person',data['people']),('hydrology',data['hydrology']),('story_geography',[dict(f['properties'],geometry=f['geometry']) for f in features]),('administrative_change',[dict(r,name=r['title']) for r in data['administrative_changes']])]:
            db.executemany('INSERT INTO entities VALUES(?,?,?,?)',[(x['id'],kind,x['name'],json.dumps(x,ensure_ascii=False)) for x in items])
        db.executemany('INSERT INTO events VALUES(?,?,?,?)',[(x['id'],x['world'],x['position'],json.dumps(x,ensure_ascii=False)) for x in data['events']])
        db.executemany('INSERT INTO activities VALUES(?,?,?)',[(x['id'],x['world'],json.dumps(x,ensure_ascii=False)) for x in data['activities']])
    db.close()
    print(json.dumps(data['coverage'],ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
