import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg'};
const port=Number(process.env.XIAMEN_ATLAS_PORT)||5243;
const address=`http://127.0.0.1:${port}/`;
let existing=false;
try{const response=await fetch(address,{signal:AbortSignal.timeout(1500)});existing=response.ok&&(await response.text()).includes('厦门 · XIAMEN 3D Atlas');}catch{}
if(existing){console.log(`厦门地图已运行：${address}`);}
else{
 const server=http.createServer(async(req,res)=>{try{const requested=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const target=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const info=await stat(target);if(!info.isFile())throw new Error('not a file');const bytes=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Content-Length':bytes.length});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
 server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`${port} 端口已被其他程序使用；请关闭该程序后重试。`:error);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`厦门地图：${address}`));
}
