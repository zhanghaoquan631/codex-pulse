import {STORY_CHAPTERS,STORY_ORDER} from './story-content.mjs';
export const districtRiddles=Object.fromEntries(STORY_ORDER.slice(4).map(id=>[id,STORY_CHAPTERS[id].riddles]));
export const districtBosses={
 'puning-deanli':'古厝镇印魁','chaoyang-wenguang':'文光巡夜将','chaonan-cuihu':'仙湖潮纹蟹王','chenghai-chen':'侨厝彩瓷魁',
 'chaoan-tianchi':'云顶雾魇','raoping-daoyun':'八角守楼将','huilai-jinghai':'靖海墨甲将','jiexi-falls':'五瀑山灵'
};
