// User-supplied cards are kept in this clone's own public media directory.
// The reference image set remains below as a safe fallback for unused slots.
export const showcaseVideo = 'https://videos.pexels.com/video-files/3015510/3015510-hd_1920_1080_24fps.mp4'
export const showcasePoster = 'https://images.pexels.com/videos/3015510/free-video-3015510.jpg?auto=compress&cs=tinysrgb&w=1600'

// Two videos received in the user's WeChat conversation at 09:08. They are
// local copies so the original showcase video above stays unchanged.
export const wechatVideos = [
  {
    src: '/media/wechat-videos-20260827-0908/video-01.mp4',
    poster: '/media/wechat-videos-20260827-0908/video-01.jpg',
    label: '微信视频 01 · 09:08',
    aspectRatio: '1344 / 768',
  },
  {
    src: '/media/wechat-videos-20260827-0908/video-02.mp4',
    poster: '/media/wechat-videos-20260827-0908/video-02.jpg',
    label: '微信视频 02 · 09:08',
    aspectRatio: '720 / 952',
  },
]

const cardPath = (number) => `/media/wechat-cards-20260827/card-${String(number).padStart(3, '0')}.png`

// All 75 of the supplied cards are available locally for the next layout pass.
export const wechatCards = Array.from({ length: 75 }, (_, index) => cardPath(index + 1))

export const referencePhotos = [
  'https://images.unsplash.com/photo-1779881718722-5e7fa09fad7f?q=80&w=770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1780150048191-2e1eefe95665?q=80&w=812&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1778051131564-192e359b601d?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1779465190086-021c2012bc4c?q=80&w=770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1779630541798-1f3d987aa440?q=80&w=770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1776715139438-c4b4076cc592?q=80&w=770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1769968065389-60c3a887d14c?q=80&w=776&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1775668076243-1676696bf27e?q=80&w=778&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1773698719619-51e67f93a39f?q=80&w=818&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1771153568007-92b0997828ae?q=80&w=770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
]

// The hero has exactly sixty card positions. Its first sixty image sources are
// therefore the first sixty user cards. The remaining fifteen fill the phone
// and gallery media slots while the reference photos remain a fallback.
export const heroPhotos = wechatCards.length >= 60 ? wechatCards.slice(0, 60) : referencePhotos
const selectedWechatCards = wechatCards.length >= 70 ? wechatCards.slice(60, 70) : referencePhotos

export const photos = selectedWechatCards

// Every supplied card gets its own caption. Keeping the source and copy in one
// ordered list means the flowing gallery can show all 75 cards without falling
// back to the ten-card placeholder set that was here before.
const galleryCaptions = [
  '「午夜扭摆 / MIDNIGHT TWIST」：标注《低俗小说》（1994）的舞池瞬间，两名舞者在蓝色酒吧灯光与围观人群前起舞。',
  '「沙漠的正午 / 两个视线」：两名西装男子站在打开的后备厢外俯视，背后是强光下的荒漠。',
  '柑橘午休：键盘与保温杯旁，一只由橘子、果皮和纸巾拼成的小人安静躺在桌面上。',
  '「赤之晚餐」：暗红色、挂满动物标本的餐室里，五人围坐在摆着烤火鸡的长桌旁。',
  '「夏日窗户」：绿百叶窗向外打开，红花垂在窗台下，把午后的影子投到浅色墙面。',
  '「林间静钓」：戴斗笠的人独坐林间水边垂钓，落叶、水鸟与倒影让画面保持安静。',
  '「小小收获队」：微缩工人用绿色小货车装运巨大的红苹果，果园像放大的工作现场。',
  '「PETIT CHEF」：穿厨师服的卷毛犬在市集摊位前照看一排方形小食，路人驻足拍照。',
  '「Golden Harvest」：两位女性在苹果园采摘，果篮、树影与金色午后被一起收进画面。',
  '「Verdant Ruins」：被藤蔓和苔藓覆盖的山坡村落隐在雾气与浓绿之间。',
  '「Still Ascent」：杭州西湖的塔、山林与湖面倒影在金色暮光中彼此呼应。',
  '「Peak of Joy」：黄山日出照亮陡峭石峰和松树，卡片以手绘方式记录这段高处风景。',
  '「Evening Stroll in WuZhen」：乌镇白墙黛瓦围出一条亮起灯火的街巷，行人从暮色中穿过。',
  '「Cloud Explorer」：黄山石峰浮在云雾上方，下半部以小动物登山插画呼应“云中探索”。',
  '「Wide / Still」：一匹马在绿色草地的水边吃草，白云与马影一同映进平静水面。',
  'FOLLOW THE WIND：两位骑行者沿着起伏的草坡前行，风把沉默拉成一条长线。',
  'TWO SHELTERS, ONE WIND：雪山脚下的两座毡房，共享一阵清亮而辽阔的风。',
  'EDGE OF STILLNESS：海与花田交界处，两个人把安静站成一幅蓝色的画。',
  '「Light Forms Space」：挑高客厅用落地窗、木材与浅色家具接住阳光，呈现安静的室内层次。',
  '「Earth & Circle」：福建土楼散落在翠绿山谷里，圆形建筑、梯田和山路形成清晰的聚落结构。',
  '「Tokyo Nights / Kabukicho」：歌舞伎町一番街的红色拱门和霓虹招牌照亮拥挤的东京夜街。',
  '与 018 为同一画面版本：黄花、蓝湖与远山构成水陆交界，双人剪影站在留白般的岸线上。',
  '与 019 为同一画面版本：挑高客厅用落地窗、木材与浅色家具接住阳光，呈现安静的室内层次。',
  '「Between Light and Silence」：傍晚的江面映着金蓝色天空，斜拉桥与城市天际线横跨水面。',
  '「Salt & Strata」：一辆越野车行经浅色平地与倒影之间，身后是红、橙、灰交叠的层理山体。',
  '「EARTH & CIRCLE」：福建土楼散落在翠绿山谷，圆环建筑、梯田与山路构成大地的聚落地图。',
  '「FUJI」：富士山在粉蓝天幕下安静站立，雪线写出清晰轮廓。',
  '月面上的宇航员独自站在陨石地表，银河铺满头顶；水彩明信片记录 Lunar Surface / Quiet Horizon。',
  '「TOKYO TOWER」：红白东京塔从两面深色墙之间升起，下半幅以折纸与几何色块重绘城市地标。',
  '「INNER FIRE」：梵高 1889 年圣雷米自画像与线稿并置，炽热笔触像从胸口持续燃烧。',
  '「ING 5」：西装猴子靠在洛杉矶二手车店街角，像在 Sunlit Afternoon 里借一段人行道休息。',
  '海岸岩石上的两位旅人背对镜头望向蓝天；明信片标注 Two Figures / Quiet Horizon / Seaside Study。',
  '「FLOATING PRESENCE」：宇航员与巨型黄色橡皮鸭在浅水相遇，档案把它称为 QUACKUS，状态 CALM。',
  '「AXIS」：故宫午门与笔直中轴线在开阔广场上对齐，线稿写着 where time stands still。',
  '「STILLNESS IN THE DEEPEST MOVEMENT」：莲花池中央的佛像安坐，水滴、莲叶和涟漪替时间缓慢呼吸。',
  '「UPWARD SILENCE」：湖畔城市天际线由一座尖顶高楼领起，建筑线稿把水岸与上升感收进同一幅图。',
  '「PAUSE / No.07」：黑礼服、咖啡、金色餐具与一朵玫瑰，把电影般的停顿留在桌边；下半幅以极简线稿重现人物。',
  '「good enough today. / No.047」：Rowan Atkinson 式的拇指与相机定格一个小胜利——a small win is still a win。',
  '「Night is Open. / No.17」：雨后霓虹餐馆倒映在路面，像给深夜路人留的一盏灯。',
  '「HOLD THE EVENING」：树墙之间的持剑骑士雕像停在橙色暮光里，像对天空与道路许下一句安静的誓言。',
  '「AFTER LIGHT」：巴黎埃菲尔铁塔在蓝调时刻点亮全城，下半幅以蓝色半调线稿留下 evening axis。',
  '「DISTANT LIGHT」：远处山城与圣心圣殿沉在橙色晚霞里，半调轮廓把城市的距离拉长。',
  '「DISTANCE」：卢浮宫里的人群举手机围住《蒙娜丽莎》，下半幅提醒 we only see what the crowd allows。',
  '「THE LAST SUPPER」：达·芬奇《最后的晚餐》（1495–1498）以写实画面与暖色线稿并置，人物目光聚在长桌中央。',
  '「THE LONG ROAD WILL LEAD US TO BEAUTY」：山路盘过峭壁与彩色峡谷，下半幅把它变成通往拱门、阶梯与新天空的梦幻迷宫。',
  '「SILENT AXIS」：夜色中的卢浮宫玻璃金字塔与倒影对称，半调海面般的线稿延伸出视觉的距离。',
  '「ROSES IN MOTION / 玫瑰在风中」：穿红裙的女孩抱着玫瑰跃过草坡，照片与水彩重绘都保留奔跑的风。',
  '「Blue Moment / 蓝色的窗与影」：蓝墙窗台上的花束、蝴蝶与飞鸟，把一束经过的风留成短暂蓝色。',
  '「Sunny Place」：橘猫蜷在窗边暖光里，树影、拱形灯与小盆栽共同写下 where time puts its paws。',
  '「THE SCREAM / 1893」：蒙克《呐喊》的扭曲天空与桥上人物被重新编排成一张橙黑色的版画海报。',
  'THE GRAND BUDAPEST HOTEL：雪山与瀑布环抱的粉色酒店，照片与建筑线稿重叠成复古旅店海报。',
  '一枚接着电缆的 POLYTRON 设备静置在暗金色背景；下半幅把它放进洞口与森林景色，像把现实接入童话。',
  '孩子闭眼接受橙色剪刀修剪刘海；下半幅把同一幕画成蘑菇、花草环绕的童话插画。',
  '金色调的《蒙娜丽莎》肖像，上下以写实与插画重绘对照，底角标有 MONA。',
  '雪原与光之路（THE SNOWFIELD AND THE ROAD OF LIGHT）：拉普兰坐标与一个走向地平线的人影构成冷静的对称构图。',
  'THE WHITE HOUSE：华盛顿特区白宫实景与建筑线稿并置，写有 Pennsylvania 1600 与坐标信息。',
  'Abbey Road：四人走过伦敦斑马线，下面以连续线稿重现这一步，标题标注 CROSSING。',
  '黑白照片中的虎斑猫坐在花束与床边；下半幅用线稿写出猫与花，并留下 “soft is resistance.”',
  '德拉克洛瓦《自由引导人民》：举旗的自由女神、街垒与人群被拆解成一页图文档案。',
  'Strawberry & Matcha cake：草莓、抹茶蛋糕和拉花咖啡组成一张咖啡馆笔记，旁边写着 pink × green = happy。',
  '《千与千寻》电车场景：千寻与无脸男并坐在海上列车，环形吊环和窗外海天形成静默旅程。',
  '骑行者穿过高架桥下的金色光带，弯曲的道路把视线拉向远方；水彩部分写着 “some roads are for leaving.”',
  '一位旅人拖着行李穿过狭长天光，倒影跟随脚步；水彩部分写下 “let the road teach you quietly.”',
  '骑车人和自行车的影子落在拱窗投下的夕光里；下半幅以水彩写着 “one road / one wheel / one turn / one travel.”',
  '海边白色露台俯瞰透明海水、沙滩与彩色遮阳伞；下半幅写着 “the sea remembers everything.”',
  '桥下步道与远处城市被几何对称线切开，一位跑者独自经过；插画旁写着 “under the bridge, the wind remembers.”',
  '卢浮宫玻璃金字塔与宫殿倒映在水面，实景与水彩重绘并置，标注 Louvre Paris / 1989。',
  '夜色中的金门大桥以橙色灯火划过蓝色海湾；下半幅以水彩写下 Golden Gate — 1937。',
  '铁网球场边，一位父亲与孩子举杯相碰；下半幅以水彩写着 “cheers, big guy.” / A good day.',
  '黑白肖像里的爱因斯坦与两位同伴共同入镜，脸上带着玩心；下半幅标题为 GENIUS & COMPANY。',
  '父亲牵着孩子走向海浪，蓝色外套和湿沙留下并行脚印；下半幅写着 Walk with you / THE SEA, THE SAND, AND US.',
  '阳光下的大狗亲吻孩子的脸，真实照片与水彩重绘并置；标题写 SUNLIT Nuzzle。',
  '街头回望的一瞬：前景红衣女子虚焦，身后的男子与女子同时转身；下半幅标题 Oops That’s Life。',
  '粉色 Mendl’s 礼盒堆满房间，两个人隔着礼盒相望；下半幅以线稿描出他们的侧脸与交错线条。',
  '蓝天下的集会中，一只高举的拳头与美国国旗成为焦点；下半幅线稿收束成 “resist. hold. rise.”',
]

// A small editorial layer makes the 75-card stream feel like a collection,
// not a pile of labels. Short classical quotes are kept brief; Tianya/X
// entries are explicitly marked as paraphrase or inspiration when there is
// no source URL, so the UI never presents an invented post as a verbatim one.
const galleryEditorials = [
  { quote: '学而时习之，不亦说乎？', source: '孔子 · 《论语》', kind: '原句' },
  { quote: '千里之行，始于足下。', source: '老子 · 《道德经》', kind: '原句' },
  { quote: '人生天地之间，若白驹之过隙。', source: '庄子 · 《庄子》', kind: '原句' },
  { quote: '知是行之始，行是知之成。', source: '王阳明 · 《传习录》', kind: '原句' },
  { quote: '不为五斗米折腰。', source: '陶渊明 · 典故', kind: '短引' },
  { quote: '竹杖芒鞋轻胜马，谁怕？', source: '苏轼 · 《定风波》', kind: '原句' },
  { quote: '行到水穷处，坐看云起。', source: '王维 · 《终南别业》', kind: '原句' },
  { quote: '长风破浪会有时。', source: '李白 · 《行路难》', kind: '原句' },
  { quote: '会当凌绝顶，一览众山小。', source: '杜甫 · 《望岳》', kind: '原句' },
  { quote: '希望是附丽于存在的。', source: '鲁迅 · 《导师》', kind: '短引' },
  { quote: '结硬寨，打呆仗。', source: '曾国藩 · 家书意旨', kind: '短引' },
  { quote: '不完满，才是人生。', source: '人生哲理 · 常见短引', kind: '短引' },
  { quote: '敬天爱人，先把眼前事做好。', source: '稻盛和夫 · 理念意译', kind: '意译' },
  { quote: '把知道的事，做成手上的事。', source: '知行 · 人生哲理', kind: '原创' },
  { quote: '安静不是退场，是重新校准方向。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: 'The happiness of your life depends upon the quality of your thoughts.', source: 'Marcus Aurelius · Meditations', kind: '短引' },
  { quote: 'He who has a why to live can bear almost any how.', source: 'Nietzsche · 常见译引', kind: '短引' },
  { quote: 'Be patient toward all that is unsolved in your heart.', source: 'Rilke · Letters to a Young Poet', kind: '短引' },
  { quote: '先改变自己的反应，再改变所处的局面。', source: 'Epictetus · 意译', kind: '意译' },
  { quote: '机会偏爱准备已久的人。', source: 'Seneca · 常见译引', kind: '意译' },
  { quote: '把手边的碎片排好，生活会慢慢成形。', source: 'Virginia Woolf · 意译', kind: '意译' },
  { quote: '知道得更多之后，就做得更好。', source: 'Maya Angelou · 短引意译', kind: '意译' },
  { quote: '你不会上升到目标的高度，而会落回系统的水平。', source: 'James Clear · 意译', kind: '意译' },
  { quote: 'Make something people want.', source: 'Paul Graham · Essay', kind: '短引' },
  { quote: 'Stay hungry, stay foolish.', source: 'Steve Jobs · Stanford 2005', kind: '短引' },
  { quote: '重要的事值得在胜算不高时仍然开始。', source: 'Elon Musk · 公开访谈意译', kind: '意译' },
  { quote: '用真实的声音，离开拥挤的赛道。', source: 'Naval Ravikant · X 意译', kind: '意译' },
  { quote: '如果值得做，就把它做得像自己。', source: 'Derek Sivers · 公开分享意译', kind: '意译' },
  { quote: '我们如何度过一天，就是如何度过一生。', source: 'Annie Dillard · 意译', kind: '意译' },
  { quote: '某处总有一件不可思议的事，正等待被发现。', source: 'Carl Sagan · 《宇宙》意译', kind: '意译' },
  { quote: '先把今天做对，明天自然会有路。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '速度不是答案，方向才是。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '留白不是空缺，是让重要的事呼吸。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '你反复练习的，终会成为你的底气。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '先完成，再完美。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '不必追赶所有的风，选一阵顺着走。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '眼前的细节，决定远方的质感。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '允许自己慢一点，但别停止靠近。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '把复杂留给系统，把清醒留给自己。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '真正的自由，是知道什么可以不做。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '作品会说话，前提是你先让它完成。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '一次诚实的取舍，胜过十次漂亮的犹豫。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '把问题写清楚，答案就已经走了一半。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '不确定不是阻力，是探索的入口。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '好的决定经得起时间，不靠掌声。', source: '人生哲理 · 原创', kind: '原创' },
  { quote: '人到低处，先把手边的一盏灯点亮。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '走出自己的房间，世界才会给你回声。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '不和生活争输赢，先把日子过出秩序。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '真正的见识，是看见不同之后仍能保持温柔。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '一件事做十年，普通也会长出锋芒。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '别急着证明自己，结果会替你发言。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '人情往来贵在分寸，长久关系靠的是可靠。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '能把情绪放回原位的人，才有余力解决问题。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '选择少一点，心就会更有空间。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '那些看似绕远的路，常常正在替你避开悬崖。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '别把别人的热闹，误认成自己的方向。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '日子不会自动变好，但每个小动作都能改变它。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '能独处，也能合作，是成年人的两种能力。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '真正的体面，是不把希望寄托在运气上。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: '看得远的人，往往先把脚下这一步走稳。', source: '天涯帖 · 意译灵感', kind: '意译' },
  { quote: 'Build in public, let the work introduce you.', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '把注意力放在可控的下一步。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '长期主义不是等待，是每天交付一点。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '少做承诺，多做可复用的作品。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '你的边界越清楚，创造力越自由。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '先找到真实的问题，再谈漂亮的答案。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '把反馈当作地图，不当作判决。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '稳定输出，比偶尔爆发更稀缺。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '学习的终点不是知道，而是能用。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '让产品替你解释，不要让口号替你工作。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '做小实验，积累大判断。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '好奇心是最便宜、也最耐用的燃料。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '保持开放，但给自己的标准设一道门。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '把复杂事讲简单，是一种真正的尊重。', source: 'X 灵感 · 意译', kind: '意译' },
  { quote: '持续变好，不需要每次都被看见。', source: 'X 灵感 · 意译', kind: '意译' },
]

export const galleryShots = wechatCards.map((src, index) => ({
  src,
  prompt: galleryCaptions[index] || `第 ${String(index + 1).padStart(2, '0')} 张影像，等待你的下一次发现。`,
  quote: galleryEditorials[index]?.quote || '',
  source: galleryEditorials[index]?.source || '人生哲理 · 原创',
  kind: galleryEditorials[index]?.kind || '原创',
}))

export const avatars = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1589156280159-27698a70f29e?q=80&w=160&h=160&auto=format&fit=crop&crop=faces',
]
