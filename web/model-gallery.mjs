import * as THREE from './assets/three.module.js';
import {GLTFLoader} from './assets/GLTFLoader.js';
const stage=document.getElementById('stage'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,300);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));stage.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfff4dc,0x667586,2.3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-6,15,10);scene.add(light);
const group=new THREE.Group();scene.add(group);const loader=new GLTFLoader();const cache=new Map();let radius=20,target=1,angle=.5,tilt=.65,current;
function draw(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.position.set(radius*Math.sin(angle)*Math.cos(tilt),target+radius*Math.sin(tilt),radius*Math.cos(angle)*Math.cos(tilt));camera.lookAt(0,target,0);camera.updateProjectionMatrix();renderer.render(scene,camera);}
async function choose(asset){current=asset.id;document.getElementById('status').textContent='正在加载…';
  if(!cache.has(asset.id))cache.set(asset.id,(await loader.loadAsync(asset.url)).scene);
  if(current!==asset.id)return;
  group.clear();group.add(cache.get(asset.id));const city=asset.kind==='city';radius=city?27:8;target=city?1:1.4;angle=.55;tilt=city?.7:.32;
  document.getElementById('name').textContent=asset.name;document.getElementById('download').href=asset.url;
  document.getElementById('status').textContent=`${asset.triangles} 个三角面 · ${Math.round(asset.bytes/1024)} 千字节 · 已实际加载三维文件`;
  for(const b of document.querySelectorAll('[data-model]'))b.setAttribute('aria-pressed',String(b.dataset.model===asset.id));draw();window.modelPreview={id:asset.id,triangles:asset.triangles};
}
function fail(error){document.getElementById('error').hidden=false;document.getElementById('error').textContent='模型读取失败，请检查本地模型文件。';console.error(error);}
let dragging=false,previous;
stage.onpointerdown=e=>{dragging=true;previous=[e.clientX,e.clientY];stage.setPointerCapture(e.pointerId);};stage.onpointerup=()=>{dragging=false;};stage.onpointermove=e=>{if(!dragging)return;angle-=(e.clientX-previous[0])*.01;tilt=Math.max(.1,Math.min(1.4,tilt+(e.clientY-previous[1])*.01));previous=[e.clientX,e.clientY];draw();};
stage.addEventListener('wheel',e=>{e.preventDefault();radius=Math.max(3,Math.min(60,radius*(e.deltaY>0?1.1:.9)));draw();},{passive:false});new ResizeObserver(draw).observe(stage);
try{const response=await fetch('models/manifest.json');if(!response.ok)throw new Error(`Model manifest ${response.status}`);const manifest=await response.json();for(const asset of manifest.assets){const b=document.createElement('button');b.textContent=asset.name;b.dataset.model=asset.id;b.onclick=()=>choose(asset).catch(fail);document.getElementById('choices').append(b);}await choose(manifest.assets[0]);}catch(error){fail(error);}
