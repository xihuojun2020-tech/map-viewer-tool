"""Check the reviewed copy-only fields against a supplied published snapshot."""
import argparse
import hashlib
import json
from pathlib import Path
import re

COPY_PATHS = {
    'atlas.json': {
        '/places/*/location_note', '/places/*/precision', '/people/*/status',
        '/events/*/precision', '/events/*/time/label', '/events/*/uncertainty',
        '/events/*/summary', '/events/*/time/original/label', '/rivers/*/note',
        '/differences/*/text', '/calendar/calendars/han/*/note', '/calendar/note',
        '/national/precision', '/national/commandery_epoch',
        '/national/commanderies/*/properties/precision', '/national/frontier/*/properties/precision',
        '/national/history/*/note', '/national/romance/*/note', '/sources/*/review_status',
        '/activities/*/note', '/activities/*/spatial_precision', '/activities/*/action',
        '/activities/*/time/label', '/activities/*/time/original/label',
        '/administrative_changes/*/summary', '/story_geography/note',
        '/story_geography/features/*/properties/precision', '/story_geography/features/*/properties/geometry_note',
        '/story_geography/features/*/properties/summary', '/coverage/note', '/built_at',
    },
    'strategic-regions.json': {
        '/features/*/properties/precision', '/province_labels/140/*/note', '/history/*/note', '/note',
    },
}
# These reviewed display labels are not identifiers or geographic names.
LABEL_CHANGES = {
    '/people/*/group': {('女性、医者及其他角色', '女性与医者'), ('女性、医者及其他角色', '女性、医者等人物')},
    '/activities/*/name': {('刘辟等部（记载冲突待核）', '刘辟等部（记载冲突待考）')},
    '/national/frontier/*/properties/kind': {('政权概略范围', '政权范围（示意）'), ('诸国概略范围', '诸国范围（示意）')},
    '/national/history/*/features/*/properties/kind': {('阶段势力概略范围', '阶段势力示意区')},
    '/national/romance/*/features/*/properties/kind': {('阶段势力概略范围', '阶段势力示意区')},
}


def changes(before, after, path=''):
    if before == after:
        return
    if type(before) != type(after):
        raise ValueError('字段类型变化：'+path)
    if isinstance(before, dict):
        if before.keys() != after.keys():
            raise ValueError('字段集合变化：'+path)
        for key in before:
            yield from changes(before[key], after[key], path+'/'+key)
    elif isinstance(before, list):
        if len(before) != len(after):
            raise ValueError('记录数量变化：'+path)
        for index, (a, b) in enumerate(zip(before, after)):
            yield from changes(a, b, path+'/'+str(index))
    else:
        yield path, before, after


def check(before, after, name):
    result = list(changes(before, after))
    for path, a, b in result:
        pattern = re.sub(r'/\d+(?=/|$)', '/*', path)
        # A numeric year is a field name, not an array index.
        if path.startswith('/province_labels/140/'):
            pattern = pattern.replace('/province_labels/*/', '/province_labels/140/', 1)
        if not isinstance(a, str) or not isinstance(b, str):
            raise ValueError('非文案变化：'+path)
        if pattern not in COPY_PATHS[name] and (name != 'atlas.json' or (a, b) not in LABEL_CHANGES.get(pattern, set())):
            raise ValueError('未经审核的字段变化：'+path)
    return len(result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path, help='已发布的 web 目录')
    parser.add_argument('candidate', type=Path, help='候选 web 目录')
    args = parser.parse_args()
    result = {}
    for name in COPY_PATHS:
        baseline = (args.baseline/name).read_bytes()
        candidate = (args.candidate/name).read_bytes()
        result[name] = {'changes': check(json.loads(baseline), json.loads(candidate), name),
                        'sha256': hashlib.sha256(candidate).hexdigest()}
    print(json.dumps(result, ensure_ascii=False, indent=2))
