// A coverage mask, not a surveyed coastline. The water polygons decide dry land.
export const islandEnvelope = [[118.0515,24.4486],[118.0542,24.4537],[118.0596,24.4568],[118.0649,24.4553],[118.0670,24.4516],[118.0715,24.4470],[118.0727,24.4425],[118.0678,24.4391],[118.0610,24.4398],[118.0574,24.4422],[118.0540,24.4452]];
export function onIsland(ll) {
  let inside=false;
  for(let i=0,j=islandEnvelope.length-1;i<islandEnvelope.length;j=i++){
    const a=islandEnvelope[i],b=islandEnvelope[j];
    if((a[1]>ll[1])!==(b[1]>ll[1])&&ll[0]<(b[0]-a[0])*(ll[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function islandCoverage(meta) {
  return (x,z)=>onIsland([x/meta.sx+meta.origin[0],meta.origin[1]-z/meta.sz]);
}

// Distinct schematic silhouettes, based on the referenced exterior photographs.
// Dimensions/entrances are illustrative, not building survey data.
export const landmarkProfiles={
  bagua:{form:'dome',width:.080,depth:.054,height:.042,wall:'#e9d9bf',roof:'#a54c41'},
  trinity:{form:'trinity',width:.052,depth:.074,height:.037,wall:'#b96f59',roof:'#655b58'},
  catholic:{form:'gothic',width:.044,depth:.064,height:.043,wall:'#f0eee2',roof:'#72868a'},
  'union-chapel':{form:'chapel',width:.044,depth:.063,height:.031,wall:'#e8e2d5',roof:'#735d57'},
  haitiantang:{form:'courtyard',width:.094,depth:.064,height:.033,wall:'#b98264',roof:'#b65b40'},
  huangrongyuan:{form:'colonnade',width:.063,depth:.052,height:.036,wall:'#d7cbb0',roof:'#928b75'},
  palace:{form:'museum',width:.095,depth:.052,height:.044,wall:'#b9816d',roof:'#725851'},
  'organ-center':{form:'hall',width:.057,depth:.041,height:.033,wall:'#dbd5c5',roof:'#79615a'},
  piano:{form:'pavilion',width:.045,depth:.036,height:.025,wall:'#e9d7b9',roof:'#a85b45'},
  'sunlight-temple':{form:'temple',width:.057,depth:.039,height:.028,wall:'#cc9c5a',roof:'#a65a42'},
  'customs-tower':{form:'tower',width:.027,depth:.027,height:.075,wall:'#d9c9af',roof:'#56716a'},
  'concert-hall':{form:'hall',width:.072,depth:.052,height:.033,wall:'#eee0c2',roof:'#9c6251'}
};
