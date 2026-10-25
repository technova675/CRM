// Temporary browser workspace isolation until the app has account authentication.
const COOKIE = "adbibe-report-workspace";
export function reportWorkspace(req: Request): string | null {
  const value = req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function workspaceCookie(token: string, req: Request) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/reports; Max-Age=31536000${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
