import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataStatus, FirstBasketEntry, FirstBasketStatus } from "@workspace/api-zod";
import { dunkapi, type DunkGame, type DunkProp } from "./dunkapi";
import { espnAdapter } from "./espn";
import { espnForm, type PlayerForm } from "./espnForm";
import { resultsProvider } from "./results";

const MODEL_VERSION = "rimraider-first-basket-v1";

const CACHE_MS = Math.max(15, Number(process.env.FIRST_BASKET_CACHE_MINUTES ?? 360)) * 60_000;
const MAX_GAMES = Math.max(1, Math.min(4, Number(process.env.FIRST_BASKET_MAX_GAMES ?? 2)));
const MAX_PLAYERS_PER_GAME = Math.max(4, Math.min(20, Number(process.env.FIRST_BASKET_MAX_PLAYERS ?? 10)));
const MIN_PROBABILITY = Math.max(0.0005, Number(process.env.FIRST_BASKET_MIN_PROBABILITY ?? 0.004));

// The modelled players are the ones the books price for points, which is a
// reliable proxy for the players who actually take the first shot. They do not
// account for every point a team scores, so the remaining probability is left
// with unmodelled bench players instead of being redistributed.
const MODELED_COVERAGE = 0.85;

type Cache = {
  entries: FirstBasketEntry[];
  at: number;
  message: string;
  error: string | null;
  gamesTracked: number;
  playersAnalyzed: number;
  creditsRemaining: number | null;
};

const CACHE_FILE = path.join(
  process.env.MODEL_CACHE_DIR ?? path.resolve(process.cwd(), ".data"),
  "first-basket-cache.json",
);

let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;
let hydration: Promise<void> | null = null;

function revive(cached: Cache): Cache {
  return {
    ...cached,
    entries: cached.entries.map((entry) => ({
      ...entry,
      gameDate: entry.gameDate ? new Date(entry.gameDate) : new Date(),
      tipoff: entry.tipoff ? new Date(entry.tipoff) : new Date(),
      dataStatus: {
        ...entry.dataStatus,
        lastUpdated: entry.dataStatus.lastUpdated ? new Date(entry.dataStatus.lastUpdated) : null,
      },
    })),
  };
}

function hydrate(): Promise<void> {
  hydration ??= (async () => {
    try {
      const parsed = JSON.parse(await readFile(CACHE_FILE, "utf8")) as Cache;
      if (Array.isArray(parsed?.entries) && Date.now() - parsed.at < CACHE_MS) {
        cache = revive(parsed);
      }
    } catch {
      // No cache file yet, or it is unreadable: generate normally.
    }
  })();
  return hydration;
}

async function persist(value: Cache): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(value), "utf8");
  } catch (error) {
    console.error("[first-basket] could not persist cache:", error instanceof Error ? error.message : error);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function recencyWeightedMean(values: number[]): number {
  if (values.length === 0) return 0;
  const weights = values.map((_, index) => Math.exp(-index / 4));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / total;
}

function fairAmericanOdds(probability: number): number {
  const value = clamp(probability, 0.001, 0.999);
  return value >= 0.5
    ? -Math.round((value / (1 - value)) * 100)
    : Math.round(((1 - value) / value) * 100);
}

function teamExpectedPoints(game: DunkGame): { home: number; away: number } {
  const total = Number(game.line?.total ?? 220);
  const spread = Number(game.line?.home_spread ?? 0);
  const home = total / 2 - spread / 2;
  return { home, away: total - home };
}

function projectionFor(form: PlayerForm, marketLine: number): { projection: number; recent: number | null; season: number | null; games: number; recentGames: number } {
  const recentValues = form.recent
    .filter((game) => game.minutes > 0)
    .slice(0, 10)
    .map((game) => game.points)
    .filter((value): value is number => Number.isFinite(value));

  const recent = recentValues.length >= 3 ? recencyWeightedMean(recentValues) : null;
  const season = form.season && form.season.games >= 3 ? form.season.points : null;

  if (recent !== null && season !== null) {
    return { projection: recent * 0.65 + season * 0.35, recent, season, games: form.season?.games ?? 0, recentGames: recentValues.length };
  }
  if (recent !== null) return { projection: recent, recent, season: null, games: form.season?.games ?? 0, recentGames: recentValues.length };
  if (season !== null) return { projection: season, recent: null, season, games: form.season?.games ?? 0, recentGames: 0 };
  return { projection: marketLine, recent: null, season: null, games: form.season?.games ?? 0, recentGames: 0 };
}

async function generate(): Promise<Cache> {
  const blank = (message: string, error: string | null, games = 0): Cache => ({
    entries: [],
    at: Date.now(),
    message,
    error,
    gamesTracked: games,
    playersAnalyzed: 0,
    creditsRemaining: dunkapi.status().creditsRemaining,
  });

  if (!dunkapi.isConfigured()) {
    return blank("DUNKAPI_API_KEY is not configured. The first-basket tracker is empty.", "not_configured");
  }

  let games: DunkGame[] = [];
  try {
    const schedule = await dunkapi.fetchSchedule(2);
    games = schedule
      .filter((game) => game.status === "scheduled")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, MAX_GAMES);

    if (games.length === 0) {
      return blank("No upcoming games are available for first-basket tracking.", null);
    }

    const injuries = await espnAdapter.fetchInjuries().catch((error): Array<{ athleteId: string; status: string }> => {
      console.error("[first-basket] ESPN injuries unavailable", error instanceof Error ? error.message : error);
      return [];
    });
    const unavailable = new Set(
      injuries
        .filter((injury) => /out|suspended|ineligible/i.test(injury.status))
        .map((injury) => injury.athleteId),
    );

    const entries: FirstBasketEntry[] = [];
    let playersAnalyzed = 0;

    for (const game of games) {
      let props: DunkProp[] = [];
      try {
        props = await dunkapi.fetchPlayerProps(game.game_id);
      } catch (error) {
        console.error(
          `[first-basket] props failed for ${game.game_id}`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }

      // Rank by the highest points line the books quote for that player. The
      // first basket almost always comes from the top of a rotation, and this
      // keeps paid player-profile lookups inside the configured budget.
      const candidates = new Map<string, { name: string; line: number }>();
      props.forEach((prop) => {
        if (prop.market !== "player_points" || !prop.player_id) return;
        if (unavailable.has(prop.player_id)) return;
        const existing = candidates.get(prop.player_id);
        if (!existing) {
          candidates.set(prop.player_id, { name: prop.player_name, line: prop.line });
        } else if (prop.line > existing.line) {
          existing.line = prop.line;
        }
      });

      const selected = [...candidates.entries()]
        .sort((a, b) => b[1].line - a[1].line)
        .slice(0, MAX_PLAYERS_PER_GAME);
      if (selected.length === 0) continue;

      const profiles = await Promise.allSettled(
        selected.map(async ([playerId]) => ({ playerId, form: await espnForm.fetch(playerId) })),
      );

      const expected = teamExpectedPoints(game);
      const modelled = new Map<
        string,
        { form: PlayerForm; side: "home" | "away"; projection: number; recent: number | null; season: number | null; games: number; recentGames: number; line: number }
      >();

      profiles.forEach((result) => {
        if (result.status !== "fulfilled") return;
        const { form } = result.value;
        if (!form) return;
        const side =
          form.team === game.home.abbrev ? "home" : form.team === game.away.abbrev ? "away" : null;
        if (!side) return;
        const line = candidates.get(result.value.playerId)?.line ?? 0;
        const projected = projectionFor(form, line);
        modelled.set(result.value.playerId, {
          form,
          side,
          projection: projected.projection,
          recent: projected.recent,
          season: projected.season,
          games: projected.games,
          recentGames: projected.recentGames,
          line,
        });
      });

      const sums = { home: 0, away: 0 };
      modelled.forEach((entry) => {
        sums[entry.side] += Math.max(0, entry.projection);
      });

      const gameEntries: FirstBasketEntry[] = [];
      modelled.forEach((entry, playerId) => {
        const side = entry.side;
        const teamSum = sums[side];
        const teamExpected = side === "home" ? expected.home : expected.away;
        const scaled =
          teamSum > 0
            ? (Math.max(0, entry.projection) / teamSum) * teamExpected * MODELED_COVERAGE
            : 0;
        const probability = clamp(scaled / (expected.home + expected.away), 0.001, 0.35);
        if (probability < MIN_PROBABILITY) return;

        const usageShare = teamExpected > 0 ? scaled / teamExpected : 0;
        const opponent = side === "home" ? game.away.abbrev : game.home.abbrev;
        const confidence: FirstBasketEntry["confidence"] =
          entry.games >= 40 && entry.recentGames >= 6 ? "medium" : "low";

        const rationale: string[] = [];
        rationale.push(
          entry.recent !== null && entry.season !== null
            ? `Recent form ${entry.recent.toFixed(1)} pts blended with ${entry.season.toFixed(1)} pts last season (${entry.games} GP)`
            : entry.recent !== null
              ? `Recent form ${entry.recent.toFixed(1)} pts over the last ${entry.recentGames} games`
              : entry.season !== null
                ? `Season average ${entry.season.toFixed(1)} pts (${entry.games} GP)`
                : "No player log available; market points line used as the scoring estimate",
        );
        rationale.push(
          `Projected ${scaled.toFixed(1)} pts, ${(usageShare * 100).toFixed(1)}% of ${side === "home" ? game.home.abbrev : game.away.abbrev} scoring`,
        );
        rationale.push(`Game total ${Number(game.line?.total ?? 220)} · fair price ${fairAmericanOdds(probability) > 0 ? "+" : ""}${fairAmericanOdds(probability)}`);
        if (entry.games > 0 && entry.games < 20) {
          rationale.push(`Small sample: only ${entry.games} games last season, so this estimate is less stable.`);
        }

        const status: DataStatus = {
          mode: "live",
          provider: "DunkAPI + ESPN",
          lastUpdated: new Date(),
          message: `First-basket model ${MODEL_VERSION}; graded against ESPN play-by-play.`,
        };

        gameEntries.push({
          id: `${game.game_id}-${playerId}-first-basket`,
          gameId: game.game_id,
          gameDate: new Date(game.date),
          tipoff: new Date(game.starts_at),
          playerId,
          playerName: entry.form.name,
          team: side === "home" ? game.home.abbrev : game.away.abbrev,
          opponent,
          market: "first_basket",
          probability: Number(probability.toFixed(4)),
          fairOdds: fairAmericanOdds(probability),
          projectedPoints: Number(scaled.toFixed(2)),
          usageShare: Number(usageShare.toFixed(4)),
          confidence,
          rationale,
          result: "projected",
          actualScorer: null,
          dataStatus: status,
        });
        playersAnalyzed += 1;
      });

      gameEntries
        .sort((a, b) => b.probability - a.probability)
        .forEach((entry) => {
          // Keep the order stable on the board; rank is implicit in the array.
          entries.push(entry);
        });
    }

    const message =
      entries.length > 0
        ? `First-basket model ${MODEL_VERSION}: ${entries.length} tracked players across ${games.length} game${games.length === 1 ? "" : "s"}.`
        : `First-basket model ${MODEL_VERSION} found no projectable players on this slate.`;

    return {
      entries,
      at: Date.now(),
      message,
      error: null,
      gamesTracked: games.length,
      playersAnalyzed,
      creditsRemaining: dunkapi.status().creditsRemaining,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "DunkAPI failed";
    console.error("[first-basket] generation failed:", reason);
    if (cache) {
      return { ...cache, error: reason, message: `Showing previous tracker. ${reason}` };
    }
    return blank(`First-basket tracker unavailable: ${reason}`, reason, games.length);
  }
}

async function ensure(): Promise<Cache> {
  await hydrate();
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (inflight) return inflight;

  inflight = generate()
    .then((next) => {
      if (next.entries.length === 0 && next.error && cache && cache.entries.length > 0) {
        cache = { ...cache, error: next.error, message: `Showing previous tracker. ${next.error}` };
        return cache;
      }
      cache = next;
      if (next.entries.length > 0) void persist(next);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

async function withResults(entries: FirstBasketEntry[]): Promise<FirstBasketEntry[]> {
  const games = new Map<string, FirstBasketEntry[]>();
  entries.forEach((entry) => {
    const list = games.get(entry.gameId) ?? [];
    list.push(entry);
    games.set(entry.gameId, list);
  });

  const output: FirstBasketEntry[] = [];
  for (const [gameId, gameEntries] of games) {
    const started = new Date(gameEntries[0].tipoff).getTime() <= Date.now();
    const result = started ? await resultsProvider.getGameResult(gameId) : null;

    gameEntries.forEach((entry) => {
      let status: FirstBasketEntry["result"] = "projected";
      let actualScorer: string | null = null;

      if (started) {
        if (result?.firstBasket) {
          actualScorer = result.firstBasket.playerName;
          status = result.firstBasket.playerId === entry.playerId ? "won" : "lost";
        } else {
          status = "pending";
        }
      }

      output.push({
        ...entry,
        result: status,
        actualScorer,
      });
    });
  }

  return output;
}

function statusFrom(current: Cache | null, error: string | null): FirstBasketStatus {
  const dunk = dunkapi.status();
  return {
    configured: dunk.configured,
    provider: "DunkAPI",
    modelVersion: MODEL_VERSION,
    lastUpdated: current ? new Date(current.at) : null,
    message:
      error ??
      current?.message ??
      (dunk.configured
        ? "The first-basket tracker has not run yet."
        : "DUNKAPI_API_KEY is not configured. The first-basket tracker is empty."),
    creditsSpent: dunk.creditsSpent,
    creditsRemaining: dunk.creditsRemaining ?? current?.creditsRemaining ?? null,
    gamesTracked: current?.gamesTracked ?? 0,
    playersAnalyzed: current?.playersAnalyzed ?? 0,
    entriesGenerated: current?.entries.length ?? 0,
  };
}

export const firstBasketProvider = {
  modelVersion: MODEL_VERSION,

  getEntries: async (): Promise<FirstBasketEntry[]> => {
    const current = await ensure();
    return withResults(current.entries);
  },

  getStatus: async (): Promise<FirstBasketStatus> => {
    const current = await ensure();
    return statusFrom(current, current.error);
  },

  clearCache: (): void => {
    cache = null;
  },
};
