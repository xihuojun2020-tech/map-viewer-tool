import {activityStatus} from './chronology.mjs';

export function activeCampaigns(records,data,cursor){
  return records.filter(r=>['recorded','uncertain'].includes(activityStatus(r,data,cursor)));
}

// Curvature is a screen-space reading aid, not a reconstructed road or river.
export function arrowShape(from,to){
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  // At nationwide zoom nearby endpoints coincide; the clickable unit remains.
  if(length<24)return null;
  const bend=Math.min(length*.18,65),nx=-dy/length,ny=dx/length;
  const control={x:(from.x+to.x)/2+nx*bend,y:(from.y+to.y)/2+ny*bend};
  const ux=to.x-control.x,uy=to.y-control.y,n=Math.hypot(ux,uy);
  const tip={x:to.x-ux/n*9,y:to.y-uy/n*9};
  const head=Math.min(16,length*.24),half=head*.48;
  const base={x:tip.x-ux/n*head,y:tip.y-uy/n*head};
  return {path:`M ${from.x} ${from.y} Q ${control.x} ${control.y} ${base.x} ${base.y}`,
    head:`${tip.x},${tip.y} ${base.x-uy/n*half},${base.y+ux/n*half} ${base.x+uy/n*half},${base.y-ux/n*half}`};
}

export function createCampaignLayer(map,onSelect){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('campaign-arrows');svg.setAttribute('aria-label','文献进攻方向');
  map.getContainer().append(svg);
  let entries=[];
  function element(name,attributes){
    const node=document.createElementNS(svg.namespaceURI,name);
    for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  }
  function layout(){
    svg.setAttribute('viewBox',`0 0 ${map.getContainer().clientWidth} ${map.getContainer().clientHeight}`);
    for(const entry of entries){
      if(!entry.record.origin)continue;
      const shape=arrowShape(map.project(entry.record.origin.coordinates),map.project(entry.record.target.coordinates));
      entry.group.style.display=shape?'':'none';
      if(shape){for(const path of entry.paths)path.setAttribute('d',shape.path);entry.head.setAttribute('points',shape.head);}
    }
  }
  map.on('move',layout);map.on('resize',layout);
  return {
    setRecords(records,data,cursor){
      for(const entry of entries){entry.marker.remove();entry.targetMarker.remove();}
      entries=[];svg.replaceChildren();
      const slots=new Map();
      for(const record of records){
        const color=data.factions.find(f=>f.id===record.attacker.faction).color;
        const uncertain=activityStatus(record,data,cursor)==='uncertain';
        const title=`${record.title}，${record.origin?'进攻方向示意':'战场位置'}${uncertain?'，具体日期未定':''}，点击查看战役`;
        const pick=event=>{event.stopPropagation();onSelect(record);};
        const group=element('g',{'class':`campaign-arrow${uncertain?' uncertain':''}`,'data-campaign':record.id,role:'button',tabindex:'0','aria-label':title});
        group.style.setProperty('--army-color',color);
        group.addEventListener('click',pick);
        group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick(event);}});
        const paths=['campaign-halo','campaign-line','campaign-hit'].map(cls=>element('path',{'class':cls}));
        const head=element('polygon',{'class':'campaign-head'});
        if(record.origin){group.append(...paths,head);svg.append(group);}
        const node=document.createElement('button');node.className=`campaign-unit${uncertain?' uncertain':''}`;
        node.dataset.campaign=record.id;node.style.setProperty('--army-color',color);node.setAttribute('aria-label',title);node.title=title;
        const img=document.createElement('img');img.src=`models/${record.attacker.model}.png`;img.alt='';
        const label=document.createElement('span');label.textContent=record.attacker.commanders[0];
        const type=document.createElement('small');type.textContent=record.origin?'进攻部队':'战场记载';
        node.append(img,label,type);node.addEventListener('click',pick);
        const anchor=record.origin||record.target,slot=slots.get(anchor.id)||0;slots.set(anchor.id,slot+1);
        const marker=new maplibregl.Marker({element:node,offset:[slot*88,-54]}).setLngLat(anchor.coordinates).addTo(map);
        const target=document.createElement('button');target.className='campaign-target';target.textContent=record.target.name;
        target.dataset.campaign=record.id;target.setAttribute('aria-label',`${record.target.name}，${record.title}的交战目标，查看战役`);
        target.style.setProperty('--army-color',color);target.addEventListener('click',pick);
        const targetMarker=new maplibregl.Marker({element:target,anchor:'left',offset:[-5,0]}).setLngLat(record.target.coordinates).addTo(map);
        entries.push({record,marker,targetMarker,group,paths,head});
      }
      layout();
    }
  };
}
