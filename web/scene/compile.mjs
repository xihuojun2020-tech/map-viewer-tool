// Convert quoted prose facts into references to the shared map. No model geometry.
const id=(prefix,name)=>prefix+'-'+Array.from(name).map(c=>c.codePointAt(0).toString(16)).join('-');
const colors=['#a66d24','#426f90','#866493','#4b8159','#b45b53','#357e83','#786044','#a45b83'];
function factionColor(index){
  if(index<colors.length)return colors[index];
  const h=(index*137.508)%360,s=.55,l=.42;
  const component=n=>{const k=(n+h/30)%12;return Math.round(255*(l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1))));};
  return '#'+[0,8,4].map(n=>component(n).toString(16).padStart(2,'0')).join('');
}
const normalize=name=>name.replaceAll('钜','巨').replaceAll('临甾','临淄').replace(/（.*?）/g,'').replace(/[郡国县]$/,'');
export function compileStory(input,data,regions,revision){
  const pack={version:1,id:input.id,title:input.title,example:false,baseMap:{id:'jianan-219',revision,
    note:'沿用建安郡国研究底图；作为小说地理参照，不能据此认定小说年份。'},book:input.title,storyDate:null,
    chapterHint:'章节与段落时间线',textRevision:1,sourceNote:'模型提取，程序已逐字核对引文；语义和地名仍可修正。',
    coverage:`已分析 ${input.completed} / ${input.total} 章。色块只反映已读文字中的控制记录；未提到的地方保留未知。城池控制标记不表示整郡辖境。`,
    steps:[],readingPositions:[],leadership:[],planSteps:['文中计划'],evidence:[],places:[],factions:[],people:[],units:[],strengths:[],observations:[],controls:[],pointControls:[],actions:[],agreements:[],branches:[],locations:[]};
  const facts=[...input.facts].sort((a,b)=>a.chapter-b.chapter||a.paragraph-b.paragraph);
  const personNames=new Set(facts.flatMap(f=>[f.actor,f.leader]).filter(Boolean));
  const administrativeNames=new Set([...regions.province_labels['219'].map(p=>p.name),...regions.features.flatMap(f=>[f.properties.name,f.properties.source_name,f.properties.phase_key].filter(Boolean))].map(normalize));
  const positions=new Map(),people=new Map(),factions=new Map(),places=new Map(),units=new Map();
  const position=f=>{const key=`第${f.chapter}章 · 第${f.paragraph}段`;if(!positions.has(key)){positions.set(key,pack.steps.length);pack.steps.push(key);pack.readingPositions.push({chapter:f.chapter,paragraph:f.paragraph});}return positions.get(key);};
  function faction(name,leader,at){
    if(!name)return null;
    if(leader&&administrativeNames.has(normalize(name)))name=leader;
    const personal=name.replace(/(?:势力|军|部)$/u,'');
    if(personNames.has(personal))name=personal;
    if(!factions.has(name))factions.set(name,{id:id('f',name),name,leader:null,color:factionColor(factions.size),at});
    return factions.get(name);
  }
  function person(name,group,at){
    if(!name)return null;
    if(!people.has(name))people.set(name,{id:id('p',name),name,role:'小说已读内容中的人物',faction:null,at});
    return people.get(name);
  }
  function place(name,scope='',evidence=''){
    if(!name)return null;
    // This novel also uses 北海 for the northern steppe; it is not the Shandong commandery.
    if(name==='北海'&&/草原.{0,20}北海/u.test(evidence))return null;
    const cacheKey=name+'|'+scope;
    if(places.has(cacheKey))return places.get(cacheKey);
    const city=data.places.find(p=>[p.name,...(p.aliases||[])].some(x=>x===name||normalize(x)===normalize(name)));
    const province=regions.province_labels['219'].find(p=>p.name===name);
    const region=regions.features.find(f=>[f.properties.name,f.properties.source_name,f.properties.phase_key].some(x=>x&&normalize(x)===normalize(name)));
    let item;
    if(province)item={id:id('province',province.name),name:province.name,mode:'province',baseId:province.name,note:'州级地理参照，未确认全州控制。'};
    else if(region&&scope!=='city')item={id:'region-'+region.properties.id,name:region.properties.name,mode:'region',regionIds:[region.properties.id],note:region.properties.precision};
    else if(city&&scope!=='region')item={id:'place-'+city.id,name:city.name,mode:'place',baseId:city.id,note:city.location_note};
    else if(region&&scope==='city')item={id:'proxy-city-'+region.properties.id,name:normalize(name)+'县（郡域参照）',mode:'region',regionIds:[region.properties.id],note:'县城尚未收录定位，暂以同名郡域内部中心作地域参照；不是县城或营地的实际坐标。'};
    else return null; // An unmatched name remains in the quoted record, never gets invented coordinates.
    places.set(cacheKey,item);return item;
  }
  for(const [i,f]of facts.entries()){
    const at=position(f),q={id:'q'+i,at,text:f.evidenceTexts?.join('\n')||f.quote};pack.evidence.push(q);
    const group=faction(f.faction,f.leader,at),actor=person(f.actor,group,at),leader=person(f.leader,group,at);
    if(group&&leader&&f.temporal==='current'&&!f.reviewNote&&pack.leadership.findLast(x=>x.faction===group.id)?.person!==leader.id)pack.leadership.push({faction:group.id,person:leader.id,at});
    const loc=place(f.place,f.scope,q.text),origin=place(f.from,'',q.text),current=f.temporal==='current'&&!f.reviewNote;
    const office=f.kind==='control'&&/(?:任命|举荐|出任|改.*为|以.+为|命.+为|拜.*为|领.*(?:州牧|刺史|太守)|封.*(?:侯|太尉)|接任.*帅|确认.*大帅|升[为到官]|命令.*解散|政令|下令.*(?:服丧|赋税))/u.test(f.quote+f.summary)&&!/(?:攻占|夺取|攻陷|收复|开城投降|陷落|实际.{0,8}(?:控制|在.{0,8}手))/u.test(f.quote);
    const partial=f.kind==='control'&&f.scope!=='city'&&/(?:部分|[大小一]半|半个|除.{0,30}外|不受控制|不在.{0,10}手上)/u.test(f.quote+f.summary);
    const organization=f.kind==='control'&&/(?:分裂成|分裂为)/u.test(f.quote+f.summary);
    const ref={at,evidence:[q.id]};
    const subjects=[actor?.id,group?.id].filter(Boolean);
    pack.observations.push({id:'o'+i,subjects:subjects.length?subjects:['story'],...ref,status:f.status,place:loc?.id||null,
      summary:(f.reviewNote?'【待复核】'+f.reviewNote:f.temporal==='memory'?'【回忆／背景】':office?'【任命／政务记录，不等同领土控制】':partial?'【仅涉及部分辖境，暂不填色整区】':organization?'【组织变化，不等同领土控制】':'')+f.summary+(!loc&&f.place?`（${f.place}尚未匹配到底图）`:'')});
    if(current&&actor&&loc&&['location','action','control'].includes(f.kind)&&f.status==='narrated')
      pack.locations.push({id:'loc'+i,person:actor.id,place:(f.kind==='action'&&origin?origin:loc).id,note:f.kind==='action'?'行动关联位置，不表示已到达':f.summary,...ref});
    if(current&&['narrated','negated'].includes(f.status)&&f.kind==='control'&&!office&&!partial&&!organization&&group&&loc){
      let ids=[];
      if(f.scope==='province'&&loc.mode==='province')ids=regions.features.filter(r=>r.properties.province===loc.baseId).map(r=>r.properties.id);
      if(f.scope==='region')ids=regions.features.filter(r=>normalize(r.properties.name)===normalize(f.place)).map(r=>r.properties.id);
      if(f.scope==='city'&&loc.mode==='place')ids=regions.features.filter(r=>r.properties.place_id===loc.baseId).map(r=>r.properties.id);
      const revocation=f.status==='negated'?{revoked:true}:{};
      if(ids.length)pack.controls.push({id:'c'+i,faction:group.id,regionIds:ids,basis:'explicit',note:f.summary,...ref,...revocation});
      else pack.pointControls.push({id:'pc'+i,faction:group.id,place:loc.id,note:f.summary+'；仅作城池控制标记，县界未详。',...ref,...revocation});
    }
    let unit=group&&f.unit?units.get(group.id+f.unit)||null:null;
    if(current&&f.unit&&group&&['narrated','reported'].includes(f.status)){
      const key=group.id+f.unit;
      if(!units.has(key))units.set(key,{id:id('u',key),name:f.unit,faction:group.id,commander:actor?.id||null,model:f.unitType||'infantry',at});
      unit=units.get(key);
      if(f.strength!==null)pack.strengths.push({id:'s'+i,unit:unit.id,value:f.strength,scope:f.summary,...ref});
    }
    if(current&&f.kind==='action'&&group&&loc&&['narrated','planned','negated','cancelled'].includes(f.status)){
      pack.actions.push({id:'a'+i,name:f.summary,actor:actor?.id||null,faction:group.id,unit:unit?.id||null,
        from:origin?.id||null,to:loc.id,status:f.status,originBasis:origin?'explicit':'unknown',step:0,summary:f.summary,...ref});
    }
  }
  pack.people=[...people.values()];pack.factions=[...factions.values()];pack.places=[...new Map([...places.values()].map(p=>[p.id,p])).values()];pack.units=[...units.values()];
  if(!pack.steps.length)pack.steps.push('当前片段尚无可定位的地图事件');
  const coordinates=pack.places.map(p=>p.mode==='place'?data.places.find(c=>c.id===p.baseId).coordinates:p.mode==='province'?regions.province_labels['219'].find(c=>c.name===p.baseId).coordinates:regions.features.find(c=>c.properties.id===p.regionIds[0]).properties.label);
  pack.focus=coordinates.length?[[Math.min(...coordinates.map(c=>c[0]))-1,Math.min(...coordinates.map(c=>c[1]))-.8],[Math.max(...coordinates.map(c=>c[0]))+1,Math.max(...coordinates.map(c=>c[1]))+.8]]:[[105,24],[123,42]];
  return pack;
}

export function validateStoryInput(input){
  if(!input||typeof input.title!=='string'||!Array.isArray(input.facts)||!Number.isInteger(input.completed)||!Number.isInteger(input.total))throw Error('剧情资料格式不完整');
  const enums={kind:['context','location','control','action','strength'],status:['narrated','reported','planned','hypothetical','negated','cancelled'],temporal:['current','memory'],scope:['city','region','province',''],unitType:['infantry','archer','cavalry','crossbow','danyang','xianzhen','huangjin','']};
  for(const f of input.facts){
    if(['quote','summary','actor','faction','leader','place','from','unit'].some(k=>typeof f[k]!=='string')||Object.entries(enums).some(([k,v])=>!v.includes(f[k])&&!(k==='unitType'&&!f.unit&&f[k]==='')&&!(k==='scope'&&!f.place&&f[k]===''))||!Number.isInteger(f.chapter)||f.chapter<1||!Number.isInteger(f.paragraph)||f.paragraph<1||!f.quote||!(f.strength===null||(Number.isInteger(f.strength)&&f.strength>=0)))throw Error('剧情事实存在无效字段');
  }
  return input;
}
