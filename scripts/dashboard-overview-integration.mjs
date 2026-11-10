import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {campaignBrowser} from "./campaignBrowser.mjs";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";

const api=new TestBrowser();
let account,browser;
const responseData=async response=>{
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
};
const request=(path,data,method="POST")=>api.request(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const at=new Date().toISOString();

try{
  account=await createTestAccount();
  await api.signIn(account);
  const initial=await responseData(await api.request("/api/crm/library"));
  const clientId="dashboard-test-client",campaignId="dashboard-test-campaign";
  initial.data.clients=[{id:clientId,company:"Dashboard Studio",industry:"Design",location:"Pune",contacts:[],services:["Meta Ads"],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:at,documents:[]}];
  initial.data.campaigns=[{id:campaignId,clientId,name:"Synthetic performance campaign",service:"Meta Ads",platform:"Meta Ads",objective:"Sales",budget:10000,startDate:day(-45),endDate:day(15),teamIds:[account.id],status:"Active",kpis:[],metrics:[],influencerIds:[],createdAt:at}];
  initial.data.recommendations=[{id:"dashboard-test-insight",agent:"media",clientId,campaignId,title:"Review conversion tracking",category:"Funnel",finding:"Conversion events varied across saved campaign days.",why:"Check the tagging setup.",evidence:[{label:"Campaign source",value:"Meta Ads",source:"Synthetic measured rows"}],recommendation:"Compare the event counts with CRM records.",test:"Run a test conversion.",priority:"High",status:"New",createdAt:at}];
  await responseData(await request("/api/crm/library",{...initial,operationId:crypto.randomUUID()},"PUT"));
  const rows=[
    {date:day(-2),spend:1000,revenue:3500,leads:12,conversions:5},
    {date:day(-3),spend:2000,revenue:6000,leads:20,conversions:8},
    {date:day(-20),spend:4000,revenue:null,leads:30,conversions:16},
  ].map(row=>({impressions:5000,reach:4000,clicks:200,...row}));
  await responseData(await request("/api/media/import",{operationId:crypto.randomUUID(),campaignId,platform:"Meta Ads",rows}));

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
  await browser.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command("Page.navigate",{url:api.base+"/dashboard"});
  await browser.wait('document.body.innerText.includes("Review conversion tracking") && document.body.innerText.includes("Spend by platform")');
  const card=(label)=>'Array.from(document.querySelectorAll("p")).find(p=>p.innerText==='+JSON.stringify(label)+')?.parentElement?.parentElement?.innerText';
  assert.match(await browser.evaluate(card("Ad spend")),/₹7(?:[,.]?000|K|k)/);
  assert.match(await browser.evaluate(card("Ad revenue")),/—/);
  if(process.env.DASHBOARD_TEST_SCREENSHOT){
    const picture=await browser.command("Page.captureScreenshot",{format:"png"});
    await writeFile(process.env.DASHBOARD_TEST_SCREENSHOT,Buffer.from(picture.data,"base64"));
  }
  await browser.fill("Date range","7");
  await browser.wait('('+card("Ad spend")+')?.match(/₹3(?:[,.]?000|K|k)/)');
  assert.match(await browser.evaluate(card("Return on ad spend")),/3\.17/);
  await browser.fill("Chart metric","outcomes");
  await browser.wait('Array.from(document.querySelectorAll("summary")).some(node=>node.innerText==="View chart data")');
  await browser.evaluate('Array.from(document.querySelectorAll("summary")).find(node=>node.innerText==="View chart data").click()');
  await browser.wait('document.querySelector("details[open] table")?.innerText.includes("Ad leads")');
  await browser.evaluate('Array.from(document.querySelectorAll("summary")).find(node=>node.innerText==="View supporting evidence").click()');
  await browser.wait('document.body.innerText.includes("Synthetic measured rows")');
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(node=>node.innerText==="Marketing").click()');
  await browser.wait('document.body.innerText.includes("ROAS by client")');
  assert.match(await browser.evaluate('Array.from(document.querySelectorAll("p")).find(p=>p.innerText==="Total ad spend")?.parentElement?.innerText'),/₹3(?:[,.]?000|K|k)/);
  for(const width of [768,375]){
    await browser.command("Emulation.setDeviceMetricsOverride",{width,height:812,deviceScaleFactor:1,mobile:true});
    await browser.wait("document.documentElement.scrollWidth<=innerWidth");
  }
  console.log("PASS: imported metrics, date and metric selectors, missing-data handling, insight evidence, matching Marketing totals and desktop/tablet/mobile layout.");
}finally{
  try{await browser?.close();}finally{await account?.remove();}
}
