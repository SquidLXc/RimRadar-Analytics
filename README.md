# RimRaider

An NBA research terminal built as a responsive React site with an Express API.

**Live data source: ESPN.** The dashboard, matchups, players, teams and injury
report use ESPN's public NBA endpoints. Game lines (moneyline, spread, total)
come from the sportsbook partners ESPN publishes (currently DraftKings).

**Player props and Radar Picks: DunkAPI + the RimRaider model.** ESPN does not
publish player props, so prop lines and player game logs come from
[DunkAPI](https://dunkapi.com). The model blends recency-weighted form from the
last ten games with the latest regular-season baseline, de-viggs the over/under
prices at the line most books quote, and lists a pick only when its projected
probability clears the market by a minimum edge. Every pick carries the
projection, price, book, projection split and written rationale.

Set `DUNKAPI_API_KEY` to enable it. Without a key the board stays empty rather
than showing sample edges. Generated picks are cached for 6 hours to bound credit
usage; one refresh costs roughly 44 credits for one game and six players.

## Run locally

Install dependencies with `pnpm install`.

Run the API and the web app in two terminals:

```bash
# artifacts/api-server/.env -> DUNKAPI_API_KEY=sk_live_...
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=5173 pnpm --filter @workspace/nba-snipes run dev
```

The API reads `artifacts/api-server/.env` in development only. Deployments use
real environment variables.

Vite proxies `/api` to `http://localhost:5000` (override with
`API_PROXY_TARGET`). The production build serves the API and the built site from
one origin, so no proxy is involved there.

On Windows, set the environment variables with `set PORT=5000` (cmd) or
`$env:PORT=5000` (PowerShell) before the commands above.

Useful endpoints:

- `GET /api/healthz`
- `GET /api/nba/games/today`, `/api/nba/games/future`, `/api/nba/games/:id`
- `GET /api/nba/players`, `/api/nba/players/:id`
- `GET /api/nba/teams`, `/api/nba/teams/:id`
- `GET /api/nba/odds`
- `GET /api/nba/matchups`
- `GET /api/nba/live-alerts`
- `GET /api/nba/picks`, `/api/nba/props`, `/api/nba/picks/status`
- `GET /api/admin/data-health`, `POST /api/admin/sync`

## Deploy to Render

The root `render.yaml` defines one Node web service. Connect this repository to
Render and deploy the Blueprint. Render builds the NBA frontend and shared API
server, then Express serves the built site and `/api/*` from the same origin.

The service uses Render's `PORT`; no fixed port is required. The health check is
`/api/healthz`. Add `DUNKAPI_API_KEY` as a Render environment variable (the
Blueprint declares it with `sync: false`), never in source files.

Model tuning knobs, all optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DUNKAPI_CACHE_MINUTES` | `360` | How long generated picks are reused |
| `DUNKAPI_MAX_GAMES` | `1` | Slate games to price (10 credits each) |
| `DUNKAPI_MAX_PLAYERS` | `6` | Player profiles to pull (5 credits each) |
| `DUNKAPI_MIN_EDGE` | `0.025` | Minimum edge over the de-vigged market |
| `DUNKAPI_MAX_PICKS` | `12` | Cap on returned picks |

## Project layout

- `artifacts/nba-snipes/` — NBA web app (React + Vite + Tailwind)
- `artifacts/api-server/` — Express API, ESPN provider, DunkAPI client and picks model
- `lib/api-spec/openapi.yaml` — source of truth for API types; run
  `pnpm --filter @workspace/api-spec run codegen` after editing it
- `lib/api-zod/`, `lib/api-client-react/` — generated schemas, types and hooks
