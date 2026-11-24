import test from 'node:test';
import assert from 'node:assert/strict';
import {fromGoogle,fromCalendly,fromCalcom,eventWindow,tokenIssue,publicLink} from '../lib/domain/calendar.ts';

test('Google events: timed, all-day, Meet link, attendees without self; cancelled dropped',()=>{
  const ev=fromGoogle([
    {id:'a',summary:'Glowleaf review',status:'confirmed',start:{dateTime:'2026-11-26T10:00:00+05:30'},end:{dateTime:'2026-11-26T10:30:00+05:30'},hangoutLink:'https://meet.google.com/abc-defg-hij',attendees:[{email:'me@agency.in',self:true},{email:'priya@glowleaf.in',displayName:'Priya'}],htmlLink:'https://www.google.com/calendar/event?eid=x'},
    {id:'b',summary:'Diwali',start:{date:'2026-11-08'},end:{date:'2026-11-09'}},
    {id:'c',summary:'Gone',status:'cancelled',start:{dateTime:'2026-11-27T10:00:00Z'}},
    {summary:'No id',start:{dateTime:'2026-11-27T10:00:00Z'}},
  ]);
  assert.equal(ev.length,2);
  assert.equal(ev[0].start,'2026-11-26T04:30:00.000Z');assert.equal(ev[0].joinUrl,'https://meet.google.com/abc-defg-hij');assert.deepEqual(ev[0].attendees,['Priya']);
  assert.equal(ev[1].allDay,true);
});

test('Calendly scheduled events normalise and canceled ones are dropped',()=>{
  const ev=fromCalendly([
    {uri:'https://api.calendly.com/scheduled_events/XYZ',name:'Discovery call',status:'active',start_time:'2026-11-27T05:30:00.000000Z',end_time:'2026-11-27T06:00:00.000000Z',location:{type:'google_conference',join_url:'https://meet.google.com/x'}},
    {uri:'https://api.calendly.com/scheduled_events/OLD',name:'Old',status:'canceled',start_time:'2026-11-27T05:30:00Z'},
  ]);
  assert.equal(ev.length,1);assert.equal(ev[0].id,'calendly:XYZ');assert.equal(ev[0].joinUrl,'https://meet.google.com/x');assert.equal(ev[0].location,'google conference');
});

test('Cal.com bookings: v2 and older field names, cancelled dropped, non-https links ignored',()=>{
  const ev=fromCalcom([
    {uid:'u1',title:'Strategy call',status:'accepted',start:'2026-11-28T09:00:00.000Z',end:'2026-11-28T09:45:00.000Z',meetingUrl:'https://app.cal.com/video/u1',attendees:[{name:'Riya',email:'r@x.in'}]},
    {id:7,title:'Legacy',status:'PENDING',startTime:'2026-11-29T09:00:00.000Z',endTime:'2026-11-29T09:30:00.000Z',location:'http://insecure.example'},
    {uid:'u3',title:'No',status:'cancelled',start:'2026-11-28T09:00:00.000Z'},
  ]);
  assert.equal(ev.length,2);assert.deepEqual(ev[0].attendees,['Riya']);assert.equal(ev[1].status,'tentative');assert.equal(ev[1].joinUrl,'');
});

test('event windows are bounded to about two months and must run forwards',()=>{
  const w=eventWindow('2026-01-01T00:00:00Z','2027-01-01T00:00:00Z');
  assert.equal(Date.parse(w.to)-Date.parse(w.from),62*864e5);
  assert.equal(eventWindow('2026-02-01T00:00:00Z','2026-01-01T00:00:00Z'),null);
  assert.ok(eventWindow(null,null,Date.parse('2026-11-24T00:00:00Z')));
});

test('keys are checked before any network call, and the public link never carries the credential',()=>{
  assert.match(tokenIssue('calcom','sk_live_1234567890123456789'),/cal_live_/);
  assert.equal(tokenIssue('calcom','cal_live_0123456789abcdef0123'),null);
  assert.match(tokenIssue('calendly','short'),/whole key/);
  const pub=publicLink({provider:'google',account:'a@b.in',connectedAt:'t',credential:{nonce:'n',ciphertext:'c',tag:'t',updatedAt:'u'}});
  assert.equal('credential' in pub,false);assert.equal(publicLink(undefined),null);
});
