import {readingRiverPaint} from './river-style.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,action,className)=>{const node=el('button',text,className);node.type='button';node.onclick=action;return node;};
const levelNames={capital:'都城参照',state:'州治参照',commandery:'郡治参照',county:'县城',local:'等级待核'};
let data,map,mode='regions',selectedIds=[];
const markers=[];
const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:400;
const region=id=>data.regions.features.find(f=>f.properties.id===id);
const visible=id=>$(id).checked;
const fact=(name,value)=>{const row=el('div',undefined,'fact');row.append(el('span',name),el('span',value));return row;};
function openDetail(){ $('detail-panel').classList.add('open');$('mobile-detail').setAttribute('aria-expanded','true'); }
function closeDetail(){ $('detail-panel').classList.remove('open');$('mobile-detail').setAttribute('aria-expanded','false'); }
function panel(title,kind){
  const node=$('detail-content');node.replaceChildren(el('div',kind,'eyebrow'),el('h2',title));
  return node;
}
function highlight(ids){map.setFilter('region-highlight',['in',['get','id'],['literal',ids]]);}
function insets(){
  const drawer=matchMedia('(max-width:720px)').matches&&$('detail-panel').classList.contains('open');
  return {top:115,bottom:drawer?$('detail-panel').offsetHeight+16:130,left:40,right:40};
}
function focusPoint(coordinates,zoom=6){const padding=insets();map.easeTo({center:coordinates,offset:[0,(padding.top-padding.bottom)/2],zoom:Math.max(map.getZoom(),zoom),duration:motion()});}
function fit(bounds){map.fitBounds(bounds,{padding:insets(),duration:motion()});}
function showIntro(){
  selectedIds=[];if(map?.isStyleLoaded())highlight([]);
  const p=panel('循着山川，辨认州域','独立预览');
  p.append(el('p','覆盖中原、巴蜀、江东与北方诸部；拖动查看区域，放大后可见城池与山川。'));
  p.append(fact('区域轮廓','35 片'),fact('城池参照','62 处'),fact('原著山川','25 处'));
  p.append(el('h3','两种看法'),el('p','两种视角：“州域配色”按地理分区着色；“原包分组”沿用原文件对魏、蜀、吴的归组。','muted'));
  p.append(el('p','原包未注明年代，分组待校核；本页比较地图轮廓，局势判断见阅读版。','note'));
  p.append(el('h3','从这些地方开始'));
  const links=el('div',undefined,'chips');
  for(const name of ['荆州','扬州','益州','鲜卑'])links.append(button(name,()=>showRegion(data.labels.find(l=>l.name===name).ids,true)));
  for(const id of ['hefei','xiangyang']){const city=data.cities.find(c=>c.id===id);links.append(button(city.name,()=>showCity(city,true)));}p.append(links);
  p.append(el('h3','城池符号'),el('p','紫：都城　朱红：州治　金：郡治　青：县城　灰：等级待核。城市等级沿用建安研究参照。','muted'));
  const notes=el('details');notes.append(el('summary','来源与显示说明'),el('p','区域来自用户提供的《三国地图分布》，保留原始边界与名称；部族活动区为历史活动范围，与现代国界无关。'),el('p',data.source.license),el('p',data.coastal_note),el('p','地势沿用现有地形图；河流、山地与湖泽为阅读用概略示意。'));
  const link=el('a','下载地图资源署名');link.href='assets/DATA-NOTICES.txt';link.download='地图资源署名.txt';notes.append(link);p.append(notes);
}
function showRegion(ids,focus=false){
  selectedIds=ids;highlight(ids);
  const areas=ids.map(region),names=[...new Set(areas.map(f=>f.properties.name))],groups=[...new Set(areas.map(f=>f.properties.group))];
  const p=panel(names.join('、'),'来源区域');
  p.append(fact('原包分组',groups.join('、')),fact('同名分片',`${ids.length} 片`),fact('资料年代','未注明'));
  if(areas.some(f=>f.properties.name_note))p.append(el('p',areas.find(f=>f.properties.name_note).properties.name_note,'note'));
  p.append(el('p','边线为原包闭合轮廓；区域名称与势力控制需分开理解，本层不含郡县级边界。','muted'));
  const cities=data.cities.filter(c=>c.regions.some(id=>ids.includes(id)));
  p.append(el('h3','区域内的城池参照点'));const links=el('div',undefined,'chips');
  for(const city of cities)links.append(button(city.name,()=>showCity(city,true)));
  p.append(cities.length?links:el('p','此区域暂无城池参照点。','muted'));
  p.append(button('返回地图介绍',showIntro));openDetail();
  if(focus){const bounds=areas.map(f=>f.properties.bounds);fit([[Math.min(...bounds.map(b=>b[0])),Math.min(...bounds.map(b=>b[1]))],[Math.max(...bounds.map(b=>b[2])),Math.max(...bounds.map(b=>b[3]))]]);}
}
function showCity(city,focus=false){
  selectedIds=city.regions;highlight(selectedIds);const p=panel(city.name,'城池参照');
  p.append(fact('符号等级',levelNames[city.level]),el('p',city.location_note,'muted'));
  if(city.group_note)p.append(el('p',city.group_note,'note'));
  p.append(el('h3','参照点所在区域'));const links=el('div',undefined,'chips');
  for(const id of city.regions){const item=region(id).properties;links.append(button(`${item.name} · ${item.group}`,()=>showRegion([id])));}
  p.append(city.regions.length?links:el('p','该参照点位于原包区域之外或边缘，归属未推定。','muted'));
  p.append(el('p','此处仅示地理关系；驻守信息不在本页范围。','muted'),button('返回地图介绍',showIntro));openDetail();if(focus)focusPoint(city.coordinates);
}
function showGeography(feature,focus=false){
  selectedIds=[];highlight([]);const item=feature.properties,p=panel(item.name,item.kind);
  p.append(el('p',item.summary));if(item.aliases.length)p.append(fact('其他称呼',item.aliases.join('、')));
  const details=el('details');details.append(el('summary','定位说明'),el('p',item.precision),el('p',item.geometry_note));p.append(details,el('p','原著引文与阅读进度见阅读版。','muted'),button('返回地图介绍',showIntro));openDetail();if(focus)focusPoint(item.label,6.2);
}
function updateSearch(){
  const query=$('search').value.trim(),results=$('search-results');results.replaceChildren();results.hidden=!query;if(!query)return;
  const entries=[...data.labels.map(l=>({name:l.name,aliases:[],kind:'区域',action:()=>showRegion(l.ids,true)})),
    ...data.cities.map(c=>({name:c.name,aliases:c.aliases,kind:'城池',action:()=>showCity(c,true)})),
    ...data.geography.features.map(f=>({name:f.properties.name,aliases:f.properties.aliases,kind:f.properties.kind,action:()=>showGeography(f,true)}))];
  const matches=entries.filter(e=>[e.name,...e.aliases].some(n=>n.includes(query))).slice(0,20);
  for(const item of matches){const node=button(item.name,()=>{results.hidden=true;item.action();});node.append(el('small',item.kind));results.append(node);}
  if(!matches.length)results.append(el('p','未找到这个地名。','muted'));
}
function setMode(value){
  mode=value;for(const key of ['regions','groups'])$(`mode-${key}`).setAttribute('aria-pressed',String(key===mode));
  map.setPaintProperty('region-fill','fill-color',mode==='regions'?['get','color']:['case',['==',['get','group'],'周边部落'],['get','color'],['get','group_color']]);
  $('mode-caption').textContent=mode==='regions'?'州域与周边区域':'原包分组 · 归属与年代待核';layout();
}
function addMarker(coordinates,text,className,action,properties){
  const node=button(text,event=>{event.stopPropagation();action();},className);
  const marker=new maplibregl.Marker({element:node}).setLngLat(coordinates).addTo(map);
  markers.push({marker,node,...properties});return node;
}
function layout(){
  const zoom=map.getZoom(),viewport=map.getContainer().getBoundingClientRect(),occupied=[];
  for(const selector of ['.map-tools','.map-caption','.map-key','#layer-panel','.maplibregl-ctrl','#mobile-detail'])for(const n of document.querySelectorAll(selector)){
    const b=n.getBoundingClientRect();if(b.width&&b.height)occupied.push(b);
  }
  function place(node,coordinates,offset=[0,0]){
    node.style.visibility='visible';const size=node.getBoundingClientRect(),point=map.project(coordinates);
    const text=node.querySelector('span'),width=text&&!text.hidden?Math.max(size.width,text.offsetLeft+text.offsetWidth):size.width;
    const left=point.x+viewport.left-size.width/2+offset[0],top=point.y+viewport.top-size.height/2+offset[1],box={left,top,right:left+width,bottom:top+size.height};
    if(box.left<viewport.left+5||box.right>viewport.right-5||box.top<viewport.top+5||box.bottom>viewport.bottom-5||occupied.some(b=>box.left<b.right+3&&box.right>b.left-3&&box.top<b.bottom+3&&box.bottom>b.top-3)){node.style.visibility='hidden';return false;}
    occupied.push(box);return true;
  }
  for(const item of markers){
    const {node,marker,kind}=item;
    const show=kind==='group'?mode==='groups'&&visible('show-labels'):kind==='region'?visible('show-labels'):kind==='city'?visible('show-cities')&&(zoom>=5||['capital','state','commandery'].includes(item.city.level)):visible('show-water')&&zoom>=item.geography.properties.min_zoom;
    node.hidden=!show;if(!show)continue;
    if(kind==='region')node.style.fontSize=`${Math.min(item.frontier?20:25,Math.max(15,14+(zoom-3)*4))}px`;
    if(kind==='city'){
      const label=node.querySelector('span');label.hidden=zoom<5.3&&!['capital','state'].includes(item.city.level);
      place(node,marker.getLngLat());continue;
    }
    if(kind==='group'){
      node.style.visibility='hidden';
      for(const offset of [[0,-46],[0,46],[-85,0],[85,0]])if(place(node,marker.getLngLat(),offset)){marker.setOffset(offset);break;}
      continue;
    }
    if(kind==='geography'){
      node.style.visibility='hidden';
      for(const coordinates of item.candidates)if(place(node,coordinates)){marker.setLngLat(coordinates);break;}
    }else place(node,marker.getLngLat());
  }
}
async function start(){
  const response=await fetch('user-regions.json');if(!response.ok)throw new Error(`地图资料读取失败：${response.status}`);data=await response.json();showIntro();
  map=new maplibregl.Map({container:'preview-map',center:[111,33],zoom:4,minZoom:2.6,maxZoom:12,maxBounds:[[68,12],[146,60]],attributionControl:false,
    locale:{'Map.Title':'三国区域预览','Marker.Title':'地图标记','NavigationControl.ZoomIn':'放大地图','NavigationControl.ZoomOut':'缩小地图','NavigationControl.ResetBearing':'恢复正北方向','AttributionControl.ToggleAttribution':'展开或收起来源署名','AttributionControl.MapFeedback':'地图反馈','ScaleControl.Meters':'米','ScaleControl.Kilometers':'千米','Popup.Close':'关闭详情'},
    style:{version:8,sources:{land:{type:'geojson',data:data.land},water:{type:'geojson',data:data.water},coast:{type:'geojson',data:data.coastline},'coastal-patches':{type:'geojson',data:data.coastal_patches},terrain:{type:'image',url:data.terrain.path,coordinates:data.terrain.coordinates},regions:{type:'geojson',data:data.regions},boundaries:{type:'geojson',data:data.boundaries},geography:{type:'geojson',data:data.geography}},layers:[
      {id:'ocean',type:'background',paint:{'background-color':'#c7dce3'}},
      {id:'land',type:'fill',source:'land',paint:{'fill-color':'#eee8d7'}},
      {id:'terrain',type:'raster',source:'terrain',paint:{'raster-opacity':.5,'raster-saturation':-.65}},
      {id:'coastal-land',type:'fill',source:'coastal-patches',paint:{'fill-color':'#eee8d7','fill-antialias':false}},
      {id:'region-fill',type:'fill',source:'regions',paint:{'fill-color':['get','color'],'fill-opacity':.55,'fill-antialias':false}},
      {id:'water',type:'fill',source:'water',paint:{'fill-color':'#c7dce3'}},
      {id:'coast',type:'line',source:'coast',paint:{'line-color':'#7d9da6','line-width':['interpolate',['linear'],['zoom'],3,.4,8,.85,12,1.1]}},
      {id:'region-lines',type:'line',source:'boundaries',paint:{'line-color':'#716d5b','line-width':['interpolate',['linear'],['zoom'],3,.65,7,1.05,12,1.4],'line-opacity':.7}},
      {id:'story-rivers',type:'line',source:'geography',filter:['==',['get','kind'],'河流'],layout:{'line-join':'round','line-cap':'round'},paint:readingRiverPaint},
      {id:'story-ranges',type:'line',source:'geography',filter:['in',['get','kind'],['literal',['山系','谷道']]],paint:{'line-color':'#8c7957','line-width':1,'line-dasharray':[2,3],'line-opacity':.65}},
      {id:'story-points',type:'circle',source:'geography',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':2.5,'circle-color':['case',['==',['get','kind'],'湖泽'],'#497f95','#8c7957'],'circle-stroke-color':'#faf7f0','circle-stroke-width':1}},
      {id:'region-highlight',type:'line',source:'regions',filter:['==',['get','id'],''],paint:{'line-color':'#fffdf4','line-width':2,'line-opacity':.95}},
    ]}});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');map.addControl(new maplibregl.ScaleControl({maxWidth:80,unit:'metric'}),'bottom-left');
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'区域：用户提供 · <a href="assets/DATA-NOTICES.txt" download>海陆与地势来源署名</a>'}),'bottom-right');
  map.on('error',event=>{$('map-error').hidden=false;$('map-error').textContent='地图资源未能载入，请检查本地资料文件。';console.error(event.error);});
  map.on('load',()=>{
    for(const group of data.groups.filter(g=>['曹魏','东吴','蜀汉'].includes(g.name)))addMarker(group.coordinates,group.name,'region-label group-label',()=>showRegion(data.regions.features.filter(f=>f.properties.group===group.name).map(f=>f.properties.id)),{kind:'group'});
    for(const label of data.labels){const node=addMarker(label.coordinates,label.name,`region-label${label.frontier?' frontier':''}`,()=>showRegion(label.ids),{kind:'region',frontier:label.frontier});node.dataset.region=label.name;node.setAttribute('aria-label',`${label.name}，查看来源区域`);}
    for(const feature of data.geography.features){const item=feature.properties,candidates=[item.label,...(feature.geometry.type==='LineString'?feature.geometry.coordinates:[])];
      candidates.sort((a,b)=>(a[0]-item.label[0])**2+(a[1]-item.label[1])**2-((b[0]-item.label[0])**2+(b[1]-item.label[1])**2));
      const node=addMarker(item.label,item.name,`geography-label${['河流','湖泽'].includes(item.kind)?'':' land-label'}`,()=>showGeography(feature),{kind:'geography',geography:feature,candidates});node.dataset.geography=item.id;
    }
    for(const city of [...data.cities].sort((a,b)=>['capital','state','commandery','county','local'].indexOf(a.level)-['capital','state','commandery','county','local'].indexOf(b.level))){
      const node=addMarker(city.coordinates,'',`city-marker level-${city.level}`,()=>showCity(city),{kind:'city',city});node.append(el('i'),el('span',city.name));node.dataset.city=city.id;node.setAttribute('aria-label',`${city.name}，${levelNames[city.level]}`);
    }
    markers.sort((a,b)=>['region','group','geography','city'].indexOf(a.kind)-['region','group','geography','city'].indexOf(b.kind));
    map.on('move',layout);map.on('idle',layout);
    map.on('mousemove',event=>{const hit=map.queryRenderedFeatures(event.point,{layers:['region-fill']})[0];highlight(hit?[hit.properties.id]:selectedIds);map.getCanvas().style.cursor=hit?'pointer':'';});
    map.getCanvas().addEventListener('mouseleave',()=>highlight(selectedIds));
    map.on('click',event=>{
      if(event.originalEvent.target.closest('.maplibregl-marker'))return;
      const {x,y}=event.point,geo=map.queryRenderedFeatures([[x-3,y-3],[x+3,y+3]],{layers:['story-rivers','story-ranges','story-points']})[0];
      if(geo){showGeography(data.geography.features.find(f=>f.properties.id===geo.properties.id));return;}
      const hit=map.queryRenderedFeatures(event.point,{layers:['region-fill']})[0];if(hit)showRegion([hit.properties.id]);
    });
    $('fit-central').onclick=()=>fit([[96,19],[125,43]]);$('fit-all').onclick=()=>fit([[71,16],[142,57]]);
    $('mode-regions').onclick=()=>setMode('regions');$('mode-groups').onclick=()=>setMode('groups');
    $('layers-button').onclick=()=>{$('layer-panel').hidden=!$('layer-panel').hidden;$('layers-button').setAttribute('aria-expanded',String(!$('layer-panel').hidden));layout();};
    for(const [input,layers]of [['show-terrain',['terrain']],['show-water',['story-rivers','story-ranges','story-points']]])$(input).onchange=()=>{for(const layer of layers)map.setLayoutProperty(layer,'visibility',visible(input)?'visible':'none');layout();};
    $('show-fill').onchange=()=>map.setPaintProperty('region-fill','fill-opacity',visible('show-fill')? .55 : .001);
    for(const id of ['show-labels','show-cities'])$(id).onchange=layout;
    $('search').oninput=updateSearch;$('search').onkeydown=event=>{if(event.key==='Escape')$('search-results').hidden=true;};
    document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))$('search-results').hidden=true;});
    $('mobile-detail').onclick=()=>{openDetail();layout();};$('close-detail').onclick=closeDetail;
    $('loading').hidden=true;map.fitBounds([[96,19],[125,43]],{padding:{top:105,bottom:135,left:35,right:35},duration:0});
    window.regionalPreview={map,data,get mode(){return mode;}};layout();
  });
}
start().catch(error=>{$('loading').textContent='区域资料读取失败，请通过本地地图服务打开，并检查资料文件。';console.error(error);});
