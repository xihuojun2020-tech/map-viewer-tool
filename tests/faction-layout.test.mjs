import test from 'node:test';
import assert from 'node:assert/strict';
import {insidePolygon,visibleSamples,placeFactionLabel,boxInsidePolygon} from '../web/faction-layout.mjs';
const viewport={left:0,top:0,right:400,bottom:300};

test('内嵌名称不能跨越凹口或把其他势力小块盖在文字中间',()=>{
  const ring=[[0,0],[60,0],[60,150],[80,150],[80,0],[200,0],[200,200],[0,200],[0,0]];
  const box={left:20,top:20,right:180,bottom:180};
  assert.ok([[20,20],[180,20],[20,180],[180,180],[100,100]].every(p=>insidePolygon(p,[ring])));
  assert.equal(boxInsidePolygon(box,[ring]),false);
  assert.equal(boxInsidePolygon({left:90,top:20,right:180,bottom:180},[ring]),true);
});
test('屏内候选避开孔洞，原中心在屏外时仍可定位',()=>{
  const rings=[[[-200,10],[380,10],[380,290],[-200,290],[-200,10]],[[100,80],[250,80],[250,220],[100,220],[100,80]]];
  const samples=visibleSamples(rings,viewport);
  assert.ok(samples.points.length);assert.ok(samples.points.every(p=>insidePolygon(p,rings)));
  const layout=placeFactionLabel({rings,samples:samples.points,preferred:[-100,150],width:70,height:35,viewport,occupied:[]});
  assert.ok(layout);assert.ok(insidePolygon(layout.anchor,rings));assert.ok(layout.box.left>=0);
});
test('狭小领土用外引名牌，指向点始终在本势力内并避让活动标牌',()=>{
  const rings=[[[190,30],[210,30],[210,270],[190,270],[190,30]]];
  const occupied=[{left:130,right:280,top:110,bottom:210}];
  const layout=placeFactionLabel({rings,samples:visibleSamples(rings,viewport).points,preferred:[200,150],width:90,height:40,viewport,occupied});
  assert.ok(layout.callout);assert.ok(insidePolygon(layout.anchor,rings));
  assert.ok(occupied.every(r=>layout.box.right<=r.left||layout.box.left>=r.right||layout.box.bottom<=r.top||layout.box.top>=r.bottom));
});
