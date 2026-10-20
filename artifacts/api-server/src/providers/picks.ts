import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataStatus, Pick, PicksStatus, Prop } from "@workspace/api-zod";
import { dunkapi, DunkApiError, type DunkGame, type DunkProp } from "./dunkapi";
import { espnAdapter } from "./espn";
import { espnForm, type PlayerForm } from "./espnForm";

const MODEL_VERSION = "rimraider-v1";

const CACHE_MS = Math.max(15, Number(process.env.DUNKAPI_CACHE_MINUTES ?? 360)) * 60_000;
const MAX_GAMES = Math.max(1, Math.min(5, Number(process.env.DUNKAPI_MAX_GAMES ?? 1)));
const MAX_PLAYERS = Math.max(1, Math.min(25, Number(process.env.DUNKAPI_MAX_PLAYERS ?? 6)));
const MIN_EDGE = Math.max(0, Number(process.env.DUNKAPI_MIN_EDGE ?? 0.025));
const MAX_PICKS = Math.max(1, Math.min(40, Number(process.env.DUNKAPI_MAX_PICKS ?? 12)));

type MarketKey = "points" | "rebounds" | "assists" | "threes";

type MarketSpec = {
  key: MarketKey;
  label: string;
  field: "points" | "rebounds" | "assists" | "threes";
  floor: number;
  seasonField: "points" | "rebounds" | "assists" | null;
};

const MARKETS: Record<string, MarketSpec> = {
  player_points: { key: "points", label: "points", field: "points", floor: 3.4, seasonField: "points" },
  player_rebounds: { key: "rebounds", label: "rebounds", field: "rebounds", floor: 2.0, seasonField: "rebounds" },
  player_assists: { key: "assists", label: "assists", field: "assists", floor: 1.6, seasonField: "assists" },
  player_threes: { key: "threes", label: "threes", field: "threes", floor: 0.8, seasonField: null },
};

type PickCache = {
  picks: Pick[];
  at: number;
  message: string;
  error: string | null;
  slateGames: number;
  playersAnalyzed: number;
  creditsRemaining: number | null;
};

const CACHE_FILE = path.join(
  process.env.MODEL_CACHE_DIR ?? path.resolve(process.cwd(), ".data"),
  "picks-cache.json",
);

let cache: PickCache | null = null;
let inflight: Promise<PickCache> | null = null;
let hydration: Promise<void> | null = null;

function revive(cached: PickCache): PickCache {
  return {
    ...cached,
    picks: cached.picks.map((pick) => ({
      ...pick,
      dataStatus: {
        ...pick.dataStatus,
        lastUpdated: pick.dataStatus.lastUpdated ? new Date(pick.dataStatus.lastUpdated) : null,
      },
    })),
  };
}

function hydrate(): Promise<void> {
  // Concurrent status and board requests must share one hydration attempt.
  // Otherwise the second request can miss the still-loading cache and start a
  // paid regeneration.
  hydration ??= (async () => {
    try {
      const parsed = JSON.parse(await readFile(CACHE_FILE, "utf8")) as PickCache;
      if (Array.isArray(parsed?.picks) && Date.now() - parsed.at < CACHE_MS) {
        cache = revive(parsed);
      }
    } catch {
      // No cache file yet, or it is unreadable: generate normally.
    }
  })();
  return hydration;
}

async function persist(value: PickCache): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(value), "utf8");
  } catch (error) {
    console.error("[picks] could not persist cache:", error instanceof Error ? error.message : error);
  }
}

function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function devigOverProbability(overOdds: number, underOdds: number): number {
  const over = 1 / americanToDecimal(overOdds);
  const under = 1 / americanToDecimal(underOdds);
  const total = over + under;
  return total > 0 ? over / total : 0.5;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function normalCdf(value: number): number {
  // Abramowitz and Stegun 7.1.26
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function recencyWeightedMean(values: number[]): number {
  const weights = values.map((_, index) => Math.exp(-index / 4));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  return values.reduce((total, value, index) => total + value * weights[index], 0) / weightTotal;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function groupLines(props: DunkProp[]): Array<{ prop: DunkProp; spec: MarketSpec }> {
  const supported = props.filter((prop) => MARKETS[prop.market] && prop.player_id && Number.isFinite(prop.line));
  const groups = new Map<string, DunkProp[]>();

  supported.forEach((prop) => {
    const key = `${prop.player_id}:${prop.market}`;
    const list = groups.get(key) ?? [];
    list.push(prop);
    groups.set(key, list);
  });

  return [...groups.values()].map((list) => {
    // Compare prices only at the line the most books quote. Taking the best
    // price from a stray line would pair an odds with a number that book does
    // not actually offer.
    const counts = new Map<number, number>();
    list.forEach((prop) => counts.set(prop.line, (counts.get(prop.line) ?? 0) + 1));
    const center = median(list.map((prop) => prop.line));
    const consensus = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || Math.abs(a[0] - center) - Math.abs(b[0] - center),
    )[0][0];
    const atLine = list.filter((prop) => prop.line === consensus);
    const best = [...atLine].sort((a, b) => b.over_odds - a.over_odds)[0];
    return { prop: best, spec: MARKETS[best.market] };
  });
}

function valuesFor(form: PlayerForm, spec: MarketSpec): number[] {
  return form.recent
    .filter((game) => game.minutes > 0)
    .slice(0, 10)
    .map((game) => game[spec.field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function seasonBaseline(form: PlayerForm, spec: MarketSpec): number | null {
  if (!spec.seasonField) return null;
  const season = form.season;
  if (!season || season.games < 3) return null;
  const value = season[spec.seasonField];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPick(options: {
  group: { prop: DunkProp; spec: MarketSpec };
  form: PlayerForm;
  game: DunkGame;
  rank: number;
}): Pick | null {
  const { group, form, game, rank } = options;
  const { prop, spec } = group;
  const values = valuesFor(form, spec);
  if (values.length < 3) return null;

  const recent = recencyWeightedMean(values);
  const baseline = seasonBaseline(form, spec);
  const projection = baseline !== null ? recent * 0.72 + baseline * 0.28 : recent;

  // Small season samples (injury returns, trades, rookies) mean the baseline
  // and spread are less trustworthy, so widen the distribution and demand a
  // larger edge before surfacing the pick.
  const seasonGames = form.season?.games ?? 0;
  const sampleWidth = seasonGames >= 40 ? 1 : seasonGames >= 20 ? 1.1 : 1.25;
  const requiredEdge = seasonGames >= 20 ? MIN_EDGE : Math.max(MIN_EDGE, 0.06);

  const spread = stdev(values);
  const deviation = Math.max(spread, spec.floor) * sampleWidth;
  const overProbability = clamp(1 - normalCdf((prop.line + 0.5 - projection) / deviation), 0.01, 0.99);

  const implied = devigOverProbability(prop.over_odds, prop.under_odds);
  const edge = overProbability - implied;
  if (edge < requiredEdge || overProbability > 0.94 || overProbability < 0.3) return null;

  const hitCount = values.filter((value) => value > prop.line).length;
  const confidence: Pick["confidence"] =
    seasonGames < 20
      ? "low"
      : edge >= 0.06 && values.length >= 6
        ? "high"
        : edge >= 0.035
          ? "medium"
          : "low";

  const isHome = form.team === game.home.abbrev;
  const team = isHome ? game.home.abbrev : game.away.abbrev;
  const opponent = isHome ? game.away.abbrev : game.home.abbrev;
  const book = dunkapi.bookTitle(prop.bookmaker);
  const status: DataStatus = {
    mode: "live",
    provider: "DunkAPI",
    lastUpdated: new Date(),
    message: `RimRaider model ${MODEL_VERSION}; props from ${book}.`,
  };

  const rationale = [
    `Last ${values.length}: ${recent.toFixed(1)} ${spec.label} (${hitCount}/${values.length} over ${prop.line})`,
    `Model ${(overProbability * 100).toFixed(1)}% over vs market ${(implied * 100).toFixed(1)}%`,
    `Best price ${formatOdds(prop.over_odds)} at ${book}`,
  ];
  if (baseline !== null) rationale.push(`Season baseline ${baseline.toFixed(1)} ${spec.label} (${seasonGames} GP)`);
  if (seasonGames > 0 && seasonGames < 20) {
    rationale.push(`Small sample: only ${seasonGames} games last season, so the model widens its range.`);
  }

  return {
    id: `${prop.game_id}-${prop.player_id}-${spec.key}`,
    playerId: String(prop.player_id),
    playerName: prop.player_name || form.name,
    team,
    opponent,
    market: spec.key,
    line: prop.line,
    projection: Number(projection.toFixed(2)),
    overProbability: Number(overProbability.toFixed(4)),
    overOdds: prop.over_odds,
    underOdds: prop.under_odds,
    sportsbook: book,
    edge: Number(edge.toFixed(4)),
    confidence,
    rationale,
    dataStatus: status,
    rank,
    signalScore: Math.round(clamp(45 + edge * 250, 1, 100)),
  };
}

function buildStatus(cacheValue: PickCache | null, error: string | null): PicksStatus {
  const dunk = dunkapi.status();
  return {
    configured: dunk.configured,
    provider: "DunkAPI",
    modelVersion: MODEL_VERSION,
    lastUpdated: cacheValue ? new Date(cacheValue.at) : null,
    message:
      error ??
      cacheValue?.message ??
      (dunk.configured
        ? "Picks have not been generated yet."
        : "DUNKAPI_API_KEY is not configured. Radar Picks is empty."),
    creditsSpent: dunk.creditsSpent,
    creditsRemaining: dunk.creditsRemaining ?? cacheValue?.creditsRemaining ?? null,
    slateGames: cacheValue?.slateGames ?? 0,
    playersAnalyzed: cacheValue?.playersAnalyzed ?? 0,
    picksGenerated: cacheValue?.picks.length ?? 0,
  };
}

async function generate(): Promise<PickCache> {
  const startedAt = Date.now();
  const blank = (message: string, error: string | null, games = 0): PickCache => ({
    picks: [],
    at: Date.now(),
    message,
    error,
    slateGames: games,
    playersAnalyzed: 0,
    creditsRemaining: dunkapi.status().creditsRemaining,
  });

  if (!dunkapi.isConfigured()) {
    return blank("DUNKAPI_API_KEY is not configured. Radar Picks is empty.", "not_configured");
  }

  let games: DunkGame[] = [];
  try {
    const schedule = await dunkapi.fetchSchedule(2);
    games = schedule
      .filter((game) => game.status === "scheduled")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, MAX_GAMES);
    if (games.length === 0) {
      return blank("No upcoming games were returned by DunkAPI.", null);
    }

    // ESPN's injury feed is free and indexed by the same athlete IDs the props
    // use, so it avoids another paid DunkAPI call.
    const injuries = await espnAdapter.fetchInjuries().catch((error): Array<{ athleteId: string; status: string }> => {
      console.error("[picks] ESPN injuries unavailable", error instanceof Error ? error.message : error);
      return [];
    });
    const unavailable = new Set(
      injuries
        .filter((injury) => /out|suspended|ineligible/i.test(injury.status))
        .map((injury) => injury.athleteId),
    );

    const propsByGame: Array<{ game: DunkGame; props: DunkProp[] }> = [];
    for (const game of games) {
      try {
        propsByGame.push({ game, props: await dunkapi.fetchPlayerProps(game.game_id) });
      } catch (error) {
        console.error(`[picks] props failed for ${game.game_id}`, error instanceof Error ? error.message : error);
      }
    }
    if (propsByGame.length === 0) {
      return blank("DunkAPI did not return player props for the current slate.", "props_unavailable", games.length);
    }

    // Rank candidates before paying for player profiles: highest point line
    // first, then most markets quoted. This keeps the model within budget.
    const candidates = new Map<string, { name: string; game: DunkGame; pointsLine: number; markets: number }>();
    propsByGame.forEach(({ game, props }) => {
      props.forEach((prop) => {
        if (!prop.player_id || !MARKETS[prop.market]) return;
        if (unavailable.has(prop.player_id)) return;
        const existing = candidates.get(prop.player_id!) ?? {
          name: prop.player_name,
          game,
          pointsLine: 0,
          markets: 0,
        };
        existing.markets += 1;
        if (prop.market === "player_points") existing.pointsLine = Math.max(existing.pointsLine, prop.line);
        candidates.set(prop.player_id!, existing);
      });
    });

    const selected = [...candidates.entries()]
      .sort((a, b) => b[1].pointsLine - a[1].pointsLine || b[1].markets - a[1].markets)
      .slice(0, MAX_PLAYERS);

    const profiles = await Promise.allSettled(
      selected.map(async ([playerId, candidate]) => ({
        playerId,
        expectedName: candidate.name,
        form: await espnForm.fetch(playerId),
      })),
    );

    const groups = new Map<string, { game: DunkGame; lines: Array<{ prop: DunkProp; spec: MarketSpec }> }>();
    propsByGame.forEach(({ game, props }) => {
      groupLines(props).forEach((line) => {
        const playerId = String(line.prop.player_id);
        const entry = groups.get(playerId) ?? { game, lines: [] };
        entry.lines.push(line);
        groups.set(playerId, entry);
      });
    });

    const picks: Pick[] = [];
    let playersAnalyzed = 0;
    profiles.forEach((result) => {
      if (result.status !== "fulfilled") {
        console.error("[picks] player profile failed", result.reason instanceof Error ? result.reason.message : result.reason);
        return;
      }
      const { playerId, form } = result.value;
      const entry = groups.get(playerId);
      if (!entry || !form) return;
      if (form.team !== entry.game.home.abbrev && form.team !== entry.game.away.abbrev) return;
      playersAnalyzed += 1;

      entry.lines.forEach((line) => {
        const pick = buildPick({ group: line, form, game: entry.game, rank: picks.length + 1 });
        if (pick) picks.push(pick);
      });
    });

    const ranked = picks
      .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
      .slice(0, MAX_PICKS)
      .map((pick, index) => ({ ...pick, rank: index + 1 }));

    const message =
      ranked.length > 0
        ? `RimRaider model ${MODEL_VERSION}: ${ranked.length} picks from ${playersAnalyzed} players across ${games.length} game${games.length === 1 ? "" : "s"}.`
        : `RimRaider model ${MODEL_VERSION} found no edges above ${(MIN_EDGE * 100).toFixed(1)}%.`;

    return {
      picks: ranked,
      at: Date.now(),
      message,
      error: null,
      slateGames: games.length,
      playersAnalyzed,
      creditsRemaining: dunkapi.status().creditsRemaining,
    };
  } catch (error) {
    const reason = error instanceof DunkApiError ? error.message : error instanceof Error ? error.message : "DunkAPI failed";
    console.error(`[picks] generation failed after ${Date.now() - startedAt}ms:`, reason);
    if (cache) {
      return { ...cache, error: reason, message: `Showing previous picks. ${reason}` };
    }
    return blank(`Radar Picks unavailable: ${reason}`, reason, games.length);
  }
}

async function ensurePicks(): Promise<PickCache> {
  await hydrate();
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (inflight) return inflight;

  inflight = generate()
    .then((next) => {
      // A failed refresh keeps the last good board instead of blanking the page.
      if (next.picks.length === 0 && next.error && cache && cache.picks.length > 0) {
        cache = { ...cache, error: next.error, message: `Showing previous picks. ${next.error}` };
        return cache;
      }
      cache = next;
      if (next.picks.length > 0) void persist(next);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export const picksProvider = {
  modelVersion: MODEL_VERSION,

  getPicks: async (): Promise<Pick[]> => (await ensurePicks()).picks,

  getProps: async (): Promise<Prop[]> => (await ensurePicks()).picks,

  getStatus: async (): Promise<PicksStatus> => {
    const current = await ensurePicks();
    return buildStatus(current, current.error);
  },

  getCachedStatus: (): PicksStatus => buildStatus(cache, cache?.error ?? null),

  clearCache: (): void => {
    cache = null;
  },
};
