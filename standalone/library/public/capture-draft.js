// Capture helpers are shared by the plain-script UI and its regression tests.
var CaptureDraft = (() => {
  const fields = ['composerTitle','composerBody','composerUrl','composerSource','composerTags',
    'composerRating','composerStatus','composerSequence','composerCover','composerCaption','composerTextStyle'];
  const key = id => 'lingan-capture-draft:' + (id || 'new');
  const values = input => Object.fromEntries(fields.map(name => [name,
    typeof input?.[name] === 'string' ? input[name] : String(input?.[name] ?? '')]));
  function write(storage, id, input, preview, base) {
    try {
      const data = values(input);
      const baseline = base ? values(base) : null;
      if (baseline && fields.every(name=>data[name]===baseline[name])) return clear(storage,id);
      storage.setItem(key(id),JSON.stringify({version:2,values:data,base:baseline,preview,updatedAt:Date.now()}));
      return true;
    } catch { return false; }
  }
  function read(storage, id) {
    try {
      const data=JSON.parse(storage.getItem(key(id)) || 'null');
      return [1,2].includes(data?.version) && data.values ? {values:values(data.values),base:data.base?values(data.base):null,preview:data.preview || null} : null;
    } catch { return null; }
  }
  function clear(storage,id) { try { storage.removeItem(key(id)); return true; } catch { return false; } }
  function restore(draft,current,existing) {
    const result=values(current),conflicts=[];
    for(const name of fields) {
      const local=draft.values[name],base=draft.base?.[name];
      if(name==='composerTextStyle'&&!local)continue;
      if(local===result[name] || (draft.base && local===base)) continue;
      if(existing && (!draft.base || result[name]!==base)) conflicts.push(name);
      else result[name]=local;
    }
    return {values:result,conflicts};
  }
  function mergePreview(before,current,automatic,incoming) {
    const updates={};
    for(const name of ['composerTitle','composerBody','composerCover','composerCaption']) {
      const value=incoming[name];
      // Never erase an existing field with an incomplete response, overwrite a
      // user's existing note, or replace text edited while the request ran.
      if(typeof value==='string' && value.trim() && current[name]===before[name] &&
        (!before[name].trim() || before[name]===automatic[name])) updates[name]=value;
    }
    return updates;
  }
  return {fields,write,read,clear,restore,mergePreview};
})();
