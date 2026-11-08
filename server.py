"""A local, dependency-free atlas server. No model or cloud credentials required."""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlparse
from scripts.source_text import reading_paragraphs

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    # Windows registers image/svg, which Chromium rejects for external SVG images.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.svg': 'image/svg+xml'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def send_error(self, code, message=None, explain=None):
        self.log_error('%s: %s', code, message)
        reasons = {400:'请求格式有误',403:'此目录不开放浏览',404:'未找到所需资料',
                   405:'此操作不受支持',414:'请求地址过长',431:'请求信息过长',
                   500:'服务处理失败',501:'此操作不受支持',505:'请求协议不受支持'}
        reason = reasons.get(code, '请求未能完成')
        payload = (f'<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                   f'<title>{reason}</title><h1>{reason}</h1><p>错误编号：{code}</p>'
                   f'<p>请核对资料地址与本地文件。</p><a href="/">返回地图</a></html>').encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(payload)

    def list_directory(self, path):
        self.send_error(403, 'Directory browsing is disabled')

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/corpus/'):
            key = path.removeprefix('/api/corpus/')
            if not re.fullmatch(r'(sgz-\d{2}|romance-\d{3})', key):
                self.send_error(400, 'Invalid corpus identifier')
                return
            file = ROOT / 'data' / 'corpus' / f'{key}.json'
            if not file.exists():
                self.send_error(404, 'Corpus document not downloaded')
                return
            document = json.loads(file.read_text(encoding='utf-8'))
            document['paragraphs'] = reading_paragraphs(document)
            payload = json.dumps(document, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8790)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'atlas_ready http://{args.host}:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
