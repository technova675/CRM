# Client portal

In the agency CRM, open **Clients → a client → Client portal access**. Add the client's contact email before creating a login. The email must be separate from any existing Supabase login. The administrator sees a temporary password once and can provide it to the client securely. The client signs in at **/portal/login** and can change the password from the portal.

In **Shared records**, choose a category and share the specific records the client should see. Campaign performance uses measured dated rows from Performance. Approved AI Client Reporting snapshots are available as PDFs after sharing. For uploaded reports, link the Reports company to exactly one CRM client in the client overview. The portal shows a preview of up to 25 rows and 16 columns per selected table. Staff should check every table before sharing the file. Documents use HTTPS links from the client profile.

Creative decisions apply to the exact version shared with the client. Staff see decisions and feedback in **Client portal access**. Portal messages form a separate conversation from the internal inbox. Pausing a login or removing its saved contact blocks subsequent portal requests, including downloads. Stopping sharing removes the record from the portal.

The portal uses the current Supabase project and CRM library. No database migration is required. Portal accounts are created by the server with a Supabase admin credential, and must have an active membership in the agency account. The portal API returns only explicitly shared client fields and does not load the agency shell in the client browser.
