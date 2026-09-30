import {BOSS_BY_ID,BOSS_BY_LEVEL,REGIONAL_BOSSES} from './boss-catalog.mjs';
import {bossDefinition} from './demon-combat.mjs';

export function validBossChoice(levelId,id){return !id||BOSS_BY_ID[id]?.levelId===levelId;}
/** Preserve chapter HP and damage; substitute the selected boss's actual firing pattern. */
export function applyBossVariant(enemy,id){
 const entry=BOSS_BY_ID[id];if(!entry||!enemy)return enemy;
 const pattern=bossDefinition(id),stats={cooldown:pattern.cooldown,telegraphDuration:pattern.telegraphDuration,projectileSpeed:pattern.projectileSpeed};
 Object.assign(enemy,{bossKind:id,name:entry.name,attackStyle:pattern.attackStyle,attackRange:pattern.attackRange,preferredRange:4,...stats});
 if(enemy.baseStats)Object.assign(enemy.baseStats,stats);
 return enemy;
}
export function restoreBossVictories(progress,completed){
 const ids=Array.isArray(progress?.defeatedBossKinds)?progress.defeatedBossKinds:REGIONAL_BOSSES.filter(b=>completed.includes(b.levelId)).map(b=>b.id);
 return [...new Set(ids.filter(id=>typeof id==='string'&&BOSS_BY_ID[id]&&completed.includes(BOSS_BY_ID[id].levelId)))];
}
export function echoBossKind(progress,levelId,random){
 const choices=(progress.defeatedBossKinds||[]).filter(id=>BOSS_BY_ID[id]?.levelId===levelId);
 return choices.length?choices[Math.min(choices.length-1,Math.max(0,Math.floor(random()*choices.length)))]:null;
}
