import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBlocks,expandResult,resolveResult,applyTimeline,needsTimelineReview} from '../web/scene/extract.mjs';
test('短协议保留跨段否定、原段号、长倒叙继承和未定时间',()=>{
  const chapters=[{index:970,paragraphStart:30,paragraphs:['江陵……','丢了！']}];
  const raw={v:2,endTemporal:'memory',facts:[{refs:[[970,30],[970,31]],kind:'control',status:'negated',temporal:'inherit',summary:'江陵失守',faction:'刘表',place:'江陵',scope:'city'}]};
  const result=expandResult(raw,chapters),resolved=resolveResult(result,'memory');
  assert.equal(resolved.facts[0].temporal,'memory');assert.equal(resolved.facts[0].paragraph,31);
  assert.deepEqual(resolved.facts[0].evidenceTexts,['江陵……','丢了！']);assert.equal(resolved.facts[0].status,'negated');
  assert.match(resolveResult(result,'unknown').facts[0].reviewNote,/待确认/);
  assert.throws(()=>expandResult({...raw,facts:[{...raw.facts[0],refs:[[970,29]]}]},chapters),/不存在/);
  assert.match(expandResult({...raw,facts:[{...raw.facts[0],refs:[[970,30],[49,50]]}]},chapters).facts[0].reviewNote,/暂不用于地图/);
  const review=expandResult({...raw,facts:[{...raw.facts[0],kind:'reported'}]},chapters).facts[0];assert.equal(review.originalKind,'reported');assert.match(review.reviewNote,/暂不用于地图/);
  const premature={...result,endTemporal:'current',facts:[{...result.facts[0],paragraph:30,temporalMode:'current'}]};
  assert.equal(needsTimelineReview(premature,'memory','test'),true);
  const reviewed=applyTimeline(premature,{transitions:[[970,30,'memory'],[970,31,'current']]},chapters,'test','memory');
  assert.equal(reviewed.transitions.length,1);
  assert.equal(needsTimelineReview(reviewed,'current','next-version'),true);
  assert.equal(resolveResult(reviewed,'memory').facts[0].temporal,'memory');
  assert.equal(resolveResult(reviewed,'memory').temporal,'current');
});
test('分块拥有明确段落范围，前置正文不重复提取',()=>{
  const book={title:'测试',chapters:[{index:1,title:'第一章',paragraphs:['甲'.repeat(3000),'乙'.repeat(3000)]},{index:2,title:'第二章',paragraphs:['丙']}]};
  const blocks=makeBlocks(book);assert.equal(blocks.length,2);assert.equal(blocks[0].completed,0);
  assert.equal(blocks[1].chapters[0].paragraphStart,2);assert.equal(blocks[1].completed,2);assert.equal(blocks[1].context.length,1200);
});
