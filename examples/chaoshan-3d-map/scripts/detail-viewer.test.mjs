import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {detailContent,detailKey,foodDetails,safeSource} from '../detail-content.mjs';
import {regionalMenus} from '../local-cuisine.mjs';
test('all regional food choices have distinct introductions',()=>{
 const dishes=[...new Set(regionalMenus.flatMap(p=>p[1]))];assert.equal(dishes.length,19);
 for(const dish of dishes){assert.ok(foodDetails[dish]?.intro.length>35,dish);assert.ok(detailContent({kind:'food',name:'美食'},dish).intro);}
 assert.equal(new Set(dishes.map(d=>foodDetails[d].intro)).size,dishes.length);
});
test('only the pavilion and Small Park receive the user photo',()=>{
 for(const id of ['small-park','shantou-memorial'])assert.equal(detailContent({id,name:'地名'}).photos[0].src,'/photos/small-park-user.jpg');
 assert.equal(detailContent({id:'shantou-mazu',name:'汕头老妈宫'}).photos.length,0);
});
test('food matching cannot inherit a region photo',()=>{
 const catalog={'汕头市':{photos:[{src:'/wrong.jpg'}]},'牛肉丸':{photos:[{src:'/beef.jpg'}]}};
 assert.equal(detailContent({name:'汕头市'},'牛肉丸',catalog).photos[0].src,'/beef.jpg');
 assert.equal(detailContent({name:'汕头市'},'惠来鱼丸',catalog).photos.length,0);
});
test('ambiguous place names use scoped identities',()=>{
 assert.equal(detailKey({name:'凤凰山'}),'凤凰山 (潮州)');
 assert.equal(detailKey({name:'灵山寺'}),'灵山寺 (汕头)');
 assert.equal(detailKey({name:'中山公园'}),'中山公园 (汕头)');
});
test('unknown and synthetic scenes retain their own explanation',()=>{
 const p={name:'机场 · 登机步道',kind:'transport',description:'艺术化登机步道',ll:[116.5,23.5]};
 const d=detailContent(p);assert.equal(d.intro,p.description);assert.equal(d.photos.length,0);assert.match(d.map,/23.5%2C116.5/);
 assert.equal(safeSource('javascript:alert(1)'),null);assert.equal(safeSource('file:///secret'),null);
});
test('every catalog photo is local, attributed and present',async()=>{
 const root=new URL('../',import.meta.url),data=JSON.parse(await fs.readFile(new URL('public/data/detail-photos.json',root),'utf8'));
 for(const [key,entry] of Object.entries(data))for(const photo of entry.photos||[]){
  assert.match(photo.src,/^\/photos\/[a-f0-9]+\.(jpg|png|webp)$/);assert.ok(photo.author,key);assert.ok(safeSource(photo.source));assert.match(photo.license,/CC BY|CC0|Public domain/);
  assert.ok((await fs.stat(new URL('public'+photo.src,root))).size>1000,key);
 }
 assert.ok(data['广济桥']);assert.ok(data['普宁豆干']);assert.doesNotMatch(data['蚝烙'].photos[0].caption,/Taiwan/);
});
