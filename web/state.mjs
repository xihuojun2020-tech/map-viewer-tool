import {timeWindow,eventWindow} from './chronology.mjs';

export function visibleEvents(data, cursor) {
  const window=cursor.world==='history'?timeWindow(data,cursor):null;
  return data.events.filter(event => event.world === cursor.world && (window?eventWindow(event).start<=window.end:event.position<=cursor.position))
    .sort((a, b) => (window?eventWindow(a).start-eventWindow(b).start:a.position-b.position) || (a.order || 0) - (b.order || 0));
}

export function stateAt(data, cursor) {
  const events = visibleEvents(data, cursor);
  const controls = {};
  const controlRecords = {};
  const window=cursor.world==='history'?timeWindow(data,cursor):null;
  const controlEvents=window?[...events].sort((a,b)=>a.time.end-b.time.end||a.time.start-b.time.start||(a.order||0)-(b.order||0)):events;
  for (const event of controlEvents) {
    if(window&&eventWindow(event).end>window.end)continue;
    for (const [place, faction] of Object.entries(event.controls)) {
      controls[place] = faction;
      controlRecords[place] = event;
    }
  }
  const frames=data.national[cursor.world];
  const frame=frames.findLast(x=>x.position<=cursor.position);
  return { events, controls, controlRecords, frame, window,
    uncertainEvents:window?events.filter(e=>eventWindow(e).end>window.end):[],lastEvent: events.at(-1),
    outsideReviewedRange: cursor.world === 'romance' && !frame };
}

export function territoryAt(data, regions, cursor, snapshot) {
  let phase, owners;
  if(cursor.world==='history'){
    const months=data.calendar.calendars.han;
    const yearEnd=year=>months.findLast(m=>m.year===year).end;
    const reference=regions.history.findLast(p=>yearEnd(p.year)<=snapshot.window.end)||regions.history[0];
    phase={...reference,time:{start:months.find(m=>m.year===reference.year).start,end:yearEnd(reference.year),precision:'year'},
      dating:'阶段参照，未核定具体月日；在年份区间结束后启用。起始184年背景仅作基准，不是逐月复原。'};
    owners=phase.owners;
  }else{
    // Narrative checkpoints are separately corrected against the already-read text.
    // Their ownership is applied to the current research parcels, not the retired grid.
    phase=snapshot.frame?{...snapshot.frame,year:snapshot.frame.reference_year}:
      {year:null,position:0,title:'本回局势待考',note:'当前进度之前尚无编录。',source_ids:[]};
    owners=snapshot.frame?.commandery_owners||{};
  }
  const records=regions.features.map(cell=>{
    const properties=cell.properties;
    let owner=owners[properties.phase_key],event=snapshot.controlRecords[properties.place_id];
    const regional=snapshot.controlRecords.xuzhou;
    if(cursor.world==='romance'&&snapshot.frame?.controls[properties.place_id])owner=snapshot.frame.controls[properties.place_id];
    const regionalApplies=properties.province==='徐州'&&regional&&(cursor.world==='romance'?regional.position>=phase.position:regional.time.end>=phase.time.start);
    if(regionalApplies)owner=regional.controls.xuzhou;
    // A newer phase replaces older town records; a record from the same year
    // remains authoritative for its local display cell after its date interval.
    if(event&&cursor.world==='history'&&(event.time.end<phase.time.start||(regionalApplies&&event.time.end<regional.time.end)))event=null;
    if(event&&cursor.world==='romance'&&event.position<phase.position)event=null;
    if(event)owner=event.controls[properties.place_id];
    if(cursor.world==='history'&&phase.year===194&&properties.place_id==='juancheng')owner='cao';
    return {id:properties.id,owner,event:event||(regionalApplies?regional:null),phase,
      kind:event?'地点记录＋概略显示区块':regionalApplies?'地区归属记录＋概略显示区块':owner?'阶段形势推定':'归属待考'};
  });
  return {phase,records};
}

// A group key depends on the currently owned parcels, not a historical year or
// novel chapter. The same ownership uses the same precomputed interior centre.
export function territoryGroups(territory) {
  const groups=new Map();
  for(const record of territory.records){
    if(!record.owner)continue;
    if(!groups.has(record.owner))groups.set(record.owner,[]);
    groups.get(record.owner).push(record.id);
  }
  return [...groups].map(([owner,ids])=>({owner,key:ids.sort().join('|')}));
}

export function visiblePeople(data, cursor) {
  return data.people.map(person => ({ ...person,
    facts:person.facts.filter(fact=>fact.world===cursor.world&&(cursor.world==='history'||fact.position<=cursor.position)),
    mentions: person.mentions.filter(mention =>
    mention.world === cursor.world && (cursor.world === 'history' || mention.position <= cursor.position)) }))
    .filter(person => person.mentions.length);
}

export function search(data, cursor, query) {
  const value = query.trim();
  if (!value) return [];
  const match = item => [item.name, ...item.aliases].some(name => name.includes(value));
  return [...data.places.filter(match).map(item => ({...item, kind:'place'})),
    ...data.story_geography.features.map(f=>f.properties).filter(match).map(item=>({...item,geography_kind:item.kind,kind:'story-geography'})),
    ...data.national.commanderies.filter(x=>x.properties.name.includes(value)).map(item=>({...item.properties,kind:'commandery'})),
    ...visiblePeople(data, cursor).filter(match).map(item => ({...item, kind:'person'}))].slice(0, 30);
}

export function availableDifferences(data, cursor) {
  if (cursor.world === 'history') return data.differences;
  const ids = new Set(visibleEvents(data, cursor).map(x => x.id));
  return data.differences.filter(x => ids.has(x.romance_event));
}
