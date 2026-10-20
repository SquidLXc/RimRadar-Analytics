import type {
  DashboardSummary,
  DataHealth,
  DataStatus,
  FirstBasketAlert,
  FirstBasketAlerts,
  Game,
  GameLog,
  LiveAlert,
  LiveAlerts,
  Matchup,
  ModelPerformance,
  OddsFeed,
  Pick,
  Player,
  PlayerDetail,
  Prop,
  SyncResult,
  Team,
  TeamDetail,
} from "@workspace/api-zod";
import { espnAdapter, leagueDate, type TeamRecord } from "./espn";
import { picksProvider } from "./picks";
import { firstBasketProvider, toFirstBasketAlert } from "./firstBasket";
import { auditProvider } from "./audit";
import { dunkapi } from "./dunkapi";
import { resultsProvider } from "./results";

const GAME_CACHE_TTL = 5 * 60 * 1000;
const STATIC_CACHE_TTL = 60 * 60 * 1000;
// The live first-basket feed polls every 15s, so it cannot ride the 5 minute scoreboard cache.
const ALERTS_GAMES_TTL = 30 * 1000;

type Cache<T> = { value: T; at: number };

let gamesCache: Cache<Game[]> | null = null;
let todayCache: (Cache<Game[]> & { key: string }) | null = null;
let alertsGamesCache: (Cache<Game[]> & { key: string }) | null = null;
let teamsCache: Cache<Team[]> | null = null;
let playersCache: Cache<Player[]> | null = null;
let recordsCache: Cache<Map<string, TeamRecord>> | null = null;
let oddsCache: Cache<OddsFeed> | null = null;

let lastSuccessfulSync: Date | null = null;
let lastAttemptedSync: Date | null = null;
let lastError: string | null = null;

function isFresh<T>(cache: Cache<T> | null, ttl: number): cache is Cache<T> {
  return cache !== null && Date.now() - cache.at < ttl;
}

function recordSuccess() {
  lastAttemptedSync = new Date();
  lastSuccessfulSync = lastAttemptedSync;
  lastError = null;
}

function recordFailure(error: unknown) {
  lastAttemptedSync = new Date();
  lastError = error instanceof Error ? error.message : String(error);
  console.error("[espn]", lastError);
}

function buildStatus(): DataStatus {
  if (lastSuccessfulSync === null) {
    return {
      mode: "unavailable",
      provider: "ESPN",
      lastUpdated: null,
      message: "The ESPN feed has not answered yet. Start the API server and retry.",
    };
  }

  const age = Date.now() - lastSuccessfulSync.getTime();
  const mode: DataStatus["mode"] = lastError ? "stale" : "live";

  return {
    mode,
    provider: "ESPN",
    lastUpdated: lastSuccessfulSync,
    message:
      mode === "live"
        ? "Live schedule, scores, rosters, injuries and DraftKings game lines from ESPN. Radar Picks are modeled from DunkAPI player props and game logs."
        : `Last ESPN sync ${Math.round(age / 60000)} min ago. ${lastError ?? ""}`.trim(),
  };
}

function today(): Date {
  return new Date();
}

async function loadGames(date?: Date): Promise<Game[]> {
  if (!date) return loadTodayGames();

  try {
    const games = await espnAdapter.fetchGames(date);
    recordSuccess();
    return games;
  } catch (error) {
    recordFailure(error);
    return [];
  }
}

async function loadTodayGames(): Promise<Game[]> {
  const key = leagueDate();
  if (todayCache && todayCache.key === key && isFresh(todayCache, GAME_CACHE_TTL)) {
    return todayCache.value;
  }

  try {
    const games = await espnAdapter.fetchGames(new Date());
    recordSuccess();
    todayCache = { value: games, key, at: Date.now() };
    gamesCache = { value: games, at: Date.now() };
    return games;
  } catch (error) {
    recordFailure(error);
    return todayCache?.value ?? gamesCache?.value ?? [];
  }
}

async function loadTodayGamesForAlerts(): Promise<Game[]> {
  const key = leagueDate();
  if (alertsGamesCache && alertsGamesCache.key === key && isFresh(alertsGamesCache, ALERTS_GAMES_TTL)) {
    return alertsGamesCache.value;
  }

  try {
    const games = await espnAdapter.fetchGames(new Date());
    recordSuccess();
    const at = Date.now();
    alertsGamesCache = { value: games, key, at };
    todayCache = { value: games, key, at };
    gamesCache = { value: games, at };
    return games;
  } catch (error) {
    recordFailure(error);
    return alertsGamesCache?.value ?? todayCache?.value ?? gamesCache?.value ?? [];
  }
}

async function loadTeams(): Promise<Team[]> {
  if (isFresh(teamsCache, STATIC_CACHE_TTL)) return teamsCache.value;
  try {
    const teams = await espnAdapter.fetchTeams();
    recordSuccess();
    teamsCache = { value: teams, at: Date.now() };
    return teams;
  } catch (error) {
    recordFailure(error);
    return teamsCache?.value ?? [];
  }
}

async function loadPlayers(): Promise<Player[]> {
  if (isFresh(playersCache, STATIC_CACHE_TTL)) return playersCache.value;
  try {
    const players = await espnAdapter.fetchAllPlayers();
    recordSuccess();
    playersCache = { value: players, at: Date.now() };
    return players;
  } catch (error) {
    recordFailure(error);
    return playersCache?.value ?? [];
  }
}

async function loadRecords() {
  if (isFresh(recordsCache, STATIC_CACHE_TTL)) return recordsCache.value;
  try {
    const records = await espnAdapter.fetchTeamRecords();
    recordSuccess();
    recordsCache = { value: records, at: Date.now() };
    return records;
  } catch (error) {
    recordFailure(error);
    return recordsCache?.value ?? new Map();
  }
}

function findTeam(teams: Team[], id: string): Team | undefined {
  const needle = id.toLowerCase();
  return teams.find((team) => team.id.toLowerCase() === needle || team.abbreviation.toLowerCase() === needle);
}

/**
 * Player-prop markets come from DunkAPI via the cached picks model. When the
 * key is absent or the feed fails, these stay empty rather than fabricated.
 */
export const nbaProvider = {
  getDataStatus: (): DataStatus => buildStatus(),

  getDashboard: async (date?: Date): Promise<DashboardSummary> => {
    const games = date ? await loadGames(date) : await loadTodayGames();
    const players = playersCache?.value ?? [];
    const picks = await picksProvider.getPicks();
    const picksStatus = picksProvider.getCachedStatus();

    const topConfidence = picks.reduce<number | null>(
      (best, pick) => (pick.overProbability === null ? best : Math.max(best ?? 0, pick.overProbability)),
      null,
    );

    return {
      date: date ?? new Date(),
      gamesOnSlate: games.length,
      liveGames: games.filter((game) => game.status === "live").length,
      playersAnalyzed: Math.max(players.length, picksStatus.playersAnalyzed),
      topConfidence,
      topEdges: picks.slice(0, 5),
      games,
      modelVersion: picksStatus.configured ? picksProvider.modelVersion : players.length > 0 ? "data-only" : "awaiting-data",
      marketPerformance: [],
      dataStatus: buildStatus(),
    };
  },

  getGames: async (date?: Date, status?: Game["status"]): Promise<Game[]> => {
    const games = await loadGames(date);
    return status ? games.filter((game) => game.status === status) : games;
  },

  getTodayGames: async (): Promise<Game[]> => loadTodayGames(),

  getFutureGames: async (): Promise<Game[]> => {
    try {
      const games = await espnAdapter.fetchFutureGames(7);
      recordSuccess();
      return games;
    } catch (error) {
      recordFailure(error);
      return [];
    }
  },

  getGame: async (id: string): Promise<Game | undefined> => {
    const todayMatch = (await loadTodayGames()).find((game) => game.id === id);
    if (todayMatch) return todayMatch;

    const upcoming = (await nbaProvider.getFutureGames()).find((game) => game.id === id);
    if (upcoming) return upcoming;

    return gamesCache?.value.find((game) => game.id === id);
  },

  getPlayers: async (search?: string, team?: string): Promise<Player[]> => {
    const players = await loadPlayers();
    const needle = search?.trim().toLowerCase();
    return players.filter((player) => {
      if (needle && !player.name.toLowerCase().includes(needle)) return false;
      if (team && player.team.id !== team && player.team.abbreviation.toLowerCase() !== team.toLowerCase()) return false;
      return true;
    });
  },

  getPlayer: async (id: string): Promise<PlayerDetail | undefined> => {
    const athlete = await espnAdapter.fetchAthlete(id).catch((error) => {
      recordFailure(error);
      return null;
    });
    if (!athlete) {
      const cached = playersCache?.value.find((player) => player.id === id);
      if (!cached) return undefined;
      const recentGames: GameLog[] = [];
      return {
        player: cached,
        recentGames,
        seasonLabel: null,
        dataStatus: buildStatus(),
      };
    }

    recordSuccess();
    const recentGames: GameLog[] = [];
    return {
      player: athlete.player,
      recentGames,
      seasonLabel: athlete.seasonLabel,
      dataStatus: buildStatus(),
    };
  },

  getTeams: async (): Promise<Team[]> => loadTeams(),

  getTeam: async (id: string): Promise<TeamDetail | undefined> => {
    const teams = await loadTeams();
    const team = findTeam(teams, id);
    if (!team) return undefined;

    const [records, roster] = await Promise.all([
      loadRecords(),
      espnAdapter.fetchRoster(team.id).catch((error) => {
        recordFailure(error);
        return [] as Player[];
      }),
    ]);
    const record = records.get(team.id);

    return {
      team,
      wins: record?.wins ?? null,
      losses: record?.losses ?? null,
      pace: null,
      offensiveRating: record?.pointsFor ?? null,
      defensiveRating: record?.pointsAgainst ?? null,
      roster,
      dataStatus: buildStatus(),
    };
  },

  getProps: async (market?: Prop["market"]): Promise<Prop[]> => {
    const props = await picksProvider.getProps();
    return market ? props.filter((prop) => prop.market === market) : props;
  },

  getPicks: async (market?: Pick["market"]): Promise<Pick[]> => {
    const picks = await picksProvider.getPicks();
    return market ? picks.filter((pick) => pick.market === market) : picks;
  },

  getPicksStatus: () => picksProvider.getStatus(),

  getPicksStatusCached: () => picksProvider.getCachedStatus(),

  getMatchups: async (): Promise<Matchup[]> => {
    let games = await loadTodayGames();
    const showingFuture = games.length === 0;
    if (showingFuture) {
      games = (await nbaProvider.getFutureGames()).slice(0, 12);
    }

    let odds: OddsFeed | null = null;
    try {
      odds = await nbaProvider.getOdds();
    } catch (error) {
      recordFailure(error);
    }

    return games.map((game) => {
      const line = odds?.games.find((entry) => entry.game.id === game.id);
      const total = line?.sportsbooks
        .flatMap((book) => book.markets)
        .find((market) => market.key === "total")?.outcomes[0]?.point;

      return {
        game,
        projectedPace: null,
        projectedTotal: total ?? null,
        homeOffenseRating: null,
        awayOffenseRating: null,
        notes: line
          ? [`Prices from ${line.sportsbooks.map((book) => book.title).join(", ")}.`]
          : ["No verified sportsbook prices matched this game."],
        dataStatus: buildStatus(),
      };
    });
  },

  getLiveAlerts: async (): Promise<LiveAlerts> => {
    try {
      const injuries = await espnAdapter.fetchInjuries();
      recordSuccess();
      const events: LiveAlert[] = injuries.slice(0, 25).map((injury) => ({
        id: injury.id,
        gameId: injury.teamId ?? injury.athleteId,
        title: `${injury.athleteName} — ${injury.status}`,
        detail: injury.detail || `${injury.teamName} injury report`,
        createdAt: new Date(injury.date),
        kind: "status" as const,
      }));

      return {
        mode: "live",
        events,
        dataStatus: buildStatus(),
      };
    } catch (error) {
      recordFailure(error);
      return {
        mode: "unavailable",
        events: [],
        dataStatus: buildStatus(),
      };
    }
  },

  getOdds: async (): Promise<OddsFeed> => {
    if (isFresh(oddsCache, GAME_CACHE_TTL)) return oddsCache.value;

    const todayGames = await loadTodayGames();
    const games = todayGames.length > 0 ? todayGames : (await nbaProvider.getFutureGames()).slice(0, 10);

    try {
      const feed = await espnAdapter.fetchOdds(games);
      recordSuccess();
      oddsCache = { value: feed, at: Date.now() };
      return feed;
    } catch (error) {
      recordFailure(error);
      return {
        configured: false,
        provider: null,
        priceType: "American",
        games: [],
      };
    }
  },

  getModelPerformance: (): Promise<ModelPerformance[]> => auditProvider.getPerformance(),

  getAudit: () => auditProvider.getAudit(),

  getFirstBasket: () => firstBasketProvider.getEntries(),

  getFirstBasketStatus: () => firstBasketProvider.getStatus(),

  getFirstBasketAlerts: async (): Promise<FirstBasketAlerts> => {
    const games = await loadTodayGamesForAlerts();
    const started = games.filter((game) => game.status === "live" || game.status === "final");
    if (started.length === 0) {
      return { mode: "waiting", events: [], dataStatus: buildStatus() };
    }

    const events: FirstBasketAlert[] = [];
    for (const game of started) {
      const result = await resultsProvider.getGameResult(game.id);
      const first = result?.firstBasket;
      if (!first) continue;

      events.push(toFirstBasketAlert(game, first));
    }

    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const live = started.some((game) => game.status === "live");
    return {
      mode: live ? "live" : events.length > 0 ? "final" : "waiting",
      events,
      dataStatus: buildStatus(),
    };
  },

  refreshModel: () => {
    const remaining = dunkapi.status().creditsRemaining;
    if (remaining !== null && remaining < 15) {
      return {
        ok: false,
        message: `Only ${remaining} DunkAPI credits remain. A rebuild needs about 12 for one game, so add credits before refreshing.`,
      };
    }
    picksProvider.clearCache();
    firstBasketProvider.clearCache();
    return {
      ok: true,
      message: "Model caches cleared. The next picks and first-basket request will rebuild from DunkAPI.",
    };
  },

  getDataHealth: async (): Promise<DataHealth> => {
    const [teams, games] = await Promise.all([loadTeams(), loadGames()]);
    return {
      provider: "ESPN",
      connection: lastSuccessfulSync ? (lastError ? "error" : "connected") : "error",
      lastSuccessfulSync,
      lastAttemptedSync,
      teamsImported: teams.length,
      gamesImported: games.length,
      playersImported: playersCache?.value.length ?? 0,
      errors: lastError ? [lastError] : [],
    };
  },

  sync: async (): Promise<SyncResult> => {
    lastAttemptedSync = new Date();
    try {
      const [teams, games, players, records] = await Promise.all([
        espnAdapter.fetchTeams(),
        espnAdapter.fetchGames(new Date()),
        espnAdapter.fetchAllPlayers(),
        espnAdapter.fetchTeamRecords(),
      ]);
      teamsCache = { value: teams, at: Date.now() };
      gamesCache = { value: games, at: Date.now() };
      playersCache = { value: players, at: Date.now() };
      recordsCache = { value: records, at: Date.now() };
      oddsCache = null;
      recordSuccess();
      return {
        ok: true,
        teamsImported: teams.length,
        gamesImported: games.length,
        playersImported: players.length,
        message: `Refreshed ESPN data: ${teams.length} teams, ${games.length} games on the current slate, ${players.length} roster players.`,
      };
    } catch (error) {
      recordFailure(error);
      return {
        ok: false,
        teamsImported: 0,
        gamesImported: 0,
        playersImported: 0,
        message: lastError ?? "ESPN sync failed",
      };
    }
  },
};

export const nbaDataStatus = nbaProvider.getDataStatus();
