const status=document.getElementById('load-status');
async function start(){
  const response=await fetch('jianan-reference.json');
  if(!response.ok)throw new Error(`Source dataset response: ${response.status}`);
  const data=await response.json();
  if(window.matchMedia('(max-width:650px)').matches)document.querySelector('.reference-key').open=false;
  const bounds=[[0,0],[data.height,data.width]];
  const map=L.map('reference-map',{crs:L.CRS.Simple,minZoom:-2,maxZoom:3,zoomSnap:.1,zoomControl:false,attributionControl:false});
  L.control.zoom({zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(map);
  L.control.attribution({prefix:false}).addAttribution('<a href="assets/DATA-NOTICES.txt" download>来源署名与相同方式共享许可</a>').addTo(map);
  const terrain=L.imageOverlay(data.terrain,[[-1,-1],[1801,2501]]).addTo(map);
  terrain.on('error',()=>{status.hidden=false;status.textContent='地势底图载入失败，请检查本地资料文件。';console.error('3002: Reference terrain load failed');});
  terrain.on('load',()=>{status.hidden=true;window.referenceAtlas={map,terrain,data};});
  const types={commandery:{name:'郡国界线',color:'#344b56',weight:1.2,dashArray:'3 5'},province:{name:'州级界线',color:'#4b5559',weight:2},imperial:{name:'汉境外缘',color:'#725e47',weight:4,dashArray:'10 9'}};
  for(const [i,line]of data.boundaries.entries()){
    const kind=types[line.kind];
    const text=document.createElement('div');text.textContent=`${kind.name} · 第${i+1}段。来自原图，未补全为辖区；州界可能采用220年后的划分。`;
    L.polyline(line.points.map(([x,y])=>[data.height-y,x]),kind).addTo(map).bindPopup(text);
  }
  const names=data.labels.map(label=>{
    const text=document.createElement('span');text.textContent=label.name;
    const detail=document.createElement('div');detail.textContent=`${label.name} · ${label.kind}。${label.note}`;
    for(const review of label.epoch_reviews){
      const note=document.createElement('p');note.textContent=review.note;detail.append(note);
      for(const citation of review.citations){
        const quote=document.createElement('blockquote');quote.textContent=citation.display_quote;
        const link=document.createElement('a');link.textContent=`${citation.title} · 修订${citation.revision}`;link.href=citation.url;link.target='_blank';link.rel='noopener noreferrer';
        detail.append(quote,link);
      }
    }
    const width=Math.max(44,label.name.length*14);
    const marker=L.marker([data.height-label.y,label.x],{title:label.name,icon:L.divIcon({className:`source-name${label.kind==='城邑名称'?' town-name':''}`,html:text.outerHTML,iconSize:[width,44],iconAnchor:[width/2,22]})}).bindPopup(detail);
    return {label,marker};
  });
  map.on('popupopen',event=>{
    const close=event.popup.getElement().querySelector('.leaflet-popup-close-button');
    close.setAttribute('aria-label','关闭详情');close.title='关闭详情';
  });
  const refresh=()=>{
    const occupied=[];
    for(const {label,marker}of names){
      const visible=label.kind==='郡国名称'?map.getZoom()>=-1.8:map.getZoom()>=.3;
      const point=map.latLngToContainerPoint(marker.getLatLng());
      const box={left:point.x-Math.max(22,label.name.length*7),right:point.x+Math.max(22,label.name.length*7),top:point.y-22,bottom:point.y+22};
      const overlap=occupied.some(r=>box.left<r.right+3&&box.right>r.left-3&&box.top<r.bottom&&box.bottom>r.top);
      if(visible&&!overlap){marker.addTo(map);occupied.push(box);}else marker.remove();
    }
  };
  map.on('zoomend',refresh);map.fitBounds(bounds,{padding:[15,15]});refresh();
  document.getElementById('fit-reference').onclick=()=>map.fitBounds(bounds,{padding:[15,15]});
  document.getElementById('reference-terrain').onchange=event=>{if(event.target.checked)terrain.addTo(map);else terrain.remove();};
}
start().catch(error=>{status.hidden=false;status.textContent='中文边界底稿载入失败，请检查本地资料与服务。';console.error('3001: Reference startup failed',error);});
