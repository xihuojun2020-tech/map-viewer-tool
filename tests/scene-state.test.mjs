import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSceneView,resolveScenePlaces} from '../web/scene/state.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const pack=read('../data/editorial/scene-examples/xuzhou-letter.json');
const data=read('../web/atlas.json'),regions=read('../web/strategic-regions.json');
const view=(options={})=>buildSceneView(pack,{position:5,view:'current',step:3,branch:'leak',...options},regions);

test('计划、约定与条件死亡不改变当前归属、人物或兵力',()=>{
  const current=view(),plan=view({view:'plan'}),hypothesis=view({view:'analysis'});
  assert.deepEqual(current.controls,plan.controls);assert.deepEqual(current.controls,hypothesis.controls);
  assert.ok(current.people.some(p=>p.id==='jiling'));
  assert.equal(current.units.find(u=>u.id==='ji-army').strength.value,70000);
  assert.equal(current.units.find(u=>u.id==='liu-army').strength,null);
  assert.equal(current.agreements.length,0);assert.equal(plan.agreements.length,2);
  assert.equal(current.controls.find(r=>r.id==='g3640').owner,null,'广陵约定不能变成实控');
  assert.equal(current.actions.length,1);assert.ok(!current.actions.some(a=>a.id==='liu-cut'));
  assert.match(hypothesis.branch.assumption,/假设/);
});
test('按已读片段回看，七万、截信与后续约定不能提前出现',()=>{
  const early=view({position:1,view:'plan'});
  assert.equal(early.people.some(p=>p.id==='zhangxun'),false);
  assert.equal(early.units.find(u=>u.id==='ji-army').strength,null);
  assert.equal(early.agreements.length,0);assert.equal(early.observations.some(o=>o.id==='intercept-letter'),false);
  assert.equal(view({position:2,view:'analysis'}).branch,null);
  assert.equal(view({position:3}).observations.some(o=>o.id==='alliance'),true);
});
test('同一支军队的多次兵力提及不累加；推演不污染原始包',()=>{
  const duplicate=structuredClone(pack);duplicate.strengths.push({...duplicate.strengths[0],id:'repeat'});
  assert.equal(buildSceneView(duplicate,{position:5,view:'current',step:3},regions).units.find(u=>u.id==='ji-army').strength.value,70000);
  const original=JSON.stringify(pack);view({view:'analysis'});view({view:'plan'});assert.equal(JSON.stringify(pack),original);
});
test('江东刘备保留；归属只来自本场景，没有按正史补全全国',()=>{
  const result=view();assert.equal(result.controls.find(r=>r.id==='g2840').owner,'liu');
  assert.ok(result.controls.some(r=>r.owner===null));
  assert.ok(result.controls.filter(r=>r.owner).every(r=>r.basis==='inferred'));
  assert.equal(result.controls.length,regions.features.length);
  assert.equal(pack.storyDate,null);assert.equal(pack.book,null);
});
test('底图定位与相对示意分开；徐州不是彭城，淮陵不编造城址',()=>{
  const places=resolveScenePlaces(pack,data,regions);
  assert.deepEqual(places.get('shouchun').coordinates,data.places.find(p=>p.id==='shouchun').coordinates);
  assert.notDeepEqual(places.get('xuzhou').coordinates,data.places.find(p=>p.id==='pengcheng').coordinates);
  assert.equal(places.get('huailing').mode,'relative');assert.match(places.get('huailing').note,/不是实际营地/);
});
test('示例引句存在且不得引用未读段落；发布示例与编录源一致',()=>{
  assert.deepEqual(pack,read('../web/scene/xuzhou-letter.json'));
  for(const key of ['controls','observations','strengths','agreements','branches','actions','locations'])for(const item of pack[key]){
    for(const id of item.evidence){const quote=pack.evidence.find(q=>q.id===id);assert.ok(quote,`${item.id} 缺少引句`);assert.ok(quote.at<=item.at,`${item.id} 引用了未读证据`);}
  }
});
test('已否定或取消的行动不再作为计划箭头显示，位置资料按已读范围公开',()=>{
  const cancelled=structuredClone(pack);cancelled.actions.find(a=>a.id==='liu-cut').status='cancelled';
  const result=buildSceneView(cancelled,{position:5,view:'plan',step:3},regions);
  assert.ok(!result.actions.some(a=>a.id==='liu-cut'));
  assert.equal(view({position:0}).locations.length,0);
  assert.equal(view({position:1}).locations[0].person,'liubei');
});
test('对象与地图区域编号有效，片段不能引用不存在的人物、部队或地点',()=>{
  const ids=key=>new Set(pack[key].map(x=>x.id));
  const people=ids('people'),factions=ids('factions'),units=ids('units'),places=ids('places');
  const cells=new Set(regions.features.map(f=>f.properties.id));
  for(const key of ['people','factions','units','actions','controls','evidence','observations'])assert.equal(ids(key).size,pack[key].length);
  for(const p of pack.people)assert.ok(p.faction===null||factions.has(p.faction));
  for(const f of pack.factions)assert.ok(people.has(f.leader));
  for(const u of pack.units){assert.ok(factions.has(u.faction));assert.ok(people.has(u.commander));}
  for(const a of pack.actions){assert.ok(people.has(a.actor));assert.ok(a.unit===null||units.has(a.unit));assert.ok(a.from===null||places.has(a.from));assert.ok(places.has(a.to));}
  for(const item of [...pack.controls,...pack.agreements,...pack.places.filter(p=>p.mode==='region')])assert.ok(item.regionIds.every(id=>cells.has(id)));
});
