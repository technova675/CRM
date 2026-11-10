import assert from "node:assert/strict";
import test from "node:test";
import { reportFacts, reportWindow, nextClientReportDue, scheduledPeriod } from "../lib/domain/clientReporting.ts";

test("periods align with calendar weeks and months, and short months do not change the recurring day",()=>{
  assert.deepEqual(reportWindow("2026-11-10","Weekly"),{start:"2026-11-09",end:"2026-11-15",previousStart:"2026-11-02",previousEnd:"2026-11-08"});
  assert.deepEqual(reportWindow("2024-02-15","Monthly"),{start:"2024-02-01",end:"2024-02-29",previousStart:"2024-01-01",previousEnd:"2024-01-31"});
  const anchor="2026-01-31T03:30:00.000Z";
  const feb=nextClientReportDue(anchor,anchor,"Monthly");
  assert.equal(feb,"2026-02-28T03:30:00.000Z");
  assert.equal(nextClientReportDue(feb,anchor,"Monthly"),"2026-03-31T03:30:00.000Z");
  assert.equal(scheduledPeriod("2026-11-08T19:00:00.000Z","Weekly"),"2026-11-08");
});

test("a report uses a scoped feed, keeps missing metrics unknown and does not add reach",()=>{
  const rows=[{date:"2026-11-08",spend:100,conversions:2,campaign:"A",creative:"Video",reach:40},{date:"2026-11-07",spend:300,conversions:2,campaign:"A",creative:"Video",reach:90}];
  const library={clients:[{id:"a",company:"Synthetic"},{id:"b",company:"Other"}],campaigns:[],ads:[],creatives:[],leads:[],deals:[],seoProjects:[],
    analyticsFeeds:[{id:"feed",clientId:"a",platform:"Meta Ads",currency:"USD",report:"Test",account:"Synthetic",method:"CSV import",rows}]};
  const input={source:"feed",clientId:"a",date:"2026-11-08",frequency:"Weekly",recipients:[]};
  const facts=reportFacts(library,input);
  assert.equal(facts.stats.find(s=>s.key==="cpa").current,100);
  assert.equal(facts.stats.find(s=>s.key==="reach").current,null);
  assert.equal(facts.stats.find(s=>s.key==="leads").current,null);
  assert.equal(facts.stats.find(s=>s.key==="spend").delta,null);
  assert.equal(facts.creatives[0].name,"Video");
  assert.equal(reportFacts(library,{...input,clientId:"b"}),null);
});
