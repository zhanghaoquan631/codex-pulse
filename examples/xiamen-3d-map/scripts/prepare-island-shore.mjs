import fs from 'node:fs/promises';
import pc from 'polygon-clipping';
import {prepareRingContains} from '../water-query.mjs';
const data=JSON.parse(await fs.readFile('public/data/xiamen.json','utf8'));
const detail=JSON.parse(await fs.readFile('public/data/island-detail.json','utf8'));
const world=(lon,lat)=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];
const [x0,z1]=world(118.050,24.438),[x1,z0]=world(118.074,24.458);
const box=[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]];
const area=r=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0);
const waters=[];
for(const rings of data.water){let polygon;for(const ring of rings){if(area(ring)>0||!polygon){polygon=[ring];waters.push(polygon);}else polygon.push(ring);}}
let land=[box];
for(const water of waters){const r=water[0];if(!r.some(p=>p[0]>=x0-.1&&p[0]<=x1+.1&&p[1]>=z0-.1&&p[1]<=z1+.1))continue;land=pc.difference(land,[water]);}
const centre=world(118.063,24.447),island=land.find(p=>prepareRingContains(p[0])(...centre));
if(!island)throw new Error('No continuous island polygon found');
detail.shoreline=island;detail.shorelineSource=data.meta.vectorSource;
await fs.writeFile('public/data/island-detail.json',JSON.stringify(detail));
console.log(JSON.stringify({rings:island.length,vertices:island[0].length}));
