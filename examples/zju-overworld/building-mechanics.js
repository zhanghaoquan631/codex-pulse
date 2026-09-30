import * as THREE from './vendor/three.module.js';
import {applyClimbPose} from './windows.js?v=11';
import {outsideCamera} from './interior-view.js?v=11';
const $=id=>document.getElementById(id),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const stateNames={open:'门已打开',opening:'正在开门',closing:'正在关门',closed:'已关门 · 请选择楼层',ready:'已关门 · 请选择楼层',moving:'运行中',idle:'等待乘梯'};
export const buildingMechanics={
  bindBuildingControls(){
    $('window-toggle').onclick=()=>this.toggleWindow();$('window-climb').onclick=()=>this.climbWindow();
    $('lift-call').onclick=()=>this.callLift();$('lift-open').onclick=()=>this.room?.elevator.openDoor();$('lift-close').onclick=()=>this.room?.elevator.closeDoor();
  },
  setupBuildingMechanics(){
    this.climbing=null;this.liftState=null;const list=$('lift-floors');list.replaceChildren();
    for(let i=this.room.floors-1;i>=0;i--){const b=document.createElement('button');b.textContent=String(i+1);b.setAttribute('aria-label',`前往 ${i+1} 楼`);b.onclick=()=>this.selectLiftFloor(i);list.append(b);}
  },
  callLift(){
    const lift=this.room?.elevator;if(!lift||distance(this.position,{x:0,z:-13.8})>3.6)return false;
    this.cancelNavigation();lift.call(this.currentFloor);this.env.toast(`已呼叫电梯，请在 ${this.currentFloor+1} 楼门外等候。`);return true;
  },
  selectLiftFloor(floor){
    const lift=this.room?.elevator;if(!lift||!lift.containsCabin(this.position)){this.env.toast('请先走进电梯轿厢。');return false;}
    if(lift.doorAmount>.02){lift.closeDoor();this.env.toast('正在关门，门关闭后请选择楼层。');return false;}
    if(this.liftState?.state==='moving')return false;
    this.cancelNavigation();this.autoRun=false;this.keys.clear();return lift.requestFloor(floor);
  },
  useLift(delta){return this.selectLiftFloor(this.currentFloor+delta);},
  updateBuildingMechanics(dt){
    if(this.updateExteriorClimb(dt))return true;
    if(!this.room)return false;
    for(const w of this.room.windows||[])w.update(dt);
    const lift=this.room.elevator;
    if(lift){const beforeY=this.position.y;this.liftState=lift.update(dt,this.position);
      if(this.liftState.carrying){this.position.y=beforeY+this.liftState.deltaY;this.velocityY=0;this.grounded=true;}
    }
    if(!this.climbing)return false;
    const c=this.climbing;
    if(c.aligning){const p=c.window.getClimbPoint(0),dx=p.x-this.position.x,dz=p.z-this.position.z,d=Math.hypot(dx,dz);this.heading=Math.atan2(dx,dz);this.speed=1.8;if(d>.06){this.move(dx/d*Math.min(d,1.8*dt),dz/d*Math.min(d,1.8*dt));c.alignTime+=dt;if(c.alignTime>4){this.climbing=null;this.env.toast('窗边被挡住了，请走近空出来的半扇窗再翻出。');}return true;}c.aligning=false;}
    c.elapsed+=dt;const t=Math.min(1,c.elapsed/c.duration),p=c.window.getClimbPoint(t);this.position.set(p.x,p.y,p.z);this.heading=c.window.side>0?Math.PI/2:-Math.PI/2;this.yaw=this.heading;this.velocityY=0;this.grounded=false;this.speed=0;
    if(t===1){this.climbing=null;this.velocityY=-.3;this.exitAtHeight(c.window.side,0);}
    return true;
  },
  updateBuildingUI(){
    const room=this.room,lift=room?.elevator;
    if(!room){$('floor-controls').hidden=true;this.updateExteriorWindowUI();return;}
    const candidates=(room.windows||[]).filter(w=>Math.abs(w.y-this.position.y)<1.6).sort((a,b)=>distance(a.insidePoint,this.position)-distance(b.insidePoint,this.position));
    this.nearWindow=candidates[0]&&distance(candidates[0].insidePoint,this.position)<2.8?candidates[0]:null;
    $('window-controls').hidden=!this.nearWindow&&!this.climbing;
    const w=this.nearWindow||this.climbing?.window;
    if(w){$('window-climb').textContent='扶窗翻出 · X';$('window-toggle').textContent=w.open?'关闭窗户 · E':'打开窗户 · E';$('window-toggle').disabled=!!this.climbing;$('window-climb').disabled=!w.isPassable||!!this.climbing;$('window-status').textContent=this.climbing?'正在翻过窗台':w.isPassable?'窗户已打开，可以翻窗':'推拉窗 · 先打开，再翻窗';}
    const inside=lift?.containsCabin(this.position),near=lift&&(inside||distance(this.position,{x:0,z:-14.1})<4);
    $('floor-controls').hidden=!near;
    if(near){const s=this.liftState||lift;$('floor-label').textContent=`${Math.round(lift.y/3.6)+1} F`;$('lift-status').textContent=(stateNames[s.state]||s.state||'等待乘梯')+(s.state==='moving'?` · 前往 ${(s.target??0)+1} 楼`:inside?'':' · 按 E 呼梯');
      $('lift-call').hidden=!!inside;$('lift-floors').hidden=!inside;$('lift-open').disabled=!inside||s.state==='moving';$('lift-close').disabled=!inside||s.state==='moving';
      for(const b of $('lift-floors').children){const floor=Number(b.textContent)-1;b.disabled=!inside||lift.doorAmount>.02||s.state==='moving';b.classList.toggle('active',floor===this.currentFloor);}
      $('floor-up').disabled=!inside||lift.doorAmount>.02||s.state==='moving'||this.currentFloor>=room.floors-1;$('floor-down').disabled=!inside||lift.doorAmount>.02||s.state==='moving'||this.currentFloor===0;
    }
  },
  toggleWindow(){const w=this.nearWindow;if(!w||this.climbing||this.exteriorClimb)return false;this.cancelNavigation();w.setOpen(!w.open);return true;},
  climbWindow(){
    if(this.nearWindow?.exterior)return this.beginExteriorClimb();
    const w=this.nearWindow;if(!w||!w.isPassable||this.climbing||this.seated)return false;
    this.cancelNavigation();this.autoRun=false;this.keys.clear();this.demo=null;this.resetMotion();
    // First step aligns with the open half, then hands and knees clear the sill.
    this.climbing={window:w,elapsed:0,duration:2.8,aligning:true,alignTime:0};this.env.toast('正在扶住窗台翻出，落下时可用方向键调整方向。');return true;
  },
  applyBuildingPose(){if(this.exteriorClimb)applyClimbPose(this.player,Math.min(1,this.exteriorClimb.elapsed/2.8));if(this.climbing&&!this.climbing.aligning)applyClimbPose(this.player,Math.min(1,this.climbing.elapsed/this.climbing.duration));},
  checkExteriorFall(){
    if(!this.room||this.climbing)return;
    const p=this.position;if(Math.abs(p.x)>16.55||(p.z>18.4&&p.z<22.6&&Math.abs(p.x)>4.45&&p.y>.5))this.exitAtHeight(Math.sign(p.x),0);else if(p.z>22.55&&p.y>.5)this.exitAtHeight(0,1);else if(p.z< -18.55)this.exitAtHeight(0,-1);
  },
  exitAtHeight(nx,nz){
    const room=this.room;if(!room)return false;const door=room.feature.entrance,local=this.position.clone(),world=this.doorWorld(door,local.x,local.z-18),c=Math.cos(door.angle),s=Math.sin(door.angle),normal={x:nx*c+nz*s,z:-nx*s+nz*c};
    // Schematic room dimensions differ from the mapped footprint: anchor the exit to its outer facade.
    let offset=0;while(offset<180&&this.env.buildings.some(f=>this.env.contains(f,world.x+normal.x*offset,world.z+normal.z*offset)))offset+=.5;
    world.x+=normal.x*(offset+.65);world.z+=normal.z*(offset+.65);
    const y=local.y+.16,velocity=this.velocityY,yaw=this.yaw-door.angle,heading=this.heading+door.angle,keys=[...this.keys],mode=this.mode;
    const camera=outsideCamera(this.camera,door);camera.position.x+=normal.x*(offset+.65);camera.position.z+=normal.z*(offset+.65);
    this.leaveBuilding();this.position.set(world.x,y,world.z);this.velocityY=velocity;this.grounded=false;this.yaw=yaw;this.heading=heading;this.portalCooldown=2.5;this.mode=mode;this.setMode(mode);keys.forEach(k=>this.keys.add(k));this.camera.position.copy(camera.position);this.camera.quaternion.copy(camera.quaternion);this.snapCamera=false;this.lastPosition.copy(this.position);return true;
  },
  getBuildingState(){return {climbing:!!this.climbing,window:this.nearWindow?{open:this.nearWindow.open,amount:this.nearWindow.amount,passable:this.nearWindow.isPassable}:null,elevator:this.liftState?{...this.liftState}:null,vehicleDrivers:this.vehicles.filter(v=>v.rider).length};}
};
