"""Publish a Chinese, source-shaped reference without Latin source artwork."""
import base64
from hashlib import sha256
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from source_text import plain_text

ROOT = Path(__file__).resolve().parents[1]


def main():
    original = ROOT / 'web/assets/jianan-219.svg'
    license_record = json.loads((ROOT / 'research/jianan-reference-license.json').read_text(encoding='utf-8'))
    assert sha256(original.read_bytes()).hexdigest() == license_record['sha256']
    extraction = json.loads((ROOT / 'research/jianan-source-extraction.json').read_text(encoding='utf-8'))
    editorial = json.loads((ROOT / 'data/editorial/jianan-labels.json').read_text(encoding='utf-8'))
    reviews = json.loads((ROOT / 'data/editorial/jianan-epoch-review.json').read_text(encoding='utf-8'))
    source_labels = {p['id']:p for p in extraction['labels']}
    labels = []
    for entry in editorial['labels']:
        record = source_labels[entry['source_id']]
        assert record['text'] == entry['source_text']
        label={k:entry[k] for k in ('source_id','name','kind','note')} | {'x':record['x'], 'y':record['y'], 'epoch_reviews':[]}
        for review in reviews['records']:
            if entry['kind']!='郡国名称' or entry['name'] not in review['labels']:
                continue
            citations=[]
            for evidence in review['evidence']:
                archive=json.loads((ROOT/evidence['archive']).read_text(encoding='utf-8'))
                if 'title' in evidence:
                    page=next(p for p in archive['query']['pages'] if p['title']==evidence['title'])
                    revision=page['revisions'][0]
                    original_text=revision['slots']['main']['content']
                    revision_id=revision['revid']; title=page['title']
                else:
                    original_text='\n'.join(p['text']for p in archive['paragraphs'])
                    revision_id=archive['revision']; title=archive['title']
                assert evidence['quote'] in original_text
                citations.append({'title':title,'revision':revision_id,'url':f'https://zh.wikisource.org/w/index.php?oldid={revision_id}',
                                  'display_quote':plain_text(evidence['quote'])})
            label['epoch_reviews'].append({'note':review['note'],'citations':citations})
        labels.append(label)
    raster = next(e for e in ET.parse(original).getroot().iter() if e.tag.endswith('}image'))
    payload = base64.b64decode(raster.attrib['{http://www.w3.org/1999/xlink}href'].split(',',1)[1])
    (ROOT / 'web/assets/jianan-terrain.jpg').write_bytes(payload)
    result = {'year':219, 'title':'建安郡国边界研究底稿', 'width':2500, 'height':1800,
              'coordinate_status':'本页保留原图坐标；主地图另载配准研究边线，古界另行考定。', 'label_scope':editorial['review_scope'],
              'terrain':'assets/jianan-terrain.jpg', 'labels':labels, 'boundaries':extraction['boundaries'],
              'source_url':license_record['source_page'], 'license_url':license_record['license_url'],
              'source_sha256':license_record['sha256']}
    (ROOT / 'web/jianan-reference.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'中文名称':len(labels), '源图边线':len(result['boundaries']), '本页坐标':'原图坐标；地理配准由独立脚本构建'},ensure_ascii=False))


if __name__ == '__main__':
    main()
