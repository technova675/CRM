import {createHmac,timingSafeEqual} from "node:crypto";
import {approvalContent} from "./outreach.ts";
import type {Channel,Lead,OutreachRecipient} from "../types.ts";
export function approvalSignature(secret:string,owner:string,campaign:string,lead:Lead,recipient:OutreachRecipient,channel:Channel){return createHmac("sha256",secret).update(approvalContent(owner,campaign,lead,recipient,channel)).digest("hex");}
export function matchesSecret(expected:string,actual:string){return /^[a-f0-9]{64}$/i.test(actual)&&timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(actual,"hex"));}
