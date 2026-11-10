# AI client reporting

Open **Reports → AI Client Reporting**. Select a CRM client and one measured Analytics Engine feed. For a weekly draft, select any date in the completed Monday–Sunday week. For a monthly draft, select any date in the completed calendar month. Leaving the date blank uses the last completed period in India time. Imported reports can be prepared under **Analytics & Insights → Data sources**.

The dashboard and PDF, PowerPoint and Excel exports use the same saved snapshot. Currency, row coverage and missing values appear with the data. Sessions and clicks are separate measures. A reach figure comes only from a single reported row because daily and segment reach can overlap. Goals come from linked Performance campaigns. Creative and campaign sections depend on the selected feed's dimensions. Changes require complete measured coverage in both periods. The Excel metrics and breakdown sheets retain numeric cells.

The AI provider receives calculated aggregates with metric IDs. Names, contacts, individual rows and URLs remain in the application. If AI generation is unavailable, the app saves a measured draft. Review its contents and recipient list before approving. Only saved client contacts can receive a report. The email includes a PDF, while the dashboard, PowerPoint and Excel remain available as separate exports.

## Scheduled delivery

Set the first delivery time in IST and choose weekly or monthly recurrence. The worker can prepare the prior completed period before the delivery time. Use **Check for due drafts** to generate an eligible draft manually. Each draft needs its own approval. Pausing the schedule prevents sending pending scheduled reports until resumed. A scheduled report approved after its delivery time can be sent on the next tick. When measured data is missing, the schedule shows the error and can retry after a delay.

Continuous generation and dispatch use the existing automation worker, which must be configured and running. See [Marketing automation](marketing-automation.md). To send PDFs, configure **CLIENT_REPORT_DELIVERY_URL** and **CLIENT_REPORT_DELIVERY_TOKEN** for a trusted HTTPS email adapter with attachment support. The adapter receives the owner ID, report ID, email fields, approval reference and an attachment array with filename, content type and base64 bytes. It must honor the idempotency key and return `{"accepted":true,"messageId":"..."}` only after accepting the email with the attachment. Acceptance does not establish inbox delivery. An ambiguous attempt is locked against automatic retries.
