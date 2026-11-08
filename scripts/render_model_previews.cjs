// Requires the local map service and Playwright. Uses the actual GLB renderer.
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8790/models.html');await page.waitForFunction(()=>window.modelPreview);
  const assets=JSON.parse(fs.readFileSync(path.join(root,'web/models/manifest.json'))).assets;
  for(const asset of assets){
   await page.locator(`[data-model="${asset.id}"]`).click();await page.waitForFunction(id=>window.modelPreview?.id===id,asset.id);
   const encoded=await page.locator('canvas').evaluate(canvas=>{
    const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
    const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
    let left=copy.width,right=-1,top=copy.height,bottom=-1;
    for(let y=0;y<copy.height;y++)for(let x=0;x<copy.width;x++)if(pixels[(y*copy.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)throw new Error('模型渲染结果为空');
    const thumb=document.createElement('canvas');thumb.width=200;thumb.height=190;
    const w=right-left+1,h=bottom-top+1,scale=Math.min(180/w,165/h);
    thumb.getContext('2d').drawImage(copy,left,top,w,h,(200-w*scale)/2,(190-h*scale)/2,w*scale,h*scale);
    return thumb.toDataURL('image/png').split(',')[1];
   });
   fs.writeFileSync(path.join(root,`web/models/${asset.id}.png`),Buffer.from(encoded,'base64'));
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({rendered:assets.length,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
