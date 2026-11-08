const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/');
  await page.waitForFunction(()=>window.atlas&&window.atlas.map.loaded()&&!window.atlas.map.isMoving());
  assert.equal(await page.locator('#political-button').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.province-label:visible').count(),13,'势力填色开启时也显示十三州名');
  const overlaps=await page.evaluate(()=>{
   const provinces=[...document.querySelectorAll('.province-label')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect());
   return [...document.querySelectorAll('.faction-label')].filter(n=>getComputedStyle(n).display!=='none').filter(n=>{
    const b=n.getBoundingClientRect();return provinces.some(a=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);
   }).map(n=>n.textContent);
  });
  assert.deepEqual(overlaps,[],'势力名称与州名不能重叠');
  await page.screenshot({path:'output/province-labels-national.png',fullPage:true});
  for(const name of ['徐州','荆州','益州'])for(const zoom of [5.8,6.8,8.2]){
   await page.evaluate(({name,zoom})=>{
    const centre=window.atlas.strategicRegions.province_labels['219'].find(p=>p.name===name).coordinates;
    window.atlas.map.jumpTo({center:centre,zoom});
   },{name,zoom});
   await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
   const state=await page.locator(`.province-label[data-province="${name}"]`).evaluate(n=>{
    const box=n.getBoundingClientRect(),map=window.atlas.map,b=map.getContainer().getBoundingClientRect();
    return {display:getComputedStyle(n).display,x:Math.abs((box.left+box.right)/2-(b.left+b.width/2)),
     y:Math.abs((box.top+box.bottom)/2-(b.top+b.height/2)),hit:document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2)?.closest('.province-label')===n};
   });
   assert.notEqual(state.display,'none',`${name}在缩放${zoom}被隐藏`);
   assert.ok(state.x<2&&state.y<2,`${name}偏离州中心`);assert.ok(state.hit,`${name}被其他元素遮挡`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.atlas.map.jumpTo({center:window.atlas.strategicRegions.province_labels['219'].find(p=>p.name==='徐州').coordinates,zoom:5.8}));
  await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
  await page.locator('.province-label[data-province="徐州"]').click();
  assert.equal(await page.locator('#panel-content h1').innerText(),'徐州');
  await page.locator('#close-panel').click();
  await page.screenshot({path:'output/province-labels-mobile.png',fullPage:true});
  await page.locator('#layers-button').click();await page.locator('[data-layer="provinces"]').uncheck();
  assert.equal(await page.locator('.province-label:visible').count(),0);
  await page.locator('[data-layer="provinces"]').check();await page.locator('#layers-button').click();
  assert.ok(await page.locator('.province-label[data-province="徐州"]').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  const result={checks:['势力填色下全国十三州名显示','势力名与州名错行无重叠','徐州荆州益州在5.8、6.8、8.2级缩放保持州中心可读','手机点击州名与图层开关'],page_errors:errors};
  fs.writeFileSync('output/province-labels-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
