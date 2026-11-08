import json
from pathlib import Path
import re
import unittest

from scripts.source_text import reading_paragraphs

ROOT=Path(__file__).resolve().parents[1]


class ReadingData(unittest.TestCase):
    def test_all_pinned_paragraphs_have_chinese_reading_text_and_stable_ids(self):
        for path in (ROOT/'data/corpus').glob('*.json'):
            document=json.loads(path.read_text(encoding='utf-8'))
            original=document['paragraphs']
            clean=reading_paragraphs(document)
            self.assertEqual([(p['id'],p['text'])for p in clean],[(p['id'],p['text'])for p in original])
            for paragraph in clean:
                with self.subTest(document=path.stem,paragraph=paragraph['id']):
                    self.assertIsNone(re.search('[A-Za-z]',paragraph['display_text']))
        # A chapter's navigation title must not enter mentions or reveal endings.
        novel=json.loads((ROOT/'data/corpus/romance-019.json').read_text(encoding='utf-8'))
        self.assertEqual(reading_paragraphs(novel)[0]['display_text'],'')

    def test_published_citations_have_clean_excerpts_without_losing_originals(self):
        data=json.loads((ROOT/'web/atlas.json').read_text(encoding='utf-8'))
        citations=[e['citation']for e in data['events']]
        citations += [fact['citation']for p in data['people']for fact in p['facts']]
        citations += [x['properties']['citation']for x in data['national']['commanderies']]
        citations += [x['properties']['citation']for x in data['national']['frontier']if x['properties']['citation']]
        citations += [p for person in data['people']for p in person['mentions']]
        for cite in citations:
            self.assertIn('quote',cite)
            self.assertTrue(cite['display_quote'])
            self.assertIsNone(re.search('[A-Za-z]',cite['display_quote']))


if __name__=='__main__':unittest.main()
