"""Publish only files actually generated; retain explicit unfinished catalogue entries."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'data/editorial/miniatures.json').read_text(encoding='utf-8'))
for asset in data['assets']:
    id=asset['id'];concept=ROOT/f'web/miniatures/concepts/{id}.png';metadata=ROOT/f'web/miniatures/models/{id}.json'
    if concept.exists():asset['concept']=f'miniatures/concepts/{id}.png'
    if metadata.exists():asset.update(json.loads(metadata.read_text(encoding='utf-8')))
data['credits']=[
    {'title':'本机图像生成','text':'使用已部署的千问图像模型生成造型稿；提示词、种子及执行记录保存在项目中。'},
    {'title':'真实三维形体','text':'混元三维生成网格，随后用建模软件减面、整理并导出。灰模未制作最终彩色贴图、骨骼和动作。'},
    {'title':'历史与影视参考','text':'原著及史料使用本地固定修订文本。已查看央视网的九四版专题图文，作为服饰气质与人物辨识方向；没有复制演员脸模、剧照纹理或其他游戏模型。'},
    {'title':'开源取材','text':'实查汉文明开源项目及三维生成示例。本批未导入汉文明项目的网格或纹理。生成工具的许可和限制随项目记录。混元三维许可有地域限制及特定大规模商用条件，不能按无条件商用处理。'}]
(ROOT/'web/miniatures/catalog.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'concepts':sum('concept'in a for a in data['assets']),'models':sum('model'in a for a in data['assets']),'roster':len(data['roster'])}))
