import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {compileStory,validateStoryInput} from '../web/scene/compile.mjs';

export function compileLayer(input,root){
  const atlas=readFileSync(resolve(root,'web/atlas.json')),regions=readFileSync(resolve(root,'web/strategic-regions.json'));
  const pack=compileStory(validateStoryInput(input),JSON.parse(atlas),JSON.parse(regions),createHash('sha256').update(regions).digest('hex'));
  const ids=new Set(JSON.parse(regions).features.map(f=>f.properties.id));
  if(pack.controls.some(c=>c.regionIds.some(id=>!ids.has(id))))throw Error('剧情包引用了不存在的行政区域');
  if(input.local)pack.coverage=`局部情势：仅分析第 ${input.localChapter??input.completed} 章截至所选位置的文字，未分析此前全部章节。`+pack.coverage.slice(pack.coverage.indexOf('色块'));
  return pack;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output,root]=process.argv.slice(2);
  writeFileSync(output,JSON.stringify(compileLayer(JSON.parse(readFileSync(input)),root)));
}
