// Timed pressure is game time only: menus and unfocused windows never advance it.
export const pressureProfile = tier => ({hp:1+tier*.10,damage:1+tier*.075,speed:1+tier*.035,cooldown:1/(1+tier*.035)});
export function createHunt(config){
  return {...config,phase:'hunting',kills:0,wave:0,waveRemaining:2,pressure:0,clueHalf:false,killHalf:false,readyAnnounced:false,riddle:null,riddleSolved:!config.riddles?.length,riddleRevealed:false,letters:[],observedIds:[],letterCursor:0,letterDrops:[],letterDropMisses:0,lettersComplete:false,riddleSiteId:config.clueIds?.[0]||null,atRiddleSite:false,riddleSiteDistance:null};
}
export function refreshHuntKeys(level){
  const h=level.hunt;if(!h)return;
  h.clueHalf=h.riddleSolved && h.clueIds.every(id=>level.collectibles.some(c=>c.id===id && c.collected));
  h.killHalf=h.kills>=h.killTarget;
  const gate=level.doors.find(d=>d.id===h.gateId);
  h.keysReady=h.clueHalf&&h.killHalf;
  const journeyReady=!level.journey||level.journey.completed;
  if(gate)gate.locked=!(h.keysReady&&journeyReady);
  if(h.phase==='hunting' && h.keysReady && journeyReady)h.phase='ready';
}
export function huntObjectives(level){
  const h=level.hunt;if(!h)return [];
  const row=(id,label,current,target)=>({id,label,current:Math.min(current,target),target,complete:current>=target});
  return [row('hunt-kills','击杀 · 获得战斗半钥',h.kills,h.killTarget),
    row('hunt-clues','路标 · 收集密码符片',h.clueIds.filter(id=>level.collectibles.some(c=>c.id===id&&c.collected)).length,h.clueIds.length),
    ...(h.riddles?.length?[row('hunt-letters','拾取字母卡',h.letters.length,h.riddle?.answer.length||1),row('hunt-riddle','回猜谜点 · 拼词解谜',h.riddleSolved?1:0,1)]:[]),
    // Entering the target completed this prerequisite permanently. A player
    // may close the door during the boss fight without losing the victory.
    row('hunt-room',level.journey?'地区任务＋两半钥匙 · 开门':'集齐两半，开启任务房',h.phase==='boss'||h.phase==='won'||level.doors.some(d=>d.id===h.gateId&&d.open)?1:0,1)];
}
