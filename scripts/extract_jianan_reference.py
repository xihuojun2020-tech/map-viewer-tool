"""Extract source-drawn boundaries from Esiymbro's CC BY-SA 4.0 219 CE map.

Font outlines have no Unicode text; the glyph table was read from a rendered
contact sheet. Retain path IDs and source coordinates, never invent connections.
"""
import json
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.build-deps'))
from svg.path import parse_path, Move, Close
from shapely.geometry import LineString
from shapely.ops import unary_union, polygonize

GLYPHS={
39:['?','H','e','d','o','n','g','T','a','i','y','u','S','h','X','x','L','p','Y','m','J','z','Z','B','f','W','A','c','w','q','D','s','C','1','0','j','3','b','l','t','2','4','5','6','7','P','Q','R','K','N','G','k','F','8',"'",'9'],
41:['?','B','o','l','i','n','g','C','h','a','y','P','u','H','G','Y','L','j','D','d','w','X','z','R','e','J','f','r','A','s','Z','p','F','W','S','c','N','x','Q','b','q','t','K','T'],
43:['?','M','i','a','n','c','h','Q','X','g','w','u','W','e','Y','m','D','l','H','y','P','b','L','J','C','o','G','t','B','x','A','R','S','f','d','z','s','(','?',')','N','r',']',"'",'F','p','Z','q','ü'],
}

# Source inspection: three dashed legend separators and two line samples are
# decorative paths, not geographic boundaries. Their SVG IDs are stable in the
# pinned SHA-256 source. Retain this exclusion in the extraction record.
LEGEND_PATHS={'path12774','path12776','path12788','path12790','path12792'}


def sampled(path,flip=False):
    result=[];current=[]
    for segment in parse_path(path):
        if isinstance(segment,Move):
            if len(current)>1:result.append(current)
            current=[]
        count=max(2,math.ceil(segment.length(error=1e-3)/2.5))
        for i in range(count+1):
            value=segment.point(i/count)
            point=[value.real,1800-value.imag if flip else value.imag]
            if not current or current[-1]!=point:current.append(point)
    if len(current)>1:result.append(current)
    return result


def main():
    root=ET.parse(ROOT/'web/assets/jianan-219.svg').getroot()
    labels=[];markers=[];boundaries=[];glyphs=[]
    widths={}
    for symbol in root.iter():
        if not symbol.tag.endswith('}symbol'):continue
        paths=[p for p in symbol if p.tag.endswith('}path')]
        coordinates=[p for element in paths for line in sampled(element.attrib['d']) for p in line]
        if coordinates:widths[symbol.attrib['id']]=max(p[0] for p in coordinates)
    for element in root.iter():
        tag=element.tag.split('}')[-1]
        if tag=='g':
            uses=[u for u in element if u.tag.endswith('}use')]
            if not uses:continue
            tokens=[]
            for use in uses:
                match=re.fullmatch(r'#glyph(\d+)-(\d+)',use.attrib.get('{http://www.w3.org/1999/xlink}href',''))
                if not match or int(match[1]) not in GLYPHS:tokens=[];break
                character=GLYPHS[int(match[1])][int(match[2])]
                tokens.append(character)
                glyphs.append({'char':character,'x':float(use.attrib['x']),'y':float(use.attrib['y']),
                    'end':float(use.attrib['x'])+widths[match[0][1:]],'id':element.attrib['id'],
                    'kind':'commandery' if '58.21991%' in element.attrib.get('style','') else 'town'})
            if tokens:labels.append({'text':''.join(tokens),'id':element.attrib['id'],
                'x':float(uses[0].attrib['x']),'y':float(uses[0].attrib['y']),
                'kind':'commandery' if '58.21991%' in element.attrib.get('style','') else 'town'})
        if tag!='path':continue
        style=element.attrib.get('style','')
        role='commandery' if 'stroke-dasharray:3,6' in style else 'province' if 'stroke-width:3;' in style else 'imperial' if 'stroke-width:8;' in style else None
        if role and element.attrib['id'] not in LEGEND_PATHS:
            for points in sampled(element.attrib['d'],'matrix(1,0,0,-1,0,1800)'==element.attrib.get('transform')):
                boundaries.append({'id':element.attrib['id'],'kind':role,'points':points})
        elif 'fill-rule' in style and 'fill:rgb(0%,0%,0%)' in style:
            coordinates=[p for line in sampled(element.attrib['d']) for p in line]
            xs=[p[0] for p in coordinates];ys=[p[1] for p in coordinates]
            if max(xs)-min(xs)<13 and max(ys)-min(ys)<13:
                markers.append({'id':element.attrib['id'],'x':(min(xs)+max(xs))/2,'y':(min(ys)+max(ys))/2})
    # Cairo split uppercase and lowercase runs into separate <g> elements.
    # Reassemble adjacent glyphs on the same baseline instead of guessing names.
    rows={}
    for glyph in glyphs:rows.setdefault((glyph['kind'],round(glyph['y'],1)),[]).append(glyph)
    labels=[]
    for (kind,y),row in rows.items():
        row.sort(key=lambda x:x['x']);current=None
        for glyph in row:
            if current is None or glyph['x']-current['end']>3.5:
                if current:labels.append(current)
                current={'text':glyph['char'],'x':glyph['x'],'y':y,'end':glyph['end'],'kind':kind,'id':glyph['id']}
            else:current['text']+=glyph['char'];current['end']=glyph['end']
        if current:labels.append(current)
    for label in labels:
        if label['kind']=='town':
            candidates=sorted(markers,key=lambda m:math.hypot(m['x']-label['x'],m['y']-label['y']))
            label['nearest_marker']=candidates[0]
    network=unary_union([LineString(b['points']) for b in boundaries])
    polygons=list(polygonize(network))
    result={'source':'https://commons.wikimedia.org/wiki/File:Jian%27an_Commanderies.svg','author':'Esiymbro',
        'license':'CC BY-SA 4.0','reference_year':219,'labels':labels,'markers':markers,'boundaries':boundaries,
        'closed_regions_count':len(polygons),'excluded_legend_paths':sorted(LEGEND_PATHS),
        'note':'源文件省郡边线像素档案；已排除五条图例样线与分隔线，开口线段不自动补闭。'}
    (ROOT/'research/jianan-source-extraction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'boundaries':len(boundaries),'closed_regions':len(polygons),'decoded_labels':len(labels),'markers':len(markers)},ensure_ascii=False))
    selected=['Luoyang',"Chang'an",'Chengdu','Ye','Ji','Xiangping','Dunhuang','Xiapi','Shouchun','Guangling','Wu','Panyu','Linxiang','Shanyin']
    print(json.dumps([x for x in labels if x['text'] in selected],ensure_ascii=False,indent=2))


if __name__=='__main__':main()
