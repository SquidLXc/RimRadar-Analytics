import { Router, type IRouter } from "express";
import {
  GetDataHealthResponse,
  GetNbaAuditResponse,
  GetNbaDashboardSummaryQueryParams,
  GetNbaDashboardSummaryResponse,
  GetNbaDataStatusResponse,
  GetNbaFirstBasketAlertsResponse,
  GetNbaFirstBasketResponse,
  GetNbaFirstBasketStatusResponse,
  GetNbaFutureGamesResponse,
  GetNbaGameParams,
  GetNbaGameResponse,
  GetNbaGamesQueryParams,
  GetNbaGamesResponse,
  GetNbaLiveAlertsResponse,
  GetNbaMatchupsResponse,
  GetNbaModelPerformanceResponse,
  GetNbaOddsResponse,
  GetNbaPicksQueryParams,
  GetNbaPicksResponse,
  GetNbaPicksStatusResponse,
  GetNbaPlayerParams,
  GetNbaPlayerResponse,
  GetNbaPlayersQueryParams,
  GetNbaPlayersResponse,
  GetNbaPropsQueryParams,
  GetNbaPropsResponse,
  GetNbaTeamParams,
  GetNbaTeamResponse,
  GetNbaTeamsResponse,
  GetNbaTodayGamesResponse,
  RefreshNbaModelResponse,
  SyncNbaDataResponse,
} from "@workspace/api-zod";
import { nbaProvider } from "../providers/nba";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/nba/data-status", (_req, res) => {
  const status = nbaProvider.getDataStatus();
  const picks = nbaProvider.getPicksStatusCached();
  const picksLine =
    picks.picksGenerated > 0
      ? `${picks.picksGenerated} live picks across ${picks.slateGames} slate games.`
      : picks.message;
  res.json(GetNbaDataStatusResponse.parse({ ...status, message: `${status.message} ${picksLine}` }));
});

router.get("/nba/dashboard/summary", async (req, res) => {
  const query = GetNbaDashboardSummaryQueryParams.parse(req.query);
  const dashboard = await nbaProvider.getDashboard(query.date);
  res.json(GetNbaDashboardSummaryResponse.parse(dashboard));
});

// Fixed paths must be registered before "/nba/games/:gameId".
router.get("/nba/games/today", async (_req, res) => {
  const games = await nbaProvider.getTodayGames();
  res.json(GetNbaTodayGamesResponse.parse(games));
});

router.get("/nba/games/future", async (_req, res) => {
  const games = await nbaProvider.getFutureGames();
  res.json(GetNbaFutureGamesResponse.parse(games));
});

router.get("/nba/games", async (req, res) => {
  const query = GetNbaGamesQueryParams.parse(req.query);
  const games = await nbaProvider.getGames(query.date, query.status);
  res.json(GetNbaGamesResponse.parse(games));
});

router.get("/nba/games/:gameId", async (req, res) => {
  const params = GetNbaGameParams.parse(req.params);
  const game = await nbaProvider.getGame(params.gameId);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(GetNbaGameResponse.parse(game));
});

router.get("/nba/players", async (req, res) => {
  const query = GetNbaPlayersQueryParams.parse(req.query);
  const players = await nbaProvider.getPlayers(query.search, query.team);
  res.json(GetNbaPlayersResponse.parse(players));
});

router.get("/nba/players/:playerId", async (req, res) => {
  const params = GetNbaPlayerParams.parse(req.params);
  const player = await nbaProvider.getPlayer(params.playerId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(GetNbaPlayerResponse.parse(player));
});

router.get("/nba/teams", async (_req, res) => {
  const teams = await nbaProvider.getTeams();
  res.json(GetNbaTeamsResponse.parse(teams));
});

router.get("/nba/teams/:teamId", async (req, res) => {
  const params = GetNbaTeamParams.parse(req.params);
  const team = await nbaProvider.getTeam(params.teamId);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  res.json(GetNbaTeamResponse.parse(team));
});

router.get("/nba/props", async (req, res) => {
  const query = GetNbaPropsQueryParams.parse(req.query);
  res.json(GetNbaPropsResponse.parse(await nbaProvider.getProps(query.market)));
});

// Registered before "/nba/picks" so the static suffix is always matched first.
router.get("/nba/picks/status", async (_req, res) => {
  res.json(GetNbaPicksStatusResponse.parse(await nbaProvider.getPicksStatus()));
});

router.get("/nba/picks", async (req, res) => {
  const query = GetNbaPicksQueryParams.parse(req.query);
  res.json(GetNbaPicksResponse.parse(await nbaProvider.getPicks(query.market)));
});

router.get("/nba/first-basket", async (_req, res) => {
  const entries = await nbaProvider.getFirstBasket();
  res.json(GetNbaFirstBasketResponse.parse(entries));
});

router.get("/nba/first-basket/status", async (_req, res) => {
  const status = await nbaProvider.getFirstBasketStatus();
  res.json(GetNbaFirstBasketStatusResponse.parse(status));
});

router.get("/nba/first-basket/alerts", async (_req, res) => {
  const alerts = await nbaProvider.getFirstBasketAlerts();
  res.json(GetNbaFirstBasketAlertsResponse.parse(alerts));
});

router.get("/nba/odds", async (_req, res) => {
  const feed = await nbaProvider.getOdds();
  res.json(GetNbaOddsResponse.parse(feed));
});

router.get("/nba/matchups", async (_req, res) => {
  const matchups = await nbaProvider.getMatchups();
  res.json(GetNbaMatchupsResponse.parse(matchups));
});

router.get("/nba/live-alerts", async (_req, res) => {
  const alerts = await nbaProvider.getLiveAlerts();
  res.json(GetNbaLiveAlertsResponse.parse(alerts));
});

router.get("/nba/model-performance", async (_req, res) => {
  res.json(GetNbaModelPerformanceResponse.parse(await nbaProvider.getModelPerformance()));
});

router.get("/nba/audit", async (_req, res) => {
  res.json(GetNbaAuditResponse.parse(await nbaProvider.getAudit()));
});

router.get("/admin/data-health", async (_req, res) => {
  const health = await nbaProvider.getDataHealth();
  res.json(GetDataHealthResponse.parse(health));
});

router.post("/admin/sync", async (_req, res) => {
  const result = await nbaProvider.sync();
  res.json(SyncNbaDataResponse.parse(result));
});

router.post("/admin/model/refresh", (_req, res) => {
  res.json(RefreshNbaModelResponse.parse(nbaProvider.refreshModel()));
});

export default router;
