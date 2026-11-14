// Branded HTML + plain-text wrapper for the approved onboarding welcome message.
// The body is the staff-approved text; it is escaped, never interpreted as HTML.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface WelcomeEmailInput {
  company: string;
  subject: string;
  body: string;
  senderName: string;
  nextSteps?: string[];
}

export const DEFAULT_NEXT_STEPS = [
  "Complete the short onboarding form with your goals and audience",
  "Share your logo and brand guidelines",
  "Grant access to the platforms we will work on, via official invitations",
];

export function renderWelcomeEmail({ company, subject, body, senderName, nextSteps = DEFAULT_NEXT_STEPS }: WelcomeEmailInput) {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#1f2937">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const steps = nextSteps
    .map(
      (s, i) =>
        `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-weight:600;color:#4f46e5">${i + 1}.</td><td style="padding:6px 0;font-size:14px;line-height:1.55;color:#374151">${esc(s)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#111827;padding:24px 32px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af">Welcome aboard</div><div style="margin-top:6px;font-size:22px;font-weight:600;color:#ffffff">${esc(company)}</div></td></tr>
<tr><td style="padding:32px">${paragraphs}
<div style="margin:24px 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Your first steps</div>
<table role="presentation" cellpadding="0" cellspacing="0">${steps}</table></td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">Sent by ${esc(senderName)}. Just reply to this email if you have any questions. We will never ask for passwords; please use official platform invitations to share access.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${body.trim()}\n\nYour first steps:\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n--\nSent by ${senderName}. Reply to this email with any questions.`;
  return { subject, html, text };
}
