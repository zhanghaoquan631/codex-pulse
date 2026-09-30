import test from 'node:test';
import assert from 'node:assert/strict';
import {extract} from '../worker/preview.js';

test('Douyin router data retains only the linked video cover and complete original caption',()=>{
  const caption='完整原文\n'.repeat(300)+'END';
  const data={recommendations:[{aweme_id:'999',desc:'Unrelated',video:{cover:{url_list:['https://img.example.com/wrong.jpg']}}}],
    detail:{aweme_id:'12345',desc:caption,video:{origin_cover:{url_list:['/actual-cover.webp']}}}};
  const html='<script>window._ROUTER_DATA = '+JSON.stringify(data)+';</script>';
  for(const url of ['https://www.douyin.com/video/12345','https://www.douyin.com/share/video/12345','https://www.douyin.com/?modal_id=12345']){
    const result=extract(html,url);
    assert.equal(result.coverUrl,'https://www.douyin.com/actual-cover.webp');
    assert.equal(result.description,caption);
    assert.equal(result.coverKind,'video_cover');
    assert.equal(result.metadataSource,'douyin_video_cover');
  }
  assert.equal(extract(html,'https://www.douyin.com/video/67890').coverUrl,'');
  assert.equal(extract(html,'https://x.com/example/status/12345').coverUrl,'');
});

test('Douyin parser supports data script types with charset and never evaluates JavaScript',()=>{
  const item={id:'12345',desc:'Original',video:{cover:{urlList:['https://img.example.com/cover.jpg']}}};
  const json=JSON.stringify(item),url='https://www.douyin.com/video/12345';
  for(const html of ['<script type="application/json; charset=utf-8">'+json+'</script>',
    '<script id="RENDER_DATA">'+encodeURIComponent(json)+'</script>',
    '<script>_ROUTER_DATA='+json+';</script>']){
    assert.equal(extract(html,url).description,'Original');
  }
  for(const raw of ['window._ROUTER_DATA=JSON.parse('+JSON.stringify(json)+');',
    'window._ROUTER_DATA='+json+'; globalThis.__previewExecuted=true;',
    'window._ROUTER_DATA={get video(){globalThis.__previewExecuted=true;return {};}};']){
    assert.equal(extract('<script>'+raw+'</script>',url).coverUrl,'');
  }
  assert.equal(globalThis.__previewExecuted,undefined);
  const videoAsCover={...item,video:{cover:{urlList:['https://img.example.com/movie.mp4']}}};
  assert.equal(extract('<script type="application/json">'+JSON.stringify(videoAsCover)+'</script>',url).coverUrl,'');
});

test('only matching platform identities and exact linked JSON-LD video types qualify as video covers',()=>{
  const url='https://www.douyin.com/video/12345';
  const xMeta='<meta property="og:url" content="https://x.com/example/status/12345"><meta property="og:image" content="https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg">';
  assert.equal(extract(xMeta,url).coverKind,'webpage_image');
  const video={ '@type':'https://schema.org/VideoObject',thumbnailUrl:'/actual.webp',description:'Bound video caption'};
  const page={'@type':'WebPage',url,mainEntity:video};
  const script=value=>'<script type="application/ld+json">'+JSON.stringify(value)+'</script>';
  assert.equal(extract(script(page),url).coverUrl,'https://www.douyin.com/actual.webp');
  assert.equal(extract(script(page),url).description,'Bound video caption');
  assert.equal(extract(script(page),'https://www.douyin.com/video/88888').coverUrl,'');
  assert.equal(extract(script({...video,url,'@type':'NotVideoObject'}),url).coverKind,'unknown');
  assert.equal(extract(script({...video,url,thumbnailUrl:'https://img.example.com/video.mp4'}),url).coverUrl,'');
  const generic='https://example.com/watch?a=1';
  assert.equal(extract(script({...video,url:'https://example.com/watch?a=2'}),generic).coverUrl,'');
  const twitterMeta='<meta name="twitter:description" content="Original caption"><meta name="twitter:image:src" content="/photo.jpg">';
  assert.equal(extract(twitterMeta,url).description,'Original caption');
  assert.equal(extract(twitterMeta,url).coverKind,'webpage_image');
});
