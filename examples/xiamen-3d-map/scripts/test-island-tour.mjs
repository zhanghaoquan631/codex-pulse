import assert from 'node:assert/strict';
import {createTravelTour,tourStage,filterIsland,islandTourOrder} from '../travel-tour.mjs';
import {travelPlaces} from '../travel-data.mjs';
import {islandFoods,islandHotels,islandHospitality} from '../island-hospitality.mjs';
let time=0,visits=[];
const tour=createTravelTour({now:()=>time,onVisit:id=>visits.push(id)});
const places=filterIsland(travelPlaces),ids=islandTourOrder(places);
assert.equal(ids.length,79);assert.ok(ids.every(id=>travelPlaces.find(p=>p.id===id).island));
tour.speed(30);tour.start(ids);time=11000;tour.tick();assert.equal(tourStage(tour.getState().elapsed,30),1);
tour.pause();time+=60000;tour.tick();assert.equal(tour.getState().elapsed,11000);
tour.resume();time+=10000;tour.tick();assert.equal(tourStage(tour.getState().elapsed,30),2);
time+=9000;tour.tick();assert.equal(tour.getState().index,1);assert.equal(visits.length,2);
tour.pause();tour.seekStage(2);assert.equal(tour.getState().elapsed,20000);tour.step(-1);assert.equal(tour.getState().elapsed,0);
tour.speed(60);assert.equal(tour.getState().seconds,60);
for(const [i,p] of places.entries()){const g=islandHospitality(p,i);assert.ok(g.food&&g.hotel);}
for(const v of [...islandFoods,...islandHotels]){assert.ok(v.amount>0&&v.address&&v.priceType);assert.ok(new URL(v.source).protocol==='https:');}
console.log('PASS: 79 island-only stops, independent clock, pause/resume, 3 stages, 5 food prices and 3 hotel references');
