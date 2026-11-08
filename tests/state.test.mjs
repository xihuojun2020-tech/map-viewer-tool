import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {julianDate} from '../web/chronology.mjs';
import { stateAt, visibleEvents, visiblePeople, search, availableDifferences, territoryAt, territoryGroups } from '../web/state.mjs';

const data = JSON.parse(readFileSync(new URL('../web/atlas.json', import.meta.url)));
const history = position => ({world: 'history', position});
const novel = position => ({world: 'romance', position});
const regions=JSON.parse(readFileSync(new URL('../web/strategic-regions.json', import.meta.url)));
const factionCentres=JSON.parse(readFileSync(new URL('../web/faction-labels.json', import.meta.url)));

const endingAt=end=>{
 const start=end-6,month=data.calendar.calendars.han.find(m=>m.start<=start&&m.end>=start);
 return {world:'history',position:month.year,calendar:'han',granularity:'week',monthStart:month.start,day:start-month.start+1};
};
test('彭城攻克、下邳水攻和癸酉城陷各按证据生效，回看复原',()=>{
 const capture=data.events.find(e=>e.id==='h-199-defeat'),pengcheng=data.events.find(e=>e.id==='h-198-pengcheng');
 assert.equal(capture.year,198);assert.equal(julianDate(capture.time.end).year,199);
 const owner=(end,id)=>{
  const c=endingAt(end),t=territoryAt(data,regions,c,stateAt(data,c));
  return t.records.find(r=>regions.features.find(f=>f.properties.id===r.id).properties.place_id===id).owner;
 };
 assert.equal(owner(pengcheng.time.end,'pengcheng'),'cao');
 assert.equal(owner(pengcheng.time.end,'xiapi'),'lu');
 assert.equal(owner(capture.time.end-1,'xiapi'),'lu');
 assert.equal(owner(capture.time.end,'xiapi'),'cao');
 assert.equal(owner(capture.time.end-1,'xiapi'),'lu');
});
test('新接管记录只改所列地点，月季范围结束前不提前确定，晚期历日冲突保留',()=>{
 for(const id of ['h-204-ye','h-208-jing','h-214-chengdu','h-219-jiangling','h-263-chengdu','h-280-jianye']){
  const e=data.events.find(e=>e.id===id),before=stateAt(data,endingAt(e.time.end-1)),after=stateAt(data,endingAt(e.time.end));
  for(const place of Object.keys(e.controls)){
   assert.notEqual(before.controlRecords[place]?.id,id);assert.equal(after.controlRecords[place].id,id);
  }
  assert.ok(!('xuzhou'in e.controls),'城池接管不得扩展为整州');
 }
 const jin=data.events.find(e=>e.id==='h-265');assert.equal(jin.year,265);assert.equal(julianDate(jin.time.end).year,266);
 const wu=data.events.find(e=>e.id==='h-280-jianye');assert.equal(wu.time.precision,'month');assert.match(wu.uncertainty,/不合|无此干支/);
});

test('势力名称中心覆盖各历法月份、控制事件前后与小说已读范围',()=>{
  const cursors=data.events.filter(e=>e.world==='romance').flatMap(e=>[novel(e.position-1),novel(e.position)]);
  cursors.push(novel(1001));
  for(const chapter of data.chapters)cursors.push(novel(chapter.number*1000+chapter.paragraphs));
  for(const [calendar,months]of Object.entries(data.calendar.calendars)){
    for(const m of months.filter(m=>m.year>=184&&m.year<=280))
      cursors.push({...history(m.year),calendar,granularity:'month',monthStart:m.start});
    for(const e of data.events.filter(e=>e.world==='history'&&Object.keys(e.controls).length&&e.time.end-7>=months[0].start&&e.time.end<=months.at(-1).end))
      for(const end of [e.time.end-1,e.time.end]){
        const start=end-6,m=months.find(m=>m.start<=start&&m.end>=start);
        cursors.push({...history(m.year),calendar,granularity:'week',monthStart:m.start,day:start-m.start+1});
      }
  }
  for(const cursor of cursors)
    for(const group of territoryGroups(territoryAt(data,regions,cursor,stateAt(data,cursor))))
      assert.ok(factionCentres[group.key],`${JSON.stringify(cursor)}：${group.owner}没有当前控制区中心`);
});

test('区域填色随事件变化，小沛局部不扩大为整郡或整州',()=>{
  const at=cursor=>territoryAt(data,regions,cursor,stateAt(data,cursor));
  const local=(year,id)=>at(history(year)).records.find(r=>regions.features.find(f=>f.properties.id===r.id).properties.place_id===id);
  assert.equal(local(196,'xiaopei').owner,'liu');
  assert.equal(local(196,'xiapi').owner,'lu');
  assert.equal(local(200,'xiaopei').owner,'cao');
  assert.equal(local(196,'xiaopei').owner,'liu');
  const month=data.calendar.calendars.han.find(m=>m.year===196);
  assert.equal(at({...history(196),calendar:'han',granularity:'month',monthStart:month.start}).phase.year,194);
  assert.ok(at(novel(1001)).records.every(r=>!r.owner));
  const attack=data.events.find(e=>e.id==='r-lu-attack');
  const get=(pos,id)=>at(novel(pos)).records.find(r=>regions.features.find(f=>f.properties.id===r.id).properties.place_id===id).owner;
  assert.equal(get(attack.position-1,'pengcheng'),'liu');
  assert.equal(get(attack.position,'pengcheng'),'lu');
  assert.equal(get(attack.position,'xiaopei'),'liu');
});

test('历史控制按事件恢复，回看不残留后年的控制', () => {
  assert.equal(stateAt(data, history(194)).controls.xuzhou, 'liu');
  assert.equal(stateAt(data, history(196)).controls.xuzhou, 'lu');
  assert.equal(stateAt(data, history(199)).controls.xuzhou, 'liu');
  assert.equal(stateAt(data, history(200)).controls.xuzhou, 'cao');
  assert.equal(stateAt(data, history(184)).controls.xuzhou, undefined);
  assert.equal(stateAt(data, history(194)).controls.xuzhou, 'liu');
});

test('第十四回袭城段落之前不能提前改变控制', () => {
  const event = data.events.find(x => x.id === 'r-lu-attack');
  assert.equal(stateAt(data, novel(event.position - 1)).controls.xuzhou, 'liu');
  assert.equal(stateAt(data, novel(event.position)).controls.xuzhou, 'lu');
});

test('演义全国阶段按回推进，不提前吞并江东荆南汉中，后期不残留徐州旧归属',()=>{
  const at=chapter=>{const c=novel(chapter*1000+data.chapters.find(x=>x.number===chapter).paragraphs);return territoryAt(data,regions,c,stateAt(data,c));};
  const owner=(chapter,key)=>at(chapter).records.find(r=>regions.features.find(f=>f.properties.id===r.id).properties.phase_key===key).owner;
  for(const chapter of data.chapters){
    const t=at(chapter.number);
    assert.equal(t.records.filter(r=>r.owner).length,regions.features.length,`第${chapter.number}回有未加载的全国背景`);
    assert.ok(t.phase.citation&&Number(t.phase.citation.source.slice(-3))<=chapter.number);
  }
  assert.equal(owner(7,'魏郡'),'yuan');
  assert.equal(owner(14,'丹阳郡'),'liuyao');assert.equal(owner(15,'丹阳郡'),'sunce');
  assert.equal(owner(28,'吴郡'),'sunce');assert.equal(owner(29,'吴郡'),'sunquan');
  assert.equal(owner(51,'桂阳郡'),'jing-local');assert.equal(owner(52,'桂阳郡'),'liu');
  assert.equal(owner(52,'长沙郡'),'jing-local');assert.equal(owner(53,'长沙郡'),'liu');
  assert.equal(owner(65,'汉中郡'),'zhanglu');assert.equal(owner(67,'汉中郡'),'cao');assert.equal(owner(73,'汉中郡'),'liu');
  assert.equal(owner(73,'南郡'),'liu');assert.equal(owner(76,'南郡'),'sunquan');
  assert.deepEqual([...new Set(at(120).records.map(r=>r.owner))],['jin']);
  assert.equal(owner(14,'丹阳郡'),'liuyao','后回回看不得残留后续状态');
  const place=(chapter,id)=>at(chapter).records.find(r=>regions.features.find(f=>f.properties.id===r.id).properties.place_id===id).owner;
  assert.equal(place(15,'xiaopei'),'liu');assert.equal(place(19,'xiaopei'),'cao');
  assert.equal(place(21,'xiaopei'),'liu');assert.equal(place(24,'xiapi'),'liu');assert.equal(place(25,'xiapi'),'cao');
});

test('得到徐州与下邳入城是不同事件，围城不能提前变更城池归属', () => {
  const at = id => novel(data.events.find(x => x.id === id).position);
  assert.equal(stateAt(data, at('r-xuzhou-cao')).controls.xuzhou, 'cao');
  assert.equal(stateAt(data, at('r-xuzhou-cao')).controls.xiapi, 'lu');
  assert.equal(stateAt(data, at('r-flood')).controls.xiapi, 'lu');
  assert.equal(stateAt(data, at('r-capture')).controls.xiapi, 'cao');
  assert.ok(!visibleEvents(data, at('r-flood')).some(x => x.id === 'r-lu-end'));
});

test('人物检索、引用和差异对照都受小说阅读位置限制', () => {
  const early = novel(1001);
  const people = visiblePeople(data, early);
  for (const person of people) assert.ok(person.mentions.every(x => x.world === 'romance' && x.position <= early.position));
  assert.ok(!search(data, early, '邓艾').some(x => x.kind === 'person'));
  assert.deepEqual(availableDifferences(data, early), []);
  assert.ok(availableDifferences(data, novel(19045)).length >= 2);
});

test('小说起始段落不预置后文，后期使用自身叙事分期而非停留在徐州样区', () => {
  assert.equal(stateAt(data, novel(1001)).controls.xuzhou, undefined);
  assert.equal(stateAt(data, novel(120001)).controls.xuzhou, 'cao');
  assert.equal(stateAt(data, novel(120001)).controlRecords.xuzhou.id, 'r-xuzhou-cao');
  assert.equal(stateAt(data, novel(120001)).outsideReviewedRange, false);
  assert.ok(visibleEvents(data, novel(120001)).every(x => x.world === 'romance'));
});

test('地名检索结果保持地点类型，不与原始地点类别字段混淆', () => {
  const results = search(data, history(194), '下邳');
  assert.equal(results.find(x => x.id === 'xiapi').kind, 'place');
});

test('张飞的字分别使用正史与小说原文，未读到时不显示人物基础资料', () => {
  const facts=(cursor)=>visiblePeople(data,cursor).find(x=>x.name==='张飞')?.facts ?? [];
  assert.equal(facts(history(194))[0].courtesy,'益德');
  assert.equal(facts(novel(1007))[0].courtesy,'翼德');
  assert.deepEqual(facts(novel(1001)),[]);
});

test('未读到水攻时不开放对应史实对照，引文不得连带透露下邳结局', () => {
  const capture = data.events.find(x=>x.id==='r-xuzhou-cao');
  assert.ok(!availableDifferences(data,novel(capture.position)).some(x=>x.id==='xiapi-capture'));
  const flood = data.events.find(x=>x.id==='h-198-flood');
  assert.ok(!flood.citation.quote.includes('皆殺之'));
});
