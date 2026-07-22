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
verification suite. The Collector package remains compatible with Node.js 22+.

## License

Tetraforce is licensed under the MIT License.
