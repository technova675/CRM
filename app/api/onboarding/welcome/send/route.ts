import { z } from "zod";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { dbError } from "@/lib/db";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { BrevoNotConfiguredError, BrevoSendError, brevoConfigured, sendBrevoEmail } from "@/lib/email/brevo";
import { renderWelcomeEmail } from "@/lib/email/welcomeTemplate";

export const maxDuration = 30;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 320;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const user = await reportIdentity(req);
    const parsed = z.object({ clientId: z.string().min(1).max(150) }).safeParse(await boundedJSON(req));
    if (!parsed.success) return Response.json({ error: "Invalid client." }, { status: 400 });
    if (!brevoConfigured()) return Response.json({ error: "Brevo is not configured on the server. Nothing was sent." }, { status: 503 });
    const library = await ownedLibrary(user.userId);
    const client = library?.clients?.find((c) => c.id === parsed.data.clientId);
    const welcome = client?.onboardingWorkspace?.welcome;
    if (!library || !client || !welcome) return Response.json({ error: "Client onboarding not found." }, { status: 404 });
    if (welcome.status !== "Approved") return Response.json({ error: "Approve the welcome message before sending it." }, { status: 409 });
    const to = welcome.to.trim();
    if (!emailOk(to)) return Response.json({ error: "The recipient must be a valid email address." }, { status: 400 });
    const manager = library.team?.find((t) => t.id === client.accountManagerId);
    const mail = renderWelcomeEmail({
      company: client.company,
      subject: welcome.subject,
      body: welcome.body,
      senderName: manager?.name || process.env.BREVO_SENDER_NAME || "Your account team",
    });
    const contact = client.contacts.find((c) => c.email.trim().toLowerCase() === to.toLowerCase());
    const messageId = await sendBrevoEmail({ to, toName: contact?.name, ...mail, tags: ["onboarding-welcome"] });
    return Response.json({ messageId, to }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    if (error instanceof BrevoNotConfiguredError) return Response.json({ error: error.message }, { status: 503 });
    if (error instanceof BrevoSendError) {
      console.error("[brevo]", error.status);
      return Response.json({ error: `Brevo could not send the email (HTTP ${error.status}). Check the API key and that the sender address is verified in Brevo.` }, { status: 502 });
    }
    return dbError(error);
  }
}
