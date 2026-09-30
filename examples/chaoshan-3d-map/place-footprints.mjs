// Actual miniature footprints, not their much larger camera-framing radius.
export function insidePlace(p,x,z,padding=0){
  const a=p.rotation||0,dx=x-p.x,dz=z-p.z;
  const u=dx*Math.cos(a)-dz*Math.sin(a),v=dx*Math.sin(a)+dz*Math.cos(a);
  if(p.footprint){const [x0,x1,z0,z1]=p.footprint;return u>x0-padding&&u<x1+padding&&v>z0-padding&&v<z1+padding;}
  const bounds={guangji:[.40,.045],'small-park':[1.08,1.08],'jieyang-tower':[.70,.47],lighthouse:[.44,.90]};
  const b=bounds[p.id];
  if(b)return Math.abs(u)<b[0]+padding&&Math.abs(v)<b[1]+padding;
  return Math.hypot(dx,dz)<(p.span||(['activity','food','recreation'].includes(p.kind)?.28:0))+padding;
}
