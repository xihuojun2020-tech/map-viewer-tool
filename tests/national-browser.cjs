const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/');
  await page.waitForFunction(()=>window.atlas&&window.atlas.map.isStyleLoaded());
  assert.ok(await page.evaluate(()=>window.atlas.map.getZoom()<5));
  assert.equal(await page.evaluate(()=>window.atlas.data.national.commanderies.length),105);
  assert.equal(await page.evaluate(()=>window.atlas.data.national.frontier.length),21);
  assert.ok(await page.evaluate(()=>window.atlas.state.frame.features.length>=15));
  assert.deepEqual(await page.evaluate(()=>window.atlas.map.getPaintProperty('commanderies-line','line-dasharray')),[4,3]);
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayer('commanderies-line').source),'boundaries');
  assert.equal(await page.evaluate(()=>window.atlas.map.getSource('boundaries')._data.features.length),138);
  assert.equal(await page.evaluate(()=>window.atlas.map.getLayer('regions-fill')),undefined);
  assert.equal(await page.evaluate(()=>window.atlas.map.getSource('han-administration')._data.provinces.length),13);
  const markerErrors=await page.evaluate(()=>{
   const map=window.atlas.map,origin=map.getContainer().getBoundingClientRect();
   return window.atlas.data.places.map(place=>{
    const marker=[...document.querySelectorAll('.place-marker')].find(n=>n.getAttribute('aria-label').startsWith(place.name+'，'));
    const rect=marker.getBoundingClientRect(),point=map.project(place.coordinates);
    if(getComputedStyle(marker).display==='none')return {name:place.name,error:0};
    return {name:place.name,error:Math.hypot(rect.x+rect.width/2-origin.x-point.x,rect.y+rect.height/2-origin.y-point.y)};
   }).filter(x=>x.error>1.5);
  });
  assert.deepEqual(markerErrors,[],'城池标记必须与经纬度投影位置对齐');
  await page.screenshot({path:path.join(__dirname,'../output/national-desktop.png'),fullPage:true});
  await page.locator('#focus-xuzhou').click();await page.waitForFunction(()=>!window.atlas.map.isMoving());
  const marker=page.getByRole('button',{name:'下邳，城池，区域级定位',exact:true});
  await marker.hover();
  await page.waitForFunction(()=>document.querySelector('.place-marker.hovered'));
  assert.deepEqual(await page.evaluate(()=>window.atlas.map.getFilter('county-hover')),['==',['get','id'],'']);
  assert.equal(await page.evaluate(()=>window.atlas.map.getPaintProperty('county-hover','line-color')),'#ffffff');
  assert.match(await page.locator('#county-tooltip').innerText(),/下邳县/);
  assert.match(await page.locator('#county-tooltip').innerText(),/县域边界待考/);
  await page.screenshot({path:path.join(__dirname,'../output/county-hover.png'),fullPage:true});
  await page.mouse.move(150,35);await page.waitForFunction(()=>window.atlas.hoveredCounty===null);
  await page.locator('#search').fill('魏郡');await page.locator('#search-results button').first().click();
  assert.equal(await page.locator('#panel-content h1').innerText(),'魏郡');
  assert.match(await page.locator('#panel-content').innerText(),/郡国志/);
  for(const [year,expected]of [[220,'wei'],[229,'wu'],[266,'jin'],[280,'jin']]){
   await page.locator('#year-input').fill(String(year));await page.locator('#year-input').dispatchEvent('change');
   assert.ok(await page.evaluate(id=>window.atlas.state.frame.features.some(x=>x.properties.id===id),expected));
  }
  assert.ok(!(await page.evaluate(()=>window.atlas.state.frame.features.map(x=>x.properties.id))).includes('wu'));
  await page.locator('#history-mode').click();await page.locator('#focus-all').click();
  await page.waitForFunction(()=>!window.atlas.map.isMoving());
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.atlas.map.resize());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#close-panel').click();
  await page.screenshot({path:path.join(__dirname,'../output/national-mobile.png'),fullPage:true});
  await page.locator('#focus-xuzhou').click();await page.waitForFunction(()=>!window.atlas.map.isMoving());
  await page.getByRole('button',{name:'下邳，城池，区域级定位',exact:true}).click();
  assert.equal(await page.locator('#panel-content h1').innerText(),'下邳');
  assert.equal(await page.evaluate(()=>window.atlas.hoveredCounty),null);
  assert.match(await page.locator('#panel-content').innerText(),/下邳县/);
  assert.deepEqual(errors,[]);
  const result={checks:['默认全国视野','138条源图配准边线','未考定势力面默认关闭','21关外参考条目保留','按进度变化地点颜色','未知县域仅高亮地点与待考说明','移出取消高亮','郡国检索与来源','220/229/266/280分期变化','手机无横向溢出','手机点击地点'],page_errors:errors};
  fs.writeFileSync(path.join(__dirname,'../output/national-browser-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
