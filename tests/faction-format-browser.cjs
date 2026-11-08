const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.loaded());
 const camera=async(center,zoom)=>page.evaluate(({center,zoom})=>new Promise(resolve=>{const {map}=window.atlas;map.once('idle',resolve);map.jumpTo({center,zoom});}),{center,zoom});
 const labels=async()=>page.locator('.faction-label[data-faction="tao"],.faction-label[data-faction="kong"]').evaluateAll(ns=>ns.filter(n=>n.offsetWidth).map(n=>{
   const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {id:n.dataset.faction,anchor:JSON.parse(n.dataset.anchor),x:b.x+b.width/2,y:b.y+b.height/2,style:[s.backgroundColor,s.borderWidth,s.color,s.fontFamily,s.fontSize,s.fontWeight]};
 }));
 await camera([118,35],5.3);
 const first=await labels(),tao=first.find(n=>n.id==='tao'),kong=first.find(n=>n.id==='kong');
 assert.ok(tao&&kong,'陶谦、孔融均可辨认');assert.deepEqual(tao.style,kong.style,'同级势力使用相同文字样式');
 assert.equal(tao.style[0],'rgba(0, 0, 0, 0)','不混用白底名牌');
 assert.ok(tao.anchor[1]<35.3&&tao.anchor[1]>32.5,'陶谦应回到徐州中部，不挤到北海旁');
 assert.ok(Math.hypot(tao.x-kong.x,tao.y-kong.y)>100,'邻近势力名称应拉开地理距离');
 await page.screenshot({path:'output/faction-format-xuzhou.png'});
 await camera([112,34],4);await page.screenshot({path:'output/faction-format-national.png'});
 await camera([118,35],7);await camera([118,35],5.3);
 const again=await labels();
 for(const item of first){const other=again.find(n=>n.id===item.id);assert.ok(Math.hypot(other.x-item.x,other.y-item.y)<2,'缩放回到同一视野后位置不应滞留在旧边缘');}
 await page.setViewportSize({width:390,height:844});await camera([118,35],5.5);
 const mobile=await labels();assert.ok(mobile.some(n=>n.id==='tao')&&mobile.some(n=>n.id==='kong'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.screenshot({path:'output/faction-format-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await camera([121,40],5);
 await page.getByRole('button',{name:'幽州，州级行政区参考',exact:true}).click();
 assert.match(await page.locator('#panel-content').innerText(),/不是整个朝鲜半岛/);
 assert.match(await page.locator('#panel-content').innerText(),/元山|东界待考/);
 await page.getByText('年代区别与核对依据',{exact:true}).click();
 assert.match(await page.locator('#panel-content').innerText(),/274年二月.*276年十月/);
 await page.screenshot({path:'output/youzhou-reviewed.png'});
 assert.deepEqual(errors,[]);console.log('陶谦孔融定位与样式、缩放回看、中文手机布局、幽州范围核对通过');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
