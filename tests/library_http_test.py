from contextlib import ExitStack
from http.server import ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))


class PrivateHTTPTest(unittest.TestCase):
    def test_uploads_are_isolated_and_legacy_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'MAPTOOL_STATE':folder,'MAPTOOL_ACCESS_TOKEN':'legacy-token'}):
            sys.modules.pop('service',None)
            service=importlib.import_module('service');service.LIBRARY.initialize('legacy-token')
            second=service.LIBRARY.issue_token('second')
            http=ThreadingHTTPServer(('127.0.0.1',0),service.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(http.server_port)
            def call(path,token,body=None):
                r=Request(base+path,data=json.dumps(body).encode() if body is not None else None,
                          headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
                with urlopen(r) as response:return json.load(response)
            try:
                book={'title':'私有章节','chapters':[{'index':1,'title':'片段','paragraphs':['守军驻守下曲阳。']}]}
                a=call('/jobs','legacy-token',book);b=call('/jobs',second,book)
                self.assertNotEqual(a['id'],b['id'])
                self.assertEqual([r['id'] for r in call('/jobs',second)],[b['id']])
                self.assertEqual(call('/jobs','legacy-token',book)['id'],a['id'])
                with self.assertRaises(HTTPError) as denied:call('/jobs/'+a['id']+'/result',second)
                self.assertEqual(denied.exception.code,404)
                with self.assertRaises(HTTPError) as denied:call('/jobs','invalid')
                self.assertEqual(denied.exception.code,401)
            finally:
                http.shutdown();http.server_close();thread.join()


if __name__=='__main__':unittest.main()
