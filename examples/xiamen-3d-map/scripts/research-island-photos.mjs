const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const term of ['观海园','大德记','鼓浪石','美华沙滩','黄荣远','Yanping Park','Sunlight Rock Temple','Kulangsu Foreign Artifacts','HSBC Gulangyu','Yin Chengzong']){
 const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',list:'search',srnamespace:'6',srsearch:'"'+term+'"',srlimit:'3'});
 const r=await fetch(url,{signal:AbortSignal.timeout(25000)});
 console.log(term,r.status,r.ok?(await r.json()).query?.search.map(p=>p.title):'');await pause(1200);
}
