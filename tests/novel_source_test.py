import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from novel_source import search, chapter, SourceError


class SourceTests(unittest.TestCase):
    def test_same_name_not_same_identity(self):
        rows = [{'book_id': n, 'book_name': '同名书', 'author': a, 'original_book_name': '旧名'}
                for n, a in [('1', '甲'), ('2', '乙')]]
        with patch('novel_source.fetch', return_value={'search_tabs': [{'tab_type': 3, 'data': [{'book_data': rows}]}]}):
            books = search('同名书')
        self.assertEqual([b['bookKey'] for b in books], ['fq-1', 'fq-2'])
        self.assertIn('旧名', books[0]['aliases'])

    def test_decoded_body_and_ownership(self):
        data = {'item_id': '12', 'novel_data': {'book_id': '1'}, 'content_decrypted': True,
                'title': '首章', 'content': '<header>首章</header><article><p idx="0">汉军围城。</p><p><img src="illustration"/></p><p idx="1">守军出击。</p></article>'}
        with patch('novel_source.fetch', return_value={'data': data}):
            self.assertEqual(chapter('1', '12')['paragraphs'], ['汉军围城。', '守军出击。'])
            with self.assertRaises(SourceError): chapter('2', '12')
        for change in [{'content_decrypted': False}, {'content': data['content'].replace('idx="1"', 'idx="2"')},
                       {'content': data['content'][:-10]}]:
            with patch('novel_source.fetch', return_value={'data': {**copy.deepcopy(data), **change}}):
                with self.assertRaises(SourceError): chapter('1', '12')


if __name__ == '__main__': unittest.main()
