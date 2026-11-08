const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);});
 await page.goto('http://127.0.0.1:8790/miniatures.html');
 await page.waitForFunction(()=>window.miniatureReview?.id==='guanyu'&&window.miniatureReview.loaded);
 assert.equal(await page.locator('[data-asset]').count(),12);
 const catalog=await page.evaluate(async()=>await(await fetch('miniatures/catalog.json')).json());
 const samples=catalog.assets.filter(a=>a.selected);assert.equal(samples.length,16);
 for(const asset of samples){
  await page.locator(`[data-tab="${asset.kind}"]`).click();
  await page.locator(`[data-asset="${asset.id}"]`).click();
  await page.waitForFunction(id=>window.miniatureReview?.id===id&&window.miniatureReview.loaded,asset.id);
  assert.equal(await page.locator('#asset-name').innerText(),asset.name);
  await page.waitForFunction(()=>{const i=document.querySelector('#concept-image');return i.complete&&i.naturalWidth>0;});
  for(const field of ['model','source','concept'])assert.ok((await page.request.get('http://127.0.0.1:8790/'+asset[field])).ok(),`${asset.name} ${field} 文件可下载`);
 }
 await page.locator('[data-tab="general"]').click();await page.locator('[data-asset="guanyu"]').click();
 await page.waitForFunction(()=>window.miniatureReview?.id==='guanyu'&&window.miniatureReview.loaded);
 const stage=page.locator('#miniature-stage');const front=await stage.screenshot();
 await page.getByRole('button',{name:'侧面',exact:true}).click();assert.notDeepEqual(await stage.screenshot(),front,'侧面应改变实际画面');
 await page.getByRole('button',{name:'背面',exact:true}).click();await page.screenshot({path:'output/miniature-review-back.png'});
 await page.getByRole('button',{name:'复位',exact:true}).click();
 const box=await stage.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+20,{steps:5});await page.mouse.up();
 assert.notDeepEqual(await stage.screenshot(),front,'拖动应改变真实模型角度');
 await page.getByRole('button',{name:'复位',exact:true}).click();
 await page.getByLabel('需要修改',{exact:true}).check();await page.locator('#review-note').fill('审核测试：长须与刀刃细节需要检查。');await page.getByRole('button',{name:'保存本项意见',exact:true}).click();
 await page.reload();await page.waitForFunction(()=>window.miniatureReview?.loaded);
 assert.equal(await page.locator('#review-note').inputValue(),'审核测试：长须与刀刃细节需要检查。');assert.ok(await page.getByLabel('需要修改',{exact:true}).isChecked());
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出审核意见',exact:true}).click();const download=await downloaded;
 const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.条目[0].结论,'需要修改');assert.equal(exported.条目[0].名称,'关羽');
 await page.evaluate(()=>localStorage.removeItem('three-kingdoms-miniature-review-v1'));await page.reload();await page.waitForFunction(()=>window.miniatureReview?.loaded);
 await page.screenshot({path:'output/miniature-review-desktop.png',fullPage:true});
 await page.locator('[data-tab="unit"]').click();assert.equal(await page.locator('[data-asset]').count(),21);
 await page.locator('[data-asset="baier"]').click();assert.match(await page.locator('#shape-status').innerText(),/尚未/);assert.equal(await page.evaluate(()=>window.miniatureReview.loaded),false);assert.ok(await page.locator('#model-download').isHidden());
 await page.locator('#miniature-search').fill('丹阳');assert.equal(await page.locator('[data-asset]').count(),1);await page.locator('#miniature-search').fill('');
 await page.locator('[data-tab="roster"]').click();assert.equal(await page.locator('#roster-body tr').count(),120);
 await page.locator('#miniature-search').fill('典韦');assert.equal(await page.locator('#roster-body tr').count(),1);await page.locator('#miniature-search').fill('');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="general"]').click();await page.locator('[data-asset="guanyu"]').click();await page.waitForFunction(()=>window.miniatureReview?.loaded);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.doesNotMatch(await page.locator('body').innerText(),/[A-Za-z]{2,}/,'前端可见文字为中文');
 await page.screenshot({path:'output/miniature-review-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log('16个真实模型及下载、正侧背和拖动、审核保存恢复导出、21项部队、120人名录、中文手机排版通过');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
