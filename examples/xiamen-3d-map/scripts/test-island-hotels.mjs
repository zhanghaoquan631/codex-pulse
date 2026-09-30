import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mappedIslandHotels,filterHotels,nearestHotel,hotelCatalogInfo} from '../island-hotels.mjs';
import {travelPlaces} from '../travel-data.mjs';
import {islandTourOrder,createTravelTour,filterIsland} from '../travel-tour.mjs';
import {prepareWaterContains} from '../water-query.mjs';
const data=JSON.parse(fs.readFileSync('public/data/xiamen.json'));
const boundary=prepareWaterContains(JSON.parse(fs.readFileSync('public/data/island-detail.json')).shoreline);
assert.equal(mappedIslandHotels.length,129);
assert.equal(new Set(mappedIslandHotels.map(h=>h.id)).size,129);
assert.equal(hotelCatalogInfo.snapshot,'2026-09-28');
for(const h of mappedIslandHotels){
 assert.ok(h.ll.length===2&&h.ll.every(Number.isFinite));
 assert.ok(boundary((h.ll[0]-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-h.ll[1])*data.meta.sz),h.name);
 assert.ok(h.nearby.length===3&&h.nearby.every(n=>Number.isFinite(n.meters)&&n.meters>=0));
 assert.ok(h.source.startsWith('https://'));
 assert.equal(h.amount,undefined,'No invented price');
 if(h.profile)assert.ok(h.profile.address&&h.profile.intro&&h.profile.features.length&&new URL(h.profile.source).protocol==='https:');
 assert.ok(filterHotels(h.name).some(x=>x.id===h.id));
}
assert.equal(filterHotels('this hotel does not exist').length,0);
assert.ok(filterHotels('复兴路').length>0);
assert.equal(filterHotels('', 'west').every(h=>h.zone==='west'),true);
const scenic=filterIsland(travelPlaces);
for(const p of scenic)assert.ok(mappedIslandHotels.includes(nearestHotel(p)));
let now=0,visits=[];
const tour=createTravelTour({now:()=>now,onVisit:id=>visits.push(id)});
for(const list of [mappedIslandHotels,[...scenic,...mappedIslandHotels]]){
 visits=[];const ids=islandTourOrder(list);tour.start(ids);
 for(let i=1;i<=ids.length;i++){now+=18001;tour.tick();}
 assert.deepEqual(visits,ids);assert.equal(tour.getState().running,false);assert.equal(tour.getState().ended,true);
 tour.resume();assert.equal(tour.getState().index,0);assert.equal(tour.getState().elapsed,0);
}
console.log(JSON.stringify({hotels:mappedIslandHotels.length,profiles:mappedIslandHotels.filter(h=>h.profile).length,combinedStops:scenic.length+mappedIslandHotels.length,completeSequence:true}));
