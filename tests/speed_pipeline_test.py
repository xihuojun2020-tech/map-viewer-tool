import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from analysis import expand_result, resolve_result, TIMELINE_PROTOCOL, validate_timeline
from book_worker import make_blocks, process, published, atomic_save


class PipelineTest(unittest.TestCase):
    def test_references_and_temporal_inheritance(self):
        chapters=[{'index':970,'paragraphStart':30,'paragraphs':['江陵……','丢了！']}]
        raw={'v':2,'endTemporal':'memory','facts':[{'refs':[[970,30],[970,31]],'kind':'control','status':'negated','temporal':'inherit','summary':'江陵失守','faction':'刘表','place':'江陵','scope':'city'}]}
        result=expand_result(raw,chapters)
        facts,mode=resolve_result(result,'memory')
        self.assertEqual(facts[0]['temporal'],'memory');self.assertEqual(mode,'memory')
        self.assertEqual(facts[0]['paragraph'],31);self.assertEqual(facts[0]['evidenceTexts'],['江陵……','丢了！'])
        self.assertEqual(facts[0]['status'],'negated')
        facts,_=resolve_result(result,'unknown');self.assertIn('reviewNote',facts[0])
        bad=copy.deepcopy(raw);bad['facts'][0]['refs']=[[970,29]]
        with self.assertRaisesRegex(ValueError,'不存在'):expand_result(bad,chapters)
        bad=copy.deepcopy(raw);bad['facts'][0]['refs'].append([49,50])
        partial=expand_result(bad,chapters)['facts'][0]
        self.assertIn('暂不用于地图',partial['reviewNote'])
        self.assertEqual(partial['evidenceTexts'],['江陵……','丢了！'])
        bad=copy.deepcopy(raw);bad['facts'][0]['kind']='reported'
        review=expand_result(bad,chapters)['facts'][0]
        self.assertEqual(review['originalKind'],'reported');self.assertIn('暂不用于地图',review['reviewNote'])
        returned={'facts':[{**result['facts'][0],'temporalMode':'current'}], 'endTemporal':'current',
                  'timelineProtocol':TIMELINE_PROTOCOL,'transitions':[[970,32,'current']]}
        self.assertEqual(resolve_result(returned,'memory')[0][0]['temporal'],'memory')
        with self.assertRaisesRegex(ValueError,'引用无效'):validate_timeline({'transitions':[[970,32,'current']]},chapters)

    def test_holes_restart_and_ordered_increment(self):
        book={'id':'test','title':'测试','chapters':[{'index':i,'title':str(i),'paragraphs':['字'*3000]} for i in range(1,5)]}
        calls=[]
        def extract(chapters,*args):
            number=chapters[0]['index'];calls.append(number)
            if number==2:raise ValueError('测试第二块失败')
            time.sleep(.03 if number==1 else .001)
            raw={'v':2,'endTemporal':'memory' if number==1 else 'inherit','facts':[{'refs':[[number,1]],'kind':'location','status':'narrated','temporal':'inherit','summary':'驻地','place':'邺城'}]}
            return expand_result(raw,chapters),{}
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'MAPTOOL_API_KEY':'test'}):
            folder=Path(tmp);path=folder/'book.json';atomic_save(path,book);output=folder/'results'
            with patch('book_worker.analyze',side_effect=extract),patch('book_worker.review_timeline',return_value=([[1,1,'memory']],{})):
                with self.assertRaisesRegex(ValueError,'第二块'):process(path,output,workers=3)
            first=published(output);self.assertEqual(first['availableBlocks'],1);self.assertEqual(first['completed'],1)
            self.assertTrue((output/'batch-0003.json').exists());self.assertNotIn(4,calls)
            def resume(chapters,*args):
                number=chapters[0]['index'];calls.append(number)
                return expand_result({'v':2,'endTemporal':'inherit','facts':[{'refs':[[number,1]],'kind':'location','status':'narrated','temporal':'inherit','summary':'驻地','place':'邺城'}]},chapters),{}
            with patch('book_worker.analyze',side_effect=resume):process(path,output)
            self.assertEqual(calls.count(1),1);self.assertEqual(calls.count(3),1)
            final=published(output,after=1)
            self.assertEqual([f['chapter'] for f in final['facts']],[2,3,4])
            self.assertTrue(all(f['temporal']=='memory' for f in final['facts']))
            self.assertEqual(final['completed'],4)

if __name__=='__main__':unittest.main()
