/**
 * Free player form from ESPN: season averages plus recent game logs. DunkAPI is
 * reserved for the priced prop lines; the expensive per-player profile endpoint
 * is rate limited and was making both models fail in bursts.
 */
const COMMON_API = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const FORM_TTL = 60 * 60_000;

export type FormGame = {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
};

export type PlayerSeason = {
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
};

export type PlayerForm = {
  id: string;
  name: string;
  team: string;
  position: string;
  season: PlayerSeason | null;
  recent: FormGame[];
};

const cache = new Map<string, { value: PlayerForm; at: number }>();
const inflight = new Map<string, Promise<PlayerForm | null>>();

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function made(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "").split("-")[0] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`ESPN ${response.status} for ${url}`);
  return response.json();
}

function readSeason(payload: any): PlayerSeason | null {
  const averages = (payload?.categories ?? []).find((category: any) => category?.name === "averages");
  const rows: any[] = averages?.statistics ?? [];
  const latest = rows[rows.length - 1];
  if (!latest) return null;
  const values: unknown[] = latest.stats ?? [];
  const at = (index: number) => number(values[index]);
  const points = at(17);
  if (points === null) return null;
  return {
    games: at(0) ?? 0,
    minutes: at(2) ?? 0,
    points,
    rebounds: at(11) ?? 0,
    assists: at(12) ?? 0,
    threes: made(values[5]),
  };
}

function readRecent(payload: any): FormGame[] {
  const labels: string[] = payload?.labels ?? [];
  const index = (label: string) => labels.findIndex((item) => item.toUpperCase() === label);
  const minutesIndex = index("MIN");
  const pointsIndex = index("PTS");
  const reboundsIndex = index("REB");
  const assistsIndex = index("AST");
  const threesIndex = index("3PT");
  if (pointsIndex < 0 || minutesIndex < 0) return [];

  const seasonTypes: any[] = payload?.seasonTypes ?? [];
  const regular =
    seasonTypes.find((entry) => /regular season/i.test(String(entry?.displayName ?? ""))) ??
    seasonTypes[0];
  const events: any[] = (regular?.categories ?? []).flatMap((category: any) => category?.events ?? []);

  return events
    .map((event) => {
      const stats: unknown[] = event?.stats ?? [];
      const minutes = number(stats[minutesIndex]) ?? 0;
      const points = number(stats[pointsIndex]);
      if (points === null) return null;
      return {
        minutes,
        points,
        rebounds: reboundsIndex >= 0 ? number(stats[reboundsIndex]) ?? 0 : 0,
        assists: assistsIndex >= 0 ? number(stats[assistsIndex]) ?? 0 : 0,
        threes: threesIndex >= 0 ? made(stats[threesIndex]) : 0,
      } satisfies FormGame;
    })
    .filter((game): game is FormGame => game !== null && game.minutes > 0)
    .slice(0, 10);
}

async function load(athleteId: string): Promise<PlayerForm | null> {
  const [profile, stats, gamelog] = await Promise.allSettled([
    getJson(`${COMMON_API}/athletes/${athleteId}`),
    getJson(`${COMMON_API}/athletes/${athleteId}/stats`),
    getJson(`${COMMON_API}/athletes/${athleteId}/gamelog`),
  ]);

  if (profile.status !== "fulfilled") return null;
  const athlete = profile.value?.athlete;
  if (!athlete) return null;

  const season = stats.status === "fulfilled" ? readSeason(stats.value) : null;
  const recent = gamelog.status === "fulfilled" ? readRecent(gamelog.value) : [];

  return {
    id: athleteId,
    name: String(athlete.displayName ?? athlete.fullName ?? "Unknown player"),
    team: String(athlete?.team?.abbreviation ?? ""),
    position: String(athlete?.position?.abbreviation ?? ""),
    season,
    recent,
  };
}

export const espnForm = {
  async fetch(athleteId: string): Promise<PlayerForm | null> {
    const cached = cache.get(athleteId);
    if (cached && Date.now() - cached.at < FORM_TTL) return cached.value;

    const pending = inflight.get(athleteId);
    if (pending) return pending;

    const promise = load(athleteId)
      .then((value) => {
        if (value) cache.set(athleteId, { value, at: Date.now() });
        return value;
      })
      .catch((error) => {
        console.error(
          `[espn-form] ${athleteId} failed:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      })
      .finally(() => {
        inflight.delete(athleteId);
      });

    inflight.set(athleteId, promise);
    return promise;
  },

  clearCache(): void {
    cache.clear();
  },
};
