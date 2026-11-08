// Compact model protocol shared with the server; geometry stays in compile.mjs.
import {validateStoryInput} from './compile.mjs';
export const temporalModes=['inherit','current','memory','unknown'];
export function needsTimelineReview(result,inherited,revision){
  if(result.timelineProtocol)return result.timelineProtocol!==revision;
  return (['memory','current'].includes(result.endTemporal)&&result.endTemporal!==inherited)||(inherited==='memory'&&result.facts.some(f=>f.temporalMode==='current'));
}
export function applyTimeline(result,value,chapters,revision,inherited='current'){
  const source=new Set(chapters.flatMap(c=>c.paragraphs.map((_,i)=>`${c.index}:${i+(c.paragraphStart||1)}`)));
  if(!Array.isArray(value?.transitions))throw Error('时间边界复核格式无效');
  let previous=[0,0];
  for(const r of value.transitions){
    if(!Array.isArray(r)||r.length!==3||!r.slice(0,2).every(Number.isInteger)||!source.has(r.slice(0,2).join(':'))||r[0]<previous[0]||(r[0]===previous[0]&&r[1]<=previous[1])||!['current','memory','unknown'].includes(r[2]))throw Error('时间边界引用无效');
    previous=r;
  }
  let mode=inherited;const transitions=value.transitions.filter(r=>{if(r[2]===mode)return false;mode=r[2];return true;});
  return {...result,transitions,timelineProtocol:revision};
}
export function frameContext(book,chapter,paragraph){
  const before=book.chapters.flatMap(c=>c.paragraphs.filter((_,i)=>c.index<chapter||(c.index===chapter&&i+1<paragraph))).join('\n').slice(-2400);
  return before+'\n【倒叙起点】'+book.chapters[chapter-1].paragraphs[paragraph-1];
}
export function timelineBody(block,inherited,cfg,model,frame=''){
  const request=requestBody(block,{title:'叙事时间核验'},cfg,model);request.messages[0].content=cfg.timelineSystem;
  const content=JSON.parse(request.messages[1].content);content.inherited=inherited;content.frame_origin=frame;request.messages[1].content=JSON.stringify(content);request.max_tokens=4000;request.thinking={type:'enabled'};return request;
}
export function expandResult(result,chapters){
  if(result?.v!==2||!Array.isArray(result.facts)||result.facts.length>40||!temporalModes.includes(result.endTemporal))throw Error('模型紧凑协议无效');
  if(result.overflow)throw Error('本块事件超过上限，请缩小正文范围，已完成结果保留');
  const source=new Map(chapters.flatMap(c=>c.paragraphs.map((text,i)=>[`${c.index}:${i+(c.paragraphStart||1)}`,text])));
  const fields=Object.fromEntries(['actor','faction','leader','place','from','scope','unit','unitType'].map(name=>[name,name]));
  const facts=result.facts.map(f=>{
    if(!Array.isArray(f?.refs)||!f.refs.length||f.refs.length>40||f.refs.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isInteger)))throw Error('模型引用的章节段落不存在');
    const validRefs=f.refs.filter(r=>source.has(r.join(':')));if(!validRefs.length)throw Error('模型引用的章节段落不存在');
    if(!temporalModes.includes(f.temporal)||typeof f.summary!=='string'||!f.summary)throw Error('模型时间或说明无效');
    const [chapter,paragraph]=[...validRefs].sort((a,b)=>a[0]-b[0]||a[1]-b[1]).at(-1);
    const fact={...Object.fromEntries(Object.entries(fields).map(([key,name])=>[name,f[key]??''])),chapter,paragraph,
      quote:source.get(`${chapter}:${paragraph}`),references:f.refs,evidenceTexts:validRefs.map(r=>source.get(r.join(':'))),
      kind:f.kind,status:f.status,temporal:'current',temporalMode:f.temporal,summary:f.summary,strength:f.strength??null};
    if(f.reviewNote){if(typeof f.reviewNote!=='string')throw Error('待核说明无效');fact.reviewNote=f.reviewNote;}
    if(validRefs.length!==f.refs.length)fact.reviewNote='部分原文引用无法定位，此记录待复核，暂不用于地图状态。'+(fact.reviewNote||'');
    if(fact.kind==='reported'){fact.originalKind=fact.kind;fact.kind='context';fact.reviewNote='模型把转述状态写入事件类型；保留原文供复核，暂不用于地图状态。'+(fact.reviewNote||'');}
    return fact;
  });
  validateStoryInput({title:'校验',completed:0,total:1,facts});return {facts,endTemporal:result.endTemporal};
}
export function resolveResult(result,inherited='current'){
  const facts=result.facts.map(original=>{
    const f={...original};let mode=f.temporalMode==='inherit'?inherited:(f.temporalMode||f.temporal);delete f.temporalMode;
    if(result.timelineProtocol){
      let frame=inherited;for(const [c,p,t] of result.transitions)if(c<f.chapter||(c===f.chapter&&p<=f.paragraph))frame=t;
      const originalMode=original.temporalMode||original.temporal;
      mode=[originalMode,frame].includes('unknown')?'unknown':[originalMode,frame].includes('memory')?'memory':'current';
    }
    f.temporal=mode==='memory'?'memory':'current';
    if(mode==='unknown')f.reviewNote='叙事时间待确认，暂不改变地图。'+(f.reviewNote||'');
    return f;
  });
  const end=result.timelineProtocol?(result.transitions.at(-1)?.[2]||inherited):result.endTemporal;
  return {facts,temporal:end==='inherit'?inherited:end};
}
export function makeBlocks(book,maxChars=4500){
  const blocks=[];let chapters=[],context='',size=0;
  function flush(){
    if(!chapters.length)return;
    const last=chapters.at(-1),end=last.paragraphStart+last.paragraphs.length-1;
    blocks.push({chapters,context,completed:end===book.chapters[last.index-1].paragraphs.length?last.index:last.index-1,position:[last.index,end]});
    context=(context+'\n'+chapters.flatMap(c=>c.paragraphs).join('\n')).slice(-1200);chapters=[];size=0;
  }
  for(const chapter of book.chapters)chapter.paragraphs.forEach((p,i)=>{
    if(size&&size+p.length>maxChars)flush();
    if(!chapters.length||chapters.at(-1).index!==chapter.index)chapters.push({index:chapter.index,title:chapter.title,paragraphStart:i+1,paragraphs:[]});
    chapters.at(-1).paragraphs.push(p);size+=p.length;
  });
  flush();return blocks;
}
export function requestBody(block,book,cfg,model){
  return {model,temperature:0,max_tokens:6500,thinking:{type:'disabled'},response_format:{type:'json_object'},messages:[
    {role:'system',content:cfg.system},{role:'user',content:JSON.stringify({title:book.title,preceding_text:block.context,
      chapters:block.chapters.map(c=>({index:c.index,title:c.title,paragraphs:c.paragraphs.map((text,i)=>({number:i+c.paragraphStart,text}))}))})}]};
}
