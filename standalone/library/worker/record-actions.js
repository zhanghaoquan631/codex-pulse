import {Problem,plain} from './state.js';
import {issueDraft} from './weekly-edit.js';
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const activeState=state=>({...state,content:state.content.filter(x=>!x.deletedAt),newsletters:state.newsletters.filter(x=>!x.deletedAt)});
export const trashState=state=>({content:state.content.filter(x=>x.deletedAt),newsletters:state.newsletters.filter(x=>x.deletedAt)});
export function changeDeleted(state,collection,id,action,payload){
  const item=state[collection].find(x=>x.id===id);if(!item)throw new Problem('这条记录不存在',404);
  if(!plain(payload)||!equal(item,payload.base))throw new Problem('记录已在另一设备更新，请刷新后再操作',409);
  if((action==='delete')===Boolean(item.deletedAt))return {item};
  const now=new Date().toISOString();item.deletedAt=action==='delete'?now:null;item.updatedAt=now;
  return {item};
}
export function removeIssueItem(state,id,itemId,payload){
  const issue=state.newsletters.find(x=>x.id===id&&!x.deletedAt);if(!issue)throw new Problem('这期周刊不存在或已删除',404);
  if(!plain(payload)||!equal(issueDraft(issue),payload.base))throw new Problem('这期周刊已更新，请保留草稿并刷新',409);
  if(!issue.items.some(x=>x.id===itemId))throw new Problem('这条内容不在本期周刊中',404);
  issue.items=issue.items.filter(x=>x.id!==itemId);issue.updatedAt=new Date().toISOString();return {newsletter:issue};
}
export function replaceActiveContent(current,incoming){
  if(incoming.some(x=>!plain(x)))throw new Problem('导入格式不正确');
  if(incoming.some(x=>x.deletedAt||current.some(old=>old.id===x.id&&old.deletedAt)))throw new Problem('导入包含已删除记录，请先在回收站恢复',409);
  const ids=new Set(incoming.map(x=>x.id)),now=new Date().toISOString();
  return [...incoming,...current.filter(x=>!ids.has(x.id)).map(x=>x.deletedAt?x:{...x,deletedAt:now,updatedAt:now})];
}
export function updateProfile(state,payload){
  if(!plain(payload)||!plain(payload.profile)||!equal(state.profile||{},payload.base))throw new Problem('个人资料已更新，请重新打开账号面板',409);
  const {displayName,bio}=payload.profile;
  if(typeof displayName!=='string'||!displayName.trim()||displayName.length>60||typeof bio!=='string'||bio.length>160)throw new Problem('昵称需为 1–60 字，简介最多 160 字');
  state.profile={displayName:displayName.trim(),bio};return state.profile;
}
export function accountInfo(request,state){const email=request.headers.get('oai-authenticated-user-email');return {mode:'cloud',name:state.profile?.displayName||email?.split('@')[0]||'我的账号',email,profile:state.profile||{},cloudUrl:new URL(request.url).origin};}
