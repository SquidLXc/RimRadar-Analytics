import type {
  Game,
  OddsFeed,
  OddsGame,
  OddsMarket,
  OddsOutcome,
  Player,
  Sportsbook,
  Team,
} from "@workspace/api-zod";

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const COMMON_API = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const STANDINGS_API = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

/**
 * Conference and division are stable league facts, not provider data. ESPN only
 * supplies them through separate endpoints, so they are mapped here instead of
 * being inferred from team names.
 */
const TEAM_META: Record<string, { conference: "East" | "West"; division: string }> = {
  ATL: { conference: "East", division: "Southeast" },
  BOS: { conference: "East", division: "Atlantic" },
  BKN: { conference: "East", division: "Atlantic" },
  CHA: { conference: "East", division: "Southeast" },
  CHI: { conference: "East", division: "Central" },
  CLE: { conference: "East", division: "Central" },
  DAL: { conference: "West", division: "Southwest" },
  DEN: { conference: "West", division: "Northwest" },
  DET: { conference: "East", division: "Central" },
  GS: { conference: "West", division: "Pacific" },
  HOU: { conference: "West", division: "Southwest" },
  IND: { conference: "East", division: "Central" },
  LAC: { conference: "West", division: "Pacific" },
  LAL: { conference: "West", division: "Pacific" },
  MEM: { conference: "West", division: "Southwest" },
  MIA: { conference: "East", division: "Southeast" },
  MIL: { conference: "East", division: "Central" },
  MIN: { conference: "West", division: "Northwest" },
  NO: { conference: "West", division: "Southwest" },
  NY: { conference: "East", division: "Atlantic" },
  OKC: { conference: "West", division: "Northwest" },
  ORL: { conference: "East", division: "Southeast" },
  PHI: { conference: "East", division: "Atlantic" },
  PHX: { conference: "West", division: "Pacific" },
  POR: { conference: "West", division: "Northwest" },
  SAC: { conference: "West", division: "Pacific" },
  SA: { conference: "West", division: "Southwest" },
  TOR: { conference: "East", division: "Atlantic" },
  UTAH: { conference: "West", division: "Northwest" },
  WSH: { conference: "East", division: "Southeast" },
};

export interface TeamRecord {
  wins: number | null;
  losses: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
}

export interface InjuryAlert {
  id: string;
  athleteId: string;
  athleteName: string;
  status: string;
  detail: string;
  teamName: string;
  teamId: string | null;
  date: string;
}

function hexColor(value: unknown, fallback = "#1d428a"): string {
  return typeof value === "string" && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : fallback;
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function american(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^-0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "rimradar/1.0 (+https://github.com)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`ESPN request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

const LEAGUE_TIME_ZONE = "America/New_York";

/** The NBA schedules by Eastern time, so "today" must not roll over at UTC midnight. */
export function leagueDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function espnDate(date: Date): string {
  return leagueDate(date).replace(/-/g, "");
}

export class ESPNAdapter {
  toTeam(raw: any): Team {
    const abbreviation: string = raw?.abbreviation ?? "NBA";
    const meta = TEAM_META[abbreviation];
    const logo =
      raw?.logos?.find?.((logo: any) => logo?.href)?.href ??
      raw?.logo ??
      `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation.toLowerCase()}.png`;

    return {
      id: String(raw?.id ?? abbreviation),
      abbreviation,
      name: raw?.name ?? raw?.shortDisplayName ?? raw?.displayName ?? abbreviation,
      city: raw?.location ?? raw?.displayName?.replace(raw?.name ?? "", "").trim() ?? "",
      conference: meta?.conference ?? "East",
      division: meta?.division ?? "Unknown",
      color: hexColor(raw?.color ?? raw?.primaryColor),
      logoUrl: logo ?? null,
    };
  }

  async fetchTeams(): Promise<Team[]> {
    const data = await getJson(`${SITE_API}/teams`);
    const rows: any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    return rows.map((row) => this.toTeam(row.team)).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  }

  async fetchGames(date?: Date): Promise<Game[]> {
    const url = new URL(`${SITE_API}/scoreboard`);
    if (date) url.searchParams.set("dates", espnDate(date));
    const data = await getJson(url.toString());
    const events: any[] = data?.events ?? [];
    return events.map((event) => this.toGame(event)).filter((game): game is Game => game !== null);
  }

  async fetchFutureGames(days = 7): Promise<Game[]> {
    const [year, month, day] = leagueDate().split("-").map(Number);
    const dates = Array.from({ length: days }, (_, index) => {
      const next = new Date(Date.UTC(year, month - 1, day + index, 12));
      return next;
    });

    const results = await Promise.allSettled(dates.map((date) => this.fetchGames(date)));
    const seen = new Set<string>();
    const games: Game[] = [];
    results.forEach((result) => {
      if (result.status !== "fulfilled") return;
      result.value.forEach((game) => {
        if (seen.has(game.id)) return;
        seen.add(game.id);
        games.push(game);
      });
    });
    return games.sort((a, b) => a.tipoff.getTime() - b.tipoff.getTime());
  }

  toGame(event: any): Game | null {
    const competition = event?.competitions?.[0];
    const competitors: any[] = competition?.competitors ?? [];
    const home = competitors.find((row) => row.homeAway === "home");
    const away = competitors.find((row) => row.homeAway === "away");
    if (!home || !away) return null;

    const state: string = event?.status?.type?.state ?? "pre";
    const status: Game["status"] = state === "in" ? "live" : state === "post" ? "final" : "scheduled";
    const played = status !== "scheduled";
    const tipoff = new Date(event.date);

    return {
      id: String(event.id),
      date: tipoff,
      tipoff,
      status,
      homeTeam: this.toTeam(home.team),
      awayTeam: this.toTeam(away.team),
      homeScore: played ? num(home.score) : null,
      awayScore: played ? num(away.score) : null,
      period: status === "live" ? num(event?.status?.period) : null,
      clock: status === "live" ? (event?.status?.displayClock ?? null) : null,
      venue: competition?.venue?.fullName ?? null,
    };
  }

  async fetchOdds(games: Game[]): Promise<OddsFeed> {
    if (games.length === 0) {
      return { configured: false, provider: null, priceType: "American", games: [] };
    }

    const todayKey = leagueDate();
    const todayGames = games.filter((game) => leagueDate(game.date) === todayKey);
    const queryGames = todayGames.length > 0 ? todayGames : games;
    const data = await getJson(`${SITE_API}/scoreboard`);
    const events: any[] = data?.events ?? [];
    const gamesById = new Map(queryGames.map((game) => [game.id, game]));

    const feedGames: OddsGame[] = [];
    const providerNames = new Set<string>();

    events.forEach((event) => {
      const game = gamesById.get(String(event.id));
      const competition = event?.competitions?.[0];
      if (!game || !competition) return;

      const books: Sportsbook[] = [];
      (competition.odds ?? []).forEach((line: any) => {
        const title: string = line?.provider?.displayName ?? line?.provider?.name ?? "Sportsbook";
        const markets: OddsMarket[] = [];

        const awayPrice = american(line?.moneyline?.away?.close?.odds ?? line?.moneyline?.away?.open?.odds);
        const homePrice = american(line?.moneyline?.home?.close?.odds ?? line?.moneyline?.home?.open?.odds);
        if (awayPrice !== null && homePrice !== null) {
          markets.push({
            key: "moneyline",
            label: "Moneyline",
            outcomes: [
              { name: game.awayTeam.abbreviation, price: awayPrice, point: null },
              { name: game.homeTeam.abbreviation, price: homePrice, point: null },
            ],
          });
        }

        const awaySpread = num(line?.pointSpread?.away?.close?.line ?? line?.pointSpread?.away?.open?.line);
        const homeSpread = num(line?.pointSpread?.home?.close?.line ?? line?.pointSpread?.home?.open?.line);
        const awaySpreadPrice = american(line?.pointSpread?.away?.close?.odds ?? line?.pointSpread?.away?.open?.odds);
        const homeSpreadPrice = american(line?.pointSpread?.home?.close?.odds ?? line?.pointSpread?.home?.open?.odds);
        if (awaySpread !== null && homeSpread !== null && awaySpreadPrice !== null && homeSpreadPrice !== null) {
          markets.push({
            key: "spread",
            label: "Spread",
            outcomes: [
              { name: game.awayTeam.abbreviation, price: awaySpreadPrice, point: awaySpread },
              { name: game.homeTeam.abbreviation, price: homeSpreadPrice, point: homeSpread },
            ],
          });
        }

        const overLine = num(String(line?.total?.over?.close?.line ?? line?.total?.over?.open?.line ?? "").replace(/[^0-9.]/g, ""));
        const underLine = num(String(line?.total?.under?.close?.line ?? line?.total?.under?.open?.line ?? "").replace(/[^0-9.]/g, ""));
        const overPrice = american(line?.total?.over?.close?.odds ?? line?.total?.over?.open?.odds);
        const underPrice = american(line?.total?.under?.close?.odds ?? line?.total?.under?.open?.odds);
        const totalLine = num(line?.overUnder) ?? overLine ?? underLine;
        if (totalLine !== null && overPrice !== null && underPrice !== null) {
          markets.push({
            key: "total",
            label: "Total",
            outcomes: [
              { name: "Over", price: overPrice, point: totalLine },
              { name: "Under", price: underPrice, point: totalLine },
            ],
          });
        }

        if (markets.length === 0) return;
        providerNames.add(title);
        books.push({
          key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          title,
          lastUpdate: data?.events?.[0]?.competitions?.[0]?.odds?.[0]?.lastUpdate ?? null,
          markets,
        });
      });

      if (books.length > 0) feedGames.push({ game, sportsbooks: books });
    });

    return {
      configured: feedGames.length > 0,
      provider: providerNames.size > 0 ? [...providerNames].join(", ") : "ESPN",
      priceType: "American",
      games: feedGames,
    };
  }

  async fetchTeamRecords(): Promise<Map<string, TeamRecord>> {
    const data = await getJson(STANDINGS_API);
    const records = new Map<string, TeamRecord>();
    const conferences: any[] = data?.children ?? [];

    conferences.forEach((conference) => {
      (conference?.standings?.entries ?? []).forEach((entry: any) => {
        const stats: any[] = entry?.stats ?? [];
        const stat = (name: string) => num(stats.find((row) => row.name === name)?.value);
        records.set(String(entry?.team?.id), {
          wins: stat("wins"),
          losses: stat("losses"),
          pointsFor: stat("avgPointsFor"),
          pointsAgainst: stat("avgPointsAgainst"),
        });
      });
    });

    return records;
  }

  async fetchRoster(teamId: string): Promise<Player[]> {
    const [roster, teams] = await Promise.all([getJson(`${SITE_API}/teams/${teamId}/roster`), this.fetchTeams()]);
    const team = teams.find((row) => row.id === teamId || row.abbreviation === teamId.toUpperCase());
    if (!team) return [];

    return (roster?.athletes ?? []).map((athlete: any) => this.toPlayer(athlete, team));
  }

  async fetchAllPlayers(): Promise<Player[]> {
    const teams = await this.fetchTeams();
    const rosters = await Promise.allSettled(teams.map((team) => this.fetchRoster(team.id)));
    const players: Player[] = [];
    rosters.forEach((result) => {
      if (result.status === "fulfilled") players.push(...result.value);
    });
    return players;
  }

  toPlayer(athlete: any, team: Team): Player {
    return {
      id: String(athlete?.id ?? ""),
      name: athlete?.fullName ?? athlete?.displayName ?? "Unknown player",
      team,
      position: athlete?.position?.abbreviation ?? athlete?.position?.name ?? "—",
      jerseyNumber: athlete?.jersey ?? null,
      status: athlete?.status?.name ?? "Active",
      headshotUrl: athlete?.headshot?.href ?? null,
      points: null,
      rebounds: null,
      assists: null,
      threes: null,
      steals: null,
      blocks: null,
      turnovers: null,
      minutes: null,
      usageRate: null,
    };
  }

  async fetchAthlete(athleteId: string): Promise<{
    player: Player;
    seasonLabel: string | null;
  } | null> {
    const [profile, stats] = await Promise.allSettled([
      getJson(`${COMMON_API}/athletes/${athleteId}`),
      getJson(`${COMMON_API}/athletes/${athleteId}/stats`),
    ]);

    if (profile.status !== "fulfilled") return null;
    const athlete = profile.value?.athlete;
    if (!athlete) return null;

    const teams = await this.fetchTeams();
    const teamId = String(athlete?.team?.id ?? "");
    const fallbackTeam = teams.find((team) => team.id === teamId) ?? teams[0];
    const player: Player = this.toPlayer(
      {
        ...athlete,
        status: athlete?.status?.name ? athlete : { status: { name: "Active" } },
      },
      fallbackTeam,
    );

    let seasonLabel: string | null = null;
    if (stats.status === "fulfilled") {
      const averages = (stats.value?.categories ?? []).find((category: any) => category?.name === "averages");
      const rows: any[] = averages?.statistics ?? [];
      const latest = rows[rows.length - 1];
      if (latest) {
        seasonLabel = latest?.season?.displayName ?? null;
        const values = latest?.stats ?? [];
        const at = (index: number) => num(values[index]);
        player.points = at(17);
        player.minutes = at(2);
        player.threes = num(String(values[5] ?? "").split("-")[0]);
        player.rebounds = at(11);
        player.assists = at(12);
        player.blocks = at(13);
        player.steals = at(14);
        player.turnovers = at(16);
        player.team = teams.find((team) => team.id === String(latest?.teamId)) ?? player.team;
      }
    }

    return { player, seasonLabel };
  }

  async fetchInjuries(): Promise<InjuryAlert[]> {
    const data = await getJson(`${SITE_API}/injuries`);
    const groups: any[] = data?.injuries ?? [];
    const alerts: InjuryAlert[] = [];

    groups.forEach((group) => {
      const teamName: string = group?.displayName ?? group?.team?.displayName ?? "NBA";
      const teamId = group?.team?.id ? String(group.team.id) : null;
      (group?.injuries ?? []).forEach((injury: any) => {
        const athlete = injury?.athlete ?? {};
        alerts.push({
          id: `injury-${teamId ?? "team"}-${athlete.id ?? injury?.id}`,
          athleteId: String(athlete.id ?? ""),
          athleteName: athlete.displayName ?? "Unknown player",
          status: injury?.status ?? "Status unknown",
          detail: injury?.shortComment ?? injury?.longComment ?? "",
          teamName,
          teamId,
          date: injury?.date ?? new Date().toISOString(),
        });
      });
    });

    return alerts.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export const espnAdapter = new ESPNAdapter();
