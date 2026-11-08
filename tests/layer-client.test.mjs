import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLayer,sha256,locateBookmark,bookmarkAt} from '../web/scene/layer.mjs';
test('download integrity and source bookmarks prevent future events from appearing early',async()=>{
  const pack={id:'sample',version:1,baseMap:{revision:'r'},readingPositions:[{chapter:1,paragraph:3},{chapter:2,paragraph:2}]};
  const bytes=new TextEncoder().encode(JSON.stringify(pack));
  const versions={baseMapId:'jianan-219',baseMapRevision:'r',atlasRevision:'a',sceneSchemaVersion:1};
  const manifest={...versions,storyId:'sample',sha256:await sha256(bytes),bytes:bytes.length,chapterIds:['first','second'],startChapter:1};
  assert.deepEqual(await verifyLayer(bytes,manifest,versions),pack);
  await assert.rejects(verifyLayer(bytes,{...manifest,sha256:'broken'},versions),/校验失败/);
  await assert.rejects(verifyLayer(bytes,manifest,{...versions,atlasRevision:'other'}),/不兼容/);
  assert.equal(locateBookmark(pack,manifest,{chapterId:'first',paragraph:1}),-1);
  assert.equal(locateBookmark(pack,manifest,{chapterId:'first',paragraph:null}),0);
  assert.equal(locateBookmark(pack,manifest,{chapterId:'second',paragraph:null}),1);
  assert.deepEqual(bookmarkAt(pack,manifest,0),{chapterId:'first',paragraph:3});
  assert.throws(()=>locateBookmark(pack,manifest,{chapterId:'removed'}),/目录已变化/);
});
