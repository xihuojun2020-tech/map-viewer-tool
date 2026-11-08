"""Bounded extraction with content-addressed blocks and ordered publication."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

from analysis import MODEL, PROTOCOL, TIMELINE_PROTOCOL, analyze, resolve_result, needs_timeline_review, review_timeline, frame_context


def atomic_save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temp.replace(path)


def make_blocks(book, max_chars=4500):
    blocks, parts, preceding, size = [], [], book.get('context', ''), 0
    chapter_ends = {c['index']: c.get('paragraphStart', 1)+len(c['paragraphs'])-1 for c in book['chapters']}
    def flush():
        nonlocal parts, preceding, size
        if not parts: return
        identity = {'protocol': PROTOCOL, 'model': MODEL, 'title': book['title'],
                    'chapters': parts, 'context': preceding}
        identity['id'] = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        last = parts[-1]; end = last['paragraphStart']+len(last['paragraphs'])-1
        identity['completed'] = last['index'] if end == chapter_ends[last['index']] else last['index']-1
        identity['position'] = [last['index'], end]
        blocks.append(identity)
        preceding = (preceding+'\n'+'\n'.join(p for c in parts for p in c['paragraphs']))[-1200:]
        parts, size = [], 0
    for chapter in book['chapters']:
        for number, paragraph in enumerate(chapter['paragraphs'], chapter.get('paragraphStart', 1)):
            if size and size+len(paragraph) > max_chars: flush()
            if not parts or parts[-1]['index'] != chapter['index']:
                parts.append({'index': chapter['index'], 'title': chapter['title'], 'paragraphStart': number, 'paragraphs': []})
            parts[-1]['paragraphs'].append(paragraph); size += len(paragraph)
    flush()
    return blocks


def published(output, after=0):
    """Only a contiguous prefix is visible, regardless of response order."""
    manifest = output/'blocks.json'
    facts, temporal, completed, available, position = [], 'current', 0, 0, None
    if manifest.exists():
        blocks = json.loads(manifest.read_text(encoding='utf-8'))['blocks']
        for number, block in enumerate(blocks, 1):
            path = output/f'batch-{number:04}.json'
            if not path.exists(): break
            saved = json.loads(path.read_text(encoding='utf-8'))
            if saved['blockId'] != block['id']: raise ValueError('断点与正文版本不一致')
            if needs_timeline_review(saved['result'], temporal): break
            merged, temporal = resolve_result(saved['result'], temporal)
            if number > after: facts.extend(merged)
            available = number; completed = block['completed']; position = block['position']
    else:
        # Existing, reviewed books remain readable without re-analysis.
        for path in sorted(output.glob('batch-*.json')):
            saved = json.loads(path.read_text(encoding='utf-8'))
            if saved['chapters'][0] != completed+1: break
            available += 1; completed = saved['chapters'][-1]
            if available > after: facts.extend(saved['result']['facts'])
    return {'facts': facts, 'completed': completed, 'availableBlocks': available, 'position': position}


def reuse_prefix(previous, output, book):
    """A new immutable input revision may reuse only its unchanged block prefix."""
    output.mkdir(parents=True, exist_ok=True)
    if not previous or not (previous/'blocks.json').exists():
        return 0
    old = json.loads((previous/'blocks.json').read_text(encoding='utf-8'))['blocks']
    blocks = make_blocks(book)
    atomic_save(output/'blocks.json', {'protocol': PROTOCOL, 'blocks': [
        {k: b[k] for k in ('id', 'completed', 'position')} for b in blocks]})
    count = 0
    for number, (before, after) in enumerate(zip(old, blocks), 1):
        if before['id'] != after['id']:
            break
        name = f'batch-{number:04}.json'
        if (previous/name).exists():
            shutil.copy2(previous/name, output/name)
            count += 1
    return count


def process(book_path, output, limit=None, workers=2, max_batches=None, should_stop=lambda: False):
    book = json.loads(book_path.read_text(encoding='utf-8'))
    if limit: book = {**book, 'chapters': book['chapters'][:limit]}
    output.mkdir(parents=True, exist_ok=True)
    blocks = make_blocks(book)
    manifest = {'protocol': PROTOCOL, 'blocks': [{k: b[k] for k in ('id', 'completed', 'position')} for b in blocks]}
    manifest_path = output/'blocks.json'
    if manifest_path.exists():
        if json.loads(manifest_path.read_text(encoding='utf-8')) != manifest:
            raise ValueError('正文或提取协议已改变，请创建独立任务，原结果保留')
    elif any(output.glob('batch-*.json')):
        raise ValueError('旧版结果保留，请创建新版独立任务，不能混用断点')
    else: atomic_save(manifest_path, manifest)
    missing = []
    for i, block in enumerate(blocks, 1):
        path = output/f'batch-{i:04}.json'
        if not path.exists(): missing.append((i, block))
        elif json.loads(path.read_text(encoding='utf-8'))['blockId'] != block['id']:
            raise ValueError('断点与正文版本不一致')
    state = {'title': book['title'], 'total': len(book['chapters']), 'totalBlocks': len(blocks),
             'extractedBlocks': len(blocks)-len(missing), 'status': 'running'}
    def save():
        current = published(output)
        state.update({k: v for k, v in current.items() if k != 'facts'})
        state['updated'] = time.time(); atomic_save(output/'progress.json', state)
    def extract(item):
        i, block = item
        result, usage = analyze(block['chapters'], os.environ['MAPTOOL_API_KEY'],
                                'maptool-book-'+book['id'], block['context'], book['title'], output/f'response-{i:04}.json')
        return i, {'blockId': block['id'],
                   'chapters': [c['index'] for c in block['chapters']], 'result': result, 'usage': usage}
    def finalize():
        temporal, frame = 'current', ''
        for i, block in enumerate(blocks, 1):
            path = output/f'batch-{i:04}.json'
            if not path.exists(): break
            payload = json.loads(path.read_text(encoding='utf-8')); result = payload['result']
            if needs_timeline_review(result, temporal):
                if should_stop(): break
                transitions, usage = review_timeline(block['chapters'], os.environ['MAPTOOL_API_KEY'],
                    'maptool-book-'+book['id'], block['context'], temporal, output/f'timeline-{i:04}.json', frame)
                result.update(transitions=transitions, timelineProtocol=TIMELINE_PROTOCOL)
                payload['timelineUsage'] = usage; atomic_save(path, payload)
            for chapter, paragraph, change in result.get('transitions', []):
                frame = frame_context(book, chapter, paragraph) if change == 'memory' else ''
            _, temporal = resolve_result(result, temporal)
    save()
    failure = None
    # Submit at most workers requests at once; a failure does not launch the remaining book.
    selected = missing[:max_batches] if max_batches else missing
    try:
        finalize()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for offset in range(0, len(selected), workers):
                if should_stop(): break
                futures = [pool.submit(extract, item) for item in selected[offset:offset+workers]]
                for future in as_completed(futures):
                    try:
                        number, payload = future.result()
                        atomic_save(output/f'batch-{number:04}.json', payload)
                        state['extractedBlocks'] += 1
                    except Exception as error:
                        failure = error
                    finalize(); save()
                if failure: break
    except Exception as error:
        failure = error
    state['status'] = 'failed' if failure else 'completed' if state['availableBlocks'] == len(blocks) else 'queued'
    if failure: state['error'] = str(failure)
    save()
    if failure: raise failure
    return state['status']


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('book', type=Path); parser.add_argument('output', type=Path)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    process(args.book, args.output, args.limit)
