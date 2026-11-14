import test from "node:test";
import assert from "node:assert/strict";
import {rebaseResearchSave} from "../lib/domain/rebaseResearchSave.ts";

const lead={id:"lead-1",company:"Example",status:"New",notes:"Original",research:{status:"idle"}};
const deal={id:"deal-1",leadId:"lead-1",stage:"New",probability:10,notes:"Original"};
const activity={id:"activity-1",entityId:"lead-1",action:"Created"};
const base={leads:[lead],deals:[deal],activities:[activity],clients:[{id:"client-1",company:"One"}],settings:{name:"Original"}};
const researchActivity={id:"activity-2",entityId:"lead-1",action:"Researched lead"};
const local={...base,leads:[{...lead,status:"Researching",research:{status:"done"},score:{value:70}}],deals:[{...deal,stage:"Researching",probability:15}],activities:[researchActivity,activity]};

test("research changes rebase over an unrelated laptop edit without losing either change",()=>{
 const remote={...base,clients:[{id:"client-1",company:"Updated remotely"}],activities:[{id:"activity-3",entityId:"client-1",action:"Edited client"},activity]};
 const merged=rebaseResearchSave(base,local,remote);
 assert.equal(merged.clients[0].company,"Updated remotely");
 assert.equal(merged.leads[0].research.status,"done");
 assert.equal(merged.deals[0].stage,"Researching");
 assert.deepEqual(merged.activities.map(item=>item.id),["activity-2","activity-3","activity-1"]);
});

test("same lead edits and unrelated local changes require manual conflict review",()=>{
 assert.equal(rebaseResearchSave(base,local,{...base,leads:[{...lead,notes:"Edited remotely"}]}),null);
 assert.equal(rebaseResearchSave(base,{...local,clients:[{id:"client-1",company:"Edited locally"}]},{...base,clients:[{id:"client-1",company:"Edited remotely"}]}),null);
});

test("a concurrently created deal for the same lead is not duplicated",()=>{
 const localWithNewDeal={...local,deals:[...local.deals,{id:"deal-2",leadId:"lead-1",stage:"Researching",probability:15}]};
 assert.equal(rebaseResearchSave(base,localWithNewDeal,{...base,deals:[...base.deals,{id:"deal-3",leadId:"lead-1",stage:"New",probability:10}]}),null);
});
