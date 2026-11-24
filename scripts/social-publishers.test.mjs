// Run with: node --import ./scripts/test-loader.mjs --test scripts/social-publishers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

let calls=[],routes=[];
const reply=(body,init={})=>new Response(typeof body==='string'?body:JSON.stringify(body),{status:200,headers:{'content-type':'application/json'},...init});
globalThis.fetch=async(input,init={})=>{
  const url=String(input),method=init.method??'GET';
  const body=init.body instanceof URLSearchParams?Object.fromEntries(init.body):typeof init.body==='string'?(()=>{try{return JSON.parse(init.body);}catch{return init.body;}})():init.body instanceof FormData?'form':init.body?'bytes':undefined;
  calls.push({method,url,body,headers:init.headers});
  const hit=routes.find(([m,re])=>m===method&&re.test(url));
  if(!hit)throw new Error(`Unexpected ${method} ${url}`);
  return hit[2](url,init);
};
const on=(...r)=>{routes=r;calls=[];};
const {PUBLISHERS,PublishError,linkedinText}=await import('../lib/social/publishers.ts');
const {presignPut}=await import('../lib/social/media.ts');
const post=(o)=>({id:'p1',clientId:'c1',platform:'Instagram',format:'Static',stage:'Scheduled',pillar:'x',title:'Winter routine',hook:'',caption:'Five steps',hashtags:['#skin'],ownerId:'u',createdAt:'',...o});
const secret={token:'T',accountId:'A'};
const media=(type)=>[ 'GET',/cdn\.example\.com/,()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':type,'content-length':'3'}}) ];

test('Instagram carousel: child containers, carousel container, wait, publish, permalink',async()=>{
  let n=0;on(['POST',/\/A\/media$/,()=>reply({id:`m${++n}`})],['GET',/\/m3\?/,()=>reply({status_code:'FINISHED'})],['POST',/\/A\/media_publish$/,()=>reply({id:'IG1'})],['GET',/\/IG1\?/,()=>reply({permalink:'https://www.instagram.com/p/x/'})]);
  const r=await PUBLISHERS.Instagram(post({postType:'Text + images',mediaUrls:['https://cdn.example.com/1.jpg','https://cdn.example.com/2.jpg']}),secret);
  assert.deepEqual(r,{id:'IG1',url:'https://www.instagram.com/p/x/'});
  assert.equal(calls[0].body.is_carousel_item,'true');assert.equal(calls[2].body.media_type,'CAROUSEL');assert.equal(calls[2].body.children,'m1,m2');
  assert.equal(calls[2].body.caption,'Five steps\n\n#skin');assert.equal(calls[4].body.creation_id,'m3');
});

test('Facebook text post goes to the Page feed; Threads text waits for the container then publishes',async()=>{
  on(['POST',/\/A\/feed$/,()=>reply({id:'A_9'})]);
  assert.deepEqual(await PUBLISHERS.Facebook(post({platform:'Facebook',postType:'Text only',mediaUrls:[]}),secret),{id:'A_9',url:'https://www.facebook.com/A_9'});
  assert.equal(calls[0].body.message,'Five steps\n\n#skin');
  on(['POST',/threads\.net\/v1\.0\/A\/threads$/,()=>reply({id:'c1'})],['GET',/\/c1\?/,()=>reply({status:'FINISHED'})],['POST',/threads_publish$/,()=>reply({id:'TH1'})],['GET',/\/TH1\?/,()=>reply({permalink:'https://www.threads.com/@a/post/1'})]);
  const r=await PUBLISHERS.Threads(post({platform:'Threads',postType:'Text only',mediaUrls:[]}),secret);
  assert.equal(r.url,'https://www.threads.com/@a/post/1');assert.equal(calls[0].body.media_type,'TEXT');
});

test('LinkedIn image: register upload, send bytes, create the post with escaped text',async()=>{
  on(media('image/png'),['POST',/rest\/images\?action=initializeUpload/,()=>reply({value:{uploadUrl:'https://upload.linkedin.test/u',image:'urn:li:image:1'}})],['PUT',/upload\.linkedin\.test/,()=>new Response(null,{status:201})],
    ['POST',/rest\/posts$/,()=>new Response(null,{status:201,headers:{'x-restli-id':'urn:li:share:7'}})]);
  const r=await PUBLISHERS.LinkedIn(post({platform:'LinkedIn',postType:'Text + images',caption:'Save 20% (today) #deal',hashtags:[],mediaUrls:['https://cdn.example.com/a.png']}),{token:'T',accountId:'urn:li:person:9'});
  assert.deepEqual(r,{id:'urn:li:share:7',url:'https://www.linkedin.com/feed/update/urn:li:share:7'});
  const created=calls.find(c=>/rest\/posts/.test(c.url));
  assert.equal(created.body.author,'urn:li:person:9');assert.deepEqual(created.body.content,{media:{id:'urn:li:image:1'}});
  assert.equal(created.body.commentary,'Save 20% \\(today\\) \\#deal');assert.equal(created.headers['LinkedIn-Version'],process.env.LINKEDIN_VERSION||'202510');
  assert.equal(linkedinText('a_b*c'),'a\\_b\\*c');
});

test('X: uploads the image, then posts with its media id',async()=>{
  on(media('image/jpeg'),['POST',/api\.x\.com\/2\/media\/upload$/,()=>reply({data:{id:'M1'}})],['POST',/api\.x\.com\/2\/tweets$/,()=>reply({data:{id:'99'}})]);
  const r=await PUBLISHERS.X(post({platform:'X',postType:'Text + images',mediaUrls:['https://cdn.example.com/a.jpg']}),secret);
  assert.deepEqual(r,{id:'99',url:'https://x.com/i/web/status/99'});assert.deepEqual(calls.at(-1).body,{text:'Five steps\n\n#skin',media:{media_ids:['M1']}});
});

test('Reddit: text post to the subreddit; Reddit rule errors come back in plain words',async()=>{
  on(['POST',/oauth\.reddit\.com\/api\/submit$/,()=>reply({json:{errors:[],data:{name:'t3_abc',url:'https://www.reddit.com/r/x/comments/abc/'}}})]);
  const r=await PUBLISHERS.Reddit(post({platform:'Reddit',postType:'Text only',subreddit:'r/IndiaInvestments',mediaUrls:[]}),secret);
  assert.equal(r.id,'t3_abc');assert.equal(calls[0].body.sr,'IndiaInvestments');assert.equal(calls[0].body.kind,'self');
  on(['POST',/api\/submit$/,()=>reply({json:{errors:[['SUBREDIT_NOTALLOWED','you are not allowed to post there','sr']]}})]);
  await assert.rejects(PUBLISHERS.Reddit(post({platform:'Reddit',postType:'Text only',subreddit:'x',mediaUrls:[]}),secret),/not allowed to post there/);
});

test('YouTube: resumable upload session, then the video bytes',async()=>{
  on(media('video/mp4'),['POST',/upload\/youtube\/v3\/videos/,()=>new Response('{}',{status:200,headers:{location:'https://upload.youtube.test/session1'}})],['PUT',/session1/,()=>reply({id:'vid1'})]);
  const r=await PUBLISHERS.YouTube(post({platform:'YouTube',postType:'Text + video',mediaUrls:['https://cdn.example.com/v.mp4']}),secret);
  assert.deepEqual(r,{id:'vid1',url:'https://www.youtube.com/watch?v=vid1'});
  assert.equal(calls[1].body.status.privacyStatus,'public');assert.deepEqual(calls[1].body.snippet.tags,['skin']);
});

test('a lost answer on the final call is reported as uncertain, an API refusal as a definite failure',async()=>{
  on(['POST',/\/A\/feed$/,()=>{throw new TypeError('network down');}]);
  await assert.rejects(PUBLISHERS.Facebook(post({platform:'Facebook',postType:'Text only',mediaUrls:[]}),secret),e=>e instanceof PublishError&&e.definite===false);
  on(['POST',/\/A\/feed$/,()=>reply({error:{message:'(#200) Permissions error'}},{status:403})]);
  await assert.rejects(PUBLISHERS.Facebook(post({platform:'Facebook',postType:'Text only',mediaUrls:[]}),secret),e=>e instanceof PublishError&&e.definite&&/Permissions error/.test(e.message));
});

test('R2 upload links sign the exact size and type and expire',()=>{
  const u=new URL(presignPut({account:'a'.repeat(32),accessKey:'AK',secret:'SK',bucket:'media',key:'social/x/c1/f 1.jpg',contentType:'image/jpeg',size:1234,expires:900,now:new Date('2026-11-24T10:00:00Z')}));
  assert.equal(u.host,`${'a'.repeat(32)}.r2.cloudflarestorage.com`);assert.equal(u.pathname,'/media/social/x/c1/f%201.jpg');
  assert.equal(u.searchParams.get('X-Amz-SignedHeaders'),'content-length;content-type;host');assert.equal(u.searchParams.get('X-Amz-Expires'),'900');
  assert.equal(u.searchParams.get('X-Amz-Credential'),'AK/20261124/auto/s3/aws4_request');assert.match(u.searchParams.get('X-Amz-Signature'),/^[0-9a-f]{64}$/);
  const again=presignPut({account:'a'.repeat(32),accessKey:'AK',secret:'SK',bucket:'media',key:'social/x/c1/f 1.jpg',contentType:'image/jpeg',size:1235,expires:900,now:new Date('2026-11-24T10:00:00Z')});
  assert.notEqual(new URL(again).searchParams.get('X-Amz-Signature'),u.searchParams.get('X-Amz-Signature'),'a different size needs a different signature');
});
