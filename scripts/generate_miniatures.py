"""Run the selected review batch on the user's local ComfyUI. No external API."""
import argparse,json,shutil,time,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
COMFY=Path(r'E:\AI work\ComfyUI-aki\ComfyUI-aki-v3\ComfyUI')
ARCHIVE=ROOT/'research/miniatures'
OUT=ROOT/'web/miniatures'

def api(path,data=None):
    request=urllib.request.Request('http://127.0.0.1:8188/'+path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)

def generate(asset,mode):
    id=asset['id'];suffix='png' if mode=='concepts' else 'glb'
    target=OUT/mode/f'{id}.{suffix}'
    if target.exists():print('已保存',asset['name'],mode,flush=True);return
    if mode=='concepts':
        w=json.loads((ARCHIVE/'guanyu-workflow.json').read_text(encoding='utf-8'))
        w['4']['inputs']['prompt']=('高品质写实桌游微缩兵人的产品摄影，单独一个完整的全身兵人模型，完整展示头部、脚、武器与底座。'
            '人物为三国题材的'+asset['name']+'。造型要求：'+asset['design']+'。'
            '七头身成年人物比例，精细的五官，表情自然。甲片、缝线、皮革绑带、铆钉、布料褶皱、金属磨损均清晰可见，'
            '低饱和的手工上色收藏级树脂微缩模型，三分之四正面视角，接近1994年电视剧三国演义的克制服饰气质。'
            '完整圆形或椭圆形岩石底座，米灰色摄影棚背景，柔和侧光和轮廓光，清晰的商品摄影，无文字无水印，'
            '没有其他人物，非卡通，非方块人，非日本武士，非欧洲骑士，不使用奇幻尖刺盔甲。')
        w['6']['inputs']['seed']=2026110600+sum(map(ord,id))
        w['8']['inputs']['filename_prefix']='three-kingdoms-review/'+id+'-concept'
        output_node='8';output_key='images'
    else:
        w=json.loads((ARCHIVE/'shape-workflow.json').read_text(encoding='utf-8'))
        incoming=COMFY/'input/atlas-miniatures'/f'{id}.png';incoming.parent.mkdir(exist_ok=True)
        shutil.copyfile(OUT/'concepts'/f'{id}.png',incoming)
        w['2']['inputs']['image']='atlas-miniatures/'+id+'.png'
        w['10']['inputs']['filename_prefix']='three-kingdoms-review/'+id+'-shape'
        output_node='10';output_key='3d'
    (ARCHIVE/f'{id}-{mode}-workflow.json').write_text(json.dumps(w,ensure_ascii=False,indent=2),encoding='utf-8')
    submitted=api('prompt',{'prompt':w,'client_id':'three-kingdoms-atlas-review'})
    (ARCHIVE/f'{id}-{mode}-job.json').write_text(json.dumps(submitted,indent=2))
    prompt_id=submitted['prompt_id'];start=time.monotonic();reported=0
    print('生成中',asset['name'],mode,prompt_id,flush=True)
    while True:
        history=api('history/'+prompt_id).get(prompt_id)
        if history:break
        elapsed=int(time.monotonic()-start)
        if elapsed//30>reported:reported=elapsed//30;print('处理中',asset['name'],elapsed,'秒',flush=True)
        time.sleep(3)
    (ARCHIVE/f'{id}-{mode}-history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2),encoding='utf-8')
    if history['status']['status_str']!='success':raise RuntimeError(history['status'])
    item=history['outputs'][output_node][output_key][0]
    shutil.copyfile(COMFY/'output'/item['subfolder']/item['filename'],target)
    print('完成',asset['name'],mode,target.stat().st_size,'字节',flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['concepts','raw']);parser.add_argument('--ids',nargs='*');args=parser.parse_args()
    (OUT/args.mode).mkdir(parents=True,exist_ok=True)
    data=json.loads((ROOT/'data/editorial/miniatures.json').read_text(encoding='utf-8'))
    for asset in data['assets']:
        if asset['selected'] and (not args.ids or asset['id'] in args.ids):generate(asset,args.mode)

if __name__=='__main__':main()
