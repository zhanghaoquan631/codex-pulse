import {groundHeight} from './landforms.mjs';

/** Scene modules retain their original models, but exclude owned nodes from
 * static batching so destruction can remove their actual visible geometry. */
export function createStructureRegistry(level){
  const keys=new Map(),nodes=new Map(),partKeys=new Set(),parts=new Map();
  for(const structure of level.structures||[]){
    for(const id of [structure.id,structure.roomId,...structure.wallIds||[],...structure.visualIds||[]])if(id)keys.set(id,structure.id);
    for(const id of Object.keys(structure.parts||{}))partKeys.add(id);
  }
  const tagPart=(node,id)=>{if(node&&partKeys.has(id)){node.userData.structurePartId=id;if(!parts.has(id))parts.set(id,new Set());parts.get(id).add(node);}return node;};
  for(const wall of level.walls||[])if(wall.structureId)keys.set(wall.id,wall.structureId);
  const tagStructure=(node,...ids)=>{
    if(!node)return node;const owners=[...new Set([...ids,node.name].filter(id=>id&&keys.has(id)).map(id=>keys.get(id)))];if(!owners.length)return node;
    node.userData.structureId=owners[0];node.userData.structureIds=owners;
    if(partKeys.has(node.name))tagPart(node,node.name);
    for(const id of owners){if(!nodes.has(id))nodes.set(id,new Set());nodes.get(id).add(node);}return node;
  };
  const tagNew=(parent,start,...ids)=>{for(const node of parent.children.slice(start)){tagStructure(node,...ids);const part=ids.find(id=>partKeys.has(id));if(part)tagPart(node,part);}};
  const isStructureNode=node=>{for(let p=node;p;p=p.parent)if(p.userData?.structureId)return true;return false;};
  const consolidate=({THREE,root,geo})=>{
    // Retain a few draw calls per destructible building, instead of one call
    // for each window frame and brick after excluding it from the static batch.
    root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),objects=[],batches=new Map(),v=new THREE.Vector3(),n=new THREE.Vector3();
    const ownersOf=o=>{for(let p=o;p;p=p.parent)if(p.userData?.structureIds)return p.userData.structureIds;return null;};
    const partOf=o=>{for(let p=o;p;p=p.parent)if(p.userData?.structurePartId)return p.userData.structurePartId;return '';};
    root.traverse(o=>{if((o.isMesh&&!Array.isArray(o.material)&&!o.material.map||o.isLine)&&ownersOf(o))objects.push(o);});
    for(const o of objects){
      const owners=ownersOf(o),partId=partOf(o),line=!!o.isLine,key=owners.slice().sort().join('|')+';'+partId+';'+o.material.uuid+';'+line;
      if(!batches.has(key))batches.set(key,{owners,partId,material:o.material,line,p:[],n:[],uv:[]});
      const entry=batches.get(key),g=o.geometry,p=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv,m=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),normal=new THREE.Matrix3().getNormalMatrix(m);
      if(line){
        const step=o.isLineSegments?2:1;
        for(let i=0;i<p.count-1;i+=step)for(const j of[i,i+1]){v.fromBufferAttribute(p,j).applyMatrix4(m);entry.p.push(v.x,v.y,v.z);}
      }else for(let i=0;i<(g.index?g.index.count:p.count);i++){
        const j=g.index?g.index.getX(i):i;v.fromBufferAttribute(p,j).applyMatrix4(m);entry.p.push(v.x,v.y,v.z);
        if(norm)n.fromBufferAttribute(norm,j).applyMatrix3(normal).normalize();else n.set(0,1,0);entry.n.push(n.x,n.y,n.z);entry.uv.push(uv?uv.getX(j):0,uv?uv.getY(j):0);
      }
    }
    for(const o of objects)o.removeFromParent();
    for(const entry of batches.values()){
      const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(entry.p,3));
      if(!entry.line){g.setAttribute('normal',new THREE.Float32BufferAttribute(entry.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(entry.uv,2));}
      const model=entry.line?new THREE.LineSegments(g,entry.material):new THREE.Mesh(g,entry.material);model.name='structure-model:'+entry.owners.join('+');model.userData.structureId=entry.owners[0];model.userData.structureIds=entry.owners;root.add(model);
      for(const id of entry.owners){if(!nodes.has(id))nodes.set(id,new Set());nodes.get(id).add(model);}
      if(entry.partId)tagPart(model,entry.partId);
    }
    return {inputObjects:objects.length,batches:batches.size};
  };
  return {nodes,parts,tagStructure,tagPart,tagNew,isStructureNode,consolidate,hooks:{tagStructure,tagPart,tagNew,isStructureNode}};
}

/** Dynamic block/survivor geometry and structure feedback, owned and disposed
 * independently from static scene resources. No collision is invented here. */
export function createStructureView({THREE,root,level,registry,label}){
  const dynamic=new THREE.Group();dynamic.name='dynamic-structures';root.add(dynamic);
  const resources=new Set(),materials=new Set(),blocks=new Map(),survivors=new Map(),damage=new Map(),debris=[],ruins=new Set();
  const geometry=g=>(resources.add(g),g),material=m=>(materials.add(m),m);
  const cube=geometry(new THREE.BoxGeometry(1,1,1)),edges=geometry(new THREE.EdgesGeometry(cube));
  const paper=material(new THREE.MeshBasicMaterial({color:0xe6dcc4,toneMapped:false}));
  const green=material(new THREE.MeshBasicMaterial({color:0x87a894,toneMapped:false}));
  const ink=material(new THREE.LineBasicMaterial({color:0x304d64}));
  const crackInk=material(new THREE.LineBasicMaterial({color:0x825747,transparent:true,opacity:.8,depthTest:true}));
  const criticalInk=material(new THREE.LineBasicMaterial({color:0xc43e35,transparent:true,opacity:.95,depthTest:true}));
  const ruinPaper=material(new THREE.MeshBasicMaterial({color:0xe8dfca,side:THREE.DoubleSide,toneMapped:false}));
  const originals=new Map((level.walls||[]).map(w=>[w.id,{...w,baseY:groundHeight(level,w.x,w.z)+(w.groundOffset??w.baseY??0)}]));
  let time=0,disposed=false;
  const addBox=(parent,x,y,z,w,h,d,mat=paper)=>{
    const mesh=new THREE.Mesh(cube,mat);mesh.position.set(x,y+h/2,z);mesh.scale.set(w,h,d);parent.add(mesh);
    mesh.add(new THREE.LineSegments(edges,ink));return mesh;
  };
  function makeBlock(w){
    const group=new THREE.Group();group.name=w.id;dynamic.add(group);
    const mesh=addBox(group,0,0,0,1,1,1);mesh.position.y=0;
    const entry={root:group,mesh};blocks.set(w.id,entry);return entry;
  }
  function makeSurvivor(s){
    const group=new THREE.Group();group.name=s.id;dynamic.add(group);
    const head=new THREE.Mesh(geometry(new THREE.SphereGeometry(.21,10,8)),paper);head.position.y=1.36;group.add(head);
    head.add(new THREE.LineSegments(geometry(new THREE.EdgesGeometry(head.geometry,38)),ink));
    addBox(group,0,.60,0,.39,.57,.25,green);
    const limbs=[];for(const side of[-1,1]){const leg=addBox(group,side*.11,0,0,.085,.63,.10);const arm=addBox(group,side*.28,.64,0,.075,.45,.085);arm.rotation.z=side*.25;limbs.push({leg,arm,side});}
    const badge=label?.('E 救援',0,1.94,0,1.8,0x365e50,group);
    const entry={root:group,badge,limbs};survivors.set(s.id,entry);return entry;
  }
  function crackGroup(s){
    const group=new THREE.Group();group.name=`cracks:${s.id}`;dynamic.add(group);
    const walls=(s.wallIds||[]).map(id=>originals.get(id)).filter(Boolean).filter(w=>w.height>.65&&w.w>.2&&w.d>.1);
    for(const w of walls.slice(0,40)){
      const child=new THREE.Group();child.userData.wallId=w.id;child.position.set(w.x,w.baseY,w.z);child.rotation.y=w.rotation||0;group.add(child);
      const v=[],height=Math.min(w.height,4.2),half=Math.max(.10,Math.min(w.w*.3,1.4));
      for(const side of[-1,1]){
        const z=side*(w.d/2+.017),points=[[-half,height*.83,z],[-half*.15,height*.66,z],[-half*.55,height*.48,z],[half*.30,height*.31,z],[half*.08,height*.12,z]];
        for(let i=1;i<points.length;i++)v.push(...points[i-1],...points[i]);
      }
      const g=geometry(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));child.add(new THREE.LineSegments(g,crackInk));
    }
    return group;
  }
  function scatter(s){
    const walls=(s.wallIds||[]).map(id=>originals.get(id)).filter(Boolean);
    if(!walls.length)return;
    const group=new THREE.Group();group.name=`collapse:${s.id}`;dynamic.add(group);
    const mat=material(new THREE.MeshBasicMaterial({color:0xcfc5ae,transparent:true,opacity:.9,toneMapped:false})),pieces=[];
    for(let i=0;i<Math.min(28,Math.max(8,walls.length));i++){
      const w=walls[i%walls.length],u=((i*0.618)%1-.5)*w.w,v=((i*.414)%1-.5)*w.d,c=Math.cos(w.rotation||0),si=Math.sin(w.rotation||0);
      const node=new THREE.Mesh(cube,mat);node.position.set(w.x+c*u+si*v,w.baseY+Math.min(w.height,3)*(.3+(i%4)*.17),w.z-si*u+c*v);node.scale.set(.18+(i%3)*.12,.10,.21);node.rotation.set(i*.43,i*.19,i*.31);group.add(node);
      pieces.push({node,start:node.position.clone(),dx:Math.sin(i*2.4)*1.8,dz:Math.cos(i*1.8)*1.8,spin:(i%2?1:-1)*2.2});
    }
    debris.push({root:group,pieces,material:mat,age:0});
  }
  function update(state,dt=0){
    if(disposed)return;const current=state?.level||state||level,player=state?.player;
    const delta=Math.max(0,Math.min(.1,dt));time+=delta;
    for(const footprint of current.collapsedGround||[]){
      const points=footprint.points||[],key=footprint.structureId+':'+points.map(p=>`${p.x},${p.z}`).join(';');if(ruins.has(key)||points.length<3)continue;ruins.add(key);
      const polygon=points[0].x===points.at(-1).x&&points[0].z===points.at(-1).z?points.slice(0,-1):points;
      const triangles=THREE.ShapeUtils.triangulateShape(polygon.map(p=>new THREE.Vector2(p.x,p.z)),[]),vertices=[];
      for(const tri of triangles)for(const i of tri){const p=polygon[i];vertices.push(p.x,groundHeight(current,p.x,p.z)+.045,p.z);}
      const g=geometry(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
      const surface=new THREE.Mesh(g,ruinPaper);surface.name=`ruins:${footprint.structureId}`;dynamic.add(surface);
    }
    const wallIds=new Set();
    for(const wall of current.walls||[])if(wall.kind==='player-block'){
      wallIds.add(wall.id);const view=blocks.get(wall.id)||makeBlock(wall),base=Number.isFinite(wall.groundOffset)?groundHeight(current,wall.x,wall.z)+wall.groundOffset:(wall.baseY??groundHeight(current,wall.x,wall.z));
      if(!originals.has(wall.id))originals.set(wall.id,{...wall,baseY:base});
      view.root.position.set(wall.x,base+(wall.height||1.2)/2,wall.z);view.root.rotation.y=wall.rotation||0;view.mesh.scale.set(wall.w||1.2,wall.height||1.2,wall.d||1.2);view.root.visible=true;
    }
    for(const [id,view]of blocks)if(!wallIds.has(id)){view.root.removeFromParent();blocks.delete(id);}
    const survivorIds=new Set();
    for(const s of current.survivors||[]){
      survivorIds.add(s.id);const view=survivors.get(s.id)||makeSurvivor(s);view.root.visible=s.alive!==false&&(!s.rescued||s.accompanying);
      view.root.position.set(s.x,Number.isFinite(s.y)?s.y:groundHeight(current,s.x,s.z),s.z);
      view.root.rotation.y=Math.atan2(s.facingX||0,s.facingZ??1);
      for(const limb of view.limbs){const stride=s.moving?Math.sin(time*(s.sprinting?13:8))*limb.side*(s.sprinting?.55:.3):0;limb.leg.rotation.x=stride;limb.arm.rotation.x=-stride;}
      if(view.badge){view.badge.visible=!s.following;if(player)view.badge.rotation.y=Math.atan2(player.x-s.x,player.z-s.z)-view.root.rotation.y;}
    }
    for(const [id,view]of survivors)if(!survivorIds.has(id)){view.root.removeFromParent();survivors.delete(id);}
    for(const s of current.structures||[]){
      for(const [id,part]of Object.entries(s.parts||{}))if(part.destroyed)for(const node of registry.parts.get(id)||[])node.visible=false;
      let entry=damage.get(s.id);if(!entry){entry={status:s.status,cracks:null,hidden:false};damage.set(s.id,entry);}
      const collapsed=s.status==='collapsed',ratio=s.maxHp>0?Math.max(0,s.hp/s.maxHp):1,warning=s.status==='warning';
      if(collapsed){
        for(const node of registry.nodes.get(s.id)||[])node.visible=false;
        if(!entry.hidden){if(entry.status!=='collapsed')scatter(s);entry.hidden=true;}
        if(entry.cracks)entry.cracks.visible=false;
      }else if(ratio<.80||warning){
        if(!entry.cracks)entry.cracks=crackGroup(s);
        entry.cracks.visible=true;entry.cracks.traverse(n=>{if(n.isLineSegments)n.material=warning?criticalInk:crackInk;});
        for(const child of entry.cracks.children)if(s.parts?.[child.userData.wallId]?.destroyed)child.visible=false;
        if(warning)criticalInk.opacity=.82+Math.sin(time*15)*.13;
      }else if(entry.cracks)entry.cracks.visible=false;
      entry.status=s.status;
    }
    for(let i=debris.length-1;i>=0;i--){
      const effect=debris[i];effect.age+=delta;const age=effect.age;
      for(const p of effect.pieces){p.node.position.set(p.start.x+p.dx*age,Math.max(groundHeight(current,p.start.x,p.start.z)+.07,p.start.y-6*age*age),p.start.z+p.dz*age);p.node.rotation.z+=p.spin*delta;}
      effect.material.opacity=.9*Math.max(0,1-age/1.15);
      if(age>1.15){effect.root.removeFromParent();effect.material.dispose();materials.delete(effect.material);debris.splice(i,1);}
    }
  }
  function dispose(){if(disposed)return;disposed=true;dynamic.removeFromParent();for(const g of resources)g.dispose();for(const m of materials)m.dispose();blocks.clear();survivors.clear();damage.clear();debris.length=0;}
  return {root:dynamic,blocks,survivors,damage,update,dispose,registry};
}
