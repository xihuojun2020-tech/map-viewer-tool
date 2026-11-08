// Scene facts never read the historical ownership timeline. Reading position
// controls disclosure; a plan step only controls its own overlay.
export function buildSceneView(pack,cursor,regions){
  const visible=item=>item.at<=cursor.position;
  const controls=new Map();
  for(const claim of pack.controls.filter(visible))for(const id of claim.regionIds){
    if(claim.revoked){if(controls.get(id)?.owner===claim.faction)controls.delete(id);}
    else controls.set(id,{id,owner:claim.faction,basis:claim.basis,claim});
  }
  const strengths=new Map();
  for(const report of pack.strengths.filter(visible))strengths.set(report.unit,report);
  const branches=pack.branches.filter(visible);
  const currentChapter=pack.readingPositions?.[cursor.position]?.chapter;
  const recent=item=>currentChapter===undefined||pack.readingPositions[item.at].chapter>=currentChapter-2;
  const leaders=new Map();for(const item of (pack.leadership||[]).filter(visible))leaders.set(item.faction,item.person);
  const pointControls=new Map();
  for(const claim of (pack.pointControls||[]).filter(visible)){
    if(claim.revoked){if(pointControls.get(claim.place)?.faction===claim.faction)pointControls.delete(claim.place);}
    else pointControls.set(claim.place,claim);
  }
  return {
    position:cursor.position,view:cursor.view,step:cursor.step,
    factions:pack.factions.filter(visible).map(f=>({...f,leader:leaders.get(f.id)||f.leader})),people:pack.people.filter(visible),
    locations:pack.locations.filter(visible),
    recentLocations:pack.locations.filter(visible).filter(recent),
    units:pack.units.filter(visible).map(unit=>({...unit,strength:strengths.get(unit.id)||null})),
    observations:pack.observations.filter(visible),evidence:pack.evidence.filter(visible),
    pointControls:[...pointControls.values()],
    controls:regions.features.map(cell=>controls.get(cell.properties.id)||{id:cell.properties.id,owner:null,basis:'unknown',claim:null}),
    actions:pack.actions.filter(visible).filter(recent).filter(action=>action.status==='narrated'||(action.status==='planned'&&cursor.view!=='current'&&action.step<=cursor.step)),
    agreements:cursor.view==='plan'?pack.agreements.filter(visible).filter(a=>cursor.step>=(a.step??3)):[],
    branches,branch:cursor.view==='analysis'?(branches.find(b=>b.id===cursor.branch)||branches[0]||null):null
  };
}

export function resolveScenePlaces(pack,data,regions){
  const places=new Map();
  for(const place of pack.places.filter(p=>p.mode!=='relative')){
    let coordinates;
    if(place.mode==='place')coordinates=data.places.find(p=>p.id===place.baseId).coordinates;
    if(place.mode==='province')coordinates=regions.province_labels['219'].find(p=>p.name===place.baseId).coordinates;
    if(place.mode==='region')coordinates=regions.features.find(f=>f.properties.id===place.regionIds[0]).properties.label;
    places.set(place.id,{...place,coordinates});
  }
  for(const place of pack.places.filter(p=>p.mode==='relative')){
    const [a,b]=place.between.map(id=>places.get(id).coordinates);
    places.set(place.id,{...place,coordinates:[(a[0]+b[0])/2,(a[1]+b[1])/2]});
  }
  return places;
}

// Reuse the polygon-aware label layout. Scene groupings need no precomputed
// historical year key; candidate anchors are always inside each display parcel.
export function sceneFactionGroups(view,regions){
  return view.factions.map(faction=>{
    const ids=new Set(view.controls.filter(c=>c.owner===faction.id).map(c=>c.id));
    const parts=regions.features.filter(f=>ids.has(f.properties.id)).flatMap(f=>{
      const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
      return polygons.map(rings=>({rings,coordinates:f.properties.label}));
    });
    return {owner:faction.id,name:faction.name,priority:1,area:parts.length,parts};
  }).filter(group=>group.parts.length);
}
