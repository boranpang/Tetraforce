# Tetraforce

Offer Tokens. Shape Your Fate.

Tetraforce is a public character-growth game for Vibe Coding players. Players
offer eligible Claude Code and Codex Token usage to the Goddess, shape four
attributes, and compete in permanent global rankings.

## MVP status

The project is currently in planning. The approved MVP specification and local
implementation tickets are kept in the private, Git-ignored `.scratch/`
workspace.

## Planned stack

- Next.js full-stack web application on Vercel
- Supabase Postgres and GitHub OAuth
- TypeScript npm Collector for macOS and Linux, supporting Node.js 22+
- Shared API contracts and Supabase migrations in a public monorepo

Architecture decisions live in `docs/adr/`. Project terminology lives in
`CONTEXT.md`.

## Local development

Use Node.js 24 and npm 11. Copy `apps/web/.env.example` to
`apps/web/.env.local`, then provide private guest-state configuration before
starting the web app.

```sh
npm install
npm run dev
```

Run `npm run typecheck`, `npm test`, and `npm run test:e2e` for the Ticket 01
verification suite.

## Collector preview

On macOS or Linux with Node.js 22+, preview the privacy-minimized Claude Code
and Codex Usage Summaries before any upload:

```sh
npx tetraforce show-data
```

The command scans both supported Agents, includes only the current UTC hour and
previous 23 hours, and prints the complete pending JSON. Native Windows is not
supported, and there is no manual Token entry or log-file upload fallback.

Signed-in players can create a one-time Device Code in the Temple. The Web UI
provides the service-specific `TETRAFORCE_API_URL=... npx tetraforce init`
command. `init` previews the exact pending structure before confirmation, then
stores a device-only credential with owner-only filesystem permissions. Usage
Summary upload and scheduled sync remain separate later tickets.

## License

Tetraforce is licensed under the MIT License.
