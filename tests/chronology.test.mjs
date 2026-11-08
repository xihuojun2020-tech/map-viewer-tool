import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {julianDay,julianDate,timeWindow,activityStatus,yearMonths,monthName,timelineStarts} from '../web/chronology.mjs';
import {stateAt} from '../web/state.mjs';
const data=JSON.parse(readFileSync(new URL('../web/atlas.json',import.meta.url)));
const cursor=(year,month,day=1,granularity='month',calendar='han')=>({world:'history',position:year,calendar,granularity,day,monthStart:yearMonths(data,year,calendar).find(m=>m.month===month).start});
test('三套历法保留朔日差异、闰月及景初特殊月序',()=>{
 assert.deepEqual(julianDate(julianDay(223,3,20)),{year:223,month:3,day:20});
 assert.equal(timeWindow(data,cursor(223,2)).start-timeWindow(data,cursor(223,2,1,'month','wu')).start,1);
 assert.ok(yearMonths(data,184).some(m=>m.month===-7));
 assert.ok(!yearMonths(data,237).some(m=>m.month===3));
 assert.equal(monthName(yearMonths(data,239).at(-1)),'后十二月');
});
test('按周不将月记录伪装为本周确定发生',()=>{
 const r=data.activities.find(a=>a.name==='波才等黄巾');
 assert.equal(activityStatus(r,data,cursor(184,5)),'recorded');
 assert.equal(activityStatus(r,data,cursor(184,5,1,'week')),'uncertain');
 assert.equal(activityStatus(r,data,cursor(184,4)),'hidden');
 assert.equal(activityStatus(r,data,cursor(184,6)),'earlier');
});
test('干支可唯一换算；冲突原文保留而不伪造某日',()=>{
 const exact=data.events.find(e=>e.id==='h-y-184-luoyang').time;
 assert.equal(exact.start,exact.end);assert.equal(exact.precision,'day');
 const disputed=data.events.find(e=>e.id==='h-y-184-nanyang');
 assert.equal(disputed.time.precision,'month');assert.ok(disputed.uncertainty.includes('52'));
});
test('月日未知的控制事件不在同年年初提前应用',()=>{
 assert.equal(stateAt(data,cursor(194,1)).controlRecords.tan?.id,'h-tao');
 assert.equal(stateAt(data,{world:'history',position:194}).controls.xuzhou,'liu');
});
test('青州兵改编归曹，未编年或未知营地人物不生成当前部署',()=>{
 const r=data.activities.find(a=>a.name.startsWith('青州兵'));
 assert.equal(r.faction_id,'cao');assert.equal(activityStatus(r,data,cursor(192,9)),'hidden');
 assert.equal(activityStatus(r,data,cursor(193,1)),'earlier');
 const dian=data.activities.find(a=>a.id==='dian-zhangmiao');assert.equal(dian.place_id,null);
 assert.equal(activityStatus(data.activities.find(a=>a.id==='dian-early'),data,cursor(192,1)),'undated');
});
test('演义活动汇集本回已读记载，不把上回位置延续到下回',()=>{
 const r=data.activities.find(a=>a.id==='r-liu-guangzong');
 assert.equal(activityStatus(r,data,{world:'romance',position:1012}),'hidden');
 assert.equal(activityStatus(r,data,{world:'romance',position:1013}),'recorded');
 assert.equal(activityStatus(r,data,{world:'romance',position:1014}),'recorded');
 assert.equal(activityStatus(r,data,{world:'romance',position:2001}),'earlier');
 assert.equal(activityStatus(r,data,cursor(184,6)),'hidden');
});
test('七日窗口跨月保持连续，在已发布历法末日截止',()=>{
 const months=yearMonths(data,184),lastday=months[0].end-months[0].start+1;
 const w=timeWindow(data,cursor(184,1,lastday,'week'));assert.equal(w.end-w.start,6);assert.ok(w.end>months[0].end);
 const last=yearMonths(data,264,'shu').at(-1),end=timeWindow(data,cursor(264,last.month,last.end-last.start+1,'week','shu'));assert.equal(end.end,last.end);
});

test('拖动条包含闰月、特殊后月与跨年七日，不回退到年初',()=>{
 for(const calendar of ['han','shu','wu']){
  const year=calendar==='shu'?234:239,c=cursor(year,1,1,'month',calendar),months=timelineStarts(data,c);
  const all=data.calendar.calendars[calendar].filter(m=>m.year>=184&&m.year<=280);
  assert.deepEqual(months,all.map(m=>m.start));
  c.granularity='week';c.day=17;
  const weeks=timelineStarts(data,c),start=timeWindow(data,c).start,index=weeks.indexOf(start);
  assert.ok(index>=0);assert.equal(weeks[index+1]-weeks[index],7);
  assert.ok(weeks.at(-1)<=all.at(-1).end);assert.ok(weeks.at(-1)+7>all.at(-1).end);
 }
});
