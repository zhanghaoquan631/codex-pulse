export function cleanWebsiteUrl(value: unknown, depth=0): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (/(^|\.)(auth\.openai\.com|accounts\.google\.com|login\.microsoftonline\.com)$/.test(url.hostname)) return null;
    if (/\/(?:oauth|authorize|callback|signin|signout|login|logout|reset[-_]?password|magic[-_]?link|invite|invitation)(?:\/|$)/i.test(url.pathname) || /\/(?:eyJ[A-Za-z0-9_-]+\.|[A-Za-z0-9_-]{100,})(?:\/|$)/.test(url.pathname)) return null;
    for (const key of url.searchParams.keys()) {
      if (/(token|secret|password|passwd|credential|signature|api.?key|access|auth|session|code|^key$|^sig$|^x-amz-|^x-goog-)/i.test(key)) return null;
    }
    for (const raw of url.searchParams.values()) {
      let decoded=raw;for(let i=0;i<2;i++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}
      const nested=decoded.match(/https?:\/\/[^\s<>"']+/g)||[];
      if(nested.some(link=>depth>=2||!cleanWebsiteUrl(link,depth+1)))return null;
      if(!nested.length&&/^[A-Za-z0-9_-]{32,}$/.test(decoded)&&/[A-Za-z]/.test(decoded)&&/\d/.test(decoded))return null;
    }
    if (/(token|secret|password|passwd|credential|signature|api.?key|access|auth|session|code|\bkey|\bsig|x-amz-|x-goog-)[^=]*=/i.test(url.hash)) return null;
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    if(!url.hash.startsWith("#/")) url.hash = "";
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

export type Website = {id:string;url:string;title:string;kind:"developed"|"shared";source:"codex"|"manual";firstSeen:string;lastSeen:string;boxName?:string;eventCount?:number};
