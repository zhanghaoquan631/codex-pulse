import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createAtlasTour} from '../atlas-tour.mjs';
import {createInstanceDetailBudget} from '../instance-detail-budget.mjs';
import {createBuilder} from '../living-world.mjs';
import {createSignBudget} from '../../../../../2026-08-25/new-chat/outputs/chaoshan-3d-atlas-v5/screen-detail-budget.mjs';

// Test both deployed copies, not just the shared design.
const chaoshan=new URL('../../../../../2026-08-25/new-chat/outputs/chaoshan-3d-atlas-v5/atlas-tour.mjs',import.meta.url);
assert.equal(await readFile(chaoshan,'utf8'),await readFile(new URL('../atlas-tour.mjs',import.meta.url),'utf8'));
const visits=[],tour=createAtlasTour({onVisit:id=>visits.push(id),seconds:9});
assert.equal(tour.start([],null),false);tour.start(['a','b','b','c'],'b');assert.equal(tour.getState().total,3);
tour.tick(2800);tour.pause();tour.tick(50000);assert.equal(tour.getState().elapsed,2800);
tour.resume();tour.tick(5000,true);assert.equal(tour.getState().elapsed,2800);
tour.tick(6200);assert.equal(tour.getState().current,'c');
tour.tick(9000);assert.equal(tour.getState().ended,true);assert.equal(tour.getState().running,false);
tour.resume();assert.equal(tour.getState().current,'a');tour.step(-1);assert.equal(tour.getState().current,'c');
tour.speed(30);assert.equal(tour.getState().seconds,30);tour.cancel();assert.equal(tour.getState().total,0);
tour.start([8,9,10],9);assert.equal(tour.getState().current,9);tour.tick(-100);assert.equal(tour.getState().elapsed,0);

const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
const builder=createBuilder(group);for(let i=0;i<20;i++)builder.part('crown','#447c62',[i*.01,0,0],[.01,.01,.01]);builder.finish();
const mesh=group.children[0],before=mesh.instanceMatrix.array.slice(),count=mesh.count,detail=mesh.geometry;
const camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,100),budget=createInstanceDetailBudget(scene);
budget.update(camera,800);assert.equal(budget.stats.simplified,1);assert.ok(mesh.geometry.attributes.position.count<detail.attributes.position.count);
assert.equal(mesh.count,count);assert.deepEqual(mesh.instanceMatrix.array,before);
camera.zoom=100;camera.updateProjectionMatrix();budget.update(camera,800);assert.equal(mesh.geometry,detail);
camera.zoom=1;camera.updateProjectionMatrix();budget.update(camera,800,'high');assert.equal(mesh.geometry,detail);
const texture=new THREE.CanvasTexture({width:8,height:8}),sign=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),new THREE.MeshBasicMaterial({map:texture}));
scene.add(sign);const signs=createSignBudget(scene);signs.update(camera,800);assert.equal(sign.visible,false);
camera.zoom=20;camera.updateProjectionMatrix();signs.update(camera,800);assert.equal(sign.visible,true);
console.log('PASS: both tour clocks, pause/resume/end/restart, full instance population, close-up geometry restoration and readable signs');
