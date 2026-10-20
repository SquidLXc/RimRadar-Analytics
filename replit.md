# RimRaider

An NBA research terminal with live ESPN data and a Render-ready single-service deployment.

## Run & Operate

- `PORT=5000 pnpm --filter @workspace/api-server run dev` — API server (ESPN provider)
- `PORT=5173 pnpm --filter @workspace/nba-snipes run dev` — Vite web app (proxies `/api` to port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run build:render` / `pnpm run start:render` — build and run the combined app as one Render Node service
- ESPN's public NBA endpoints supply schedule, scores, teams, rosters, injuries and game lines; no key is needed for those.
- `DUNKAPI_API_KEY` (in `artifacts/api-server/.env` locally, an environment variable in deployment) enables player-prop lines and the Radar Picks model. Keep it out of source control.
- Optional tuning: `DUNKAPI_CACHE_MINUTES` (360), `DUNKAPI_MAX_GAMES` (1), `DUNKAPI_MAX_PLAYERS` (6), `DUNKAPI_MIN_EDGE` (0.025), `DUNKAPI_MAX_PICKS` (12).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (scaffolded, not used by the live feed yet)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nba-snipes/` — NBA web app
- `artifacts/api-server/src/routes/nba.ts` — NBA API routes
- `artifacts/api-server/src/providers/espn.ts` — ESPN adapter (raw provider payloads)
- `artifacts/api-server/src/providers/dunkapi.ts` — DunkAPI client (schedule, props, player logs, injuries) with credit accounting
- `artifacts/api-server/src/providers/picks.ts` — cached Radar Picks model: form projection, de-vig, edge threshold, rationale
- `artifacts/api-server/src/providers/nba.ts` — cached provider layer, status and feeds
- `lib/api-spec/openapi.yaml` — source of truth for API types and generated hooks
- `render.yaml` — one-service Render Blueprint
- `README.md` — local and Render deployment notes

## Architecture decisions

- The NBA frontend and `/api` endpoints share one origin on Render; Express serves both the built Vite app and API.
- Local development uses a Vite proxy from `/api` to `http://localhost:5000` (`API_PROXY_TARGET` overrides the target).
- ESPN is the provider for schedule, scores, teams, rosters, injuries and published game lines.
- Player props come from DunkAPI, not ESPN. `/api/nba/props` and `/api/nba/picks` are generated together by `picks.ts` and cached for 6 hours; without `DUNKAPI_API_KEY` they return empty arrays and the UI explains why. No placeholder edges are generated.
- The picks model is deterministic statistics, not an LLM: last-10-game recency-weighted projection blended with the latest regular-season baseline, a normal distribution widened for small samples, and a comparison against the de-vigged market probability at the most-quoted line. Wording in the rationale is generated from those numbers.
- Watchlists are browser-local; there are no accounts or server-side personal data.

## Product

The app includes an overview, Radar Picks, prop board, matchups, player and team profiles, a browser-local watchlist, an audit trail stub, and an ops/data-health page. Radar Picks and the prop board are populated from DunkAPI lines plus the model. Model performance and audit records remain empty until settled picks are stored and scored.

## Gotchas

- ESPN's schedule is Eastern-time based; "today" is computed in `America/New_York`, not UTC.
- ESPN team abbreviations differ from common ones (`GS`, `NY`, `NO`, `SA`, `UTAH`, `WSH`); conference/division mapping lives in the adapter.
- Rosters are fetched for all 30 teams and cached for an hour; the first Players request is slow by design.
- Player headshots and team logos are loaded from ESPN CDN URLs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
