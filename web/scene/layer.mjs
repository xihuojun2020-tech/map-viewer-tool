export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function verifyLayer(bytes,manifest,versions){
  for(const field of ['baseMapId','baseMapRevision','atlasRevision','sceneSchemaVersion'])if(manifest[field]!==versions[field])throw Error('剧情包与本机地图资料不兼容，请更新应用。');
  if(bytes.byteLength!==manifest.bytes||await sha256(bytes)!==manifest.sha256)throw Error('剧情包下载校验失败，原有地图已保留。');
  const pack=JSON.parse(new TextDecoder().decode(bytes));
  if(pack.id!==manifest.storyId||pack.version!==manifest.sceneSchemaVersion||pack.baseMap?.revision!==manifest.baseMapRevision||!Array.isArray(pack.readingPositions))throw Error('剧情包内容与发布清单不一致。');
  return pack;
}
export function locateBookmark(pack,manifest,bookmark){
  const chapter=manifest.chapterIds.indexOf(bookmark.chapterId)+1;
  if(!chapter)throw Error('章节目录已变化，原阅读位置无法对应，请重新选择章节。');
  return pack.readingPositions.findLastIndex(p=>p.chapter<chapter||(p.chapter===chapter&&p.paragraph<=(bookmark.paragraph??Infinity)));
}
export function bookmarkAt(pack,manifest,position){
  const point=pack.readingPositions[position];
  if(!point)return {chapterId:manifest.chapterIds[manifest.startChapter-1],paragraph:0};
  return {chapterId:manifest.chapterIds[point.chapter-1],paragraph:point.paragraph};
}
