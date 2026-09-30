import {REGION_RECORDS} from './region-records.mjs';
import {BOSS_CATALOG,REGIONAL_BOSSES} from './boss-catalog.mjs';

const regions=new Map(REGION_RECORDS.map(r=>[r.id,r]));
const bosses=new Map(BOSS_CATALOG.map(r=>[r.id,r]));
const levelIds=new Set(REGION_RECORDS.map(r=>r.levelId));
const unique=(values,allowed)=>Array.isArray(values)?[...new Set(values.filter(x=>typeof x==='string'&&allowed.has(x)))]:[];
export function restoreRecords(raw,progress={}){
  const value=raw&&typeof raw==='object'?raw:{};
  const completed=unique(progress.completedLevelIds,levelIds);
  // Only saves predating the record book infer the original regional bosses.
  // Modern records are authoritative, including an intentionally empty list:
  // finishing a chapter against its alternate clown never grants its other boss.
  const defeated=Array.isArray(value.defeatedBossIds)?value.defeatedBossIds:
    raw==null?REGIONAL_BOSSES.filter(b=>completed.includes(b.levelId)).map(b=>b.id):[];
  const state={version:1,visitedLevelIds:unique([...(Array.isArray(value.visitedLevelIds)?value.visitedLevelIds:[]),...completed],levelIds),
    defeatedBossIds:unique(defeated,bosses),collectedIds:[]};
  state.collectedIds=unique(value.collectedIds,new Set([...regions.keys(),...bosses.keys()])).filter(id=>recordAvailable(state,id));
  return state;
}
export function recordAvailable(state,id){
  return regions.has(id)?state.visitedLevelIds.includes(regions.get(id).levelId):bosses.has(id)&&state.defeatedBossIds.includes(id);
}
export function visitRegion(state,levelId){
  if(!levelIds.has(levelId)||state.visitedLevelIds.includes(levelId))return false;
  state.visitedLevelIds.push(levelId);return true;
}
export function defeatRecordedBoss(state,bossId){
  if(!bosses.has(bossId)||state.defeatedBossIds.includes(bossId))return false;
  state.defeatedBossIds.push(bossId);return true;
}
export function collectRecord(state,id){
  if(!recordAvailable(state,id)||state.collectedIds.includes(id))return false;
  state.collectedIds.push(id);return true;
}
