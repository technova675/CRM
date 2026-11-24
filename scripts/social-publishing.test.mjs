import test from 'node:test';
import assert from 'node:assert/strict';
import {networksFor,postIssues,calendarRows,plannedTime,postTypeOf,formatFor} from '../lib/domain/socialPublishing.ts';

test('which networks take which post type',()=>{
  assert.deepEqual(networksFor('Text only'),['Facebook','LinkedIn','X','Threads','Reddit']);
  assert.deepEqual(networksFor('Image only'),['Instagram','Facebook','LinkedIn','X','Threads','Reddit']);
  assert.deepEqual(networksFor('Text + video'),['Instagram','Facebook','LinkedIn','X','Threads','YouTube']);
  assert.ok(!networksFor('Video only').includes('Reddit'));
});

const base={title:'Winter routine',caption:'Five steps for dry skin.',hashtags:['#skincare'],mediaUrls:['https://cdn.example.com/a.jpg'],format:'Static'};
test('post checks: media, length, title, subreddit',()=>{
  assert.deepEqual(postIssues({...base,platform:'Instagram',postType:'Text + images'}),[]);
  assert.match(postIssues({...base,platform:'Instagram',postType:'Text only',mediaUrls:[]})[0],/photo or video/);
  assert.match(postIssues({...base,platform:'X',postType:'Text only',mediaUrls:[],caption:'a'.repeat(300)}).join(' '),/280 characters/);
  assert.match(postIssues({...base,platform:'X',postType:'Text + images',mediaUrls:Array(5).fill('https://c.in/x.png')}).join(' '),/up to 4 images/);
  assert.match(postIssues({...base,platform:'YouTube',postType:'Text + video',mediaUrls:['https://c.in/v.mp4'],title:''}).join(' '),/needs a title/);
  assert.match(postIssues({...base,platform:'Reddit',postType:'Text only',mediaUrls:[]}).join(' '),/subreddit/);
  assert.deepEqual(postIssues({...base,platform:'Reddit',postType:'Text only',mediaUrls:[],subreddit:'IndiaInvestments'}),[]);
  assert.match(postIssues({...base,platform:'Facebook',postType:'Text + video',mediaUrls:['https://c.in/a.jpg']}).join(' '),/video file/);
});

test('older posts get a post type from their format and media',()=>{
  assert.equal(postTypeOf({format:'Reel',caption:'hi',mediaUrls:[]}),'Text + video');
  assert.equal(postTypeOf({format:'Text',caption:'hi',mediaUrls:[]}),'Text only');
  assert.equal(postTypeOf({format:'Carousel',caption:'',mediaUrls:['https://x.in/a.png']}),'Image only');
  assert.equal(formatFor('Text + video','YouTube'),'Short');
});

test('dates read as India time; impossible dates rejected',()=>{
  assert.equal(plannedTime('2026-12-05','18:30'),'2026-12-05T13:00:00.000Z');
  assert.equal(plannedTime('05/12/2026','6:30 pm'),'2026-12-05T13:00:00.000Z');
  assert.equal(plannedTime('2026-12-05',''),'2026-12-05T04:30:00.000Z');
  assert.equal(plannedTime('31/02/2026','10:00'),null);
  assert.equal(plannedTime('2026-12-05','25:00'),null);
});

test('calendar: one row to several networks, each checked on its own; bad rows reported',()=>{
  const rows=[['Date','Time','Networks','Post type','Title','Text','Hashtags','Media','Subreddit'],
    ['2026-12-02','18:30','Instagram, LinkedIn, YouTube','Text + images','Winter routine','Five steps','#skin','https://c.in/1.jpg | https://c.in/2.jpg',''],
    ['2026-12-03','','Twitter','Text only','','Short update','','',''],
    ['2026-12-04','','Instagram','Poem','','x','','',''],
    ['soon','','X','Text only','','x','','',''],
    ['','','Reddit','Text only','AMA','Ask us','','','r/IndianSkincareAddicts']];
  const {posts,errors}=calendarRows(rows);
  assert.deepEqual(posts.map(p=>p.platform),['Instagram','LinkedIn','YouTube','X','Reddit']);
  assert.deepEqual(posts[0].mediaUrls,['https://c.in/1.jpg','https://c.in/2.jpg']);
  assert.deepEqual(posts[0].issues,[]);
  assert.match(posts[2].issues[0],/YouTube only accepts video/);
  assert.equal(posts[3].title,'Short update');
  assert.equal(posts[4].subreddit,'IndianSkincareAddicts');assert.equal(posts[4].plannedAt,undefined);assert.deepEqual(posts[4].issues,[]);
  assert.equal(errors.length,2);assert.match(errors[0],/Row 4: post type "Poem"/);assert.match(errors[1],/Row 5: date/);
  assert.match(calendarRows([['Title'],['x']]).errors.join(' '),/Networks column/);
});
