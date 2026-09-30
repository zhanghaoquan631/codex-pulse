import * as THREE from 'three';
import {groundHeight} from './landforms.mjs';

/** Scene-only letter cards. Rule state decides emission, pickup and puzzle access. */
export function createLetterDropsView(scene){
  const root=new THREE.Group();root.name='letter-cards-and-riddle-station';scene.add(root);
  const geometry=new THREE.PlaneGeometry(.7,.86),materials=new Map(),cards=new Map();
  let elapsed=0,station=null;
  function material(letter){
    if(!materials.has(letter)){
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=240;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff2ce';ctx.fillRect(0,0,192,240);ctx.strokeStyle='#764995';ctx.lineWidth=9;ctx.strokeRect(8,8,176,224);
      ctx.lineWidth=2;ctx.strokeStyle='#c9b7a0';for(let y=55;y<215;y+=35){ctx.beginPath();ctx.moveTo(16,y);ctx.lineTo(176,y+1);ctx.stroke();}
      ctx.fillStyle='#653979';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 125px "Segoe Print",sans-serif';ctx.fillText(letter==='station'?'?':letter,96,117);
      ctx.font='bold 24px "Microsoft YaHei",sans-serif';ctx.fillText(letter==='station'?'猜谜点':'字母卡',96,211);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      materials.set(letter,new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));
    }return materials.get(letter);
  }
  function clear(){root.clear();cards.clear();station=null;elapsed=0;}
  return {clear,
    update(level,dt,camera,world){
      elapsed+=dt;const h=level?.hunt;if(!h){root.visible=false;return;}root.visible=true;
      const pending=(h.letterDrops||[]).filter(d=>!d.collected),live=new Set(pending.map(d=>d.id));
      for(const drop of pending){
        let mesh=cards.get(drop.id);if(!mesh){mesh=new THREE.Mesh(geometry,material(drop.letter));mesh.name='letter-drop-'+drop.letter;root.add(mesh);cards.set(drop.id,mesh);}
        mesh.position.set(drop.x,(Number.isFinite(drop.y)?drop.y:groundHeight(level,drop.x,drop.z))+.7+Math.sin(elapsed*2.3+drop.x)*.08,drop.z);
        mesh.quaternion.copy(camera.quaternion);mesh.rotateZ(Math.sin(elapsed+drop.z)*.05);
      }
      for(const [id,mesh]of cards)if(!live.has(id)){root.remove(mesh);cards.delete(id);}
      const site=level.collectibles.find(c=>c.id===(h.riddleSiteId||h.clueIds[0]));
      if(site){
        if(!station){station=new THREE.Mesh(geometry,material('station'));station.name='riddle-station';station.scale.setScalar(1.25);root.add(station);}
        station.visible=!h.riddleSolved;station.position.set(site.x,(site.absoluteY===true?site.y:groundHeight(level,site.x,site.z))+1.1,site.z);station.quaternion.copy(camera.quaternion);
        const marker=world?.collectibles?.get(site.id);if(marker)marker.float.visible=h.riddleSolved;
      }
    },
    dispose(){clear();scene.remove(root);geometry.dispose();for(const m of materials.values()){m.map.dispose();m.dispose();}materials.clear();},
  };
}
