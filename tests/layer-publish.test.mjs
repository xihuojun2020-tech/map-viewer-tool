import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compileLayer} from '../scripts/compile_layer.mjs';
import {compileStory} from '../web/scene/compile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('server entry point uses the exact client compiler and base revision',()=>{
  const input={id:'test',title:'编译验证',completed:1,total:1,facts:[]};
  const regions=readFileSync(new URL('../web/strategic-regions.json',import.meta.url));
  const atlas=JSON.parse(readFileSync(new URL('../web/atlas.json',import.meta.url)));
  assert.deepEqual(compileLayer(input,root),compileStory(input,atlas,JSON.parse(regions),createHash('sha256').update(regions).digest('hex')));
  assert.match(compileLayer({...input,local:true},root).coverage,/局部情势/);
});
