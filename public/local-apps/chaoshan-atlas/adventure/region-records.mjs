/**
 * Twelve collectible field records, in chapter order. No scene geometry is changed.
 * levelId/placeId retain the atlas identities; ll uses the verified WGS84 reference
 * in MAP-SOURCES.html, not an approximate legacy atlas pin or a surveyed entrance.
 * Sources: saved OSM snapshots dated 2026-09-11/12 and the accompanying chapter
 * source notes. Map facts © OpenStreetMap contributors, ODbL 1.0.
 * Icons are original symbolic UI drawings; they are not measured elevations.
 * The game owns first-entry collection and persistence via each stable record id.
 */

const icon = (name, shapes) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" role="img" aria-label="${name}简笔图" focusable="false"><rect x="0" y="0" width="200" height="140" rx="9" fill="#f5f0df"/><g fill="none" stroke="#24476d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;

const icons = {
  park: icon('小公园纪念亭', `
    <path d="M20 122 70 103M180 122 130 103M19 70 61 77M181 67 139 77M98 17 100 36" stroke="#24476d" opacity=".35"/>
    <path d="M46 65Q73 59 100 37Q127 58 155 63L143 72H59Z" fill="#d9e3e7"/>
    <path d="M62 54Q82 46 100 28Q118 46 137 53L130 58H69ZM100 28V21"/>
    <path d="M64 74V102M80 74V103M121 74V103M137 73V101M60 102H140L148 109H53ZM50 116H151"/>
    <path d="M85 103V82Q100 68 116 82V103M89 94H111"/>
    <path d="M28 94H38V86H48M155 94H170V84H179" opacity=".5"/>
  `),
  bridge: icon('广济桥与浮桥', `
    <path d="M10 91H66M134 91H191M9 83H67M133 83H191M17 91V112M50 91V111M149 91V111M181 91V112"/>
    <path d="M17 67Q35 63 42 47Q48 62 67 66L61 72H23ZM26 73V82M57 73V82M139 67Q159 60 165 45Q173 62 187 66L182 72H144ZM148 74V82M177 74V82" fill="#e2e8e5"/>
    <path d="M66 87 134 90M67 93 133 96"/>
    <path d="M70 98H86L82 104H73ZM90 99H106L102 106H94ZM110 100H128L124 106H114Z" fill="#d9e3e7"/>
    <path d="M12 121Q24 115 37 121T63 121M78 120Q92 115 107 120T140 120M153 123Q169 117 190 121" opacity=".5"/>
  `),
  jieyang: icon('揭阳楼与楼前鼎', `
    <path d="M27 109V89H54V66H70V47H88V31H113V46H131V66H148V88H175V109"/>
    <path d="M70 44Q91 40 100 24Q109 40 132 44L123 49H80ZM50 63Q80 59 99 50Q122 61 152 63L143 70H59ZM23 84Q48 82 65 73H136Q157 83 179 84L170 91H31Z" fill="#d9e3e7"/>
    <path d="M36 109H76M123 109H165M68 73V95M133 73V95M84 52V60M116 52V60M17 116H75M126 116H183"/>
    <path d="M84 96H119L115 112H89ZM89 97V89H96V97M107 97V89H114V97M92 113 88 123M111 113 115 123M87 105H115" fill="#f5f0df"/>
  `),
  lighthouse: icon('长山尾灯塔', `
    <path d="M17 118Q48 103 72 110Q93 111 111 103L137 111 159 107 183 116"/>
    <path d="M86 106 92 55H111L118 106Z" fill="#d7a79b"/>
    <path d="M91 74H113M89 92H116M89 54H114V36H91ZM86 35 102 24 118 35ZM88 57H117M93 41H111M99 99V89H106V100"/>
    <path d="M121 42 176 26M122 49 181 59" stroke="#b75645" opacity=".7"/>
    <path d="M20 129Q32 124 47 129T75 129M123 127Q136 120 152 126T184 126M24 94 39 90 54 94" opacity=".5"/>
  `),
  deanli: icon('德安里院落', `
    <path d="M24 99 99 120 177 97 104 78ZM24 99V66L96 87V120M96 87 177 64V97M24 66 105 44 177 64" fill="#e4e6db"/>
    <path d="M16 62 104 36 185 60 177 66 104 46 25 70ZM44 79 101 63 157 78 146 82 101 72 54 85" fill="#f5f0df"/>
    <path d="M62 89 102 78 135 89 102 99ZM62 89V101L102 113 135 103V89M85 113V99M113 111V99"/>
    <path d="M36 83 47 86V96L36 93ZM151 85 164 81V91L151 95ZM92 55 103 52 115 55"/>
    <path d="M14 119Q43 122 61 130M145 121 182 108" opacity=".5"/>
  `),
  wenguang: icon('文光塔', `
    <path d="M74 119 78 97 82 74 85 52 91 28H108L115 53 120 76 124 99 129 119Z" fill="#e1e7e8"/>
    <path d="M66 119H136M71 106 79 101H122L132 106ZM76 93 82 88H119L127 93ZM79 79 85 74H116L124 79ZM83 66 88 61H112L119 66ZM86 53 90 48H110L116 53ZM88 40 94 34H107L113 40ZM91 28 100 19 109 28ZM100 19V12" fill="#f5f0df"/>
    <path d="M100 36V117M94 99V96M107 99V96M96 84V81M105 84V81M97 70V68M104 70V68M98 57V55M103 57V55"/>
    <path d="M43 124H64M138 124H164M37 112 48 108 62 112M144 112 158 108 173 112" opacity=".5"/>
  `),
  cuihu: icon('仙湖片区湖亭', `
    <path d="M19 85Q24 60 50 69Q68 80 84 70Q108 52 137 65Q158 52 181 78Q192 98 161 111Q144 123 107 116Q81 128 47 112Q14 110 19 85Z" fill="#d7e6e8"/>
    <path d="M23 112Q58 126 83 123M128 121Q163 124 185 104M37 92Q63 84 78 91M118 98Q144 89 166 94" opacity=".45"/>
    <path d="M61 83Q82 76 97 57Q113 76 131 81L123 86H70ZM75 86V104M91 86V106M107 86V106M121 86V102M67 107H129M80 65 96 47 116 65" fill="#f5f0df"/>
    <path d="M33 72V51M23 57 34 39 45 57M153 65V44M142 49 153 30 165 49M159 56 176 41 184 56"/>
  `),
  chen: icon('侨宅南洋拱窗', `
    <path d="M40 119V38H160V119M30 32H169M36 25H164M30 121H171M42 46H158"/>
    <path d="M57 105V70Q57 53 72 53Q87 53 87 70V105ZM112 105V70Q112 53 127 53Q142 53 142 70V105Z" fill="#dce6e8"/>
    <path d="M72 54V104M127 54V104M58 72H85M113 72H140M48 110H94M104 110H149M51 42H65M80 42H95M108 42H123M137 42H151M97 49V109M103 49V109"/>
    <path d="M57 116 64 111 71 116 64 121ZM83 116 90 111 97 116 90 121ZM109 116 116 111 123 116 116 121ZM135 116 142 111 149 116 142 121Z" stroke="#b75645"/>
    <path d="M59 28 69 20 84 28M119 28 134 20 144 28"/>
  `),
  tianchi: icon('凤凰天池高山湖', `
    <path d="M12 76 35 48 49 62 73 24 99 55 127 30 151 61 166 48 190 79"/>
    <path d="M61 41 73 24 86 42 77 39 73 47 69 39M115 45 127 30 141 48M32 82 50 72 57 77" opacity=".55"/>
    <path d="M40 88Q36 75 61 69Q80 60 91 69Q105 77 127 68Q152 60 167 79Q177 97 151 106Q134 119 105 109Q83 121 56 108Q40 100 40 88Z" fill="#d7e6e8"/>
    <path d="M53 87Q72 78 90 85M101 94Q121 83 143 89M77 103Q93 98 107 103M34 97Q35 116 64 122Q107 133 151 116" opacity=".5"/>
    <path d="M20 108 28 88 36 103ZM168 104 176 89 183 109ZM136 60 145 52 153 64"/>
  `),
  daoyun: icon('道韵楼三进八角围屋', `
    <path d="M60 24H137L175 48V95L139 119H59L24 96V49Z" fill="#e0e5df"/>
    <path d="M65 35H132L161 54V89L132 109H65L38 89V55ZM73 46H124L148 61V83L124 98H73L51 82V62ZM79 56H118L135 66V79L118 89H80L64 79V67Z"/>
    <path d="M24 49 38 55M24 96 38 89M59 119 65 109M139 119 132 109M175 95 161 89M175 48 161 54M60 24 65 35M137 24 132 35"/>
    <path d="M92 24V57M106 24V57" stroke="#f5f0df" stroke-width="7"/>
    <path d="M88 22H109M91 26V57M107 26V57"/>
    <circle cx="85" cy="74" r="4"/><circle cx="116" cy="74" r="4"/>
    <path d="M75 128Q99 134 125 128" stroke="#73939f"/>
  `),
  jinghai: icon('靖海古城折线城墙', `
    <path d="M18 98V68H29V59H41V68H53V59H65V68H80V102M80 102 143 117 184 92V59L174 63V52L162 57V69L151 73V61L140 66V84L126 79V68L113 64V75L101 70V59L89 55V66L80 63V102" fill="#e1e5df"/>
    <path d="M80 102V64M143 117V84L184 59M31 101V83Q44 72 57 83V104M143 84 80 64M91 88 103 91M115 95 126 98M156 94 169 86M35 113 51 109 67 114M20 120 67 128 132 123"/>
    <path d="M95 112 114 107 124 114M37 52 50 42 65 51M113 43 129 36 143 44" opacity=".45"/>
  `),
  falls: icon('黄满寨谷地瀑布', `
    <path d="M15 119 24 95 21 77 36 58 32 42 55 19 82 25 93 43M185 121 175 98 181 80 161 63 166 41 144 22 123 28 113 43" fill="#e2e6dc"/>
    <path d="M78 27Q91 22 112 29L110 51H96L94 67H119L117 86H97L95 107Q111 119 137 116Q146 132 113 134Q80 131 67 119Q69 110 83 107L85 83H101L102 72H80L81 52H98L100 30" fill="#d6e6e9"/>
    <path d="M86 34V45M105 34V46M87 59V64M111 75V83M91 91V104M80 118Q98 126 123 122M42 83 56 87 68 77M137 57 150 53 156 67M39 108 52 101 66 107"/>
    <path d="M146 124 158 102 143 92 155 78M154 112 165 117M151 95 161 101" opacity=".5"/>
  `),
};

export const REGION_RECORDS = [
  {
    id:'region-small-park',levelId:'small-park',placeId:'small-park',title:'小公园 · 五路寻亭',region:'汕头市',
    ll:[116.669452,23.357849],subtitle:'骑楼相接，街路向亭心汇合',
    details:'中山纪念亭位于小公园五路交汇的核心，周边街巷与骑楼形成连续的老城空间。南生百货在亭的西南侧，同平路与旧公园前路位于西北侧。',
    landmarks:['中山纪念亭','南生百货','升平路'],
    gameNote:'参考点取纪念亭中心；街路缩尺，骑楼立面、商铺室内与任务仓间为游戏重构。',
    sourceUrl:'https://www.openstreetmap.org/way/532956287',iconSvg:icons.park,
  },
  {
    id:'region-guangji',levelId:'guangji',placeId:'guangji',title:'广济桥 · 一江合舟',region:'潮州市',
    ll:[116.65088085,23.66521235],subtitle:'石桥接浮舟，两岸隔韩江',
    details:'广济桥由两岸固定桥段与江心浮桥相接，整体从西向东略偏南跨越韩江。广济门城楼位于西岸，桥东端接入东岸道路。',
    landmarks:['广济门城楼','江心浮桥','韩江两岸'],
    gameNote:'参考点为已核实桥线两端中点，区别于母地图旧近似锚点；桥面加宽，桥亭高度与东岸任务房为游戏设计。',
    sourceUrl:'https://www.openstreetmap.org/way/1446498664',iconSvg:icons.bridge,
  },
  {
    id:'region-jieyang-tower',levelId:'jieyang-tower',placeId:'jieyang-tower',title:'揭阳楼 · 榕江望楼',region:'揭阳市',
    ll:[116.3869,23.56772],subtitle:'西楼东场，城影临江',
    details:'揭阳楼和两翼建筑位于广场西侧，开阔广场向东展开。环市北路在北，临江北路与榕江水面在南，楼西还有已映射水渠。',
    landmarks:['揭阳楼','楼前广场','榕江'],
    gameNote:'楼前鼎与楼体合为象征图标，不表示图标比例或鼎的精确位置；平地基准、屋檐和任务棚含游戏设计。',
    sourceUrl:'https://www.openstreetmap.org/way/904362690',iconSvg:icons.jieyang,
  },
  {
    id:'region-lighthouse',levelId:'lighthouse',placeId:'lighthouse',title:'长山尾 · 海岸守灯',region:'南澳岛',
    ll:[116.9415092,23.4343282],subtitle:'灯塔照海，环岛路随岸而行',
    details:'长山尾灯塔位于南澳岛西端海岸，附近分布停车场、轮渡码头点位与沿岸绿地。环岛公路从附近经过，长山尾炮台位于灯塔东南侧。',
    landmarks:['长山尾灯塔','长山尾炮台','南澳环岛公路'],
    gameNote:'参考点为 OSM 灯塔节点；码头通道、灯塔造型与高度为手绘改编，海浪与天气随机模拟。',
    sourceUrl:'https://www.openstreetmap.org/node/8474840822',iconSvg:icons.lighthouse,
  },
  {
    id:'region-puning-deanli',levelId:'puning-deanli',placeId:'puning-deanli',title:'德安里 · 院落相连',region:'普宁市',
    ll:[116.21152315,23.43624455],subtitle:'围寨藏深院，街水绕厝边',
    details:'德安里位于普宁洪阳镇南村，成组传统院落组成围寨建筑群。已映射的围寨边界、周边街路与东侧水面共同构成这一片区的平面关系。',
    landmarks:['德安里围寨','洪阳大道','东侧河道'],
    gameNote:'参考点用于围寨场景定位；院内厅堂、天井、门洞、任务房与高度是原创示意，未取得逐栋室内测绘。',
    sourceUrl:'https://www.openstreetmap.org/way/1079645434',iconSvg:icons.deanli,
  },
  {
    id:'region-chaoyang-wenguang',levelId:'chaoyang-wenguang',placeId:'chaoyang-wenguang',title:'文光塔 · 八面见城',region:'潮阳区',
    ll:[116.5980183,23.26232045],subtitle:'七层塔檐，立于旧城街路间',
    details:'文光塔以八角平面和七层塔身形成潮阳的古塔地标。塔旁有潮阳博物馆，中华路与振兴路等街路围绕这一老城片区展开。',
    landmarks:['文光塔','潮阳博物馆','中华路'],
    gameNote:'参考点取八角塔体中心；层檐、铺地与塔高为游戏建模，任务房和瞭望屋为原创设施。',
    sourceUrl:'https://www.openstreetmap.org/way/1448198156',iconSvg:icons.wenguang,
  },
  {
    id:'region-chaonan-cuihu',levelId:'chaonan-cuihu',placeId:'chaonan-cuihu',title:'潮南仙湖 · 翠湖旅游区',region:'潮南区',
    ll:[116.2949,23.199],subtitle:'山麓湖湾，亭影点缀水边',
    details:'仙湖位于潮南仙城镇的大南山北麓，是翠湖旅游区组成景点之一。所取片区的湖岸、北坝与出流关系有 OSM 几何依据，湖体本身在 OSM 中未命名。',
    landmarks:['仙湖片区','北侧坝体','沿湖道路'],
    gameNote:'参考点是交叉核对后的仙湖片区位置，不是已测大门；湖亭图标、亭群具体布置和连接步道为原创示意。',
    sourceUrl:'https://www.shantou.gov.cn/cnst/zdly/lyscjgzfxxgk/cyzl/content/post_1342470.html',iconSvg:icons.cuihu,
  },
  {
    id:'region-chenghai-chen',levelId:'chenghai-chen',placeId:'chenghai-chen',title:'陈慈黉故居 · 侨窗映庭',region:'澄海区',
    ll:[116.7407,23.5696],subtitle:'传统院落里，望见南洋拱窗',
    details:'陈慈黉故居位于澄海隆都镇前美村，传统院落与西式洋楼、亭台通廊相互结合。已映射的郎中第、寿康里、周围巷道和荷花池保留了侨宅片区的空间关系。',
    landmarks:['郎中第','寿康里','荷花池'],
    gameNote:'参考点用于前美侨宅片区定位；拱窗和彩砖是风格提炼，未命名楼体不强行冠名，室内与任务房为游戏创作。',
    sourceUrl:'https://www.shantou.gov.cn/cnst/ywdt/content/post_2130073.html',iconSvg:icons.chen,
  },
  {
    id:'region-chaoan-tianchi',levelId:'chaoan-tianchi',placeId:'chaoan-tianchi',title:'凤凰天池 · 云上湖盆',region:'潮安区',
    ll:[116.6448552,23.9560917],subtitle:'高山抱湖，岩岸接曲径',
    details:'凤凰天池位于凤凰山乌岽山顶的高山湖盆，周边有岩景与观景步道。湖岸轮廓与西、南、东侧山径采用已保存的 OSM 折线，形成沿湖分支路线。',
    landmarks:['凤凰天池','乌岽山','沿湖山径'],
    gameNote:'参考点取 OSM 命名景点节点；山峰轮廓、坡形、岩块和岗棚为游戏设计，没有使用 DEM。',
    sourceUrl:'https://www.openstreetmap.org/way/310758870',iconSvg:icons.tianchi,
  },
  {
    id:'region-raoping-daoyun',levelId:'raoping-daoyun',placeId:'raoping-daoyun',title:'道韵楼 · 八角围家',region:'饶平县',
    ll:[116.8230429,23.9767447],subtitle:'三进围屋，一埕两井',
    details:'道韵楼位于饶平南联村，坐南朝北，三进八角围屋环绕中央内埕。楼前北侧池塘有 OSM 轮廓，内埕两口公用井也有文物资料记载。',
    landmarks:['三进八角围屋','楼前池塘','内埕公用井'],
    gameNote:'参考点为外八角顶点均值；井在图标中的位置、加宽门洞、屋顶高度与内埕任务房均为示意。',
    sourceUrl:'https://www.openstreetmap.org/relation/12285115',iconSvg:icons.daoyun,
  },
  {
    id:'region-huilai-jinghai',levelId:'huilai-jinghai',placeId:'huilai-jinghai',title:'靖海古城 · 墙巷听潮',region:'惠来县',
    ll:[116.5220784,23.0079318],subtitle:'海防城墙，转入老街深处',
    details:'靖海古城具有明代海防城镇背景，城门、老街与民居组成传统聚落环境。已映射的城墙保留北段转向东侧的折线形态，城内外道路与南侧水面共同组织路线。',
    landmarks:['靖海古城墙','城门老街','南侧水面'],
    gameNote:'参考点取城东门位置道路节点；没有补画为完整古城，门面、民居体块、墙高和任务房为游戏重构。',
    sourceUrl:'https://www.openstreetmap.org/way/1540243655',iconSvg:icons.jinghai,
  },
  {
    id:'region-jiexi-falls',levelId:'jiexi-falls',placeId:'jiexi-falls',title:'黄满寨 · 瀑落深谷',region:'揭西县',
    ll:[115.9847193,23.5818848],subtitle:'曲径逐溪，水声层层向下',
    details:'黄满寨瀑布群位于揭西粗坑村一带的深谷，景区资料记载有五级瀑布群。保存的 OSM 步道与溪流呈曲折走势，沿谷主路还连接分支小径。',
    landmarks:['黄满寨瀑布群','谷中溪流','沿谷步道'],
    gameNote:'参考点为景区轮廓顶点均值，不是某处瀑口；瀑幕位置、落差、坡形与栈桥为游戏设计，没有使用 DEM。',
    sourceUrl:'https://www.openstreetmap.org/way/541634622',iconSvg:icons.falls,
  },
];
