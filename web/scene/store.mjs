import {verifyLayer,locateBookmark,bookmarkAt} from './layer.mjs';
export function storyStore(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('novel-map',3);
    request.onupgradeneeded=()=>{for(const name of ['stories','jobs','layers','bookmarks'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
export async function installLayer(bytes,manifest,versions,target=null){
  const pack=await verifyLayer(bytes,manifest,versions),db=await storyStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['stories','layers','bookmarks'],'readwrite');let failure=null;
    const oldPack=tx.objectStore('stories').get(pack.id),oldManifest=tx.objectStore('layers').get(pack.id),oldMark=tx.objectStore('bookmarks').get(pack.id);
    oldMark.onsuccess=()=>{
      try{
        let bookmark=target||oldMark.result?.position;
        if(!bookmark&&oldPack.result&&oldManifest.result)bookmark=bookmarkAt(oldPack.result,oldManifest.result.manifest,Number(localStorage.getItem('story-position-'+pack.id)||0));
        bookmark=bookmark||{chapterId:manifest.chapterIds[manifest.startChapter-1],paragraph:0};
        locateBookmark(pack,manifest,bookmark);
        tx.objectStore('stories').put(pack);tx.objectStore('layers').put({id:pack.id,manifest});tx.objectStore('bookmarks').put({id:pack.id,position:bookmark});
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve(pack.id);};
    tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||Error('剧情包保存失败，旧包保留。'));};
  });
}
export async function readingPosition(pack,position){
  const db=await storyStore();
  return new Promise((resolve,reject)=>{
    const writing=position!==undefined,tx=db.transaction(['layers','bookmarks'],writing?'readwrite':'readonly');let result=null,failure=null;
    const layer=tx.objectStore('layers').get(pack.id),mark=tx.objectStore('bookmarks').get(pack.id);
    mark.onsuccess=()=>{
      try{
        if(!layer.result)return;
        if(writing){tx.objectStore('bookmarks').put({id:pack.id,position:bookmarkAt(pack,layer.result.manifest,position)});result=position;}
        else if(mark.result)result=locateBookmark(pack,layer.result.manifest,mark.result.position);
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(failure||tx.error);};
  });
}
export async function checkpoint(id,value){
  const db=await storyStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('jobs',value?'readwrite':'readonly');const request=value?tx.objectStore('jobs').put({...value,id}):tx.objectStore('jobs').get(id);let result;
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
export async function saveStory(pack){
  const db=await storyStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('stories','readwrite');tx.objectStore('stories').put(pack);
    tx.oncomplete=()=>{db.close();resolve(pack.id);};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
export async function readStories(id){
  const db=await storyStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('stories'),request=id?tx.objectStore('stories').get(id):tx.objectStore('stories').getAll();
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();
  });
}
