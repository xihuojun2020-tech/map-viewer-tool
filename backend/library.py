"""Source catalogue, per-user subscriptions and shared, resumable map jobs."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import sqlite3
import threading
import time
import novel_source
from analysis import MODEL, PROTOCOL, TIMELINE_PROTOCOL
from book_worker import atomic_save, process, published, reuse_prefix
import layer_publish

END = 2147483647


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def sha(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


class Library:
    def __init__(self, root, version=None):
        self.root = Path(root)
        self.version = version or layer_publish.versions()
        self.source_lock = threading.RLock()
        self.storage_lock = threading.Lock()
        for name in ('library/cache', 'library/tasks', 'layers'):
            (self.root/name).mkdir(parents=True, exist_ok=True)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.root/'jobs.sqlite', timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db: yield db
        finally:
            db.close()

    def initialize(self, legacy_token):
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,path TEXT NOT NULL,state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL);
                CREATE TABLE IF NOT EXISTS library_books(
                    key TEXT PRIMARY KEY,source_id TEXT NOT NULL,title TEXT NOT NULL,analysis_title TEXT NOT NULL,
                    author TEXT NOT NULL,aliases TEXT NOT NULL,directory TEXT,checked REAL,epoch INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS library_chapters(
                    book TEXT NOT NULL,chapter TEXT NOT NULL,hash TEXT NOT NULL,path TEXT NOT NULL,checked REAL NOT NULL,
                    PRIMARY KEY(book,chapter));
                CREATE TABLE IF NOT EXISTS library_tasks(
                    id TEXT PRIMARY KEY,book TEXT NOT NULL,mode TEXT NOT NULL,start INTEGER NOT NULL,
                    epoch INTEGER NOT NULL,stage TEXT NOT NULL DEFAULT 'queued',input_revision TEXT,
                    fetched INTEGER NOT NULL DEFAULT 0,error TEXT);
                CREATE TABLE IF NOT EXISTS library_requests(
                    id TEXT PRIMARY KEY,owner TEXT NOT NULL,task TEXT NOT NULL,chapter_id TEXT NOT NULL,
                    chapter INTEGER NOT NULL,paragraph INTEGER NOT NULL,state TEXT NOT NULL,created REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS requests_task ON library_requests(task,state);
                CREATE TABLE IF NOT EXISTS library_layers(
                    id TEXT PRIMARY KEY,task TEXT NOT NULL,chapter INTEGER NOT NULL,paragraph INTEGER NOT NULL,
                    manifest TEXT NOT NULL,created REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS layers_task ON library_layers(task,chapter,paragraph);
            ''')
            columns = {row[1] for row in db.execute('PRAGMA table_info(jobs)')}
            for name, declaration in [('priority', 'INTEGER NOT NULL DEFAULT 0'), ('turn', 'REAL NOT NULL DEFAULT 0'),
                                      ('owner', "TEXT NOT NULL DEFAULT 'legacy'"), ('kind', "TEXT NOT NULL DEFAULT 'private'")]:
                if name not in columns:
                    db.execute(f'ALTER TABLE jobs ADD COLUMN {name} {declaration}')
            db.execute('INSERT OR IGNORE INTO users VALUES(?,?)', ('legacy', hashlib.sha256(legacy_token.encode()).hexdigest()))
            db.execute("UPDATE jobs SET state='queued' WHERE state='running'")

    def owner(self, token):
        with self.db() as db:
            row = db.execute('SELECT id FROM users WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        return row['id'] if row else None

    def issue_token(self, owner):
        token = secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute('INSERT INTO users VALUES(?,?)', (owner, hashlib.sha256(token.encode()).hexdigest()))
        return token

    def remember(self, book):
        with self.db() as db:
            old = db.execute('SELECT aliases FROM library_books WHERE key=?', (book['bookKey'],)).fetchone()
            aliases = list(dict.fromkeys((json.loads(old[0]) if old else [])+book['aliases']))
            db.execute('''INSERT INTO library_books(key,source_id,title,analysis_title,author,aliases) VALUES(?,?,?,?,?,?)
                ON CONFLICT(key) DO UPDATE SET title=excluded.title,author=excluded.author,aliases=excluded.aliases''',
                (book['bookKey'], book['sourceId'], book['title'], book['title'], book['author'], encoded(aliases)))

    def book(self, key):
        with self.db() as db:
            row = db.execute('SELECT * FROM library_books WHERE key=?', (key,)).fetchone()
        if not row:
            raise LookupError('书籍未找到，请先搜索并选择作品')
        return dict(row)

    def describe(self, key):
        book = self.book(key)
        with self.db() as db:
            row = db.execute('''SELECT l.manifest FROM library_layers l JOIN library_tasks t ON t.id=l.task
                WHERE t.book=? AND t.epoch=? AND t.mode='cumulative' ORDER BY l.chapter DESC,l.paragraph DESC LIMIT 1''',
                (key, book['epoch'])).fetchone()
        return {'bookKey': key, 'title': book['title'], 'author': book['author'], 'aliases': json.loads(book['aliases']),
                'source': '番茄小说', 'chapters': len(json.loads(book['directory'])) if book['directory'] else None,
                'checked': book['checked'], 'coveredThrough': json.loads(row[0])['coveredThrough'] if row else None}

    def search(self, query, remote=False):
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 100:
            raise ValueError('请输入一至一百字的书名')
        with self.db() as db:
            rows = db.execute('SELECT key FROM library_books WHERE instr(aliases,?)>0 OR instr(author,?)>0', (query, query)).fetchall()
        keys = [r[0] for r in rows]
        if remote or not keys:
            for book in novel_source.search(query):
                self.remember(book)
                if book['bookKey'] not in keys: keys.append(book['bookKey'])
        return {'books': [self.describe(key) for key in keys]}

    def directory(self, key, refresh=False):
        with self.source_lock:
            book = self.book(key)
            if not book['directory'] or refresh:
                info, chapters = novel_source.directory(book['source_id'])
                self.remember(info)
                old = json.loads(book['directory']) if book['directory'] else []
                changed = bool(old and (len(chapters)<len(old) or any(
                    (a['id'], a['version']) != (b['id'], b['version']) for a, b in zip(old, chapters))))
                with self.db() as db:
                    if changed:
                        changed_ids = [a['id'] for a,b in zip(old, chapters) if a != b]
                        db.executemany('DELETE FROM library_chapters WHERE book=? AND chapter=?', [(key, i) for i in changed_ids])
                    db.execute('UPDATE library_books SET directory=?,checked=?,epoch=epoch+? WHERE key=?',
                               (encoded(chapters), time.time(), int(changed), key))
                book = self.book(key)
        return {'bookKey': key, 'chapters': json.loads(book['directory']), 'checked': book['checked'], 'revision': sha(json.loads(book['directory']))}

    def chapter(self, key, row, refresh=False):
        with self.source_lock:
            with self.db() as db:
                cached = db.execute('SELECT * FROM library_chapters WHERE book=? AND chapter=?', (key,row['id'])).fetchone()
            if cached and not refresh:
                return {**json.loads(Path(cached['path']).read_text(encoding='utf-8')), 'index': row['index']}
            value = novel_source.chapter(self.book(key)['source_id'], row['id'])
            value['index'] = row['index']
            content_hash = sha(value['paragraphs'])
            path = self.root/'library/cache'/key/(row['id']+'-'+content_hash+'.json')
            self.room(len(encoded(value).encode()))
            path.parent.mkdir(parents=True, exist_ok=True)
            atomic_save(path, value)
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO library_chapters VALUES(?,?,?,?,?)',
                           (key, row['id'], content_hash, str(path), time.time()))
                if cached and cached['hash'] != content_hash:
                    db.execute('UPDATE library_books SET epoch=epoch+1 WHERE key=?', (key,))
            return value

    def target(self, body):
        if not isinstance(body, dict) or body.get('mode') not in ('cumulative', 'local'):
            raise ValueError('请选择累计局势或当前章局部地图')
        if any(body.get(k) != self.version[k] for k in ('baseMapId','baseMapRevision','atlasRevision','sceneSchemaVersion')):
            raise ValueError('需要更新地图资料：客户端与服务器底图版本不一致')
        book = self.book(body.get('bookKey'))
        chapters = self.directory(book['key'])['chapters']
        target = body.get('target', {})
        row = next((c for c in chapters if c['id'] == target.get('chapterId')), None)
        paragraph = target.get('paragraph')
        if not row or (paragraph is not None and (type(paragraph) is not int or not 1 <= paragraph <= 60000)):
            raise ValueError('阅读章节或段落无效')
        start = row['index'] if body['mode'] == 'local' else 1
        task = sha([book['key'], body['mode'], start, book['epoch'], self.version, MODEL, PROTOCOL, TIMELINE_PROTOCOL])[:32]
        return book, row, paragraph or END, start, task

    def available(self, db, task, index, paragraph):
        rows = db.execute('SELECT * FROM library_layers WHERE task=? ORDER BY chapter DESC,paragraph DESC,created DESC', (task,)).fetchall()
        if rows:
            scope = db.execute('SELECT book,mode,start FROM library_tasks WHERE id=?',(task,)).fetchone()
            story_id = 'library-'+sha(list(scope))[:24]
            rows = [row for row in rows if json.loads(row['manifest'])['storyId']==story_id]
        if not rows:
            return {'status': 'missing', 'layerId': None, 'coveredThrough': None}
        row = rows[0]
        manifest = json.loads(row['manifest'])
        covered = (row['chapter'], row['paragraph']) >= (index, paragraph)
        return {'status': 'ready' if covered else 'partial', 'layerId': row['id'],
                'coveredThrough': manifest['coveredThrough'], 'textRevision': manifest['textRevision']}

    def availability(self, body):
        _, row, paragraph, _, task = self.target(body)
        with self.db() as db:
            result = self.available(db, task, row['index'], paragraph)
            job = db.execute('SELECT state FROM jobs WHERE id=?', (task,)).fetchone()
        if result['status'] == 'missing' and job and job[0] in ('queued', 'running'):
            result['status'] = 'processing'
        return {**result, 'mode': body['mode']}

    def create(self, owner, body):
        book, row, paragraph, start, task = self.target(body)
        rid = secrets.token_hex(16)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            available = self.available(db, task, row['index'], paragraph)
            state = 'completed' if available['status'] == 'ready' else 'active'
            folder = self.root/'library/tasks'/task
            db.execute('INSERT OR IGNORE INTO library_tasks(id,book,mode,start,epoch) VALUES(?,?,?,?,?)',
                       (task, book['key'], body['mode'], start, book['epoch']))
            db.execute('''INSERT OR IGNORE INTO jobs(id,path,state,priority,turn,owner,kind) VALUES(?,?,?,0,?,'shared','library')''',
                       (task, str(folder), 'completed' if state=='completed' else 'queued', time.time()))
            db.execute('INSERT INTO library_requests VALUES(?,?,?,?,?,?,?,?)',
                       (rid, owner, task, row['id'], row['index'], paragraph, state, time.time()))
            if state == 'active':
                db.execute("UPDATE jobs SET state='queued',turn=? WHERE id=? AND state!='running'", (time.time(),task))
                db.execute("UPDATE library_tasks SET error=NULL,stage=CASE WHEN id IN (SELECT id FROM jobs WHERE state='running') THEN stage ELSE 'queued' END WHERE id=?", (task,))
        return (200 if state=='completed' else 202), self.request(owner, rid)

    def request(self, owner, rid):
        with self.db() as db:
            row = db.execute('''SELECT r.*,t.stage,t.fetched,t.error,t.mode,t.input_revision,j.state AS job_state FROM library_requests r
                JOIN library_tasks t ON t.id=r.task JOIN jobs j ON j.id=r.task WHERE r.id=? AND r.owner=?''', (rid, owner)).fetchone()
            if not row: raise LookupError('请求不存在或不属于当前用户')
            available = self.available(db, row['task'], row['chapter'], row['paragraph'])
        stage = ('cancelled' if row['state']=='cancelled' else 'completed' if available['status']=='ready'
                 else 'failed' if row['job_state']=='failed' else 'queued' if row['job_state']=='queued'
                 else row['stage'] if row['stage'] in ('fetching','analyzing','publishing') else 'queued')
        progress = self.root/'library/tasks'/row['task']/(row['input_revision'] or '')/'results/progress.json'
        extraction = json.loads(progress.read_text(encoding='utf-8')) if progress.exists() else {}
        return {'requestId': rid, **available, 'stage': stage, 'mode': row['mode'], 'error': row['error'],
                'extractedBlocks': extraction.get('extractedBlocks',0), 'totalBlocks':extraction.get('totalBlocks',0),
                'fetched': row['fetched'], 'target': {'chapterId': row['chapter_id'], 'chapter': row['chapter'],
                'paragraph': None if row['paragraph']==END else row['paragraph']}}

    def requests(self, owner):
        with self.db() as db:
            rows = db.execute('SELECT id FROM library_requests WHERE owner=? ORDER BY created DESC LIMIT 30', (owner,)).fetchall()
        return [self.request(owner, r[0]) for r in rows]

    def cancel(self, owner, rid):
        self.request(owner, rid)
        with self.db() as db:
            db.execute("UPDATE library_requests SET state='cancelled' WHERE id=? AND owner=?", (rid, owner))
        return self.request(owner, rid)

    def desired(self, task):
        with self.db() as db:
            row = db.execute("SELECT chapter,paragraph FROM library_requests WHERE task=? AND state='active' ORDER BY chapter DESC,paragraph DESC LIMIT 1", (task,)).fetchone()
        return tuple(row) if row else None

    def stage(self, task, stage, **values):
        with self.db() as db:
            db.execute('UPDATE library_tasks SET stage=?'+''.join(','+k+'=?' for k in values)+' WHERE id=?',
                       (stage, *values.values(), task))

    def run(self, task):
        try:
            return self._run(task)
        except Exception as error:
            self.stage(task, 'failed', error=str(error))
            raise

    def _run(self, task):
        target = self.desired(task)
        if not target:
            self.stage(task, 'cancelled')
            return 'cancelled'
        with self.db() as db:
            detail = dict(db.execute('SELECT * FROM library_tasks WHERE id=?', (task,)).fetchone())
        book = self.book(detail['book'])
        if book['epoch'] != detail['epoch']:
            raise ValueError('正文或目录已更新，请重新创建请求；旧地图保留')
        chapters = json.loads(book['directory'])
        needed = chapters[detail['start']-1:target[0]]
        folder = self.root/'library/tasks'/task
        previous = folder/detail['input_revision'] if detail['input_revision'] else None
        reuse = previous
        if not reuse:
            with self.db() as db:
                candidate = db.execute('''SELECT t.id,t.input_revision FROM library_tasks t JOIN jobs j ON t.id=j.id
                    WHERE t.book=? AND t.mode=? AND t.start=? AND t.epoch=? AND t.id!=? AND t.input_revision IS NOT NULL
                    ORDER BY j.turn DESC LIMIT 1''', (detail['book'],detail['mode'],detail['start'],detail['epoch'],task)).fetchone()
            if candidate:
                reuse = self.root/'library/tasks'/candidate['id']/candidate['input_revision']
        current = published(previous/'results') if previous else {'availableBlocks': 0}
        previous_done = previous and (previous/'results/progress.json').exists() and json.loads((previous/'results/progress.json').read_text(encoding='utf-8'))['status']=='completed'
        # Finish the current fetched window before loading more chapters.
        if previous and not previous_done:
            revision = detail['input_revision']
            input_book = json.loads((previous/'novel.json').read_text(encoding='utf-8'))
        else:
            self.stage(task, 'fetching')
            with self.db() as db:
                cached = {r[0] for r in db.execute('SELECT chapter FROM library_chapters WHERE book=?', (book['key'],))}
            missing = [c for c in needed if c['id'] not in cached][:3]
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda c: self.chapter(book['key'], c), missing))
            with self.db() as db:
                cached = {r[0] for r in db.execute('SELECT chapter FROM library_chapters WHERE book=?', (book['key'],))}
            ready = []
            for row in needed:
                if row['id'] not in cached: break
                value = self.chapter(book['key'], row)
                if row['index']==target[0] and target[1]!=END:
                    if target[1]>len(value['paragraphs']): raise ValueError('指定段落超出该章正文')
                    value = {**value, 'paragraphs': value['paragraphs'][:target[1]]}
                ready.append(value)
            context = ''
            if detail['mode']=='local' and detail['start']>1:
                context = '\n'.join(self.chapter(book['key'], chapters[detail['start']-2])['paragraphs'])[-1200:]
            input_book = {'id': task, 'title': book['analysis_title'], 'chapters': ready, 'context': context}
            revision = sha(input_book)
            output = folder/revision
            if not (output/'novel.json').exists():
                self.room(len(encoded(input_book).encode())*3)
                output.mkdir(parents=True, exist_ok=True)
                reuse_prefix(reuse/'results' if reuse else None, output/'results', input_book)
                atomic_save(output/'novel.json', input_book)
            self.stage(task, 'analyzing', input_revision=revision, fetched=ready[-1]['index'])
        output = folder/revision
        self.stage(task, 'analyzing')
        failure = None
        try:
            process(output/'novel.json', output/'results', workers=2, max_batches=1 if not current['availableBlocks'] else 2, should_stop=lambda: self.desired(task) is None)
        except Exception as error:
            failure = error
        result = published(output/'results')
        if self.book(book['key'])['epoch'] != detail['epoch']:
            raise ValueError('分析期间正文已更新，请重新创建请求；旧地图保留')
        if result['availableBlocks']:
            position = result['position']
            last = next(c for c in input_book['chapters'] if c['index']==position[0])
            full = self.chapter(book['key'], chapters[position[0]-1])
            complete = position[1] == len(full['paragraphs'])
            metadata = {'bookKey': book['key'], 'mode': detail['mode'], 'textRevision': revision,
                        'coveredThrough': {'chapterId': last['id'], 'chapter': position[0], 'paragraph': position[1], 'chapterComplete': complete},
                        'chapterIds': [c['id'] for c in chapters],
                        'startChapter': detail['start']}
            story = {'id': 'library-'+sha([book['key'],detail['mode'],detail['start']])[:24], 'title': book['title'], 'completed': result['completed'],
                     'total': len(chapters), 'facts': result['facts'], 'local': detail['mode']=='local', 'localChapter':detail['start']}
            self.stage(task, 'publishing')
            self.room(len(encoded(story).encode())*3)
            manifest = layer_publish.publish(self.root, story, metadata, self.version)
            with self.db() as db:
                db.execute('INSERT OR IGNORE INTO library_layers VALUES(?,?,?,?,?,?)',
                           (manifest['id'], task, position[0], END if complete else position[1], encoded(manifest), time.time()))
                db.execute("UPDATE library_requests SET state='completed' WHERE task=? AND state='active' AND (chapter<? OR (chapter=? AND paragraph<=?))",
                           (task, position[0], position[0], END if complete else position[1]))
        if failure: raise failure
        active = self.desired(task)
        state = 'queued' if active else 'completed'
        self.stage(task, state)
        return state

    def layer(self, lid):
        with self.db() as db:
            row = db.execute('SELECT manifest FROM library_layers WHERE id=?', (lid,)).fetchone()
        if not row: raise LookupError('剧情包不存在或已从缓存回收')
        return json.loads(row[0]), self.root/'layers'/lid/'pack.json'

    def room(self, required):
        # This budget applies only to new, reproducible source caches, never uploads.
        with self.storage_lock:
            folders = [self.root/'library', self.root/'layers']
            size = sum(p.stat().st_size for folder in folders for p in folder.rglob('*') if p.is_file())
            budget = 1024**3
            if size+required <= budget: return
            with self.db() as db:
                active = {r[0] for r in db.execute("SELECT id FROM jobs WHERE kind='library' AND state IN ('queued','running')")}
                rows = db.execute('SELECT id,task FROM library_layers ORDER BY created DESC').fetchall()
                keep, candidates = set(), []
                for row in rows:
                    if row['task'] not in keep: keep.add(row['task'])
                    elif row['task'] not in active: candidates.append(row)
                for row in reversed(candidates):
                    directory = self.root/'layers'/row['id']
                    amount = sum(p.stat().st_size for p in directory.rglob('*') if p.is_file())
                    shutil.rmtree(directory)
                    db.execute('DELETE FROM library_layers WHERE id=?', (row['id'],))
                    size -= amount
                    if size+required<=budget: return
                for row in db.execute('SELECT id,input_revision FROM library_tasks').fetchall():
                    if row['id'] in active: continue
                    for directory in (self.root/'library/tasks'/row['id']).glob('*'):
                        if directory.name==row['input_revision']: continue
                        amount=sum(p.stat().st_size for p in directory.rglob('*') if p.is_file())
                        shutil.rmtree(directory);size-=amount
                        if size+required<=budget:return
                active_books = {r[0] for r in db.execute("SELECT t.book FROM library_tasks t JOIN jobs j ON t.id=j.id WHERE j.state IN ('queued','running')")}
                for row in db.execute('SELECT book,chapter,path FROM library_chapters ORDER BY checked').fetchall():
                    if row['book'] in active_books: continue
                    path = Path(row['path']);amount=path.stat().st_size
                    path.unlink();size-=amount
                    db.execute('DELETE FROM library_chapters WHERE book=? AND chapter=?',(row['book'],row['chapter']))
                    if size+required<=budget:return
            raise OSError('地图缓存容量不足，已有地图与原文保留；请联系维护者释放缓存')
