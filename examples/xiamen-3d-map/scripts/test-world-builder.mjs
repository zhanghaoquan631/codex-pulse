import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBuilder} from '../living-world.mjs';

function build(options){
 const group=new THREE.Group(),builder=createBuilder(group,options);
 builder.part('box','#aabbcc',[.2,0,.2],[1,1,1]);
 builder.part('box','#aabbcc',[2.2,0,.2],[1,1,1]);
 builder.part('box','#aabbcc',[-.2,0,.2],[1,1,1]);
 builder.bar('#aabbcc',[.2,0,.2],[.2,1,.2]);
 builder.bar('#aabbcc',[2.2,0,.2],[2.2,1,.2]);
 assert.equal(builder.finish(),5);
 return {group,builder};
}
const original=build(),tiled=build({cellSize:1});
assert.equal(original.group.children.length,2);assert.equal(tiled.group.children.length,5);
assert.equal(tiled.builder.materials.size,1,'Spatial batches reuse materials');
const positions=group=>group.children.flatMap(mesh=>Array.from({length:mesh.count},(_,i)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);return matrix.elements.slice(12,15).map(v=>v.toFixed(5)).join(',');})).sort();
assert.deepEqual(positions(tiled.group),positions(original.group));
assert.ok(tiled.group.children.every(m=>m.frustumCulled&&Number.isFinite(m.boundingSphere.radius)));
const tinted=new THREE.Group(),batch=createBuilder(tinted,{cellSize:2,tintInstances:true});
batch.part('box','#123456',[.3,0,.4],[1,2,3]);batch.part('box','#abcdef',[.8,0,.5],[2,3,4]);assert.equal(batch.finish(),2);assert.equal(tinted.children.length,1);
for(const [i,value] of ['#123456','#abcdef'].entries()){const color=new THREE.Color();tinted.children[0].getColorAt(i,color);assert.equal(color.getHexString(),value.slice(1));}
assert.equal(tinted.children[0].material.color.getHexString(),'ffffff');
const glowGroup=new THREE.Group(),glowBuilder=createBuilder(glowGroup,{tintInstances:true});glowBuilder.part('ball','#f0b060',[0,0,0],[1,1,1],[0,0,0],true);glowBuilder.finish();assert.equal(glowGroup.children[0].material.emissive.getHexString(),'f0b060');assert.equal(glowGroup.children[0].instanceColor,null);
console.log('PASS: spatial batches preserve instances, transforms, materials and default behavior; local bounds are finite.');
