import {arrowShape} from '../campaigns.mjs';

const fc=features=>({type:'FeatureCollection',features});
export function createSceneRenderer(map,places,regions,onSelect){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('campaign-arrows','scene-arrows');svg.setAttribute('aria-label','片段行军与计划方向');
  map.getContainer().append(svg);
  const pattern=new Uint8Array(12*12*4);
  for(let y=0;y<12;y++)for(let x=0;x<12;x++)if((x+y)%12<3)pattern.set([37,48,58,170],(y*12+x)*4);
  map.addImage('scene-hatch',{width:12,height:12,data:pattern});
  map.addSource('scene-agreements',{type:'geojson',data:fc([]),tolerance:0});
  map.addLayer({id:'scene-agreement-fill',type:'fill',source:'scene-agreements',paint:{'fill-color':['get','color'],'fill-opacity':.55,'fill-antialias':false}},'water-mask');
  map.addLayer({id:'scene-agreement-pattern',type:'fill',source:'scene-agreements',paint:{'fill-pattern':'scene-hatch','fill-opacity':.7}},'water-mask');
  let markers=[],arrows=[];
  const element=(name,attrs)=>{
    const node=document.createElementNS(svg.namespaceURI,name);
    for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);
    return node;
  };
  function layout(){
    svg.setAttribute('viewBox',`0 0 ${map.getContainer().clientWidth} ${map.getContainer().clientHeight}`);
    for(const item of arrows){
      const target=places.get(item.action.to).coordinates;
      // A direction-only arrow has a short geographic bearing, not an invented
      // departure town. Its label explicitly says the origin is unknown.
      const bearings={north:[0,-.65],south:[0,.65],east:[-.65,0],west:[.65,0]};
      const bearing=bearings[item.action.direction];
      const origin=item.action.from?places.get(item.action.from).coordinates:[target[0]+bearing[0],target[1]+bearing[1]];
      const shape=arrowShape(map.project(origin),map.project(target));
      item.group.style.display=shape?'':'none';
      if(shape){for(const path of item.paths)path.setAttribute('d',shape.path);item.head.setAttribute('points',shape.head);}
    }
  }
  map.on('move',layout);map.on('resize',layout);
  function clear(){
    for(const marker of markers)marker.remove();markers=[];arrows=[];svg.replaceChildren();
    map.getSource('scene-agreements').setData(fc([]));
  }
  function marker(node,coordinates,offset=[0,0]){
    markers.push(new maplibregl.Marker({element:node,offset}).setLngLat(coordinates).addTo(map));
  }
  function pick(node,kind,id){node.addEventListener('click',event=>{event.stopPropagation();onSelect(kind,id);});}
  return {clear,layoutLabels(keep,zoom){
    const priority=node=>node.classList.contains('scene-point-control')?0:node.classList.contains('scene-person')?1:2;
    const labels=markers.filter(m=>!m.getElement().classList.contains('scene-unit')).reverse().sort((a,b)=>priority(a.getElement())-priority(b.getElement()));
    for(const item of labels){
      const node=item.getElement(),control=node.classList.contains('scene-point-control'),show=control||zoom>=5.2;
      node.classList.toggle('scene-control-compact',control&&zoom<6.8);
      node.style.display=show?'':'none';
      const size=node.getBoundingClientRect(),offset=item.getOffset();
      keep(node,show,item.getLngLat(),[offset.x-size.width/2,offset.y-size.height/2]);
    }
  },setView(view,{showControl=true,showArmies=true,showPlaces=true}={}){
    clear();
    const features=view.agreements.flatMap(agreement=>regions.features.filter(f=>agreement.regionIds.includes(f.properties.id)).map(f=>({
      ...f,properties:{...f.properties,agreement:agreement.id,color:view.factions.find(x=>x.id===agreement.faction).color}
    })));
    map.getSource('scene-agreements').setData(fc(showControl?features:[]));
    const placeIds=new Set(view.observations.map(o=>o.place).filter(Boolean));
    for(const claim of view.pointControls){
      const node=document.createElement('button');node.className='scene-point-control';
      const faction=view.factions.find(f=>f.id===claim.faction),place=places.get(claim.place);
      node.style.setProperty('--army-color',faction.color);node.textContent=`${place.name} · ${faction.name}`;
      node.title=`${node.textContent}；城池控制标记，非郡县辖境`;node.setAttribute('aria-label',node.title);node.dataset.sceneControl=claim.id;
      pick(node,'point-control',claim.id);if(showControl)marker(node,place.coordinates,[0,8]);
      placeIds.delete(place.id);
    }
    for(const action of view.actions)for(const id of [action.from,action.to].filter(Boolean))placeIds.add(id);
    for(const id of [...placeIds])if(places.get(id).mode==='relative')for(const reference of places.get(id).between)placeIds.add(reference);
    for(const agreement of view.agreements)placeIds.add(agreement.place);
    for(const claim of view.pointControls)placeIds.delete(claim.place);
    if(showPlaces){
      const latest=new Map();for(const item of view.recentLocations)latest.set(item.person,item);
      const grouped=new Map();for(const item of latest.values()){if(!grouped.has(item.place))grouped.set(item.place,[]);grouped.get(item.place).push(item);}
      for(const [id,locations]of grouped){
        const people=locations.map(item=>view.people.find(p=>p.id===item.person));
        const node=document.createElement('button');node.className='scene-person';node.textContent=people.slice(0,2).map(p=>p.name).join('、')+(people.length>2?`等${people.length}人`:'');
        node.title='最近记载的相关位置；点击查看原文，不保证仍然驻留';pick(node,people.length===1?'person':'place',people.length===1?people[0].id:id);marker(node,places.get(id).coordinates,[0,45]);
      }
    }
    if(showPlaces)for(const id of placeIds){
      const place=places.get(id),node=document.createElement('button');
      node.className=`scene-point${place.mode==='relative'?' relative':''}${view.branch?.focusPlaces.includes(id)?' scene-analysis-focus':''}`;
      node.dataset.scenePlace=id;
      node.textContent=place.name+(place.mode==='relative'?' · 相对位置':place.mode==='province'?'战区':'');
      node.title=place.note;node.setAttribute('aria-label',`${node.textContent}，查看片段地理`);
      pick(node,'place',id);marker(node,place.coordinates,[0,18]);
    }
    const slots=new Map();
    const latestActions=new Map();for(const action of view.actions)latestActions.set(action.unit||action.id,action);
    if(showArmies)for(const action of latestActions.values()){
      const color=view.factions.find(f=>f.id===action.faction).color;
      const planned=action.status==='planned',title=`${action.name} · ${planned?'拟议行动':'文中已叙述'} · ${action.from?'方向示意':'起点未明'}`;
      if(action.from||action.direction){
        const group=element('g',{'class':`campaign-arrow scene-arrow${planned?' uncertain':''}`,'data-scene-action':action.id,role:'button',tabindex:'0','aria-label':title});
        group.style.setProperty('--army-color',color);
        pick(group,'action',action.id);
        group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect('action',action.id);}});
        const paths=['campaign-halo','campaign-line','campaign-hit'].map(c=>element('path',{'class':c}));
        const head=element('polygon',{'class':'campaign-head'});group.append(...paths,head);svg.append(group);
        arrows.push({action,group,paths,head});
      }
      // An intention without an attested unit remains in the action dossier.
      // It must not create a fourth army for Sun Ce from no troop record.
      if(!action.unit)continue;
      const anchor=places.get(action.from||action.to),slot=slots.get(anchor.id)||0;slots.set(anchor.id,slot+1);
      const node=document.createElement('button');node.className=`campaign-unit scene-unit${planned?' uncertain':''}`;
      node.dataset.sceneAction=action.id;node.style.setProperty('--army-color',color);node.setAttribute('aria-label',title);
      const unit=view.units.find(u=>u.id===action.unit),person=view.people.find(p=>p.id===action.actor);
      const img=document.createElement('img');img.src=`models/${unit.model}.png`;img.alt='通用部队示意';node.append(img);
      const label=document.createElement('span');label.textContent=person?.name||view.factions.find(f=>f.id===action.faction).name;
      const strength=document.createElement('small');strength.textContent=unit.strength?`文中称${unit.strength.value.toLocaleString('zh-CN')}人`:'兵力未详';
      const state=document.createElement('small');state.textContent=planned?'计划 · 未执行':action.direction?'方向记载 · 起点未明':'行动记载';
      node.append(label,strength,state);pick(node,'unit',unit.id);
      const compact=map.getContainer().clientWidth<600;
      const offsets=compact?[[-38,-48],[40,-48]]:[[-55,-76],[55,-76]];
      marker(node,anchor.coordinates,action.from?[compact?43:60,-45]:offsets[slot%offsets.length]);
    }
    layout();
  }};
}
