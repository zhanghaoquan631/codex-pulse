const meanings={TEA:'茶',KEY:'钥匙',BRIDGE:'桥',STREAM:'小溪',LANTERN:'灯笼',COMPASS:'指南针',LIGHTHOUSE:'灯塔',NAVIGATION:'导航',INHERITANCE:'继承、遗产',COUNTRYSIDE:'乡间',ILLUMINATION:'照明、启明',CONSTRUCTION:'建造',PRECIPITATION:'降水',CONSTELLATION:'星座',RECONSTRUCTION:'重建',REPRESENTATION:'表现、表征',ACCLIMATIZATION:'适应新气候或环境',INTERCONNECTION:'相互连接',INTERDEPENDENCES:'相互依存关系（复数）',RESPONSIBILITIES:'职责（复数）',MISINTERPRETATION:'错误解读',MISCOMMUNICATIONS:'沟通失误（复数）',INTERCONNECTEDNESS:'相互关联的性质',MISIDENTIFICATIONS:'错误识别（复数）'};
export function riddleHint(riddle,step=0){
  const answer=riddle?.answer||'',meaning=riddle?.meaning||meanings[answer]||'谜面描述的事物';
  if(step>=3)return `谜底是 ${answer}（${meaning}）。按这个顺序排列已收集的字母，再到「谜」标记验证；查看提示不会自动完成任务。`;
  if(step===2){const prefix=answer.slice(0,answer.length>8?3:1);return `英文提示：${prefix}${'＿'.repeat(answer.length-prefix.length)}，共 ${answer.length} 个字母。`;}
  if(step===1)return `想一想「${meaning}」的英文：答案共 ${answer.length} 个字母。${answer==='KEY'?'钥匙能打开门，所以谜面说让紧闭的门让路。':''}`;
  return '卡住时可以逐步查看中文思路、英文开头，最后再看完整谜底。';
}
