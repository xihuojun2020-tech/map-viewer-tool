import { stateAt, visiblePeople, search, availableDifferences, territoryAt, territoryGroups } from './state.mjs';
import {calendarNames,yearMonths,timeWindow,windowLabel,monthName,julianLabel,eventWindow,activityStatus,timelineStarts} from './chronology.mjs';
import {createModelLayer} from './model-layer.mjs';
import {visibleSamples,placeFactionLabel} from './faction-layout.mjs';
import {readingRiverPaint} from './river-style.mjs';
import {activeCampaigns,createCampaignLayer} from './campaigns.mjs';
import {buildSceneView,resolveScenePlaces,sceneFactionGroups} from './scene/state.mjs';
import {createSceneRenderer} from './scene/renderer.mjs';
import {renderScenePanel} from './scene/dossiers.mjs';
import {readStories,readingPosition} from './scene/store.mjs';
import {sha256} from './scene/layer.mjs';
import {resolveMapVersion,assertPackCompatible} from './scene/map-version.mjs';

const $ = id => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, action, className) => {
  const node = el('button', text, className);
  node.addEventListener('click', action);
  return node;
};
const fc = features => ({type:'FeatureCollection', features});
const localDocumentCache = new Map();
const cursor = {world:'history', position:194,calendar:'han',granularity:'month',day:1,monthStart:null};
let activeTab = 'administration';
let selected = null;
let data, map, snapshot;
let boundaryReference;
let administration;
let strategicRegions, territory, researchWater, factionCentres;
const placeMarkers = new Map();
const mountainMarkers = [];
const geographyMarkers=[];
const commanderyLabels=[];
const provinceLabels=[];
const factionLabels=new Map();
let factionLeaders;
const activityMarkers=[];
let modelLayer;
let campaignData,campaignLayer;
let hoveredCounty=null;
let mapReady = false;
let sceneMode=false,scenePack,sceneView,scenePlaces,sceneRenderer;
const sceneCursor={position:5,view:'plan',step:2,branch:'leak'};

function faction(id) { return (sceneMode?scenePack.factions:data.factions).find(x=>x.id===id); }
function source(id) { return data.sources.find(x => x.id === id); }
function districtName(name) {
  const label=boundaryReference.labels.find(x=>x.kind==='郡国名称'&&x.name===name);if(label)return label.full_name;
  const record=data.national.commanderies.find(x=>[name,`${name}郡`,`${name}国`].includes(x.properties.name));
  return record?record.properties.name:name;
}
function placeName(place) {
  if(administration.commandery_centers[place.id])return administration.commandery_centers[place.id].name;
  if(place.kind==='县治')return `${place.name}县`;
  if(place.id==='haixi')return '海西县';
  if(place.kind==='区域')return place.name;
  return ['城池','都城','郡治'].includes(place.kind)?`${place.name}城`:place.name;
}
function centerRecord(place) {
  return boundaryReference.seat_records.find(x=>x.place_id===place.id);
}
function centerLevel(place) {
  return centerRecord(place)?.level||(place.kind==='县治'?'county':'local');
}
function stamp(event) {
  return event.world === 'history' ? eventWindow(event).label : `第 ${Math.floor(event.position / 1000)} 回 · 第 ${event.citation.paragraph} 段`;
}
function currentChapter() { return Math.floor(cursor.position / 1000); }
function closeMapOverlays() {
  $('layer-panel').hidden=true;$('layers-button').setAttribute('aria-expanded','false');
  $('timeline-options').hidden=true;$('timeline-toggle').setAttribute('aria-expanded','false');
  $('legend-disclosure').open=false;
  document.body.classList.remove('search-open');$('search-toggle').setAttribute('aria-expanded','false');
  $('search-results').hidden=true;
  requestAnimationFrame(refreshMarkers);
}
function openPanel() {
  closeMapOverlays();
  $('sidebar').classList.add('open');
  $('mobile-panel-button').setAttribute('aria-expanded', 'true');
}
function closePanel() {
  $('sidebar').classList.remove('open');
  $('mobile-panel-button').setAttribute('aria-expanded', 'false');
  requestAnimationFrame(refreshMarkers);
}
function panelTitle(text) { $('sidebar-heading').textContent = text; }
function setPanel() {
  const panel = $('panel-content');
  panel.replaceChildren();
  for (const tab of document.querySelectorAll('[data-tab]')) tab.classList.toggle('selected', tab.dataset.tab === activeTab && !selected);
  return panel;
}
function notice(text, muted = false) { return el('div', text, `notice${muted ? ' muted' : ''}`); }
function row(label, value) {
  const node = el('div', undefined, 'fact-row');
  node.append(el('span', label), el('span', value));
  return node;
}
function detailNotes(panel, items = []) {
  const notes = items.filter(Boolean);
  if (!notes.length) return;
  const details = el('details');
  details.append(el('summary', '资料与定位说明'));
  for (const item of notes) details.append(item instanceof Node ? item : el('p', item, 'subtle'));
  panel.append(details);
}
function sourceCard(citation) {
  const wrapper = el('div');
  wrapper.append(el('blockquote', citation.display_quote, 'source-quote'));
  const location=typeof citation.paragraph==='number'?`第 ${citation.paragraph} 段`:citation.paragraph;
  const link = el('a', `${citation.title} · ${location} · 修订 ${citation.revision}`, 'source-link');
  link.href = citation.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  wrapper.append(link);
  return wrapper;
}

function showCampaign(record){
  selected={kind:'campaign',id:record.id};activeTab='campaigns';renderPanel();openPanel();
  $('panel-content').scrollTop=0;
}

function jumpCampaign(record){
  if(record.world==='romance')setNovel(record.chapter);
  else{
    const original=record.time.original;
    cursor.world='history';cursor.calendar=original.calendar||'han';cursor.position=original.year;
    const month=yearMonths(data,cursor.position,cursor.calendar).find(m=>m.start<=record.time.start&&m.end>=record.time.start);
    cursor.monthStart=month.start;cursor.day=record.time.start-month.start+1;
    cursor.granularity=record.time.precision==='year'?'year':'month';
  }
  document.querySelector('[data-layer="campaigns"]').checked=true;
  selected={kind:'campaign',id:record.id};activeTab='campaigns';render();
  $('panel-content').scrollTop=0;
  const target=record.target.coordinates;
  const bounds=new maplibregl.LngLatBounds(target,target);
  if(record.origin)bounds.extend(record.origin.coordinates);
  const height=map.getContainer().clientHeight,width=map.getContainer().clientWidth;
  // Leave space for the unit above the origin, the heading and the bottom legend.
  map.fitBounds(bounds,{padding:{top:Math.min(230,height*.42),bottom:Math.min(190,height*.36),left:Math.min(70,width*.18),right:Math.min(120,width*.3)},maxZoom:record.origin?12:8,duration:450});
  if(matchMedia('(max-width:1100px), (pointer:coarse)').matches)closePanel();
}

function campaignDate(record){return record.world==='history'?record.time.label:`第 ${record.chapter} 回 · 本回读毕`;}

function renderCampaigns(panel){
  panelTitle('战役');panel.append(el('h1','战役与进攻方向'),notice(campaignData.note,true));
  const current=activeCampaigns(campaignData.campaigns,data,cursor);
  panel.append(el('p','点击条目查看主将、兵力与出处。','subtle'),el('h2',`当前时段 · ${current.length} 条`));
  function entry(record){
    const node=el('article',undefined,'entry campaign-entry');node.dataset.campaign=record.id;
    const path=record.origin?`${record.origin.name} → ${record.target.name}`:`${record.target.name} · 起点待考`;
    node.append(el('small',campaignDate(record)),button(record.title,()=>jumpCampaign(record),'entry-title'),el('p',path),el('small',`${record.attacker.commanders.join('、')} · ${record.origin?'方向已定位':'仅标战场'}`));
    return node;
  }
  if(!current.length)panel.append(notice('当前时段暂无收录战役。可在下方已收录目录中定位。',true));
  for(const record of current)panel.append(entry(record));
  panel.append(el('h2',cursor.world==='history'?'已收录历史战役':'已读回目中的战役'));
  const catalogue=campaignData.campaigns.filter(r=>r.world===cursor.world&&(cursor.world==='history'||r.position<=cursor.position));
  for(const record of catalogue.filter(r=>!current.includes(r)))panel.append(entry(record));
  if(cursor.world==='romance')panel.append(el('p','显示范围：已读回目；后续回目暂不显示名称与兵力。','subtle'));
}

function renderCampaign(panel,record){
  panelTitle('战役详情');
  panel.append(button('返回战役目录',()=>{selected=null;activeTab='campaigns';renderPanel();},'back-button'),el('h1',record.title),el('span',record.world==='history'?'史实':'三国演义','tag'),el('span',campaignDate(record),'tag'));
  const uncertain=activityStatus(record,data,cursor)==='uncertain';
  if(uncertain)panel.append(notice('时间范围与当前时段相交，发生时机未定。虚线箭头：日期未定的进攻方向。'));
  panel.append(el('p',record.summary));
  panel.append(row('进攻方向',record.origin?`${record.origin.name} → ${record.target.name}`:`起点待考 → ${record.target.name}`));
  for(const [side,title]of [['attacker','进攻方'],['defender','交战对方']]){
    const army=record[side],card=el('section',undefined,'campaign-side');card.style.setProperty('--army-color',faction(army.faction).color);
    const img=el('img');img.src=`models/${army.model}.png`;img.alt=`${army.unit_label}模型图`;
    card.append(img,el('h2',`${title} · ${army.name}`),row('将领',army.commanders.join('、')),row('兵力口径',army.strength));panel.append(card);
  }
  panel.append(button('定位此战',()=>jumpCampaign(record)));
  const notes=[record.origin?(record.route_note||'弧线连接史料所记起点与目标，便于阅读。'):'尚未定位出发点，仅标注战场位置。','兵人：部队标识；兵力与驻军以文字记载为准。'];
  for(const point of [record.origin,record.target].filter(Boolean)){
    notes.push(row(point.name,point.precision),point.location_note);
    if(point.location_source){const link=el('a',point.location_source.title,'source-link');link.href=point.location_source.url;link.target='_blank';link.rel='noopener noreferrer';notes.push(link,point.location_source.note);}
  }
  panel.append(el('h2','战事与兵力来源'));
  for(const citation of record.citations)panel.append(sourceCard(citation));
  detailNotes(panel,notes);
}
function back(panel) {
  panel.append(button('返回当前形势', () => { selected = null; activeTab = 'overview'; renderPanel(); }, 'back-button'));
}

function eventEntry(event) {
  const entry = el('article', undefined, 'entry');
  entry.append(el('small', `${stamp(event)} · ${event.kind}`),
    button(event.title, () => { selected = {kind:'event', id:event.id}; renderPanel(); openPanel(); }, 'entry-title'),
    el('p', event.summary));
  if(snapshot.uncertainEvents.includes(event))entry.append(el('span','时间范围与当前时段相交，是否发生未定','tag'));
  return entry;
}

function showPlace(place) {
  selected = {kind:'place', id:place.id};
  renderPanel();
  openPanel();
  updateMap();
  highlightCounty(`county-${place.id}`);
  if (mapReady) map.easeTo({center:place.coordinates, zoom:Math.max(map.getZoom(), 7), duration:400, essential:false});
}

function showPerson(person) {
  selected = {kind:'person', id:person.id};
  renderPanel();
  openPanel();
}

function currentPlaceControl(id){
  if(sceneMode){
    const local=strategicRegions.features.find(f=>f.properties.place_id===id);
    return local?sceneView.controls.find(c=>c.id===local.properties.id):{owner:null};
  }
  const cell=strategicRegions.features.find(f=>f.properties.place_id===id);
  if(cell)return territory.records.find(r=>r.id===cell.properties.id);
  const event=snapshot.controlRecords[id];
  const current=event&&(cursor.world==='romance'?event.position>=territory.phase.position:event.time.end>=territory.phase.time.start);
  return {owner:current?event.controls[id]:null,event:current?event:null};
}

function renderPlace(panel, place) {
  panelTitle('地点资料');
  back(panel);
  const seat=centerRecord(place);
  panel.append(el('h1', placeName(place)), el('span', seat?seat.role:place.kind, 'tag'), el('span', place.region, 'tag'));
  panel.append(el('p', place.location_note));
  panel.append(row('其他名称', place.aliases.join('、')), row('参考坐标', place.coordinates.map(x => x.toFixed(2)).join(', ')));
  const record = snapshot.controlRecords[place.id];
  const controller=record&&faction(record.controls[place.id]);
  const current=currentPlaceControl(place.id);
  panel.append(row('当前归属',current.owner?faction(current.owner).name:'待考'));
  if(current.event?.time)panel.append(row('归属依据',current.event.time.label));
  panel.append(row('最近收录归属',controller?controller.name:'暂无单独记录'));
  if(seat)panel.append(row('行政级别',seat.role));
  panel.append(row('最近事件', record ? `${faction(record.controls[place.id]).name} · ${stamp(record)}` : '暂无收录'));
  const county=data.national.counties.find(x=>x.properties.place_id===place.id);
  if(county)panel.append(row('县级隶属',county.properties.name),row('郡级隶属',county.properties.commandery));
  if(seat)panel.append(sourceCard(seat.citation));
  panel.append(el('h2', '当前进度中的相关事件'));
  const events = snapshot.events.filter(x => x.places.includes(place.id));
  if (!events.length) panel.append(el('p', '当前进度暂无收录事件。', 'subtle'));
  for (const event of events.toReversed()) panel.append(eventEntry(event));
  for(const cite of place.location_citations||[])panel.append(sourceCard(cite));
  const notes=[];
  if(place.id==='haixi')notes.push('海西县位置待考。');
  notes.push(place.precision);
  notes.push(county?'县域边界待考；高亮仅表示地点位置。':'县名与县界待考；此处显示区域参考点。');
  if (record) notes.push('此处为最近一条明确记录；中间时段归属未定。');
  if(seat)notes.push(seat.note);
  notes.push('坐标为今地或区域锚点，古城位置尚未逐点测绘。');
  detailNotes(panel, notes);
}

function renderPerson(panel, person) {
  panelTitle('人物与行踪');
  back(panel);
  panel.append(el('h1', person.name), el('span', person.group, 'tag'),
    notice('人物条目来自原文提及；同名人物尚未全部区分。', true));
  if (person.aliases.length) panel.append(row('检索别名', person.aliases.join('、')));
  panel.append(el('h2','时间与行踪'));
  const records=data.activities.filter(a=>a.person_id===person.id&&activityStatus(a,data,cursor)!=='hidden');
  const current=records.filter(a=>['recorded','uncertain'].includes(activityStatus(a,data,cursor)));
  if(!current.length)panel.append(notice('当前时段无收录的明确位置。',true));
  for(const record of records)panel.append(activityEntry(record));
  if(person.facts.length) {
    panel.append(el('h2','收录基础资料'));
    for(const fact of person.facts) {
      panel.append(row('字',fact.courtesy),row('原文籍贯',fact.origin));
      if(fact.note)panel.append(el('p',fact.note,'subtle'));
      panel.append(sourceCard(fact.citation));
    }
  }
  const events = snapshot.events.filter(x => x.person_ids.includes(person.id));
  panel.append(el('h2', '收录事件'));
  if (!events.length) panel.append(el('p', '此人在当前进度暂无收录事件。', 'subtle'));
  for (const event of events.toReversed()) panel.append(eventEntry(event));
  panel.append(el('h2', '当前进度内的原文提及'));
  for (const mention of person.mentions.slice(0, 8)) {
    const doc = source(mention.source);
    panel.append(sourceCard({display_quote:mention.display_quote,title:doc.title,paragraph:mention.paragraph,revision:doc.revision,url:doc.url}));
  }
  if (person.mentions.length > 8) panel.append(el('p', `共 ${person.mentions.length} 条提及，显示前 8 条。`, 'subtle'));
}

function renderEvent(panel, event) {
  panelTitle('事件与依据');
  back(panel);
  panel.append(el('small', stamp(event)), el('h1', event.title), el('p', event.summary));
  if (event.interpretation) panel.append(notice(event.interpretation));
  if (event.uncertainty) panel.append(notice(event.uncertainty));
  panel.append(el('p', event.precision, 'subtle'));
  const related = el('div', undefined, 'inline-buttons');
  for (const id of event.places) {
    const place = data.places.find(x => x.id === id);
    related.append(button(place.name, () => showPlace(place)));
  }
  panel.append(related, el('h2', '可回查原文'));
  for(const cite of event.citations||[event.citation])panel.append(sourceCard(cite));
}

function activeActivities(){return sceneMode?[]:data.activities.filter(a=>['recorded','uncertain'].includes(activityStatus(a,data,cursor)));}
function activityEntry(record){
  const status=activityStatus(record,data,cursor),labels={recorded:cursor.world==='romance'?'本回有记载':'当前时段有记载',uncertain:'时间范围相交，发生时机未定',earlier:'此前记载，位置未定',undated:'年代未详'};
  const article=el('article',undefined,'entry');
  article.append(el('small',labels[status]),button(record.name,()=>{selected={kind:'activity',id:record.id};renderPanel();openPanel();},'entry-title'),el('p',record.action));
  return article;
}
function renderActivity(panel,record){
  panelTitle('活动');back(panel);panel.append(el('h1',record.name),activityEntry(record));
  panel.append(row('时间',record.world==='history'?(record.time?.label||'年月未详'):`第${Math.floor(record.position/1000)}回 · 第${record.position%1000}段`));
  const place=data.places.find(p=>p.id===record.place_id);
  panel.append(row('地点',place?place.name:'地点未定位'));
  if(place)panel.append(button('在地图查看参照点',()=>map.easeTo({center:place.coordinates,zoom:7.6,pitch:40,duration:400})));
  if(record.faction_id)panel.append(row('所记势力',faction(record.faction_id).name));
  const notes=[record.spatial_precision,record.note,record.uncertainty];
  if(record.model&&record.model!=='army'){const img=el('img');img.src=`models/${record.model}.png`;img.alt=`${record.name}模型图`;img.className='model-card';panel.append(img);notes.push('模型为类别示意；兵种与装备以文字记载为准。');}
  for(const cite of record.citations)panel.append(sourceCard(cite));
  detailNotes(panel,notes);
}
function renderActivities(panel){
  const novel=cursor.world==='romance';
  panelTitle('人物与军事活动');panel.append(el('h1',novel?'本回活动记载':'当前时段记载'),notice(novel?'标记表示本回出现的地点；回末是否仍在原地未定。':'标记表示记载涉及当前时段；驻留时间未定。虚线：时间范围较宽。',true));
  const records=activeActivities();
  if(!records.length)panel.append(el('p',novel?'本回暂无收录的人物或军队活动。势力范围按已读阶段显示。':'当前时段暂无收录活动。'));
  for(const record of records)panel.append(activityEntry(record));
  const undated=data.activities.filter(a=>a.entity_type==='army'&&activityStatus(a,data,cursor)==='undated');
  if(undated.length){panel.append(el('h2','时间未详的部队'));for(const record of undated)panel.append(activityEntry(record));}
}
function renderHydrology(panel){
  panelTitle('历史水文资料');back(panel);panel.append(el('h1','古河道与文献'));
  const notes=['东汉黄河下游水道存在争议。研究河道仅作对照，默认关闭；长坂汉水、长江示意图仅在208年显示。'];
  for(const feature of researchWater.features){
    const river=feature.properties;
    panel.append(el('h2',river.name),row('适用年代',river.period));
    const input=document.querySelector('[data-layer="research-water"]');
    panel.append(button(river.from_year?`查看${river.from_year}年${river.name}`:'在地图查看',()=>{
      input.checked=true;map.setLayoutProperty('research-water','visibility','visible');
      if(river.from_year){cursor.world='history';cursor.calendar='han';cursor.position=river.from_year;cursor.monthStart=yearMonths(data,cursor.position)[0].start;cursor.day=1;}
      const points=feature.geometry.coordinates;
      map.fitBounds([[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]],{padding:65,duration:400});
      render();
    }));
    notes.push(`${river.name}：${river.warning}`,river.scope,river.georeference);
    const link=el('a','原图与争议说明','source-link');link.href=river.source_url;link.target='_blank';link.rel='noopener noreferrer';notes.push(link);
  }
  for(const record of data.hydrology){
    panel.append(el('h2',record.name),row('材料年代',record.period),el('p',record.summary));
    notes.push(record.status);
    for(const cite of record.citations)panel.append(sourceCard(cite));
  }
  detailNotes(panel,notes);
}
function showStoryGeography(id,focus=false){
  selected={kind:'story-geography',id};renderPanel();openPanel();
  if(focus){
    const item=data.story_geography.features.find(f=>f.properties.id===id).properties;
    map.easeTo({center:item.label,zoom:Math.max(map.getZoom(),6.2),duration:400});
  }
}
function renderStoryGeography(panel,id){
  panelTitle('原著山川');back(panel);
  if(!id){
    panel.append(el('h1','原著中的山川关隘'),el('p','查看水道、山地与关隘，理解距离、方向与行军环境。'));
    for(const kind of ['河流','湖泽','山系','山地','峡谷','关隘','谷道']){
      panel.append(el('h2',kind));const group=el('div',undefined,'inline-buttons');
      for(const f of data.story_geography.features.filter(f=>f.properties.kind===kind))group.append(button(f.properties.name,()=>showStoryGeography(f.properties.id,true)));
      panel.append(group);
    }
    return;
  }
  const item=data.story_geography.features.find(f=>f.properties.id===id).properties;
  panel.append(el('h1',item.name),el('span',item.kind,'tag'),el('p',item.summary));
  if(item.aliases.length)panel.append(row('其他称呼',item.aliases.join('、')));
  const related=el('div',undefined,'inline-buttons');
  for(const placeId of item.places){const place=data.places.find(p=>p.id===placeId);related.append(button(place.name,()=>showPlace(place)));}
  panel.append(el('h2','附近与相关地点'),related,el('h2','原著中的记载'));
  const quotes=!sceneMode&&cursor.world==='romance'?item.citations.filter(c=>c.position<=cursor.position):[];
  for(const cite of quotes)panel.append(sourceCard(cite));
  if(!quotes.length)panel.append(el('p',sceneMode?'此处为底图地理参考。':cursor.world==='romance'?'尚未读到相关段落；后文情节不显示。':'原著引文在“三国演义”模式随阅读进度展开。','subtle'));
  const detail=el('details');detail.append(el('summary','资料与定位说明'),el('p',item.precision),el('p',item.geometry_note));panel.append(detail);
}
function refreshActivities(){
  for(const marker of activityMarkers)marker.remove();activityMarkers.length=0;
  if(!document.querySelector('[data-layer="activities"]').checked)return;
  const groups=new Map();
  const campaignPlaces=new Map();
  if(document.querySelector('[data-layer="campaigns"]').checked)for(const record of activeCampaigns(campaignData.campaigns,data,cursor)){
    const id=(record.origin||record.target).id;campaignPlaces.set(id,(campaignPlaces.get(id)||0)+1);
  }
  for(const record of activeActivities()){if(!record.place_id)continue;if(!groups.has(record.place_id))groups.set(record.place_id,[]);groups.get(record.place_id).push(record);}
  for(const [id,records]of groups){
    const place=data.places.find(p=>p.id===id),uncertain=records.every(a=>activityStatus(a,data,cursor)==='uncertain');
    const node=button(`${records.some(r=>r.entity_type==='army')?'战事':'人物'} ${records.length}条`,()=>{selected={kind:'activity-place',id};renderPanel();openPanel();},`activity-marker${uncertain?' uncertain':''}`);
    node.setAttribute('aria-label',`${place.name}：${records.length}条活动${uncertain?'，具体时间未定':''}`);
    const army=records.find(r=>r.entity_type==='army'&&r.model!=='army');
    if(army){const img=el('img');img.src=`models/${army.model}.png`;img.alt='';node.prepend(img);node.style.borderColor=faction(army.faction_id).color;}
    const offset=campaignPlaces.has(id)?(campaignPlaces.get(id)-1)*88+100:0;
    activityMarkers.push(new maplibregl.Marker({element:node,offset:[offset,-29]}).setLngLat(place.coordinates).addTo(map));
  }
}
function updateModels(){
  if(!modelLayer)return;
  const items=[];
  if(document.querySelector('[data-layer="models"]').checked){
    if(document.querySelector('[data-layer="places"]').checked)for(const place of data.places){
      const level=centerLevel(place);if(level==='local')continue;
      items.push({coordinates:place.coordinates,model:level==='capital'?'city-capital':['state','commandery'].includes(level)?'city-commandery':'city-county'});
    }
    if(document.querySelector('[data-layer="activities"]').checked)for(const record of activeActivities()){
      if(record.entity_type!=='army'||record.model==='army'||!record.place_id)continue;
      items.push({coordinates:data.places.find(p=>p.id===record.place_id).coordinates,model:record.model,displayOffset:55});
    }
  }
  modelLayer.setItems(items);
}

function renderRegion(panel,id) {
  panelTitle('势力');
  back(panel);
  const owner=faction(id);
  panel.append(el('h1',owner.name),el('span',cursor.world==='history'?'史实':'已读小说','tag'));
  const person=visiblePeople(data,cursor).find(p=>p.name===owner.name||p.aliases.includes(owner.name));
  const current=activeCampaigns(campaignData.campaigns,data,cursor).filter(r=>r.attacker.faction===id||r.defender.faction===id);
  const activities=person?activeActivities().filter(a=>a.person_id===person.id):[];
  panel.append(row('当前阶段',territory.phase.title),row('位置与任务',activities.length?activities.map(a=>`${a.name}：${a.action}`).join('；'):'当前时段无明确驻地记载'),
    row('总兵力','未详（仅列战役记载的兵数）'));
  panel.append(el('h2','当前有关联的军队与战事'));
  if(!current.length)panel.append(el('p','当前时段暂无收录的部队或战役记录。','subtle'));
  for(const record of current){
    const army=record.attacker.faction===id?record.attacker:record.defender;
    const card=el('article',undefined,'entry');card.append(button(record.title,()=>showCampaign(record),'entry-title'),
      row('主将',army.commanders.join('、')),el('p',army.strength));panel.append(card);
  }
  panel.append(el('h2','截至当前的经历'));
  const events=person?snapshot.events.filter(e=>e.person_ids.includes(person.id)):[];
  if(!events.length)panel.append(el('p','收录资料不足以整理本时段的完整经历。','subtle'));
  for(const event of events.slice(-5))panel.append(eventEntry(event));
  if(person)panel.append(button('查看更多人物记载',()=>showPerson(person)));
  const ids=new Set(territory.records.filter(r=>r.owner===id).map(r=>r.id));
  const units=strategicRegions.features.filter(f=>ids.has(f.properties.id));
  panel.append(el('h2',`控制地区 · ${units.length} 处`));
  const group=el('div',undefined,'inline-buttons');
  for(const item of units)group.append(button(item.properties.name,()=>{selected={kind:'territory',id:item.properties.id};renderPanel();}));
  panel.append(group);
  const details=el('details');details.append(el('summary','阶段、定位与来源'),el('p',territory.phase.note),el('p','色块为阶段势力范围（概略）。','subtle'));
  if(territory.phase.citation)details.append(sourceCard(territory.phase.citation));
  for(const key of territory.phase.source_ids){const doc=source(key);const link=el('a',doc.title,'source-link');link.href=doc.url;link.target='_blank';link.rel='noopener noreferrer';details.append(el('p'),link);}
  panel.append(details);
}

function renderTerritory(panel,id) {
  const cell=strategicRegions.features.find(f=>f.properties.id===id).properties;
  const record=territory.records.find(r=>r.id===id);
  panelTitle('势力区块');back(panel);
  panel.append(el('h1',cell.name),row('当前归属',record.owner?faction(record.owner).name:'待考'),
    row('归属依据',record.kind),row('所属分区',cell.province),
    row('底图区域名',cell.source_name),row('阶段参照',cell.phase_key),
    el('h2','当前时间与依据'),el('p',record.phase.title));
  if(record.event?.time)panel.append(row('归属变更时间',record.event.time.label));
  let reviewIssue='';
  if(cell.province==='幽州'&&['乐浪','带方'].includes(cell.source_name)){
    const review=administration.provinces.find(p=>p.name==='幽州').review;
    reviewIssue=review.map_issue;
    panel.append(button('查看幽州范围核对',()=>{selected={kind:'province',name:'幽州'};renderPanel();}));
  }
  if(record.event)panel.append(sourceCard(record.event.citation));
  else if(record.phase.citation)panel.append(sourceCard(record.phase.citation));
  for(const id of record.phase.source_ids){const doc=source(id),link=el('a',doc.title,'source-link');link.href=doc.url;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);}
  const notes=[cell.precision,record.phase.note];
  if(reviewIssue)notes.push(reviewIssue);
  if(record.phase.dating)notes.push(record.phase.dating);
  if(record.event?.uncertainty)notes.push(record.event.uncertainty);
  notes.push(strategicRegions.note,'色块为显示区块；地点记录对应具体地点。');
  const link=el('a','建安底图来源与署名');link.href='reference.html';link.target='_blank';link.rel='noopener noreferrer';notes.push(link);
  detailNotes(panel,notes);
}

function renderCommandery(panel,id) {
  const district=data.national.commanderies.find(x=>x.properties.id===id).properties;
  panelTitle('郡国名录');
  panel.append(button(`返回${district.province}`,()=>{selected={kind:'province',name:district.province};renderPanel();},'back-button'));
  panel.append(el('h1',district.name),el('span',district.province,'tag'));
  panel.append(el('h2','名称依据'),sourceCard({...district.citation,paragraph:'郡国名录'}));
  panel.append(el('h2','文献县级条目'));
  const counties=administration.counties.filter(x=>x.parent===district.name);
  const group=el('div',undefined,'inline-buttons');
  for(const county of counties)group.append(button(county.name,()=>{selected={kind:'county-record',parent:county.parent,name:county.name};renderPanel();}));
  if(counties.length)panel.append(group);
  else panel.append(el('p','本郡下级名录尚未逐项核对。','subtle'));
  detailNotes(panel,[data.national.commandery_epoch,'本条目记录行政名称与文献隶属；辖界待考。','本级只收录已逐项核对的文献条目；辖界待考。']);
}

function renderCountyRecord(panel,parent,name) {
  const record=administration.counties.find(x=>x.parent===parent&&x.name===name);
  const district=data.national.commanderies.find(x=>x.properties.name===parent);
  panelTitle('县级行政条目');
  panel.append(button(`返回${parent}`,()=>{selected={kind:'commandery',id:district.properties.id};renderPanel();},'back-button'));
  panel.append(el('h1',name),el('span','县级条目','tag'),row('所录隶属',parent),notice(record.note,true),sourceCard(record.citation));
  if(record.place_id){const place=data.places.find(x=>x.id===record.place_id);panel.append(button('在地图查看参照点',()=>showPlace(place)));}
  else panel.append(el('p','古治所位置未定；县界待考。','subtle'));
}

function renderReferenceCommandery(panel,name) {
  panelTitle('郡级行政区参考');back(panel);
  const fullName=districtName(name);
  const label=boundaryReference.labels.find(x=>x.kind==='郡国名称'&&x.name===name);
  panel.append(el('h1',fullName),el('span','郡级行政区','tag'),
    notice('紫色虚线为郡级概略边界，与势力填色共用几何。郡名对应区域，圆点表示治所或城池。',true),
    row('底图年代','题名219年，部分建置跨期'),row('当前进度',cursor.world==='history'?`${cursor.position}年`:`小说第${currentChapter()}回`));
  if(label){panel.append(row('标注依据',label.placement));for(const review of label.epoch_reviews){panel.append(notice(review.note,true));for(const cite of review.citations)panel.append(sourceCard({...cite,paragraph:'建置沿革'}));}}
  if(name==='东海'){
    panel.append(el('h2','东海郡与属县'),el('p','东海为郡名；郯县、襄贲县为其属县。'),
      el('p','《后汉书·郡国志》东海郡下列有郯、襄贲，为所录时期的隶属依据；219年辖界另待考。','subtle'));
    const group=el('div',undefined,'inline-buttons');
    for(const id of ['tan','xiaben']){const place=data.places.find(x=>x.id===id);group.append(button(placeName(place),()=>showPlace(place)));}
    panel.append(group);
  }
  if(name==='泰山')panel.append(el('p','泰山郡为行政区；地图上“▲ 泰山”为山体标注。'));
  const roster=data.national.commanderies.find(x=>x.properties.name===fullName);
  if(roster)panel.append(el('h2','东汉郡国名录出处'),sourceCard({...roster.properties.citation,paragraph:'郡国名录'}));
  const link=el('a','建安底图、年代与原图出处','source-link');link.href='reference.html';link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
}

function renderAdministration(panel) {
  panelTitle('行政地理底图');
  panel.append(el('h1','建安郡国研究'),el('p','底图为建安郡国研究（219年）。先选州，再进入郡国与县级地点。'),
    notice('题名219年，部分州界与建置跨期。',true));
  if(cursor.world==='history')panel.append(button('查看建置沿革',()=>{selected={kind:'administrative-changes'};renderPanel();}));
  panel.append(el('h2','行政中心'));
  const group=el('div',undefined,'province-grid');
  for(const province of administration.provinces){
    const entry=button(province.name,()=>{selected={kind:'province',name:province.name};renderPanel();openPanel();map.easeTo({center:strategicRegions.province_labels['219'].find(p=>p.name===province.name).coordinates,zoom:5.8,duration:400});});
    entry.append(el('small',`${province.commanderies.length}项郡国名录`));group.append(entry);
  }
  panel.append(group,el('p','名录与引文按文献所录时期收录；建置变化见沿革。','subtle'));
  const link=el('a','建安底图出处与署名','source-link');link.href='reference.html';link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
}

function renderAdministrativeChanges(panel){
  panelTitle('行政建置沿革');back(panel);panel.append(el('h1','沿革与参考年代'),notice('底图为建安郡国研究（219年）。以下记录说明建置变化；无同期辖界依据的条目仅作文字记录。'));
  const changes=data.administrative_changes.filter(r=>r.time.start<=snapshot.window.end);
  for(const record of changes){panel.append(el('h2',record.title),el('small',record.time.label),el('p',record.summary),el('p',record.geometry_status,'subtle'));if(record.time.end>snapshot.window.end)panel.append(notice('时间范围与当前时段相交，是否发生未定。',true));for(const cite of record.citations)panel.append(sourceCard(cite));}
  if(!changes.length)panel.append(el('p','当前时段暂无收录建置变化。'));
}

function renderProvince(panel,name) {
  const province=administration.provinces.find(p=>p.name===name);
  panelTitle('州—郡国—县');
  panel.append(button('返回十三州',()=>{selected=null;activeTab='administration';renderPanel();},'back-button'),el('h1',name),el('span','州级行政区','tag'));
  panel.append(el('h2','文献所录州治'));
  if(province.center){
    panel.append(row('治所参考',province.center.name),el('p',province.center.note,'subtle'),sourceCard(province.center.citation));
    if(province.center.place_id){const place=data.places.find(p=>p.id===province.center.place_id);panel.append(button('定位治所参考点',()=>showPlace(place)));}
    else panel.append(el('p','古治所位置未定。','subtle'));
  }else panel.append(notice('本州治所尚未核对。',true));
  panel.append(el('h2','郡国名录'));
  const group=el('div',undefined,'inline-buttons');
  for(const id of province.commanderies){const unit=data.national.commanderies.find(p=>p.properties.id===id);group.append(button(unit.properties.name,()=>{selected={kind:'commandery',id};renderPanel();}));}
  panel.append(group);
  const notes=[province.note,'州郡名录录自《后汉书·郡国志》；郡国边界见底图。'];
  if(province.review){
    const review=province.review;
    panel.append(el('h2',review.title));
    const details=el('details');details.append(el('summary','年代区别与核对依据'),el('p',review.period));
    for(const item of review.sources){const link=el('a',item.title,'source-link');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';details.append(el('p',item.quote),link);}
    panel.append(details);
    notes.push(review.scope,review.control,review.map_issue);
  }
  detailNotes(panel,notes);
}

function renderFrontier(panel,id) {
  const item=data.national.frontier.find(x=>x.properties.id===id).properties;
  panelTitle('关外与周边');back(panel);
  panel.append(el('h1',item.name),el('span',item.kind,'tag'),notice(item.precision,true));
  panel.append(el('p','活动区可与州郡范围重叠。部族名称为族群统称。'));
  if(item.citation&&cursor.world==='history')panel.append(sourceCard(item.citation));
  else if(item.citation)panel.append(el('p',`地理背景：${item.citation.title}`,'subtle'));
  else panel.append(el('p','该区资料尚不足以细分各部，现作周边地理背景。','subtle'));
}

function renderFactions(panel) {
  panelTitle('势力分期背景');back(panel);panel.append(el('h1','势力与关外诸部'),notice('此处为阶段分期背景；地点归属与活动分图层显示。',true));
  const items=[...(snapshot.frame?snapshot.frame.features:[]),...data.national.frontier];
  for(const item of items){const props=item.properties;const entry=button(props.name,()=>{selected={kind:data.national.frontier.includes(item)?'frontier':'region',id:props.id};renderPanel();},'faction-list-item');
    const swatch=el('i');swatch.style.background=props.color;entry.prepend(swatch);panel.append(entry);}
}

function renderOverview(panel) {
  panelTitle('天下形势');
  panel.append(el('h1', cursor.world === 'history' ? `${cursor.position} 年的天下` : `第 ${currentChapter()} 回的形势`));
  const last = snapshot.lastEvent;
  if (snapshot.outsideReviewedRange) panel.append(notice('本回暂无收录的形势变化；灰色表示归属待考。'));
  if(snapshot.frame){panel.append(row('当前分期',snapshot.frame.title),row('中原势力',`${new Set(territory.records.filter(r=>r.owner).map(r=>r.owner)).size} 个`),row('关外与周边',`${data.national.frontier.length} 个参考区`));
    if(cursor.world==='romance')panel.append(el('p',snapshot.frame.note,'subtle'),sourceCard(snapshot.frame.citation));
    panel.append(button('全部势力与颜色',()=>{selected={kind:'factions'};renderPanel();}));}
  panel.append(row('最近收录事件', last ? stamp(last) : '此前暂无收录'));
  if (last) {
    panel.append(el('h2', '事件详情'), eventEntry(last));
  }
  panel.append(el('h2', '各地城池'));
  const group = el('div', undefined, 'inline-buttons');
  for (const id of ['luoyang','ye','xiaopei','xiangyang','chengdu','jianye']) {
    const place = data.places.find(x => x.id === id);
    group.append(button(place.name, () => showPlace(place)));
  }
  panel.append(group, el('p', '点击城池或色块查看归属与依据。', 'subtle'));
  const differences = availableDifferences(data, cursor);
  if (differences.length) {
    panel.append(el('h2', '史实与演义对照'));
    for (const item of differences) panel.append(button(item.title, () => {selected = {kind:'difference',id:item.id}; renderPanel();}, 'back-button'));
  }
  panel.append(button('资料与来源', () => {selected={kind:'coverage'};renderPanel();}));
}

function renderPeople(panel) {
  panelTitle('人物');
  const people = visiblePeople(data, cursor);
  panel.append(el('h1', '人物提及'), el('p', `共 ${people.length} 人；可用顶部搜索查姓名、字或别名。`, 'subtle'), notice('收录范围：文臣、武将及配角。', true));
  const group = el('div', undefined, 'people-grid');
  for (const person of people) {
    const node = button(person.name, () => showPerson(person));
    node.append(el('small', `${person.mentions.length} 条提及`));
    group.append(node);
  }
  panel.append(group);
}

async function renderText(panel) {
  panelTitle('原文');
  if (cursor.world !== 'romance') {
    panel.append(el('h1', '从事件查看史料'), el('p', '《三国志》按纪传编排；可从事件、人物提及进入对应卷与段落，正文与裴注保持原序。'), el('h2','最近史料'));
    for (const event of snapshot.events.slice(-3).toReversed()) panel.append(eventEntry(event));
    return;
  }
  const chapter = currentChapter();
  const paragraph = cursor.position % 1000;
  const key = `romance-${String(chapter).padStart(3,'0')}`;
  panel.append(el('h1', `第 ${chapter} 回`), el('p', '本回已读毕；段号用于核对引文。', 'subtle'));
  const waiting = el('p', '正在读取原文…', 'subtle');
  panel.append(waiting);
  try {
    if (!localDocumentCache.has(key)) {
      const response = await fetch(`/api/corpus/${key}`);
      if (!response.ok) throw new Error(`原文读取失败，响应编号：${response.status}`);
      localDocumentCache.set(key, await response.json());
    }
  } catch (error) {
    waiting.textContent = '原文载入失败。请确认本地资料服务已启动后重试。';
    console.error('2001: Corpus read failed', error);
    return;
  }
  if (activeTab !== 'text' || selected || currentChapter() !== chapter || cursor.position % 1000 !== paragraph) return;
  waiting.remove();
  const doc = localDocumentCache.get(key);
  const visible = doc.paragraphs.filter(x => x.id <= paragraph && x.display_text);
  for (const item of visible) {
    const article = el('article', undefined, 'paragraph');
    article.append(el('small',`第 ${item.id} 段`,'subtle'), el('p', item.display_text));
    panel.append(article);
  }
  panel.append(el('p', '拖动底部回目条，可查看其他已读回目。', 'subtle text-footer'));
}

function renderCoverage(panel) {
  panelTitle('资料与来源');
  back(panel);
  panel.append(el('h1', '收录概况'), notice(data.coverage.note));
  panel.append(row('原著山川与关隘',`${data.coverage.story_geography} 项地理参照`));
  const precisionNames={day:'日级',month:'月级',season:'季级',year:'年级'};
  for(const [title,counts]of [['事件时间精度',data.coverage.time_precision],['归属变更时间精度',data.coverage.control_precision]])
    panel.append(row(title,Object.entries(counts).map(([key,n])=>`${precisionNames[key]}${n}条`).join(' · ')));
  panel.append(notice('无记载的月份沿用上一有据状态与阶段背景；新增战事仅确认城池点位，未扩大郡县填色。',true));
  panel.append(row('人物与军事活动',`${data.coverage.activities}条，涉及${data.coverage.people_with_activities}名人物`),row('历史水文资料',`${data.coverage.hydrology_records}组，河道几何待考`),row('行政沿革',`${data.coverage.administrative_changes}条`));
  const models=el('a','查看城池与兵人模型');models.href='models.html';models.target='_blank';models.rel='noopener';panel.append(models);
  for (const [count, label] of [[administration.provinces.length,'州级行政名录'],[data.national.commanderies.length,'郡国名录条目'],[administration.counties.length,'已核县级条目'],[data.national.frontier.length,'关外势力与部族条目'],[65,'《三国志》卷已保存'],[120,'《三国演义》回已保存'],[data.coverage.places,'地点与区域'],[data.coverage.people_candidates,'原文提及人物'],[data.coverage.events,'收录事件']]) {
    const line = el('div', String(count), 'coverage-number');
    line.append(el('span', label));
    panel.append(line);
  }
  panel.append(el('h2','收录范围'),
    row('已收录', `中文行政层级、十三州参考线、${administration.counties.length}项有引文的县级条目；另有${boundaryReference.features.filter(f=>!f.properties.junction_repair).length}条建安源图边线配准研究与${boundaryReference.labels.length}处中文名称对读。`),
    row('待补', '逐界历史考证、三国郡县分置沿革、完整县域、古水系、完整人物生平和逐段事件。'));
  panel.append(el('p','配准检验中位偏差约0.44千米（详见底图页）。','subtle'));
  panel.append(el('h2','底图与许可'), el('p','地图引擎与字典许可随程序分发；自然地理为公版资料；现代地势来源：美国地质调查局、美国国家海洋和大气管理局。完整署名与许可见随附档案。', 'subtle'));
  const links = el('div', undefined, 'inline-buttons');
  for (const [text,url] of [['下载地图引擎许可','assets/MAPLIBRE-LICENSE.txt'],['下载简繁字典许可','assets/OPENCC-LICENSE.txt'],['下载数据署名与许可','assets/DATA-NOTICES.txt'],['下载历法项目许可','assets/CALENDAR-LICENSE.txt'],['下载三维引擎许可','assets/THREE-LICENSE.txt']]) {
    const link = el('a',text);link.href=url;link.download='';links.append(link);
  }
  panel.append(links, el('h2','引用文本'));
  const ids = [...new Set(data.events.map(x => x.source))];
  for (const id of ids) {
    const doc = source(id);
    const entry = el('div',undefined,'entry');
    const a = el('a',doc.title);a.href=doc.url;a.target='_blank';a.rel='noopener noreferrer';
    entry.append(a,el('p',`修订 ${doc.revision} · 共 ${doc.paragraph_count} 段（相关段落已收录）`,'subtle'));
    panel.append(entry);
  }
}

function renderPanel() {
  const panel = setPanel();
  const sceneSelection=selected&&({region:'faction',territory:'control',place:'base-place'}[selected.kind]);
  if(sceneMode&&(!selected&&activeTab!=='administration'||selected?.kind.startsWith('scene-')||sceneSelection)){
    const target=sceneSelection?{kind:`scene-${sceneSelection}`,id:selected.id}:selected;
    panelTitle(renderScenePanel(panel,{pack:scenePack,view:sceneView,places:scenePlaces,regions:strategicRegions,
      basePlaces:data.places,selected:target,tab:activeTab,onSelect:selectScene,onFocus:focusScene}));return;
  }
  if (selected) {
    if(selected.kind==='campaign')return renderCampaign(panel,campaignData.campaigns.find(r=>r.id===selected.id));
    if (selected.kind === 'place') return renderPlace(panel, data.places.find(x => x.id === selected.id));
    if (selected.kind === 'person') {
      const person = visiblePeople(data,cursor).find(x => x.id === selected.id);
      return renderPerson(panel, person);
    }
    else if (selected.kind === 'event') {
      const event = snapshot.events.find(x => x.id === selected.id);
      return renderEvent(panel, event);
    }
    else if (selected.kind === 'region') return renderRegion(panel,selected.id);
    else if (selected.kind === 'commandery') return renderCommandery(panel,selected.id);
    else if (selected.kind === 'reference-commandery') return renderReferenceCommandery(panel,selected.name);
    else if (selected.kind === 'province')return renderProvince(panel,selected.name);
    else if (selected.kind === 'territory')return renderTerritory(panel,selected.id);
    else if(selected.kind==='county-record')return renderCountyRecord(panel,selected.parent,selected.name);
    else if (selected.kind === 'frontier') return renderFrontier(panel,selected.id);
    else if (selected.kind === 'factions') return renderFactions(panel);
    else if (selected.kind === 'coverage') return renderCoverage(panel);
    else if(selected.kind==='hydrology')return renderHydrology(panel);
    else if(selected.kind==='administrative-changes')return renderAdministrativeChanges(panel);
    else if(selected.kind==='activity')return renderActivity(panel,data.activities.find(a=>a.id===selected.id));
    else if(selected.kind==='activity-place'){
      panelTitle('此地活动');back(panel);panel.append(el('h1',data.places.find(p=>p.id===selected.id).name));
      for(const record of activeActivities().filter(a=>a.place_id===selected.id))panel.append(activityEntry(record));return;
    }
    else if (selected.kind === 'story-geography')return renderStoryGeography(panel,selected.id);
    else if (selected.kind === 'river') {
      const river = data.rivers.find(x => x.id === selected.id);
      panelTitle('水文依据');back(panel);panel.append(el('h1',river.name),notice(river.note));
      const event = snapshot.events.find(x => x.id === river.evidence_event);
      if (event) panel.append(sourceCard(event.citation));
      else panel.append(el('p','当前进度尚未涉及相关战事。','subtle'));
      return;
    }
    else if (selected.kind === 'difference') {
      const difference = availableDifferences(data,cursor).find(x => x.id === selected.id);
      panelTitle('史实与演义对照');back(panel);panel.append(el('h1',difference.title),el('p',difference.text));
      for (const id of [difference.history_event,difference.romance_event]) {
        const event = data.events.find(x=>x.id===id);
        panel.append(el('h2',event.world==='history'?'史实记载':'小说记载'),sourceCard(event.citation));
      }
      return;
    }
  }
  if(activeTab==='administration')renderAdministration(panel);
  else if(activeTab==='campaigns')renderCampaigns(panel);
  else if(activeTab==='activities')renderActivities(panel);
  else if (activeTab === 'events') {
    panelTitle('已收录事件');
    panel.append(el('h1','事件记录'),el('p','只显示当前进度之前的已收录事件。','subtle'));
    if (!snapshot.events.length) panel.append(notice('当前时段暂无收录事件。'));
    for (const event of snapshot.events.toReversed()) panel.append(eventEntry(event));
  } else if (activeTab === 'people') renderPeople(panel);
  else if (activeTab === 'text') renderText(panel);
  else renderOverview(panel);
}

function updateSearch() {
  const query = $('search').value;
  const results = $('search-results');
  results.replaceChildren();
  if (!query.trim()) {results.hidden=true;return;}
  results.hidden=false;
  if(sceneMode){
    const items=[...sceneView.people.map(p=>({...p,kind:'person'})),...[...scenePlaces.values()].map(p=>({...p,kind:'place'})),
      ...data.places.filter(p=>!scenePlaces.has(p.id)).map(p=>({...p,kind:'base-place'})),
      ...data.story_geography.features.map(f=>({...f.properties,kind:'story-geography'}))].filter(p=>[p.name,...(p.aliases||[])].some(name=>name.includes(query.trim())));
    if(!items.length)results.append(el('p','未找到该名称。'));
    for(const item of items.slice(0,25))results.append(button(item.name,()=>{results.hidden=true;$('search').value='';if(item.kind==='story-geography')showStoryGeography(item.id,true);else selectScene(item.kind,item.id);}));
    return;
  }
  const found = search(data,cursor,query);
  if (!found.length) results.append(el('p','未找到该名称；可尝试别名。'));
  for (const item of found) {
    const node = button(item.name,()=>{
      results.hidden=true;
      $('search').value='';
      if (item.kind==='place'){
        const place=data.places.find(x=>x.id===item.id);
        if(place.kind==='区域'&&place.id!=='haixi'){
          selected={kind:'reference-commandery',name:place.name};renderPanel();openPanel();
          const label=boundaryReference.labels.find(x=>x.kind==='郡国名称'&&x.name===place.name);
          map.easeTo({center:label?label.coordinates:place.coordinates,zoom:6,duration:400});
        }else showPlace(place);
      }
      else if(item.kind==='commandery'){selected={kind:'commandery',id:item.id};renderPanel();openPanel();const district=data.national.commanderies.find(x=>x.properties.id===item.id);map.easeTo({center:district.properties.label,zoom:6,duration:400});}
      else if(item.kind==='story-geography')showStoryGeography(item.id,true);
      else showPerson(item);
    });
    const original=item.kind==='place'?data.places.find(x=>x.id===item.id):null;
    node.append(el('small',item.kind==='place'?`${item.region} · ${original.kind==='区域'&&original.id!=='haixi'?'行政区域':original.kind}`:item.kind==='commandery'?`${item.province} · 郡国参考`:item.kind==='story-geography'?`${item.geography_kind} · 原著山川`:'人物提及'));
    results.append(node);
  }
}

function updateMap() {
  if (!mapReady) return;
  const showControl=document.querySelector('[data-layer="regions"]').checked;
  map.setFilter('research-water',!sceneMode&&cursor.world==='history'?['any',['!', ['has','from_year']],['all',['<=',['get','from_year'],cursor.position],['>=',['get','to_year'],cursor.position]]]:['!', ['has','from_year']]);
  const features=strategicRegions.features.map((cell,i)=>({...cell,properties:{...cell.properties,
    color:territory.records[i].owner?faction(territory.records[i].owner).color:'#b8b3a5',known:!!territory.records[i].owner,
    inferred:sceneMode&&territory.records[i].basis==='inferred'}}));
  map.getSource('political-cells').setData(fc(features));
  map.setLayoutProperty('political-fill','visibility',showControl?'visible':'none');
  $('political-button').textContent=`势力填色：${showControl?'开':'关'}`;
  $('political-button').setAttribute('aria-pressed',String(showControl));
  for (const place of data.places) {
    const marker=placeMarkers.get(place.id);
    const {owner}=currentPlaceControl(place.id);
    const known=showControl&&owner&&faction(owner);
    marker.getElement().style.setProperty('--control-color',known?known.color:'transparent');
    const level=centerLevel(place);
    for(const item of ['capital','state','commandery','county','local'])marker.getElement().classList.toggle(`center-${item}`,level===item);
    marker.getElement().classList.toggle('active',selected?.kind==='place'&&selected.id===place.id);
  }
  const legend=$('legend');legend.replaceChildren();
  legend.append(el('strong',showControl?'势力范围':'行政中心'));
  legend.append(el('span',showControl?(sceneMode?'色块为文意推断的势力范围；留白：归属未定。':`${cursor.world==='romance'?'本回读毕 · ':territory.phase.year+'年背景 · '}色块为阶段势力范围（概略）；点击查看依据；留白：暂无归属记录。`):'紫：都城 · 红：州治 · 金：郡治 · 蓝：县城 · 灰：级别待考','legend-note'));
  if(document.querySelector('[data-layer="activities"]').checked&&activeActivities().length)legend.append(el('span','兵人／人物：活动标记；占领范围见色块。','legend-note'));
  if(document.querySelector('[data-layer="research-water"]').checked)legend.append(el('span',sceneMode?'蓝色虚线：研究河道（有争议）':cursor.world==='history'&&cursor.position===208?'208年专题：长坂汉水、长江（研究示意）':'蓝色虚线：研究河道（有争议）','legend-note'));
  const recordedOwners=new Set(territory.records.map(r=>r.owner));
  const colors=el('div',undefined,'legend-colors');
  for(const item of showControl?(sceneMode?sceneView.factions:data.factions).filter(x=>recordedOwners.has(x.id)):[]) {
    const node=el('span'),swatch=el('i');swatch.style.background=item.color;node.append(swatch,el('span',item.name));colors.append(node);
  }
  if(showControl)legend.append(colors);
  if(showControl)legend.append(button('查看势力资料',()=>{selected=sceneMode?null:{kind:'factions'};activeTab='overview';renderPanel();openPanel();}));
  else legend.append(button('查看州郡名录',()=>{selected=null;activeTab='administration';renderPanel();openPanel();}));
  if(selected?.kind==='place')highlightCounty(`county-${selected.id}`);
  else highlightCounty(null);
  refreshActivities();updateModels();
  const campaignsEnabled=document.querySelector('[data-layer="campaigns"]').checked;
  const campaigns=sceneMode?[]:activeCampaigns(campaignData.campaigns,data,cursor);
  campaignLayer.setRecords(campaignsEnabled?campaigns:[],data,cursor);
  if(campaignsEnabled&&campaigns.length)legend.append(el('span',`战役 ${campaigns.length} 条；虚线：日期未定。`,'legend-note'));
  $('campaign-button').textContent=sceneMode?`军队 · ${sceneView.units.length}`:`战役 · ${campaigns.length}`;
  if(sceneMode){
    sceneRenderer.setView(sceneView,{showControl,showArmies:campaignsEnabled,showPlaces:document.querySelector('[data-layer="places"]').checked});
    legend.append(el('span','实线：已发生行军　虚线：计划　斜线：战后约定','legend-note'));
  }
  refreshMarkers();
}

function highlightCounty(id,point) {
  if(!mapReady)return;
  const county=data.national.counties.find(x=>x.properties.id===id);
  const hasBoundary=county&&county.properties.boundary_status!=='待考';
  hoveredCounty=hasBoundary?county.properties.id:null;
  for(const [placeId,marker]of placeMarkers)marker.getElement().classList.toggle('hovered',id===`county-${placeId}`);
  const filter=['==',['get','id'],hoveredCounty||''];
  map.setFilter('county-hover',filter);map.setFilter('county-shadow',filter);
  const tip=$('county-tooltip');
  tip.hidden=!county||!point;
  if(county&&point){tip.textContent=`${county.properties.name} · ${county.properties.commandery}（县界待考）`;
    tip.style.left=`${Math.min(point.x+15,map.getCanvas().clientWidth-220)}px`;tip.style.top=`${point.y+12}px`;}
  if(window.atlas)window.atlas.hoveredCounty=hoveredCounty;
}

function refreshMarkers() {
  if (!mapReady) return;
  const enabled=document.querySelector('[data-layer="places"]').checked;
  const zoom=map.getZoom();
  const occupied=[];
  const viewport=map.getContainer().getBoundingClientRect();
  for(const selector of ['.activity-marker','.campaign-unit','.campaign-target','.map-heading','.view-actions','#legend-disclosure','#legend','#layer-panel','.map-disclaimer','.maplibregl-ctrl','#mobile-panel-button','#sidebar']){
    for(const node of document.querySelectorAll(selector)){
      if(node.id!=='legend-disclosure'&&node.closest('#legend-disclosure:not([open])'))continue;
      const b=node.getBoundingClientRect();
      if(b.width&&b.height&&b.left<viewport.right&&b.right>viewport.left&&b.top<viewport.bottom&&b.bottom>viewport.top)occupied.push(b);
    }
  }
  function keep(node,show,coordinates,offset) {
    node.style.display=show?'':'none';
    if(!show)return;
    const size=node.getBoundingClientRect(),point=map.project(coordinates);
    const left=viewport.left+point.x+(offset?offset[0]:-size.width/2),top=viewport.top+point.y+(offset?offset[1]:-size.height/2);
    const box={left,top,right:left+size.width,bottom:top+size.height};
    if(box.left<viewport.left||box.right>viewport.right||box.top<viewport.top||box.bottom>viewport.bottom){node.style.display='none';return;}
    if(occupied.some(r=>box.left<r.right+4&&box.right>r.left-4&&box.top<r.bottom+4&&box.bottom>r.top-4))node.style.display='none';
    else occupied.push(box);
  }
  // Reserve province centres before placing faction names. A higher text level
  // must not erase the geographic labels beneath it.
  for(const marker of provinceLabels){
    const node=marker.getElement(), name=node.dataset.province;
    const label=strategicRegions.province_labels['219'].find(p=>p.name===name).coordinates;
    node.style.letterSpacing=zoom<4.5?'1px':'3px';
    const show=document.querySelector('[data-layer="provinces"]').checked;
    for(let size=Math.floor(Math.max(12,Math.min(viewport.width<600?20:26,12+(zoom-3)*8)));size>=12;size--){
      node.style.fontSize=`${size}px`;keep(node,show,label);
      if(!show||node.style.display!=='none')break;
    }
  }
  const showGeography=document.querySelector('[data-layer="story-geography"]').checked;
  for(const major of [true,false]){
    if(!major)layoutFactionLabels(viewport,occupied,zoom);
    for(const {marker,item,candidates} of geographyMarkers){
      if((item.min_zoom<=4)!==major)continue;
      const node=marker.getElement();node.style.display='none';
      if(!showGeography||zoom<item.min_zoom)continue;
      for(const coordinates of candidates){
        const point=map.project(coordinates);
        if(point.x<30||point.x>viewport.width-30||point.y<20||point.y>viewport.height-20)continue;
        keep(node,true,coordinates);
        if(node.style.display!=='none'){marker.setLngLat(coordinates);break;}
      }
    }
  }
  if(sceneMode)sceneRenderer.layoutLabels(keep,zoom);
  for(const marker of commanderyLabels)keep(marker.getElement(),zoom>=5.2&&document.querySelector('[data-layer="commanderies"]').checked,marker.getLngLat());
  const ordered=[...data.places].sort((a,b)=>({capital:0,state:1,commandery:2,county:3,local:4}[centerLevel(a)]-({capital:0,state:1,commandery:2,county:3,local:4}[centerLevel(b)])));
  for(const place of ordered){
    const node=placeMarkers.get(place.id).getElement(), level=centerLevel(place);
    const point=map.project(place.coordinates),x=point.x+viewport.left,y=point.y+viewport.top;
    const underProvince=zoom<5.6&&occupied.some(r=>x>r.left-10&&x<r.right+10&&y>r.top-10&&y<r.bottom+10);
    const show=enabled&&!underProvince&&(place.kind!=='区域'||place.id==='haixi')&&(zoom>=5.2||['capital','state','commandery'].includes(level));
    node.style.display=show?'':'none';
    const radius=node.offsetWidth/2;
    keep(node.querySelector('.place-label'),show&&(zoom>=6.8||(['capital','state'].includes(level)&&zoom>=5.2)||selected?.id===place.id),place.coordinates,[15-radius,-7-radius]);
    const mini=node.querySelector('.city-mini');mini.hidden=!(show&&zoom>=6&&zoom<7.4&&level!=='local'&&document.querySelector('[data-layer="models"]').checked);
    if(!mini.hidden)mini.src=`models/${level==='capital'?'city-capital':['state','commandery'].includes(level)?'city-commandery':'city-county'}.png`;
  }
}

function updateAdministrativeLayers() {
  if(!mapReady)return;
  const state=document.querySelector('[data-layer="provinces"]').checked;
  const district=document.querySelector('[data-layer="commanderies"]');
  for(const id of ['province-reference','imperial-reference'])map.setLayoutProperty(id,'visibility',state?'visible':'none');
  map.setLayoutProperty('commanderies-line','visibility',district.checked?'visible':'none');
  $('map-disclaimer').textContent='行政底图：建安郡国研究（219年，部分建置跨期）；海域为现代参照。';
  updateMap();
  refreshMarkers();
}

function renderMilestones() {
  const group=$('milestones');group.replaceChildren();
  if(cursor.world==='history'){
    const ordered=data.events.filter(e=>e.world==='history').toSorted((a,b)=>a.time.start-b.time.start);
    for(const [text,event]of [['上一事件',ordered.findLast(e=>e.time.start<snapshot.window.start)],['下一事件',ordered.find(e=>e.time.start>snapshot.window.start)]]){
      const node=button(text,()=>jumpEvent(event));node.disabled=!event;group.append(node);
    }
  }
  const entries=cursor.world==='history'?
    [[184,'黄巾起事'],[188,'黄巾余部'],[192,'青州受降'],[194,'刘备领州'],[196,'汝颍与下邳'],[197,'典韦宛城'],[200,'官渡与汝南'],[219,'樊城水患'],[234,'五丈原'],[266,'魏晋更替']]:
    [...new Map(data.national.romance.filter(x=>x.position<=cursor.position).map(x=>[Math.floor(x.position/1000),[x.position,`第${Math.floor(x.position/1000)}回 · ${x.title}`]])).values()];
  for (const [position,label] of entries) {
    const node=button(cursor.world==='history'?`${position} ${label}`:label,()=>{
      if(cursor.world==='history') setYear(position);else setNovel(Math.floor(position/1000));
    });
    node.classList.toggle('selected',cursor.world==='history'?cursor.position===position:Math.floor(territory.phase.position/1000)===Math.floor(position/1000));group.append(node);
  }
  if(cursor.world==='romance'){
    const active=group.querySelector('.selected');
    group.scrollLeft=active.offsetLeft-group.offsetLeft-(group.clientWidth-active.offsetWidth)/2;
  }
}

function jumpEvent(event){
  selected=null;
  const original=event.time.original;
  if(!original){cursor.granularity='year';setYear(event.year);}
  else{
    cursor.world='history';cursor.calendar=original.calendar||'han';cursor.position=original.year;
    const month=yearMonths(data,cursor.position,cursor.calendar).find(m=>m.start<=event.time.start&&m.end>=event.time.start);
    cursor.monthStart=month.start;cursor.day=event.time.start-month.start+1;
    cursor.granularity=event.time.precision==='day'?'week':event.time.precision==='month'?'month':'year';render();
  }
  selected={kind:'event',id:event.id};renderPanel();openPanel();
}

function render() {
  document.body.classList.toggle('scene-mode',sceneMode);
  $('scene-mode').classList.toggle('selected',sceneMode);$('scene-mode').setAttribute('aria-pressed',String(sceneMode));
  $('scene-controls').hidden=!sceneMode;
  $('scene-options').hidden=!sceneMode;
  $('history-options').hidden=sceneMode||cursor.world!=='history';
  $('romance-options').hidden=sceneMode||cursor.world!=='romance';
  document.querySelector('[data-tab="activities"]').hidden=sceneMode;
  document.querySelector('[data-tab="campaigns"]').textContent=sceneMode?'军队':'战役';
  if(sceneMode){renderScene();return;}
  sceneRenderer?.clear();
  snapshot=stateAt(data,cursor);
  territory=territoryAt(data,strategicRegions,cursor,snapshot);
  if(mapReady)updateFactionLabels();
  const history=cursor.world==='history';
  $('history-mode').classList.toggle('selected',history);$('history-mode').setAttribute('aria-pressed',String(history));
  $('romance-mode').classList.toggle('selected',!history);$('romance-mode').setAttribute('aria-pressed',String(!history));
  $('history-controls').hidden=!history;$('romance-controls').hidden=history;
  $('world-label').textContent='底图：建安郡国研究（219年）';
  $('map-time').textContent=history?windowLabel(data,cursor):`第 ${currentChapter()} 回`;
  $('time-note').textContent=history?`${territory.phase.year}年阶段背景`:'本回读毕';
  $('timeline-position').textContent=$('cursor-label').textContent=history?windowLabel(data,cursor):`第 ${currentChapter()} 回 · 本回读毕`;
  $('timeline-toggle').textContent=history?'时间设置':'回目设置';
  $('cursor-description').textContent=history?`${calendarNames[cursor.calendar]} · ${julianLabel(snapshot.window.start)}—${julianLabel(snapshot.window.end)} · ${snapshot.uncertainEvents.length} 条时间范围未定`:`阶段推定 · 最近节点：第 ${Math.floor(territory.phase.position/1000)} 回`;
  $('year-input').value=history?cursor.position:$('year-input').value;
  if(history)$('year-input').setCustomValidity('');
  if(history)renderHistoryControls();
  if(!history) {
    const chapter=data.chapters.find(x=>x.number===currentChapter());
    $('chapter-select').value=chapter.number;$('chapter-slider').value=chapter.number;
    $('chapter-label').value=`${chapter.number} / 120`;
    $('previous-chapter').disabled=chapter.number===1;$('next-chapter').disabled=chapter.number===120;
  }
  renderMilestones();renderPanel();updateMap();
  if($('search').value)updateSearch();
  $('announcement').textContent=$('cursor-label').textContent;
}

function setYear(year) {
  sceneMode=false;
  cursor.world='history';cursor.position=year;
  if(!yearMonths(data,year,cursor.calendar).length)cursor.calendar='han';
  cursor.monthStart=yearMonths(data,year,cursor.calendar)[0].start;cursor.day=1;
  selected=null;render();
}
function renderHistoryControls(){
  const months=yearMonths(data,cursor.position,cursor.calendar);
  $('time-scale').value=cursor.granularity;$('calendar-select').value=cursor.calendar;
  for(const option of $('calendar-select').options)option.disabled=!yearMonths(data,cursor.position,option.value).length;
  const select=$('month-select');select.replaceChildren();
  for(const month of months){const option=el('option',monthName(month));option.value=month.start;select.append(option);}
  select.value=cursor.monthStart;select.hidden=$('month-label').hidden=cursor.granularity==='year';
  $('day-input').hidden=$('day-label').hidden=cursor.granularity!=='week';
  const month=months.find(m=>m.start===cursor.monthStart);
  $('day-input').value=cursor.day;$('day-input').max=month.end-month.start+1;
  $('day-input').setCustomValidity('');
  const units={year:'年',month:'月',week:'七日'};
  $('previous-year').setAttribute('aria-label',`上一${units[cursor.granularity]}`);
  $('next-year').setAttribute('aria-label',`下一${units[cursor.granularity]}`);
  const all=data.calendar.calendars[cursor.calendar].filter(m=>m.year>=184&&m.year<=280);
  const starts=timelineStarts(data,cursor),slider=$('year-slider');
  slider.min=0;slider.max=starts.length-1;slider.step=1;slider.value=starts.indexOf(snapshot.window.start);
  slider.setAttribute('aria-label',`按${units[cursor.granularity]}浏览历史`);
  slider.setAttribute('aria-valuetext',windowLabel(data,cursor));
  $('previous-year').disabled=snapshot.window.start<=all[0].start;
  $('next-year').disabled=snapshot.window.end>=all.at(-1).end;
  if(month.note)$('cursor-description').textContent+=' · '+month.note;
}
function stepHistory(direction){
  if(cursor.granularity==='year'){setYear(cursor.position+direction);return;}
  const all=data.calendar.calendars[cursor.calendar].filter(m=>m.year>=184&&m.year<=280);
  const index=all.findIndex(m=>m.start===cursor.monthStart);
  let start=cursor.granularity==='month'?all[index+direction].start:snapshot.window.start+7*direction;
  start=Math.max(all[0].start,Math.min(all.at(-1).end,start));
  setHistoryStart(start);
}
function setHistoryStart(start){
  const month=data.calendar.calendars[cursor.calendar].find(m=>m.start<=start&&m.end>=start);
  cursor.position=month.year;cursor.monthStart=month.start;cursor.day=start-month.start+1;selected=null;render();
}
function setNovel(chapter) {sceneMode=false;cursor.world='romance';cursor.position=chapter*1000+data.chapters.find(c=>c.number===chapter).paragraphs;selected=null;render();}

function selectScene(kind,id){
  selected=kind?{kind:`scene-${kind}`,id}:null;activeTab='overview';renderPanel();openPanel();$('panel-content').scrollTop=0;
}
function focusScene(){
  const height=map.getContainer().clientHeight,width=map.getContainer().clientWidth;
  let bounds=scenePack.example?scenePack.focus:[[105,24],[123,42]];
  if(!scenePack.example){
    const coordinates=[...new Set(sceneView.observations.slice(-12).map(o=>o.place).filter(Boolean))].map(id=>scenePlaces.get(id).coordinates);
    if(coordinates.length)bounds=[[Math.min(...coordinates.map(c=>c[0]))-1.3,Math.min(...coordinates.map(c=>c[1]))-1],[Math.max(...coordinates.map(c=>c[0]))+1.3,Math.max(...coordinates.map(c=>c[1]))+1]];
  }
  map.fitBounds(bounds,{padding:{top:Math.min(155,height*.26),bottom:Math.min(135,height*.25),left:Math.min(65,width*.12),right:Math.min(90,width*.18)},duration:350});
  if(matchMedia('(max-width:1100px), (pointer:coarse)').matches)closePanel();
}
function renderScene(){
  sceneView=buildSceneView(scenePack,sceneCursor,strategicRegions);
  territory={records:sceneView.controls,phase:{title:scenePack.title,note:scenePack.coverage,source_ids:[]}};
  if(mapReady)updateFactionLabels();
  for(const id of ['history-mode','romance-mode']){$(id).classList.remove('selected');$(id).setAttribute('aria-pressed','false');}
  $('history-controls').hidden=$('romance-controls').hidden=true;$('milestones').replaceChildren();
  $('world-label').textContent=scenePack.example?'小说片段 · 示例':'小说片段 · 剧本地图';$('map-time').textContent=scenePack.title;
  $('time-note').textContent=scenePack.example?'书名与年份未详':'底图：建安郡国研究（219年）';
  const positionLabel=scenePack.steps[sceneCursor.position]||'当前片段暂无地图事件';
  $('timeline-position').textContent=$('cursor-label').textContent=`${scenePack.chapterHint} · ${positionLabel}`;
  $('timeline-toggle').textContent=`${{current:'当前形势',plan:'文中计划',analysis:'条件推演'}[sceneCursor.view]} · 设置`;
  $('cursor-description').textContent='计划步骤仅为推演。';
  $('scene-progress').min=scenePack.example?0:-1;$('scene-progress').max=scenePack.steps.length-1;$('scene-progress').value=sceneCursor.position;$('scene-progress').setAttribute('aria-valuetext',positionLabel);
  $('scene-progress-label').textContent=`${sceneCursor.position+1} / ${scenePack.steps.length}`;
  for(const node of document.querySelectorAll('[data-scene-view]')){const chosen=node.dataset.sceneView===sceneCursor.view;node.classList.toggle('selected',chosen);node.setAttribute('aria-pressed',String(chosen));}
  $('scene-step-label').hidden=sceneCursor.view!=='plan';
  $('scene-step').replaceChildren(...scenePack.planSteps.map((label,i)=>{const option=el('option',label);option.value=i;return option;}));$('scene-step').value=sceneCursor.step;
  $('scene-branch-label').hidden=sceneCursor.view!=='analysis';
  const branchSelect=$('scene-branch');branchSelect.replaceChildren();
  for(const branch of sceneView.branches){const option=el('option',branch.name);option.value=branch.id;branchSelect.append(option);}
  if(!sceneView.branches.length){const option=el('option','暂无推演条件');branchSelect.append(option);branchSelect.disabled=true;}else{branchSelect.disabled=false;branchSelect.value=sceneView.branch?.id||sceneCursor.branch;}
  renderPanel();updateMap();if($('search').value)updateSearch();
  $('announcement').textContent=`${scenePack.title}，${positionLabel}`;
}

function bind() {
  if(window.MapTool)$('map-quick-actions').append(button('返回阅读',()=>window.MapTool.returnToReading()));
  $('scene-mode').onclick=()=>{sceneMode=true;selected=null;activeTab='overview';render();focusScene();};
  for(const node of document.querySelectorAll('[data-scene-view]'))node.onclick=()=>{sceneCursor.view=node.dataset.sceneView;selected=null;activeTab='overview';render();};
  $('scene-progress').oninput=event=>{sceneCursor.position=Number(event.target.value);localStorage.setItem('story-position-'+scenePack.id,String(sceneCursor.position));readingPosition(scenePack,sceneCursor.position).catch(e=>{$('announcement').textContent='阅读位置未能保存。';console.error('阅读位置保存失败',e);});selected=null;render();};
  $('scene-step').onchange=event=>{sceneCursor.step=Number(event.target.value);selected=null;render();};
  $('scene-branch').onchange=event=>{sceneCursor.branch=event.target.value;selected=null;render();};
  $('history-mode').onclick=()=>setYear(194);
  $('romance-mode').onclick=()=>setNovel(1);
  $('year-slider').oninput=event=>setHistoryStart(timelineStarts(data,cursor)[Number(event.target.value)]);
  $('year-input').onchange=event=>{
    const year=Number(event.target.value);
    const invalid=!Number.isInteger(year)||year<184||year>280;
    event.target.setCustomValidity(invalid?'请输入184至280之间的整数年份。':'');
    if(invalid){event.target.reportValidity();return;}
    setYear(year);
  };
  $('previous-year').onclick=()=>stepHistory(-1);$('next-year').onclick=()=>stepHistory(1);
  $('time-scale').onchange=event=>{cursor.granularity=event.target.value;cursor.day=1;selected=null;render();};
  $('calendar-select').onchange=event=>{cursor.calendar=event.target.value;setYear(cursor.position);};
  $('month-select').onchange=event=>{cursor.monthStart=Number(event.target.value);cursor.day=1;selected=null;render();};
  $('day-input').onchange=event=>{const day=Number(event.target.value),invalid=!Number.isInteger(day)||day<1||day>Number(event.target.max);event.target.setCustomValidity(invalid?'请输入本月有效的整数起日。':'');if(invalid){event.target.reportValidity();return;}cursor.day=day;selected=null;render();};
  $('chapter-select').onchange=event=>setNovel(Number(event.target.value));
  $('chapter-slider').oninput=event=>setNovel(Number(event.target.value));
  $('previous-chapter').onclick=()=>setNovel(currentChapter()-1);$('next-chapter').onclick=()=>setNovel(currentChapter()+1);
  for(const item of document.querySelectorAll('[data-tab]'))item.onclick=()=>{selected=null;activeTab=item.dataset.tab;renderPanel();};
  $('coverage-button').onclick=()=>{selected={kind:'coverage'};renderPanel();openPanel();};
  $('campaign-button').onclick=()=>{selected=null;activeTab='campaigns';renderPanel();openPanel();};
  $('hydrology-button').onclick=()=>{selected={kind:'hydrology'};renderPanel();openPanel();};
  $('mobile-panel-button').onclick=()=>{if($('sidebar').classList.contains('open'))closePanel();else openPanel();};
  $('close-panel').onclick=closePanel;
  $('focus-xuzhou').onclick=()=>{closeMapOverlays();map.fitBounds([[115.8,31.7],[120.2,36.3]],{padding:35,duration:400});};
  $('focus-all').onclick=()=>map.fitBounds([[91,18],[136,48]],{padding:{top:35,bottom:125,left:35,right:35},duration:500});
  $('political-button').onclick=()=>{const input=document.querySelector('[data-layer="regions"]');input.checked=!input.checked;render();};
  $('layers-button').onclick=()=>{const open=$('layer-panel').hidden;closeMapOverlays();closePanel();$('layer-panel').hidden=!open;$('layers-button').setAttribute('aria-expanded',String(open));};
  $('close-layers').onclick=()=>{closeMapOverlays();$('layers-button').focus();};
  $('timeline-toggle').onclick=()=>{const open=$('timeline-options').hidden;closeMapOverlays();closePanel();$('timeline-options').hidden=!open;$('timeline-toggle').setAttribute('aria-expanded',String(open));};
  $('close-timeline').onclick=()=>{closeMapOverlays();$('timeline-toggle').focus();};
  $('search-toggle').onclick=()=>{const open=!document.body.classList.contains('search-open');closeMapOverlays();closePanel();document.body.classList.toggle('search-open',open);$('search-toggle').setAttribute('aria-expanded',String(open));if(open)$('search').focus();};
  $('legend-disclosure').querySelector('summary').onclick=()=>{const open=$('legend-disclosure').open;closeMapOverlays();closePanel();$('legend-disclosure').open=open;};
  $('legend-disclosure').addEventListener('toggle',refreshMarkers);
  $('search').oninput=updateSearch;
  $('story-geography-button').onclick=()=>{selected={kind:'story-geography'};renderPanel();openPanel();};
  $('search').onkeydown=event=>{if(event.key==='Escape')$('search-results').hidden=true;};
  document.addEventListener('click',event=>{
    if(!event.target.closest('.search-wrap,#search-toggle')){$('search-results').hidden=true;document.body.classList.remove('search-open');$('search-toggle').setAttribute('aria-expanded','false');}
    if(!event.target.closest('#layer-panel,#layers-button')){$('layer-panel').hidden=true;$('layers-button').setAttribute('aria-expanded','false');}
    if(!event.target.closest('.timeline')){$('timeline-options').hidden=true;$('timeline-toggle').setAttribute('aria-expanded','false');}
    if(!event.target.closest('#legend-disclosure'))$('legend-disclosure').open=false;
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMapOverlays();closePanel();}});
  for(const checkbox of document.querySelectorAll('[data-layer]'))checkbox.onchange=()=>{
    if(!mapReady)return;
    const name=checkbox.dataset.layer, visible=checkbox.checked?'visible':'none';
    if(name==='regions'){render();return;}
    if(name==='research-water'){map.setLayoutProperty('research-water','visibility',visible);updateMap();return;}
    if(name==='story-geography'){for(const layer of ['story-rivers','story-ranges','story-points'])map.setLayoutProperty(layer,'visibility',visible);refreshMarkers();return;}
    if(name==='activities'||name==='models'||name==='campaigns'){updateMap();return;}
    if(name==='provinces'||name==='commanderies'){updateAdministrativeLayers();return;}
    if(name==='places'){refreshMarkers();updateModels();}
    else if(name==='mountains')for(const marker of mountainMarkers)marker.getElement().style.display=checkbox.checked?'':'none';
    else for(const layer of {terrain:['terrain-wide'],
      'historical-water':['historical-water'],'modern-water':['modern-water']}[name])map.setLayoutProperty(layer,'visibility',visible);
    refreshMarkers();
  };
}

function updateFactionLabels() {
  for(const {parts} of factionLabels.values())for(const part of parts)part.marker?.remove();
  factionLabels.clear();
  if(sceneMode){for(const group of sceneFactionGroups(sceneView,strategicRegions))factionLabels.set(group.owner,group);return;}
  for(const {owner,key} of territoryGroups(territory)){
    const item=faction(owner),centre=factionCentres[key];
    // Use a small editorial abbreviation list, never automatic surname slicing.
    // Liu Bei (the supported novel's protagonist) and both Yuans stay complete.
    const shortNames={cao:'曹',dong:'董卓','li-guo':'李傕·郭汜',ma:'凉州诸军',xugong:'吴郡诸势力',shixie:'士燮'};
    const name=shortNames[owner]||item.name;
    factionLabels.set(owner,{name,owner,parts:centre.parts.map(p=>({...p})),area:centre.area,
      priority:owner==='liu'?2:['cao','yuan','shu-yuan','lu'].includes(owner)?1:0});
  }
}

function layoutFactionLabels(viewport,occupied,zoom){
  factionLeaders.replaceChildren();
  const enabled=document.querySelector('[data-layer="regions"]').checked;
  const project=coord=>{const p=map.project(coord);return [p.x+viewport.left,p.y+viewport.top];};
  const groups=[...factionLabels.values()].sort((a,b)=>b.priority-a.priority||b.area-a.area);
  for(const group of groups){
    for(const part of group.parts)if(part.marker)part.marker.getElement().style.display='none';
    group.shown=0;
    group.visible=group.parts.map(part=>{
      const rings=part.rings.map(r=>r.map(project));return {part,rings,...visibleSamples(rings,viewport)};
    }).filter(v=>v.points.length).sort((a,b)=>b.area-a.area);
  }
  if(!enabled)return;
  // Reserve each state's interior name before placing external labels. A wide
  // callout must not occupy another state's centre and displace its name.
  const placed=new Set();
  for(const allowCallout of [false,true])for(const group of groups){
    for(const v of group.visible){
      if(sceneMode&&group.shown)break;
      const {part}=v;
      if(placed.has(part))continue;
      if(!part.marker){
        const item=faction(group.owner),node=button(group.name,event=>{event.stopPropagation();if(sceneMode){selectScene('faction',group.owner);return;}selected={kind:'region',id:group.owner};renderPanel();openPanel();},'faction-label');
        node.dataset.faction=group.owner;node.title=item.name;
        node.setAttribute('aria-label',`${item.name}，查看人物与势力档案`);
        part.marker=new maplibregl.Marker({element:node}).setLngLat(part.coordinates).addTo(map);
      }
      const node=part.marker.getElement();node.style.display='';node.classList.remove('faction-callout');
      node.style.fontSize=`${sceneMode&&viewport.width<600?22:Math.max(28,Math.min(viewport.width<600?28:38,22+(zoom-3)*4))}px`;
      const {width,height}=node.getBoundingClientRect();
      if(group.shown&&v.area<width*height*4){node.style.display='none';continue;}
      const layout=placeFactionLabel({rings:v.rings,samples:v.points,preferred:project(part.coordinates),
        width,height,viewport,occupied,allowCallout});
      if(!layout){node.style.display='none';continue;}
      const position=map.unproject([layout.position[0]-viewport.left,layout.position[1]-viewport.top]);
      part.position=[position.lng,position.lat];part.marker.setLngLat(part.position);
      node.dataset.anchor=JSON.stringify(map.unproject([layout.anchor[0]-viewport.left,layout.anchor[1]-viewport.top]).toArray());
      node.classList.toggle('faction-callout',layout.callout);occupied.push(layout.box);group.shown++;placed.add(part);
      if(layout.callout){
        const line=document.createElementNS('http://www.w3.org/2000/svg','line');
        for(const [key,value]of Object.entries({x1:layout.anchor[0]-viewport.left,y1:layout.anchor[1]-viewport.top,
          x2:Math.max(layout.box.left,Math.min(layout.box.right,layout.anchor[0]))-viewport.left,
          y2:Math.max(layout.box.top,Math.min(layout.box.bottom,layout.anchor[1]))-viewport.top}))line.setAttribute(key,value);
        factionLeaders.append(line);
      }
    }
  }
}

function buildMap(reference, boundaries) {
  factionLeaders=document.createElementNS('http://www.w3.org/2000/svg','svg');
  factionLeaders.classList.add('faction-leaders');factionLeaders.setAttribute('aria-hidden','true');
  map=new maplibregl.Map({container:'map',center:[112,34],zoom:4,minZoom:2.8,maxZoom:12,
    maxBounds:[[87,13],[140,53]],attributionControl:false,
    locale:{'Map.Title':'地图查看工具','Marker.Title':'地点标记',
      'NavigationControl.ZoomIn':'放大地图','NavigationControl.ZoomOut':'缩小地图','NavigationControl.ResetBearing':'恢复正北方向',
      'AttributionControl.ToggleAttribution':'展开或收起来源署名','AttributionControl.MapFeedback':'反馈问题',
      'ScaleControl.Meters':'米','ScaleControl.Kilometers':'千米','Popup.Close':'关闭详情'},
    style:{version:8,sources:{
      land:{type:'geojson',data:reference.land},
      water:{type:'geojson',data:reference.water},
      coastline:{type:'geojson',data:reference.coastline},
      'coastal-patches':{type:'geojson',data:reference.coastal_patches},
      'relief-wide':{type:'image',url:reference.wide_terrain.path,coordinates:reference.wide_terrain.coordinates},
      'display-boundaries':{type:'geojson',data:strategicRegions.display_boundaries,tolerance:0},
      'political-cells':{type:'geojson',data:fc([]),tolerance:0},
      'research-water':{type:'geojson',data:researchWater},
      counties:{type:'geojson',data:fc(data.national.counties.filter(x=>x.properties.boundary_status!=='待考'))},
      'historical-water':{type:'geojson',data:fc(data.rivers.map(r=>({type:'Feature',properties:{id:r.id,name:r.name},geometry:{type:'LineString',coordinates:r.points}})))},
      'modern-water':{type:'geojson',data:reference.rivers},
      'story-geography':{type:'geojson',data:data.story_geography},
    },layers:[
      {id:'ocean',type:'background',paint:{'background-color':'#a9d3e8'}},
      {id:'land',type:'fill',source:'land',paint:{'fill-color':'#eee6cf'}},
      {id:'terrain-wide',type:'raster',source:'relief-wide',paint:{'raster-opacity':.90,'raster-saturation':-.3}},
      {id:'coastal-land',type:'fill',source:'coastal-patches',paint:{'fill-color':'#eee6cf','fill-antialias':false}},
      {id:'political-fill',type:'fill',source:'political-cells',paint:{'fill-color':['get','color'],'fill-opacity':['case',['get','inferred'],.48,['get','known'],.58,.08],'fill-antialias':false}},
      {id:'water-mask',type:'fill',source:'water',paint:{'fill-color':'#a9d3e8','fill-opacity':1}},
      {id:'coastline',type:'line',source:'coastline',paint:{'line-color':'#4282a5','line-width':['interpolate',['linear'],['zoom'],3,.7,7,1.8,12,2.5]}},
      {id:'modern-water',type:'line',source:'modern-water',layout:{visibility:'none'},paint:{'line-color':'#497f95','line-width':.7,'line-opacity':.55}},
      {id:'commanderies-line',type:'line',source:'display-boundaries',filter:['==',['get','kind'],'commandery'],paint:{'line-color':'#775e89','line-width':['interpolate',['linear'],['zoom'],3,.5,5,1.1,8,1.7],'line-dasharray':[4,3],'line-opacity':.9}},
      {id:'province-reference',type:'line',source:'display-boundaries',filter:['==',['get','kind'],'province'],paint:{'line-color':'#344e63','line-width':2.3,'line-opacity':.9}},
      {id:'imperial-reference',type:'line',source:'display-boundaries',filter:['==',['get','kind'],'imperial'],paint:{'line-color':'#867056','line-width':2.4,'line-dasharray':[4,3],'line-opacity':.85}},
      {id:'county-hit',type:'fill',source:'counties',paint:{'fill-color':'#ffffff','fill-opacity':.001}},
      {id:'county-shadow',type:'line',source:'counties',filter:['==',['get','id'],''],paint:{'line-color':'#273f4e','line-width':7,'line-blur':3,'line-opacity':.6}},
      {id:'county-hover',type:'line',source:'counties',filter:['==',['get','id'],''],paint:{'line-color':'#ffffff','line-width':3.1,'line-opacity':1}},
      {id:'historical-water',type:'line',source:'historical-water',layout:{visibility:'none'},paint:{'line-color':'#497f95','line-width':1,'line-dasharray':[5,2],'line-opacity':.65}},
      {id:'research-water',type:'line',source:'research-water',layout:{visibility:'none'},paint:{'line-color':'#497f95','line-width':['interpolate',['linear'],['zoom'],3,.65,7,1.1,12,1.6],'line-dasharray':[3,1],'line-opacity':.75}},
      {id:'story-rivers',type:'line',source:'story-geography',filter:['==',['get','kind'],'河流'],layout:{'line-join':'round','line-cap':'round'},paint:readingRiverPaint},
      {id:'story-ranges',type:'line',source:'story-geography',filter:['in',['get','kind'],['literal',['山系','谷道']]],paint:{'line-color':'#795a30','line-width':2.2,'line-dasharray':[2,2]}},
      {id:'story-points',type:'circle',source:'story-geography',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':4,'circle-color':['case',['==',['get','kind'],'湖泽'],'#086d9b','#795a30'],'circle-stroke-color':'#fff','circle-stroke-width':1.5}},
    ]}});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
  map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'现代地势：美国地质调查局、美国国家海洋和大气管理局；<a href="assets/DATA-NOTICES.txt" download>下载完整来源署名</a>'}),'bottom-right');
  // The bundled control starts expanded even in compact mode; keep credits one tap away.
  map.getContainer().querySelector('.maplibregl-ctrl-attrib-button').click();
  map.on('load',()=>{
    mapReady=true;
    modelLayer=createModelLayer(map,error=>{$('map-error').hidden=false;$('map-error').textContent='城池与兵人模型载入失败。';console.error(error);});map.addLayer(modelLayer);
    campaignLayer=createCampaignLayer(map,showCampaign);
    sceneRenderer=createSceneRenderer(map,scenePlaces,strategicRegions,selectScene);
    for(const [i,place] of data.places.entries()) {
      const major=['luoyang','changan','chengdu','jianye','ye','jicheng','xiangping','panyu','xiangyang','jiangling','hanzhong','pengcheng','xiapi'].includes(place.id);
      const node=button('',event=>{event.stopPropagation();showPlace(place);},`place-marker center-${centerLevel(place)}${major?' major':''}`);
      node.setAttribute('aria-label',`${place.name}，${place.kind}，查看地点资料`);
      if(place.id==='haixi')node.classList.add('candidate-place');
      node.append(el('span',placeName(place),'place-label'));
      const mini=el('img');mini.className='city-mini';mini.alt='';mini.hidden=true;node.append(mini);
      const marker=new maplibregl.Marker({element:node}).setLngLat(place.coordinates).addTo(map);
      placeMarkers.set(place.id,marker);
      node.addEventListener('mouseenter',()=>{const point=map.project(place.coordinates);highlightCounty(`county-${place.id}`,point);});
      node.addEventListener('mouseleave',()=>highlightCounty(selected?.kind==='place'?`county-${selected.id}`:null));
    }
    for(const label of boundaries.labels.filter(x=>x.kind==='郡国名称')){const node=button(label.full_name,()=>{selected={kind:'reference-commandery',name:label.name};renderPanel();openPanel();},'commandery-label');
      node.setAttribute('aria-label',`${label.full_name}，郡级行政区参考`);node.title='郡级行政区参考';
      commanderyLabels.push(new maplibregl.Marker({element:node}).setLngLat(label.coordinates).addTo(map));}
    for(const province of strategicRegions.province_labels['219']){const node=button(province.name,()=>{selected={kind:'province',name:province.name};renderPanel();openPanel();},'province-label');node.dataset.province=province.name;node.setAttribute('aria-label',`${province.name}，州级行政区参考`);provinceLabels.push(new maplibregl.Marker({element:node}).setLngLat(province.coordinates).addTo(map));}
    updateFactionLabels();
    for(const [name,lon,lat]of reference.sea_labels){const node=el('span',name,'sea-label');new maplibregl.Marker({element:node}).setLngLat([lon,lat]).addTo(map);}
    for(const [name,lon,lat]of data.mountains) {
      const node=el('span',`▲ ${name}`,'mountain-label');node.style.display='none';
      mountainMarkers.push(new maplibregl.Marker({element:node}).setLngLat([lon,lat]).addTo(map));
    }
    for(const feature of data.story_geography.features){
      const item=feature.properties,water=['河流','湖泽'].includes(item.kind);
      const node=button(`${water?'':item.kind==='关隘'?'▣ ':'▲ '}${item.name}`,()=>showStoryGeography(item.id),`geography-label ${water?'geography-water':'geography-land'}`);
      node.dataset.geography=item.id;node.setAttribute('aria-label',`${item.name}，${item.kind}，查看原著地理`);
      const candidates=[item.label,...(feature.geometry.type==='LineString'?feature.geometry.coordinates:[])];
      candidates.sort((a,b)=>(a[0]-item.label[0])**2+(a[1]-item.label[1])**2-((b[0]-item.label[0])**2+(b[1]-item.label[1])**2));
      geographyMarkers.push({item,candidates,marker:new maplibregl.Marker({element:node}).setLngLat(item.label).addTo(map)});
    }
    map.on('click',event=>{
      if(event.originalEvent.target.closest('.commandery-label,.province-label,.faction-label,.geography-label,.campaign-unit,.campaign-target,.campaign-arrow,.scene-point'))return;
      if(sceneMode){
        const agreement=map.queryRenderedFeatures(event.point,{layers:['scene-agreement-fill']})[0];
        if(agreement){selectScene('control',agreement.properties.id);return;}
      }
      if(map.queryRenderedFeatures(event.point,{layers:['research-water']}).length){selected={kind:'hydrology'};renderPanel();openPanel();return;}
      const hits=map.queryRenderedFeatures(event.point,{layers:['county-hit']});
      const county=hits.find(x=>x.layer.id==='county-hit');
      if(county&&map.getZoom()>=5.5){showPlace(data.places.find(x=>x.id===county.properties.place_id));return;}
      if(event.originalEvent.target.closest('.place-marker,.activity-marker'))return;
      const geography=map.queryRenderedFeatures(event.point,{layers:['story-rivers','story-ranges','story-points']})[0];
      if(geography){showStoryGeography(geography.properties.id);return;}
      const cell=map.queryRenderedFeatures(event.point,{layers:['political-fill']})[0];
      if(cell){selected={kind:'territory',id:cell.properties.id};renderPanel();openPanel();}
    });
    map.on('mousemove',event=>{
      // Marker listeners own their hover state. With no invented county polygon,
      // the canvas hit query is empty and must not erase that same pointer event.
      if(event.originalEvent.target.closest('.place-marker'))return;
      const hits=map.queryRenderedFeatures(event.point,{layers:['county-hit']});
      if(hits.length&&map.getZoom()>=5.3)highlightCounty(hits[0].properties.id,event.point);
      else if(!selected||selected.kind!=='place')highlightCounty(null);
    });
    map.on('mouseout',()=>{if(selected?.kind!=='place')highlightCounty(null);});
    map.on('click','historical-water',event=>{selected={kind:'river',id:event.features[0].properties.id};renderPanel();openPanel();});
    map.getContainer().append(factionLeaders);
    map.on('zoom',refreshMarkers);
    map.on('moveend',()=>requestAnimationFrame(refreshMarkers));
    map.on('idle',refreshMarkers);
    updateMap();updateAdministrativeLayers();$('loading').hidden=true;
    map.fitBounds([[91,18],[136,48]],{padding:{top:35,bottom:125,left:35,right:35},duration:0});
    new ResizeObserver(()=>map.resize()).observe($('map'));
    window.atlas={map,cursor,get state(){return snapshot;},get territory(){return territory;},strategicRegions,data,hoveredCounty,campaigns:campaignData.campaigns,
      get scene(){return sceneMode?sceneView:null;}};
    if(new URLSearchParams(location.search).get('scene')==='xuzhou-letter')$('scene-mode').click();
    if(new URLSearchParams(location.search).has('story'))$('scene-mode').click();
  });
  map.on('error',event=>{
    $('map-error').hidden=false;
    $('map-error').textContent='地图资源载入失败。请刷新页面重试。';
    $('announcement').textContent='地图资源载入失败。';
    console.error('1002: Map resource error',event.error);
  });
}

async function start() {
  const responses=await Promise.all([fetch('atlas.json'),fetch('reference.json'),fetch('jianan-boundaries.geojson'),fetch('han-administration.json'),fetch('strategic-regions.json'),fetch('historical-water.json'),fetch('faction-labels.json'),fetch('coastal-reference.json'),fetch('campaigns.json'),fetch('scene/xuzhou-letter.json'),fetch('map-compatibility.json')]);
  for(const response of responses)if(!response.ok)throw new Error(`资料载入失败，响应编号：${response.status}`);
  const atlasBytes=await responses[0].arrayBuffer();
  data=JSON.parse(new TextDecoder().decode(atlasBytes));
  const reference={...await responses[1].json(),...await responses[7].json()};
  $('coastal-note').textContent=reference.coastal_note;
  for(const chapter of data.chapters){const option=el('option',`第 ${chapter.number} 回`);option.value=chapter.number;$('chapter-select').append(option);}
  boundaryReference=await responses[2].json();
  administration=await responses[3].json();
  const regionBytes=await responses[4].arrayBuffer();
  strategicRegions=JSON.parse(new TextDecoder().decode(regionBytes));
  researchWater=await responses[5].json();
  factionCentres=await responses[6].json();
  campaignData=await responses[8].json();
  scenePack=await responses[9].json();
  const catalog=await responses[10].json();
  const [baseMapRevision,atlasRevision]=await Promise.all([sha256(regionBytes),sha256(atlasBytes)]);
  const localVersion=resolveMapVersion({baseMapId:'jianan-219',baseMapRevision,atlasRevision,sceneSchemaVersion:1},catalog);
  const storyId=new URLSearchParams(location.search).get('story');
  if(storyId){
    scenePack=await readStories(storyId);
    if(!scenePack)throw Error('本地没有这份地图，请从“小说阅读”重新导入或下载。');
    assertPackCompatible(scenePack,localVersion,catalog);
    sceneCursor.position=(await readingPosition(scenePack))??Math.max(0,Math.min(scenePack.steps.length-1,Number(localStorage.getItem('story-position-'+storyId)||0)));
    sceneCursor.view='current';sceneCursor.step=0;
  }
  scenePlaces=resolveScenePlaces(scenePack,data,strategicRegions);
  cursor.monthStart=yearMonths(data,cursor.position,cursor.calendar)[0].start;
  bind();render();buildMap(reference,boundaryReference);
}

start().catch(error=>{$('loading').textContent='地图载入失败：'+error.message;console.error('1001: Atlas startup failed',error);});
