/**
 * Reads final NBA results from ESPN's public summary endpoint so model
 * predictions can be graded after the fact. Nothing here is inferred: when a
 * number is missing from the provider payload it stays null.
 */
const ESPN_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=";

const LIVE_TTL = 60_000;
const SCHEDULED_TTL = 5 * 60_000;

export type PlayerStatLine = {
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
};

export type FirstBasketResult = {
  playerId: string;
  playerName: string;
  team: string;
  period: number;
  periodLabel: string;
  clock: string;
  homeScore: number | null;
  awayScore: number | null;
  playText: string;
};

export type GameResult = {
  gameId: string;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  playerStats: Map<string, PlayerStatLine>;
  firstBasket: FirstBasketResult | null;
};

type CacheEntry = { value: GameResult; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<GameResult | null>>();

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function madeShots(value: string | undefined): number {
  if (!value) return 0;
  const made = Number.parseInt(String(value).split("-")[0] ?? "", 10);
  return Number.isFinite(made) ? made : 0;
}

function readGameStatus(payload: any): GameResult["status"] {
  const competition = payload?.header?.competitions?.[0];
  const type = competition?.status?.type;
  if (type?.completed === true || type?.state === "post") return "final";
  if (type?.state === "in") return "live";
  return "scheduled";
}

function readScores(payload: any): { homeScore: number | null; awayScore: number | null } {
  const competitors: any[] = payload?.header?.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((entry) => entry?.homeAway === "home");
  const away = competitors.find((entry) => entry?.homeAway === "away");
  return {
    homeScore: numberOrNull(home?.score),
    awayScore: numberOrNull(away?.score),
  };
}

function readPlayerStats(payload: any): Map<string, PlayerStatLine> {
  const stats = new Map<string, PlayerStatLine>();
  const groups: any[] = payload?.boxscore?.players ?? [];

  groups.forEach((group) => {
    const block = group?.statistics?.[0];
    const labels: string[] = block?.labels ?? [];
    const indexOf = (label: string) => labels.findIndex((item) => item.toUpperCase() === label);
    const pointsIndex = indexOf("PTS");
    const reboundsIndex = indexOf("REB");
    const assistsIndex = indexOf("AST");
    const threesIndex = indexOf("3PT");

    (block?.athletes ?? []).forEach((entry: any) => {
      const id = String(entry?.athlete?.id ?? "");
      if (!id) return;
      const row: string[] = entry?.stats ?? [];
      const points = numberOrNull(row[pointsIndex]);
      const rebounds = numberOrNull(row[reboundsIndex]);
      const assists = numberOrNull(row[assistsIndex]);
      if (points === null && rebounds === null && assists === null) return;
      stats.set(id, {
        points: points ?? 0,
        rebounds: rebounds ?? 0,
        assists: assists ?? 0,
        threes: threesIndex >= 0 ? madeShots(row[threesIndex]) : 0,
      });
    });
  });

  return stats;
}

function readFirstBasket(payload: any, stats: Map<string, PlayerStatLine>): FirstBasketResult | null {
  const plays: any[] = payload?.plays ?? [];
  const names = new Map<string, string>();
  const teams = new Map<string, string>();
  (payload?.boxscore?.players ?? []).forEach((group: any) => {
    const team = String(group?.team?.abbreviation ?? "");
    (group?.statistics?.[0]?.athletes ?? []).forEach((entry: any) => {
      const id = String(entry?.athlete?.id ?? "");
      const name = entry?.athlete?.displayName ?? entry?.athlete?.shortName;
      if (id && name) names.set(id, String(name));
      if (id && team) teams.set(id, team);
    });
  });

  for (const play of plays) {
    if (!play?.scoringPlay) continue;
    const typeText = String(play?.type?.text ?? "");
    const text = String(play?.text ?? "");
    // A first-basket market settles on the first made field goal. Free throws
    // before that basket do not count, so skip every free-throw event.
    if (/free throw/i.test(typeText) || /free throw/i.test(text)) continue;
    if (!/makes|made/i.test(text)) continue;
    const athlete = play?.participants?.[0]?.athlete;
    const playerId = String(athlete?.id ?? "");
    if (!playerId) continue;
    const playerName =
      names.get(playerId) ?? String(athlete?.displayName ?? athlete?.shortName ?? playerId);
    return {
      playerId,
      playerName,
      team: teams.get(playerId) ?? "",
      period: Number(play?.period?.number ?? 0),
      periodLabel: String(play?.period?.displayValue ?? `Q${play?.period?.number ?? ""}`),
      clock: String(play?.clock?.displayValue ?? ""),
      homeScore: numberOrNull(play?.homeScore),
      awayScore: numberOrNull(play?.awayScore),
      playText: text,
    };
  }

  return null;
}

async function load(gameId: string): Promise<GameResult | null> {
  let response: Response;
  try {
    response = await fetch(`${ESPN_SUMMARY}${encodeURIComponent(gameId)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error(`[results] ESPN summary failed for ${gameId}:`, error instanceof Error ? error.message : error);
    return null;
  }

  if (!response.ok) {
    console.error(`[results] ESPN summary returned ${response.status} for ${gameId}`);
    return null;
  }

  const payload: any = await response.json();
  const status = readGameStatus(payload);
  const playerStats = readPlayerStats(payload);
  const scores = readScores(payload);

  return {
    gameId,
    status,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    playerStats,
    firstBasket: status === "scheduled" ? null : readFirstBasket(payload, playerStats),
  };
}

export const resultsProvider = {
  async getGameResult(gameId: string): Promise<GameResult | null> {
    const cached = cache.get(gameId);
    const ttl = cached?.value.status === "final" ? Number.POSITIVE_INFINITY : cached?.value.status === "live" ? LIVE_TTL : SCHEDULED_TTL;
    if (cached && Date.now() - cached.at < ttl) return cached.value;

    const pending = inflight.get(gameId);
    if (pending) return pending;

    const promise = load(gameId)
      .then((value) => {
        if (value) cache.set(gameId, { value, at: Date.now() });
        return value;
      })
      .finally(() => {
        inflight.delete(gameId);
      });

    inflight.set(gameId, promise);
    return promise;
  },

  clearCache(): void {
    cache.clear();
  },
};
