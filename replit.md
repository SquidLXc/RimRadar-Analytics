# NBA Snipes Analytics

An NBA-focused player-prop analytics site with a Render-ready single-service deployment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run build:render` / `pnpm run start:render` — build and run the combined app as one Render Node service
- No NBA or sportsbook provider is connected yet; the app uses clearly labeled demo data.
- Keep future third-party credentials in deployment environment variables, never in source control.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nba-snipes/` — NBA web app
- `artifacts/api-server/src/routes/nba.ts` — NBA API routes
- `artifacts/api-server/src/providers/nba.ts` — replaceable provider, currently illustrative demo data
- `lib/api-spec/openapi.yaml` — source of truth for API types and generated hooks
- `render.yaml` — one-service Render Blueprint
- `README.md` — local and Render deployment notes

## Architecture decisions

- The NBA frontend and `/api` endpoints share one origin on Render; Express serves both the built Vite app and API.
- The initial provider is demo-only. Live stats, injury, schedule, and sportsbook data require a separately selected provider.
- Watchlists and slip-builder state are browser-local; no account or server-side personal data is required yet.

## Product

The app is modeled on the user's separate NHL analytics product, with NBA stat markets and no hockey-specific goalie features. It includes an overview, ranked signals, props, slip builder, matchups, player/team profiles, watchlist, live-alert state, audit trail, and model performance.

## User preferences

- Build this as a separate NBA product; do not modify the NHL reference repository.
- The app must work on Render.

## Gotchas

- Demo schedules, stats, lines, and model values are illustrative—not current or verified data.
- Use generated API hooks from `@workspace/api-client-react` for frontend calls and keep OpenAPI/codegen in sync.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
