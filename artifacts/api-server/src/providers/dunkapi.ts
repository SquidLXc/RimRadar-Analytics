import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = "https://mcp.dunkapi.com/v1";
const CREDITS_FILE = path.join(
  process.env.MODEL_CACHE_DIR ?? path.resolve(process.cwd(), ".data"),
  "credits.json",
);

const COSTS = {
  schedule: 2,
  injuries: 2,
  playerProps: 10,
  player: 5,
} as const;

export class DunkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DunkApiError";
  }
}

export interface DunkGame {
  game_id: string;
  season: number;
  date: string;
  starts_at: string;
  status: string;
  home: { team_id: string; abbrev: string; name: string; score: number | null };
  away: { team_id: string; abbrev: string; name: string; score: number | null };
  venue: string | null;
  line?: {
    books: number;
    home_spread: number | null;
    total: number | null;
    home_ml: number | null;
    away_ml: number | null;
    home_implied_prob: number | null;
  } | null;
}

export interface DunkProp {
  game_id: string;
  game_date: string;
  player_name: string;
  player_id: string | null;
  market: string;
  bookmaker: string;
  line: number;
  over_odds: number;
  under_odds: number;
  captured_at: string;
  source: string;
}

export interface DunkRecentGame {
  game_id: string;
  date: string;
  opponent: string;
  home: boolean;
  result: string;
  minutes: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  tpm: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  did_not_play?: boolean;
  reason?: string | null;
}

export interface DunkPlayer {
  player: {
    player_id: string;
    name: string;
    position: string;
    jersey: string | null;
    team_id: string;
    team: string;
    team_name: string;
  };
  seasons: Array<{
    season: number;
    season_type: string;
    games: number;
    pts: number;
    reb: number;
    ast: number;
    tpm?: number;
    min?: number;
  }>;
  recent_games: DunkRecentGame[];
}

export interface DunkInjury {
  player_id: string;
  name: string;
  position: string;
  team: string;
  status: string;
  type: string;
  detail: string | null;
  return_date: string | null;
}

type DunkStatus = {
  configured: boolean;
  creditsSpent: number;
  creditsRemaining: number | null;
  requests: number;
  lastError: string | null;
};

let creditsSpent = 0;
let creditsRemaining: number | null = null;
let requests = 0;
let lastError: string | null = null;

// Keep the last reported balance across restarts so the Ops page does not
// claim a different number for each model.
try {
  const stored = JSON.parse(readFileSync(CREDITS_FILE, "utf8")) as { remaining?: unknown };
  if (typeof stored.remaining === "number" && Number.isFinite(stored.remaining)) {
    creditsRemaining = stored.remaining;
  }
} catch {
  // No stored balance yet.
}

function recordCredits(remaining: number): void {
  creditsRemaining = remaining;
  try {
    mkdirSync(path.dirname(CREDITS_FILE), { recursive: true });
    writeFileSync(CREDITS_FILE, JSON.stringify({ remaining, at: Date.now() }), "utf8");
  } catch {
    // Balance reporting is best-effort.
  }
}

const MIN_REQUEST_GAP_MS = 400;
const MAX_ATTEMPTS = 3;
let gate: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function apiKey(): string | null {
  const key = process.env.DUNKAPI_API_KEY?.trim();
  return key ? key : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DunkAPI limits request bursts, so every call goes through one queue with a
 * minimum gap and a small retry budget. Firing player lookups in parallel was
 * enough to trip the limiter and silently hollow out the boards.
 */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = gate.then(task, task);
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function requestOnce<T>(tool: string, body: Record<string, unknown>): Promise<T> {
  const key = apiKey();
  if (!key) {
    throw new DunkApiError("DUNKAPI_API_KEY is not configured", 0);
  }

  const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  requests += 1;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/${tool}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    lastError = error instanceof Error ? error.message : "DunkAPI request failed";
    throw error;
  }

  const remaining = Number(response.headers.get("x-credits-remaining"));
  if (Number.isFinite(remaining)) recordCredits(remaining);

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep the HTTP status text.
    }
    lastError = message;
    throw new DunkApiError(message, response.status);
  }

  const payload = (await response.json()) as { data?: T } & T;
  return (payload.data ?? payload) as T;
}

async function call<T>(tool: string, body: Record<string, unknown>): Promise<T> {
  return serialize(async () => {
    let lastFailure: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await requestOnce<T>(tool, body);
      } catch (error) {
        lastFailure = error;
        const retryable =
          error instanceof DunkApiError
            ? error.status === 429 || error.status === 503 || /rate limit/i.test(error.message)
            : false;
        if (!retryable || attempt === MAX_ATTEMPTS) throw error;
        await sleep(2000 * attempt);
      }
    }
    throw lastFailure instanceof Error ? lastFailure : new Error("DunkAPI request failed");
  });
}

const scheduleCache = new Map<number, { value: DunkGame[]; at: number }>();
const scheduleInflight = new Map<number, Promise<DunkGame[]>>();
const propsCache = new Map<string, { value: DunkProp[]; at: number }>();
const propsInflight = new Map<string, Promise<DunkProp[]>>();

const SCHEDULE_TTL = 10 * 60_000;
const PROPS_TTL = 15 * 60_000;

async function fetchScheduleCached(days: number): Promise<DunkGame[]> {
  const hit = scheduleCache.get(days);
  if (hit && Date.now() - hit.at < SCHEDULE_TTL) return hit.value;
  const pending = scheduleInflight.get(days);
  if (pending) return pending;

  const promise = (async () => {
    const data = await call<{ games?: DunkGame[] }>("get_schedule", { days });
    charge(COSTS.schedule);
    const games = data.games ?? [];
    scheduleCache.set(days, { value: games, at: Date.now() });
    return games;
  })().finally(() => scheduleInflight.delete(days));

  scheduleInflight.set(days, promise);
  return promise;
}

async function fetchPlayerPropsCached(gameId: string): Promise<DunkProp[]> {
  const hit = propsCache.get(gameId);
  if (hit && Date.now() - hit.at < PROPS_TTL) return hit.value;
  const pending = propsInflight.get(gameId);
  if (pending) return pending;

  const promise = (async () => {
    const data = await call<{ props?: DunkProp[] }>("get_player_props", { game_id: gameId });
    charge(COSTS.playerProps);
    const props = data.props ?? [];
    propsCache.set(gameId, { value: props, at: Date.now() });
    return props;
  })().finally(() => propsInflight.delete(gameId));

  propsInflight.set(gameId, promise);
  return promise;
}

function charge(amount: number): void {
  creditsSpent += amount;
  lastError = null;
}

export const dunkapi = {
  costs: COSTS,

  isConfigured(): boolean {
    return apiKey() !== null;
  },

  status(): DunkStatus {
    return {
      configured: apiKey() !== null,
      creditsSpent,
      creditsRemaining,
      requests,
      lastError,
    };
  },

  bookTitle(key: string): string {
    const titles: Record<string, string> = {
      draftkings: "DraftKings",
      fanduel: "FanDuel",
      betmgm: "BetMGM",
      espnbet: "ESPN BET",
      pinnacle: "Pinnacle",
      bovada: "Bovada",
      betonlineag: "BetOnline.ag",
      caesars: "Caesars",
      betrivers: "BetRivers",
      pointsbet: "PointsBet",
    };
    return titles[key] ?? key.replace(/(^|_)([a-z])/g, (_, _prefix, letter: string) => letter.toUpperCase());
  },

  fetchSchedule: (days = 2): Promise<DunkGame[]> => fetchScheduleCached(days),

  fetchScheduleUncached: async (days = 2): Promise<DunkGame[]> => {
    const data = await call<{ games?: DunkGame[] }>("get_schedule", { days });
    charge(COSTS.schedule);
    return data.games ?? [];
  },

  fetchPlayerProps: (gameId: string): Promise<DunkProp[]> => fetchPlayerPropsCached(gameId),

  fetchPlayerPropsUncached: async (gameId: string): Promise<DunkProp[]> => {
    const data = await call<{ props?: DunkProp[] }>("get_player_props", { game_id: gameId });
    charge(COSTS.playerProps);
    return data.props ?? [];
  },

  async fetchPlayer(playerId: string): Promise<DunkPlayer> {
    const data = await call<DunkPlayer>("get_player", { player_id: playerId });
    charge(COSTS.player);
    return data;
  },

  async fetchInjuries(): Promise<DunkInjury[]> {
    const data = await call<{ injuries?: DunkInjury[] }>("get_injuries", {});
    charge(COSTS.injuries);
    return data.injuries ?? [];
  },

  clearCache(): void {
    scheduleCache.clear();
    propsCache.clear();
  },
};
