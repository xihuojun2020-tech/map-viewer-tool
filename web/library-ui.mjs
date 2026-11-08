import {installLayer,checkpoint} from './scene/store.mjs';
import {sha256} from './scene/layer.mjs';
import {resolveMapVersion} from './scene/map-version.mjs';

export function initLibrary({request,getMode,openMap,showStories,notify}){
  const $=id=>document.getElementById(id);
  let selected=null,directory=null,available=null,versionsPromise=null,watching=null,visibleLayer=null,activeTarget=null,sequence=0;
  const labels={queued:'等待处理',fetching:'正在获取正文',analyzing:'正在分析情节',publishing:'正在生成地图',completed:'已完成',failed:'已中断',cancelled:'已取消'};
  function note(text,error=false){$('library-status').textContent=text;$('library-status').classList.toggle('error',error);}
  async function versions(){
    if(!versionsPromise)versionsPromise=Promise.all(['strategic-regions.json','atlas.json','map-compatibility.json'].map(async file=>{
      const r=await fetch(file);if(!r.ok)throw Error('本机地图资料读取失败，请检查本地资料文件。');return file==='map-compatibility.json'?r.json():sha256(await r.arrayBuffer());
    })).then(([baseMapRevision,atlasRevision,catalog])=>resolveMapVersion({baseMapId:'jianan-219',baseMapRevision,atlasRevision,sceneSchemaVersion:1},catalog));
    return versionsPromise;
  }
  async function payload(){
    if(!selected||!directory)throw Error('请先选择书籍和阅读章节。');
    const value=$('library-paragraph').value.trim(),paragraph=value?Number(value):null;
    if(paragraph!==null&&(!Number.isInteger(paragraph)||paragraph<1))throw Error('段落须为正整数；留空即章末。');
    return {bookKey:selected.bookKey,mode:$('library-mode').value,target:{chapterId:$('library-chapter').value,paragraph},...await versions()};
  }
  function coverage(value){return value?`第 ${value.chapter} 章${value.chapterComplete?'章末':`第 ${value.paragraph} 段`}`:'暂无地图';}
  function actions(){
    $('library-generate').disabled=!selected||getMode()==='byok';
    $('library-generate').textContent=available?.status==='processing'?'加入现有请求':'生成所选范围的地图';
    $('library-download').disabled=!available?.layerId;
    $('library-channel-note').textContent=getMode()==='byok'?'当前为自带接口：可搜索书目、下载已有公共地图；新建地图请使用下方“导入与截图”直接分析。':'搜索与选章不调用模型；生成后才分析所选范围。底图仅覆盖汉末三国地理。';
  }
  async function perform(button,fn){button.disabled=true;try{await fn();}catch(e){note(e.message,true);}finally{button.disabled=false;actions();}}
  function fillDirectory(value){
    directory=value;const keep=$('library-chapter').value;$('library-chapter').replaceChildren();
    for(const row of value.chapters){const option=document.createElement('option');option.value=row.id;option.textContent=row.title;$('library-chapter').append(option);}
    if(value.chapters.some(c=>c.id===keep))$('library-chapter').value=keep;
    $('library-checked').textContent='目录核对时间：'+new Date(value.checked*1000).toLocaleString('zh-CN');
  }
  async function inspect(){
    const serial=++sequence,body=await payload();
    const query=new URLSearchParams({...body,...body.target});query.delete('target');query.delete('bookKey');if(body.target.paragraph===null)query.delete('paragraph');
    const result=await request(`library/books/${body.bookKey}/availability?${query}`);
    if(serial!==sequence)return;
    available=result;note(result.status==='ready'?`已有地图覆盖到${coverage(result.coveredThrough)}，可直接下载；本次未调用模型。`:result.status==='partial'?`已有地图覆盖到${coverage(result.coveredThrough)}，可先查看；其余范围需继续生成。`:result.status==='processing'?'已有相同来源的生成任务；加入后共用结果。':'所选范围未生成；可选择累计局势或当前章局部地图。');actions();
  }
  async function choose(book){
    selected=book;available=null;directory=null;$('library-range').hidden=false;$('library-selected').textContent=book.title+' · '+book.author;actions();
    note('正在读取目录…');fillDirectory(await request(`library/books/${book.bookKey}/directory`));await inspect();
  }
  async function search(remote=false){
    const query=$('library-query').value.trim();if(!query)throw Error('请输入书名或作者。');note('正在查找书籍…');
    const result=await request('library/search?'+new URLSearchParams({q:query,...(remote?{remote:'1'}:{})}));$('library-results').replaceChildren();
    for(const book of result.books){
      const card=document.createElement('article');card.className='book-card';const title=document.createElement('strong');title.textContent=book.title;
      const detail=document.createElement('p');detail.textContent=`作者：${book.author} · 来源：${book.source}${book.chapters?` · ${book.chapters} 章`:''} · ${coverage(book.coveredThrough)}`;
      const aliases=document.createElement('p');aliases.textContent=book.aliases.filter(n=>n!==book.title).map(n=>'又名：'+n).join('；');
      const select=document.createElement('button');select.textContent='选择这本书';select.onclick=()=>perform(select,()=>choose(book));card.append(title,detail,aliases,select);$('library-results').append(card);
    }
    note(result.books.length?'同名作品可能有多版本，请核对作者后选择。':'未找到书籍；可尝试其他书名或作者名。');
  }
  async function download(layerId,target=null){
    note('正在下载并校验地图…');
    const manifest=await request(`layers/${layerId}/manifest`),bytes=await request(`layers/${layerId}/download`,null,true);
    const id=await installLayer(bytes,manifest,await versions(),target);await showStories();await openMap(id);visibleLayer=layerId;
    note('地图已保存，可离线查看；默认停在所选阅读位置。');return id;
  }
  function progress(state){
    $('library-progress').hidden=false;$('library-cancel').disabled=['completed','failed','cancelled'].includes(state.stage);
    const fetched=state.mode==='local'?(state.fetched?'当前章正文已获取':'等待获取当前章正文'):`正文已获取至第 ${state.fetched||0} 章`;
    $('library-progress-text').textContent=`${labels[state.stage]||'处理中'} · ${fetched} · 分析进度：${state.extractedBlocks||0} / ${state.totalBlocks||0} 批 · 地图可查看至${coverage(state.coveredThrough)}`+(state.error?'；'+state.error:'');
    $('library-progress-bar').max=state.mode==='local'?1:Math.max(1,state.target.chapter);$('library-progress-bar').value=state.mode==='local'?(state.coveredThrough?1:0):state.coveredThrough?.chapter||0;
    if(state.layerId){available=state;actions();}
  }
  async function watch(rid,target){
    watching=rid;activeTarget=target;visibleLayer=null;
    await checkpoint('library-active',{requestId:rid,target});
    while(watching===rid){
      const state=await request(`library/requests/${rid}`);if(watching!==rid)return;progress(state);
      if(state.layerId&&state.layerId!==visibleLayer){
        if(!visibleLayer){await download(state.layerId,target);notify(state.stage==='completed'?'所选范围地图已加载。':'首份地图已就绪；后续内容继续处理。');}
        else{$('library-new-map').hidden=false;$('library-new-map').onclick=()=>perform($('library-new-map'),async()=>{await download(state.layerId);$('library-new-map').hidden=true;});notify('新增地图已就绪，可返回书库载入。');}
      }
      if(['completed','failed','cancelled'].includes(state.stage)){
        watching=null;await checkpoint('library-active',{requestId:null});
        note(state.stage==='completed'?'所选范围处理完成。':state.error||'已取消请求；已下载的地图保留。',state.stage==='failed');return;
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
  $('library-search').onclick=()=>perform($('library-search'),()=>search());
  $('library-remote').onclick=()=>perform($('library-remote'),()=>search(true));
  $('library-query').onkeydown=e=>{if(e.key==='Enter')$('library-search').click();};
  $('library-check').onclick=()=>perform($('library-check'),inspect);
  for(const id of ['library-chapter','library-paragraph','library-mode'])$(id).onchange=()=>{sequence++;available=null;actions();note('阅读位置已改变；请重新检查可用地图。');};
  $('library-refresh-directory').onclick=()=>perform($('library-refresh-directory'),async()=>{fillDirectory(await request(`library/books/${selected.bookKey}/directory?refresh=1`));await inspect();});
  $('library-refresh-chapter').onclick=()=>perform($('library-refresh-chapter'),async()=>{await request(`library/books/${selected.bookKey}/refresh-chapter`,{chapterId:$('library-chapter').value});await inspect();});
  $('library-download').onclick=()=>perform($('library-download'),async()=>{await download(available.layerId,(await payload()).target);});
  $('library-generate').onclick=()=>perform($('library-generate'),async()=>{
    if(getMode()==='byok')throw Error('自带接口模式不支持书库生成；请使用“导入与截图”直接分析。');
    if(watching)throw Error('已有请求正在显示进度；请先取消当前请求再切换。');
    const body=await payload(),state=await request('library/requests',body);progress(state);
    watch(state.requestId,body.target).catch(e=>{watching=null;note(e.message,true);});
  });
  $('library-cancel').onclick=()=>perform($('library-cancel'),async()=>{if(!watching)return;const rid=watching;await request(`library/requests/${rid}/cancel`,{});watching=null;await checkpoint('library-active',{requestId:null});note('已取消本次请求；已下载的地图保留。');});
  $('library-resume').onclick=()=>perform($('library-resume'),async()=>{
    const rows=await request('library/requests');$('library-request-list').replaceChildren();
    for(const state of rows){const card=document.createElement('article');card.className='book-card';const p=document.createElement('p');p.textContent=`${labels[state.stage]} · 至第 ${state.target.chapter} 章 · ${coverage(state.coveredThrough)}`;
      const btn=document.createElement('button');btn.textContent='查看进度与地图';btn.onclick=()=>perform(btn,async()=>{watching=null;await watch(state.requestId,state.target);});card.append(p,btn);$('library-request-list').append(card);}
    if(!rows.length)note('暂无书库生成请求。');
  });
  actions();
  checkpoint('library-active').then(saved=>{if(saved?.requestId&&getMode()==='hosted')return watch(saved.requestId,saved.target);}).catch(e=>{console.error(e);note('恢复进度失败，请重新打开工具页。',true);});
  return {settingsChanged:actions};
}
