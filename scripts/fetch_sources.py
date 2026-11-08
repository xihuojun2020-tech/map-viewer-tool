"""Fetch a fixed, auditable text corpus through the public MediaWiki API."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data' / 'corpus'


def cached_record(key):
    result = json.loads((CACHE / f'{key}.json').read_text(encoding='utf-8'))
    return {k: result[k] for k in ('id', 'title', 'revision', 'paragraph_count', 'world', 'number', 'url')} | {'status': 'downloaded'}


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    items = [(f'sgz-{i:02}', f'三國志/卷{i:02}', 'history', i) for i in range(1, 66)]
    items += [(f'romance-{i:03}', f'三國演義/第{i:03}回', 'romance', i) for i in range(1, 121)]
    records = []
    pending = []
    for item in items:
        if (CACHE / f'{item[0]}.json').exists():
            records.append(cached_record(item[0]))
        else:
            pending.append(item)
    # Observed parse API HTTP 429: use the API's multi-title revision query,
    # reducing 185 separate expensive parse requests to <= 8 sequential batches.
    blocked = False
    for start in range(0, len(pending), 25):
        batch = pending[start:start + 25]
        if blocked:
            records.extend({'id': k, 'title': t, 'world': w, 'number': n, 'status': 'not_requested_rate_limited'} for k, t, w, n in batch)
            continue
        url = 'https://zh.wikisource.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'query', 'prop': 'revisions', 'rvprop': 'ids|timestamp|content',
            'rvslots': 'main', 'titles': '|'.join(x[1] for x in batch), 'format': 'json', 'formatversion': 2,
        })
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ThreeKingdomsReadingAtlas/0.1 (local research prototype)'})
            with urllib.request.urlopen(req, timeout=45) as response:
                payload = response.read()
            value = json.loads(payload)
            if 'error' in value:
                raise ValueError(value['error'])
            pages = {x['title']: x for x in value['query']['pages']}
            for key, title, world, number in batch:
                page = pages[title]
                if 'missing' in page:
                    records.append({'id': key, 'title': title, 'world': world, 'number': number, 'status': 'failed', 'error': 'Page missing'})
                    continue
                revision = page['revisions'][0]
                original = revision['slots']['main']['content']
                # Preserve original wikitext. Light display normalization only;
                # quotations are checked against these stored paragraphs at build time.
                display = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', original)
                paragraphs = [{'id': i + 1, 'text': text.strip()} for i, text in enumerate(re.split(r'\n\s*\n', display)) if text.strip()]
                result = {'id': key, 'title': title, 'world': world, 'number': number,
                          'revision': revision['revid'], 'url': f'https://zh.wikisource.org/w/index.php?oldid={revision["revid"]}',
                          'fetched_at': datetime.now(timezone.utc).isoformat(),
                          'api_response_sha256': sha256(payload).hexdigest(), 'format': 'wikitext',
                          'original_wikitext': original, 'paragraphs': paragraphs, 'paragraph_count': len(paragraphs),
                          'license_note': '维基文库固定修订；古代原文与网站现代整理权利分开，保留来源署名。',
                          'analysis_status': 'downloaded_not_fully_reviewed'}
                (CACHE / f'{key}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
                records.append({k: result[k] for k in ('id', 'title', 'revision', 'paragraph_count', 'world', 'number', 'url')} | {'status': 'downloaded'})
        except Exception as exc:
            # Report boundary failures; stop rather than hammer an explicitly rate-limited host.
            blocked = isinstance(exc, urllib.error.HTTPError) and exc.code == 429
            records.extend({'id': k, 'title': t, 'world': w, 'number': n, 'status': 'failed', 'error': str(exc)} for k, t, w, n in batch)
            print(f'Batch failed: {exc}', flush=True)
        print(f'corpus {len(records)}/{len(items)}', flush=True)
    records.sort(key=lambda x: x['id'])
    coverage = {'updated_at': datetime.now(timezone.utc).isoformat(), 'requested': len(items),
                'downloaded': sum(x['status'] == 'downloaded' for x in records),
                'meaning': '已下载不等于已抽取或已考证；正文与裴注尚需逐条区分。', 'texts': records}
    (ROOT / 'research').mkdir(exist_ok=True)
    (ROOT / 'research' / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in coverage.items() if k != 'texts'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
