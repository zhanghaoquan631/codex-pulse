import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMappedBuildings} from '../mapped-buildings.mjs';

const data=JSON.parse(fs.readFileSync('public/data/mainland-buildings.json','utf8'));
assert.equal(data.snapshot,'2026-09-13');assert.equal(data.license,'ODbL-1.0');
assert.ok(data.buildings.length>6000);assert.ok(data.roads.length>15000);
for(const b of data.buildings){assert.ok(b.height>0&&Number.isFinite(b.height));assert.ok(b.rings.length);assert.ok(b.rings.flat(2).every(Number.isFinite));assert.ok(b.bounds.every(Number.isFinite));}
const keys=new Set();for(const [kind,bridge,line] of data.roads){assert.ok(['motorway','trunk','primary','secondary','tertiary','rail'].includes(kind));assert.equal(typeof bridge,'boolean');assert.equal(line.length,2);assert.ok(line.flat().every(Number.isFinite));const key=kind+bridge+line.map(p=>p.join(',')).sort().join(';');assert.ok(!keys.has(key));keys.add(key);}
const group=new THREE.Group(),parts=[],result=createMappedBuildings({group,builder:{part:(...args)=>parts.push(args)},records:data.buildings.slice(0,40),heightAt:()=>0,waterAt:()=>null,excluded:()=>false});
assert.equal(result.count,40);assert.ok(parts.length);assert.ok(group.children.length);
for(const mesh of group.children){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));assert.equal(mesh.geometry.attributes.color.count,mesh.geometry.attributes.position.count);assert.ok(mesh.material.vertexColors);assert.ok([...mesh.geometry.attributes.color.array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();}
for(const [, ,position,scale] of parts){assert.ok(position.every(Number.isFinite));assert.ok(scale.every(n=>Number.isFinite(n)&&n>0));}
console.log(`PASS: ${data.buildings.length} source footprints, ${data.roads.length} unique road segments, finite render geometry`);
