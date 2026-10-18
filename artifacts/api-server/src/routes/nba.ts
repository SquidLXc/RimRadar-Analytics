import { Router, type IRouter } from "express";
import {
  GetNbaAuditResponse,
  GetNbaDashboardSummaryQueryParams,
  GetNbaDashboardSummaryResponse,
  GetNbaDataStatusResponse,
  GetNbaGameParams,
  GetNbaGameResponse,
  GetNbaGamesQueryParams,
  GetNbaGamesResponse,
  GetNbaLiveAlertsResponse,
  GetNbaMatchupsResponse,
  GetNbaModelPerformanceResponse,
  GetNbaPlayerParams,
  GetNbaPlayerResponse,
  GetNbaPlayersQueryParams,
  GetNbaPlayersResponse,
  GetNbaPropsQueryParams,
  GetNbaPropsResponse,
  GetNbaSnipesQueryParams,
  GetNbaSnipesResponse,
  GetNbaTeamParams,
  GetNbaTeamResponse,
  GetNbaTeamsResponse,
} from "@workspace/api-zod";
import { nbaProvider } from "../providers/nba";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/nba/data-status", (_req, res) => {
  res.json(GetNbaDataStatusResponse.parse(nbaProvider.getDataStatus()));
});

router.get("/nba/dashboard/summary", (req, res) => {
  const query = GetNbaDashboardSummaryQueryParams.parse(req.query);
  res.json(GetNbaDashboardSummaryResponse.parse(nbaProvider.getDashboard(query.date)));
});

router.get("/nba/games", (req, res) => {
  const query = GetNbaGamesQueryParams.parse(req.query);
  res.json(GetNbaGamesResponse.parse(nbaProvider.getGames(query.date, query.status)));
});

router.get("/nba/games/:gameId", (req, res) => {
  const params = GetNbaGameParams.parse(req.params);
  const game = nbaProvider.getGame(params.gameId);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(GetNbaGameResponse.parse(game));
});

router.get("/nba/players", (req, res) => {
  const query = GetNbaPlayersQueryParams.parse(req.query);
  res.json(GetNbaPlayersResponse.parse(nbaProvider.getPlayers(query.search, query.team)));
});

router.get("/nba/players/:playerId", (req, res) => {
  const params = GetNbaPlayerParams.parse(req.params);
  const player = nbaProvider.getPlayer(params.playerId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(GetNbaPlayerResponse.parse(player));
});

router.get("/nba/teams", (_req, res) => {
  res.json(GetNbaTeamsResponse.parse(nbaProvider.getTeams()));
});

router.get("/nba/teams/:teamId", (req, res) => {
  const params = GetNbaTeamParams.parse(req.params);
  const team = nbaProvider.getTeam(params.teamId);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  res.json(GetNbaTeamResponse.parse(team));
});

router.get("/nba/props", (req, res) => {
  const query = GetNbaPropsQueryParams.parse(req.query);
  res.json(GetNbaPropsResponse.parse(nbaProvider.getProps(query.market)));
});

router.get("/nba/snipes", (req, res) => {
  const query = GetNbaSnipesQueryParams.parse(req.query);
  res.json(GetNbaSnipesResponse.parse(nbaProvider.getSnipes(query.market)));
});

router.get("/nba/matchups", (_req, res) => {
  res.json(GetNbaMatchupsResponse.parse(nbaProvider.getMatchups()));
});

router.get("/nba/live-alerts", (_req, res) => {
  res.json(GetNbaLiveAlertsResponse.parse(nbaProvider.getLiveAlerts()));
});

router.get("/nba/model-performance", (_req, res) => {
  res.json(GetNbaModelPerformanceResponse.parse(nbaProvider.getModelPerformance()));
});

router.get("/nba/audit", (_req, res) => {
  res.json(GetNbaAuditResponse.parse(nbaProvider.getAudit()));
});

export default router;
