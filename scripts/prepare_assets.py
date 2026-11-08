"""Vendor a pinned map renderer and explicitly modern reference geography."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import json
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    assets = ROOT / 'web' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    downloads = {
        'maplibre-gl.js': 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js',
        'maplibre-gl.css': 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css',
        'MAPLIBRE-LICENSE.txt': 'https://raw.githubusercontent.com/maplibre/maplibre-gl-js/v5.6.1/LICENSE.txt',
        'STCharacters.txt': 'https://raw.githubusercontent.com/BYVoid/OpenCC/ver.1.1.9/data/dictionary/STCharacters.txt',
        'OPENCC-LICENSE.txt': 'https://raw.githubusercontent.com/BYVoid/OpenCC/ver.1.1.9/LICENSE',
    }
    def download(item):
        name, url = item
        path = assets / name
        if not path.exists():
            with urllib.request.urlopen(url, timeout=35) as response:
                content = response.read()
            path.write_bytes(content)
        return {'file': name, 'url': url, 'sha256': sha256(path.read_bytes()).hexdigest()}
    with ThreadPoolExecutor(max_workers=3) as pool:
        manifest = list(pool.map(download, downloads.items()))
    original = Path('E:/AI work/time')
    geo = json.loads((original / 'data' / 'geography.json').read_text(encoding='utf-8'))
    target = assets / 'terrain.png'
    shutil.copyfile(original / 'assets' / 'terrain.png', target)
    manifest.append({'file': 'terrain.png', 'derived_from': '原项目中由公开Terrain Tiles生成的现代区域地势渲染；无先秦政治数据。',
                     'sha256': sha256(target.read_bytes()).hexdigest(), 'metadata': geo['terrain'], 'sources': geo['sources']})
    reference = {'land': geo['land'], 'rivers': geo['rivers'], 'sources': geo['sources'],
                 'note': '现代地理参照；河道与海岸为今貌，默认隐藏现代河网。'}
    (ROOT / 'web' / 'reference.json').write_text(json.dumps(reference, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT / 'research' / 'assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'prepared {len(manifest)} local assets')


if __name__ == '__main__':
    main()
