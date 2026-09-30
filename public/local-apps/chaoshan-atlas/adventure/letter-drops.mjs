/** Attempt-local letter card rules. Inventory is a multiset: BALLOON needs
 * two L cards and two O cards. Pending floor cards reserve their exact counts.
 */
const characters=value=>Array.from(String(value||'').toUpperCase()).filter(c=>/^[A-Z]$/.test(c));
const randomUnit=rng=>{const n=rng();return Number.isFinite(n)?Math.max(0,Math.min(1-Number.EPSILON,n)):.5;};
export function missingLetters(answer,collected=[],drops=[]){
  const needed=new Map();for(const c of characters(answer))needed.set(c,(needed.get(c)||0)+1);
  for(const c of [...collected,...drops.filter(d=>!d.collected).map(d=>d.letter)])if(needed.has(c))needed.set(c,Math.max(0,needed.get(c)-1));
  const result=[];for(const c of characters(answer))if(needed.get(c)>0){result.push(c);needed.set(c,needed.get(c)-1);}return result;
}
export const hasRequiredLetters=(answer,collected=[])=>characters(answer).length>0&&missingLetters(answer,collected).length===0;
export function rollLetterDrop({answer,collected=[],drops=[],misses=0},rng=Math.random){
  const available=missingLetters(answer,collected,drops);if(!available.length)return {letter:null,misses:0,complete:true};
  if(randomUnit(rng)>=.65&&misses<2)return {letter:null,misses:Math.max(0,misses)+1,complete:false};
  return {letter:available[Math.floor(randomUnit(rng)*available.length)],misses:0,complete:false};
}
