# Database migrations

Apply migrations in filename order to a Supabase Postgres database. Ticket 03
introduces the first persistent state: Characters, private GitHub identity
mappings, Consent records, owner-only RLS, and an atomic binding function.

The Web server requires `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the backend-only
`SUPABASE_SECRET_KEY`. Never expose the secret key to browser code.
