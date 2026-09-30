import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call} from './fixtures.mjs';
import {mutate} from '../worker/state.js';
test('platform account diagnostics are available to the owner only',async()=>{
  const env=environment();try{
    const accounts=[{platform:'DOUYIN',profileUrl:'https://www.douyin.com/user/fixture',displayName:'Fixture'}];
    await mutate(env,s=>{s.xActivity={accounts,lastReceivedEventAt:'2026-09-30T00:00:00Z',activityActiveCount:1};});
    const response=await call(env,'/api/mezip/status');assert.equal(response.status,200);
    const result=await response.json();assert.deepEqual(result.activityAccounts,accounts);assert.equal(result.activityActiveCount,1);
    for(const auth of ['anonymous','other'])assert.equal((await call(env,'/api/mezip/status',{auth})).status,401);
  }finally{env.close();}
});
