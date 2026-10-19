import type {
  DataStatus,
  Game,
  Prop,
  Snipe,
  Team,
  TeamDetail,
} from "@workspace/api-zod";

export const nbaDataStatus: DataStatus = {
  mode: "unavailable",
  provider: "Not connected",
  lastUpdated: null,
  message:
    "No NBA statistics, schedule, availability, or sportsbook odds provider is configured. Dynamic data is withheld; no sample records are served.",
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

export const nbaProvider = {
  getDataStatus: () => nbaDataStatus,

  getDashboard: (date = new Date()) => ({
    date,
    gamesOnSlate: 0,
    liveGames: 0,
    playersAnalyzed: 0,
    topConfidence: null,
    topEdges: [],
    games: [],
    dataStatus: nbaDataStatus,
  }),

  getGames: (_date?: Date, _status?: Game["status"]): Game[] => [],
  getGame: (_id: string): Game | undefined => undefined,
  getPlayers: (_search?: string, _team?: string) => [],
  getPlayer: (_id: string) => undefined,
  getTeams: () => teams,

  getTeam: (id: string): TeamDetail | undefined => {
    const team = teams.find(
      (item) =>
        item.id.toLowerCase() === id.toLowerCase() ||
        item.abbreviation.toLowerCase() === id.toLowerCase(),
    );
    if (!team) return undefined;
    return {
      team,
      wins: null,
      losses: null,
      pace: null,
      offensiveRating: null,
      defensiveRating: null,
      roster: [],
      dataStatus: nbaDataStatus,
    };
  },

  getProps: (_market?: Prop["market"]) => [],
  getSnipes: (_market?: Snipe["market"]) => [],
  getMatchups: () => [],
  getLiveAlerts: () => ({
    mode: "unavailable" as const,
    events: [],
    dataStatus: nbaDataStatus,
  }),
  getModelPerformance: () => [],
  getAudit: () => [],
};
