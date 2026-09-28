"use client";

import { useCRM } from "@/lib/store";
import type { Client, SeoIssue, SeoKeyword, SeoProject } from "@/lib/types";
import { runAudit, type BriefDraft, type ContentBriefX, type KeywordIdea } from "@/lib/ai/seo";
import { DAY, uid } from "@/lib/utils";

// SEO module actions built on the generic store helpers (no store changes needed).
const S = () => useCRM.getState();
const getProject = (id: string) => S().seoProjects.find((p) => p.id === id);
const today = () => new Date().toISOString().slice(0, 10);

export function setIssueStatus(projectId: string, issueId: string, status: SeoIssue["status"]) {
  const p = getProject(projectId);
  const issue = p?.issues.find((i) => i.id === issueId);
  if (!p || !issue || issue.status === status) return;
  S().patch("seoProjects", projectId, { issues: p.issues.map((i) => (i.id === issueId ? { ...i, status } : i)) });
  S().log({ actor: "human", actorId: S().currentUserId, entity: "seo", entityId: projectId, action: "Issue status changed", detail: issue.title, before: issue.status, after: status });
}

export function createIssueTask(project: SeoProject, issue: SeoIssue) {
  const client = S().clients.find((c) => c.id === project.clientId);
  const assignee = S().team.find((t) => t.role === "seo")?.id ?? client?.accountManagerId ?? S().currentUserId;
  S().addTask({
    title: `SEO: ${issue.title} — ${client?.company ?? project.domain}`,
    description: `${issue.severity} · ${issue.category} · ${issue.affectedUrls} URLs on ${project.domain}\n\nFix: ${issue.fix}`,
    assigneeId: assignee,
    priority: issue.severity === "Critical" ? "High" : issue.severity === "Warning" ? "Medium" : "Low",
    dueDate: new Date(Date.now() + (issue.severity === "Critical" ? 3 : 7) * DAY).toISOString(),
    status: "Todo",
    related: { type: "seo", id: project.id },
  });
  S().log({ actor: "human", actorId: S().currentUserId, entity: "seo", entityId: project.id, action: "Created task from SEO issue", detail: issue.title });
}

// An AI-prepared fix that touches the client's website — governed by the "SEO changes" approval mode.
export function applyIssueFix(project: SeoProject, issue: SeoIssue): "task" | "approval" | "done" {
  const mode = S().modeFor("SEO changes");
  if (mode === "Manual") {
    createIssueTask(project, issue);
    return "task";
  }
  const nextIssues = project.issues.map((i) => (i.id === issue.id ? { ...i, status: "Fixed" as const } : i));
  if (mode === "Approval Required") {
    S().requestApproval({
      kind: "SEO changes",
      title: `Apply SEO fix: ${issue.title}`,
      detail: `${project.domain} — ${issue.affectedUrls} URLs. ${issue.fix}`,
      ref: { type: "seo", id: project.id },
      agent: "seo",
      apply: { collection: "seoProjects", id: project.id, patch: { issues: nextIssues } },
    });
    return "approval";
  }
  S().patch("seoProjects", project.id, { issues: nextIssues });
  S().log({ actor: "ai", agent: "seo", entity: "seo", entityId: project.id, action: "Applied SEO fix (automatic mode)", detail: `${issue.title} · ${project.domain}`, before: issue.status, after: "Fixed" });
  return "done";
}

export function runAuditAction(projectId: string) {
  const p = getProject(projectId);
  if (!p) return null;
  const res = runAudit(p);
  const d = today();
  const history = [...p.healthHistory.filter((h) => h.date !== d), { date: d, score: res.score }];
  S().patch("seoProjects", projectId, { healthScore: res.score, healthHistory: history, lastAuditAt: new Date().toISOString() });
  S().log({ actor: "ai", agent: "seo", entity: "seo", entityId: projectId, action: "Re-scored site health", detail: p.domain, before: String(p.healthScore), after: String(res.score) });
  return res;
}

export function toggleTracked(projectId: string, kwId: string) {
  const p = getProject(projectId);
  if (!p) return;
  S().patch("seoProjects", projectId, { keywords: p.keywords.map((k) => (k.id === kwId ? { ...k, tracked: !k.tracked } : k)) });
}

export function trackKeyword(projectId: string, idea: KeywordIdea) {
  const p = getProject(projectId);
  if (!p || p.keywords.some((k) => k.keyword.toLowerCase() === idea.keyword)) return false;
  const kw: SeoKeyword = { id: uid("kw"), keyword: idea.keyword, volume: idea.volume, difficulty: idea.difficulty, intent: idea.intent, position: null, prevPosition: null, tracked: true };
  S().patch("seoProjects", projectId, { keywords: [kw, ...p.keywords] });
  S().log({ actor: "human", actorId: S().currentUserId, entity: "seo", entityId: projectId, action: "Started tracking keyword", detail: `${idea.keyword} (volume/difficulty are estimates)` });
  return true;
}

export function saveBrief(projectId: string, b: BriefDraft) {
  const p = getProject(projectId);
  if (!p) return;
  const brief: ContentBriefX = { id: uid("brief"), keyword: b.keyword, title: b.title, outline: b.outline, wordCount: b.wordCount, questions: b.questions, internalLinks: b.internalLinks, status: "Draft", createdAt: new Date().toISOString() };
  S().patch("seoProjects", projectId, { briefs: [brief, ...p.briefs] });
  S().log({ actor: "ai", agent: "seo", entity: "seo", entityId: projectId, action: "Created content brief", detail: b.title });
}

export function setBriefStatus(projectId: string, briefId: string, status: ContentBriefX["status"]) {
  const p = getProject(projectId);
  const b = p?.briefs.find((x) => x.id === briefId);
  if (!p || !b) return;
  S().patch("seoProjects", projectId, { briefs: p.briefs.map((x) => (x.id === briefId ? { ...x, status } : x)) });
  S().log({ actor: "human", actorId: S().currentUserId, entity: "seo", entityId: projectId, action: "Brief status changed", detail: b.title, before: b.status, after: status });
}

export function deleteBrief(projectId: string, briefId: string) {
  const p = getProject(projectId);
  if (!p) return;
  S().patch("seoProjects", projectId, { briefs: p.briefs.filter((x) => x.id !== briefId) });
}

export function startProject(client: Client) {
  const existing = S().seoProjects.find((p) => p.clientId === client.id);
  if (existing) return existing.id;
  const gsc = S().integrations.find((i) => i.key === "gsc")?.status === "connected";
  const project: SeoProject = {
    id: `seo_${client.id}`,
    clientId: client.id,
    domain: (client.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "") || `${client.company.toLowerCase().replace(/\s+/g, "")}.in`,
    healthScore: 0,
    healthHistory: [],
    issues: [],
    keywords: [],
    backlinks: { total: 0, referringDomains: 0, newLast30: 0, lostLast30: 0, toxic: 0, history: [] },
    competitors: [],
    contentGaps: [],
    briefs: [],
    traffic: [],
    gscConnected: gsc,
    lastAuditAt: "",
  };
  S().upsert("seoProjects", project);
  S().log({ actor: "human", actorId: S().currentUserId, entity: "seo", entityId: project.id, action: "Started SEO project", detail: `${client.company} · ${project.domain}` });
  return project.id;
}
