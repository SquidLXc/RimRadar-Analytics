import type {
  AuditRecord,
  DataStatus,
  Game,
  GameLog,
  LiveAlerts,
  Matchup,
  ModelPerformance,
  Player,
  PlayerDetail,
  Prop,
  Snipe,
  Team,
  TeamDetail,
} from "@workspace/api-zod";

const today = new Date().toISOString().slice(0, 10);
const todayDate = new Date(`${today}T00:00:00.000Z`);
const baseTipoff = Date.now() + 2 * 60 * 60 * 1000;

export const nbaDataStatus: DataStatus = {
  mode: "demo",
  provider: "Illustrative sample dataset",
  lastUpdated: null,
  message:
    "Demo mode: sample basketball data only. No live NBA statistics or sportsbook feed is connected.",
};

const teamRows: Array<[string, string, string, "East" | "West", string, string]> = [
  ["ATL", "Hawks", "Atlanta", "East", "Southeast", "#E03A3E"],
  ["BOS", "Celtics", "Boston", "East", "Atlantic", "#008348"],
  ["BKN", "Nets", "Brooklyn", "East", "Atlantic", "#FFFFFF"],
  ["CHA", "Hornets", "Charlotte", "East", "Southeast", "#1D1160"],
  ["CHI", "Bulls", "Chicago", "East", "Central", "#CE1141"],
  ["CLE", "Cavaliers", "Cleveland", "East", "Central", "#6F263D"],
  ["DAL", "Mavericks", "Dallas", "West", "Southwest", "#00538C"],
  ["DEN", "Nuggets", "Denver", "West", "Northwest", "#0E2240"],
  ["DET", "Pistons", "Detroit", "East", "Central", "#C8102E"],
  ["GSW", "Warriors", "Golden State", "West", "Pacific", "#1D428A"],
  ["HOU", "Rockets", "Houston", "West", "Southwest", "#CE1141"],
  ["IND", "Pacers", "Indiana", "East", "Central", "#002D62"],
  ["LAC", "Clippers", "LA", "West", "Pacific", "#C8102E"],
  ["LAL", "Lakers", "Los Angeles", "West", "Pacific", "#552583"],
  ["MEM", "Grizzlies", "Memphis", "West", "Southwest", "#5D76A9"],
  ["MIA", "Heat", "Miami", "East", "Southeast", "#98002E"],
  ["MIL", "Bucks", "Milwaukee", "East", "Central", "#00471B"],
  ["MIN", "Timberwolves", "Minnesota", "West", "Northwest", "#0C2340"],
  ["NOP", "Pelicans", "New Orleans", "West", "Southwest", "#0C2340"],
  ["NYK", "Knicks", "New York", "East", "Atlantic", "#006BB6"],
  ["OKC", "Thunder", "Oklahoma City", "West", "Northwest", "#007AC1"],
  ["ORL", "Magic", "Orlando", "East", "Southeast", "#0077C0"],
  ["PHI", "76ers", "Philadelphia", "East", "Atlantic", "#006BB6"],
  ["PHX", "Suns", "Phoenix", "West", "Pacific", "#1D1160"],
  ["POR", "Trail Blazers", "Portland", "West", "Northwest", "#E03A3E"],
  ["SAC", "Kings", "Sacramento", "West", "Pacific", "#5A2D81"],
  ["SAS", "Spurs", "San Antonio", "West", "Southwest", "#C4CED4"],
  ["TOR", "Raptors", "Toronto", "East", "Atlantic", "#CE1141"],
  ["UTA", "Jazz", "Utah", "West", "Northwest", "#002B5C"],
  ["WAS", "Wizards", "Washington", "East", "Southeast", "#002B5C"],
];

const teams: Team[] = teamRows.map(
  ([abbreviation, name, city, conference, division, color]) => ({
    id: abbreviation.toLowerCase(),
    abbreviation,
    name,
    city,
    conference,
    division,
    color,
  }),
);

function team(abbreviation: string): Team {
  const found = teams.find((item) => item.abbreviation === abbreviation);
  if (!found) throw new Error(`Unknown NBA team abbreviation: ${abbreviation}`);
  return found;
}

const games: Game[] = [
  {
    id: "demo-bos-nyk",
    date: todayDate,
    tipoff: new Date(baseTipoff),
    status: "scheduled",
    homeTeam: team("NYK"),
    awayTeam: team("BOS"),
    homeScore: null,
    awayScore: null,
    period: null,
    clock: null,
  },
  {
    id: "demo-gsw-phx",
    date: todayDate,
    tipoff: new Date(baseTipoff + 45 * 60 * 1000),
    status: "scheduled",
    homeTeam: team("GSW"),
    awayTeam: team("PHX"),
    homeScore: null,
    awayScore: null,
    period: null,
    clock: null,
  },
  {
    id: "demo-den-okc",
    date: todayDate,
    tipoff: new Date(baseTipoff + 90 * 60 * 1000),
    status: "scheduled",
    homeTeam: team("OKC"),
    awayTeam: team("DEN"),
    homeScore: null,
    awayScore: null,
    period: null,
    clock: null,
  },
];

const players: Player[] = [
  {
    id: "demo-jayson-tatum",
    name: "Jayson Tatum",
    team: team("BOS"),
    position: "F",
    jerseyNumber: "0",
    status: "Sample profile",
    headshotUrl: null,
    points: 28.4,
    rebounds: 8.2,
    assists: 4.7,
    threes: 3.6,
    steals: 1.1,
    blocks: 0.7,
    turnovers: 2.8,
    minutes: 36.1,
    usageRate: 31.4,
  },
  {
    id: "demo-jalen-brunson",
    name: "Jalen Brunson",
    team: team("NYK"),
    position: "G",
    jerseyNumber: "11",
    status: "Sample profile",
    headshotUrl: null,
    points: 27.1,
    rebounds: 3.4,
    assists: 6.8,
    threes: 2.8,
    steals: 0.9,
    blocks: 0.2,
    turnovers: 2.4,
    minutes: 35.8,
    usageRate: 29.8,
  },
  {
    id: "demo-stephen-curry",
    name: "Stephen Curry",
    team: team("GSW"),
    position: "G",
    jerseyNumber: "30",
    status: "Sample profile",
    headshotUrl: null,
    points: 26.3,
    rebounds: 4.5,
    assists: 5.1,
    threes: 4.8,
    steals: 0.9,
    blocks: 0.4,
    turnovers: 3.1,
    minutes: 32.4,
    usageRate: 30.2,
  },
  {
    id: "demo-devin-booker",
    name: "Devin Booker",
    team: team("PHX"),
    position: "G",
    jerseyNumber: "1",
    status: "Sample profile",
    headshotUrl: null,
    points: 27.8,
    rebounds: 4.1,
    assists: 6.9,
    threes: 2.2,
    steals: 0.9,
    blocks: 0.4,
    turnovers: 2.6,
    minutes: 36.0,
    usageRate: 31.0,
  },
  {
    id: "demo-nikola-jokic",
    name: "Nikola Jokic",
    team: team("DEN"),
    position: "C",
    jerseyNumber: "15",
    status: "Sample profile",
    headshotUrl: null,
    points: 26.4,
    rebounds: 12.4,
    assists: 9.0,
    threes: 1.1,
    steals: 1.4,
    blocks: 0.9,
    turnovers: 3.2,
    minutes: 34.7,
    usageRate: 29.1,
  },
  {
    id: "demo-shai-gilgeous-alexander",
    name: "Shai Gilgeous-Alexander",
    team: team("OKC"),
    position: "G",
    jerseyNumber: "2",
    status: "Sample profile",
    headshotUrl: null,
    points: 30.1,
    rebounds: 5.5,
    assists: 6.2,
    threes: 1.7,
    steals: 2.0,
    blocks: 0.9,
    turnovers: 2.2,
    minutes: 34.0,
    usageRate: 32.8,
  },
];

const propRows: Array<{
  playerId: string;
  market: Prop["market"];
  line: number;
  projection: number;
  overProbability: number;
  rationale: string[];
}> = [
  {
    playerId: "demo-jayson-tatum",
    market: "points",
    line: 27.5,
    projection: 29.1,
    overProbability: 0.58,
    rationale: ["Sample season baseline: 28.4 points", "Illustrative usage adjustment"],
  },
  {
    playerId: "demo-jayson-tatum",
    market: "rebounds",
    line: 7.5,
    projection: 8.1,
    overProbability: 0.55,
    rationale: ["Sample season baseline: 8.2 rebounds", "Illustrative matchup adjustment"],
  },
  {
    playerId: "demo-jalen-brunson",
    market: "assists",
    line: 6.5,
    projection: 7.0,
    overProbability: 0.54,
    rationale: ["Sample season baseline: 6.8 assists", "Illustrative pace adjustment"],
  },
  {
    playerId: "demo-stephen-curry",
    market: "threes",
    line: 4.5,
    projection: 4.7,
    overProbability: 0.52,
    rationale: ["Sample season baseline: 4.8 made threes", "Illustrative shot-volume adjustment"],
  },
  {
    playerId: "demo-devin-booker",
    market: "points",
    line: 26.5,
    projection: 27.8,
    overProbability: 0.56,
    rationale: ["Sample season baseline: 27.8 points", "Illustrative role adjustment"],
  },
  {
    playerId: "demo-nikola-jokic",
    market: "pra",
    line: 46.5,
    projection: 48.0,
    overProbability: 0.57,
    rationale: ["Illustrative combined points, rebounds and assists projection"],
  },
  {
    playerId: "demo-shai-gilgeous-alexander",
    market: "points",
    line: 29.5,
    projection: 30.1,
    overProbability: 0.53,
    rationale: ["Sample season baseline: 30.1 points", "Illustrative usage adjustment"],
  },
];

const props: Prop[] = propRows.map((row) => {
  const player = players.find((item) => item.id === row.playerId)!;
  const game = games.find(
    (item) =>
      item.homeTeam.abbreviation === player.team.abbreviation ||
      item.awayTeam.abbreviation === player.team.abbreviation,
  );
  const opponent =
    game?.homeTeam.abbreviation === player.team.abbreviation
      ? game.awayTeam.abbreviation
      : game?.homeTeam.abbreviation ?? "—";

  return {
    id: `${row.playerId}-${row.market}`,
    playerId: player.id,
    playerName: player.name,
    team: player.team.abbreviation,
    opponent,
    market: row.market,
    line: row.line,
    projection: row.projection,
    overProbability: row.overProbability,
    overOdds: null,
    underOdds: null,
    sportsbook: null,
    edge: row.projection - row.line,
    confidence: row.overProbability >= 0.56 ? "high" : row.overProbability >= 0.53 ? "medium" : "low",
    rationale: row.rationale,
    dataStatus: nbaDataStatus,
  };
});

const snipes: Snipe[] = [...props]
  .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
  .map((prop, index) => ({
    ...prop,
    rank: index + 1,
    signalScore: Math.round(prop.overProbability * 100),
  }));

function logsFor(player: Player): GameLog[] {
  return [0, 1, 2, 3, 4].map((offset) => ({
    date: new Date(Date.now() - (offset + 1) * 24 * 60 * 60 * 1000),
    opponent: ["MIA", "PHI", "MIL", "CLE", "ORL"][offset],
    minutes: Math.max(0, player.minutes - [0, 3, 1, 5, 2][offset]),
    points: Math.max(0, Math.round(player.points + [2, -5, 4, -2, 1][offset])),
    rebounds: Math.max(0, Math.round(player.rebounds + [1, -2, 2, 0, -1][offset])),
    assists: Math.max(0, Math.round(player.assists + [0, 2, -1, 1, -2][offset])),
    threes: Math.max(0, Math.round(player.threes + [1, -1, 0, 2, -1][offset])),
    steals: Math.max(0, Math.round(player.steals + [0, 1, -1, 0, 1][offset])),
    blocks: Math.max(0, Math.round(player.blocks + [0, 0, 1, -1, 0][offset])),
    turnovers: Math.max(0, Math.round(player.turnovers + [0, 1, -1, 0, 1][offset])),
  }));
}

const teamMetrics: Record<
  string,
  { wins: number; losses: number; pace: number; offensiveRating: number; defensiveRating: number }
> = {
  BOS: { wins: 0, losses: 0, pace: 98.1, offensiveRating: 119.2, defensiveRating: 110.8 },
  NYK: { wins: 0, losses: 0, pace: 96.7, offensiveRating: 117.0, defensiveRating: 112.4 },
  GSW: { wins: 0, losses: 0, pace: 100.3, offensiveRating: 116.3, defensiveRating: 114.5 },
  PHX: { wins: 0, losses: 0, pace: 99.0, offensiveRating: 115.7, defensiveRating: 115.1 },
  DEN: { wins: 0, losses: 0, pace: 97.5, offensiveRating: 118.1, defensiveRating: 114.2 },
  OKC: { wins: 0, losses: 0, pace: 101.2, offensiveRating: 117.9, defensiveRating: 111.4 },
};

const matchups: Matchup[] = games.map((game, index) => ({
  game,
  projectedPace: [97.4, 100.1, 99.6][index],
  projectedTotal: [222.5, 231.0, 228.0][index],
  homeOffenseRating: teamMetrics[game.homeTeam.abbreviation]?.offensiveRating ?? 114.0,
  awayOffenseRating: teamMetrics[game.awayTeam.abbreviation]?.offensiveRating ?? 114.0,
  notes: [
    "Illustrative matchup profile; not based on a connected live feed.",
    "No verified injury or rotation data is available in demo mode.",
  ],
  dataStatus: nbaDataStatus,
}));

const auditRecords: AuditRecord[] = snipes.slice(0, 5).map((snipe, index) => ({
  id: `demo-audit-${index + 1}`,
  playerName: snipe.playerName,
  team: snipe.team,
  market: snipe.market,
  projection: snipe.projection,
  dataInputs: ["Illustrative season baseline", "Illustrative opponent context"],
  adjustments: snipe.rationale,
  recordedAt: new Date(Date.now() - index * 60 * 60 * 1000),
  status: "demo",
}));

const modelPerformance: ModelPerformance[] = [
  "points",
  "rebounds",
  "assists",
  "threes",
  "steals",
  "blocks",
  "turnovers",
  "pra",
].map((market) => ({
  market: market as ModelPerformance["market"],
  sampleSize: 0,
  hitRate: null,
  averageError: null,
  roi: null,
  status: "demo",
}));

export const nbaProvider = {
  getDataStatus: () => nbaDataStatus,

  getDashboard: (date = todayDate) => {
    const dateString = date.toISOString().slice(0, 10);
    const slateGames = games.filter(
      (game) => game.date.toISOString().slice(0, 10) === dateString,
    );
    return {
      date,
      gamesOnSlate: slateGames.length,
      liveGames: slateGames.filter((game) => game.status === "live").length,
      playersAnalyzed: players.length,
      topConfidence: snipes[0]?.overProbability ?? null,
      topEdges: snipes.slice(0, 5),
      games: slateGames,
      dataStatus: nbaDataStatus,
    };
  },

  getGames: (date?: Date, status?: Game["status"]) =>
    games.filter(
      (game) =>
        (!date ||
          game.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10)) &&
        (!status || game.status === status),
    ),

  getGame: (id: string) => games.find((game) => game.id === id),

  getPlayers: (search?: string, teamAbbreviation?: string) =>
    players.filter((player) => {
      const matchesSearch =
        !search || player.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
      const matchesTeam =
        !teamAbbreviation ||
        player.team.abbreviation.toLocaleLowerCase() === teamAbbreviation.toLocaleLowerCase();
      return matchesSearch && matchesTeam;
    }),

  getPlayer: (id: string): PlayerDetail | undefined => {
    const player = players.find((item) => item.id === id);
    return player ? { player, recentGames: logsFor(player), dataStatus: nbaDataStatus } : undefined;
  },

  getTeams: () => teams,

  getTeam: (id: string): TeamDetail | undefined => {
    const selectedTeam = teams.find(
      (item) =>
        item.id.toLocaleLowerCase() === id.toLocaleLowerCase() ||
        item.abbreviation.toLocaleLowerCase() === id.toLocaleLowerCase(),
    );
    if (!selectedTeam) return undefined;
    const metrics = teamMetrics[selectedTeam.abbreviation] ?? {
      wins: 0,
      losses: 0,
      pace: 98.0,
      offensiveRating: 114.0,
      defensiveRating: 114.0,
    };
    return {
      team: selectedTeam,
      ...metrics,
      roster: players.filter(
        (player) => player.team.abbreviation === selectedTeam.abbreviation,
      ),
      dataStatus: nbaDataStatus,
    };
  },

  getProps: (market?: Prop["market"]) =>
    market ? props.filter((prop) => prop.market === market) : props,

  getSnipes: (market?: Snipe["market"]) =>
    market ? snipes.filter((snipe) => snipe.market === market) : snipes,

  getMatchups: () => matchups,

  getLiveAlerts: (): LiveAlerts => ({
    mode: "demo",
    events: [],
    dataStatus: {
      ...nbaDataStatus,
      message:
        "Live alerts are paused because no verified NBA live-game source is connected.",
    },
  }),

  getModelPerformance: () => modelPerformance,

  getAudit: () => auditRecords,
};
