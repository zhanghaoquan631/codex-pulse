/** DOM-free weather definitions and enemy affinities. All durations are seconds.
 * Engine owns the timer: start with createWeatherState(theme, rng), decrement
 * remaining only during active play, announce nextId at WEATHER_FORECAST_SECONDS,
 * then replace with createWeatherState(theme, rng, previous.nextId) at zero.
 * Profiles multiply ORIGINAL enemy stats, never already modified runtime stats.
 * Level is a displayed threat rank; multipliers already include its effect.
 */

export const WEATHER_FORECAST_SECONDS = 5;
export const WEATHER_DURATION_RANGE = Object.freeze([45, 75]);

function freezeRecord(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeRecord(child);
  return Object.freeze(value);
}

export const WEATHER = freezeRecord({
  clear: {
    id: 'clear', name: '晴天', icon: '☀',
    description: '风轻云淡，怪物回到常态。趁视野清楚认路、补给。',
    visual: { sky: 0xf1ecdf, fogColor: 0xf1ecdf, fogNear: 34, fogFar: 130, rainAmount: 0, wind: .15, lightning: false, lightIntensity: 1 },
  },
  rain: {
    id: 'rain', name: '细雨', icon: '☂',
    description: '细雨晕开纸墨，纸怪变弱；寄甲蟹借湿地加速。',
    visual: { sky: 0xcdd2ce, fogColor: 0xd3d8d3, fogNear: 23, fogFar: 90, rainAmount: .4, wind: .35, lightning: false, lightIntensity: .82 },
  },
  fog: {
    id: 'fog', name: '浓雾', icon: '≋',
    description: '雾中纸影与弓手更活跃。靠近掩体，留意怪物轮廓。',
    visual: { sky: 0xd6dcda, fogColor: 0xd6dcda, fogNear: 8, fogFar: 34, rainAmount: 0, wind: .08, lightning: false, lightIntensity: .88 },
  },
  storm: {
    id: 'storm', name: '雷雨', icon: 'ϟ',
    description: '雷雨唤醒灯笼精，蓄力更久也更危险；纸怪被雨打湿。',
    visual: { sky: 0xa7b5bd, fogColor: 0xb0bfc5, fogNear: 17, fogFar: 68, rainAmount: .85, wind: .85, lightning: true, lightIntensity: .7 },
  },
});

export const WEATHER_IDS = Object.freeze(Object.keys(WEATHER));

// Relative weights describe the chapter's atmosphere, not real-world forecasts.
export const WEATHER_WEIGHTS = freezeRecord({
  default: { clear: 5, rain: 3, fog: 2, storm: 1 },
  arcade: { clear: 6, rain: 4, fog: 2, storm: 1 },
  town: { clear: 6, rain: 4, fog: 2, storm: 1 },
  bridge: { clear: 3, rain: 3, fog: 5, storm: 2 },
  harbor: { clear: 3, rain: 4, fog: 3, storm: 3 },
  tower: { clear: 3, rain: 2, fog: 5, storm: 3 },
  temple: { clear: 3, rain: 2, fog: 5, storm: 3 },
  island: { clear: 4, rain: 4, fog: 2, storm: 5 },
  coast: { clear: 4, rain: 4, fog: 2, storm: 5 },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function randomUnit(rng = Math.random) {
  const value = typeof rng === 'function' ? rng() : .5;
  return Number.isFinite(value) ? clamp(value, 0, 1 - Number.EPSILON) : .5;
}

/** Weighted sample, excluding the current weather; RNG may be deterministic. */
export function chooseWeather(theme = 'default', previousId = null, rng = Math.random) {
  const weights = Object.hasOwn(WEATHER_WEIGHTS, theme) ? WEATHER_WEIGHTS[theme] : WEATHER_WEIGHTS.default;
  const options = WEATHER_IDS.filter(id => id !== previousId);
  let needle = randomUnit(rng) * options.reduce((sum, id) => sum + weights[id], 0);
  for (const id of options) {
    needle -= weights[id];
    if (needle < 0) return id;
  }
  return options[options.length - 1];
}

export function weatherDuration(rng = Math.random) {
  return WEATHER_DURATION_RANGE[0] + randomUnit(rng) * (WEATHER_DURATION_RANGE[1] - WEATHER_DURATION_RANGE[0]);
}

/** Every new chapter starts clear unless an explicit valid initialId is supplied. */
export function createWeatherState(theme = 'default', rng = Math.random, initialId = 'clear') {
  const id = Object.hasOwn(WEATHER, initialId) ? initialId : 'clear';
  const duration = weatherDuration(rng);
  return { id, nextId: chooseWeather(theme, id, rng), duration, remaining: duration, forecast: false };
}

// Tuple: rank delta, HP, damage, speed, attack cooldown, XP, gold, telegraph.
// Cooldown > 1 gives more time between attacks; telegraph > 1 warns earlier.
const AFFINITIES = freezeRecord({
  rain: {
    inkling: [-1, .85, .90, .90, 1.10, .90, .95, 1.10, '墨迹被雨水晕开，体力与步伐减弱'],
    shade: [-1, .86, .92, .90, 1.10, .90, .95, 1.10, '纸身浸湿，追击放慢'],
    brute: [0, 1.06, 1, .94, 1.05, 1.03, 1.03, 1.05, '湿石甲稍厚，出手略缓'],
    archer: [-1, .94, .88, .96, 1.16, .92, .95, 1.15, '弓弦受潮，射击减弱'],
    boss: [0, 1.08, .95, .96, 1.06, 1.05, 1.05, 1.10, '潮墨凝甲，行动与出招稍缓'],
    doodler: [-1, .82, .86, .90, 1.12, .88, .92, 1.15, '纸面浸湿，笔弹威力下降'],
    lantern: [-1, .90, .88, .94, 1.16, .90, .94, 1.20, '雨点压住灯火，火弹更慢出手'],
    crab: [1, 1.25, 1.12, 1.12, .90, 1.25, 1.20, 1.15, '湿地增益，甲壳更硬、冲刺更快'],
  },
  fog: {
    inkling: [0, 1.04, 1, 1.05, 1, 1.04, 1.04, 1, '雾气聚墨，步伐略轻'],
    shade: [1, 1.15, 1.10, 1.18, .92, 1.22, 1.18, 1.15, '借雾潜行，追击更快'],
    brute: [-1, 1, .96, .86, 1.15, .94, .97, 1.15, '视线受阻，转进与挥击变慢'],
    archer: [1, 1.08, 1.08, 1, .88, 1.20, 1.16, 1.15, '隐在雾中，箭雨更密'],
    boss: [1, 1.13, 1.06, 1.04, .97, 1.15, 1.12, 1.15, '雾中凝聚墨潮，护甲增强'],
    doodler: [1, .96, 1.04, 1.08, .92, 1.12, 1.10, 1.20, '雾中游走，笔弹更勤，蓄力更显眼'],
    lantern: [1, 1.06, 1.10, 1.06, .96, 1.14, 1.12, 1.25, '灯火聚雾，火弹增强，亮光预警更久'],
    crab: [0, 1, 1, .94, 1.08, 1, 1, 1.10, '探路变慢，冲刺间隔变长'],
  },
  storm: {
    inkling: [-1, .82, .86, .92, 1.20, .88, .92, 1.15, '暴雨冲淡墨身，连续进攻减弱'],
    shade: [-1, .88, .92, .95, 1.10, .92, .95, 1.15, '纸身被暴雨拖住，难以追击'],
    brute: [1, 1.18, 1.08, .88, 1.10, 1.14, 1.12, 1.25, '雨水压实石甲，重击更重但出手更慢'],
    archer: [-1, .95, .92, .96, 1.15, .93, .96, 1.30, '风雨扰箭，射击间隔更长'],
    boss: [2, 1.30, 1.18, 1.05, 1.10, 1.32, 1.28, 1.35, '雷声助长墨潮，威力增强，蓄力更久'],
    doodler: [-1, .80, .85, .88, 1.18, .86, .90, 1.15, '笔墨遭暴雨冲刷，纸身与笔弹减弱'],
    lantern: [2, 1.25, 1.25, 1.10, 1.16, 1.35, 1.30, 1.65, '雷火共鸣，火弹更强；亮光蓄力显著延长'],
    crab: [1, 1.20, 1.15, 1.15, .98, 1.25, 1.22, 1.35, '乘着风雨突进，冲锋预警更长'],
  },
});

const PROFILE_KEYS = Object.freeze(['hpMultiplier', 'damageMultiplier', 'speedMultiplier', 'cooldownMultiplier', 'xpMultiplier', 'goldMultiplier', 'telegraphMultiplier']);

/** Pure affinity lookup. Unknown types/weather safely return the neutral profile. */
export function weatherEnemyProfile(type, weatherId, baseLevel = 1) {
  const safeLevel = Number.isFinite(baseLevel) ? clamp(Math.floor(baseLevel), 1, 50) : 1;
  const weatherRows = Object.hasOwn(AFFINITIES, weatherId) ? AFFINITIES[weatherId] : null;
  const row = weatherRows && Object.hasOwn(weatherRows, type) ? weatherRows[type] : null;
  const level = clamp(safeLevel + (row?.[0] || 0), 1, 50);
  const result = {
    level,
    levelDelta: level - safeLevel,
    weatherTrait: row ? row[8] : '常态 · 按原有能力行动',
  };
  PROFILE_KEYS.forEach((key, index) => { result[key] = row ? row[index + 1] : 1; });
  return result;
}
