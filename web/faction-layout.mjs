// Screen-space placement against the actual owned polygon, including holes.
export function insidePolygon(point,rings){
  let inside=false;
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function visibleSamples(rings,viewport){
  const ys=rings[0].map(p=>p[1]);
  const top=Math.max(viewport.top+4,Math.min(...ys)),bottom=Math.min(viewport.bottom-4,Math.max(...ys));
  if(bottom-top<4)return {points:[],area:0};
  const rows=[(top+bottom)/2];
  for(let y=top+2;y<bottom;y+=10)rows.push(y);
  const points=[];let widest=0,total=0;
  for(const y of rows){
    const xs=[];
    for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for(let i=0;i<xs.length;i+=2){
      const left=Math.max(viewport.left+4,xs[i]),right=Math.min(viewport.right-4,xs[i+1]),width=right-left;
      if(width<4)continue;
      widest=Math.max(widest,width);total+=width;
      for(const fraction of [.5,.25,.75])points.push([left+width*fraction,y]);
      for(let x=left+10;x<right;x+=20)points.push([x,y]);
    }
  }
  return {points,area:total/rows.length*(bottom-top),widest};
}

const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
export function boxInsidePolygon(box,rings){
  if(!insidePolygon([(box.left+box.right)/2,(box.top+box.bottom)/2],rings))return false;
  // Corners alone miss concave borders and holes crossing the text rectangle.
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];let low=0,high=1;
    for(const [axis,min,max]of [[0,box.left,box.right],[1,box.top,box.bottom]]){
      const delta=b[axis]-a[axis];
      if(delta===0){if(a[axis]<min||a[axis]>max){high=-1;break;}}
      else{const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));}
    }
    if(low<=high)return false;
  }
  return true;
}
export function placeFactionLabel({rings,samples,preferred,width,height,viewport,occupied,allowCallout=true}){
  const boxAt=p=>({left:p[0]-width/2,right:p[0]+width/2,top:p[1]-height/2,bottom:p[1]+height/2});
  const clear=b=>b.left>=viewport.left+5&&b.right<=viewport.right-5&&b.top>=viewport.top+5&&b.bottom<=viewport.bottom-5&&
    !occupied.some(r=>b.left<r.right+10&&b.right>r.left-10&&b.top<r.bottom+10&&b.bottom>r.top-10);
  const inView=p=>p[0]>viewport.left+4&&p[0]<viewport.right-4&&p[1]>viewport.top+4&&p[1]<viewport.bottom-4;
  const candidates=[...(inView(preferred)&&insidePolygon(preferred,rings)?[preferred]:[]),...samples];
  if(!candidates.length)return null;
  const anchor=candidates.reduce((a,p)=>distance(p,preferred)<distance(a,preferred)?p:a);
  const fits=p=>{const b=boxAt(p);return clear(b)&&boxInsidePolygon(b,rings);};
  candidates.sort((a,b)=>distance(a,anchor)-distance(b,anchor));
  for(const p of candidates)if(fits(p))return {anchor:p,position:p,box:boxAt(p),callout:false};
  if(!allowCallout)return null;
  // A narrow owned area still needs a readable name: connect an external label
  // to an interior point instead of hiding the name or implying another owner.
  const outside=[];
  for(let y=viewport.top+height/2+6;y<=viewport.bottom-height/2-6;y+=10)
    for(let x=viewport.left+width/2+6;x<=viewport.right-width/2-6;x+=10)outside.push([x,y]);
  outside.sort((a,b)=>distance(a,anchor)-distance(b,anchor));
  for(const p of outside)if(clear(boxAt(p)))return {anchor,position:p,box:boxAt(p),callout:true};
  return null;
}
