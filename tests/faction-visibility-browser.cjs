const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.loaded());
  await page.locator('#time-scale').selectOption('year');
  async function inspect(name){
   await page.waitForFunction(()=>window.atlas.map.loaded()&&!window.atlas.map.isMoving());
   const result=await page.evaluate(async()=>{
    const {map,territory,strategicRegions}=window.atlas,b=map.getContainer().getBoundingClientRect();
    const owners=new Map(territory.records.map(r=>[r.id,r.owner]));
    const counts=new Map();
    for(let x=12;x<b.width;x+=24)for(let y=12;y<b.height;y+=24){
     const n=document.elementFromPoint(x+b.left,y+b.top);
     if(n?.closest('#legend,#sidebar,#layer-panel,.map-heading,.view-actions,.map-disclaimer'))continue;
     const owner=owners.get(map.queryRenderedFeatures([x,y],{layers:['political-fill']})[0]?.properties.id);
     if(owner)counts.set(owner,(counts.get(owner)||0)+1);
    }
    const labels=[...document.querySelectorAll('.faction-label')].filter(n=>{
     const r=n.getBoundingClientRect();return getComputedStyle(n).display!=='none'&&r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom;
    });
    const named=new Set(labels.map(n=>n.dataset.faction));
    const {insidePolygon}=await import('/faction-layout.mjs');
    const badAnchors=labels.filter(n=>{
     const p=JSON.parse(n.dataset.anchor);
     return !strategicRegions.features.some(f=>owners.get(f.properties.id)===n.dataset.faction&&(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).some(rings=>insidePolygon(p,rings)));
    }).map(n=>n.textContent);
    const blocked=labels.filter(n=>{const r=n.getBoundingClientRect();return [...document.querySelectorAll('.activity-marker,.province-label')].some(a=>{
     const q=a.getBoundingClientRect();return getComputedStyle(a).display!=='none'&&r.left<q.right&&r.right>q.left&&r.top<q.bottom&&r.bottom>q.top;
    });}).map(n=>n.textContent);
    return {missing:[...counts].filter(([owner,count])=>count>=2&&!named.has(owner)),named:[...named],badAnchors,blocked};
   });
   assert.deepEqual(result.missing,[],`${name}有可见领土缺名`);assert.deepEqual(result.badAnchors,[],`${name}锚点越界`);assert.deepEqual(result.blocked,[],`${name}标记遮挡`);
   checks.push({name,...result});
  }
  await inspect('194年全国');
  assert.ok(checks[0].named.includes('yuan')&&checks[0].named.includes('shu-yuan')&&checks[0].named.includes('lu'));
  await page.screenshot({path:'output/faction-visibility-national.png'});
  await page.locator('#year-input').fill('196');await page.locator('#year-input').press('Tab');
  for(const zoom of [5.8,7.4,7.6,8.2,10.4,12]){
   await page.evaluate(zoom=>window.atlas.map.jumpTo({center:[117.5,34.35],zoom}),zoom);await inspect(`196年徐州${zoom}`);
  }
  for(const center of [[116.4,35.3],[113.4,31.4],[104.9,30.7]]){
   await page.evaluate(center=>window.atlas.map.jumpTo({center,zoom:6}),center);await inspect(`平移${center}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.atlas.map.jumpTo({center:[117.6,34],zoom:5.8}));await inspect('手机徐州');
  await page.screenshot({path:'output/faction-visibility-mobile.png'});
  await page.locator('#year-input').fill('200');await page.locator('#year-input').press('Tab');await inspect('200年手机徐州');
  assert.equal(await page.locator('.faction-label[data-faction="lu"]').count(),0);
  await page.locator('#romance-mode').click();await inspect('演义已读范围');
  await page.locator('#political-button').click();assert.equal(await page.locator('.faction-label:visible').count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync('output/faction-visibility-verification.json',JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({scenarios:checks.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
