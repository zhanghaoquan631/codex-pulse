import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {Problem,validateState} from './state.js';
import {hash,putFile,filePattern} from './files.js';
export function references(state){return [...new Set([...state.content,...state.materials,...(state.backupCaches||[]),...state.newsletters,...state.newsletters.flatMap(x=>x.items)].flatMap(x=>[x.coverUrl,x.fileUrl,x.videoUrl]).map(x=>filePattern.exec(x||'')?.[1]).filter(Boolean))];}
export async function readBundle(bytes){
  try { return await parseBundle(bytes); }
  catch(error){ if(error instanceof Problem)throw error;throw new Problem('无法读取完整备份，请选择灵感库导出的有效 ZIP 文件'); }
}
async function parseBundle(bytes){
  let total=0;
  const files=unzipSync(bytes,{filter(entry){total+=entry.originalSize;if(total>60*1024*1024||entry.originalSize>60*1024*1024)throw new Problem('备份文件超过在线导入容量',413);return true;}});
  const manifest=JSON.parse(strFromU8(files['manifest.json']||new Uint8Array()));
  if(manifest.format!=='lingan-library-bundle'||manifest.version!==1||!manifest.entries)throw new Problem('备份格式不正确');
  if(Object.keys(files).length!==Object.keys(manifest.entries).length+1)throw new Problem('备份文件清单不一致');
  for(const [name,expected] of Object.entries(manifest.entries)){
    if(!/^(store\.json|files\/[a-f0-9]{32}(\.json)?|backups\/mezip-(?:private-library|x-activity)\/[a-f0-9]{64}\.json)$/.test(name)||!files[name]||files[name].length!==expected.size||await hash(files[name])!==expected.sha256)throw new Problem('备份校验失败：'+name);
  }
  const state=validateState(JSON.parse(strFromU8(files['store.json'])));
  for(const key of ['content','materials','tags','newsletters'])if(state[key].length!==manifest.counts[key])throw new Problem('备份记录数量不一致');
  if(state.backupCaches.length!==(manifest.counts.backupCaches||0)||manifest.counts.materialBoxes!==undefined&&state.materialBoxes.length!==manifest.counts.materialBoxes)throw new Problem('备份缓存或素材箱数量不一致');
  const refs=references(state);if(refs.length!==manifest.fileCount)throw new Problem('备份附件数量不一致');
  const attachments=refs.map(id=>{const name='files/'+id;if(!files[name]||!files[name+'.json'])throw new Problem('备份缺少附件');const info=JSON.parse(strFromU8(files[name+'.json']));if(info.id!==id||info.url!=='/api/files/'+id||info.sha256!==manifest.entries[name].sha256||info.size!==files[name].length)throw new Problem('附件信息不一致');return {id,bytes:files[name],info};});
  const sourceBackups=Object.entries(files).filter(([name])=>/^backups\/mezip-(?:private-library|x-activity)\//.test(name));
  return {state,attachments,manifest,sourceBackups};
}
export async function uploadBundleFiles(env,bundle){
  for(const x of bundle.attachments)await putFile(env,x.bytes,x.info.name,{id:x.id,sourceUrl:x.info.sourceUrl});
  for(const [name,bytes] of bundle.sourceBackups)await env.BUCKET.put(name,bytes);
}
export async function exportBundle(env,state){
  const files={'store.json':strToU8(JSON.stringify(state))},entries={};let size=files['store.json'].length;
  const refs=references(state);
  for(const id of refs){const object=await env.BUCKET.get('files/'+id);if(!object)throw new Problem('附件缺失，已停止备份',503);size+=object.size;if(size>60*1024*1024)throw new Problem('备份较大，请使用电脑同步副本导出',413);files['files/'+id]=new Uint8Array(await object.arrayBuffer());files['files/'+id+'.json']=strToU8(object.customMetadata.info);}
  let sourcePaths=state.sourceBackupPaths;
  if(!Object.hasOwn(state,'sourceBackupPaths')){
    const sourceIndex=await env.BUCKET.get('backups/index.json');
    sourcePaths=sourceIndex?JSON.parse(strFromU8(new Uint8Array(await sourceIndex.arrayBuffer()))):[];
  }
  if(!Array.isArray(sourcePaths))throw new Problem('原始备份索引异常，已停止导出',503);
  for(const name of sourcePaths){
    if(!/^backups\/mezip-(?:private-library|x-activity)\/[a-f0-9]{64}\.json$/.test(name))throw new Problem('原始备份索引异常，已停止导出',503);
    const object=await env.BUCKET.get(name);if(!object)throw new Problem('原始备份缺失，已停止导出',503);
    size+=object.size;if(size>60*1024*1024)throw new Problem('备份较大，请使用电脑同步副本导出',413);
    files[name]=new Uint8Array(await object.arrayBuffer());
  }
  for(const [name,value] of Object.entries(files))entries[name]={size:value.length,sha256:await hash(value)};
  const manifest={format:'lingan-library-bundle',version:1,exportedAt:new Date().toISOString(),counts:Object.fromEntries(['content','materials','materialBoxes','backupCaches','tags','newsletters'].map(k=>[k,(state[k]||[]).length])),fileCount:refs.length,externalCoverCount:[...state.content,...state.newsletters,...state.newsletters.flatMap(x=>x.items)].filter(x=>/^https?:/.test(x.coverUrl||'')).length,legacyAttachmentCount:state.materials.filter(x=>x.fileName&&!x.fileUrl).length,entries};
  files['manifest.json']=strToU8(JSON.stringify(manifest));return {bytes:zipSync(files,{level:6}),manifest};
}
