# Database migrations

Apply migrations in filename order to a Supabase Postgres database. Ticket 03
introduces the first persistent state: Characters, private GitHub identity
mappings, Consent records, owner-only RLS, and an atomic binding function.
Ticket 06 adds private one-time Device Codes, revocable Collector devices,
server-fixed initial UTC-hour boundaries, a five-active-device transaction
limit, short-lived pending activation, and 90-day inactivity expiry.

The Web server requires `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the backend-only
`SUPABASE_SECRET_KEY`. Never expose the secret key to browser code.
Device binding also requires a private
`TETRAFORCE_DEVICE_SECRET_PEPPER` containing at least 32 characters. Only
domain-separated HMAC digests are persisted.
