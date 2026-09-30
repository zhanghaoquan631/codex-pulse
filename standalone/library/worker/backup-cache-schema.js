export function validCache(x){
  return x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.id==='string'&&x.id.length>0&&
    ['long-image','issue-backup'].includes(x.kind)&&['newsletter','content'].includes(x.sourceType)&&
    typeof x.sourceId==='string'&&typeof x.title==='string'&&typeof x.createdAt==='string'&&
    /^[a-f0-9]{64}$/.test(x.sourceHash||'')&&/^\/api\/files\/[a-f0-9]{32}$/.test(x.fileUrl||'')&&
    /^[a-f0-9]{64}$/.test(x.sha256||'')&&Number.isInteger(x.size)&&x.size>0&&x.size<=25*1024*1024&&
    (x.kind==='issue-backup'?x.fileType==='application/zip':x.fileType==='image/png'&&Number.isInteger(x.width)&&x.width>0&&Number.isInteger(x.height)&&x.height>0);
}
