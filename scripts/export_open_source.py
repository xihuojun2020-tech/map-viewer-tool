"""Export reviewed source inputs without local history, credentials or private data."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
TOP = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'AGENTS.md', '.gitignore',
       '.gitattributes', '.gitleaks.toml', 'server.py', '启动地图.ps1']
TREES = ['backend', 'contracts', 'scripts', 'tests', 'web', 'data/corpus', 'data/editorial', 'data/references']
ANDROID = ['android/build.gradle.kts', 'android/settings.gradle.kts', 'android/gradle.properties',
           'android/app/build.gradle.kts', 'android/update-public.der']
DEPLOY = ['map-tool.service', 'map-source.service', 'map-tool.nginx.conf', 'service.env.example',
          'source.env.example', 'source.lock.json', '公开部署说明.md']
RESEARCH = ['topographic-tile-descriptions.json', 'topographic-tile-metadata.json', 'three-assets.json',
            'historical-water-build.json', 'hydrology-reference-downloads-2026-11-06.json',
            'jianan-source-extraction.json', 'jianan-georeference.json', 'jianan-reference-license.json',
            'han-140-base-metadata.json']
EXCLUDED = {'data/references/user-regions.zip', 'web/user-regions.json', 'web/coastal-reference.json',
            'web/scene/xuzhou-letter.json', 'data/editorial/scene-examples/xuzhou-letter.json'}
SOURCE_SUFFIXES = {'.py', '.mjs', '.cjs', '.js', '.ps1', '.json', '.geojson', '.html', '.css', '.md',
                   '.txt', '.svg', '.png', '.jpg', '.glb', '.kt', '.xml', '.kts', '.properties', '.der', '.toml',
                   '.example', '.service', '.conf'}


def export(destination):
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    files = [ROOT/name for name in TOP+ANDROID]
    files += [ROOT/'deploy'/name for name in DEPLOY]
    files += [ROOT/'research'/name for name in RESEARCH]
    files += [p for p in (ROOT/'android/app/src/main').rglob('*') if p.is_file() and 'assets' not in p.relative_to(ROOT/'android/app/src/main').parts]
    for directory in TREES:
        files += [p for p in (ROOT/directory).rglob('*') if p.is_file()]
    for source in sorted(set(files)):
        relative = source.relative_to(ROOT)
        name = relative.as_posix()
        if name in EXCLUDED or '__pycache__' in relative.parts or name.startswith('web/miniatures'):
            continue
        if source.suffix not in SOURCE_SUFFIXES and source.name not in {'LICENSE', '.gitignore', '.gitattributes'}:
            continue
        if source.is_symlink():
            raise ValueError('公开清单不接受指向其他位置的符号链接：'+name)
        target = destination/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    # Keep the private coastal reconstruction in the working project only.
    reference = json.loads((ROOT/'web/reference.json').read_text(encoding='utf-8'))
    surface = {key: reference[key] for key in ['land', 'water', 'coastline']}
    surface.update(coastal_patches={'type':'FeatureCollection','features':[]},
                   coastal_note='公开版使用 Natural Earth 现代海陆参照；不包含许可待核的用户原包及其沿海补丁，也不代表古岸线复原。')
    (destination/'web/coastal-reference.json').write_text(json.dumps(surface, ensure_ascii=False), encoding='utf-8')

    demo = json.loads((ROOT/'web/scene/xuzhou-letter.json').read_text(encoding='utf-8'))
    demo.update(chapterHint='原创功能演示', sourceNote='项目编写的架空功能演示，非历史结论或小说原文。', textRevision=2)
    texts = [
        '演示场景：一封刘备给吕布的信说明双方的联络。',
        '演示设定：孙策准备进攻徐州，袁术命纪灵向北行军。',
        '为应对威胁，陈宫代吕布向江东的刘备提出合作。',
        '随后张勋截获刘备的回信，得知这项计划。',
        '回信拟定刘备北上淮陵，切断纪灵后方交通；此时仍是计划。',
        '信中提出同时从两侧进攻；纪灵所部在这段演示中设为七万大军。',
        '信中继续讨论击败纪灵后的局势；这不能证明纪灵或其部队已经覆灭。',
        '双方还讨论战后如何分配淮南与广陵。契约属于约定，并非当前占领事实。',
    ]
    assert len(demo['evidence']) == len(texts), '演示资料结构改变，需要重新核对公开文字'
    for item, text in zip(demo['evidence'], texts): item['text'] = text
    for name in ['web/scene/xuzhou-letter.json', 'data/editorial/scene-examples/xuzhou-letter.json']:
        target = destination/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(demo, ensure_ascii=False, indent=2), encoding='utf-8')
    index = destination/'web/index.html'
    text = index.read_text(encoding='utf-8')
    text = text.replace('<a href="regional-preview.html" target="_blank" rel="noopener">打开独立区域预览版</a>', '<p>用户区域对照资料未随公开版提供，可自行导入有权使用的资料。</p>')
    text = text.replace('<a href="miniatures.html" target="_blank" rel="noopener">查看将领与特色部队造型审核版</a>', '<p>精细造型审核资源暂未随公开版提供。</p>')
    index.write_text(text, encoding='utf-8')
    models = destination/'web/models.html'
    models.write_text(models.read_text(encoding='utf-8').replace(
        '<a href="miniatures.html">打开新版将领与特色部队造型审核</a>',
        '精细造型审核资源暂未随公开版提供。'), encoding='utf-8')
    for name in ['web/index.html', 'web/app.mjs']:
        target = destination/name
        target.write_text(target.read_text(encoding='utf-8').replace('沿海按原包补齐显示，非考定古岸线。', '沿海仅作现代地理参照，非考定古岸线。'), encoding='utf-8')
    notices = destination/'web/assets/DATA-NOTICES.txt'
    text = notices.read_text(encoding='utf-8')
    start = text.index('Independent regional preview (regional-preview.html):')
    end = text.index('The wider modern sea/land reference', start)
    text = text[:start]+'The private user-region archive and its derivatives are not included in this public export.\n\n'+text[end:]
    marker = '2026-11-06 沿海显示变更：'
    text = text[:text.index(marker)]+surface['coastal_note']+'\n'
    notices.write_text(text, encoding='utf-8')

    manifest = [{'path':p.relative_to(destination).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                 'bytes':p.stat().st_size} for p in sorted(destination.rglob('*')) if p.is_file()]
    (destination/'SOURCE-MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'destination':str(destination),'files':len(manifest),'bytes':sum(p['bytes'] for p in manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, help='必须为尚不存在的导出目录')
    args = parser.parse_args()
    print(json.dumps(export(args.destination), ensure_ascii=False))
