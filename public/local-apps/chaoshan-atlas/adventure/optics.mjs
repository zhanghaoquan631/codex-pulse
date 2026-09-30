export const OPTICS=Object.freeze([
 Object.freeze({id:'red-dot',name:'红点',zoom:1,sensitivity:.65}),
 Object.freeze({id:'2x',name:'二倍镜',zoom:2,sensitivity:.5}),
 Object.freeze({id:'4x',name:'四倍镜',zoom:4,sensitivity:.4}),
]);
const clamp=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export const canAim=weapon=>['rifle','shotgun','crossbow'].includes(weapon);
export const opticById=id=>OPTICS.find(o=>o.id===id)||OPTICS[0];
export function normalizeOptics(saved={}){
 return {optic:opticById(saved?.optic).id,reticleSize:clamp(saved?.reticleSize,.6,1.6,1),
  aimSensitivity:Object.fromEntries(OPTICS.map(o=>[o.id,clamp(saved?.aimSensitivity?.[o.id],.15,2,o.sensitivity)]))};
}
export function opticFov(baseFov,id){return 2*Math.atan(Math.tan(clamp(baseFov,55,95,72)*Math.PI/360)/opticById(id).zoom)*180/Math.PI;}
export function opticLookMultiplier(id,sensitivity){const o=opticById(id);return clamp(sensitivity,.15,2,o.sensitivity)/o.zoom;}
export const aimedSpread=(weapon,aiming)=>(Number.isFinite(weapon.spread)?weapon.spread:0)*(aiming&&canAim(weapon.id)?.65:1);
