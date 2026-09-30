import * as THREE from './vendor/three.module.js';
import {updateAvatar} from './avatar.js?v=11';
import {resetRolePose,updateRoleAction} from './character-props.js?v=11';
import {createReadingMotion} from './reading-motion.js?v=11';
import {sampleTeachingPose,applyTeachingPose,resetTeachingPose} from './teaching-pose.js?v=11';

export function lectureFrame(course,time){
  let start=0,index=course.segments.length-1;
  for(let i=0;i<course.segments.length;i++){if(time<start+course.segments[i].duration){index=i;break;}if(i<course.segments.length-1)start+=course.segments[i].duration;}
  const segment=course.segments[index],elapsed=Math.max(0,time-start),writing=Math.max(3,segment.duration*.65);
  if(segment.lang==='en-US')return {index,segment,elapsed,progress:1,poseProgress:Math.min(1,elapsed/segment.duration),phase:'explain'};
  const progress=THREE.MathUtils.clamp((elapsed-.9)/writing,0,1);
  return {index,segment,elapsed,progress,poseProgress:elapsed<.9?elapsed/.9:progress<1?progress:THREE.MathUtils.clamp((elapsed-writing-.9)/2,0,1),phase:elapsed<.9?'turn':progress<1?'write':'explain'};
}

export function drawBoard(board,frame){
  const full=Array.from(frame.segment.board),weight=full.reduce((s,c)=>s+(c==='\n'?9:1),0);let budget=weight*frame.progress,count=0,travel=null;
  for(const c of full){const duration=c==='\n'?9:1;if(budget<duration){if(c==='\n')travel=budget/duration;break;}budget-=duration;count++;}
  const key=frame.index+':'+count+':'+frame.segment.board;
  const ctx=board.ctx;
  if(board.lastDraw!==key){
    board.lastDraw=key;ctx.fillStyle='#234d48';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#f2e9cd';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='28px Microsoft YaHei';
    full.slice(0,count).join('').split('\n').forEach((line,i)=>ctx.fillText(line,75,142+i*32));board.tex.needsUpdate=true;
  }
  const lines=full.slice(0,count).join('').split('\n'),line=lines.length-1;
  const target={x:board.mesh.position.x-3.5+(75+ctx.measureText(lines[line]).width)/1024*7,y:board.mesh.position.y+.6-(142+line*32)/256*1.2,z:board.mesh.position.z+.001};
  if(travel!==null){const t=travel*travel*(3-2*travel);target.x+=(board.mesh.position.x-3.5+75/1024*7-target.x)*t;target.y-=32/256*1.2*t;}
  frame.penDown=travel===null;return target;
}

export const indoorLifeMethods={
  updateReading(rig,dt,active,phase=0){
    if(active)createReadingMotion(THREE,rig,{phase});
    rig.readingMotion?.update(dt,{active});
  },
  updateTeaching(teacher,dt,frame){
    const sample=sampleTeachingPose(THREE,teacher.rig,{...frame,progress:frame.poseProgress,board:teacher.board});
    const root=this.root(teacher.rig);root.position.copy(sample.rootPosition);root.quaternion.copy(sample.rootQuaternion);
    teacher.contact=applyTeachingPose(THREE,teacher.rig,sample);
  },
  makeIndoorPeople(){
    const room=this.room;room.walkers=[];
    // Use the clear corridor and the inner aisle; never cross desks or walls.
    for(let floor=0;floor<room.floors;floor++)for(let i=0;i<4;i++){
      const side=i%2?-1:1,half=i<2?1:-1,y=floor*3.6,z=half*7;
      const route=[{x:side*.7,z:floor===0?22:15.5},{x:side*.7,z},{x:side*2.5,z},{x:side*3.8,z},{x:side*3.8,z:z-side*2}];
      const rig=this.avatar(['female-blue','green','female-orange','purple'][i]);
      const walker={rig,floor,name:['小宋','小吴','小方','小赵'][i],route,index:0,dir:1,pause:i*3+floor,wait:0,door:room.doors.find(d=>d.floor===floor&&Math.sign(d.x)===side&&Math.sign(d.z)===half),kind:'indoor-walker',trips:0};
      const root=this.root(rig);root.position.set(route[0].x,y,route[0].z);room.groups[floor].add(root);room.walkers.push(walker);
    }
  },
  updateIndoorPeople(dt){
    if(!this.room)return;const room=this.room;
    for(const s of room.students)if(Math.abs(s.floor-this.currentFloor)<=1){
      s.rig.readingMotion?.resetPose();resetTeachingPose(s.rig);resetRolePose(s.rig);updateAvatar(s.rig,dt,0,'sit');
      updateRoleAction(s.rig,dt,room.type==='dining'?'chatting':'reading');
      this.updateReading(s.rig,dt,room.type!=='dining',s.phase);
    }
    for(const w of room.walkers||[]){
      const root=this.root(w.rig);w.pause=Math.max(0,w.pause-dt);let speed=0;
      if(w.dir===0)w.dir=-1;if(!w.pause){
        const target=w.route[w.index],dx=target.x-root.position.x,dz=target.z-root.position.z,d=Math.hypot(dx,dz);
        const nearbyDoors=room.doors.filter(d=>Math.abs(d.y-root.position.y)<1&&Math.hypot(root.position.x-d.x,root.position.z-d.z)<3);
        const nearDoor=nearbyDoors.length>0;
        for(const d of nearbyDoors){d.open=true;d.target=-Math.PI*.53;d.npcUntil=this.time+2;}
        const playerNear=w.floor===this.currentFloor&&root.position.distanceTo(this.position)<.75;
        if(d<.04){
          if(w.index===w.route.length-1){w.dir=-1;w.pause=7+(w.floor%3);}
          if(w.index===0&&w.dir<0){w.dir=1;w.pause=5;w.trips++;}
          w.index+=w.dir;
        }else if(!playerNear&&(!nearDoor||nearbyDoors.every(d=>Math.abs(d.amount)>1.3))){
          const step=Math.min(d,1.25*dt),nx=root.position.x+dx/d*step,nz=root.position.z+dz/d*step;
          const obstructed=room.colliders.some(c=>root.position.y+1.5>c.minY+.05&&root.position.y<c.maxY-.05&&nx>c.x0-.23&&nx<c.x1+.23&&nz>c.z0-.23&&nz<c.z1+.23)||room.doors.some(d=>this.doorBlocked(d,nx,root.position.y,nz,.23));
          if(!obstructed){root.position.x=nx;root.position.z=nz;root.rotation.y=Math.atan2(dx,dz);speed=step/dt;}
        }
      }
      if(Math.abs(w.floor-this.currentFloor)<=1){w.rig.readingMotion?.resetPose();resetTeachingPose(w.rig);resetRolePose(w.rig);updateAvatar(w.rig,dt,speed,'idle');updateRoleAction(w.rig,dt,w.pause>0&&w.dir<0?'reading':'idle');this.updateReading(w.rig,dt,w.pause>0&&w.dir<0);}
      w.speed=speed;
    }
    for(const d of room.doors)if(d.kind==='room'&&d.npcUntil&&this.time>d.npcUntil&&this.time>(d.manualUntil||0)&&Math.hypot(this.position.x-d.x,this.position.z-d.z)>2){d.open=false;d.target=0;d.npcUntil=0;}
    for(const [i,t] of room.teachers.entries())if(Math.abs(t.floor-this.currentFloor)<=1){
      const active=this.lecture&&this.audio&&t===this.seatTeacher;
      const options=this.lectures.filter(c=>c.subject===t.subject?.id),ambient=options[Math.floor(this.time/95+i)%Math.max(1,options.length)]||this.lectures[0];
      const course=active?this.lecture.course:ambient,time=active?this.audio.currentTime:(this.time+i*3)%course.duration;
      const frame=lectureFrame(course,time),target=drawBoard(t.board,frame);
      t.rig.readingMotion?.update(0,{active:false});resetTeachingPose(t.rig);resetRolePose(t.rig);updateAvatar(t.rig,dt,0,'idle');updateRoleAction(t.rig,dt,'teaching');
      this.updateTeaching?.(t,dt,{...frame,time,paused:active&&this.audio.paused,boardTarget:target});
      t.action=frame.phase;t.chalkProgress=frame.progress;
    }
  }
};
