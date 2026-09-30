import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../server/index.mjs';
import {chatGPTSignInPath,chatGPTSignOutPath} from '../apps/account/src/chatgpt-auth.mjs';
import imageAliases from '../server/static-image-aliases.json' with {type:'json'};

const origin='https://mezip.example.test';
const documents=new Map([
  ['/index.html','login-and-lanyards'],
  ['/account/index.html','login-and-lanyards'],
  ['/playground/index.html','artwork-and-games'],
  ['/racing/index.html','paper-racing'],
  ['/racing/models/laguna-seca.glb','race-model'],
  ['/account/assets/font.woff2','font-bytes'],
  ['/media/artwork.webp','artwork-bytes'],
  ['/media/gallery-rewards/wechat-0051/photo.jpg','reward-photo'],
  ['/media/gallery-rewards/wechat-0327/photo.jpg','second-reward-photo'],
  ['/infinite-gallery/wechat-0327/manifest.json','gallery-specific-manifest'],
]);
for(const alias of Object.values(imageAliases))documents.set(alias.path,'lossless-'+alias.sha256);
const env={ASSETS:{async fetch(request){
  let pathname=new URL(request.url).pathname;
  if(pathname.endsWith('/'))pathname+='index.html';
  return documents.has(pathname)?new Response(documents.get(pathname)):new Response('Missing',{status:404});
}}};

test('root and account retain the login experience; playground retains artwork',async()=>{
  for(const [pathname,expected] of [
    ['/','login-and-lanyards'],['/account/','login-and-lanyards'],
    ['/playground/','artwork-and-games'],['/racing/','paper-racing'],['/racing/deep-link','paper-racing'],['/racing/models/laguna-seca.glb','race-model'],['/playground/deep-link','artwork-and-games'],
    ['/account/assets/font.woff2','font-bytes'],['/media/artwork.webp','artwork-bytes'],
  ]){
    const response=await worker.fetch(new Request(origin+pathname),env,{});
    assert.equal(response.status,200,pathname);
    assert.equal(await response.text(),expected,pathname);
  }
});

test('playground canonical redirect preserves the query and missing assets remain 404',async()=>{
  const response=await worker.fetch(new Request(origin+'/playground?view=games'),env,{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),origin+'/playground/?view=games');
  assert.equal((await worker.fetch(new Request(origin+'/account/assets/missing.js'),env,{})).status,404);
});

test('login and logout return to the new entrypoint using platform authentication',()=>{
  const signIn=new URL(chatGPTSignInPath(),origin);
  assert.equal(signIn.pathname,'/signin-with-chatgpt');
  assert.equal(signIn.searchParams.get('return_to'),'/?auth=changed');
  const signOut=new URL(chatGPTSignOutPath(),origin);
  assert.equal(signOut.pathname,'/signout-with-chatgpt');
  assert.equal(signOut.searchParams.get('return_to'),'/?auth=changed#login');
});


test('racing entry canonicalizes without losing the track and keeps missing assets 404',async()=>{
  const response=await worker.fetch(new Request(origin+'/racing?track=apexCircuit'),env,{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),origin+'/racing/?track=apexCircuit');
  assert.equal((await worker.fetch(new Request(origin+'/racing/assets/missing.js'),env,{})).status,404);
});

test('deduplicated gallery photos retain both URLs and unique manifests stay independent',async()=>{
 for(const [pathname,expected] of [
  ['/infinite-gallery/wechat-0051/photo.jpg?cache=1','reward-photo'],
  ['/infinite-gallery/wechat-0327/photo.jpg','second-reward-photo'],
  ['/media/gallery-rewards/wechat-0051/photo.jpg','reward-photo'],
  ['/infinite-gallery/wechat-0327/manifest.json','gallery-specific-manifest'],
 ]){
  const response=await worker.fetch(new Request(origin+pathname),env,{});
  assert.equal(response.status,200,pathname);
  assert.equal(await response.text(),expected,pathname);
 }
 assert.equal((await worker.fetch(new Request(origin+'/infinite-gallery/wechat-0051/missing.jpg'),env,{})).status,404);
});

test('lossless gallery images keep every original URL and original-image-library alias',async()=>{
 assert.ok(Object.keys(imageAliases).length>0);
 for(const [original,alias] of Object.entries(imageAliases)){
  for(const pathname of [original,original.replace('/media/wechat-cards-20260827/','/original-image-library/')]){
   const response=await worker.fetch(new Request(origin+pathname+'?revision=1'),env,{});
   assert.equal(response.status,200,pathname);
   assert.equal(await response.text(),'lossless-'+alias.sha256,pathname);
  }
 }
});
