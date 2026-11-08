import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256,verifyLayer} from '../web/scene/layer.mjs';
import {resolveMapVersion,assertPackCompatible} from '../web/scene/map-version.mjs';
const catalog=JSON.parse(readFileSync(new URL('../web/map-compatibility.json',import.meta.url)));

test('only reviewed data pairs share the deployed protocol identity',async()=>{
  for(const pair of catalog.pairs)assert.deepEqual(resolveMapVersion({...catalog.canonical,...pair},catalog),catalog.canonical);
  const revisions=await Promise.all(['strategic-regions.json','atlas.json'].map(file=>sha256(readFileSync(new URL('../web/'+file,import.meta.url)))));
  assert.deepEqual(resolveMapVersion({...catalog.canonical,baseMapRevision:revisions[0],atlasRevision:revisions[1]},catalog),catalog.canonical);
  assert.throws(()=>resolveMapVersion({...catalog.canonical,atlasRevision:'unknown'},catalog),/尚未登记/);
  assert.throws(()=>resolveMapVersion({...catalog.canonical,baseMapId:'other'},catalog));
});

test('legacy and reviewed local packs load without rewriting content; integrity checks remain',async()=>{
  for(const pair of catalog.pairs){
    const pack={id:'test',version:1,baseMap:{id:'jianan-219',revision:pair.baseMapRevision},readingPositions:[{chapter:1,paragraph:77}]};
    const before=JSON.stringify(pack);
    assert.doesNotThrow(()=>assertPackCompatible(pack,catalog.canonical,catalog));
    assert.equal(JSON.stringify(pack),before);
  }
  const pack={id:'test',version:1,baseMap:{id:'jianan-219',revision:catalog.canonical.baseMapRevision},readingPositions:[]};
  assert.throws(()=>assertPackCompatible({...pack,baseMap:{...pack.baseMap,revision:'unknown'}},catalog.canonical,catalog),/已有地图已保留/);
  assert.throws(()=>assertPackCompatible({...pack,baseMap:{...pack.baseMap,id:'other'}},catalog.canonical,catalog));
  assert.throws(()=>assertPackCompatible({...pack,version:2},catalog.canonical,catalog));
  const bytes=new TextEncoder().encode(JSON.stringify(pack));
  const manifest={...catalog.canonical,storyId:pack.id,bytes:bytes.length,sha256:await sha256(bytes)};
  assert.deepEqual(await verifyLayer(bytes,manifest,catalog.canonical),pack);
  const broken=bytes.slice();broken[broken.length-1]=32;
  await assert.rejects(verifyLayer(broken,manifest,catalog.canonical),/校验失败/);
});
