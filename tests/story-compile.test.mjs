import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileStory,validateStoryInput} from '../web/scene/compile.mjs';
import {buildSceneView} from '../web/scene/state.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../web/atlas.json'),regions=read('../web/strategic-regions.json');
const fact=(values={})=>({chapter:1,paragraph:1,quote:'守军驻守下曲阳。',kind:'control',status:'narrated',temporal:'current',summary:'守军控制下曲阳',actor:'甲',faction:'守军',leader:'甲',place:'下曲阳',from:'',scope:'city',unit:'',unitType:'',strength:null,...values});
const compile=facts=>compileStory(validateStoryInput({id:'test',title:'测试资料',total:9,completed:9,facts}),data,regions,'a'.repeat(64));
const view=(pack,position)=>buildSceneView(pack,{position,view:'current',step:0},regions);

test('守城只生成城池控制标记，不把全郡染色；同城异名共用定位',()=>{
  const pack=compile([fact(),fact({paragraph:2,place:'下曲阳县'})]);
  assert.equal(pack.controls.length,0);assert.equal(pack.places.length,1);
  assert.equal(view(pack,1).pointControls.length,1);
});
test('任命、计划、回忆和引文待复核记录不能获得领土',()=>{
  const pack=compile([fact({place:'冀州',scope:'province',quote:'拜甲为将军，领冀州牧。',summary:'任命甲为冀州牧'}),
    fact({paragraph:2,status:'planned'}),fact({paragraph:3,temporal:'memory'}),fact({paragraph:4,reviewNote:'引文待复核'})]);
  assert.equal(pack.controls.length,0);assert.equal(pack.pointControls.length,0);
  assert.ok(pack.observations.some(o=>o.summary.includes('不等同领土控制')));
});

test('草原北海不能套用山东北海郡，即使模型没有补上辨义名',()=>{
  const pack=compile([fact({place:'北海',scope:'region',quote:'草原上倒是没怎么动，还是维持在北海一线。'})]);
  assert.equal(pack.places.length,0);assert.equal(pack.controls.length,0);assert.equal(pack.pointControls.length,0);
  assert.match(pack.observations[0].summary,/尚未匹配/);
  assert.ok(compile([fact({place:'北海',scope:'region',quote:'北海郡守军开城投降。'})]).places.length>0);
});
test('人物领袖随已读位置变化；未知地名只保留文字依据',()=>{
  const pack=compile([fact(),fact({chapter:2,leader:'乙',actor:'乙',place:'不存在的古城'})]);
  assert.equal(view(pack,0).factions[0].leader,pack.people.find(p=>p.name==='甲').id);
  assert.equal(view(pack,1).factions[0].leader,pack.people.find(p=>p.name==='乙').id);
  assert.equal(pack.places.length,1);assert.match(pack.observations[1].summary,/尚未匹配/);
});
test('地图只展示近期行动，完整行动档案保留且不泄漏后章',()=>{
  const pack=compile([fact({kind:'action',from:'广宗',unit:'守军部队'}),fact({chapter:5,kind:'context',quote:'甲仍在此地。'})]);
  assert.equal(view(pack,0).actions.length,1);assert.equal(view(pack,1).actions.length,0);assert.equal(pack.actions.length,1);
  assert.throws(()=>validateStoryInput({id:'bad',title:'错误',completed:1,total:1,facts:[fact({strength:-1})]}));
});

test('实际批次暴露的任职、政务与局部辖境不能扩成整区占领',()=>{
  const statements=['举荐甲出任冀州牧。','以甲为冀州牧。','命甲为冀州牧。',
    '改封甲为太尉，依旧令其镇守冀州。','甲下令冀州官员服丧。',
    '大半个冀州不在甲手上。','冀州已经收复一半。','已收复半个平原郡。','除最东边一郡以外，其余已经全部收复。','军队分裂成两部。'];
  const pack=compile(statements.map((quote,i)=>fact({paragraph:i+1,place:'冀州',scope:'province',quote,summary:quote})));
  assert.equal(pack.controls.length,0);assert.equal(pack.pointControls.length,0);
  const captured=compile([fact({place:'冀州',scope:'province',quote:'冀州全部收复，甲实际控制全州。'})]);
  assert.ok(captured.controls[0].regionIds.length>1);
});
test('人名势力异称和临甾异名共用已有身份与地理定位',()=>{
  const pack=compile(['张新军','张新部','张新势力','张新'].map((faction,i)=>fact({paragraph:i+1,actor:'张新',leader:'张新',faction,place:i%2?'临淄':'临甾'})));
  assert.equal(pack.factions.length,1);assert.equal(pack.factions[0].name,'张新');
  assert.equal(pack.places.length,1);assert.equal(pack.places[0].baseId,'linzi');
});
test('以州郡称呼的势力仅在原数据明确领袖时归并，不把不同领袖合为一方',()=>{
  const pack=compile([fact({faction:'张新军',actor:'张新',leader:'张新'}),
    fact({paragraph:2,faction:'青州',actor:'高顺',leader:'张新'}),
    fact({paragraph:3,faction:'冀州',actor:'韩馥',leader:'韩馥'}),
    fact({paragraph:4,faction:'徐州',actor:'',leader:''})]);
  assert.deepEqual(pack.factions.map(f=>f.name),['张新','韩馥','徐州']);
  assert.equal(pack.pointControls[0].faction,pack.pointControls[1].faction);
});
test('明确失守撤销原势力的城池或区域，保留后来接管方的归属',()=>{
  const pack=compile([fact(),fact({paragraph:2,status:'negated',quote:'守军丢失下曲阳。'}),
    fact({paragraph:3,faction:'来军',leader:'乙'}),fact({paragraph:4,status:'negated',quote:'守军已不控制下曲阳。'})]);
  assert.equal(view(pack,0).pointControls.length,1);assert.equal(view(pack,1).pointControls.length,0);
  assert.equal(view(pack,3).pointControls[0].faction,pack.factions.find(f=>f.name==='来军').id);
  const region=compile([fact({place:'冀州',scope:'province',quote:'守军控制冀州。'}),
    fact({paragraph:2,place:'冀州',scope:'province',status:'negated',quote:'守军失去冀州。'})]);
  assert.ok(view(region,0).controls.some(c=>c.owner));assert.ok(view(region,1).controls.every(c=>!c.owner));
});
