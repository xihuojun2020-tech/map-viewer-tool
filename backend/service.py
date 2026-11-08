"""Private API with a reserved short-task lane and bounded book extraction."""
import hashlib
import gzip
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from urllib.parse import urlparse, parse_qs

from book_worker import process, published, atomic_save
from analysis import MODEL, PROTOCOL
from library import Library
from novel_source import SourceError

ROOT = Path(os.environ.get('MAPTOOL_STATE', '/var/lib/map-tool'))
TOKEN = os.environ['MAPTOOL_ACCESS_TOKEN']
WAKE = [threading.Event(), threading.Event()]
LIBRARY = Library(ROOT)


@contextmanager
def database():
    db = sqlite3.connect(ROOT/'jobs.sqlite', timeout=10)
    try:
        with db: yield db
    finally:
        db.close()


def book_status(job_id, path):
    progress = path/'results/progress.json'
    state = json.loads(progress.read_text(encoding='utf-8')) if progress.exists() else {'status': 'queued', 'completed': 0}
    if 'title' not in state:
        book = json.loads((path/'novel.json').read_text(encoding='utf-8'))
        state.update(title=book['title'], total=len(book['chapters']))
    return {'id': job_id, **state}


def worker(priority):
    while True:
        with database() as db:
            row = db.execute("SELECT id,path,kind FROM jobs WHERE state='queued' AND priority=? ORDER BY turn,rowid LIMIT 1", (priority,)).fetchone()
            if row: db.execute("UPDATE jobs SET state='running' WHERE id=?", (row[0],))
        if not row:
            WAKE[priority].wait(1); WAKE[priority].clear(); continue
        job_id, path, kind = row; path = Path(path)
        try:
            state = LIBRARY.run(job_id) if kind == 'library' else process(path/'novel.json', path/'results', workers=1 if priority else 2, max_batches=1 if priority else 2)
        except Exception as error:
            print(f'任务 {job_id} 失败：{error}', flush=True); state = 'failed'
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            # A subscriber can extend a job while its previous range is publishing.
            if kind == 'library' and state in ('completed', 'cancelled') and db.execute("SELECT 1 FROM library_requests WHERE task=? AND state='active'", (job_id,)).fetchone():
                state = 'queued'
            db.execute('UPDATE jobs SET state=?,turn=? WHERE id=?', (state, time.time(), job_id))


def validate_book(book):
    if not isinstance(book, dict) or not isinstance(book.get('title'), str) or not 1 <= len(book['title']) <= 200:
        raise ValueError('请填写有效书名')
    chapters = book.get('chapters')
    if not isinstance(chapters, list) or not 1 <= len(chapters) <= 2000:
        raise ValueError('章节数须在 1 至 2000 之间')
    for i, chapter in enumerate(chapters, 1):
        if not isinstance(chapter, dict) or chapter.get('index') != i or not isinstance(chapter.get('title'), str):
            raise ValueError('章节顺序或名称无效')
        paragraphs = chapter.get('paragraphs')
        if not isinstance(paragraphs, list) or not paragraphs or not all(isinstance(p, str) for p in paragraphs):
            raise ValueError('章节正文格式无效')
        if sum(map(len, paragraphs)) > 60000:
            raise ValueError('单章超过六万字，请先分章')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # No source text, authorization headers or provider key in access logs.
        print(self.command, urlparse(self.path).path, args[1] if len(args)>1 else '', flush=True)

    def cors(self):
        origin = self.headers.get('Origin')
        if origin in ('http://127.0.0.1:8790', 'https://appassets.androidplatform.net'):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def reply(self, code, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_bytes(code, payload)

    def send_bytes(self, code, payload):
        self.send_response(code); self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if len(payload)>1024 and 'gzip' in self.headers.get('Accept-Encoding',''):
            payload = gzip.compress(payload, compresslevel=4)
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204); self.cors()
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); self.end_headers()

    def authorized(self):
        authorization = self.headers.get('Authorization', '')
        self.owner = LIBRARY.owner(authorization[7:]) if authorization.startswith('Bearer ') else None
        if not self.owner:
            self.reply(401, {'error': '内测访问凭据无效，请在接口设置中检查'}); return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/health': self.reply(200, {'status': 'ok', 'version': '0.3.0'}); return
        if not self.authorized(): return
        if path.startswith(('/library/', '/layers/')):
            self.library_call('GET', path); return
        if path == '/jobs':
            with database() as db: rows = db.execute("SELECT id,path FROM jobs WHERE owner=? AND kind='private' ORDER BY rowid DESC", (self.owner,)).fetchall()
            self.reply(200, [book_status(i, Path(p)) for i, p in rows]); return
        match = re.fullmatch(r'/jobs/([a-z0-9-]+)(/result)?', path)
        if not match: self.reply(404, {'error': '接口不存在'}); return
        with database() as db: row = db.execute("SELECT path FROM jobs WHERE id=? AND owner=? AND kind='private'", (match[1],self.owner)).fetchone()
        if not row: self.reply(404, {'error': '任务不存在'}); return
        folder = Path(row[0]); state = book_status(match[1], folder)
        if not match[2]: self.reply(200, state); return
        try:
            after = int(parse_qs(urlparse(self.path).query).get('after', ['0'])[0])
            if after < 0: raise ValueError()
        except ValueError:
            self.reply(400, {'error': '剧情增量位置无效'}); return
        state.update(published(folder/'results', after))
        if after > state['availableBlocks']:
            self.reply(409, {'error': '本地进度超出服务器，请重新下载'}); return
        state['after'] = after
        state['reviewCount'] = sum(bool(f.get('reviewNote')) for f in state['facts'])
        self.reply(200, state)

    def do_POST(self):
        if not self.authorized(): return
        if urlparse(self.path).path.startswith('/library/'):
            self.library_call('POST', urlparse(self.path).path); return
        if urlparse(self.path).path != '/jobs': self.reply(404, {'error': '接口不存在'}); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 12*1024*1024: self.reply(413, {'error': '单次小说文件须小于十二兆字节'}); return
            body = self.rfile.read(length); book = json.loads(body); validate_book(book)
        except (ValueError, TypeError, KeyError) as error:
            self.reply(400, {'error': str(error)}); return
        identity = PROTOCOL+MODEL+json.dumps(book, ensure_ascii=False, sort_keys=True)
        # Keep the original user's existing IDs, but never share private uploads across users.
        if self.owner != 'legacy': identity = self.owner+'\n'+identity
        job_id = hashlib.sha256(identity.encode()).hexdigest()[:24]
        priority = int(sum(len(p) for c in book['chapters'] for p in c['paragraphs']) <= 4500)
        folder = ROOT/'books'/job_id
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            exists = db.execute('SELECT state FROM jobs WHERE id=?', (job_id,)).fetchone()
            if not exists:
                folder.mkdir(parents=True, exist_ok=True); book['id'] = job_id
                (folder/'novel.json').write_text(json.dumps(book, ensure_ascii=False), encoding='utf-8')
                db.execute('INSERT INTO jobs(id,path,state,priority,turn,owner) VALUES(?,?,?,?,?,?)', (job_id, str(folder), 'queued', priority, time.time(),self.owner))
            elif exists[0] == 'failed':
                db.execute("UPDATE jobs SET state='queued',turn=? WHERE id=?", (time.time(), job_id))
                progress = folder/'results/progress.json'
                state = json.loads(progress.read_text(encoding='utf-8'))
                state['status'] = 'queued'; state.pop('error', None); atomic_save(progress, state)
        WAKE[priority].set(); self.reply(202, {'id': job_id, 'status': 'queued' if not exists else 'existing'})

    def library_call(self, method, path):
        query = {k: v[-1] for k,v in parse_qs(urlparse(self.path).query).items()}
        try:
            body = None
            if method == 'POST':
                length = int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 16384: raise ValueError('请求数据大小无效')
                body = json.loads(self.rfile.read(length))
            if method == 'GET' and path == '/library/search':
                self.reply(200, LIBRARY.search(query.get('q',''), query.get('remote')=='1')); return
            if method == 'GET' and path == '/library/versions':
                self.reply(200, LIBRARY.version); return
            if path == '/library/requests':
                if method == 'POST':
                    code, result = LIBRARY.create(self.owner,body); WAKE[0].set(); self.reply(code,result)
                else: self.reply(200, LIBRARY.requests(self.owner))
                return
            match = re.fullmatch(r'/library/books/(fq-[0-9]{1,24})(?:/(directory|availability|refresh-chapter))?',path)
            if match:
                key, operation = match.groups()
                if method == 'GET' and operation is None: self.reply(200,LIBRARY.describe(key)); return
                if method == 'GET' and operation == 'directory': self.reply(200,LIBRARY.directory(key, query.get('refresh')=='1')); return
                if method == 'POST' and operation == 'refresh-chapter':
                    chapters = LIBRARY.directory(key)['chapters']
                    row = next((c for c in chapters if c['id']==body.get('chapterId')),None)
                    if row is None: raise ValueError('章节无效')
                    value = LIBRARY.chapter(key,row,refresh=True)
                    self.reply(200, {'chapterId': value['id'], 'paragraphs':len(value['paragraphs']), 'message':'正文已重新核对'}); return
                if method == 'GET' and operation == 'availability':
                    data = {**query,'bookKey':key,'target':{'chapterId':query.get('chapterId'), 'paragraph':int(query['paragraph']) if query.get('paragraph') else None}, 'sceneSchemaVersion': int(query.get('sceneSchemaVersion','0'))}
                    self.reply(200,LIBRARY.availability(data)); return
            match = re.fullmatch(r'/library/requests/([a-f0-9]{32})(/cancel)?',path)
            if match:
                if method == 'GET' and not match[2]: self.reply(200,LIBRARY.request(self.owner,match[1])); return
                if method == 'POST' and match[2]: self.reply(200,LIBRARY.cancel(self.owner,match[1])); return
            match = re.fullmatch(r'/layers/([a-f0-9]{64})/(manifest|download)',path)
            if match and method=='GET':
                manifest, file = LIBRARY.layer(match[1])
                if match[2]=='manifest': self.reply(200,manifest)
                else: self.send_bytes(200,file.read_bytes())
                return
            self.reply(404,{'error':'接口不存在'})
        except LookupError as error:
            self.reply(404,{'error':str(error)})
        except (ValueError,TypeError) as error:
            self.reply(400,{'error':str(error)})
        except SourceError as error:
            self.reply(502,{'error':str(error)})
        except OSError as error:
            print('书库存储失败：',str(error),flush=True)
            self.reply(507,{'error':'书库存储不可用或容量不足，已有内容保留'})
        except Exception as error:
            print('书库请求失败：',type(error).__name__,str(error),flush=True)
            self.reply(500,{'error':'书库处理失败，已有内容保留，请联系维护者检查日志'})


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    LIBRARY.initialize(TOKEN)
    with database() as db:
        # The user-requested book is processed by the dedicated checkpointed batch job.
        if (ROOT/'books/huangjin/novel.json').exists():
            db.execute('INSERT OR IGNORE INTO jobs(id,path,state) VALUES(?,?,?)', ('huangjin', str(ROOT/'books/huangjin'), 'external'))
    for priority in (0, 1): threading.Thread(target=worker, args=(priority,), daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', 18791), Handler).serve_forever()
