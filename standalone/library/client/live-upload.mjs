import {sha256} from '@noble/hashes/sha2.js';
export async function uploadRecordedReplay(source,{request,onProgress=()=>{}}){
  if(!source.complete||source.size<16||source.size>8*1024**3)throw Error('录制未完整结束，或文件超过 8 GB。已保留本机录制。');
  const hash=sha256.create(),chunkSize=8*1024**2;
  for(let offset=0;offset<source.size;offset+=chunkSize){const bytes=await source.readRange(offset,Math.min(source.size,offset+chunkSize));hash.update(new Uint8Array(await bytes.arrayBuffer()));onProgress({stage:'hash',ratio:Math.min(source.size,offset+chunkSize)/source.size});}
  const checksum=Array.from(hash.digest(),x=>x.toString(16).padStart(2,'0')).join('');
  const info=await request('/api/live/uploads',{method:'POST',body:{name:source.fileName,size:source.size,sha256:checksum,platform:source.platform,title:source.title,endedAt:source.endedAt}});
  if(!info.id||!Number.isSafeInteger(info.chunkSize)||info.chunkSize<1||info.chunkSize>chunkSize)throw Error('上传响应无效，录制保留在本机。');
  for(let offset=0,part=1;!info.complete&&offset<source.size;offset+=info.chunkSize,part++){
    await request(`/api/live/uploads/${info.id}/parts/${part}`,{method:'PUT',body:await source.readRange(offset,Math.min(source.size,offset+info.chunkSize))});
    onProgress({stage:'upload',ratio:Math.min(source.size,offset+info.chunkSize)/source.size});
  }
  const saved=await request(`/api/live/uploads/${info.id}/complete`,{method:'POST',body:{}});if(!saved.saved||!saved.item?.id)throw Error('尚未收到保存确认，录制保留在本机。');onProgress({stage:'saved',ratio:1});return saved;
}
