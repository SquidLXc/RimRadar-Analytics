import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuditRecord,
  DashboardSummary,
  DiscordLink,
  FirstBasketAlerts,
  FirstBasketEntry,
  FirstBasketStatus,
  DataHealth,
  DataStatus,
  Game,
  LiveAlerts,
  Matchup,
  ModelPerformance,
  ModelRefreshResult,
  OddsFeed,
  Pick,
  PicksStatus,
  Player,
  PlayerDetail,
  Prop,
  SyncResult,
  Team,
  TeamDetail,
} from "@workspace/api-client-react";

type QueryOptions = {
  enabled?: boolean;
  refetchInterval?: number;
  queryKey?: readonly unknown[];
};

type ApiQuery<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  queryKey: readonly unknown[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function useApiQuery<T>(path: string | null, options: QueryOptions = {}): ApiQuery<T> {
  const { enabled = true, refetchInterval } = options;
  const queryKey = options.queryKey ?? [path];
  const [data, setData] = useState<T>();
  const [isLoading, setIsLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!enabled || !path) return;
    setIsLoading(true);
    try {
      const result = await request<T>(path);
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught : new Error("Request failed"));
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [enabled, path]);

  useEffect(() => {
    if (!enabled || !path) {
      setIsLoading(false);
      return;
    }
    void refetch();
    if (!refetchInterval) return;
    const timer = window.setInterval(() => void refetch(), refetchInterval);
    return () => window.clearInterval(timer);
  }, [enabled, path, refetch, refetchInterval]);

  return useMemo(
    () => ({ data, isLoading, isError: Boolean(error), error, refetch, queryKey }),
    [data, error, isLoading, queryKey, refetch],
  );
}

function withParams(path: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

const key = (...parts: unknown[]) => parts;

export const getHealthCheckQueryKey = () => key("/api/healthz");
export const getDataStatusQueryKey = () => key("/api/nba/data-status");
export const getDashboardSummaryQueryKey = () => key("/api/nba/dashboard/summary");
export const getGamesQueryKey = (params?: { date?: string; status?: string }) => key("/api/nba/games", params);
export const getTodayGamesQueryKey = () => key("/api/nba/games/today");
export const getFutureGamesQueryKey = () => key("/api/nba/games/future");
export const getGameQueryKey = (gameId: string) => key("/api/nba/games", gameId);
export const getPlayersQueryKey = (params?: { search?: string; team?: string }) => key("/api/nba/players", params);
export const getPlayerQueryKey = (playerId: string) => key("/api/nba/players", playerId);
export const getTeamsQueryKey = () => key("/api/nba/teams");
export const getTeamQueryKey = (teamId: string) => key("/api/nba/teams", teamId);
export const getPropsQueryKey = (params?: { market?: string }) => key("/api/nba/props", params);
export const getPicksQueryKey = (params?: { market?: string }) => key("/api/nba/picks", params);
export const getPicksStatusQueryKey = () => key("/api/nba/picks/status");
export const getFirstBasketQueryKey = () => key("/api/nba/first-basket");
export const getFirstBasketStatusQueryKey = () => key("/api/nba/first-basket/status");
export const getFirstBasketAlertsQueryKey = () => key("/api/nba/first-basket/alerts");
export const getDiscordQueryKey = () => key("/api/community/discord");
export const getMatchupsQueryKey = () => key("/api/nba/matchups");
export const getLiveAlertsQueryKey = () => key("/api/nba/live-alerts");
export const getOddsQueryKey = () => key("/api/nba/odds");
export const getModelPerformanceQueryKey = () => key("/api/nba/model-performance");
export const getAuditQueryKey = () => key("/api/nba/audit");
export const getDataHealthQueryKey = () => key("/api/admin/data-health");

export function useHealthCheck(options?: QueryOptions) {
  return useApiQuery<{ status: string }>("/api/healthz", options);
}

export function useDataStatus(options?: QueryOptions) {
  return useApiQuery<DataStatus>("/api/nba/data-status", options);
}

export function useDashboardSummary(options?: QueryOptions) {
  return useApiQuery<DashboardSummary>("/api/nba/dashboard/summary", options);
}

export function useGetGames(params?: { date?: string; status?: string }, options?: QueryOptions) {
  return useApiQuery<Game[]>(
    withParams("/api/nba/games", { date: params?.date, status: params?.status }),
    options,
  );
}

export function useGetTodayGames(options?: QueryOptions) {
  return useApiQuery<Game[]>("/api/nba/games/today", options);
}

export function useGetFutureGames(options?: QueryOptions) {
  return useApiQuery<Game[]>("/api/nba/games/future", options);
}

export function useGetGame(gameId: string, options?: QueryOptions) {
  return useApiQuery<Game>(
    gameId ? `/api/nba/games/${encodeURIComponent(gameId)}` : null,
    options,
  );
}

export function useGetPlayers(params?: { search?: string; team?: string }, options?: QueryOptions) {
  return useApiQuery<Player[]>(withParams("/api/nba/players", params), options);
}

export function useGetPlayer(playerId: string, options?: QueryOptions) {
  return useApiQuery<PlayerDetail>(
    playerId ? `/api/nba/players/${encodeURIComponent(playerId)}` : null,
    options,
  );
}

export function useGetTeams(options?: QueryOptions) {
  return useApiQuery<Team[]>("/api/nba/teams", options);
}

export function useGetTeam(teamId: string, options?: QueryOptions) {
  return useApiQuery<TeamDetail>(
    teamId ? `/api/nba/teams/${encodeURIComponent(teamId)}` : null,
    options,
  );
}

export function useGetProps(params?: { market?: string }, options?: QueryOptions) {
  return useApiQuery<Prop[]>(withParams("/api/nba/props", params), options);
}

export function useGetPicks(params?: { market?: string }, options?: QueryOptions) {
  return useApiQuery<Pick[]>(withParams("/api/nba/picks", params), options);
}

export function useGetPicksStatus(options?: QueryOptions) {
  return useApiQuery<PicksStatus>("/api/nba/picks/status", options);
}

export function useGetFirstBasket(options?: QueryOptions) {
  return useApiQuery<FirstBasketEntry[]>("/api/nba/first-basket", options);
}

export function useGetFirstBasketStatus(options?: QueryOptions) {
  return useApiQuery<FirstBasketStatus>("/api/nba/first-basket/status", options);
}

export function useGetFirstBasketAlerts(options?: QueryOptions) {
  return useApiQuery<FirstBasketAlerts>("/api/nba/first-basket/alerts", options);
}

export function useGetDiscord(options?: QueryOptions) {
  return useApiQuery<DiscordLink>("/api/community/discord", options);
}

export function useGetMatchups(options?: QueryOptions) {
  return useApiQuery<Matchup[]>("/api/nba/matchups", options);
}

export function useGetLiveAlerts(options?: QueryOptions) {
  return useApiQuery<LiveAlerts>("/api/nba/live-alerts", options);
}

export function useGetOdds(options?: QueryOptions) {
  return useApiQuery<OddsFeed>("/api/nba/odds", options);
}

export function useGetModelPerformance(options?: QueryOptions) {
  return useApiQuery<ModelPerformance[]>("/api/nba/model-performance", options);
}

export function useGetAudit(options?: QueryOptions) {
  return useApiQuery<AuditRecord[]>("/api/nba/audit", options);
}

export function useDataHealth(options?: QueryOptions) {
  return useApiQuery<DataHealth>("/api/admin/data-health", options);
}

export function useSyncNbaData() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    setResult(null);
    try {
      setResult(await request<SyncResult>("/api/admin/sync", { method: "POST" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error("Sync failed"));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { sync, isSyncing, result, error };
}

export function useRefreshNbaModel() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [result, setResult] = useState<ModelRefreshResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    setResult(null);
    try {
      setResult(await request<ModelRefreshResult>("/api/admin/model/refresh", { method: "POST" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error("Model refresh failed"));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { refresh, isRefreshing, result, error };
}
