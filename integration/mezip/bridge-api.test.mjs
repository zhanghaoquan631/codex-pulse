// Run against the isolated local Worker configured with test-only credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:43911';
const deviceId='00000000-0000-4000-8000-000000000001';
const owner={'oai-authenticated-user-email':'mezip-test@example.invalid',Origin:base,'Content-Type':'application/json'};
const key={Authorization:'Bearer isolated-mezip-test','Content-Type':'application/json'};
const localRestartMessage='Your worker restarted mid-request. Please try sending the request again. Only GET or HEAD requests are retried automatically.';
async function call(path,{headers=owner,...options}={}){
  // Wrangler 4.92 locally interrupts the next POST after an early auth rejection
  // leaves a request body unread. Reproduces even on a fresh HTTP connection.
  // Retry only its exact proxy response, never an application JSON 503. These
  // tests reuse command IDs and idempotent bridge results when retrying a POST.
  for(let retry=0;retry<=2;retry++){
    const r=await fetch(base+path,{headers:{...headers,Connection:'close'},...options});
    const text=await r.text();
    if(r.status===503&&text===localRestartMessage&&retry<2)continue;
    assert.notEqual(text,localRestartMessage,`Local Wrangler kept restarting during ${path}`);
    return {status:r.status,body:JSON.parse(text)};
  }
}
const post=(path,body,headers=owner)=>call(path,{method:'POST',body:JSON.stringify(body),headers});
assert.equal((await call('/api/mezip/status',{headers:{}})).status,403);
assert.equal((await post('/api/mezip/bridge',{deviceId,online:true,results:[]},{})).status,401);
assert.equal((await post('/api/mezip/bridge',{deviceId,online:true,results:[]},key)).status,200);
assert.equal((await call('/api/mezip/status')).body.connected,true);
const command={id:randomUUID(),method:'GET',path:'/v1/x/local-capture/health'};
assert.equal((await post('/api/mezip/requests',command,{})).status,403);
assert.equal((await post('/api/mezip/requests',command,{...owner,Origin:'https://evil.invalid'})).status,403);
assert.equal((await post('/api/mezip/requests',{...command,path:'http://127.0.0.1:4319/v1/x/local-capture/health'})).status,400);
assert.equal((await post('/api/mezip/requests',{...command,path:'/v1/resources/records/../../settings'})).status,400);
assert.equal((await post('/api/mezip/requests',command)).status,202);
assert.equal((await post('/api/mezip/requests',command)).status,202);
assert.equal((await post('/api/mezip/requests',{...command,path:'/v1/x/local-capture/stats'})).status,409);
const claim=await post('/api/mezip/bridge',{deviceId,online:true,results:[]},key);
assert.equal(claim.body.commands.filter(c=>c.id===command.id).length,1);
assert.equal((await post('/api/mezip/bridge',{deviceId,online:true,results:[]},key)).body.commands.length,0);
const result={id:command.id,status:200,body:{data:{active:true,mode:'LOCAL_CAPTURE'}}};
assert.equal((await post('/api/mezip/bridge',{deviceId,online:true,results:[result]},key)).status,200);
assert.deepEqual((await call('/api/mezip/requests?id='+command.id)).body,{state:'done',status:200,body:result.body});
assert.equal((await call('/api/mezip/requests?id='+command.id,{headers:{}})).status,403);
assert.equal((await post('/api/mezip/bridge',{deviceId:randomUUID(),online:true,results:[]},key)).status,409);
assert.equal((await post('/api/mezip/bridge',{deviceId,online:false,results:[result]},key)).status,200);
assert.equal((await call('/api/mezip/status')).body.connected,false);
assert.equal((await post('/api/mezip/requests',{...command,id:randomUUID()})).status,503);
assert.equal((await post('/api/mezip/bridge',{deviceId,online:true,results:[]},key)).status,200);
console.log('PASS: owner auth, CSRF, fixed routes, idempotent enqueue/results, leases, one-computer binding, offline/reconnect.');
