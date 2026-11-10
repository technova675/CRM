import { createHash } from "node:crypto";

export class AuthenticationRequiredError extends Error {
  constructor() { super("Sign in to access your reports."); }
}
export class WorkspaceAccessError extends Error {
  constructor(message = "This session cannot access that workspace.") { super(message); }
}
export class AuthenticationUnavailableError extends Error {
  constructor() { super("Could not verify your session. Check your connection and retry."); }
}
export function accountWorkspace(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new AuthenticationRequiredError();
  return createHash("sha256").update(`adbibe-report-user:${userId.toLowerCase()}`).digest("hex");
}
export { safeReturnPath } from "./redirect.ts";
