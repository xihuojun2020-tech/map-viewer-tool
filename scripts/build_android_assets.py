"""Bundle the existing map and offline corpus; exclude deferred model reviews."""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.source_text import reading_paragraphs
from backend.analysis import SYSTEM, PROTOCOL, TIMELINE_SYSTEM, TIMELINE_PROTOCOL

target = ROOT/'android/app/src/main/assets'
target.mkdir(parents=True, exist_ok=True)
count = 0
for source in (ROOT/'web').rglob('*'):
    relative = source.relative_to(ROOT/'web')
    if not source.is_file() or relative.parts[0] == 'miniatures' or source.name.startswith('miniatures.'):
        continue
    destination = target/relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination); count += 1
index = target/'index.html'
text = index.read_text(encoding='utf-8').replace('<a href="miniatures.html" target="_blank" rel="noopener">查看将领与特色部队造型审核版</a>',
    '<p>精细造型审核资源暂未随手机版本提供。</p>')
index.write_text(text, encoding='utf-8')
models = target/'models.html'
models.write_text(models.read_text(encoding='utf-8').replace(
    '<a href="miniatures.html">打开新版将领与特色部队造型审核</a>',
    '精细造型审核资源暂未随手机版本提供。'), encoding='utf-8')
corpus = target/'api/corpus'; corpus.mkdir(parents=True, exist_ok=True)
for source in (ROOT/'data/corpus').glob('*.json'):
    document = json.loads(source.read_text(encoding='utf-8')); document['paragraphs'] = reading_paragraphs(document)
    (corpus/source.stem).write_text(json.dumps(document, ensure_ascii=False), encoding='utf-8')
(target/'analysis-config.json').write_text(json.dumps({'system': SYSTEM, 'protocol': PROTOCOL, 'timelineSystem': TIMELINE_SYSTEM, 'timelineProtocol': TIMELINE_PROTOCOL}, ensure_ascii=False), encoding='utf-8')
shutil.copy2(ROOT/'android/update-public.der', target/'update-public.der')
files = [p for p in target.rglob('*') if p.is_file()]
print(json.dumps({'map_files':count,'asset_files':len(files),'asset_MiB':round(sum(p.stat().st_size for p in files)/1048576,2)},ensure_ascii=False))
