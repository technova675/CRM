"use client";
import {useCRM} from "@/lib/store";
import type {ApprovalMode,Proposal} from "@/lib/types";
import {proposalValue,validProposalContent} from "@/lib/domain/proposal";
export const proposalTotal=(p:Proposal)=>p.lines.reduce((n,l)=>n+l.price,0);
export const proposalMonthly=(p:Proposal)=>p.lines.filter(l=>l.billing==="monthly").reduce((n,l)=>n+l.price,0);
export const proposalOneTime=(p:Proposal)=>p.lines.filter(l=>l.billing==="one-time").reduce((n,l)=>n+l.price,0);
export const proposalContractValue=(p:Pick<Proposal,"lines"|"durationMonths">)=>proposalValue(p);
export function canSendProposal(p:Proposal,mode:ApprovalMode){return ["Automatic","Approval Required","Manual"].includes(mode)&&p.status==="Internal Review"&&p.approval==="Approved"&&validProposalContent(p)&&Date.parse(p.expiresAt)>Date.now();}
export function pendingProposalApproval(id:string){return useCRM.getState().approvals.find(a=>a.status==="pending"&&a.apply?.collection==="proposals"&&a.apply.id===id);}
export function submitForReview(id:string):"approval"|"auto"|"manual"|null{
 const s=useCRM.getState(),p=s.proposals.find(p=>p.id===id);if(!p||p.status!=="Draft"||!validProposalContent(p))return null;
 s.setProposalStatus(id,"Internal Review");s.updateProposal(id,{approval:"Awaiting"});
 if(!pendingProposalApproval(id))s.requestApproval({kind:"Proposals",title:`Approve proposal: ${p.title}`,detail:`${p.company} · pricing, scope, timing and terms require internal review.`,ref:{type:"proposal",id},agent:"sales",apply:{collection:"proposals",id,patch:{approval:"Approved"}}});
 return "approval";
}
export function approveProposalNow(id:string){const s=useCRM.getState();if(s.proposals.find(p=>p.id===id)?.status!=="Internal Review")return;const approval=pendingProposalApproval(id);if(approval)s.resolveApproval(approval.id,true);else s.updateProposal(id,{approval:"Approved"});s.updateProposal(id,{approvedBy:s.currentUserId,approvedAt:new Date().toISOString()});}
export function sendProposal(id:string){const s=useCRM.getState(),p=s.proposals.find(p=>p.id===id);if(!p||!canSendProposal(p,s.modeFor("Proposals")))return false;s.setProposalStatus(id,"Sent");return true;}
export function markProposalViewed(id:string){const s=useCRM.getState();if(s.proposals.find(p=>p.id===id)?.status!=="Sent")return;s.setProposalStatus(id,"Viewed");}
export function acceptProposal(id:string){const s=useCRM.getState();s.setProposalStatus(id,"Accepted");const p=useCRM.getState().proposals.find(p=>p.id===id);return useCRM.getState().deals.find(d=>d.id===p?.dealId)?.clientId;}
