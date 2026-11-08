const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

async function chinese(page,context){
  const issues=await page.evaluate(()=>{
    const found=[];
    if(/[A-Za-z]/.test(document.title))found.push(document.title);
    const texts=document.body.innerText.split('\n').filter(text=>/[A-Za-z]/.test(text));
    found.push(...texts);
    for(const node of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')){
      for(const key of ['title','aria-label','placeholder','alt']){
        const value=node.getAttribute(key);if(value&&/[A-Za-z]/.test(value))found.push(`${key}: ${value}`);
      }
    }
    return found;
  });
  assert.deepEqual(issues,[],context);
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.isStyleLoaded());
    await chinese(page,'主页面、控件与比例尺');
    await page.locator('.maplibregl-ctrl-attrib-button').click();await chinese(page,'展开版权来源');
    await page.locator('#layers-button').click();await chinese(page,'图层菜单');await page.locator('#layers-button').click();
    await page.locator('#search').fill('无此地名');await chinese(page,'无搜索结果');
    await page.locator('#search').fill('下邳');await page.locator('#search-results button').first().click();
    await chinese(page,'地点与县界缺失说明');
    await page.locator('#search').fill('魏郡');await page.locator('#search-results button').first().click();await chinese(page,'郡国引用');
    await page.locator('#search').fill('曹操');await page.locator('#search-results button').first().click();await chinese(page,'人物提及与基础资料');
    await page.locator('#coverage-button').click();await chinese(page,'资料、来源与下载许可');
    await page.locator('#year-input').fill('300');await page.locator('#year-input').dispatchEvent('change');
    assert.equal(await page.locator('#year-input').evaluate(n=>n.validationMessage),'请输入184至280之间的整数年份。');
    await page.locator('#history-mode').click();
    await page.locator('#romance-mode').click();await page.locator('[data-tab="events"]').click();await chinese(page,'小说事件');
    await page.locator('[data-tab="text"]').click();await page.waitForSelector('.paragraph');await chinese(page,'小说正文');
    await page.route('**/api/corpus/romance-020',route=>route.fulfill({status:404,body:'English upstream failure'}));
    await page.locator('#chapter-select').selectOption('20');
    await page.getByText('本地原文读取失败（错误编号：2001）。请检查原文文件与本地服务。',{exact:true}).waitFor();await chinese(page,'原文加载失败');
    await page.unroute('**/api/corpus/romance-020');
    await page.setViewportSize({width:390,height:844});await page.locator('#close-panel').click();await page.locator('#mobile-panel-button').click();
    await chinese(page,'手机尺寸');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.goto('http://127.0.0.1:8790/models.html');await page.waitForFunction(()=>window.modelPreview);await chinese(page,'三维模型预览');
    await page.goto('http://127.0.0.1:8790/reference.html');await page.waitForFunction(()=>window.referenceAtlas);
    await chinese(page,'中文来源底稿');
    const zoomEnd=page.evaluate(()=>new Promise(resolve=>window.referenceAtlas.map.once('zoomend',resolve)));
    await page.locator('.leaflet-control-zoom-in').click();await zoomEnd;
    await page.locator('.source-name').first().click();await chinese(page,'源图名称与关闭详情提示');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.evaluate(()=>window.referenceAtlas.map.setView([1800-847.5,1473.5],.8,{animate:false}));
    await page.getByRole('button',{name:'义阳',exact:true}).click();
    assert.match(await page.locator('.leaflet-popup-content').innerText(),/晚于219年/);await chinese(page,'建置年代纠正与史料引文');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('.reference-key summary').click();
    await page.locator('#reference-terrain').uncheck();await chinese(page,'关闭地势层后无英文图幅残留');
    await page.screenshot({path:'output/reference-mobile-chinese.png',fullPage:true});
    for(const [url,status]of [['/api/corpus/invalid',400],['/api/corpus/romance-999',404],['/missing-page',404],['/assets/',403]]){
      const response=await page.goto('http://127.0.0.1:8790'+url);assert.equal(response.status(),status);await chinese(page,`服务错误 ${status}`);
    }
    await page.route('**/atlas.json',route=>route.fulfill({status:503,body:'English server failure'}));
    await page.goto('http://127.0.0.1:8790/');await page.getByText('地图与资料载入失败（错误编号：1001）。请通过本地服务打开地图，并检查本地资料文件。详情已记录到开发日志。',{exact:true}).waitFor();await chinese(page,'启动资料加载失败');
    await page.unroute('**/atlas.json');
    await page.route('**/terrain-wide.png',route=>route.abort('failed'));
    await page.goto('http://127.0.0.1:8790/');await page.locator('#map-error').waitFor();await chinese(page,'地形资源失败且持续显示');
    await page.waitForFunction(()=>window.atlas);assert.ok(await page.locator('#map-error').isVisible());
    await page.unroute('**/terrain-wide.png');
    assert.deepEqual(errors,[]);
    const result={checks:['主地图与无障碍名称','米与千米比例尺','图层与版权区','搜索与空结果','地点、郡国及人物引用','小说正文与失败','中文年份校验','中文来源图与弹窗','义阳建置年代纠正与原文','手机尺寸','四种服务错误入口','启动资料失败','地图资源失败不被加载完成掩盖'],page_errors:errors,limits:'下载的原档及用户主动打开的外部网站保留原貌；未做安卓真机检查。'};
    fs.writeFileSync('output/chinese-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
