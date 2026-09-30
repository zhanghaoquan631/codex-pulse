const $=id=>document.getElementById(id);
export function pickUnheardLesson(lessons,history={},random=Math.random){
  if(!lessons.length)return null;
  const last=history.last,seen=new Set(history.seen||[]);
  let available=lessons.filter(c=>!seen.has(c.id));
  if(!available.length){seen.clear();available=lessons.filter(c=>c.id!==last);}
  if(!available.length)available=lessons;
  const next=available[Math.min(available.length-1,Math.floor(random()*available.length))];
  seen.add(next.id);history.last=next.id;history.seen=[...seen];return next;
}
export const courseMethods={
  subjectForRoom(feature,index=0){
    const subjects=this.courseSubjects||[];if(!subjects.length)return null;
    const base=Math.max(0,subjects.findIndex(s=>s.building===feature.name));return subjects[(base+index)%subjects.length];
  },
  classroomForSeat(seat){
    return this.room?.teachers?.filter(t=>t.floor===seat.floor&&Math.sign(t.board.mesh.position.x)===Math.sign(seat.x)&&Math.sign(t.board.mesh.position.z)===Math.sign(seat.z)).sort((a,b)=>Math.hypot(a.board.mesh.position.x-seat.x,a.board.mesh.position.z-seat.z)-Math.hypot(b.board.mesh.position.x-seat.x,b.board.mesh.position.z-seat.z))[0]||null;
  },
  randomLesson(subject){
    const key=subject?.id||'math',lessons=this.lectures.filter(c=>c.subject===key);let history={};
    try{history=JSON.parse(localStorage.getItem('zju-course-history-'+key)||'{}');}catch{}
    const lesson=pickUnheardLesson(lessons.length?lessons:this.lectures,history);
    try{localStorage.setItem('zju-course-history-'+key,JSON.stringify(history));}catch{}
    return lesson;
  },
  rememberLesson(course){
    const key='zju-course-history-'+course.subject;let history={};try{history=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    history.seen=[...new Set([...(history.seen||[]),course.id])];history.last=course.id;try{localStorage.setItem(key,JSON.stringify(history));}catch{}
  },
  prepareSeatCourse(seat){
    const teacher=this.classroomForSeat(seat);this.seatTeacher=teacher;
    const subject=teacher?.subject||this.courseSubjects?.[0],lessons=this.lectures.filter(c=>c.subject===subject?.id);
    $('lecture-course').replaceChildren();for(const c of lessons.length?lessons:this.lectures){const o=document.createElement('option');o.value=c.id;o.textContent=c.title;$('lecture-course').append(o);}
    return this.randomLesson(subject);
  },
  showCourseResources(course){
    this.rememberLesson(course);$('lecture-answer-details').open=false;
    const sourceArea=$('lecture-sources');sourceArea.replaceChildren();
    for(const id of course.sourceIds||[]){const source=this.courseResources?.find(s=>s.id===id);if(!source)continue;const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener';a.textContent='X · '+(source.author||source.title);sourceArea.append(a);}
    $('lecture-exercise').textContent=course.question?'想一想：'+course.question:'';$('lecture-answer').textContent=course.answer||'';$('lecture-answer-details').hidden=!course.answer;
    $('lecture-room').textContent=this.seatTeacher?`${this.room.name} · ${this.seatTeacher.roomName} · ${this.seatTeacher.name}`:'原创微课堂';
  },
  randomNextLesson(){if(!this.seated)return false;const c=this.randomLesson(this.seatTeacher?.subject);return c?this.startLecture(c.id):false;},
  visitCourse(id){
    const subject=this.courseSubjects.find(s=>s.id===id),feature=subject&&this.env.buildings.find(f=>f.name===subject.building);if(!feature)return false;
    $('course-catalog').close();$('campus-life-menu').hidden=true;$('campus-life-toggle').setAttribute('aria-expanded','false');this.enterBuilding(feature);this.activity={key:'classroom',name:subject.title+' · '+feature.name};
    const teacher=this.room.teachers.find(t=>t.subject?.id===id&&t.floor===0),seat=this.room.seats.filter(s=>!s.occupied&&s.floor===0&&this.classroomForSeat(s)===teacher).sort((a,b)=>(Math.abs(a.x-teacher.board.mesh.position.x)*10-a.z)-(Math.abs(b.x-teacher.board.mesh.position.x)*10-b.z))[0];if(!seat)return false;
    this.position.set(seat.x+.95,seat.y,seat.z);this.currentFloor=0;this.updateFloorVisibility();this.sit(seat);this.updateActivityUI();return true;
  },
  bindCourses(){
    $('lecture-subtitle').after($('lecture-panel').querySelector('.lecture-controls'));
    $('courses-button').onclick=()=>$('course-catalog').showModal();$('course-close').onclick=()=>$('course-catalog').close();
    $('lecture-next').onclick=()=>this.randomNextLesson();
    const list=$('course-list');list.replaceChildren();
    for(const subject of this.courseSubjects){
      const card=document.createElement('article'),heading=document.createElement('h3'),meta=document.createElement('p'),topics=document.createElement('p'),visit=document.createElement('button'),walk=document.createElement('button');
      heading.textContent=subject.title;meta.textContent=subject.building+' · 101教室 · '+subject.teacher;
      const lessons=this.lectures.filter(l=>l.subject===subject.id);topics.textContent=lessons.length+' 个主题 · '+lessons.map(l=>l.title.split(' · ').at(-1)).join('、');
      visit.textContent='入座随机听课';visit.onclick=()=>this.visitCourse(subject.id);walk.textContent='步行到教学楼';walk.className='course-walk';walk.onclick=()=>{const f=this.env.buildings.find(f=>f.name===subject.building);if(this.room)this.leaveBuilding();$('course-catalog').close();this.startNavigation({x:f.cx,z:f.cz});};
      card.append(heading,meta,topics,visit,walk);list.append(card);
    }
    const listX=$('course-resources');listX.replaceChildren();for(const resource of this.courseResources||[]){const a=document.createElement('a'),title=document.createElement('b'),description=document.createElement('span');a.href=resource.url;a.target='_blank';a.rel='noopener';title.textContent=resource.title||resource.author;description.textContent=resource.summary||resource.takeaway||'';a.append(title,description);listX.append(a);}
  }
};
