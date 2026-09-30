export function placeZoom(place,halfHeight,aspect,mobile=false){
  if(place.halfHeight)return halfHeight/Math.max(place.halfHeight,(place.span||.3)/aspect*.60);
  return Math.min(['activity','transport','food'].includes(place.kind)?700:28,Math.max(1,place.zoom*(mobile?1.4:1)));
}
export function resumedTimeline({animation,shotStart,hiddenAt,now}){
  const paused=Math.max(0,now-hiddenAt);
  return {animation:animation?{...animation,start:animation.start+paused}:null,shotStart:shotStart+paused,lastTime:now};
}
export function searchPlaces(place,query){
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text=[place.name,place.en,place.area,...(place.tags||[])].join(' ').toLocaleLowerCase();
  return terms.every(term=>text.includes(term));
}
