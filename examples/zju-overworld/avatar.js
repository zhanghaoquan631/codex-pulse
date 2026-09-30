/* Standalone Three.js avatar asset. No downloads, textures or global dependencies. */
export const AVATAR_SPEC = {"version":1,"name":"Campus Friends — warm low-poly avatar set","coordinateSystem":{"up":"+Y","forward":"+Z","unit":"metre","floorY":0,"maxStandingHeight":1.7},"geometrySchema":{"box":"[width,height,depth]","cylinder":"[radiusTop,radiusBottom,height,radialSegments]","sphere":"[radius,widthSegments,heightSegments]","cone":"[radius,height,radialSegments]","rotation":"Euler XYZ radians","scale":"optional mesh scale [x,y,z]","joints":"transform-only nodes; null parent attaches to the internal motion root","accessory":"include a node only when its accessory tag is listed by the selected variant"},"materialDefaults":{"roughness":0.93,"metalness":0,"flatShading":true},"materials":{"skin":"#E8C39A","skinShade":"#D4AA7B","cheek":"#CB947A","eyes":"#30352F","eyeWhite":"#F6EFDF","mouth":"#855F54","hair":"#53463A","shirt":"#8B779D","shirtShade":"#6E5E7E","undershirt":"#E8DDC2","pants":"#777D78","shoe":"#605C54","sole":"#D1CCB8","accent":"#E8BC63","hat":"#C5B38B","hatBand":"#AFA17D","bag":"#A3A482","bagShade":"#7B8066","metal":"#BCAB83","glasses":"#525A56","book":"#DFB276"},"variants":{"qiushi-purple":{"label":"求是紫","description":"紫色校园外套、米色鸭舌帽、浅橄榄双肩包","materials":{},"accessories":["cap"]},"lakeside-green":{"label":"湖畔绿","description":"鼠尾草绿上衣、奶油色渔夫帽、深绿双肩包","materials":{"shirt":"#81947B","shirtShade":"#637763","pants":"#A3A08B","hat":"#DDD4B3","hatBand":"#AEA887","bag":"#718E80","bagShade":"#536D65","accent":"#DAC47F","shoe":"#6C705E"},"accessories":["bucket-hat"]},"academy-blue":{"label":"书院蓝","description":"雾蓝色外套、方框眼镜、斜挎书袋与暖橙围巾","materials":{"shirt":"#718F9D","shirtShade":"#536F7D","pants":"#666E72","hair":"#4A4540","bag":"#B6A17B","bagShade":"#907E61","accent":"#D09C65","shoe":"#555E61"},"accessories":["glasses","swept-hair","scarf","book-satchel"],"hide":["backpack","backpackPocket","bagSeam","strapL","strapR","strapTopL","strapTopR"]},"sunlight-orange":{"label":"日光橙","description":"柔橙色连帽衫、芥末黄毛线帽、深棕背包","materials":{"shirt":"#CE9666","shirtShade":"#AC7850","pants":"#777F72","hat":"#C5AF63","hatBand":"#AD9751","hair":"#6B5140","bag":"#99836C","bagShade":"#74634F","accent":"#E7CF8C","shoe":"#6C5E4D"},"accessories":["beanie","hood"]}},"joints":[{"id":"hips","parent":null,"position":[0,0.7,0],"rotation":[0,0,0]},{"id":"torso","parent":"hips","position":[0,0.08,0],"rotation":[0,0,0]},{"id":"head","parent":"torso","position":[0,0.44,0.01],"rotation":[0,0,0]},{"id":"upperArmL","parent":"torso","position":[0.265,0.31,0],"rotation":[0,0,0]},{"id":"lowerArmL","parent":"upperArmL","position":[0,-0.23,0],"rotation":[0,0,0]},{"id":"handL","parent":"lowerArmL","position":[0,-0.19,0.006],"rotation":[0,0,0]},{"id":"upperLegL","parent":"hips","position":[0.105,-0.06,0],"rotation":[0,0,0]},{"id":"lowerLegL","parent":"upperLegL","position":[0,-0.27,0],"rotation":[0,0,0]},{"id":"footL","parent":"lowerLegL","position":[0,-0.27,0.015],"rotation":[0,0,0]},{"id":"upperArmR","parent":"torso","position":[-0.265,0.31,0],"rotation":[0,0,0]},{"id":"lowerArmR","parent":"upperArmR","position":[0,-0.23,0],"rotation":[0,0,0]},{"id":"handR","parent":"lowerArmR","position":[0,-0.19,0.006],"rotation":[0,0,0]},{"id":"upperLegR","parent":"hips","position":[-0.105,-0.06,0],"rotation":[0,0,0]},{"id":"lowerLegR","parent":"upperLegR","position":[0,-0.27,0],"rotation":[0,0,0]},{"id":"footR","parent":"lowerLegR","position":[0,-0.27,0.015],"rotation":[0,0,0]}],"nodes":[{"id":"pelvis","parent":"hips","type":"box","size":[0.365,0.2,0.255],"position":[0,-0.015,0],"rotation":[0,0,0],"material":"pants","color":"#777D78"},{"id":"shirt","parent":"torso","type":"box","size":[0.435,0.35,0.3],"position":[0,0.155,0],"rotation":[0,0,0],"material":"shirt","color":"#8B779D"},{"id":"shirtHem","parent":"torso","type":"box","size":[0.44,0.055,0.31],"position":[0,0.0025,0],"rotation":[0,0,0],"material":"shirtShade","color":"#6E5E7E"},{"id":"shirtPlacket","parent":"torso","type":"box","size":[0.021,0.3,0.009],"position":[0,0.174,0.155],"rotation":[0,0,0],"material":"shirtShade","color":"#6E5E7E"},{"id":"collarL","parent":"torso","type":"box","size":[0.13,0.07,0.022],"position":[0.074,0.302,0.155],"rotation":[0,0,-0.24],"material":"undershirt","color":"#E8DDC2"},{"id":"collarR","parent":"torso","type":"box","size":[0.13,0.07,0.022],"position":[-0.074,0.302,0.155],"rotation":[0,0,0.24],"material":"undershirt","color":"#E8DDC2"},{"id":"campusBadge","parent":"torso","type":"box","size":[0.052,0.057,0.012],"position":[0.127,0.225,0.158],"rotation":[0,0,0],"material":"accent","color":"#E8BC63"},{"id":"badgeMark","parent":"torso","type":"box","size":[0.023,0.025,0.009],"position":[0.127,0.228,0.169],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2"},{"id":"neck","parent":"torso","type":"box","size":[0.135,0.12,0.14],"position":[0,0.377,0.012],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"headBlock","parent":"head","type":"box","size":[0.38,0.38,0.35],"position":[0,0.135,0],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"hairTop","parent":"head","type":"box","size":[0.392,0.075,0.358],"position":[0,0.302,-0.007],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"hairBack","parent":"head","type":"box","size":[0.39,0.245,0.065],"position":[0,0.207,-0.16],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"sideburnL","parent":"head","type":"box","size":[0.032,0.11,0.09],"position":[0.191,0.218,0.057],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"sideburnR","parent":"head","type":"box","size":[0.032,0.11,0.09],"position":[-0.191,0.218,0.057],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"earL","parent":"head","type":"box","size":[0.065,0.1,0.093],"position":[0.213,0.108,0.003],"rotation":[0,0,0],"material":"skinShade","color":"#D4AA7B"},{"id":"earR","parent":"head","type":"box","size":[0.065,0.1,0.093],"position":[-0.213,0.108,0.003],"rotation":[0,0,0],"material":"skinShade","color":"#D4AA7B"},{"id":"eyeWhiteL","parent":"head","type":"box","size":[0.063,0.052,0.014],"position":[0.077,0.151,0.181],"rotation":[0,0,0],"material":"eyeWhite","color":"#F6EFDF"},{"id":"eyeL","parent":"head","type":"box","size":[0.028,0.039,0.014],"position":[0.074,0.148,0.191],"rotation":[0,0,0],"material":"eyes","color":"#30352F"},{"id":"browL","parent":"head","type":"box","size":[0.071,0.015,0.016],"position":[0.077,0.211,0.183],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"cheekL","parent":"head","type":"box","size":[0.044,0.022,0.009],"position":[0.10856999999999999,0.075,0.179],"rotation":[0,0,0],"material":"cheek","color":"#CB947A"},{"id":"eyeWhiteR","parent":"head","type":"box","size":[0.063,0.052,0.014],"position":[-0.077,0.151,0.181],"rotation":[0,0,0],"material":"eyeWhite","color":"#F6EFDF"},{"id":"eyeR","parent":"head","type":"box","size":[0.028,0.039,0.014],"position":[-0.08,0.148,0.191],"rotation":[0,0,0],"material":"eyes","color":"#30352F"},{"id":"browR","parent":"head","type":"box","size":[0.071,0.015,0.016],"position":[-0.077,0.211,0.183],"rotation":[0,0,0],"material":"hair","color":"#53463A"},{"id":"cheekR","parent":"head","type":"box","size":[0.044,0.022,0.009],"position":[-0.10856999999999999,0.075,0.179],"rotation":[0,0,0],"material":"cheek","color":"#CB947A"},{"id":"nose","parent":"head","type":"box","size":[0.064,0.055,0.064],"position":[0,0.091,0.198],"rotation":[0,0,0],"material":"skinShade","color":"#D4AA7B"},{"id":"mouth","parent":"head","type":"box","size":[0.059,0.012,0.01],"position":[0,0.029,0.181],"rotation":[0,0,0],"material":"mouth","color":"#855F54"},{"id":"sleeveL","parent":"upperArmL","type":"box","size":[0.166,0.235,0.19],"position":[0,-0.103,0],"rotation":[0,0,0],"material":"shirt","color":"#8B779D"},{"id":"cuffL","parent":"upperArmL","type":"box","size":[0.169,0.045,0.194],"position":[0,-0.199,0],"rotation":[0,0,0],"material":"shirtShade","color":"#6E5E7E"},{"id":"forearmL","parent":"lowerArmL","type":"box","size":[0.137,0.18,0.15],"position":[0,-0.087,0],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"palmL","parent":"handL","type":"box","size":[0.15,0.143,0.163],"position":[0,-0.039,0],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"thumbL","parent":"handL","type":"box","size":[0.049,0.077,0.078],"position":[-0.081,-0.023,0.023],"rotation":[0,0,0],"material":"skinShade","color":"#D4AA7B"},{"id":"thighL","parent":"upperLegL","type":"box","size":[0.165,0.27,0.195],"position":[0,-0.135,0],"rotation":[0,0,0],"material":"pants","color":"#777D78"},{"id":"shinL","parent":"lowerLegL","type":"box","size":[0.155,0.275,0.184],"position":[0,-0.136,0],"rotation":[0,0,0],"material":"pants","color":"#777D78"},{"id":"shoeL","parent":"footL","type":"box","size":[0.191,0.105,0.278],"position":[0,-0.0325,0.056],"rotation":[0,0,0],"material":"shoe","color":"#605C54"},{"id":"soleL","parent":"footL","type":"box","size":[0.198,0.029,0.286],"position":[0,-0.0855,0.057],"rotation":[0,0,0],"material":"sole","color":"#D1CCB8"},{"id":"shoeTongueL","parent":"footL","type":"box","size":[0.096,0.021,0.091],"position":[0,0.023,0.049],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2"},{"id":"sleeveR","parent":"upperArmR","type":"box","size":[0.166,0.235,0.19],"position":[0,-0.103,0],"rotation":[0,0,0],"material":"shirt","color":"#8B779D"},{"id":"cuffR","parent":"upperArmR","type":"box","size":[0.169,0.045,0.194],"position":[0,-0.199,0],"rotation":[0,0,0],"material":"shirtShade","color":"#6E5E7E"},{"id":"forearmR","parent":"lowerArmR","type":"box","size":[0.137,0.18,0.15],"position":[0,-0.087,0],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"palmR","parent":"handR","type":"box","size":[0.15,0.143,0.163],"position":[0,-0.039,0],"rotation":[0,0,0],"material":"skin","color":"#E8C39A"},{"id":"thumbR","parent":"handR","type":"box","size":[0.049,0.077,0.078],"position":[0.081,-0.023,0.023],"rotation":[0,0,0],"material":"skinShade","color":"#D4AA7B"},{"id":"thighR","parent":"upperLegR","type":"box","size":[0.165,0.27,0.195],"position":[0,-0.135,0],"rotation":[0,0,0],"material":"pants","color":"#777D78"},{"id":"shinR","parent":"lowerLegR","type":"box","size":[0.155,0.275,0.184],"position":[0,-0.136,0],"rotation":[0,0,0],"material":"pants","color":"#777D78"},{"id":"shoeR","parent":"footR","type":"box","size":[0.191,0.105,0.278],"position":[0,-0.0325,0.056],"rotation":[0,0,0],"material":"shoe","color":"#605C54"},{"id":"soleR","parent":"footR","type":"box","size":[0.198,0.029,0.286],"position":[0,-0.0855,0.057],"rotation":[0,0,0],"material":"sole","color":"#D1CCB8"},{"id":"shoeTongueR","parent":"footR","type":"box","size":[0.096,0.021,0.091],"position":[0,0.023,0.049],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2"},{"id":"backpack","parent":"torso","type":"box","size":[0.315,0.315,0.172],"position":[0,0.141,-0.226],"rotation":[0,0,0],"material":"bag","color":"#A3A482"},{"id":"backpackPocket","parent":"torso","type":"box","size":[0.242,0.135,0.05],"position":[0,0.067,-0.33],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066"},{"id":"bagSeam","parent":"torso","type":"box","size":[0.25,0.014,0.007],"position":[0,0.129,-0.358],"rotation":[0,0,0],"material":"metal","color":"#BCAB83"},{"id":"strapL","parent":"torso","type":"box","size":[0.036,0.343,0.022],"position":[0.144,0.154,0.167],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066"},{"id":"strapTopL","parent":"torso","type":"box","size":[0.038,0.037,0.337],"position":[0.144,0.323,-0.01],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066"},{"id":"strapR","parent":"torso","type":"box","size":[0.036,0.343,0.022],"position":[-0.144,0.154,0.167],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066"},{"id":"strapTopR","parent":"torso","type":"box","size":[0.038,0.037,0.337],"position":[-0.144,0.323,-0.01],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066"},{"id":"capCrown","parent":"head","type":"box","size":[0.421,0.105,0.383],"position":[0,0.365,-0.007],"rotation":[0,0,0],"material":"hat","color":"#C5B38B","accessory":"cap"},{"id":"capBand","parent":"head","type":"box","size":[0.429,0.026,0.39],"position":[0,0.314,-0.007],"rotation":[0,0,0],"material":"hatBand","color":"#AFA17D","accessory":"cap"},{"id":"capBrim","parent":"head","type":"box","size":[0.455,0.034,0.218],"position":[0,0.314,0.213],"rotation":[0.045,0,0],"material":"hat","color":"#C5B38B","accessory":"cap"},{"id":"capButton","parent":"head","type":"cylinder","size":[0.03,0.03,0.024,8],"position":[0,0.429,-0.007],"rotation":[0,0,0],"material":"hatBand","color":"#AFA17D","accessory":"cap"},{"id":"capEmblem","parent":"head","type":"box","size":[0.047,0.038,0.013],"position":[0,0.363,0.19],"rotation":[0,0,0],"material":"shirt","color":"#8B779D","accessory":"cap"},{"id":"bucketCrown","parent":"head","type":"cylinder","size":[0.225,0.255,0.115,10],"position":[0,0.366,-0.005],"rotation":[0,0,0],"material":"hat","color":"#C5B38B","accessory":"bucket-hat"},{"id":"bucketBand","parent":"head","type":"cylinder","size":[0.255,0.26,0.027,10],"position":[0,0.32,-0.005],"rotation":[0,0,0],"material":"hatBand","color":"#AFA17D","accessory":"bucket-hat"},{"id":"bucketBrim","parent":"head","type":"cylinder","size":[0.276,0.293,0.038,10],"position":[0,0.302,-0.005],"rotation":[0,0,0],"material":"hat","color":"#C5B38B","accessory":"bucket-hat"},{"id":"bucketPin","parent":"head","type":"box","size":[0.035,0.031,0.012],"position":[0.111,0.365,0.208],"rotation":[0,0.39,0],"material":"accent","color":"#E8BC63","accessory":"bucket-hat"},{"id":"hairSweep","parent":"head","type":"box","size":[0.352,0.108,0.135],"position":[0,0.307,0.132],"rotation":[0,0,-0.11],"material":"hair","color":"#53463A","accessory":"swept-hair"},{"id":"hairTuft","parent":"head","type":"box","size":[0.162,0.072,0.26],"position":[-0.096,0.358,-0.016],"rotation":[0,0,-0.13],"material":"hair","color":"#53463A","accessory":"swept-hair"},{"id":"glassesLTop","parent":"head","type":"box","size":[0.139,0.017,0.022],"position":[0.081,0.202,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesLBottom","parent":"head","type":"box","size":[0.139,0.017,0.022],"position":[0.081,0.101,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesLOuter","parent":"head","type":"box","size":[0.017,0.112,0.022],"position":[0.14200000000000002,0.151,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesLInner","parent":"head","type":"box","size":[0.017,0.112,0.022],"position":[0.020000000000000004,0.151,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesTempleL","parent":"head","type":"box","size":[0.018,0.02,0.18],"position":[0.184,0.176,0.114],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesRTop","parent":"head","type":"box","size":[0.139,0.017,0.022],"position":[-0.081,0.202,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesRBottom","parent":"head","type":"box","size":[0.139,0.017,0.022],"position":[-0.081,0.101,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesROuter","parent":"head","type":"box","size":[0.017,0.112,0.022],"position":[-0.14200000000000002,0.151,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesRInner","parent":"head","type":"box","size":[0.017,0.112,0.022],"position":[-0.020000000000000004,0.151,0.208],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesTempleR","parent":"head","type":"box","size":[0.018,0.02,0.18],"position":[-0.184,0.176,0.114],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"glassesBridge","parent":"head","type":"box","size":[0.05,0.018,0.019],"position":[0,0.165,0.214],"rotation":[0,0,0],"material":"glasses","color":"#525A56","accessory":"glasses"},{"id":"scarfWrap","parent":"torso","type":"box","size":[0.258,0.093,0.232],"position":[0,0.353,0.03],"rotation":[0,0,0],"material":"accent","color":"#E8BC63","accessory":"scarf"},{"id":"scarfTail","parent":"torso","type":"box","size":[0.074,0.18,0.032],"position":[-0.069,0.237,0.181],"rotation":[0,0,-0.1],"material":"accent","color":"#E8BC63","accessory":"scarf"},{"id":"satchelStrap","parent":"torso","type":"box","size":[0.036,0.442,0.018],"position":[-0.035,0.137,0.181],"rotation":[0,0,-0.56],"material":"bagShade","color":"#7B8066","accessory":"book-satchel"},{"id":"satchel","parent":"torso","type":"box","size":[0.145,0.266,0.255],"position":[-0.265,-0.011,-0.04],"rotation":[0,0,0],"material":"bag","color":"#A3A482","accessory":"book-satchel"},{"id":"satchelFlap","parent":"torso","type":"box","size":[0.154,0.092,0.263],"position":[-0.265,0.078,-0.04],"rotation":[0,0,0],"material":"bagShade","color":"#7B8066","accessory":"book-satchel"},{"id":"bookCover","parent":"torso","type":"box","size":[0.065,0.22,0.176],"position":[-0.265,0.137,-0.052],"rotation":[0,0,0.055],"material":"book","color":"#DFB276","accessory":"book-satchel"},{"id":"bookPages","parent":"torso","type":"box","size":[0.05,0.193,0.164],"position":[-0.266,0.151,-0.043],"rotation":[0,0,0.055],"material":"undershirt","color":"#E8DDC2","accessory":"book-satchel"},{"id":"beanieCrown","parent":"head","type":"sphere","size":[0.233,10,6],"position":[0,0.35,-0.007],"rotation":[0,0,0],"material":"hat","color":"#C5B38B","accessory":"beanie","scale":[1,0.5,1]},{"id":"beanieBand","parent":"head","type":"cylinder","size":[0.247,0.247,0.063,10],"position":[0,0.307,-0.007],"rotation":[0,0,0],"material":"hatBand","color":"#AFA17D","accessory":"beanie"},{"id":"beaniePompom","parent":"head","type":"sphere","size":[0.025,6,4],"position":[0,0.455,-0.007],"rotation":[0,0,0],"material":"hat","color":"#C5B38B","accessory":"beanie"},{"id":"beanieLabel","parent":"head","type":"box","size":[0.064,0.039,0.015],"position":[0,0.307,0.241],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2","accessory":"beanie"},{"id":"hood","parent":"torso","type":"box","size":[0.35,0.22,0.173],"position":[0,0.38,-0.132],"rotation":[0,0,0],"material":"shirtShade","color":"#6E5E7E","accessory":"hood"},{"id":"hoodLaceL","parent":"torso","type":"box","size":[0.015,0.12,0.016],"position":[0.061,0.274,0.186],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2","accessory":"hood"},{"id":"hoodLaceR","parent":"torso","type":"box","size":[0.015,0.103,0.016],"position":[-0.061,0.282,0.186],"rotation":[0,0,0],"material":"undershirt","color":"#E8DDC2","accessory":"hood"}]};

const VARIANT_ALIASES = {
  purple: 'qiushi-purple', qiushi: 'qiushi-purple', qiushe: 'qiushi-purple', 'qiushe-purple': 'qiushi-purple', '求是紫': 'qiushi-purple',
  green: 'lakeside-green', lakeside: 'lakeside-green', '湖畔绿': 'lakeside-green',
  blue: 'academy-blue', academy: 'academy-blue', '书院蓝': 'academy-blue',
  orange: 'sunlight-orange', sunlight: 'sunlight-orange', '日光橙': 'sunlight-orange',
};

/**
 * Build one real, jointed, metre-scale avatar facing +Z. The caller owns group
 * position/rotation/scale; animation only changes its internal motionRoot.
 * @param {object} THREE imported Three.js namespace
 * @param {string|number} variant key, short alias, Chinese name or index 0..3
 * @param {object} spec optional compatible JSON specification
 * @returns {{group: THREE.Group, joints: object, meshes: object, variant: string}}
 */
export function createAvatar(THREE, variant = 'purple', spec = AVATAR_SPEC) {
  const keys = Object.keys(spec.variants);
  const requested = typeof variant === 'number' ? keys[((variant % keys.length) + keys.length) % keys.length] : variant;
  const key = spec.variants[requested] ? requested : VARIANT_ALIASES[requested] || keys[0];
  const settings = spec.variants[key];
  const palette = { ...spec.materials, ...settings.materials };
  const hidden = new Set(settings.hide || []);
  const accessories = new Set(settings.accessories || []);
  const group = new THREE.Group();
  group.name = `campus-avatar:${key}`;
  group.userData.avatarVariant = key;
  group.userData.avatarLabel = settings.label;
  const motionRoot = new THREE.Group();
  motionRoot.name = 'avatar-motion-root';
  group.add(motionRoot);
  const joints = {};
  const meshes = {};
  const materials = {};
  const geometries = new Map();
  for (const [slot, color] of Object.entries(palette)) {
    materials[slot] = new THREE.MeshStandardMaterial({ ...spec.materialDefaults, color });
    materials[slot].name = `avatar:${slot}`;
  }
  for (const entry of spec.joints) {
    const joint = new THREE.Group();
    joint.name = entry.id;
    joint.position.fromArray(entry.position);
    joint.rotation.set(...(entry.rotation || [0, 0, 0]));
    (entry.parent ? joints[entry.parent] : motionRoot).add(joint);
    joints[entry.id] = joint;
  }
  for (const entry of spec.nodes) {
    if (hidden.has(entry.id) || (entry.accessory && !accessories.has(entry.accessory))) continue;
    const geometryKey = `${entry.type}:${entry.size.join(',')}`;
    let geometry = geometries.get(geometryKey);
    if (!geometry) {
      if (entry.type === 'box') geometry = new THREE.BoxGeometry(...entry.size);
      else if (entry.type === 'cylinder') geometry = new THREE.CylinderGeometry(...entry.size);
      else if (entry.type === 'sphere') geometry = new THREE.SphereGeometry(...entry.size);
      else if (entry.type === 'cone') geometry = new THREE.ConeGeometry(...entry.size);
      else throw new Error(`Unknown avatar geometry: ${entry.type}`);
      geometry.computeBoundingBox();
      geometries.set(geometryKey, geometry);
    }
    const mesh = new THREE.Mesh(geometry, materials[entry.material]);
    mesh.name = entry.id;
    mesh.position.fromArray(entry.position);
    mesh.rotation.set(...(entry.rotation || [0, 0, 0]));
    if (entry.scale) mesh.scale.fromArray(entry.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    joints[entry.parent].add(mesh);
    meshes[entry.id] = mesh;
  }
  const rig = {
    group, root: group, motionRoot, joints, meshes, materials, variant: key, label: settings.label,
    time: 0, phase: 0, moveBlend: 0, waveBlend: 0, sitBlend: 0,
    _footMeshes: [meshes.soleL, meshes.soleR],
    _point: new THREE.Vector3(), _inverseRoot: new THREE.Matrix4(),
    _geometries: geometries,
  };
  rig.dispose = () => {
    for (const geometry of geometries.values()) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    group.removeFromParent();
  };
  updateAvatar(rig, 0, 0, 'idle');
  return rig;
}

/**
 * Animate without translating the avatar. speed is metres/second; dt is seconds.
 * action: 'auto' | 'idle' | 'walk' | 'run' | 'wave' | 'sit'. Wave may accompany movement.
 * Positive speed walks/runs even when action='idle'; 'sit' overrides movement.
 * Return the same rig for chaining. Use an existing scene clock's delta.
 */
export function updateAvatar(rig, dt = 0, speed = 0, action = 'auto') {
  const delta = Math.min(.08, Math.max(0, Number.isFinite(dt) ? dt : 0));
  const absoluteSpeed = Math.abs(Number.isFinite(speed) ? speed : 0);
  const forceMove = action === 'walk' || action === 'run';
  const moving = action !== 'sit' && (forceMove || absoluteSpeed > .035);
  const run = action === 'run' || (moving && absoluteSpeed > 2.6);
  const movementSpeed = moving ? Math.max(absoluteSpeed, run ? 2.9 : .8) : 0;
  const blend = 1 - Math.exp(-delta * 12);
  rig.moveBlend += ((moving ? 1 : 0) - rig.moveBlend) * blend;
  rig.waveBlend += ((action === 'wave' ? 1 : 0) - rig.waveBlend) * blend;
  rig.sitBlend += ((action === 'sit' ? 1 : 0) - rig.sitBlend) * blend;
  rig.time += delta;
  const cadence = run ? 2.65 + Math.min(1.2, movementSpeed * .10) : 1.35 + Math.min(.8, movementSpeed * .23);
  rig.phase += delta * cadence * Math.PI * 2 * (moving ? 1 : rig.moveBlend);
  const phase = rig.phase;
  const seated = rig.sitBlend;
  const locomotion = rig.moveBlend * (1-seated);
  const amplitude = (run ? .91 : .51) * locomotion;
  const leftSwing = Math.sin(phase) * amplitude;
  const rightSwing = -leftSwing;
  const j = rig.joints;
  const approach = (object, x = 0, y = 0, z = 0) => {
    if (delta === 0) object.rotation.set(x, y, z);
    else {
      object.rotation.x += (x - object.rotation.x) * blend;
      object.rotation.y += (y - object.rotation.y) * blend;
      object.rotation.z += (z - object.rotation.z) * blend;
    }
  };
  const breath = Math.sin(rig.time * 2.15);
  j.torso.scale.y = 1 + breath * .009 * (1 - locomotion * .65);
  approach(j.hips, run ? -.09 * locomotion : 0, Math.sin(phase) * .042 * locomotion, 0);
  approach(j.torso, run ? .14 * locomotion : .017 * breath,
    -Math.sin(phase) * .05 * locomotion, Math.sin(rig.time * 1.3) * .009 * (1-locomotion));
  approach(j.head, -.023 * Math.sin(rig.time * 1.7),
    Math.sin(rig.time * .63) * .045 * (1 - locomotion), -Math.sin(rig.time * 1.3) * .006);
  // 65-degree thighs retain a chair seat height around 0.43 m for this
  // deliberately short-legged figure; equal knee bends keep shins upright.
  approach(j.upperLegL, -leftSwing - 1.13 * seated, 0, 0);
  approach(j.upperLegR, -rightSwing - 1.13 * seated, 0, 0);
  const kneeAmount = run ? 1.16 : .49;
  approach(j.lowerLegL, Math.max(0, -Math.sin(phase)) * kneeAmount * locomotion + 1.13 * seated, 0, 0);
  approach(j.lowerLegR, Math.max(0, Math.sin(phase)) * kneeAmount * locomotion + 1.13 * seated, 0, 0);
  approach(j.footL, Math.max(0, Math.sin(phase)) * -.13 * locomotion, 0, 0);
  approach(j.footR, Math.max(0, -Math.sin(phase)) * -.13 * locomotion, 0, 0);
  const armSwing = run ? .92 : .81;
  const rest = .035 + .013 * Math.sin(rig.time * 1.6);
  approach(j.upperArmL, leftSwing * armSwing - .70 * seated, 0, rest * (1-seated));
  approach(j.lowerArmL, -(run ? .94 : .12) * locomotion - .025 - .875 * seated, 0, 0);
  approach(j.handL, .06 * seated, 0, .025 * (1-seated));
  const wave = rig.waveBlend;
  approach(j.upperArmR, rightSwing * armSwing * (1-wave) - .08 * wave - .70 * seated,
    -.12 * wave, -rest * (1-wave) * (1-seated) - 2.44 * wave);
  approach(j.lowerArmR,
    (-(run ? .94 : .12) * locomotion - .025) * (1-wave) + (.1 + Math.sin(rig.time * 8.5) * .47) * wave - .875 * seated,
    .11 * wave, -.10 * wave);
  approach(j.handR, .12 * Math.sin(rig.time * 8.5) * wave + .06 * seated, 0, -.025 * (1-seated));

  // Ground contact is computed in the outer group's coordinates, so moving,
  // rotating or scaling the user-owned group never gets overwritten here.
  rig.motionRoot.position.y = 0;
  rig.group.updateWorldMatrix(true, true);
  rig._inverseRoot.copy(rig.group.matrixWorld).invert();
  let minY = Infinity;
  for (const foot of rig._footMeshes) {
    const bounds = foot.geometry.boundingBox;
    for (let corner = 0; corner < 8; corner++) {
      rig._point.set(corner & 1 ? bounds.max.x : bounds.min.x,
        corner & 2 ? bounds.max.y : bounds.min.y,
        corner & 4 ? bounds.max.z : bounds.min.z);
      rig._point.applyMatrix4(foot.matrixWorld).applyMatrix4(rig._inverseRoot);
      minY = Math.min(minY, rig._point.y);
    }
  }
  if (Number.isFinite(minY)) rig.motionRoot.position.y = -minY;
  rig.group.updateWorldMatrix(false, true);
  return rig;
}

export const AVATAR_VARIANTS = Object.entries(AVATAR_SPEC.variants).map(([id, value]) => ({
  id, name: value.label, color: value.materials.shirt || AVATAR_SPEC.materials.shirt,
  description: value.description,
}));
