import type { Activity, Conversation, CustomFieldDef, Deal, Lead, Message, SavedView, TeamMember, OutreachCampaign, OutreachTemplate, Sequence, Suppression } from "../types";
import { DEFAULT_SEQUENCE } from "../ai/outreach";

export interface CRMLibrary {
  leads: Lead[]; deals: Deal[]; conversations: Conversation[]; messages: Message[];
  activities: Activity[]; team: TeamMember[]; savedViews: SavedView[]; customFields: CustomFieldDef[];
  outreach: OutreachCampaign[]; sequences: Sequence[]; suppressions: Suppression[]; outreachTemplates: OutreachTemplate[];
}
export function emptyCRMLibrary(user: { id: string; email: string }): CRMLibrary {
  return { leads: [], deals: [], conversations: [], messages: [], activities: [], savedViews: [], customFields: [], outreach: [], sequences: [structuredClone(DEFAULT_SEQUENCE)], suppressions: [], outreachTemplates: [],
    team: [{ id: user.id, name: user.email.split("@")[0], email: user.email, role: "admin", avatarColor: "#6846d6", status: "active" }] };
}
