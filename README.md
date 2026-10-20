# RimRaider

An NBA research terminal built as a responsive React site with an Express API.

**Live data source: ESPN.** The dashboard, matchups, players, teams and injury
report use ESPN's public NBA endpoints. Game lines (moneyline, spread, total)
come from the sportsbook partners ESPN publishes (currently DraftKings).

**Player props and Radar Picks: DunkAPI + the RimRaider model.** ESPN does not
publish player props, so the priced lines come from
[DunkAPI](https://dunkapi.com). Player form (season averages and last-ten game
logs) comes from ESPN's free athlete endpoints, which keeps DunkAPI usage to the
schedule and prop calls. The model blends recency-weighted form with the latest
regular-season baseline, de-viggs the over/under prices at the line most books
quote, and lists a pick only when its projected probability clears the market by
a minimum edge. Every pick carries the projection, price, book and rationale.

**First basket tracker.** A separate model turns the same slate into per-player
probabilities for the first made field goal. It allocates each team's expected
points from the game total across its priced scorers, shows the model
probability and the fair American price it implies, and grades each pick from
ESPN play-by-play after tip-off. Free throws before the first basket do not
count. DunkAPI does not publish first-basket prices, so no market edge is shown.

**Audit ledger.** Every pick and first-basket projection is written to a local
JSON ledger (`.data/audit.json`, or `AUDIT_STORE_PATH`) the first time it is
seen, then settled from ESPN box scores and play-by-play. The audit page shows
pending records immediately and fills in hit rates as games finish.

Set `DUNKAPI_API_KEY` to enable the props and both models. Without a key the
boards stay empty rather than showing sample edges. Generated boards are cached
for 6 hours; a refresh costs roughly 12 credits for one game because player
profiles no longer come from DunkAPI. DunkAPI calls are serialized with a small
gap and retried on rate limits, and the UI shows the remaining account credits.

**Discord.** Set `DISCORD_INVITE_URL` to show a Join Discord button in the
sidebar and header. For one-click auto-join instead, also set
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` and
`DISCORD_BOT_TOKEN`. The Ops page reports which mode is configured.

For OAuth, register both callbacks in the Discord developer portal:
`http://localhost:5173/api/auth/discord/callback` for local development (with
`PUBLIC_APP_URL=http://localhost:5173`) and
`https://<your-domain>/api/auth/discord/callback` for production. The bot must
be a member of the guild with permission to create invites. If both an invite
and OAuth are configured, the button uses the direct invite (always reliable)
and the auto-join flow remains available at `/api/auth/discord/login`.

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
- `GET /api/nba/first-basket`, `/api/nba/first-basket/status`
- `GET /api/nba/audit`, `/api/nba/model-performance`
- `GET /api/community/discord`, `/api/auth/discord/login`
- `GET /api/admin/data-health`, `POST /api/admin/sync`, `POST /api/admin/model/refresh`

## Deploy to Render

The root `render.yaml` defines one Node web service. Connect this repository to
Render and deploy the Blueprint. Render builds the NBA frontend and shared API
server, then Express serves the built site and `/api/*` from the same origin.

The service uses Render's `PORT`; no fixed port is required. The health check is
`/api/healthz`. Add `DUNKAPI_API_KEY` as a Render environment variable (the
Blueprint declares it with `sync: false`), never in source files. Add the
`DISCORD_*` variables there too if the community button should appear.

Model tuning knobs, all optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DUNKAPI_CACHE_MINUTES` | `360` | How long generated picks are reused |
| `DUNKAPI_MAX_GAMES` | `1` | Slate games to price (10 credits each) |
| `DUNKAPI_MAX_PLAYERS` | `6` | Priced players to model |
| `DUNKAPI_MIN_EDGE` | `0.025` | Minimum edge over the de-vigged market |
| `DUNKAPI_MAX_PICKS` | `12` | Cap on returned picks |
| `FIRST_BASKET_MAX_GAMES` | `2` | Slate games in the first-basket tracker |
| `FIRST_BASKET_MAX_PLAYERS` | `10` | Priced players modelled per game |
| `FIRST_BASKET_CACHE_MINUTES` | `360` | How long tracker projections are reused |
| `AUDIT_STORE_PATH` | `.data/audit.json` | Where the audit ledger is persisted |
| `DISCORD_INVITE_URL` | unset | Public Discord invite link |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN` | unset | Optional OAuth auto-join |
| `PUBLIC_APP_URL` | request host | Origin used to build the Discord callback |
| `DISCORD_REDIRECT_URI` | `PUBLIC_APP_URL` + callback path | Override the callback URL exactly |

## Project layout

- `artifacts/nba-snipes/` — NBA web app (React + Vite + Tailwind)
- `artifacts/api-server/` — Express API, ESPN provider, DunkAPI client and picks model
- `lib/api-spec/openapi.yaml` — source of truth for API types; run
  `pnpm --filter @workspace/api-spec run codegen` after editing it
- `lib/api-zod/`, `lib/api-client-react/` — generated schemas, types and hooks
