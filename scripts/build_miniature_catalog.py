"""Editorial review batch with pinned literary evidence, not equipment archaeology."""
import json
from pathlib import Path
from build_data import load_corpus, converter

ROOT=Path(__file__).resolve().parents[1]
corpus=load_corpus()
traditional=converter()

def cite(source,phrase):
    doc=corpus[source]
    for p in doc['paragraphs']:
        text=p['display_text'];at=text.find(phrase)
        if at>=0:
            return dict(title=doc['title'],url=doc['url'],revision=doc['revision'],
                        paragraph=p['id'],quote=text[max(0,at-30):at+len(phrase)+80])
    raise ValueError(f'Missing evidence: {source}: {phrase}')

# Identifying equipment follows the novel; unrecorded colours and ornament are
# explicitly art direction. Image references are not claims about actors' faces.
generals=[
('guanyu','关羽','蜀汉','romance-001','青龍偃月刀','枣红长脸、丹凤眼、长须；绿袍、绿巾、青龙偃月刀','深绿色交领战袍，绿色包头巾，内穿古铜色札甲，枣红肤色的长脸，丹凤眼，黑色长须垂至胸腹，一手扶须，一手持长杆青龙偃月刀，刀颈有克制的龙纹，稳重的站姿'),
('lvbu','吕布','群雄','romance-005','三叉束髮紫金冠','三叉紫金冠、雉尾、红锦袍、画戟','三叉束发紫金冠，两支长而细的雉尾从冠上向后弯曲，深红锦袍，黑铁札甲配古金兽面肩饰，束腰皮带，面容英武而无胡须，右手持传统中国方天画戟：长杆顶端是直立枪尖，枪尖左右两侧各有一片宽大且清晰的银色月牙刃，月牙刃中间镂空，明确的双月牙画戟而不是星形尖刺长枪，脚踩圆形岩石底座，非西式骑士'),
('zhangfei','张飞','蜀汉','romance-001','丈八蛇矛','豹头环眼、燕颔虎须、丈八蛇矛','魁梧宽肩，粗犷的中国男性面孔，豹头环眼，浓密短络腮胡，黑色头巾，炭黑战袍和深铁灰札甲，宽革带，右手紧握丈八蛇矛，矛头为修长单片钢刃，整片刃从根到尖明显左右蜿蜒成连续的S形，三个清楚的蛇形弯曲，不要直枪头和侧枝，威严站姿'),
('zhaoyun','赵云','蜀汉','romance-007','濃眉大眼，闊面重頤','少年将军、长枪；银甲白袍取影视辨识方向','英俊沉稳的青年中国将领，无胡须，银灰札甲，白色战袍和短白披风，银盔上有白色短缨，左手扶腰，右手持银色长枪，武器直立不遮住脸，气质干净克制'),
('machao','马超','蜀汉','romance-058','白袍銀鎧','白袍银铠、长枪；狮盔细节为艺术设计','年轻英武的中国骑将，银色狮面头盔，白缨，银色细密札甲，白袍配金色窄滚边，右手持长枪，左手扶佩剑，身材修长，脸部清秀但坚毅，不戴面罩'),
('huangzhong','黄忠','蜀汉','romance-053','年近六旬','白须老将、弓箭与大刀','老年中国将领，灰白长须与浓眉，古铜盔甲，赭黄色战袍，头盔红短缨，背负一张反曲弓和箭袋，右手持长杆大刀，昂首站立，皮肤保留年老皱纹，精神矍铄'),
('dianwei','典韦','曹魏','romance-011','雙鐵戟','魁梧近卫、双铁戟','强壮厚重的中国武士身材，方脸短须，露出坚实前臂，黑铁重札甲，深褐短战袍，双手各握一把短柄铁戟，双戟有清晰侧枝，肩甲宽厚但无夸张尖刺'),
('xuchu','许褚','曹魏','romance-012','身長八尺，腰大十圍','虎痴、壮硕近卫；甲胄为艺术设计','壮硕而结实的中国成年武士，圆宽脸，短髭须，深青短袍、黑铁札甲、皮革护臂、厚实革带，一手持厚背环首大刀，一手握拳，宽肩粗颈，头戴简单铁盔，不赤裸上身'),
('gaoshun','高顺','群雄','sgz-07','鎧甲鬬具皆精練齊整','陷阵营统领、整齐甲具；面貌与配色为设计','沉稳严肃的中国中年军官，短须，整齐细密的深黑铁札甲，低调暗红战袍，黑色圆顶兜鍪及颈甲，手持长矛，左臂持窄长黑漆盾，少量古铜铆钉，克制不张扬'),
('ganning','甘宁','孙吴','romance-038','腰懸銅鈴','铜铃、锦衣、弓；服饰细节为设计','精悍的中国水军将领，短束发，靛蓝锦袍，外穿深青皮札甲，腰间系几枚小铜铃，背负弓与箭袋，右手持环首刀，袖口收紧便于水上作战，衣襟有克制的云纹，不是海盗船长'),
('zhouyu','周瑜','孙吴','romance-015','姿質風流，儀容秀麗','儒雅都督、佩剑；素袍与轻甲取影视方向','儒雅年轻的中国都督，清秀面孔，整齐发髻配小冠，月白长袍外穿银灰轻札甲，深红束带，右手持出鞘直剑垂向地面，左手持合拢的竹简，姿态从容，无羽扇'),
('jiangwei','姜维','蜀汉后期','romance-092','姜維','后期将领、枪与弓；面貌和色彩为设计','英武沉静的青年中国将领，青灰札甲、浅赭战袍、简洁银铁盔，头盔上有深红短缨，右手持长枪，背负反曲弓与箭袋，修长身材，脸部有坚毅神情，无长胡须')]

units=[
('xianzhen','陷阵营','群雄','sgz-07','鎧甲鬬具皆精練齊整','史料有据','高顺部精锐；文字强调甲具精练齐整，不提供完整制服图','深黑铁札甲，层叠甲裙，黑色兜鍪，暗红衣袖，左手持窄长黑漆盾，右手执长矛，整齐甲片与铜铆钉，沉稳的中国重装步卒'),
('danyang','丹阳兵','汉末多方','sgz-32','謙以丹楊兵四千益先主','史料有据','地域兵源群体，并非始终属于同一势力的固定番号；服色未详','粗犷精悍的中国步卒，深赭红包头巾，麻褐短袍，棕色皮札甲，短打裹腿，左臂木盾蒙皮，右手持汉式直身环首刀：细长笔直的单刃刀身，刀背是一条直线，没有任何弧度，刀柄末端有一个明显圆环，不是弯刀或日本刀，行装紧凑，背负小布包，装备有使用磨损'),
('hubao','虎豹骑','曹魏','sgz-09','督虎豹騎','史料有据','曹纯等统领的精锐骑兵；不把虎豹名称解释成动物皮制服','一名骑在深棕战马上的中国精锐骑兵，黑铁札甲和黑盔，深绛红战袍，长矛斜向上，马有皮革缰绳、鞍与胸带，战马自然站立，马匹不披全身板甲，不穿虎豹皮，椭圆底座'),
('baima','白马义从','公孙瓒','sgz-06','白馬義從爲中堅','史料有据','白马与骑射有记载；人数、盔甲颜色不由模型推定','一名骑在白色战马上的中国骑射手，浅灰札甲、青灰短袍、深蓝巾帻，手持反曲弓，箭袋在鞍侧，白马安静站立，皮革马具、轻便装备，椭圆岩石底座'),
('qingzhou','青州兵','曹操','romance-010','號為「青州兵」','史实与演义均有线索','黄巾降众选编，不应永久用黄巾造型表示全部成员','青灰短袍、皮札甲、朴素铁盔、环首刀与木盾的中国步兵，服饰有旧布补缀，已经编入正规军，不戴黄色宗教头巾'),
('huangjin','黄巾诸部','黄巾','romance-001','黃巾','史实与演义均有线索','以黄色头巾辨识；不是装备完全统一的一支部队','黄色包头巾，粗麻短衣，棕色背心，布绑腿，草鞋，手持木杆长矛，朴素乡民出身的中国战士，少量皮革护具，无黄金盔甲'),
('jiefan','解烦兵','孙吴','sgz-62','立解煩兩部','史料有据','胡综、徐详分领两部；装备颜色为设计','深赭短袍、青黑札甲、圆顶铁盔的中国精锐步兵，长矛配小型长方盾，简洁水陆两用行装，无披风'),
('chexia','车下虎士','孙吴','sgz-55','車下虎士千餘人','史料有据','孙权身边的精锐护卫，合肥撤军有记载','中国近卫武士，厚实深铜札甲、暗朱战袍，铁盔颈甲，持长戟和长盾，威严紧凑，盾有简洁几何边饰'),
('hushi','许褚虎士','曹魏','sgz-18','皆以為虎士','史料有据','虎士有据；“虎卫军”不直接视为原文正式番号','魁梧中国护卫，黑铁札甲，深蓝衣袖，腰佩剑，右手持长戟，左手厚木盾，朴素精锐装备，非虎皮武士'),
('xiandeng','麴义先登部','袁绍','sgz-06','以八百兵爲先登','史料有据','先登为作战前列的记述；不据此断定永久番号叫先登死士','中国弩手，深褐札甲、朴素铁盔，双手持木制强弩，身旁支撑长盾，弩臂、弦与弩机清晰可见'),
('daji','袁绍大戟士','袁绍','sgz-06','大戟士百餘人自隨','史料有据','袁绍帐下大戟士有记载；不能据此指定张郃为固定统帅','中国戟兵，深古铜札甲、暗金褐衣袍，铁盔，双手持长柄大戟，横枝与枪尖清楚，端正站姿'),
('wudang','无当部','蜀汉','sgz-35','無當監何平','史料有据，称谓需区别','原文见无当监何平；网络“无当飞军”的统一形象与沿革不能全盘照收','中国山地步兵，靛青短衣、轻皮甲、绑腿，背负弩与行囊，手持短矛，不添加虚构部族图腾'),
('yuanrong','元戎弩手','蜀汉','sgz-35','謂之元戎','兵器有据，兵种为归类','连弩及元戎之名有据；不是已经考定的独立军队番号','中国弩手，灰绿色短袍、轻札甲、布巾，抱持木制连弩，木匣与弩臂清楚，具体机械结构为艺术示意'),
('jinfan','锦帆部众','甘宁早期','romance-038','以西川錦作帆幔','演义形象','锦帆与铜铃是甘宁早年形象线索，不视为贯穿孙吴的正规番号','精悍中国江上武士，蓝色短锦衣、腰悬铜铃、束发，佩环首刀与弓，轻装布裹腿，朴素木质底座'),
('feixiong','飞熊军','董卓','romance-009','領飛熊軍三千守郿塢','演义形象','按小说记载展示；不升级为正史已证实番号','中国西北骑兵，灰黑札甲、暗红巾帻、深褐战马，手持长矛，马具朴素，不加幻想熊翼'),
('tengjia','藤甲兵','演义南中','romance-090','籐甲','演义形象','藤甲与作战情节按小说处理，不作考古复原','身穿编织藤甲的中国古代山地战士，藤制胸甲、藤盔、藤盾，赤褐布裙和绑腿，手持短刀，藤条编织清晰，朴素自然材质，非怪物化形象'),
('wuhuan','乌桓骑兵','汉末北方','sgz-32','幽州烏丸雜胡騎','史料有据','文本证明存在这一兵源，不证明统一装备','北方骑射武士，厚毛毡帽、棕灰皮衣、皮札甲，骑灰褐马，背弓携箭，衣物适合寒冷地区，不添加臆造的民族面部特征'),
('liangzhou','凉州骑兵','汉末西北','romance-058','西涼','地域兵种归类','“西凉铁骑”常被泛用，不将其理解为历年不变的一支番号','西北中国骑将部下，青灰甲、毛毡短衣、暗红围巾，深色战马，长矛和弓，鞍具皮革，不使用全身欧洲板甲'),
('wu-navy','孙吴水军','孙吴','sgz-54','乃取蒙沖鬥艦數十艘','兵种归类','水军与战船有据；兵人只表达水上行动装备','中国水军弓手，靛蓝短衣、浅褐轻皮甲、束腿，持短弓，腰间短刀，背后小箭袋，站在木船甲板式圆底座上'),
('jin-navy','西晋舟师','西晋','sgz-48','王濬','兵种归类','晋军伐吴水师的代表性归类，不是单一专名部队','西晋水军步兵，暗赭短袍、深灰札甲、铁盔，手执长矛与木盾，站在木甲板式底座上，装备实用克制')]

assets=[]
for id,name,camp,source,phrase,traits,prompt in generals:
    assets.append(dict(id=id,name=name,kind='general',camp=camp,evidence='演义及史料线索',
        traits=traits,design=prompt,citations=[cite(source,phrase)],
        note='原文证明人物或相关特征；面部、配色、甲片细节为艺术设计。影视只取服饰气质，不是演员肖像扫描。',selected=True))
for id,name,camp,source,phrase,evidence,note,prompt in units:
    assets.append(dict(id=id,name=name,kind='unit',camp=camp,evidence=evidence,traits=note,
        design=prompt,citations=[cite(source,phrase)],note='造型的颜色、纹饰和未有原文说明的装备组合为艺术设计。',
        selected=id in ['xianzhen','danyang','hubao','baima']))
assets.append(dict(id='baier',name='白毦兵',kind='unit',camp='蜀汉',evidence='文献线索待核原卷',
    traits='陈到与白毦是重要线索；本轮公开原卷接口返回拒绝访问，尚未取得可固定的对应原文。',
    design='白色羽饰只是待审设计线索，不将完整制服当作已证史实。',citations=[],
    note='保留在名录中等待核对，暂不生成模型。',selected=False))
people=json.loads((ROOT/'data/editorial/catalog.json').read_text(encoding='utf-8'))['people']
roster=[]
for person in people:
    if person['group']!='将领与军士':continue
    names=[traditional(person['name']),*map(traditional,person['aliases'])]
    hits=[]
    for doc in corpus.values():
        for p in doc['paragraphs']:
            if any(name in p['display_text'] for name in names):
                hits.append(dict(title=doc['title'],url=doc['url'],paragraph=p['id']));break
        if len(hits)==2:break
    roster.append(dict(id=person['id'],name=person['name'],references=hits,
        status='本轮代表造型' if person['name'] in [g[1] for g in generals] else '待逐人造型'))
result=dict(title='三国兵人造型审核',version='首批审核',assets=assets,roster=roster,
    style='较写实的桌游微缩兵人',scope='首批代表人物与特色部队造型审核；既有120名将领候选索引保留，不宣称已经穷尽全部三国人物。',
    production='彩色造型稿由本机图像模型生成；三维模型由图像转网格后在建模软件中减面整理。彩稿、三维形体及史料可信度分别审核。')
out=ROOT/'data/editorial/miniatures.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'generals':len(generals),'units':len(units)+1,'review_models':sum(a['selected'] for a in assets),'roster':len(roster)},ensure_ascii=False))
