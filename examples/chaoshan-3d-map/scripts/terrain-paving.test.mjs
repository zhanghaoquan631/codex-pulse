import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainPaving} from '../terrain-paving.mjs';
import * as THREE from 'three';
import {addSpatialInstances} from '../spatial-instances.mjs';

const terrain={bounds:[[0,0],[4,4]],nx:4,nz:4};
const height=(x,z)=>{
  const ix=Math.min(3,Math.floor(x)),iz=Math.min(3,Math.floor(z)),a=x-ix,b=z-iz;
  const h=(x,z)=>Math.sin(x*2+z)*.8;
  const h00=h(ix,iz),h10=h(ix+1,iz),h01=h(ix,iz+1),h11=h(ix+1,iz+1);
  return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
};
test('roads and offset pavements stay above every terrain triangle without holes',()=>{
  const pave=terrainPaving(terrain,height);
  for(const [a,b,width,side] of [[[.2,.3],[3.7,3.5],.18,0],[[.1,2],[3.9,2],.08,.18],[[3.7,3.5],[.2,.3],.18,0]]){
    const v=[];pave(v,a,b,width,{side,offset:.017});assert.ok(v.length>18);
    let area=0;
    for(let i=0;i<v.length;i+=9){
      const p=v.slice(i,i+3),q=v.slice(i+3,i+6),r=v.slice(i+6,i+9);
      area+=Math.abs((q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0]))/2;
      for(const weights of [[1/3,1/3,1/3],[.7,.2,.1],[.05,.9,.05]]){
        const c=p.map((_,k)=>p[k]*weights[0]+q[k]*weights[1]+r[k]*weights[2]);
        assert.ok(Math.abs(c[1]-height(c[0],c[2])-.017)<1e-8);
      }
    }
    assert.ok(Math.abs(area-Math.hypot(b[0]-a[0],b[1]-a[1])*width)<1e-8);
  }
});
test('degenerate or out-of-map pavement does not emit invalid geometry',()=>{
  const out=[],pave=terrainPaving(terrain,height);
  pave(out,[1,1],[1,1],.1);pave(out,[-2,-2],[-1,-1],.1);assert.equal(out.length,0);
});

test('column pruning preserves exact road triangles against an exhaustive cell scan',()=>{
 const grid={bounds:[[-2,-3],[4,5]],nx:12,nz:16},y=(x,z)=>x*.02-z*.03;
 const pave=terrainPaving(grid,y),sx=.5,sz=.5;
 const roads=[[[0,0],[2,3],.08,0],[[-4,-4],[5,6],.07,.04],[[3,4],[-1,-2],.1,-.06],[[1,-4],[1,7],.03,0],[[-3,1],[5,1],.15,0],[[-2,-3],[4,5],.002,0]];
 for(const [a,b,width,side] of roads){
  const actual=[],expected=[];pave(actual,a,b,width,{side});
  for(let ix=0;ix<grid.nx;ix++)for(let iz=0;iz<grid.nz;iz++){
   const x=-2+ix*sx,z=-3+iz*sz;
   terrainPaving({bounds:[[x,z],[x+sx,z+sz]],nx:1,nz:1},y)(expected,a,b,width,{side});
  }
  assert.deepEqual(actual,expected,'no skipped edge cell or changed triangulation');
 }
 const output=[];
 terrainPaving({bounds:[[0,0],[120,120]],nx:480,nz:480},()=>0)(output,[.2,.3],[119.7,119.5],.08);
 assert.equal(output.length/3,12606,'long diagonal retains its original full-resolution mesh');
});

test('entrance ramps join low courtyard thresholds to higher pavement without seams',()=>{
 const pave=terrainPaving(terrain,height),out=[];
 pave(out,[.2,1.4],[1.9,1.4],.06,{offset:.009,endOffset:.016});
 pave(out,[1.9,1.4],[3.6,1.4],.06,{offset:.016,endOffset:.023});
 assert.ok(out.length>30);let seamVertices=0;
 for(let i=0;i<out.length;i+=3){
  const [x,y,z]=out.slice(i,i+3),expected=.009+.014*(x-.2)/3.4;
  assert.ok(Math.abs(y-height(x,z)-expected)<1e-8);
  if(Math.abs(x-1.9)<1e-8){seamVertices++;assert.ok(Math.abs(y-height(x,z)-.016)<1e-8);}
 }
 assert.ok(seamVertices>=4);
});
test('spatial vegetation preserves all transforms and colors in locally cullable batches',()=>{
  const source=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),300),matrix=new THREE.Matrix4();
  for(let i=0;i<300;i++){source.setMatrixAt(i,matrix.makeTranslation(i*.1,0,2));source.setColorAt(i,new THREE.Color(i%2?'red':'green'));}
  const parent=new THREE.Group(),tiles=addSpatialInstances(parent,source),positions=[];
  assert.ok(tiles.length>1);assert.equal(tiles.reduce((n,t)=>n+t.count,0),300);
  for(const tile of tiles){assert.ok(tile.boundingSphere.radius<4);for(let i=0;i<tile.count;i++){tile.getMatrixAt(i,matrix);positions.push(matrix.elements[12]);const c=new THREE.Color();tile.getColorAt(i,c);assert.equal(c.getHex(),Math.round(matrix.elements[12]*10)%2?0xff0000:0x008000);}}
  positions.sort((a,b)=>a-b);for(let i=0;i<300;i++)assert.ok(Math.abs(positions[i]-i*.1)<1e-5);
  const lod=parent.children[0],camera=new THREE.OrthographicCamera();camera.position.set(0,100,0);camera.updateMatrixWorld();lod.update(camera);
  const overview=lod.levels[1].object;assert.equal(overview.visible,true);assert.equal(lod.levels[0].object.visible,false);
  assert.ok(overview.children.length>1);assert.equal(overview.children.reduce((n,t)=>n+t.count,0),300);
  const farPositions=[];
  for(const tile of overview.children)for(let i=0;i<tile.count;i++){tile.getMatrixAt(i,matrix);farPositions.push(matrix.elements[12]);const c=new THREE.Color();tile.getColorAt(i,c);assert.equal(c.getHex(),Math.round(matrix.elements[12]*10)%2?0xff0000:0x008000);}
  assert.deepEqual(farPositions.sort((a,b)=>a-b),positions);
  camera.zoom=40;lod.update(camera);assert.equal(overview.visible,false);assert.equal(lod.levels[0].object.visible,true);
});
