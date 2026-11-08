"""Compile dated activities with independent temporal and location evidence."""
import json
import re
from pathlib import Path
from source_text import plain_text

ROOT = Path(__file__).resolve().parents[1]


def julian_day(year, month=1, day=1):
    a = (14-month)//12
    y, m = year+4800-a, month+12*a-3
    return day+(153*m+2)//5+365*y+y//4-32083


def time_range(date, calendars):
    if date is None:
        return None
    year = date['year']
    months = [m for m in calendars[date.get('calendar', 'han')] if year <= m['year'] <= date.get('until_year', year)]
    if 'month' in date:
        months = [m for m in months if m['month'] == date['month']]
    if 'season' in date:
        first = {'春':1, '夏':4, '秋':7, '冬':10}[date['season']]
        months = [m for m in months if first <= abs(m['month']) <= first+2]
    if not months:
        raise ValueError(f'No calendar interval for {date}')
    begin, end = months[0]['start'], months[-1]['end']
    precision = 'month' if 'month' in date else 'season' if 'season' in date else 'period' if 'until_year' in date else 'year'
    if 'day' in date:
        assert len(months) == 1, 'Repeated month must be disambiguated before dating an event'
        begin = end = begin+date['day']-1
        assert end <= months[0]['end']
        precision = 'day'
    if 'ganzhi' in date:
        stems, branches = '甲乙丙丁戊己庚辛壬癸', '子丑寅卯辰巳午未申酉戌亥'
        matches = [day for day in range(begin, end+1) if stems[(day+49)%10]+branches[(day+49)%12] == date['ganzhi']]
        assert len(matches) == 1, f'Ambiguous sexagenary day: {date}'
        begin = end = matches[0]
        precision = 'day'
    return {'start':begin, 'end':end, 'precision':precision, 'label':date['label'], 'original':date,
            'conversion':'公开历法复原；保留原文精度与政权历法差异'}


def apply_spacetime(data, corpus, citation):
    additions = json.loads((ROOT/'data/editorial/spacetime.json').read_text(encoding='utf-8'))
    calendars = data['calendar']['calendars']
    people = {p['name']:p['id'] for p in data['people']}
    extra_sources = {}

    def cite(spec):
        if 'source' in spec:
            return citation(corpus, spec['source'], spec['phrase'])
        archive = json.loads((ROOT/spec['archive']).read_text(encoding='utf-8'))
        page = next(p for p in archive['query']['pages'] if p['title'] == spec['title'])
        rev = page['revisions'][0]
        # Verify the selected excerpt, without interpreting unrelated page templates.
        text = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', rev['slots']['main']['content'])
        text = re.sub(r"'{2,5}", '', text)
        quote = plain_text(spec['phrase'])
        assert spec['phrase'] in rev['slots']['main']['content'] or quote in text, f'Quotation missing: {spec["title"]}: {quote}'
        key = 'supplement-'+str(page['pageid'])
        domain = 'wikipedia' if 'places-' in spec['archive'] else 'wikisource'
        item = {'source':key, 'title':page['title'], 'revision':rev['revid'], 'paragraph':'专题引文',
                'url':f'https://zh.{domain}.org/w/index.php?oldid={rev["revid"]}', 'display_quote':quote, 'quote':quote,
                'archive':spec['archive'],'phrase':spec['phrase']}
        extra_sources[key] = {'id':key, 'world':'history', 'title':page['title'], 'revision':rev['revid'],
            'url':item['url'], 'scope':'补充史料引文；未进行全篇活动编录', 'paragraph_count':0}
        return item

    for event in data['events']:
        if event['world'] == 'history':
            event['time'] = {'start':julian_day(event['year']), 'end':julian_day(event['year']+1)-1,
                'precision':'year', 'label':f'{event["year"]}年，月日待核', 'conversion':'沿用已有公元编年，尚未细化原历月份'}
    for override in additions['event_dates']:
        event = next(e for e in data['events'] if e['id'] == override['id'])
        quotes = [cite(c) for c in override['evidence']]
        event.update(time=time_range(override['date'], calendars), source=quotes[0]['source'],year=override['date']['year'],
            position=override['date']['year'], citation=quotes[0], citations=quotes,
            summary=override['summary'], uncertainty=override['uncertainty'])
    for place in additions['places']:
        published = {k:v for k,v in place.items() if k != 'evidence'}
        published['location_citations'] = [cite(c) for c in place['evidence']]
        assert not any(p['id'] == place['id'] for p in data['places'])
        data['places'].append(published)
    data['factions'].extend(additions['factions'])
    for event in additions['events']:
        quotes = [cite(c) for c in event['evidence']]
        entry = {k:v for k,v in event.items() if k not in ('evidence','date','armies')}
        entry.update(world='history', year=event['date']['year'], position=event['date']['year'],
            controls=event.get('controls',{}), citation=quotes[0], citations=quotes, source=quotes[0]['source'],
            person_ids=[people[name] for name in event['people']], time=time_range(event['date'],calendars),
            precision='时间按原文精度；地点为有说明的地域参照，不表示精确军营或战线。')
        data['events'].append(entry)
    data['activities'] = []
    for event in additions['events']:
        published = next(e for e in data['events'] if e['id'] == event['id'])
        for i, army in enumerate(event.get('armies', [])):
            data['activities'].append({**army, 'id':f'{event["id"]}-army-{i}', 'world':'history', 'entity_type':'army',
                'event_id':event['id'], 'time':published['time'], 'relation':'event', 'action':event['summary'],
                'citations':published['citations'], 'spatial_precision':'地域参照；战线与营地待考'})
    for record in additions['activities']:
        entry = {k:v for k,v in record.items() if k not in ('date','evidence','person')}
        entry['citations'] = [cite(c) for c in record['evidence']]
        if record.get('person'):
            entry['person_id'] = people[record['person']]
            entry['name'] = record['person']
        if record['world'] == 'history':
            entry['time'] = time_range(record['date'], calendars)
        else:
            first = entry['citations'][0]
            entry['position'] = corpus[first['source']]['number']*1000+first['paragraph']
            # Only locate the explicitly read passage, never project later travel.
            entry['until'] = entry['position']+1
        data['activities'].append(entry)
    data['hydrology'] = [{k:v for k,v in r.items() if k!='evidence'} | {'citations':[cite(c) for c in r['evidence']]} for r in additions['hydrology']]
    data['administrative_changes'] = [{k:v for k,v in r.items() if k not in ('evidence','date')} |
        {'time':time_range(r['date'],calendars),'citations':[cite(c) for c in r['evidence']]} for r in additions['administrative_changes']]
    data['sources'].extend(extra_sources.values())
