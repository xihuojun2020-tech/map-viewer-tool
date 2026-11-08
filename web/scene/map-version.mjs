export function resolveMapVersion(actual,catalog){
  if(actual.baseMapId!==catalog.canonical.baseMapId||actual.sceneSchemaVersion!==catalog.canonical.sceneSchemaVersion||
    !catalog.pairs.some(pair=>pair.baseMapRevision===actual.baseMapRevision&&pair.atlasRevision===actual.atlasRevision))
    throw Error('本机底图版本尚未登记，请安装匹配的应用版本。');
  return {...catalog.canonical};
}

export function assertPackCompatible(pack,localVersion,catalog){
  if(pack.version!==localVersion.sceneSchemaVersion||pack.baseMap?.id!==localVersion.baseMapId||
    !catalog.pairs.some(pair=>pair.baseMapRevision===pack.baseMap.revision))
    throw Error('这份地图需要匹配的底图版本，请更新应用；已有地图已保留。');
}
