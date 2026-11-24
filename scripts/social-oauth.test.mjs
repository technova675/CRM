// Run with: node --import ./scripts/test-loader.mjs --test scripts/social-oauth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.WORKSPACE_VAULT_KEY='ab'.repeat(32);
Object.assign(process.env,{X_CLIENT_ID:'xid',X_CLIENT_SECRET:'xs',META_APP_ID:'mid',META_APP_SECRET:'ms'});
const {signState,readState,authUrl,providerReady,missingKeys}=await import('../lib/social/oauth.ts');
const {publishIssue}=await import('../lib/social/publish.ts');
const {socialDigest}=await import('../lib/socialServer.ts');

test('sign-in state is bound to the login, the network and this browser',()=>{
  const s=signState({u:'user1',c:'client1',p:'x',n:'nonceA'});
  assert.equal(readState(s,'user1','x','nonceA')?.c,'client1');
  assert.equal(readState(s,'user2','x','nonceA'),null,'another login');
  assert.equal(readState(s,'user1','meta','nonceA'),null,'another network');
  assert.equal(readState(s,'user1','x','nonceB'),null,'another browser');
  assert.equal(readState(s,'user1','x',undefined),null);
  const [body,sig]=s.split('.');const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),c:'victim'})).toString('base64url');
  assert.equal(readState(`${forged}.${sig}`,'user1','x','nonceA'),null,'edited state');
});

test('sign-in links: official hosts, PKCE for X, publishing permissions only',()=>{
  const x=new URL(authUrl('x','https://app.test/cb','st','n1'));
  assert.equal(x.host,'x.com');assert.equal(x.searchParams.get('code_challenge_method'),'S256');assert.match(x.searchParams.get('scope'),/tweet\.write/);
  assert.notEqual(x.searchParams.get('code_challenge'),'n1');
  const m=new URL(authUrl('meta','https://app.test/cb','st','n1'));
  assert.equal(m.host,'www.facebook.com');assert.match(m.searchParams.get('scope'),/instagram_content_publish/);assert.doesNotMatch(m.searchParams.get('scope'),/ads_management|user_friends/);
  assert.equal(providerReady('x'),true);assert.equal(providerReady('linkedin'),false);assert.deepEqual(missingKeys('linkedin'),['LINKEDIN_CLIENT_ID','LINKEDIN_CLIENT_SECRET']);
});

test('nothing is published without approval of the current content, a ready post and a connected account',()=>{
  const p={id:'p1',clientId:'c1',platform:'X',postType:'Text only',format:'Text',stage:'Scheduled',pillar:'x',title:'t',hook:'',caption:'Hello',hashtags:[],mediaUrls:[],ownerId:'u',createdAt:''};
  const d=socialDigest(p),approved={...p,review:{digest:d,at:'',source:'',score:80,notes:[]},humanApproval:{digest:d,at:'',by:'u'}};
  const lib=(over={})=>({socialStudio:{},socialConnections:{'c1|X':{}},...over});
  assert.match(publishIssue(lib(),p),/approval/);
  assert.equal(publishIssue(lib(),approved),null);
  assert.match(publishIssue(lib({socialConnections:{}}),approved),/Connect the client's X account/);
  assert.match(publishIssue(lib(),{...approved,caption:'edited after approval'}),/approval/);
  assert.match(publishIssue(lib(),{...approved,delivery:{key:'k',status:'pending',at:''}}),/being sent/);
  const long={...p,caption:'a'.repeat(400)},ld=socialDigest(long);
  assert.match(publishIssue(lib(),{...long,review:{digest:ld},humanApproval:{digest:ld}}),/280 characters/);
  assert.match(publishIssue(lib({socialStudio:{settings:{c1:{requireClientApproval:true}},threads:{}}}),approved),/client signs off/);
});
