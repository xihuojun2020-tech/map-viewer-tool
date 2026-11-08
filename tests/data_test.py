import json
import re
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PublishedData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'web' / 'atlas.json').read_text(encoding='utf-8'))
        cls.corpus = {p.stem:json.loads(p.read_text(encoding='utf-8')) for p in (ROOT / 'data' / 'corpus').glob('*.json')}

    def test_event_quotations_are_in_pinned_source_paragraphs(self):
        records = self.data['events'] + [fact for person in self.data['people'] for fact in person['facts']]
        for event in records:
            with self.subTest(source=event['source']):
                cite = event['citation']
                if 'archive' in cite:
                    pages=json.loads((ROOT/cite['archive']).read_text(encoding='utf8'))['query']['pages']
                    page=next(p for p in pages if p['title']==cite['title']);rev=page['revisions'][0]
                    raw=rev['slots']['main']['content'];clean=re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]',r'\1',raw)
                    self.assertTrue(cite['phrase'] in raw or cite['quote'] in clean)
                    self.assertEqual(cite['revision'],rev['revid'])
                    continue
                doc = self.corpus[cite['source']]
                paragraph = next(p for p in doc['paragraphs'] if p['id'] == cite['paragraph'])
                self.assertIn(cite['quote'], paragraph['text'])
                self.assertIn(cite['phrase'], cite['quote'])
                self.assertEqual(cite['revision'], doc['revision'])

    def test_entity_references_and_geographic_precision(self):
        ids = {p['id'] for p in self.data['places']}
        people = {p['id'] for p in self.data['people']}
        for place in self.data['places']:
            self.assertTrue(90 < place['coordinates'][0] < 135)
            self.assertTrue(15 < place['coordinates'][1] < 45)
            self.assertRegex(place['precision'],'区域|地域')
        for event in self.data['events']:
            self.assertTrue(set(event['places']) <= ids)
            self.assertTrue(set(event['person_ids']) <= people)

    def test_downloaded_corpus_and_database_agree(self):
        self.assertEqual(len(self.corpus),185)
        with sqlite3.connect(ROOT / 'data' / 'atlas.sqlite') as db:
            self.assertEqual(db.execute('SELECT count(*) FROM documents').fetchone()[0],185)
            self.assertEqual(db.execute('SELECT count(*) FROM events').fetchone()[0],len(self.data['events']))
            self.assertEqual(db.execute('SELECT count(*) FROM activities').fetchone()[0],len(self.data['activities']))
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        for chapter in self.data['chapters']:
            doc = self.corpus[chapter['source']]
            self.assertEqual(chapter['paragraphs'], max(x['id'] for x in doc['paragraphs']))

    def test_retained_names_have_real_matches_without_claiming_biography(self):
        for person in self.data['people']:
            self.assertTrue(person['mentions'])
            self.assertIn('待逐条编录',person['status'])
            for mention in person['mentions'][:2]:
                doc = self.corpus[mention['source']]
                paragraph = next(p for p in doc['paragraphs'] if p['id']==mention['paragraph'])
                self.assertIn(mention['matched'],paragraph['text'])


if __name__ == '__main__':
    unittest.main()
