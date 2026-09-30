import {bounded} from './files.js';
import {validEmbedPlayer} from './douyin-embed.js';

// Read only the official embedded player's own poster. Recommendation cards,
// avatars, QR codes and arbitrary image requests can never qualify.
export function collectEmbeddedPost(id,marker) {
  let observer,timer,finished=false;
  const inspect=()=>{
    if(finished) return;
    const current=new URL(location.href);
    if(current.origin!=='https://open.douyin.com' || current.pathname!=='/player/video' || current.searchParams.getAll('vid').length!==1 || current.searchParams.get('vid')!==id) return;
    const players=document.querySelectorAll('.video-container');
    if(players.length!==1) return;
    const posters=players[0].querySelectorAll(':scope > xg-video-container > xg-poster');
    if(posters.length!==1) return;
    const match=/^url\((['"]?)(.*?)\1\)$/.exec(posters[0].style.backgroundImage || '');
    if(!match) return;
    let cover;
    try {
      cover=new URL(match[2],current);
      if(cover.protocol!=='https:' || cover.username || cover.password || cover.port ||
        !['.douyinpic.com','.byteimg.com'].some(host=>cover.hostname.endsWith(host)) ||
        /\.(mp4|webm|m3u8|mpd)$/i.test(cover.pathname)) return;
    } catch { return; }
    finished=true;observer?.disconnect();clearTimeout(timer);
    const output=document.createElement('script');output.type='application/json';output.id=marker;
    output.textContent=JSON.stringify({id,url:current.origin+current.pathname+'?vid='+id+'&autoplay=0',
      coverUrl:cover.href,coverEvidence:'bound_embed_poster'}).replaceAll('<','\\u003c');
    document.body.appendChild(output);
  };
  observer=new MutationObserver(inspect);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
  timer=setTimeout(()=>{inspect();observer.disconnect();},20000);inspect();
}

export function readEmbeddedCapture(html,marker,target,embed) {
  if(!validEmbedPlayer(embed?.playerUrl,target.id) || typeof embed.caption!=='string' || !embed.caption.trim() || embed.caption.length>50000 || !/^lingan-capture-[a-f0-9]{32}$/.test(marker)) return null;
  const expression=new RegExp('<script\\b(?=[^>]*\\bid=["\\\']'+marker+'["\\\'])[^>]*>([\\s\\S]*?)<\\/script>','gi');
  try {
    const matches=[...html.matchAll(expression)];if(matches.length!==1) return null;
    const value=JSON.parse(matches[0][1]);
    if(value.id!==target.id || value.url!==embed.playerUrl || value.coverEvidence!=='bound_embed_poster' || typeof value.coverUrl!=='string' || value.coverUrl.length>2000) return null;
    const cover=new URL(value.coverUrl);
    if(cover.protocol!=='https:' || cover.username || cover.password || cover.port ||
      !['.douyinpic.com','.byteimg.com'].some(host=>cover.hostname.endsWith(host)) || /\.(mp4|webm|mov|m3u8|mpd)$/i.test(cover.pathname)) return null;
    return {url:target.url,title:embed.caption.slice(0,120),description:embed.caption,coverUrl:cover.href,
      coverKind:'video_cover',metadataSource:'douyin_official_embed',source:'douyin',sourceLabel:'抖音视频'};
  } catch { return null; }
}

// Runs in the provider's fresh, anonymous page. No cookies, account state or
// publisher JavaScript objects are read; only the rendered post and its poster.
export function collectRenderedPost(id, marker) {
  let observer, timer, finished = false;
  const inspect = (last = false) => {
    if (finished) return;
    const current = new URL(location.href);
    if (current.origin !== 'https://www.douyin.com' || current.pathname !== '/video/' + id) return;
    const player = document.querySelector('.video_' + id);
    const headings = [...document.querySelectorAll('h1')].filter(e => e.getBoundingClientRect().height > 0);
    if (!player || headings.length !== 1) return;
    const caption = headings[0].innerText.trim();
    if (!caption) return;
    const allowedImage = value => {
      try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
          (u.hostname.endsWith('.douyinpic.com') || u.hostname.endsWith('.byteimg.com')) &&
          !/\.(mp4|webm|m3u8|mpd)$/i.test(u.pathname);
      } catch { return false; }
    };
    const poster = player.querySelector('video')?.getAttribute('poster');
    const coverUrl = allowedImage(poster) ? poster : '';
    if (coverUrl || last) { finished = true; observer?.disconnect(); clearTimeout(timer); }
    let output = document.getElementById(marker);
    if (!output) { output = document.createElement('script'); output.type = 'application/json'; output.id = marker; document.body.appendChild(output); }
    const serialized = JSON.stringify({id, url: current.origin + current.pathname, caption, coverUrl,
      coverEvidence: coverUrl ? 'bound_video_poster' : 'missing'}).replaceAll('<', '\\u003c');
    if (output.textContent !== serialized) output.textContent = serialized;
  };
  observer = new MutationObserver(() => inspect());
  observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true});
  timer = setTimeout(() => inspect(true), 15000);
  inspect();
}

export function browserCaptureStatus(env) {
  const configured = /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_BROWSER_ACCOUNT_ID || '') &&
    typeof env.CLOUDFLARE_BROWSER_API_TOKEN === 'string' && env.CLOUDFLARE_BROWSER_API_TOKEN.trim().length >= 20;
  return {configured, provider:'cloudflare', independentOfComputer:true};
}

function canonical(value) {
  try {
    const u = new URL(value), id = /^\/video\/(\d+)\/?$/.exec(u.pathname)?.[1];
    if (u.protocol === 'https:' && u.hostname === 'www.douyin.com' && !u.port && !u.username && !u.password && id)
      return {id, url:'https://www.douyin.com/video/' + id};
  } catch {}
  return null;
}

export function readRenderedCapture(html, marker, expectedUrl) {
  const expected = canonical(expectedUrl);
  if (!expected || !/^lingan-capture-[a-f0-9]{32}$/.test(marker)) return null;
  // The marker is unpredictable and generated for this request, not supplied by
  // the caller or selected from arbitrary publisher JSON.
  const expression = new RegExp('<script\\b(?=[^>]*\\bid=["\\\']' + marker + '["\\\'])[^>]*>([\\s\\S]*?)<\\/script>', 'i');
  try {
    const matches = [...html.matchAll(new RegExp(expression.source, 'gi'))];
    if (matches.length !== 1) return null;
    const value = JSON.parse(matches[0][1] || 'null');
    if (!value || value.id !== expected.id || value.url !== expected.url || typeof value.caption !== 'string' || !value.caption.trim() || value.caption.length > 50000) return null;
    let cover = '';
    if (typeof value.coverUrl === 'string' && value.coverUrl && value.coverUrl.length <= 2000) {
      const u = new URL(value.coverUrl);
      if (u.protocol === 'https:' && !u.username && !u.password && !u.port &&
          (u.hostname.endsWith('.douyinpic.com') || u.hostname.endsWith('.byteimg.com')) &&
          !/\.(mp4|webm|mov|m3u8|mpd)$/i.test(u.pathname) &&
          value.coverEvidence === 'bound_video_poster') cover = u.href;
    }
    return {url:expected.url, title:value.caption.slice(0,120), description:value.caption, coverUrl:cover,
      coverKind:cover?'video_cover':'unknown', metadataSource:'cloud_browser_dom', source:'douyin', sourceLabel:'抖音视频'};
  } catch { return null; }
}

const jobs = new Map();
export async function renderDouyin(env, value, embed = null) {
  const target = canonical(value);
  if (!target) return {status:'unsupported'};
  if (!browserCaptureStatus(env).configured) return {status:'not_configured', warning:'这条抖音需要浏览器读取；云端自动补全服务尚未开通。已取得的内容仍可保留。'};
  if(embed && (!validEmbedPlayer(embed.playerUrl,target.id) || typeof embed.caption!=='string' || !embed.caption.trim() || embed.caption.length>50000)) return {status:'unsupported'};
  target.embed=embed;
  const key = env.CLOUDFLARE_BROWSER_ACCOUNT_ID + ':' + target.id + (embed?':embed':'');
  if (jobs.has(key)) return jobs.get(key);
  if (jobs.size >= 2) return {status:'limited', warning:'正在读取其他链接，请稍后重试；草稿仍保留。'};
  const job = requestRenderedPage(env,target);
  jobs.set(key,job);
  try { return await job; } finally { if (jobs.get(key)===job) jobs.delete(key); }
}

function numericErrorCodes(payload) {
  if (!Array.isArray(payload?.errors)) return [];
  return [...new Set(payload.errors.slice(0,20).flatMap(item => {
    const value = item?.code;
    if (Number.isSafeInteger(value)) return [value];
    if (typeof value === 'string' && /^\d{1,12}$/.test(value)) return [Number(value)];
    return [];
  }))];
}

function providerFailureClass(payload, status) {
  const messages = Array.isArray(payload?.errors) ? payload.errors.slice(0,20)
    .map(item => typeof item?.message === 'string' ? item.message.slice(0,2000) : '').join(' ').toLowerCase() : '';
  // Inspect text only to select a fixed category; never retain or log the text.
  if (/selector|waitforselector/.test(messages)) return 'selector';
  if (/navigation|\bgoto\b/.test(messages)) return 'navigation';
  if (/timeout|timed out|time limit|deadline|took too long/.test(messages)) return 'timeout';
  if (/captcha|challenge|bot detection/.test(messages)) return 'challenge';
  if (/quota|rate limit|concurren|capacity/.test(messages) || status === 429) return 'quota';
  if (/unauthori|authenticat|permission/.test(messages) || status === 401 || status === 403) return 'authorization';
  if (/validation|invalid (?:parameter|argument)|schema/.test(messages) || status === 400) return 'validation';
  return 'unknown';
}

function exceptionFailureClass(error) {
  if (error?.status === 413) return 'response_size';
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (name === 'TimeoutError' || /timeout|timed out|time limit|deadline/.test(message)) return 'timeout';
  if (/redirect/.test(message)) return 'redirect';
  if (name === 'AbortError' || /abort|signal/.test(message)) return 'signal';
  if (/header|invalid.*(?:byte|character)|byte.*character/.test(message)) return 'header';
  if (/subrequest/.test(message)) return 'subrequest';
  if (name === 'SyntaxError') return 'json_parse';
  if (/fetch|network|socket|connection|\bdns\b|\btls\b|certificate|\bssl\b/.test(message)) return 'network';
  return 'unknown';
}

function logFailure(started, phase, providerHTTPStatus, errorCodes = [], exceptionClass = 'none', providerClass = 'unknown') {
  try {
    console.warn(JSON.stringify({event:'browser_capture_failed', phase,
      elapsedMs:Math.max(0,Date.now()-started), providerHTTPStatus, errorCodes, exceptionClass, providerClass}));
  } catch {} // Logging must never change the request's user-visible result.
}

async function requestRenderedPage(env, target) {
  const marker = 'lingan-capture-' + crypto.randomUUID().replaceAll('-','');
  const started = Date.now();
  let phase = 'request', providerHTTPStatus = null, errorCodes = [];
  try {
    // Handle redirects explicitly: some hosting runtimes reject redirect:error.
    // Never follow a Location header with the provider credential.
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_BROWSER_ACCOUNT_ID + '/browser-run/content?cacheTTL=0', {
      method:'POST', redirect:'manual', signal:AbortSignal.timeout(45000),
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + env.CLOUDFLARE_BROWSER_API_TOKEN},
      body:JSON.stringify({url:target.embed?.playerUrl || target.url, gotoOptions:{waitUntil:'domcontentloaded', timeout:15000},
        rejectResourceTypes:['media','font'], actionTimeout:25000,
        addScriptTag:[{content:'(' + (target.embed?collectEmbeddedPost:collectRenderedPost).toString() + ')(' + JSON.stringify(target.id) + ',' + JSON.stringify(marker) + ')'}],
        waitForSelector:target.embed?{selector:'.video-container > xg-video-container > xg-poster[style*="url("]',timeout:15000}:{selector:'body:has(.video_' + target.id + ') h1', visible:true, timeout:20000}, waitForTimeout:1000})
    });
    providerHTTPStatus = response.status;
    if(response.status>=300 && response.status<400) {
      try { await response.body?.cancel(); } catch {}
      logFailure(started,'provider_http',providerHTTPStatus,[],'none','redirect');
      return {status:'configuration_error',warning:'云端采集接口发生跳转，已停止请求；草稿仍保留。'};
    }
    if (!response.ok) {
      let payload = null, exceptionClass = 'none';
      try {
        payload = JSON.parse(new TextDecoder().decode(await bounded(response,64*1024)));
        errorCodes = numericErrorCodes(payload);
      } catch (error) {
        exceptionClass = exceptionFailureClass(error);
        try { await response.body?.cancel(); } catch {}
      }
      logFailure(started,'provider_http',providerHTTPStatus,errorCodes,exceptionClass,providerFailureClass(payload,response.status));
      return {status:response.status===429?'limited':response.status===401||response.status===403?'configuration_error':'unavailable',
        warning:response.status===429?'云端采集额度或频率已达限制，请稍后重试；草稿仍保留。':response.status===401||response.status===403?'云端采集授权需要检查；草稿仍保留。':'云端暂时无法打开这条抖音；草稿仍保留，请稍后重试。'};
    }
    phase = 'response_body';
    const raw = await bounded(response,5*1024*1024);
    phase = 'response_json';
    const payload = JSON.parse(new TextDecoder().decode(raw));
    errorCodes = numericErrorCodes(payload);
    if (payload?.success !== true || typeof payload.result !== 'string') {
      logFailure(started,'provider_result',providerHTTPStatus,errorCodes,'none',providerFailureClass(payload,response.status));
      return {status:'unavailable',warning:'云端未能读取这条视频，请稍后重试或补充封面与原文。'};
    }
    if (payload.meta?.finalUrl && (target.embed?!validEmbedPlayer(payload.meta.finalUrl,target.id):canonical(payload.meta.finalUrl)?.url !== target.url)) {
      logFailure(started,'final_url',providerHTTPStatus,errorCodes,'none','mismatch');
      return {status:'mismatch',warning:'原站跳转到了其他页面，未采用该页面的内容。'};
    }
    phase = 'capture';
    const capture = target.embed?readEmbeddedCapture(payload.result,marker,target,target.embed):readRenderedCapture(payload.result,marker,target.url);
    return {status:capture?.coverUrl&&capture?.description?'ready':'incomplete', capture, html:payload.result,
      warning:capture?.coverUrl&&capture?.description?'':'云端未取得完整的视频封面与原文，请核对后补充。'};
  } catch (error) {
    // Provider errors may contain credentials or publisher HTML. Never forward
    // their raw messages to the client or logs.
    logFailure(started,phase,providerHTTPStatus,errorCodes,exceptionFailureClass(error));
    return {status:'unavailable',warning:'云端读取超时或暂时不可用；草稿仍保留，请稍后重试。'};
  }
}
