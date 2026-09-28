import type { TeamMember } from "../types";

// Specialist roles added for the agency OS; merged with the core sales/AM/finance team.
export const EXTRA_TEAM: TeamMember[] = [
  { id: "u_cs1", name: "Ishaan Verma", email: "ishaan@adbibe.com", role: "creative_strategist", avatarColor: "#8b5cf6" },
  { id: "u_ve1", name: "Sana Qureshi", email: "sana@adbibe.com", role: "video_editor", avatarColor: "#ef4444" },
  { id: "u_des1", name: "Tanvi Desai", email: "tanvi@adbibe.com", role: "designer", avatarColor: "#06b6d4" },
  { id: "u_seo1", name: "Arnav Pillai", email: "arnav@adbibe.com", role: "seo", avatarColor: "#84cc16" },
  { id: "u_smm1", name: "Maya Fernandes", email: "maya@adbibe.com", role: "social_media", avatarColor: "#f43f5e" },
  { id: "u_inf1", name: "Dhruv Malhotra", email: "dhruv@adbibe.com", role: "influencer_manager", avatarColor: "#a855f7" },
  { id: "u_ai1", name: "Zoya Khan", email: "zoya@adbibe.com", role: "ai_automation", avatarColor: "#0891b2" },
];

const META: Record<string, Pick<TeamMember, "title" | "capacityHours" | "monthlyCost" | "freelancer">> = {
  u_admin: { title: "Founder & CEO", capacityHours: 30, monthlyCost: 0 },
  u_sales1: { title: "Senior BD Manager", capacityHours: 40, monthlyCost: 110000 },
  u_sales2: { title: "BD Executive", capacityHours: 40, monthlyCost: 70000 },
  u_am1: { title: "Account Director", capacityHours: 40, monthlyCost: 140000 },
  u_mkt1: { title: "Performance Lead", capacityHours: 40, monthlyCost: 130000 },
  u_mkt2: { title: "Performance Marketer", capacityHours: 40, monthlyCost: 85000 },
  u_fin: { title: "Finance Manager", capacityHours: 40, monthlyCost: 90000 },
  u_cs1: { title: "Creative Strategist", capacityHours: 40, monthlyCost: 100000 },
  u_ve1: { title: "Video Editor", capacityHours: 40, monthlyCost: 60000, freelancer: true },
  u_des1: { title: "Senior Designer", capacityHours: 40, monthlyCost: 80000 },
  u_seo1: { title: "SEO Specialist", capacityHours: 40, monthlyCost: 75000 },
  u_smm1: { title: "Social Media Manager", capacityHours: 40, monthlyCost: 70000 },
  u_inf1: { title: "Influencer Manager", capacityHours: 40, monthlyCost: 70000 },
  u_ai1: { title: "AI & Automation Engineer", capacityHours: 40, monthlyCost: 150000 },
};

export const withTeamMeta = (team: TeamMember[]): TeamMember[] => team.map((m) => ({ status: "active", ...META[m.id], ...m }));
