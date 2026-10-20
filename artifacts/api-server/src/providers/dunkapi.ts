const BASE_URL = "https://mcp.dunkapi.com/v1";

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
  requests: number;
  lastError: string | null;
};

let creditsSpent = 0;
let requests = 0;
let lastError: string | null = null;

function apiKey(): string | null {
  const key = process.env.DUNKAPI_API_KEY?.trim();
  return key ? key : null;
}

async function call<T>(tool: string, body: Record<string, unknown>): Promise<T> {
  const key = apiKey();
  if (!key) {
    throw new DunkApiError("DUNKAPI_API_KEY is not configured", 0);
  }

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

  async fetchSchedule(days = 2): Promise<DunkGame[]> {
    const data = await call<{ games?: DunkGame[] }>("get_schedule", { days });
    charge(COSTS.schedule);
    return data.games ?? [];
  },

  async fetchPlayerProps(gameId: string): Promise<DunkProp[]> {
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
};
