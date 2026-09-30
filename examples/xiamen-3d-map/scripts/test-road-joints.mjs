import assert from 'node:assert/strict';
import {terrainRoadJoint} from '../terrain-paving.mjs';
const terrain={bounds:[[0,0],[1,1]],nx:10,nz:10},heightAt=(x,z)=>x*.2+z*.3;
const vertices=terrainRoadJoint(terrain,heightAt,[.5,.5],.04,{offset:.0012});
assert.ok(vertices.length>0);let area=0;
for(let i=0;i<vertices.length;i+=9){
 const points=[vertices.slice(i,i+3),vertices.slice(i+3,i+6),vertices.slice(i+6,i+9)];
 for(const [x,y,z] of points){assert.ok(Number.isFinite(y));assert.ok(Math.hypot(x-.5,z-.5)<=.0400001);assert.ok(Math.abs(y-heightAt(x,z)-.0012)<1e-9);}
 const [a,b,c]=points;area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
}
assert.ok(area>Math.PI*.04**2*.95);assert.ok(area<=Math.PI*.04**2);
assert.deepEqual(terrainRoadJoint(terrain,heightAt,[.5,.5],NaN),[]);
assert.deepEqual(terrainRoadJoint(terrain,heightAt,[.5,.5],.04,{accept:()=>false}),[]);
console.log('PASS: joined road corners, terrain alignment, finite geometry and excluded regions');
