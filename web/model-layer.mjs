import * as THREE from './assets/three.module.js';
import {GLTFLoader} from './assets/GLTFLoader.js';

export function createModelLayer(map,onError){
  const scene=new THREE.Scene(), camera=new THREE.Camera(), loader=new GLTFLoader(), models=new Map(),loads=new Map();
  const group=new THREE.Group();scene.add(group,new THREE.HemisphereLight(0xfff3db,0x586571,2.3));
  const sun=new THREE.DirectionalLight(0xffffff,2.7);sun.position.set(-1,-2,3);scene.add(sun);
  let renderer,items=[],origin=maplibregl.MercatorCoordinate.fromLngLat([112,34]);
  function rebuild(){
    group.clear();
    const unit=7/(512*2**map.getZoom());
    for(const item of items){
      if(!map.getBounds().contains(item.coordinates))continue;
      const template=models.get(item.model);if(!template)continue;
      const object=template.clone(true),point=maplibregl.MercatorCoordinate.fromLngLat(item.coordinates);
      object.position.set(point.x-origin.x+(item.displayOffset||0)/(512*2**map.getZoom()),point.y-origin.y,0);
      // Category models use Y-up. Mercator has downward-positive northing.
      object.rotation.x=Math.PI/2;
      object.scale.setScalar(unit*(item.model.startsWith('city-')?1:3));
      group.add(object);
    }
    map.triggerRepaint();
  }
  function prepare(){
    group.clear();
    if(map.getZoom()<7.4){map.triggerRepaint();return;}
    const ids=[...new Set(items.filter(i=>map.getBounds().contains(i.coordinates)).map(i=>i.model))];
    for(const id of ids)if(!loads.has(id))loads.set(id,loader.loadAsync(`models/${id}.glb`).then(result=>{models.set(id,result.scene);}));
    Promise.all(ids.map(id=>loads.get(id))).then(rebuild).catch(onError);
  }
  const layer={id:'category-models',type:'custom',renderingMode:'3d',
    onAdd(map,gl){renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});renderer.autoClear=false;},
    render(gl,args){
      if(map.getZoom()<7.4||!items.length)return;
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(new THREE.Matrix4().makeTranslation(origin.x,origin.y,0));
      renderer.resetState();renderer.render(scene,camera);renderer.resetState();
    },
    setItems(next){
      items=next;prepare();
    },
    onRemove(){map.off('moveend',prepare);for(const model of models.values())model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});renderer.dispose();}
  };
  map.on('moveend',prepare);return layer;
}
