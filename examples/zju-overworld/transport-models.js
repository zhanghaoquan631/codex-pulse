import { createVehicle } from './vehicle-models.js?v=11';
import { createVehicleRider } from './vehicle-rider.js?v=11';

const SERVICES = Object.freeze({
  taxi: { base: 'sedan', paint: '#f2cb45', label: '校园出租车', speed: 6.5 },
  'shared-bike': { base: 'bicycle', paint: '#27b9b3', label: '共享单车', speed: 3.2 },
  'shared-ebike': { base: 'e-bike', paint: '#f4d052', label: '共享电动车', speed: 4.4 },
});
const GLYPHS = {
  T:'111010010010010', A:'010101111101101', X:'101101010101101', I:'111010010010111',
  Z:'111001010100111', J:'001001001101111', U:'101101101101111',
  B:'110101110101110', E:'111100110100111', '0':'111101101101111', '1':'010110010010111',
  '2':'110001010100111', '3':'110001010001110', '4':'101101111001001', '5':'111100110001110',
  '6':'011100111101111', '7':'111001010010010', '8':'111101111101111', '9':'111101111001110',
};

/** Per-vehicle branding is merged, with no font, texture, canvas or network dependency. */
function identity(T, model, serviceType) {
  const group = new T.Group(); group.name = `transport-service:${serviceType}`;
  const geometryParts = [], lampParts = [];
  function box(w,h,d,x,y,z,color,rotation=0,lamp=false) {
    const source = new T.BoxGeometry(w,h,d), g=source.toNonIndexed();source.dispose();
    g.rotateY(rotation);g.translate(x,y,z);
    (lamp ? lampParts : geometryParts).push({g,color:new T.Color(color)});
  }
  function letters(label,x,y,z,pixel,color,rotation=0) {
    const width=(label.length*4-1)*pixel;
    for(let k=0;k<label.length;k++)for(let row=0;row<5;row++)for(let col=0;col<3;col++) {
      if(GLYPHS[label[k]]?.[row*3+col]!=='1')continue;
      const dx=-width/2+(k*4+col+.5)*pixel;
      box(pixel*.84,pixel*.84,.006,x+dx*Math.cos(rotation),y+(2-row)*pixel,z-dx*Math.sin(rotation),color,rotation);
    }
  }
  const teal='#168a87',dark='#164749',cream='#fff3c7';
  if(serviceType==='taxi') {
    // The roof stays at y=1.52; the lit sign is a separate, clearly legible object.
    box(.66,.055,.24,0,1.553,-.20,dark);
    box(.62,.23,.21,0,1.69,-.20,cream,0,true);
    letters('TAXI',0,1.69,-.091,.031,dark);
    letters('TAXI',0,1.69,-.309,.031,dark,Math.PI);
    for(const side of [-1,1]) {
      box(.013,.16,1.8,side*.900,.72,-.01,teal);
      box(.022,.22,.38,side*.909,.76,-.05,cream);
      letters('TAXI',side*.923,.77,-.05,.020,dark,side*Math.PI/2);
    }
  } else if(serviceType==='shared-bike') {
    // Basket sits ahead of the handlebar so the driver's hands remain visible.
    box(.43,.022,.30,0,.855,.73,dark);
    for(const y of [.86,.97,1.08]) {
      for(const z of [.575,.885])box(.45,.016,.018,0,y,z,teal);
      for(const x of [-.22,.22])box(.018,.016,.33,x,y,.73,teal);
    }
    for(const x of [-.215,-.107,0,.107,.215])for(const z of [.575,.885])box(.010,.22,.01,x,.97,z,teal);
    for(const x of [-.22,.22])for(const z of [.65,.73,.81])box(.01,.22,.01,x,.97,z,teal);
    box(.32,.15,.025,0,.97,.904,cream);
    letters('ZJU',0,.97,.920,.022,teal);
    box(.19,.04,.25,0,.79,-.59,'#f0cc43');
    box(.19,.12,.015,0,.63,-.828,cream);
    letters('B01',0,.63,-.839,.015,dark,Math.PI);
  } else if(serviceType==='shared-ebike') {
    for(const side of [-1,1]) {
      box(.016,.27,.24,side*.177,.563,-.35,teal);
      letters('ZJU',side*.189,.57,-.35,.017,cream,side*Math.PI/2);
    }
    box(.32,.15,.02,0,.824,.91,teal);
    letters('ZJU',0,.824,.923,.022,cream);
    box(.22,.15,.021,0,.605,-.821,cream);
    letters('E01',0,.605,-.836,.019,dark,Math.PI);
    box(.23,.022,.20,0,.377,.18,teal);
  }
  const resources=[];
  function merge(parts,light=false) {
    if(!parts.length)return;
    const length=parts.reduce((n,p)=>n+p.g.attributes.position.array.length,0),p=new Float32Array(length),n=new Float32Array(length),c=new Float32Array(length);
    let at=0;for(const item of parts){p.set(item.g.attributes.position.array,at);n.set(item.g.attributes.normal.array,at);for(let j=at;j<at+item.g.attributes.position.array.length;j+=3){c[j]=item.color.r;c[j+1]=item.color.g;c[j+2]=item.color.b;}at+=item.g.attributes.position.array.length;item.g.dispose();}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(p,3));geometry.setAttribute('normal',new T.BufferAttribute(n,3));geometry.setAttribute('color',new T.BufferAttribute(c,3));geometry.computeBoundingSphere();
    const material=light?new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}):new T.MeshStandardMaterial({vertexColors:true,roughness:.62,metalness:.08});
    const mesh=new T.Mesh(geometry,material);mesh.name=light?'Illuminated TAXI roof sign':'Service paint, basket and number plate';mesh.castShadow=!light;mesh.receiveShadow=!light;group.add(mesh);resources.push(geometry,material);
  }
  merge(geometryParts);merge(lampParts,true);model.group.add(group);
  return ()=>{group.removeFromParent();for(const resource of resources)resource.dispose();};
}

/** Base type stays sedan/bicycle/e-bike so existing rider fitting and traffic work. */
export function createTransportVehicle(THREE, type = 'sedan') {
  const service=SERVICES[type],model=createVehicle(THREE,service?.base||type,service?.paint);
  model.serviceType=type === 'ebike' ? 'e-bike' : type;
  model.displayName=service?.label||model.group.name;
  model.group.name=model.displayName;
  model.group.userData.serviceType=model.serviceType;
  model.group.userData.displayName=model.displayName;
  model.driverSeatIndex=model.type==='shuttle'?model.seatPositions.length-1:0;
  model.passengerSeatIndices=model.seatPositions.map((_,i)=>i).filter(i=>i!==model.driverSeatIndex);
  const releaseIdentity=service?identity(THREE,model,type):null;
  model.group.updateWorldMatrix(true,true);
  model.bounds=new THREE.Box3().setFromObject(model.group,true);
  const dimensions=model.bounds.getSize(new THREE.Vector3());model.length=dimensions.z;model.width=dimensions.x;model.height=dimensions.y;
  const previousDispose=model.dispose;let disposed=false;
  model.dispose=()=>{if(disposed)return;disposed=true;releaseIdentity?.();previousDispose();};
  return model;
}

/** Attach the supplied avatar to a free passenger cushion, with hands on its lap.
 * driver: sedan/van/cart seat 0, shuttle seat 10; all other indices are passengers.
 * detach()/dispose() restores the original parent, local transform and full pose.
 * Materials are never copied or mutated; callers retain ownership of the rig.
 */
export function createPassenger(THREE, model, rig, {seatIndex} = {}) {
  return createVehicleRider(THREE,model,rig,{passenger:true,seatIndex});
}
