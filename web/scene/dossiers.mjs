const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const button=(label,fn,cls)=>{const node=el('button',label,cls);node.addEventListener('click',fn);return node;};
const row=(label,value)=>{const node=el('div',undefined,'fact-row');node.append(el('span',label),el('span',value));return node;};
const statusNames={narrated:'原文叙述',reported:'信中陈述',planned:'文中计划',hypothetical:'条件预期',negated:'已否定',cancelled:'已取消'};

export function renderScenePanel(panel,{pack,view,places,regions,basePlaces,selected,tab,onSelect,onFocus}){
  const open=(kind,id)=>onSelect(kind,id);
  const title=(name,subtitle)=>{panel.append(el('h1',name));if(subtitle)panel.append(el('p',subtitle,'subtle'));};
  const tag=text=>el('span',text,'tag');
  const evidence=items=>{
    const ids=[...new Set(items.flatMap(x=>x.evidence))];
    if(!ids.length)return;
    const details=el('details');details.append(el('summary','查看原文依据'));
    for(const id of ids){const quote=view.evidence.find(q=>q.id===id);if(quote)details.append(el('blockquote',quote.text,'source-quote'));}
    details.append(el('p',pack.sourceNote,'subtle'));panel.append(details);
  };
  const entry=(name,text,kind,id)=>{
    const node=el('article',undefined,'entry');node.append(button(name,()=>open(kind,id),'entry-title'));if(text)node.append(el('p',text));return node;
  };
  const listActions=actions=>{
    for(const action of actions)panel.append(entry(action.name,`${statusNames[action.status]} · ${action.summary}`,'action',action.id));
  };
  const observations=items=>{
    for(const item of items){const node=el('article',undefined,'entry');node.append(tag(statusNames[item.status]),el('p',item.summary));panel.append(node);}
  };
  function unitCard(unit){
    return entry(unit.name,`${view.people.find(p=>p.id===unit.commander)?.name||'主将未详'} · ${unit.strength?'文中称'+unit.strength.value.toLocaleString('zh-CN')+'人':'兵力未详'}`,'unit',unit.id);
  }
  if(selected)panel.append(button('返回片段局势',()=>open(null,null),'back-button'));
  if(selected?.kind==='scene-person'||selected?.kind==='scene-faction'){
    const faction=selected.kind==='scene-faction'?view.factions.find(f=>f.id===selected.id):null;
    const person=view.people.find(p=>p.id===(faction?faction.leader:selected.id))||{id:null,name:faction.name,role:'领袖未载'};
    title(person.name,person.role);panel.append(tag('本书片段档案'),tag(pack.chapterHint));
    const history=view.observations.filter(o=>o.subjects.includes(person.id));
    const latest=history.filter(o=>['narrated','reported'].includes(o.status)).at(-1);
    panel.append(row('当前情况',latest?.summary||'本片段尚无进一步实际情况记载'));
    const location=view.locations.findLast(item=>item.person===person.id);
    panel.append(row('所在位置',location?`${places.get(location.place).name}相关区域；${location.note}`:'精确位置未载'));
    const ownFaction=faction||view.factions.find(f=>person.id&&f.leader===person.id);
    const units=view.units.filter(u=>u.commander===person.id||(ownFaction&&u.faction===ownFaction.id));
    panel.append(el('h2','已读内容中的关联军队'),el('p','分列文中部队；盟军单列，计划出兵按计划标注。','subtle'));
    if(!units.length)panel.append(el('p','本片段未载所属部队与兵力。'));
    for(const unit of units)panel.append(unitCard(unit));
    if(ownFaction){
      const claims=[...new Set(view.controls.filter(c=>c.owner===ownFaction.id).map(c=>c.claim))];
      panel.append(el('h2','势力关联范围'));
      if(!claims.length)panel.append(el('p','无可定位的控制区域，地图显示为归属未明。'));
      for(const claim of claims)panel.append(entry(claim.basis==='inferred'?'概略范围 · 片段推断':'文中确认范围',claim.note,'control',claim.regionIds[0]));
    }
    panel.append(el('h2','截至当前片段的经历与关系'));
    observations(history);evidence([...history,...(location?[location]:[])]);
    panel.append(el('p','仅整理本书已读内容；生平、驻地与兵力随阅读补充。','subtle'));
    return '人物与势力';
  }
  if(selected?.kind==='scene-unit'){
    const unit=view.units.find(u=>u.id===selected.id),strength=unit.strength;
    title(unit.name,'部队档案');
    panel.append(row('所属势力',view.factions.find(f=>f.id===unit.faction).name),row('主将',view.people.find(p=>p.id===unit.commander)?.name||'未详'),
      row('兵力',strength?`文中称${strength.value.toLocaleString('zh-CN')}人`:'未详'),row('兵种','兵人类型用于地图识别，细节见原文'),row('实际驻地','行动原文未载'));
    if(strength)panel.append(el('p',strength.scope));
    if(unit.commander)panel.append(button('查看主将档案',()=>open('person',unit.commander)));
    panel.append(el('h2','当前任务'));
    const actions=pack.actions.filter(a=>a.unit===unit.id&&a.at<=view.position);listActions(actions);evidence([...actions,...(strength?[strength]:[])]);
    return '军队详情';
  }
  if(selected?.kind==='scene-action'){
    const action=pack.actions.find(a=>a.id===selected.id);
    title(action.name,action.summary);panel.append(tag(statusNames[action.status]),row('行动方',view.people.find(p=>p.id===action.actor)?.name||view.factions.find(f=>f.id===action.faction).name),
      row('方向',`${action.from?places.get(action.from).name:'起点未载'} → ${places.get(action.to).name}`),row('实际执行',action.status==='planned'?'计划中，未执行':action.status==='narrated'?'原文叙述；抵达与胜负见原文':statusNames[action.status]));
    if(action.unit)panel.append(button('查看部队与兵力',()=>open('unit',action.unit)));
    panel.append(button('定位相关战区',onFocus),el('h2','地理与计划条件'));
    panel.append(el('p',places.get(action.to).note),el('p','箭头表示方向与意图；道路、行程与占领范围不在本图范围。','subtle'));
    evidence([action]);return '行动详情';
  }
  if(selected?.kind==='scene-control'){
    const record=view.controls.find(c=>c.id===selected.id),cell=regions.features.find(f=>f.properties.id===selected.id).properties;
    title(cell.name,'沿用建安底图的概略显示区块');
    panel.append(row('关联势力',record.owner?view.factions.find(f=>f.id===record.owner).name:'归属未明'),row('依据类型',record.basis==='inferred'?'片段推断；逐郡实控未确认。':'当前未提供'));
    if(record.claim){panel.append(el('p',record.claim.note),button('查看诸侯档案',()=>open('faction',record.owner)));evidence([record.claim]);}
    for(const agreement of view.agreements.filter(a=>a.regionIds.includes(record.id))){panel.append(el('h2','战后约定 · 未实现'),el('p',agreement.note));evidence([agreement]);}
    panel.append(el('p',cell.precision,'subtle'));return '区域与归属';
  }
  if(selected?.kind==='scene-point-control'){
    const claim=view.pointControls.find(c=>c.id===selected.id);
    title(places.get(claim.place).name,'城池控制标记（郡县边界另见底图）');
    panel.append(row('控制势力',view.factions.find(f=>f.id===claim.faction).name),el('p',claim.note));evidence([claim]);return '城池控制';
  }
  if(selected?.kind==='scene-place'){
    const place=places.get(selected.id);title(place.name,place.note);
    panel.append(tag(place.mode==='relative'?'相对位置示意':'地理参照'),button('查看完整战区',onFocus),el('h2','本片段相关记录'));
    const latest=new Map();for(const item of view.locations)latest.set(item.person,item);
    for(const item of latest.values())if(item.place===place.id){const person=view.people.find(p=>p.id===item.person);panel.append(entry(person.name,'最近记载：'+item.note,'person',person.id));}
    const records=view.observations.filter(o=>o.place===place.id);observations(records);evidence(records);return '片段地理';
  }
  if(selected?.kind==='scene-base-place'){
    const place=basePlaces.find(p=>p.id===selected.id);title(place.name,place.location_note);
    const cell=regions.features.find(f=>f.properties.place_id===place.id),control=cell&&view.controls.find(c=>c.id===cell.properties.id);
    panel.append(tag('底图地名'),row('地理所属',place.region),row('片段归属',control?.owner?view.factions.find(f=>f.id===control.owner).name+'（片段推断）':'未明'),el('p',place.precision,'subtle'));
    if(control?.claim){panel.append(el('p',control.claim.note));evidence([control.claim]);}
    panel.append(el('p','未提供此城的驻军、攻守或人物位置时，保留地理参照，不套入正史剧情。','subtle'));
    return '城池与片段';
  }
  if(tab==='text'){
    title('原文依据',`${pack.book||'书名未载'} · ${pack.chapterHint}`);
    panel.append(el('p',pack.sourceNote,'notice muted'));
    for(const quote of view.evidence)panel.append(el('blockquote',quote.text,'source-quote'));
    return '原文与阅读进度';
  }
  if(tab==='people'){
    title('片段人物','角色与史实资料分开，点击查看当前片段中的经历、军队与关系。');
    for(const person of view.people)panel.append(entry(person.name,person.role,'person',person.id));return '人物档案';
  }
  if(tab==='campaigns'){
    title('军队与行动',pack.readingPositions?'地图仅显示当前章及前两章的行动；下列档案保留全部已读记录。':'本片段已出现的部队和意图；计划并不表示已发生。');
    for(const unit of view.units)panel.append(unitCard(unit));
    panel.append(el('h2','行动记录'));listActions(pack.actions.filter(a=>a.at<=view.position));return '军队与行动';
  }
  if(tab==='events'||tab==='activities'){
    title('片段经历',pack.steps[view.position]);observations(view.observations);evidence(view.observations);return '片段记录';
  }
  title(pack.title,`${pack.chapterHint} · ${pack.storyDate||'年份未载'}`);
  panel.append(el('div',pack.example?'示例':pack.sourceNote,'scene-example-note'));
  const current=view.view==='current';
  panel.append(el('h2',current?'当前局势':view.view==='plan'?'文中计策':'条件推演'));
  if(view.view==='analysis'){
    if(view.branch){panel.append(el('p',view.branch.assumption,'notice'),el('p',view.branch.analysis));evidence([view.branch]);}
    else panel.append(el('p','已读内容不足以展开本例推演。'));
  }else if(current){
    observations(view.observations.filter(o=>['narrated','reported'].includes(o.status)).slice(-3));
  }else{
    listActions(view.actions.filter(a=>a.status==='planned'));
    if(!view.actions.some(a=>a.status==='planned'))panel.append(el('p','已读进度未含结盟与夹击细节。'));
    if(view.agreements.length){panel.append(el('h2','斜线区域 · 战后约定'));for(const agreement of view.agreements)panel.append(el('p',agreement.note));evidence(view.agreements);}
  }
  panel.append(el('h2','诸侯与势力'));
  for(const faction of view.factions){
    const node=button(faction.name,()=>open('faction',faction.id),'faction-list-item');
    const swatch=el('i');swatch.style.background=faction.color;node.prepend(swatch);panel.append(node);
  }
  panel.append(button('定位本段战区',onFocus),el('p',pack.coverage,'subtle'));
  const detail=el('details');detail.append(el('summary','地图与精度说明'),el('p',pack.baseMap.note),el('p','实线示原文叙述方向，虚线示计划，斜线示战后约定；兵人为识别示意，置于相关战区，营地位置未载。'));panel.append(detail);
  return '片段局势';
}
