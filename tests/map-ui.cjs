async function openTimeline(page){
  if(!await page.locator('#timeline-options').isVisible())await page.locator('#timeline-toggle').click();
}
async function openSearch(page){
  if(!await page.locator('#search').isVisible())await page.locator('#search-toggle').click();
}
async function openLayers(page){
  if(!await page.locator('#layer-panel').isVisible())await page.locator('#layers-button').click();
}
async function closeDetails(page){
  if(await page.locator('#close-panel').isVisible())await page.locator('#close-panel').click();
}
module.exports={openTimeline,openSearch,openLayers,closeDetails};
