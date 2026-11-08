"""Sign the release manifest without putting private signing material in the project."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

ROOT = Path(__file__).resolve().parents[1]
build = ROOT/'android/app/build/outputs/apk/release'
metadata = json.loads((build/'output-metadata.json').read_text(encoding='utf-8'))
item = metadata['elements'][0]
releases = ROOT/'releases'
releases.mkdir(exist_ok=True)
name = 'map-tool-'+item['versionName']+'.apk'
apk = releases/name
shutil.copy2(build/item['outputFile'], apk)
payload = {'package': metadata['applicationId'], 'versionCode': item['versionCode'],
           'versionName': item['versionName'], 'notes': '程序统一更名为“地图查看工具”，三国作为首个历史底图数据包。保留已有地图、书库、阅读位置及手机和平板横竖屏适配。',
           'url': 'https://genghaodewuwa.xyz/map-tool/releases/'+name,
           'size': apk.stat().st_size, 'sha256': hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest()}
data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
private = Path.home()/'.config/map-tool/update-signing.pem'
key = serialization.load_pem_private_key(private.read_bytes(), password=os.environ['MAPTOOL_STORE_PASSWORD'].encode())
signature = key.sign(data, padding.PKCS1v15(), hashes.SHA256())
public = serialization.load_der_public_key((Path.home()/'.config/map-tool/update-public.der').read_bytes())
public.verify(signature, data, padding.PKCS1v15(), hashes.SHA256())
(releases/'update.json').write_text(json.dumps({'payload': base64.b64encode(data).decode(), 'signature': base64.b64encode(signature).decode()}), encoding='utf-8')
print(json.dumps(payload, ensure_ascii=False))
