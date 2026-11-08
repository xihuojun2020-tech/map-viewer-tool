"""Compile once per contiguous result revision, then publish immutable bytes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
from book_worker import atomic_save

COMPILE_LOCK = threading.Lock()
PROJECT = Path(os.environ.get('MAPTOOL_COMPILER_ROOT', Path(__file__).resolve().parents[1]))


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def map_versions():
    actual = {'baseMapId': 'jianan-219', 'baseMapRevision': digest((PROJECT/'web/strategic-regions.json').read_bytes()),
              'atlasRevision': digest((PROJECT/'web/atlas.json').read_bytes()), 'sceneSchemaVersion': 1}
    catalog = json.loads((PROJECT/'web/map-compatibility.json').read_text(encoding='utf-8'))
    if not any(all(actual[key] == pair[key] for key in ('baseMapRevision', 'atlasRevision')) for pair in catalog['pairs']):
        raise ValueError('服务器底图版本尚未登记，请核对发布资料')
    return actual, catalog['canonical']


def versions():
    _, canonical = map_versions()
    return {**canonical, 'compilerVersion': digest((PROJECT/'web/scene/compile.mjs').read_bytes()+(PROJECT/'scripts/compile_layer.mjs').read_bytes())}


def publish(root, story, metadata, version):
    signature = digest(json.dumps([story, metadata, version], ensure_ascii=False, sort_keys=True).encode())
    folder = root/'layers'/signature
    with COMPILE_LOCK:
        if (folder/'manifest.json').exists():
            return json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        actual, canonical = map_versions()
        if any(version[key] != value for key, value in canonical.items()):
            raise ValueError('地图发布版本与服务器不一致')
        folder.mkdir(parents=True, exist_ok=True)
        atomic_save(folder/'input.json', story)
        command = [os.environ.get('MAPTOOL_NODE', 'node'), '--max-old-space-size=96',
                   str(PROJECT/'scripts/compile_layer.mjs'), str(folder/'input.json'), str(folder/'pack.tmp'), str(PROJECT)]
        run = subprocess.run(command, capture_output=True, timeout=60)
        if run.returncode:
            raise RuntimeError('地图编译失败：'+run.stderr.decode('utf-8', errors='replace')[-600:])
        raw = (folder/'pack.tmp').read_bytes()
        pack = json.loads(raw)
        if pack['version'] != actual['sceneSchemaVersion'] or pack['baseMap'] != {'id': actual['baseMapId'], 'revision': actual['baseMapRevision']}:
            raise ValueError('地图编译版本不一致')
        if pack['baseMap']['revision'] != canonical['baseMapRevision']:
            pack['baseMap']['revision'] = canonical['baseMapRevision']
            raw = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            (folder/'pack.tmp').write_bytes(raw)
        if len(raw) > 24*1024*1024:
            raise ValueError('剧情包超过当前安卓下载上限，请缩小章节范围')
        manifest = {'id': signature, 'storyId': pack['id'], **version, **metadata,
                    'sha256': digest(raw), 'bytes': len(raw), 'hasGaps': False}
        (folder/'pack.tmp').replace(folder/'pack.json')
        atomic_save(folder/'manifest.json', manifest)
        (folder/'input.json').unlink()
        return manifest
