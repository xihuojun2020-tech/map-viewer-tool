// Reuse the application's time/control rules at every possible ownership change.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stateAt,territoryAt,territoryGroups} from '../web/state.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const data=read('web/atlas.json'),regions=read('web/strategic-regions.json');
const months=data.calendar.calendars.han;
const first=months.find(m=>m.year===184);
const cursors=[{world:'history',position:184,granularity:'month',monthStart:first.start},
  {world:'romance',position:1001}];
const changes=new Set([
  ...regions.history.map(p=>months.findLast(m=>m.year===p.year).end),
  ...data.events.filter(e=>e.world==='history'&&Object.keys(e.controls).length).map(e=>e.time.end),
]);
for(const end of changes){
  const start=end-6,month=months.find(m=>m.start<=start&&m.end>=start);
  cursors.push({world:'history',position:month.year,granularity:'week',monthStart:month.start,day:start-month.start+1});
}
for(const event of data.events.filter(e=>e.world==='romance'&&Object.keys(e.controls).length))
  cursors.push({world:'romance',position:event.position});
for(const frame of data.national.romance)cursors.push({world:'romance',position:frame.position});
const keys=new Set();
for(const cursor of cursors)
  for(const group of territoryGroups(territoryAt(data,regions,cursor,stateAt(data,cursor))))keys.add(group.key);
const result=execFileSync(process.argv[2]||'python',[fileURLToPath(new URL('scripts/build_faction_labels.py',root))],
  {input:JSON.stringify([...keys].sort()),encoding:'utf8'});
process.stdout.write(result);
