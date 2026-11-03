import type {Proposal,ProposalStatus} from "../types.ts";
export const PROPOSAL_TRANSITIONS:Record<ProposalStatus,ProposalStatus[]>={Draft:["Internal Review"],"Internal Review":["Draft","Sent"],Sent:["Viewed","Accepted","Rejected"],Viewed:["Accepted","Rejected"],Accepted:[],Rejected:["Draft"]};
export function canTransitionProposal(proposal:Proposal,next:ProposalStatus){return PROPOSAL_TRANSITIONS[proposal.status].includes(next)&&(next!=="Sent"||proposal.approval==="Approved");}
export function proposalValue(p:Pick<Proposal,"lines"|"durationMonths">){return p.lines.reduce((total,line)=>total+line.price*(line.billing==="monthly"?(p.durationMonths??12):1),0);}
export function validProposalContent(p:Pick<Proposal,"title"|"lines"|"expiresAt">){return !!p.title.trim()&&p.lines.length>0&&p.lines.every(line=>line.description.trim()&&Number.isFinite(line.price)&&line.price>=0)&&Number.isFinite(Date.parse(p.expiresAt));}
