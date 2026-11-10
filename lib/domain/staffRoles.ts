import type {Role} from "../types";

export const STAFF_ROLES=["sales","account_manager","marketing","creative_strategist","video_editor","designer","seo","social_media","influencer_manager","finance","ai_automation"] as const satisfies readonly Role[];
export const isStaffRole=(role:unknown):role is typeof STAFF_ROLES[number]=>STAFF_ROLES.includes(role as typeof STAFF_ROLES[number]);
