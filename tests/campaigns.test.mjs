import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {activeCampaigns,arrowShape} from '../web/campaigns.mjs';
import {activityStatus} from '../web/chronology.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../web/atlas.json',import.meta.url)));
const records=JSON.parse(fs.readFileSync(new URL('../web/campaigns.json',import.meta.url))).campaigns;
const get=id=>records.find(r=>r.id===id);
function history(year,month,granularity='month'){
  return {world:'history',position:year,calendar:'han',granularity,day:1,monthStart:data.calendar.calendars.han.find(m=>m.year===year&&m.month===month).start};
}

test('十月乌巢不提前到九月、不延续到十一月；七日窗口保留不确定性',()=>{
  const record=get('h-wuchao');
  assert.equal(activityStatus(record,data,history(200,9)),'hidden');
  assert.equal(activityStatus(record,data,history(200,10)),'recorded');
  assert.equal(activityStatus(record,data,history(200,10,'week')),'uncertain');
  assert.equal(activityStatus(record,data,history(200,11)),'earlier');
});
test('小说按回隔离，前回消失、后回不提前、正史不混入',()=>{
  const cursor={world:'romance',position:30999};
  assert.deepEqual(activeCampaigns(records,data,cursor).map(r=>r.id),['r-wuchao','r-guandu']);
  assert.equal(activityStatus(get('r-wuchao'),data,{...cursor,position:29999}),'hidden');
  assert.equal(activityStatus(get('r-wuchao'),data,{...cursor,position:31999}),'earlier');
  assert.equal(activityStatus(get('h-wuchao'),data,cursor),'hidden');
});
test('兵数口径与原典保留：步骑、百姓、降卒和争议数不能混同',()=>{
  assert.match(get('h-wuchao').attacker.strength,/步骑五千/);
  assert.match(get('h-changban').defender.strength,/被甲者少/);
  assert.match(get('r-changban').defender.strength,/三千余军马、十数万百姓/);
  assert.match(get('h-jibei').defender.strength,/受降卒/);
  assert.match(get('h-guandu').defender.strength,/裴松之明确质疑/);
  for(const r of records)for(const c of r.citations){
    assert.ok(c.display_quote&&c.url&&c.revision);
    if(r.world==='romance')assert.equal(c.source,`romance-${String(r.chapter).padStart(3,'0')}`);
  }
});
test('箭头头部朝向目标，短距离不伪造长度，缺起点的战役保留为空',()=>{
  const from={x:120,y:80};
  for(const to of [{x:420,y:80},{x:120,y:380},{x:-180,y:80},{x:120,y:-220}]){
    const shape=arrowShape(from,to),[tip,left,right]=shape.head.split(' ').map(p=>p.split(',').map(Number));
    const base=[(left[0]+right[0])/2,(left[1]+right[1])/2];
    assert.ok(Math.hypot(tip[0]-to.x,tip[1]-to.y)<Math.hypot(base[0]-to.x,base[1]-to.y));
    assert.ok(!/NaN/.test(shape.path));
  }
  assert.equal(arrowShape(from,from),null);
  assert.equal(get('h-changshe').origin,null);
  assert.equal(get('r-xiapi').origin,null);
});
