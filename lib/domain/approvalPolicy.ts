import { AI_ACTIONS, type AIActionKind, type ApprovalMode } from "../types";

export type ApprovalPolicy = {modes:Record<AIActionKind,ApprovalMode>;allowAutonomousSpendChanges:boolean};
export const recommendedModes = Object.fromEntries(AI_ACTIONS.map(action=>[action,
  action==="Task creation"?"Automatic":"Approval Required",
])) as ApprovalPolicy["modes"];

export function approvalPolicy(value?:Partial<ApprovalPolicy>):ApprovalPolicy {
  return {modes:{...recommendedModes,...value?.modes},allowAutonomousSpendChanges:value?.allowAutonomousSpendChanges===true};
}

export function effectiveApprovalMode(value:ApprovalPolicy|undefined,action:AIActionKind):ApprovalMode {
  const policy=approvalPolicy(value);
  const mode=policy.modes[action];
  return action==="Campaign changes"&&mode==="Automatic"&&!policy.allowAutonomousSpendChanges?"Approval Required":mode;
}
