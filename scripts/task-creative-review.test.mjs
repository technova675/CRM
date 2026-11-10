import assert from "node:assert/strict";
import test from "node:test";
import {nextTaskOccurrence,taskDependencyIssue,taskChanges} from "../lib/domain/projectTasks.ts";
import {addReviewRevision,reviewResponse} from "../lib/domain/creativeReviews.ts";

test("transitive cycles, deleted prerequisites and premature completion are rejected",()=>{
  const a={id:"a",title:"A",status:"Todo",dependsOn:["c"]},b={id:"b",status:"Todo",dependsOn:["a"]},c={id:"c",status:"Todo",dependsOn:["b"]};
  assert.match(taskDependencyIssue(a,new Map([["a",a],["b",b],["c",c]])),/cycle/);
  const next={...a,dependsOn:["b"]};
  assert.match(taskDependencyIssue({...next,status:"Done"},new Map([["b",{...b,dependsOn:[]}]])),/prerequisite/);
  assert.match(taskChanges([next],[next,b]),/no longer exists/);
});

test("monthly repeats keep the calendar day and clear past discussion",()=>{
  const a={id:"a",status:"Done",dueDate:"2026-01-31T12:30:00Z",recurring:"monthly",comments:[{id:"c"}]};
  const b=nextTaskOccurrence(a,"2026-01-31T12:00:00Z"),c=nextTaskOccurrence(b,"2026-02-28T12:00:00Z");
  assert.equal(b.dueDate,"2026-02-28T12:30:00.000Z");
  assert.equal(c.dueDate,"2026-03-31T12:30:00.000Z");
  assert.equal(b.status,"Todo");
  assert.equal(b.comments.length,0);
  assert.equal(nextTaskOccurrence(a,"2026-02-01T00:00:00Z").id,b.id);
});

test("only the scoped reviewer may decide on the latest version",()=>{
  const first={version:1,title:"First",url:"",copy:"Old copy",comments:[]};
  const review={id:"r",clientId:"a",audience:"Client",revisions:[first]};
  const db={clients:[{id:"a"}],creativeReviews:[review]};
  assert.throws(()=>reviewResponse(db,"r",1,"Client","", "Approved","b"),/not found/);
  assert.throws(()=>reviewResponse(db,"r",1,"Team","", "Approved"),/requested reviewer/);
  reviewResponse(db,"r",1,"Client","Change copy", "Changes requested","a");
  addReviewRevision(review,{title:"Second",url:"",copy:"New copy"},1);
  assert.throws(()=>reviewResponse(db,"r",1,"Client","", "Approved","a"),/newer version/);
  reviewResponse(db,"r",2,"Client","", "Approved","a");
  assert.equal(first.decision.status,"Changes requested");
  assert.equal(review.revisions[1].decision.status,"Approved");
});
