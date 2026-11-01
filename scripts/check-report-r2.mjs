import { randomUUID } from "node:crypto";
import { writeR2Part,readR2Part,removeR2Prefix } from "../lib/reportR2.ts";

// Tiny private write/read/delete probe; never logs credentials or stored report data.
const session=randomUUID(); const bytes=Buffer.from("report-storage-connectivity-check");
try {
  const object=await writeR2Part(session,"original",-1,0,bytes);
  const result=await readR2Part(object.key,object.sha256);
  if(!result.equals(bytes)) throw new Error("Stored bytes did not match");
  console.log("R2 write/read and SHA-256 verification passed.");
} catch(error) { console.error(error.message); process.exitCode=1; }
finally {
  try { await removeR2Prefix(`reports/${session}/`); console.log("R2 test object cleanup passed."); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}
