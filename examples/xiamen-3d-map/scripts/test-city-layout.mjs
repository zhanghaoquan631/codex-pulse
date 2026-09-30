import assert from 'node:assert/strict';
import {planCityLife} from '../city-layout.mjs';
import {distanceToSegment} from '../world-layout.mjs';
const ring=[[0,0],[1,0],[1,1],[0,1],[0,0]],block=[[.2,.2],[.3,.2],[.3,.3],[.2,.3],[.2,.2]];
const roads=Array.from({length:5},(_,i)=>['secondary',false,[[.1+i*.18,.02],[.1+i*.18,.98]]]);
const anchors=Array.from({length:12},(_,i)=>({x:.12+(i%4)*.24,z:.15+Math.floor(i/4)*.3,radius:.15}));
const data={terrain:{bounds:[[0,0],[1,1]]},mainlandCovers:[{kind:'residential',rings:[ring]}],mainlandBuildings:[{rings:[block],bounds:[.2,.2,.3,.3]}],roads};
const waterAt=(x,z)=>z>.88&&x>.65?.012:null,excluded=(x,z)=>x>.4&&x<.55&&z>.4&&z<.55;
const plan=planCityLife({data,anchors,heightAt:()=>.02,waterAt,excluded});assert.ok(plan.infill.length>50);assert.ok(plan.routes.length>10);
for(const b of plan.infill){assert.ok(!excluded(b.x,b.z));assert.equal(waterAt(b.x,b.z),null);assert.ok(!(b.x>=.198&&b.x<=.302&&b.z>=.198&&b.z<=.302));assert.ok(roads.every(r=>distanceToSegment(b.x,b.z,...r[2])>.009));assert.ok(b.height>0&&b.height<.3);}
for(const r of plan.routes)for(const p of r.route.points){assert.ok(p.x>=0&&p.x<=1&&p.z>=0&&p.z<=1);assert.equal(waterAt(p.x,p.z),null);assert.ok(!(p.x>=.198&&p.x<=.302&&p.z>=.198&&p.z<=.302));assert.ok(roads.every(r=>distanceToSegment(p.x,p.z,...r[2])>=.009));}
assert.equal(new Set(plan.scenes.map(s=>s.theme)).size,12);assert.equal(plan.scenes.reduce((n,s)=>n+s.people,0),plan.routes.reduce((n,r)=>n+r.count,0));
for(const car of plan.cars)for(const p of car.route.points){assert.equal(waterAt(p.x,p.z),null);assert.ok(!excluded(p.x,p.z));assert.ok(!(p.x>=.199&&p.x<=.301&&p.z>=.199&&p.z<=.301));}
assert.equal(plan.views.length,12);assert.ok(plan.views.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.z)));
const replay=planCityLife({data,anchors,heightAt:()=>.02,waterAt,excluded});assert.deepEqual(replay.infill,plan.infill);
const park=[[.6,.45],[.8,.45],[.8,.65],[.6,.65],[.6,.45]],detailed=planCityLife({data:{...data,cityCovers:[{kind:'park',rings:[park]}]},anchors,heightAt:()=>.02,waterAt,excluded:()=>true,infillExcluded:()=>false});
assert.ok(detailed.infill.length>50,'Detailed areas must not suppress urban infill');assert.ok(detailed.infill.every(p=>!(p.x>.6&&p.x<.8&&p.z>.45&&p.z<.65)),'Keep mapped parks unbuilt');
console.log('PASS: land-use constrained infill, preserved footprints, road clearance, water/bounds safety, 12 themes and deterministic layouts');
