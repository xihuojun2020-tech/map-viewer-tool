const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.isStyleLoaded());
  async function jump(id){
   await page.locator('#campaign-button').click();await page.locator(`.campaign-entry[data-campaign="${id}"] button`).click();
   await page.waitForFunction(()=>!window.atlas.map.isMoving());
  }
  async function arrowClick(id){
   const point=await page.locator(`.campaign-arrow[data-campaign="${id}"] .campaign-hit`).evaluate(n=>{
    const p=n.getPointAtLength(n.getTotalLength()*.75),matrix=n.getScreenCTM();
    return {x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f};
   });
   await page.mouse.click(point.x,point.y);
  }
  await jump('h-wuchao');assert.equal(await page.locator('#panel-content').evaluate(n=>n.scrollTop),0);
  await page.locator('[data-tab="overview"]').click();await arrowClick('h-wuchao');
  assert.equal(await page.locator('#panel-content h1').innerText(),'曹操夜袭乌巢');
  assert.match(await page.locator('#panel-content').innerText(),/步骑五千人/);
  await page.locator('[data-tab="overview"]').click();await page.locator('.campaign-unit[data-campaign="h-wuchao"]').click();
  assert.equal(await page.locator('#panel-content h1').innerText(),'曹操夜袭乌巢');
  assert.equal(await page.locator('.campaign-target[data-campaign="h-wuchao"]').innerText(),'乌巢');
  await page.screenshot({path:'output/campaign-wuchao.png',fullPage:true});
  await page.locator('#time-scale').selectOption('week');assert.ok(await page.locator('.campaign-arrow.uncertain[data-campaign="h-wuchao"]').count());
  await arrowClick('h-wuchao');assert.match(await page.locator('#panel-content').innerText(),/无法确定就在本月或本周发生/);
  const nov=await page.evaluate(()=>window.atlas.data.calendar.calendars.han.find(m=>m.year===200&&m.month===11).start);
  await page.locator('#month-select').selectOption(String(nov));assert.equal(await page.locator('.campaign-unit[data-campaign="h-wuchao"]').count(),0);
  await jump('h-changshe');assert.equal(await page.locator('.campaign-arrow').count(),0);assert.equal(await page.locator('.campaign-unit[data-campaign="h-changshe"]').count(),1);
  assert.equal(await page.evaluate(()=>{
   const a=document.querySelector('.campaign-unit').getBoundingClientRect(),b=document.querySelector('.activity-marker').getBoundingClientRect();
   return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  }),false,'战役兵人与原活动按钮不遮挡');
  await page.screenshot({path:'output/campaign-h-changshe.png',fullPage:true});
  await jump('h-xiapi');assert.equal(await page.evaluate(()=>{
   const a=document.querySelector('.campaign-unit[data-campaign="h-xiapi"]').getBoundingClientRect(),b=document.querySelector('.map-heading').getBoundingClientRect();
   return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  }),false,'定位后起点兵人不被标题遮挡');
  await page.screenshot({path:'output/campaign-h-xiapi.png',fullPage:true});
  await jump('h-changban');assert.match(await page.locator('#panel-content').innerText(),/被甲者少/);
  await page.locator('#layers-button').click();await page.locator('[data-layer="campaigns"]').uncheck();
  assert.equal(await page.locator('.campaign-unit,.campaign-arrow,.campaign-target').count(),0);
  await page.locator('[data-layer="campaigns"]').check();await page.locator('#layers-button').click();
  await page.locator('#romance-mode').click();await page.locator('#chapter-select').selectOption('29');await page.locator('#campaign-button').click();
  assert.doesNotMatch(await page.locator('#panel-content').innerText(),/乌巢|关羽渡/);
  await page.locator('#chapter-select').selectOption('30');await jump('r-wuchao');
  assert.equal(await page.locator('.campaign-unit').count(),2);assert.match(await page.locator('#panel-content').innerText(),/张辽、许褚、徐晃、于禁/);
  assert.equal(await page.locator('.campaign-arrow').count(),1);
  await page.locator('#chapter-select').selectOption('31');assert.equal(await page.locator('.campaign-unit').count(),0);
  await page.locator('#chapter-select').selectOption('73');await jump('r-fancheng');
  await arrowClick('r-fancheng');assert.match(await page.locator('#panel-content').innerText(),/二千.*出迎支队/);
  const shape=await page.locator('.campaign-line').getAttribute('d');
  await page.evaluate(()=>window.atlas.map.jumpTo({zoom:10,bearing:25,pitch:30}));
  assert.notEqual(await page.locator('.campaign-line').getAttribute('d'),shape);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.atlas.map.jumpTo({pitch:0,bearing:0}));
  await page.getByRole('button',{name:'定位此战',exact:true}).click();await page.waitForFunction(()=>!window.atlas.map.isMoving());
  assert.equal(await page.locator('#sidebar').isVisible(),false);
  await page.screenshot({path:'output/campaign-mobile-map.png',fullPage:true});
  await page.locator('.campaign-unit[data-campaign="r-fancheng"]').click();assert.equal(await page.locator('#sidebar').isVisible(),true);
  assert.equal(await page.locator('#panel-content h1').innerText(),'关羽渡襄江攻樊城');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(await page.evaluate(()=>document.body.innerText.split('\n').filter(x=>/[A-Za-z]/.test(x))),[]);
  await page.screenshot({path:'output/campaign-mobile-details.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const result={checks:['真实箭头点击','兵人点击与详情顶部','目标地名','月周精度','跨月清理','起点待考不画箭头','兵数口径','图层开关清理','小说前后回隔离','同回两支部队','短距离渡江','旋转倾斜缩放','手机定位与点击','中文界面'],errors};
  fs.writeFileSync('output/campaign-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
