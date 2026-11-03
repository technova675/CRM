import type { Activity, Conversation, CustomFieldDef, Deal, Lead, Message, SavedView, TeamMember, OutreachCampaign, OutreachTemplate, Sequence, Suppression } from "../types";
import { DEFAULT_SEQUENCE } from "../ai/outreach";
import {DEFAULT_ONBOARDING_TEMPLATES,type OnboardingLibrary} from "./pipeline";
import type {OnboardingTemplate,Meeting} from "../types";

export interface CRMLibrary extends OnboardingLibrary {
  marketingAutomations:import("./marketingAutomation").MarketingWorkflow[];
  concepts:import("../types").CreativeConcept[];
  leads: Lead[]; deals: Deal[]; conversations: Conversation[]; messages: Message[];
  activities: Activity[]; team: TeamMember[]; savedViews: SavedView[]; customFields: CustomFieldDef[];
  outreach: OutreachCampaign[]; sequences: Sequence[]; suppressions: Suppression[]; outreachTemplates: OutreachTemplate[];
  onboardingTemplates:OnboardingTemplate[];meetings:Meeting[];
  strategies:import("../types").StrategyDoc[];proposalPriceBook:import("../ai/proposal").PriceBookEntry[];
  campaigns:import("../types").Campaign[];invoices:import("../types").Invoice[];ads:import("../types").AdRow[];creatives:import("../types").Creative[];socialPosts:import("../types").SocialPost[];seoProjects:import("../types").SeoProject[];influencers:import("../types").Influencer[];engagements:import("../types").InfluencerEngagement[];assets:import("../types").Asset[];reports:import("../types").GeneratedReport[];recommendations:import("../types").Recommendation[];reportSchedules:import("../types").ReportSchedule[];
}
export function emptyCRMLibrary(user: { id: string; email: string }): CRMLibrary {
  return { marketingAutomations:[],leads: [], deals: [], conversations: [], messages: [], activities: [], savedViews: [], customFields: [], outreach: [], sequences: [structuredClone(DEFAULT_SEQUENCE)], suppressions: [], outreachTemplates: [],clients:[],tasks:[],projects:[],knowledge:[],approvals:[],proposals:[],meetings:[],onboardingTemplates:structuredClone(DEFAULT_ONBOARDING_TEMPLATES),
    concepts:[],campaigns:[],invoices:[],ads:[],creatives:[],socialPosts:[],seoProjects:[],influencers:[],engagements:[],assets:[],reports:[],recommendations:[],reportSchedules:[],strategies:[],proposalPriceBook:[],team: [{ id: user.id, name: user.email.split("@")[0], email: user.email, role: "admin", avatarColor: "#6846d6", status: "active" }] };
}
