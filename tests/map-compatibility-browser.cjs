const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {openSearch}=require('./map-ui.cjs');
const catalog=JSON.parse(fs.readFileSync('web/map-compatibility.json','utf8'));
const output='tmp/copy-fix-20261108/browser';fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:8790/tools.html');await page.waitForLoadState('networkidle');
    const pack=JSON.parse(fs.readFileSync('web/scene/xuzhou-letter.json','utf8'));
    pack.id='compatibility-test';pack.readingPositions=pack.steps.map((_,i)=>({chapter:1,paragraph:i+1}));
    const original=JSON.stringify(pack);
    await page.evaluate(async({pack,version})=>{
      const {installLayer}=await import('./scene/store.mjs'),{sha256}=await import('./scene/layer.mjs');
      const bytes=new TextEncoder().encode(JSON.stringify(pack));
      const manifest={...version,storyId:pack.id,chapterIds:['chapter-one'],startChapter:1,bytes:bytes.length,sha256:await sha256(bytes)};
      await installLayer(bytes,manifest,version,{chapterId:'chapter-one',paragraph:3});
    },{pack,version:catalog.canonical});
    await page.goto('http://127.0.0.1:8790/?story='+pack.id);
    await page.waitForFunction(()=>window.atlas?.scene&&window.atlas.map.isStyleLoaded());
    const saved=await page.evaluate(async()=>{
      const {readStories,readingPosition}=await import('./scene/store.mjs');const pack=await readStories('compatibility-test');
      return {pack:JSON.stringify(pack),position:await readingPosition(pack)};
    });
    assert.equal(saved.pack,original);assert.equal(saved.position,2);
    await page.screenshot({path:output+'/legacy-map.png'});
    await page.goto('http://127.0.0.1:8790/tools.html');
    await page.evaluate(async({pack,revision})=>{
      const {saveStory}=await import('./scene/store.mjs');pack.id='copy-version-test';pack.baseMap.revision=revision;await saveStory(pack);
    },{pack,revision:catalog.pairs[1].baseMapRevision});
    await page.goto('http://127.0.0.1:8790/?story=copy-version-test');
    await page.waitForFunction(()=>window.atlas?.scene&&window.atlas.map.isStyleLoaded());
    await page.goto('http://127.0.0.1:8790/tools.html');
    await page.evaluate(async pack=>{const {saveStory}=await import('./scene/store.mjs');pack.id='unknown-version-test';pack.baseMap.revision='unknown';await saveStory(pack)},pack);
    await page.goto('http://127.0.0.1:8790/?story=unknown-version-test');
    await page.getByText('地图载入失败：这份地图需要匹配的底图版本，请更新应用；已有地图已保留。',{exact:true}).waitFor();
    assert.equal(await page.evaluate(async()=>JSON.stringify(await(await import('./scene/store.mjs')).readStories('compatibility-test'))),original);

    const requests=[];
    await page.route('https://genghaodewuwa.xyz/map-tool/api/v1/**',async route=>{
      const request=route.request(),url=new URL(request.url());requests.push({url:url.pathname,query:Object.fromEntries(url.searchParams),body:request.postDataJSON()});
      let body;
      if(url.pathname.endsWith('/library/search'))body={books:[{bookKey:'test',title:'测试小说',author:'测试作者',source:'测试书库',aliases:[],chapters:1}]};
      else if(url.pathname.endsWith('/directory'))body={chapters:[{id:'one',title:'第一章'}],checked:1};
      else if(url.pathname.endsWith('/availability'))body={status:'missing'};
      else if(request.method()==='POST')body={requestId:'test-request',stage:'queued',mode:'cumulative',target:{chapter:1},extractedBlocks:0,totalBlocks:1};
      else if(url.pathname.endsWith('/requests/test-request'))body={stage:'completed',mode:'cumulative',fetched:1,extractedBlocks:1,totalBlocks:1,target:{chapter:1},coveredThrough:{chapter:1,paragraph:100,chapterComplete:false}};
      else throw Error('未预期的测试请求：'+url.pathname);
      await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto('http://127.0.0.1:8790/tools.html');
    await page.evaluate(()=>sessionStorage.setItem('model-settings',JSON.stringify({mode:'hosted',token:'test-fixture'})));await page.reload();
    await page.locator('#library-query').fill('测试小说');await page.locator('#library-search').click();
    await page.getByRole('button',{name:'选择这本书',exact:true}).click();
    await page.getByText('所选范围未生成；可选择累计局势或当前章局部地图。',{exact:true}).waitFor();
    await page.locator('#library-generate').click();
    await page.waitForFunction(()=>document.getElementById('library-progress-text').textContent.includes('分析进度：1 / 1 批'));
    assert.match(await page.locator('#library-progress-text').innerText(),/第 1 章第 100 段/);
    const sent=requests.find(r=>r.url.endsWith('/availability')).query;
    assert.equal(sent.baseMapRevision,catalog.canonical.baseMapRevision);assert.equal(sent.atlasRevision,catalog.canonical.atlasRevision);
    for(const [width,height] of [[390,844],[844,390],[800,1280],[1280,800],[1440,900]]){
      await page.setViewportSize({width,height});
      await page.goto('http://127.0.0.1:8790/tools.html');
      await page.locator('#settings-open').click();assert.ok(await page.locator('#settings').isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.getByRole('button',{name:'关闭设置',exact:true}).click();
      await page.screenshot({path:output+`/reading-${width}.png`,fullPage:true});
      await page.goto('http://127.0.0.1:8790/');await page.waitForFunction(()=>window.atlas&&window.atlas.map.isStyleLoaded());
      await page.locator('#timeline-toggle').click();await page.locator('#time-scale').selectOption('month');await page.locator('#close-timeline').click();
      await page.locator('#layers-button').click();await page.locator('#close-layers').click();
      await openSearch(page);await page.locator('#search').fill('下邳');await page.locator('#search-results button').first().click();
      const fold=page.locator('#panel-content details').filter({has:page.locator('summary',{hasText:'资料与定位说明'})}).first();
      assert.equal(await fold.evaluate(el=>el.open),false);await fold.locator('summary').click();
      assert.equal(await fold.evaluate(el=>el.open),true);assert.match(await fold.innerText(),/古邳|来源|定位/);
      await fold.locator('summary').click();assert.equal(await fold.evaluate(el=>el.open),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:output+`/map-${width}.png`});
    }
    assert.deepEqual(errors,[]);
    const result={legacyPackUnchanged:true,bookmarkPosition:2,reviewedLocalPack:true,unknownRejected:true,libraryCanonicalVersion:true,batchProgress:true,viewports:5,pageErrors:errors};
    fs.writeFileSync(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
