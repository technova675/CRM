import { supabaseRequest } from "../lib/db.ts";
import { cleanR2Jobs } from "../lib/reportR2Transfers.ts";
try {
  await supabaseRequest("report_transfer_sessions", { method:"DELETE", query:{expires_at:`lt.${new Date().toISOString()}`} });
  const cutoff=new Date(Date.now()-10*60_000).toISOString();
  // Continue until the durable cleanup queue is drained, including account deletions.
  while(true) {
    const jobs=await supabaseRequest("report_r2_cleanup",{query:{select:"prefix",limit:"1",created_at:`lt.${cutoff}`}});
    if(!jobs.length) break;
    await cleanR2Jobs();
  }
  console.log("Expired report transfers and queued R2 objects cleaned up.");
} catch(error) { console.error(error.message); process.exitCode=1; }
