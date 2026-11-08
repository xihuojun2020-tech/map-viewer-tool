const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/reference.html');await page.waitForFunction(()=>window.referenceAtlas);
  assert.match(await page.locator('footer').innerText(),/相同方式共享4.0/);
  assert.match(await page.locator('footer').innerText(),/220年后的分划/);
  assert.equal(await page.evaluate(()=>window.referenceAtlas.data.boundaries.length),138);
  assert.ok(!(await page.evaluate(()=>[...document.images].some(i=>i.src.endsWith('jianan-219.svg')))));
  const z=await page.evaluate(()=>window.referenceAtlas.map.getZoom());
  const zoomEnded=page.evaluate(()=>new Promise(resolve=>window.referenceAtlas.map.once('zoomend',()=>resolve())));
  await page.locator('.leaflet-control-zoom-in').click();
  await zoomEnded;
  assert.ok(await page.evaluate(z=>window.referenceAtlas.map.getZoom()>z,z));
  const original=await page.evaluate(()=>window.referenceAtlas.map.getCenter().lng);
  await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(830,500,{steps:7});await page.mouse.up();
  await page.waitForFunction(x=>Math.abs(window.referenceAtlas.map.getCenter().lng-x)>10,original);
  await page.locator('#fit-reference').click();await page.waitForFunction(()=>!window.referenceAtlas.map._animatingZoom);
  await page.screenshot({path:path.join(__dirname,'../output/reference-viewer.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  const result={source:'Esiymbro, Jian\'an Commanderies, 219 CE',license:'CC BY-SA 4.0',checks:['138条来源边线','中文名称与无文字地形','缩放','拖动','复位','移动端布局','原图省界年代注释'],page_errors:errors};
  fs.writeFileSync(path.join(__dirname,'../output/reference-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
