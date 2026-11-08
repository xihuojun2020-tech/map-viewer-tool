"""The three text-source operations used by the map service."""
from html.parser import HTMLParser
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class SourceError(RuntimeError):
    pass


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,24}', value):
        raise ValueError('书籍或章节标识无效')
    return value


def fetch(path):
    request = Request('http://127.0.0.1:18921/api/v1/'+path,
                      headers={'Authorization': 'Bearer '+os.environ['MAPTOOL_SOURCE_TOKEN']})
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError) as error:
        raise SourceError('取文服务暂不可用，请稍后检查书源；未启动模型分析') from error
    if not isinstance(payload, dict) or payload.get('code') != 0:
        raise SourceError('书源未返回有效结果，请检查书籍是否仍可阅读')
    return payload


def book_info(value):
    bid = identifier(str(value['book_id']))
    title, author = value['book_name'], value['author']
    if not isinstance(title, str) or not title or not isinstance(author, str):
        raise SourceError('书源书籍信息不完整')
    aliases = list(dict.fromkeys(v for k in ('book_name', 'original_book_name', 'raw_book_name')
                                if isinstance(v := value.get(k), str) and v))
    return {'bookKey': 'fq-'+bid, 'sourceId': bid, 'title': title, 'author': author, 'aliases': aliases}


def search(query):
    result = fetch('search?'+urlencode({'query': query, 'tab_type': 3, 'count': 10}))
    books = {}
    for tab in result.get('search_tabs', []):
        if str(tab.get('tab_type')) != '3':
            continue
        for card in tab.get('data') or []:
            for raw in card.get('book_data') or []:
                book = book_info(raw)
                books[book['bookKey']] = book
    return list(books.values())


def directory(book_id):
    data = fetch('books/'+identifier(book_id)+'/directory')['data']
    book = book_info(data['book_info'])
    if book['sourceId'] != book_id:
        raise SourceError('书源返回的书籍身份不一致')
    chapters = [{'id': identifier(str(row['item_id'])), 'index': index, 'title': row['title'],
                 'version': row.get('version', '')}
                for index, row in enumerate(data['item_data_list'], 1)]
    if not chapters or len({c['id'] for c in chapters}) != len(chapters):
        raise SourceError('书源目录为空或存在重复章节')
    return book, chapters


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paragraphs, self.indices, self.current = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.current = []
            self.indices.append(dict(attrs).get('idx'))
        elif tag == 'br' and self.current is not None:
            self.current.append('\n')

    def handle_data(self, value):
        if self.current is not None:
            self.current.append(value)

    def handle_endtag(self, tag):
        if tag == 'p' and self.current is not None:
            self.paragraphs.append(''.join(self.current).strip())
            self.current = None


def chapter(book_id, chapter_id):
    data = fetch('chapters/'+identifier(chapter_id)+'/novel')['data']
    if (data.get('content_decrypted') is not True or str(data.get('item_id')) != chapter_id
            or str(data.get('novel_data', {}).get('book_id')) != book_id):
        raise SourceError('章节尚未解码或归属不符，未送入模型')
    content = data.get('content')
    if not isinstance(content, str) or '<article>' not in content or '</article>' not in content:
        raise SourceError('章节正文不完整，未送入模型')
    parser = Paragraphs()
    parser.feed(content)
    # The source inserts empty, unnumbered <p><img ...></p> between prose paragraphs.
    prose = [(idx, text) for idx, text in zip(parser.indices, parser.paragraphs) if idx is not None or text]
    parser.indices = [idx for idx, _ in prose]
    parser.paragraphs = [text for _, text in prose]
    if (not parser.paragraphs or parser.current is not None
            or parser.indices != [str(i) for i in range(len(parser.paragraphs))]
            or any(0xe000 <= ord(c) <= 0xf8ff for p in parser.paragraphs for c in p)):
        raise SourceError('章节段落缺失或仍有乱码，未送入模型')
    return {'id': chapter_id, 'title': data['title'], 'paragraphs': parser.paragraphs}
