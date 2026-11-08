import {compileStory,validateStoryInput} from './scene/compile.mjs';
import {readStories,saveStory,checkpoint} from './scene/store.mjs';
import {expandResult,resolveResult,makeBlocks,requestBody,needsTimelineReview,applyTimeline,timelineBody,frameContext} from './scene/extract.mjs';
import {initLibrary} from './library-ui.mjs';
import {sha256} from './scene/layer.mjs';
import {resolveMapVersion} from './scene/map-version.mjs';
const $=id=>document.getElementById(id),native=window.MapTool,base='https://genghaodewuwa.xyz/map-tool/api/v1';
const pending=new Map();let requestId=0,imported=null,busy=false,mapDataPromise=null,visibleStory=null;
const defaults={mode:'hosted',endpoint:'https://opencode.ai/inference/go/openai/v1/chat/completions',model:'deepseek-v4.1-flash'};
let config=native?JSON.parse(native.getSettings()):{...defaults,...JSON.parse(sessionStorage.getItem('model-settings')||'{}')};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);$('live-status').textContent=text;$('live-status').classList.toggle('error',error);}
async function openMap(id,currentExcerpt=false){
  if(currentExcerpt){const pack=await readStories(id);localStorage.setItem('story-position-'+id,String(pack.steps.length-1));}
  visibleStory=id;$('live-map').hidden=false;$('map-frame').src='index.html?story='+encodeURIComponent(id);$('reload-map').hidden=true;
}
$('close-map').onclick=()=>{$('live-map').hidden=true;};
$('reload-map').onclick=()=>openMap(visibleStory);
$('map-frame').onload=()=>{
  for(const link of $('map-frame').contentDocument.querySelectorAll('a[href^="tools.html"]'))link.onclick=event=>{event.preventDefault();$('live-map').hidden=true;};
};
function button(text,fn){const node=document.createElement('button');node.textContent=text;node.onclick=fn;return node;}
window.MapToolResult=async(id,result)=>{
  const promise=pending.get(id);if(!promise)return;pending.delete(id);
  try{if(!result.ok)throw Error(result.error);const r=await fetch(result.url);if(!r.ok)throw Error('本机响应文件读取失败，请重试');promise.resolve(await (promise.raw?r.arrayBuffer():r.json()));}
  catch(e){promise.reject(e);}finally{native.releaseResponse(id);}
};
async function request(route,body,raw=false){
  if(native)return new Promise((resolve,reject)=>{const id=String(++requestId);pending.set(id,{resolve,reject,raw});native.request(id,route,body?JSON.stringify(body):'');});
  const model=route==='model',url=model?config.endpoint:base+'/'+(route==='create'?'jobs':route),key=model?config.key:config.token;
  if(!key)throw Error(model?'请先填写模型密钥':'请先填写内测凭据');
  const result=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!result.ok){const error=await result.json();throw Error(error.error||`模型接口返回错误（状态码 ${result.status}），请检查接口设置。`);}return raw?result.arrayBuffer():result.json();
}
function readSettings(){for(const field of ['mode','endpoint','model'])$(field).value=config[field]||defaults[field];$('settings').showModal();}
$('settings-open').onclick=readSettings;
$('settings-save').onclick=()=>{
  try{
    const value=Object.fromEntries(['mode','endpoint','model','key','token'].map(k=>[k,$(k).value.trim()]));
    if(new URL(value.endpoint).protocol!=='https:')throw Error('接口地址须使用加密连接。');
    if(native){const result=JSON.parse(native.saveSettings(JSON.stringify(value)));if(result.error)throw Error(result.error);config=JSON.parse(native.getSettings());}
    else{for(const k of ['key','token'])if(!value[k])value[k]=config[k]||'';config=value;sessionStorage.setItem('model-settings',JSON.stringify(value));}
    $('key').value=$('token').value='';$('settings').close();$('remote-section').hidden=config.mode==='byok';library.settingsChanged();status('接口设置已保存。');
  }catch(e){$('settings-status').textContent=e.message;}
};
function showImport(book){
  if(!book||!Array.isArray(book.chapters)||!book.chapters.length)throw Error('文件中没有可读取的章节正文。');
  imported=book;$('book-title').value=book.title||'导入小说';
  $('excerpt').value=book.chapters[0].paragraphs.join('\n');$('excerpt').readOnly=book.chapters.length>1;
  $('import-note').textContent=book.chapters.length>1?`已载入 ${book.chapters.length} 章，下方为首章预览；首批地图生成后自动显示，其余继续处理。`:'截图在本机识别；确认分析后才会上传正文。';
}
function textBook(){
  if(imported&&imported.chapters.length>1)return {...imported,title:$('book-title').value.trim()||imported.title};
  const paragraphs=$('excerpt').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!paragraphs.length)throw Error('请先导入或填写正文。');
  return {title:$('book-title').value.trim()||'未命名片段',chapters:[{index:1,title:'当前片段',paragraphs}]};
}
$('clear').onclick=()=>{imported=null;$('excerpt').readOnly=false;$('excerpt').value='';$('import-note').textContent='截图在本机识别；确认分析后才会上传正文。';};
$('import').onclick=()=>native?native.pickDocument():$('file').click();
$('file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;const text=await file.text();showImport(file.name.endsWith('.json')?JSON.parse(text):{title:file.name.replace(/\.[^.]+$/,''),chapters:[{index:1,title:'导入文字',paragraphs:text.split(/\r?\n/).filter(x=>x.trim())}]});}catch(e){status(e.message,true);}};
$('image').onclick=()=>native?native.pickImage():status('截图识字仅在安卓应用中可用。');
$('capture').onclick=()=>native?native.startCapture():status('悬浮截图仅在安卓应用中可用。');
$('stop-capture').onclick=()=>{if(native)native.stopCapture();status('悬浮截图已关闭。');};
$('return-reading').hidden=!native;$('return-reading').onclick=()=>native.returnToReading();
async function saveResult(input){
  validateStoryInput(input);
  if(!mapDataPromise)mapDataPromise=(async()=>{
    const [a,r,c]=await Promise.all([fetch('atlas.json'),fetch('strategic-regions.json'),fetch('map-compatibility.json')]);
    if(!a.ok||!r.ok||!c.ok)throw Error('底图资料读取失败，请检查本地资料文件。');
    const [atlasBytes,regionBytes,catalog]=await Promise.all([a.arrayBuffer(),r.arrayBuffer(),c.json()]);
    const [atlasRevision,baseMapRevision]=await Promise.all([sha256(atlasBytes),sha256(regionBytes)]);
    const version=resolveMapVersion({baseMapId:'jianan-219',baseMapRevision,atlasRevision,sceneSchemaVersion:1},catalog);
    return [JSON.parse(new TextDecoder().decode(atlasBytes)),JSON.parse(new TextDecoder().decode(regionBytes)),version.baseMapRevision];
  })();
  const pack=compileStory(input,...await mapDataPromise);
  if(input.position)pack.coverage+=` 已整理至第 ${input.position[0]} 章第 ${input.position[1]} 段。`;
  await saveStory(pack);await showStories();return pack.id;
}
async function refresh(){
  try{
    const jobs=await request('jobs');$('jobs').replaceChildren();
    const labels={queued:'等待处理',running:'处理中',failed:'已中断',completed:'全部处理完成',partial:'部分已完成'};
    for(const job of jobs){
      const card=document.createElement('article');card.className='book-card';const title=document.createElement('strong');title.textContent=job.title;
      const note=document.createElement('p');note.textContent=`${labels[job.status]||'处理中'} · ${job.completed} / ${job.total} 章`+(job.error?' · '+job.error:'');
      const progress=document.createElement('progress');progress.max=job.total;progress.value=job.completed;card.append(title,note,progress);
      const download=button('查看并载入地图',async()=>{if(busy)return;busy=true;download.disabled=true;try{await watch(job.id);}catch(e){status(e.message,true);}finally{busy=false;download.disabled=false;}});
      card.append(download);$('jobs').append(card);
    }
  }catch(e){status(e.message,true);}
}
$('refresh').onclick=refresh;
async function showStories(){
  $('stories').replaceChildren();for(const pack of await readStories()){
    const card=document.createElement('article');card.className='book-card';const title=document.createElement('strong');title.textContent=pack.title;
    const p=document.createElement('p');p.textContent=pack.coverage;const link=document.createElement('a');link.className='button';link.textContent='打开地图';link.href='index.html?story='+encodeURIComponent(pack.id);card.append(title,p,link);$('stories').append(card);
  }
}
async function watch(id){
  let saved=await checkpoint('hosted-'+id),after=saved?.availableBlocks||0,facts=saved?.facts||[],opened=false;
  while(true){
    const state=await request(`jobs/${id}`);
    if((state.availableBlocks||0)>after||(!after&&state.completed)){
      const result=await request(`jobs/${id}/result?after=${after}`);
      if(result.after!==after)throw Error('剧情进度校验失败，请重新打开地图。');
      facts.push(...result.facts);after=result.availableBlocks;
      await checkpoint('hosted-'+id,{availableBlocks:after,facts});
      await saveResult({...result,facts});
      if(!opened){await openMap(id,state.total===1);opened=true;}else $('reload-map').hidden=false;
    }else if(!opened&&after){await openMap(id,state.total===1);opened=true;}
    if(state.status==='failed')throw Error(state.error||'分析中断；已完成的地图保留。');
    status(state.status==='completed'?'分析完成，地图已保存在本机。':`分析中：已确认 ${state.completed} / ${state.total} 章；已生成的地图可继续阅读。`);
    if(state.status==='completed')break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}
async function direct(book){
  const cfg=await(await fetch('analysis-config.json')).json();
  const identity=JSON.stringify({book,protocol:cfg.protocol,model:config.model,endpoint:config.endpoint});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const id='local-'+digest.slice(0,24),blocks=makeBlocks(book),saved=await checkpoint(id);
  const results=saved?.blocks||{},facts=[];let next=0,temporal='current',frame='',opened=false,write=Promise.resolve(),publicationError=null,modelCalls=0;
  async function publish(){
    let changed=false;
    while(results[next]){
      if(needsTimelineReview(results[next],temporal,cfg.timelineProtocol)){
        status('正在核对叙事时间，已完成部分可继续查看。');
        modelCalls++;
        const response=await request('model',timelineBody(blocks[next],temporal,cfg,config.model,frame)),choice=response.choices[0];
        if(choice.finish_reason!=='stop')throw Error('叙事时间复核未完成；已有结果保留');
        results[next]=applyTimeline(results[next],JSON.parse(choice.message.content),blocks[next].chapters,cfg.timelineProtocol,temporal);
        await checkpoint(id,{blocks:results});
      }
      for(const [c,p,t] of results[next].transitions||[])frame=t==='memory'?frameContext(book,c,p):'';
      const resolved=resolveResult(results[next],temporal);facts.push(...resolved.facts);temporal=resolved.temporal;next++;changed=true;
    }
    if(changed){
      const last=blocks[next-1];
      await saveResult({id,title:book.title,completed:last.completed,total:book.chapters.length,facts,position:last.position});
      if(!opened){await openMap(id,book.chapters.length===1);opened=true;}else $('reload-map').hidden=false;
    }
    status(`本机直连：分析进度：${Object.keys(results).length} / ${blocks.length} 批，按顺序确认 ${next} 批；请保持本页打开，地图见上方。`);
  }
  await publish();
  const missing=blocks.map((_,i)=>i).filter(i=>!results[i]);let failed=null;
  for(let offset=0;offset<missing.length;offset+=2){
    const settled=await Promise.allSettled(missing.slice(offset,offset+2).map(async i=>{
      modelCalls++;
      const response=await request('model',requestBody(blocks[i],book,cfg,config.model)),choice=response.choices[0];
      if(choice.finish_reason!=='stop')throw Error('模型输出未完整结束；已完成的地图保留');
      const result=expandResult(JSON.parse(choice.message.content),blocks[i].chapters);
      // Serialize IndexedDB writes and publication; request completion order never advances the timeline.
      write=write.then(async()=>{
        results[i]=result;await checkpoint(id,{blocks:results});
        // A failed review stops publication; still persist other already-paid responses.
        if(!publicationError)try{await publish();}catch(error){publicationError=error;}
      });
      await write;
      if(publicationError)throw publicationError;
    }));
    failed=settled.find(x=>x.status==='rejected');if(failed)break;
  }
  if(failed)throw failed.reason;
  status(modelCalls?'分析完成，地图已保存在本机。':'已复用本机结果，本次未调用模型。');
}
$('analyze').onclick=async()=>{
  if(busy)return;busy=true;$('analyze').disabled=true;
  try{const book=textBook();if(config.mode==='byok')await direct(book);else{status('正在提交小说文字…');const result=await request('create',book);status('已提交；首批完成后自动显示地图。');await watch(result.id);await refresh();}}
  catch(e){status(e.message,true);}finally{busy=false;$('analyze').disabled=false;}
};
$('updates').onclick=()=>{if(native?.checkUpdates)native.checkUpdates();else $('update-status').textContent='安装包更新可在安卓应用内检查；网页版使用当前本地版本。';};
$('remote-section').hidden=config.mode==='byok';
const library=initLibrary({request,getMode:()=>config.mode,openMap,showStories,notify:status});
showStories().catch(e=>{console.error(e);status('本地剧情读取失败，请重新打开工具页。',true);});
if(new URLSearchParams(location.search).has('import'))fetch('/private/import.json').then(r=>{if(!r.ok)throw Error('待导入的文件不存在');return r.json();}).then(showImport).catch(e=>status(e.message,true));
