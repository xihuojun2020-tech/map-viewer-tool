const {openTimeline,openSearch,openLayers,closeDetails}=require('./map-ui.cjs');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.isStyleLoaded());
  await openTimeline(page);await page.locator('#time-scale').selectOption('year');
  assert.equal(await page.locator('#political-button').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayoutProperty('political-fill','visibility')),'visible');
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayer('political-cell-lines')),undefined,'不再叠加概略区块实线');
  assert.equal(await page.evaluate(()=>window.atlas.map.getPaintProperty('political-fill','fill-antialias')),false,'填充本身不再生成同势力区块边缘描线');
  assert.ok(await page.evaluate(()=>new Set(window.atlas.territory.records.map(x=>x.owner)).size)>10);
  assert.equal(await page.locator('#administrative-era').count(),0);
  assert.match(await page.locator('#world-label').innerText(),/建安郡国研究（219年）/);
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayer('han-provinces')),undefined);
  assert.equal(await page.evaluate(()=>window.atlas.map.getSource('han-administration')),undefined);
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayoutProperty('commanderies-line','visibility')),'visible');
  await openLayers(page);await page.locator('#political-button').click();await page.locator('#close-layers').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.province-label')].filter(n=>getComputedStyle(n).display!=='none').length===13);
  const labels=await page.evaluate(()=>[...document.querySelectorAll('.province-label')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.textContent));
  assert.equal(labels.length,13,'建安参考图全国显示十三州名');
  assert.equal(await page.locator('.faction-label:visible').count(),0);
  await openLayers(page);await page.locator('#political-button').click();await page.locator('#close-layers').click();
  assert.equal(await page.locator('.faction-label[data-faction="cao"]:visible').first().innerText(),'曹');
  assert.equal(await page.locator('.faction-label[data-faction="liu"]:visible').first().innerText(),'刘备');
  assert.equal(await page.locator('.faction-label[data-faction="yuan"]:visible').first().innerText(),'袁绍');
  assert.equal(await page.locator('.faction-label[data-faction="shu-yuan"]:visible').first().innerText(),'袁术');
  const hierarchy=await page.evaluate(()=>{
    const f=getComputedStyle(document.querySelector('.faction-label')),p=getComputedStyle(document.querySelector('.province-label'));
    return {faction:parseFloat(f.fontSize),province:parseFloat(p.fontSize),differentColor:f.color!==p.color};
  });
  assert.ok(hierarchy.faction>hierarchy.province);assert.ok(hierarchy.differentColor);
  await page.screenshot({path:'output/political-national.png',fullPage:true});
  await openTimeline(page);await page.locator('#year-input').fill('196');await openTimeline(page);await page.locator('#year-input').press('Tab');
  const owners=await page.evaluate(()=>Object.fromEntries(window.atlas.strategicRegions.features.filter(f=>f.properties.place_id).map(f=>[f.properties.place_id,window.atlas.territory.records.find(r=>r.id===f.properties.id).owner])));
  assert.equal(owners.xiaopei,'liu');assert.equal(owners.xiapi,'lu');
  await page.evaluate(()=>window.atlas.map.jumpTo({center:[117.5,34.35],zoom:6.8}));
  await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
  // Click within the filled parcel away from the city button to exercise the
  // actual map feature hit, not a direct call into the sidebar renderer.
  const point=await page.evaluate(()=>{
   const f=window.atlas.strategicRegions.features.find(f=>f.properties.place_id==='xiaopei');
   const map=window.atlas.map,b=map.getContainer().getBoundingClientRect();
   const coordinates=f.geometry.coordinates.flat(f.geometry.type==='MultiPolygon'?2:1).map(p=>map.project(p));
   const west=Math.max(0,Math.min(...coordinates.map(p=>p.x))),east=Math.min(b.width,Math.max(...coordinates.map(p=>p.x)));
   const north=Math.max(0,Math.min(...coordinates.map(p=>p.y))),south=Math.min(b.height,Math.max(...coordinates.map(p=>p.y)));
   for(let x=west+8;x<east;x+=12)for(let y=north+8;y<south;y+=12){
    const q={x,y};
    if(map.queryRenderedFeatures([q.x,q.y],{layers:['political-fill']}).some(x=>x.properties.id===f.properties.id)
      &&document.elementFromPoint(q.x+b.left,q.y+b.top).tagName==='CANVAS')return {x:q.x+b.left,y:q.y+b.top};
   }
   throw new Error('小沛显示区块内没有可点击位置');
  });
  await page.mouse.click(point.x,point.y);await page.getByRole('heading',{name:'小沛显示区块',exact:true}).waitFor();
  assert.match(await page.locator('#panel-content').innerText(),/刘备/);
  assert.match(await page.locator('#panel-content').textContent(),/不是历史县域/);
  await page.screenshot({path:'output/political-xiaopei.png',fullPage:true});
  await page.locator('.faction-label[data-faction="liu"]:visible').first().click();
  await page.getByRole('heading',{name:'刘备',exact:true}).waitFor();
  assert.match(await page.locator('#panel-content').innerText(),/当前有关联的军队与战事/);
  assert.match(await page.locator('#panel-content').innerText(),/截至当前的经历/);
  assert.doesNotMatch(await page.locator('#panel-content').innerText(),/undefined/);
  assert.match(await page.locator('#panel-content').innerText(),/小沛显示区块/);
  assert.doesNotMatch(await page.locator('#panel-content').innerText(),/下邳显示区块/);
  await openTimeline(page);await page.locator('#year-input').fill('200');await openTimeline(page);await page.locator('#year-input').press('Tab');
  assert.equal(await page.evaluate(()=>{const f=window.atlas.strategicRegions.features.find(f=>f.properties.place_id==='xiaopei');return window.atlas.territory.records.find(r=>r.id===f.properties.id).owner;}),'cao');
  assert.equal(await page.locator('.faction-label[data-faction="lu"]').count(),0,'失去全部已录控制区后清除名称');
  await openLayers(page);await page.locator('#political-button').click();assert.equal(await page.evaluate(()=>window.atlas.map.getLayoutProperty('political-fill','visibility')),'none');
  assert.equal(await page.locator('.faction-label:visible').count(),0);
  await openLayers(page);await page.locator('#political-button').click();
  await page.locator('#layers-button').click();await openLayers(page);await page.locator('#hydrology-button').click();await page.locator('#layers-button').click();
  await page.locator('#panel-content summary').click();assert.match(await page.locator('#panel-content').innerText(),/原图与争议说明/);
  await page.getByRole('button',{name:'在地图查看',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayoutProperty('research-water','visibility')),'visible');
  await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
  await page.screenshot({path:'output/historical-river-reference.png',fullPage:true});
  const latin=await page.evaluate(()=>document.body.innerText.split('\n').filter(t=>/[A-Za-z]/.test(t)));assert.deepEqual(latin,[]);
  await page.setViewportSize({width:390,height:844});await closeDetails(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await openTimeline(page);await page.locator('#year-input').fill('196');await openTimeline(page);await page.locator('#year-input').press('Tab');
  await page.evaluate(()=>window.atlas.map.jumpTo({center:[117.6,34.0],zoom:5.7}));
  await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
  assert.equal(await page.locator('.faction-label[data-faction="liu"]:visible').first().innerText(),'刘备');
  await page.screenshot({path:'output/political-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const result={checks:['固定建安郡国研究底图，移除东汉十三州图层与切换入口','取消重复区块描边，保留行政参考线','势力简称、主角全名、袁绍袁术区分','势力名称字号和颜色高于州名','默认区域填色与多势力颜色','建安行政视图十三州名','小沛与下邳不同归属','点击势力名称只列当前控制区块','真实点击色块查询出处','改年后区域归属更新','显式开关填色和势力名','有争议河道主动开启','中文内容与手机布局'],page_errors:errors};
  fs.writeFileSync('output/political-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
