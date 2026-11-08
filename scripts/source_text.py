"""Plain Chinese reading text from the formats observed in the pinned corpus.

Original paragraphs and their IDs remain unchanged. Strip website navigation and
presentation markup before selecting excerpts, rather than cutting templates.
"""
import html
import re


def plain_text(text):
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'<(?:style|script)\b[^>]*>.*?</(?:style|script)>', '', text, flags=re.S | re.I)
    # Early HTML ingestion included the text of these stylesheet rules.
    text = re.sub(r'\.mw-parser-output[^{}]*\{[^{}]*\}', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'(?:\[\[)(?:en|vi|fr|Category):[^\]]*\]\]', '', text, flags=re.I)
    text = re.sub(r'^\s*(?:en|vi|fr|Category):[^\n\ue000]*', '', text, flags=re.M | re.I)
    text = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', text)
    def variant(match):
        value = match[1]
        if 'zh-hant:' in value:
            return re.search(r'zh-hant:([^;]+)', value)[1]
        if value.startswith('A|'):
            return value[2:]
        return value
    text = re.sub(r'-\{([^{}]+)\}-', variant, text)

    def template(match):
        name, *args = match[1].split('|')
        name = name.strip()
        if name in {'Novel', 'Novel-f', 'header', 'header2', 'noteTA', 'PD-old', '西晉作品', 'textquality'}:
            return '\ue000' * match[1].count('\ue000')
        if name in {'YL', 'ProperNoun', 'ul', 'red', 'blue', 'quote', 'WavyBookMark', '僻字', '!', '-', 'PUA'}:
            return args[0] if args else ''
        if name in {'另', '校'}:
            return f'{args[0]}（校记：{args[1]}）'
        if name == '*':
            return '〈' + '|'.join(args) + '〉'
        if name == '*s':
            return '〈'
        if name == '*e':
            return '〉'
        if name == 'gap':
            return '\u3000'
        if name == 'annotate':
            return f'（注：{args[0]}）'
        raise ValueError(f'Unprocessed source template: {name}')

    while re.search(r'\{\{[^{}]*\}\}', text):
        text = re.sub(r'\{\{([^{}]*)\}\}', template, text)
    # The pinned volume 42 has an unclosed quote wrapper; retain its words.
    text = text.replace('{{quote|', '')
    text = re.sub(r'__\w+__', '', text)
    text = re.sub(r"'{2,5}", '', text)
    text = re.sub(r'^\s*={2,6}\s*(.*?)\s*={2,6}\s*$', r'\1', text, flags=re.M)
    return html.unescape(text).strip()


def reading_paragraphs(document):
    # Wikitext notes and quotations sometimes span multiple stored paragraphs.
    # Process together; keep a separator for every original paragraph boundary.
    texts = plain_text('\ue000'.join(p['text'] for p in document['paragraphs'])).split('\ue000')
    assert len(texts) == len(document['paragraphs'])
    return [dict(p, display_text='' if text.strip() == 'Public domainPublic domainfalsefalse' else text.strip())
            for p, text in zip(document['paragraphs'], texts)]
