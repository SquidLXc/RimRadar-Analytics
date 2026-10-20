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
- `DUNKAPI_API_KEY` (in `artifacts/api-server/.env` locally, an environment variable in deployment) enables the priced prop lines that feed Radar Picks and the first-basket tracker. Keep it out of source control.
- Player form comes from ESPN's free athlete stats/gamelog endpoints, so DunkAPI usage is limited to the schedule and prop calls. Calls are serialized, spaced, and retried on rate limits.
- Optional tuning: `DUNKAPI_CACHE_MINUTES` (360), `DUNKAPI_MAX_GAMES` (1), `DUNKAPI_MAX_PLAYERS` (6), `DUNKAPI_MIN_EDGE` (0.025), `DUNKAPI_MAX_PICKS` (12), `FIRST_BASKET_CACHE_MINUTES` (360), `FIRST_BASKET_MAX_GAMES` (2), `FIRST_BASKET_MAX_PLAYERS` (10).
- `AUDIT_STORE_PATH` sets the audit ledger location (default `.data/audit.json`).
- `DISCORD_INVITE_URL` shows the Join Discord button; `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` and `DISCORD_BOT_TOKEN` enable OAuth auto-join. `PUBLIC_APP_URL` (or `DISCORD_REDIRECT_URI`) must match the registered callback.

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
- `artifacts/api-server/src/providers/dunkapi.ts` — rate-limited DunkAPI client (schedule, props) with credit accounting
- `artifacts/api-server/src/providers/espnForm.ts` — free ESPN player season averages and recent game logs
- `artifacts/api-server/src/providers/picks.ts` — cached Radar Picks model: form projection, de-vig, edge threshold, rationale
- `artifacts/api-server/src/providers/firstBasket.ts` — first-basket model, fair prices and ESPN grading
- `artifacts/api-server/src/providers/results.ts` — ESPN box-score and play-by-play parser
- `artifacts/api-server/src/providers/audit.ts` — persistent prediction ledger and settlement
- `artifacts/api-server/src/routes/discord.ts` — Discord invite and OAuth join routes
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
- The first-basket model allocates each team's expected points (from the game total) across its priced scorers in proportion to projected scoring, and reports the probability plus the fair American price. DunkAPI has no first-basket market, so no market edge or sportsbook price is shown. Free throws do not count toward the first basket.
- Predictions are written to the audit ledger when the model first produces them. Pending records settle from ESPN final box scores (player props) and the first made field goal (first-basket). Historical predictions are never rewritten.
- Watchlists are browser-local; there are no accounts or server-side personal data. Discord membership is handled by Discord OAuth when configured.

## Product

The app includes an overview, Radar Picks, a first-basket tracker, prop board, matchups, player and team profiles, a browser-local watchlist, a populated audit trail, and an ops/data-health page. The audit page shows pending predictions immediately and hit rates after games settle.

## Gotchas

- ESPN's schedule is Eastern-time based; "today" is computed in `America/New_York`, not UTC.
- ESPN team abbreviations differ from common ones (`GS`, `NY`, `NO`, `SA`, `UTAH`, `WSH`); conference/division mapping lives in the adapter.
- Rosters are fetched for all 30 teams and cached for an hour; the first Players request is slow by design.
- Player headshots and team logos are loaded from ESPN CDN URLs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
