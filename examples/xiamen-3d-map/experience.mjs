import {mountPlaceDiscovery} from './place-discovery.mjs';
import {mountCommunity} from './community.mjs';
import {mountItineraries} from './itineraries.mjs';
import {mountLocalGuide} from './local-guide.mjs';
import {attachPhotoDetail} from './photo-detail.mjs';
import {mountPassport} from './passport.mjs';
export function attachExperience({places,extraPlaces=[],getSelected,getGardenStop=()=>null,showAbout,stopTour,pauseTour=stopTour,focusPlace,openTravel}){
 const panel=document.createElement('nav');panel.className='scene-settings glass';panel.setAttribute('aria-label','探索互动');document.body.append(panel);
 const more=document.createElement('button');more.id='scene-more';more.textContent='更多设置';more.setAttribute('aria-expanded','false');panel.prepend(more);panel.classList.add('mobile-collapsed');more.onclick=()=>{const collapsed=panel.classList.toggle('mobile-collapsed');more.setAttribute('aria-expanded',String(!collapsed));more.textContent=collapsed?'更多设置':'收起设置';};
 const dialog=document.createElement('dialog');dialog.className='detail-dialog';dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">EXPLORE XIAMEN</span><button aria-label="关闭景点详情">×</button></div><h2></h2><p class="intro"></p><p class="tip"></p><a class="place-source" target="_blank" rel="noopener noreferrer" hidden>景点资料来源 ↗</a><a class="google-link" target="_blank" rel="noopener noreferrer">在谷歌地图查看此处 ↗</a><p class="about-note">地图定位是游览参考点。实际入口、预约及交通请以现场和官方信息为准。</p>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
 const photoDetail=attachPhotoDetail(dialog);
 const detail=document.createElement('button');detail.className='detail-open';detail.textContent='景点详情';document.querySelector('#location-card').append(detail);
 const descriptions=[['在鼓浪屿的历史街巷看闽南传统与外来建筑风格交融。','建议留出半天以上步行探索；渡轮和景区资讯出发前再确认。'],['沿中山路骑楼街区感受老城的日常。','建议与鼓浪屿或八市片区安排在同一天，按体力调整步行距离。'],['从沙坡尾避风坞一带走进厦门的海边街区。','建议慢走街巷，和演武大桥观景一带串联。'],['从临海平台观看厦门海岸与桥梁。','建议与沙坡尾安排在同一段行程，留出停下来观景的时间。'],['以校园为目的地的厦门南部游览点。','进入校园的办法以学校当前规定为准；地图上的点位并非入口。'],['位于厦门岛南部的寺院游览点。','建议与周边山海景观串联，尊重寺院现场的参访要求。'],['厦门岛的山地园林游览点。','可在官方服务页核查购票预约与园区服务，再安排入口和步行路线。'],['靠近环岛路的街巷游览点。','建议与海边步行结合，避开把整天行程集中在商业街。'],['黄厝海滩位于厦门岛东南侧的滨海步行带。','建议根据天气选择海边步行时段，按现场条件安排活动。'],['环岛路串联演武大桥、曾厝垵与黄厝等滨海地点。','这是路线代表点，建议按住宿位置挑选一段步行或骑行。'],['在集美学村的校舍和街道间感受滨海人文片区。','建议留出半天，减少与岛南部景点之间的来回折返。'],['从海沧湾一带看厦门岛西侧的海湾岸线。','建议根据住宿位置，与湾区观景安排在同一段行程。']];
 const sources={0:'https://whc.unesco.org/en/list/1541',6:'https://ixm.xm.gov.cn/yyzx/202411/t20241106_97544.htm?type=web',8:'https://www.fj.gov.cn/xwdt/mszx/202405/t20240510_6446361.htm',9:'https://www.fj.gov.cn/xwdt/mszx/202405/t20240510_6446361.htm',11:'https://www.xm.gov.cn/zwgk/flfg/sfwj/202109/t20210901_2580031.htm'};
 places.forEach((p,i)=>{p.description=descriptions[i][0];p.tip=descriptions[i][1];});
 Object.assign(places[4],{description:'芙蓉湖、嘉庚风格楼群与五老峰山麓相接。建南楼群顺山势呈半月形排列，前临上弦场。',tip:'校园参访以厦门大学当日规定为准。地图参考点不是预约入口，山间步道与校内通行也请现场核对。'});
 Object.assign(places[5],{description:'五老峰下的闽南寺院。殿堂、回廊依山递进，寺前有荷花池，绿瓦与飞檐形成鲜明轮廓。',tip:'尊重寺院参访规定；登山台阶与坡道请按现场标识通行。模型台阶数量和建筑高度不是实测数据。'});
 sources[4]='https://arch.xmu.edu.cn/info/1013/12593.htm';sources[5]='https://xm.fjdsfzw.org.cn/2023-09-02/content_139384.html';
 Object.assign(places[6],{description:'万石湖畔的专类植物园延伸进山林。南洋杉、竹林、棕榈、雨林和多肉区分别呈现不同植被层次。',tip:'地图快照为2026-09-13，植物数量、踏步和种植范围均为示意。园区不允许游客骑行；湖中不能游泳。开放、围挡和入口请核对官方当日信息。'});sources[6]='https://www.xiamenbg.cn/Home/yyzn2';
 Object.assign(places[7],{description:'环岛路内侧的渔村街巷。红砖民居、南洋建筑与后来的客栈、店铺交织，密集支巷与海岸步道形成不同尺度。',tip:'建筑轮廓和街巷来自地图快照；没有逐栋资料的沿街民居为补景，不代表真实店铺、门牌或开放入口。'});
 Object.assign(places[8],{description:'弧形沙滩与沿海绿地、步行道相接。沙地保留开阔视线，绿化与村落布置在海岸内侧。',tip:'海滩参考点不是安全下水点。天气、潮汐、围挡和现场警示须另行核查；人物、车流和植被为示意。'});
 Object.assign(places[9],{description:'环岛南路与海边栈道沿海岸展开。棕榈、三角梅和滨海绿地连接街区与沙滩，画面取景于石头广场附近。',tip:'只在已有地图标注的骑行道上展示骑行者，不据此承诺整段栈道均可骑行。路线与设施使用2026-09-13快照，非实时通行信息。'});
 sources[7]='https://xm.fjsen.com/wap/2019-11/04/content_30043459.htm';sources[8]=sources[9]='https://www.xinhuanet.com/politics/2017-07/25/c_1121379224.htm';
 Object.assign(places[10],{description:'龙舟池、南薰楼群与学村街巷相连。南薰楼的高塔和斜向翼楼、绿瓦屋顶与钟亭形成鲜明的嘉庚建筑轮廓。',tip:'2026年修缮报道不等于校园对游客开放。参考点不是入口，校内与园区参访规则须现场核对；建筑细部和龙舟动画为示意。'});
 Object.assign(places[11],{description:'海沧的沿海公园、观海栈道和嵩鼓码头与现代城区相接。海岸内侧是树荫步道、开阔草坪与城市街区，不再以一个名称代替整个片区。',tip:'使用2026-09-13地图快照，园路、码头点位不是实时通行或船班信息。参考点不代替登船口和现场标识；植物与设施细节为微缩表达。'});
 sources[10]='https://www.fj.gov.cn/zwgk/ztzl/sxzygwzxsgzx/flsxkmh/202603/t20260302_7103295.htm';
 detail.onclick=()=>{pauseTour();const index=getSelected(),p=getGardenStop()||places[index];if(!p){showAbout();return;}if(index===0||index===1){openTravel(index===0?'island':'oldtown');return;}dialog.querySelector('h2').textContent=p.name;dialog.querySelector('.intro').textContent=p.description;dialog.querySelector('.tip').textContent=p.tip;const source=dialog.querySelector('.place-source');source.hidden=!sources[index];if(sources[index])source.href=sources[index];const url=new URL('https://www.google.com/maps/search/');url.search=new URLSearchParams({api:'1',query:p.ll[1]+','+p.ll[0]}).toString();dialog.querySelector('.google-link').href=url.href;dialog.showModal();photoDetail.show(p.name);};
 const discovery=mountPlaceDiscovery(places,extraPlaces);mountCommunity({getPlace:()=>places[getSelected()],stopTour});mountItineraries({places,focusPlace});mountLocalGuide();
 const passport=mountPassport({places,focusPlace});
 return{recordPlace:passport.recordPlace,getPassportState:passport.getState,getDiscoveryState:discovery.getState};
}

