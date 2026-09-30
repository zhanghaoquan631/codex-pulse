import {Problem,plain} from './state.js';
const fonts=['normal','bold','italic','underline','bold-italic'];
const kinds=['important','repeated','adjective','custom'];
export function textStyleFields(value){
  if(!Object.hasOwn(value,'textStyle'))return {};
  const style=value.textStyle;
  const bad=()=>{throw new Problem('文字样式格式不正确，请重新打开样式面板');};
  if(!plain(style)||style.version!==1||typeof style.enabled!=='boolean'||!plain(style.auto)||!plain(style.styles)||!Array.isArray(style.terms)||style.terms.length>64)bad();
  if(Object.entries(style.auto).some(([key,v])=>!['important','repeated','adjective'].includes(key)||typeof v!=='boolean'))bad();
  const color=v=>typeof v==='string'&&/^#[a-fA-F0-9]{6}$/.test(v);
  for(const [key,s] of Object.entries(style.styles))if(!kinds.includes(key)||!plain(s)||!color(s.color)||!fonts.includes(s.font))bad();
  for(const term of style.terms)if(!plain(term)||typeof term.text!=='string'||!term.text.trim()||term.text.length>80||!kinds.concat('none').includes(term.category)||term.color!==undefined&&!color(term.color)||term.font!==undefined&&!fonts.includes(term.font))bad();
  if(JSON.stringify(style).length>20000)bad();
  return {textStyle:structuredClone(style)};
}
