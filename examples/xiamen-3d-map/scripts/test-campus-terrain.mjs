import assert from 'node:assert/strict';
import {createCampusTerrain} from '../campus-terrain.mjs';

const base=(x,z)=>.08+x*.2+z*.12;
const ring=[[.08,.09],[.15,.09],[.15,.16],[.08,.16],[.08,.09]];
const detail={bounds:[0,0,.24,.24],buildings:[{rings:[ring]}]};
const result=createCampusTerrain(detail,base);
const spread=values=>Math.max(...values)-Math.min(...values);

assert.equal(result.samples,(result.terrain.nx+1)*(result.terrain.nz+1));
assert.equal(result.terraces.length,1);
assert.ok(spread(ring.map(p=>result.heightAt(...p)))<spread(ring.map(p=>base(...p)))*.2);
assert.ok(Math.abs(result.heightAt(.12,.12)-result.terraces[0].height)<1e-10);
for(let i=0;i<=40;i++){
  const p=.24*i/40;
  for(const [x,z] of [[0,p],[p,0],[.24,p],[p,.24]])assert.ok(Math.abs(result.heightAt(x,z)-base(x,z))<1e-7,'Coverage edges must retain the source elevation');
  for(let j=0;j<=40;j++)assert.ok(Number.isFinite(result.heightAt(p,.24*j/40)));
}
for(const p of [[-.001,.1],[.1,-.001],[.241,.1],[.1,.241]])assert.equal(result.heightAt(...p),base(...p));

const empty=createCampusTerrain({bounds:detail.bounds,buildings:[]},base);
assert.ok(Math.abs(empty.heightAt(.113,.139)-base(.113,.139))<1e-10);
console.log('PASS: building terraces, finite elevations, continuous coverage edges, outside fallback, unmodified empty terrain.');
