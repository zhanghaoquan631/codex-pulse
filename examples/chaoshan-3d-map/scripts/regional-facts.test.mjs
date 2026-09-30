import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {factsCheckedAt,factsForPlace,formatFact,regionalFacts,regionalSources,factsMethod} from '../regional-facts.mjs';

const regions=JSON.parse(fs.readFileSync(new URL('../regions.json',import.meta.url),'utf8'));
test('all twelve existing region entries have scoped, individually sourced facts',()=>{
 assert.equal(regions.length,12);assert.equal(Object.keys(regionalFacts).length,12);
 for(const place of regions){
  const f=factsForPlace({...place,kind:'district'});assert.ok(f?.scope,place.name);assert.ok(f.traits.length);
  for(const t of f.traits){assert.ok(t.title);assert.ok(t.text.length>25);assert.ok(regionalSources[t.sourceId]);}
 }
 assert.equal(new Set(Object.values(regionalFacts).map(f=>f.traits[0].text)).size,12);
});
test('2026 income is first-half data, never annualized or mislabeled',()=>{
 const expected={'汕头市':[19636,21729,14276],'潮州市':[17143,18367,14826],'揭阳市':[15228,17653,12527],'普宁市':[16635,18616,14786]};
 for(const [name,values] of Object.entries(expected)){
  const i=regionalFacts[name].income;assert.deepEqual([i.value,i.urban,i.rural],values);assert.equal(i.period,'2026年上半年');assert.equal(i.periodEnd,'2026-06-30');
 }
 for(const f of Object.values(regionalFacts))if(f.income&&!expected[Object.keys(regionalFacts).find(k=>regionalFacts[k]===f)])assert.equal(f.income.period,'2025年全年');
});
test('verified numbers have reporting periods, units, source locators and genuine government sources',()=>{
 for(const f of Object.values(regionalFacts))for(const m of [f.population,f.income].filter(Boolean)){
  assert.ok(Number.isFinite(m.value)&&m.value>0);assert.ok(m.locator);assert.ok(m.periodEnd<=factsCheckedAt);
  const s=regionalSources[m.sourceId];assert.ok(s);assert.match(s.publishedAt,/^2026-\d\d-\d\d$/);assert.ok(s.publishedAt<=factsCheckedAt);assert.ok(s.publishedAt>=m.periodEnd);
  assert.match(new URL(s.url).hostname,/(^|\.)gov\.cn$/);
 }
 for(const f of Object.values(regionalFacts))if(f.population){assert.equal(f.population.period,'2025年末');assert.ok(['万人','人'].includes(f.population.unit));}
});
test('unknown figures remain unavailable, not zero, old census data, or parent-city estimates',()=>{
 assert.equal(regionalFacts['澄海区'].population,null);assert.equal(regionalFacts['澄海区'].income,null);assert.equal(regionalFacts['揭西县'].income,null);
 assert.equal(formatFact(null),'尚未核实');assert.match(regionalFacts['澄海区'].availability,/不以户籍人口/);
});
test('county statistics cannot leak into nearby landmarks or food scenes',()=>{
 assert.equal(factsForPlace({name:'汕头市',kind:'food'}),null);assert.equal(factsForPlace({name:'小公园',kind:'landmark'}),null);
 assert.equal(factsForPlace({name:'潮安区',kind:'activity'}),null);assert.equal(factsForPlace({name:'未知',kind:'district'}),null);
 assert.equal(factsForPlace({name:'南澳县',kind:'district'}),regionalFacts['南澳岛']);assert.match(regionalFacts['南澳岛'].scope,/全县/);
});
test('population and income are not confused with simulation totals, wages, or GDP',()=>{
 assert.equal(formatFact(regionalFacts['南澳岛'].population),'63,383');assert.equal(formatFact(regionalFacts['普宁市'].population),'205.10');
 assert.equal(formatFact(regionalFacts['普宁市'].income),'16,635');assert.match(factsMethod,/不是平均工资/);assert.match(factsMethod,/不可重复相加/);
});
