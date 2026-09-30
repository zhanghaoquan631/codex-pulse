/** Metre-grid house templates. +Z entrance; y0 floor, y1 two-high door,
 * y1/2/3 walls, y4 roof. No scene/model imports. Clone blocks before editing.
 * Main footprints are 7x7 / 9x9; a 3x2 half-height porch extends +Z.
 */
function house(size,wall){
 const blocks=[],middle=(size-1)/2,put=(x,y,z,type,rotation=0,open=false)=>blocks.push({x,y,z,type,rotation,...(['door','window'].includes(type)?{open}: {})});
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){put(x,0,z,'wood');put(x,4,z,'roof');}
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  if(x!==0&&z!==0&&x!==size-1&&z!==size-1)continue;
  for(let y=1;y<=3;y++){
   if(z===size-1&&x===middle){if(y===1)put(x,y,z,'door');else if(y===3)put(x,y,z,wall);continue;}
   const window=y===2&&((z===0&&[middle-1,middle+1].includes(x))||(x===0&&z===middle)||(x===size-1&&z===middle)||(z===size-1&&[middle-2,middle+2].includes(x)));
   put(x,y,z,window?'window':wall,window?(z===0?2:x===0?3:x===size-1?1:0):0);
  }
 }
 // Keep a full centre aisle from the entrance to the rear of the room.
 put(1,1,1,'bed');put(2,1,1,'white');put(2,2,1,'lamp');
 put(size-2,1,1,'workbench');put(1,1,size-3,'bookshelf',1);
 if(size===9){put(size-2,1,size-3,'bookshelf',3);put(size-2,1,2,'white');put(size-2,2,2,'lamp');}
 // Outdoor ground .16 -> porch .66 -> y0 floor top 1.16; both rises .5m.
 for(let z=size;z<size+2;z++)for(let x=middle-1;x<=middle+1;x++)put(x,0,z,'step');
 return blocks;
}
function freezeBlueprint(b){b.blocks.forEach(Object.freeze);Object.freeze(b.blocks);return Object.freeze(b);}
export const HOUSE_BLUEPRINTS=Object.freeze([
 freezeBlueprint({id:'wood-cabin-7',name:'7×7 木屋',description:'木墙与青灰屋顶，六扇可开窗；床、书架、工作台和床头灯。正门外带半高踏步。',blocks:house(7,'wood')}),
 freezeBlueprint({id:'brick-house-9',name:'9×9 砖屋',description:'红砖小屋配木地板，六扇可开窗；床、双书架、工作台与两盏灯，保留宽敞通道。',blocks:house(9,'brick')})
]);
