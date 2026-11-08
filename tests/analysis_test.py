import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.analysis import ENDPOINT, make_request, validate_result, timeline_request

class AnalysisTest(unittest.TestCase):
    def test_real_boundary_contract(self):
        chapters=[{'index':1,'title':'测试章','paragraphs':['守军驻守城池。']}]
        fact={'chapter':1,'paragraph':1,'quote':'守军驻守城池。','summary':'守军驻守',
              'actor':'','faction':'守军','leader':'','place':'','from':'','unit':'守军','strength':None,
              'kind':'control','status':'narrated','temporal':'current','scope':'','unitType':''}
        good={'summary':'守军驻守','facts':[fact]}
        self.assertEqual(validate_result(copy.deepcopy(good),chapters),good)
        bad=copy.deepcopy(good);bad['facts'][0]['quote']='模型抄写不一致'
        checked=validate_result(bad,chapters)['facts'][0]
        self.assertEqual(checked['quote'],chapters[0]['paragraphs'][0]);self.assertIn('待复核',checked['reviewNote'])
        bad=copy.deepcopy(good);bad['facts'][0]['paragraph']=2
        with self.assertRaisesRegex(ValueError,'不存在'):validate_result(bad,chapters)
        self.assertIn('/go/',ENDPOINT)
        self.assertEqual(make_request(chapters)['model'],'deepseek-v4.1-flash')
        self.assertIn('json',timeline_request(chapters,'','memory')['messages'][0]['content'].lower())

if __name__=='__main__':unittest.main()
