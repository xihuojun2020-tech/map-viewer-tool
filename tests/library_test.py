from pathlib import Path
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from library import Library
from analysis import expand_result

VERSION = {'baseMapId':'jianan-219','baseMapRevision':'r','atlasRevision':'a','sceneSchemaVersion':1,'compilerVersion':'c'}
BOOK = {'bookKey':'fq-1','sourceId':'1','title':'旧书名','author':'甲','aliases':['旧书名','新书名']}
CHAPTERS = [{'id':str(i+10),'index':i,'title':f'第{i}章','version':'1'} for i in range(1,5)]


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.lib=Library(Path(self.tmp.name),VERSION);self.lib.initialize('old-token');self.lib.remember(BOOK)
        with patch('novel_source.directory',return_value=(BOOK,CHAPTERS)):
            self.lib.directory('fq-1')
        self.calls=[]

    def body(self,chapter=1,paragraph=None,mode='cumulative'):
        return {**VERSION,'bookKey':'fq-1','mode':mode,'target':{'chapterId':str(chapter+10),'paragraph':paragraph}}

    def run_job(self,task):
        def text(bid,cid):
            return {'id':cid,'title':'章','paragraphs':['守军驻守邺城。'+'字'*2200,'守军出城。'+'字'*2200]}
        def extract(chapters,*args):
            self.calls.append([(c['index'],c['paragraphStart']) for c in chapters])
            c=chapters[0]
            return expand_result({'v':2,'endTemporal':'inherit','facts':[{'refs':[[c['index'],c['paragraphStart']]],'kind':'location','status':'narrated','temporal':'inherit','summary':'驻守邺城','place':'邺城'}]},chapters),{}
        def publish(root,story,meta,version):
            return {'id':story['id']+version['compilerVersion']+str(len(self.calls))+str(meta['coveredThrough']['paragraph']), 'storyId':story['id'],**meta,**version}
        with patch('novel_source.chapter',side_effect=text),patch('book_worker.analyze',side_effect=extract),patch('layer_publish.publish',side_effect=publish),patch.dict(os.environ,{'MAPTOOL_API_KEY':'test'}):
            return self.lib.run(task)

    def task(self,rid):
        with self.lib.db() as db:return db.execute('SELECT task FROM library_requests WHERE id=?',(rid,)).fetchone()[0]

    def test_shared_requests_cancel_and_cache(self):
        a=self.lib.create('alice',self.body())[1];b=self.lib.create('bob',self.body())[1]
        self.assertEqual(self.task(a['requestId']),self.task(b['requestId']))
        self.lib.cancel('alice',a['requestId'])
        with self.assertRaises(LookupError):self.lib.request('alice',b['requestId'])
        self.run_job(self.task(b['requestId']))
        count=len(self.calls)
        code,c=self.lib.create('charlie',self.body())
        self.assertEqual(code,200);self.assertEqual(c['status'],'ready');self.assertEqual(len(self.calls),count)
        self.assertEqual(self.lib.request('alice',a['requestId'])['stage'],'cancelled')

    def test_tail_expansion_and_local_chapter_number(self):
        first=self.lib.create('a',self.body(paragraph=1))[1];task=self.task(first['requestId'])
        self.run_job(task);self.assertEqual(len(self.calls),1)
        self.lib.create('a',self.body(chapter=2))
        self.run_job(task)
        self.assertEqual(len(self.calls),3) # Changed tail is not spliced into its old extraction.
        self.assertEqual(self.lib.availability(self.body(2))['status'],'ready')
        self.lib.create('a',self.body(chapter=3));self.run_job(task)
        self.assertEqual(len(self.calls),4) # Two stable full blocks were reused.
        local=self.lib.create('a',self.body(chapter=4,mode='local'))[1]
        self.run_job(self.task(local['requestId']))
        self.assertEqual(self.calls[-1][0][0],4)

    def test_identity_credentials_and_compatibility(self):
        token=self.lib.issue_token('device-2');self.assertEqual(self.lib.owner(token),'device-2')
        self.assertEqual(self.lib.owner('old-token'),'legacy');self.assertIsNone(self.lib.owner('wrong'))
        self.lib.remember({**BOOK,'title':'新书名'})
        self.assertEqual(self.lib.book('fq-1')['analysis_title'],'旧书名')
        self.assertEqual(len(self.lib.search('新书名')['books']),1)
        with self.assertRaisesRegex(ValueError,'底图'):self.lib.create('a',{**self.body(),'atlasRevision':'different'})

    def test_retry_reports_queue_and_cancel_stops_new_calls(self):
        request=self.lib.create('a',self.body())[1];task=self.task(request['requestId'])
        self.lib.stage(task,'failed',error='测试中断')
        with self.lib.db() as db:db.execute("UPDATE jobs SET state='failed' WHERE id=?",(task,))
        retry=self.lib.create('b',self.body())[1]
        self.assertEqual(retry['stage'],'queued');self.assertIsNone(retry['error'])
        self.lib.cancel('a',request['requestId']);self.lib.cancel('b',retry['requestId'])
        self.assertEqual(self.run_job(task),'cancelled');self.assertEqual(self.calls,[])

    def test_compiler_update_reuses_text_extraction(self):
        old=self.lib.create('a',self.body())[1];self.run_job(self.task(old['requestId']))
        count=len(self.calls)
        self.lib.version={**VERSION,'compilerVersion':'new-compiler'}
        new=self.lib.create('a',self.body())[1];self.assertNotEqual(self.task(old['requestId']),self.task(new['requestId']))
        self.run_job(self.task(new['requestId']));self.assertEqual(len(self.calls),count)
        self.assertEqual(self.lib.request('a',new['requestId'])['status'],'ready')


if __name__=='__main__':unittest.main()
