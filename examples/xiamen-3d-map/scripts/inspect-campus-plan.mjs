import fs from 'node:fs';
import {chromium} from 'playwright';
const d=JSON.parse(fs.readFileSync('public/data/campus-detail.json'));
const b=d.bounds,s=680,p=v=>[(v[0]-b[0])*s,(v[1]-b[1])*s];
const path=r=>'M'+r.map(v=>p(v).join(',')).join('L')+'Z';
let body=d.covers.map(c=>`<path d="${c.rings.map(path).join('')}" fill="${({forest:'#9bb798',university:'#e7ece4',pitch:'#a9c293',track:'#d5ac9a'}[c.kind]||'#d6dbc2')}"/>`).join('');
body+=d.water.map(w=>`<path d="${w.rings.map(path).join('')}" fill="#68b3cb"/>`).join('');
body+=d.paths.map(r=>`<polyline points="${r.points.map(v=>p(v).join(',')).join(' ')}" fill="none" stroke="#a19b87" stroke-width="2"/>`).join('');
body+=d.buildings.map((r,i)=>{const q=p(r.rings[0][0]);return `<path d="${r.rings.map(path).join('')}" fill="#eee0cd" stroke="#696653"/><text x="${q[0]}" y="${q[1]}" font-size="10">${i}</text>`;}).join('');
body+=d.pois.filter(v=>['芙蓉湖','大南门','厦门大学图书馆','上弦场'].includes(v.name)).map(v=>{const q=p(v.point);return `<text x="${q[0]}" y="${q[1]}" fill="red" font-size="16">${v.name}</text>`;}).join('');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1040,height:1240}});await page.setContent(`<svg width="1040" height="1240" xmlns="http://www.w3.org/2000/svg" style="background:#e6e9e0">${body}</svg>`);await page.screenshot({path:'qa/campus-plan.png'});}finally{await browser.close();}
