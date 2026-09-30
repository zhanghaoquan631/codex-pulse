/* Capture external image drags while the browser's DataTransfer is readable.
 * Never inserts dragged HTML into the page or reads native file:// paths.
 * Remote URLs are resolved only by the caller's guarded, owner-only image API.
 */
(() => {
  'use strict';
  const MAX_DATA_BYTES=25*1024*1024,MAX_COUNT=20;
  const MAX_PAYLOAD_CHARS=Math.ceil(MAX_DATA_BYTES*4/3)+65536;
  const mimePattern=/^image\/(png|jpeg|gif|webp)$/i;
  const extensions={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
  const localFileMessage='微信只提供了本地图片路径，浏览器无法直接读取。请从微信拖动原图或图片文件，或点素材箱的“添加图片”选择原图。';
  function transferTypes(transfer){try{return Array.from(transfer?.types||[]);}catch{return [];}}
  function accepts(transfer){
    const types=transferTypes(transfer);
    return Boolean(transfer?.files?.length)||types.some(type=>['Files','text/html','text/uri-list','text/plain'].includes(type))||Array.from(transfer?.items||[]).some(item=>item.kind==='file');
  }
  function capture(transfer,boxId=''){
    const files=[],sources=[],issues=[],seenFiles=new Set(),seenSources=new Set();
    let tooMany=false;
    const keepFile=file=>{if(file&&!seenFiles.has(file)){seenFiles.add(file);files.push(file);if(files.length>MAX_COUNT)tooMany=true;}};
    for(const file of Array.from(transfer?.files||[]))keepFile(file);
    for(const item of Array.from(transfer?.items||[])){
      if(item.kind==='file')try{keepFile(item.getAsFile());}catch{issues.push('未能读取拖入的图片文件，请重新拖动原图。');}
    }
    function keepSource(value,source){
      const raw=String(value||'').trim();if(!raw)return;
      if(raw.length>MAX_PAYLOAD_CHARS){issues.push('拖入的图片数据过大，单张图片最大 25 MB。');return;}
      let kind,url=raw;
      if(/^file:/i.test(raw)||/^[a-z]:[\\/]/i.test(raw)){issues.push(localFileMessage);return;}
      if(/^data:/i.test(raw))kind='data';
      else if(/^blob:/i.test(raw))kind='blob';
      else{
        try{const parsed=new URL(raw);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return;parsed.hash='';url=parsed.href;kind='remote';}catch{return;}
        if(url.length>4096){issues.push('图片地址过长，请直接拖入图片文件。');return;}
      }
      if(seenSources.has(url))return;
      seenSources.add(url);sources.push(Object.freeze({kind,url,source}));if(sources.length>MAX_COUNT)tooMany=true;
    }
    const getData=type=>{try{return String(transfer?.getData?.(type)||'');}catch{return '';}};
    // A detached template's contents are inert: scripts/events/images are not run.
    const html=getData('text/html');
    if(html.length>MAX_PAYLOAD_CHARS)issues.push('拖入的图片数据过大，单张图片最大 25 MB。');
    else if(html){
      const template=document.createElement('template');template.innerHTML=html;
      for(const image of template.content.querySelectorAll('img'))keepSource(image.getAttribute('data-original')||image.getAttribute('data-src')||image.getAttribute('src'),'html-image');
    }
    const uris=getData('text/uri-list');
    if(uris.length>MAX_PAYLOAD_CHARS)issues.push('拖入的图片地址数据过大，请直接拖动原图。');
    else for(const uri of uris.split(/\r?\n/))if(uri.trim()&&!uri.trim().startsWith('#'))keepSource(uri,'uri-list');
    const text=getData('text/plain');
    // WeChat can expose just a file URL; keep the actionable fallback instruction.
    if(text.length>MAX_PAYLOAD_CHARS)issues.push('拖入的图片数据过大，单张图片最大 25 MB。');
    else if(/^(?:data:|blob:|file:|[a-z]:[\\/])/i.test(text.trim()))keepSource(text,'plain-image');
    else if(/^https?:\/\/\S+$/i.test(text.trim())){
      try{const url=new URL(text.trim());if(/\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname)||/(?:^|\.)qpic\.cn$/.test(url.hostname)||/(?:^|\.)qlogo\.cn$/.test(url.hostname))keepSource(text,'plain-image');}catch{}
    }
    return Object.freeze({boxId:String(boxId),files:Object.freeze(files),sources:Object.freeze(sources),issues:Object.freeze([...new Set(issues)]),tooMany});
  }
  function problem(message,boxId,code='MATERIAL_DROP_INVALID'){
    const error=new Error(message);error.code=code;error.boxId=boxId;return error;
  }
  function imageMime(file){return mimePattern.test(file?.type||'')?file.type.toLowerCase():!file?.type?extensions[String(file?.name||'').split('.').pop().toLowerCase()]||'':'';}
  function checkedFile(file,maxBytes,boxId,name){
    const type=imageMime(file);
    if(!file||!type||!file.size||file.size>maxBytes||typeof file.slice!=='function')throw problem(`「${file?.name||name||'图片'}」无法添加：请选择不超过 ${Math.floor(maxBytes/1024/1024)} MB 的 JPG、PNG、GIF 或 WebP 图片。`,boxId);
    if(!file.type||!file.name){const extension=type.split('/')[1].replace('jpeg','jpg'),suggested=file.name||name||'微信图片';return new File([file],/\.(png|jpe?g|gif|webp)$/i.test(suggested)?suggested:suggested+'.'+extension,{type,lastModified:file.lastModified||Date.now()});}
    return file;
  }
  function dataFile(source,boxId,index){
    const match=/^data:(image\/(?:png|jpeg|gif|webp))(;base64)?,([\s\S]*)$/i.exec(source.url);
    if(!match)throw problem('拖入的图片数据格式不支持，请使用 JPG、PNG、GIF 或 WebP 原图。',boxId);
    const type=match[1].toLowerCase(),encoded=match[3];let bytes;
    if(match[2]){
      const clean=encoded.replace(/\s/g,'');
      if(clean.length>Math.ceil(MAX_DATA_BYTES*4/3)+4||!/^[a-z0-9+/]*={0,2}$/i.test(clean))throw problem('拖入的图片数据无效或超过 25 MB，请直接拖动原图。',boxId);
      let decoded;try{decoded=atob(clean);}catch{throw problem('拖入的图片数据无效，请直接拖动原图。',boxId);}
      if(!decoded.length||decoded.length>MAX_DATA_BYTES)throw problem('拖入的图片数据无效或超过 25 MB，请直接拖动原图。',boxId);
      bytes=Uint8Array.from(decoded,char=>char.charCodeAt(0));
    }else{
      if(encoded.length>MAX_DATA_BYTES*3)throw problem('拖入的图片数据超过 25 MB，请直接拖动原图。',boxId);
      const values=[];
      for(let i=0;i<encoded.length;i++){
        if(encoded[i]==='%'){if(!/^[a-f0-9]{2}$/i.test(encoded.slice(i+1,i+3)))throw problem('拖入的图片数据无效，请直接拖动原图。',boxId);values.push(parseInt(encoded.slice(i+1,i+3),16));i+=2;}
        else{const value=encoded.charCodeAt(i);if(value>255)throw problem('拖入的图片数据无效，请直接拖动原图。',boxId);values.push(value);}
        if(values.length>MAX_DATA_BYTES)throw problem('拖入的图片数据超过 25 MB，请直接拖动原图。',boxId);
      }
      bytes=new Uint8Array(values);
    }
    return new File([bytes],'微信图片-'+(index+1)+'.'+type.split('/')[1].replace('jpeg','jpg'),{type});
  }
  function readBytes(file){
    if(typeof file.arrayBuffer==='function')return file.arrayBuffer().then(value=>new Uint8Array(value));
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result));reader.onerror=()=>reject(reader.error||Error('无法读取图片文件'));reader.readAsArrayBuffer(file);});
  }
  async function exactFileDedupe(files){
    const output=[],buckets=new Map(),bytes=new Map();
    const value=async file=>{if(!bytes.has(file))bytes.set(file,readBytes(file));return bytes.get(file);};
    for(const file of files){
      if(output.includes(file))continue;
      // Equal metadata alone is insufficient: distinct pictures can have the same name/size/date.
      const key=[file.name,file.size,file.type,file.lastModified].join('\0'),bucket=buckets.get(key)||[];let duplicate=false;
      for(const prior of bucket){const a=await value(prior),b=await value(file);if(a.length===b.length&&a.every((byte,index)=>byte===b[index])){duplicate=true;break;}}
      if(!duplicate){bucket.push(file);buckets.set(key,bucket);output.push(file);}
    }
    return output;
  }
  function createJob(snapshot){
    if(!snapshot||typeof snapshot.boxId!=='string')throw Error('请先在 drop 事件中同步捕获图片和目标素材箱。');
    const resolvedSources=new Map();let completed=null,inflight=null;
    const job={boxId:snapshot.boxId,snapshot,resolve(options={}){
      if(completed)return Promise.resolve(completed);if(inflight)return inflight;
      inflight=(async()=>{
        const maxBytes=Number.isFinite(options.maxImageBytes)&&options.maxImageBytes>0?options.maxImageBytes:MAX_DATA_BYTES;
        let files=[];
        // Prefer the original native File channel over its HTML thumbnail/remote alias.
        if(snapshot.files.length){
          for(const file of snapshot.files)files.push(checkedFile(file,maxBytes,snapshot.boxId));
          files=await exactFileDedupe(files);
        }else{
          if(snapshot.tooMany)throw problem('一次最多添加 20 张图片，请分批拖入。',snapshot.boxId);
          for(let index=0;index<snapshot.sources.length;index++){
            const source=snapshot.sources[index];let file=resolvedSources.get(source.url);
            if(!file){
              if(source.kind==='data')file=dataFile(source,snapshot.boxId,index);
              else if(source.kind==='blob'){
                let url;try{url=new URL(source.url);}catch{}
                if(!url||url.origin!==location.origin)throw problem('微信的临时预览地址无法由当前网页读取，请拖动原图文件或使用“添加图片”。',snapshot.boxId);
                let response;try{response=await fetch(source.url,{credentials:'omit'});}catch{throw problem('临时图片已不可读取，请拖动原图文件或使用“添加图片”。',snapshot.boxId);}
                if(!response.ok)throw problem('临时图片已不可读取，请重新拖入原图。',snapshot.boxId);
                const blob=await response.blob();if(blob.size>MAX_DATA_BYTES)throw problem('拖入的图片超过 25 MB，请直接拖动原图。',snapshot.boxId);
                file=checkedFile(blob,Math.min(maxBytes,MAX_DATA_BYTES),snapshot.boxId,'微信图片-'+(index+1));
              }else{
                if(typeof options.requestRemoteImage!=='function')throw problem('此图片需要通过已登录的图片导入服务读取，请直接拖动原图文件或使用“添加图片”。',snapshot.boxId);
                try{file=await options.requestRemoteImage(source);}catch(error){throw problem((error?.message||'图片读取失败')+'；图片地址和目标素材箱已保留，可重试。',snapshot.boxId,'MATERIAL_DROP_RETRY');}
              }
              file=checkedFile(file,Math.min(maxBytes,MAX_DATA_BYTES),snapshot.boxId,'微信图片-'+(index+1));resolvedSources.set(source.url,file);
            }
            files.push(file);
          }
          files=await exactFileDedupe(files);
        }
        if(!files.length)throw problem(snapshot.issues[0]||'没有读到可用的图片，请从微信拖动原图或图片文件，也可点“添加图片”选择原图。',snapshot.boxId);
        if(files.length>MAX_COUNT)throw problem('一次最多添加 20 张图片，请分批拖入。',snapshot.boxId);
        completed=Object.freeze({boxId:snapshot.boxId,files:Object.freeze(files),issues:Object.freeze([])});return completed;
      })().finally(()=>{inflight=null;});return inflight;
    }};
    return Object.freeze(job);
  }
  const resolve=(snapshot,options)=>createJob(snapshot).resolve(options);
  window.LinganMaterialDrop=Object.freeze({accepts,capture,resolve,createJob,MAX_DATA_BYTES,MAX_COUNT});
})();
