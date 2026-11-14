// Server-only Brevo transactional email client.
export class BrevoNotConfiguredError extends Error {
  constructor() {
    super("Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the server.");
  }
}
export class BrevoSendError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Brevo rejected the message (HTTP ${status}).`);
    this.status = status;
  }
}

export const brevoConfigured = () => !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

export async function sendBrevoEmail({ to, toName, subject, html, text, tags }: { to: string; toName?: string; subject: string; html: string; text: string; tags?: string[] }): Promise<string> {
  const key = process.env.BREVO_API_KEY,
    email = process.env.BREVO_SENDER_EMAIL;
  if (!key || !email) throw new BrevoNotConfiguredError();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email, name: process.env.BREVO_SENDER_NAME || undefined },
      to: [{ email: to, name: toName || undefined }],
      replyTo: { email: process.env.BREVO_REPLY_TO || email },
      subject,
      htmlContent: html,
      textContent: text,
      tags,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json().catch(() => null)) as { messageId?: string } | null;
  if (!response.ok) throw new BrevoSendError(response.status);
  return result?.messageId ?? "accepted";
}
