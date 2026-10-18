# NBA Snipes Analytics

An NBA player-prop analytics web app, built as a responsive React site with an
Express API. The current feed is explicitly labeled **Demo**: it uses
illustrative sample values and does not claim to show current games, odds,
player availability, or verified model performance.

The NHL reference repository is separate and is not part of this project.

## Run locally

Install the workspace dependencies with `pnpm install`, then start the existing
web and API workflows in Replit. The NBA frontend calls the API at `/api`, so
both local preview and Render use the same URL shape.

## Deploy to Render

The root `render.yaml` defines one Node web service. Connect this repository to
Render and deploy the Blueprint. Render builds the NBA frontend and shared API
server, then Express serves the built site and `/api/*` from the same origin.

The service uses Render's `PORT`; no fixed port is required. The health check
is `/api/healthz`. Add future third-party data credentials as Render environment
variables, never in source files. Until a supported NBA statistics and odds
provider is configured, the app remains in labeled demo mode.

## NBA data API

The server exposes an NBA-specific REST contract under `/api/nba` for the
dashboard, schedule, players, teams, props, ranked signals, matchups, alerts,
model tracking, and audit trail. The provider layer is isolated from the routes
so a live statistics or odds feed can replace the demo provider without changing
the frontend contract.
