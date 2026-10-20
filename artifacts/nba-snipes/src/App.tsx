import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowUpRight, BarChart3, Bell, BrainCircuit, CalendarDays, ChevronRight,
  CircleAlert, Clock3, Database, ExternalLink, Gauge, Heart, Info, Menu, RefreshCw,
  Search, Shield, Sparkles, Star, Target, TrendingUp, Trophy, Users, X, Zap, Instagram,
} from 'lucide-react';
import {
  getAuditQueryKey, getDashboardSummaryQueryKey, getDataHealthQueryKey, getFutureGamesQueryKey,
  getGameQueryKey, getLiveAlertsQueryKey, getMatchupsQueryKey, getModelPerformanceQueryKey,
  getOddsQueryKey, getPicksQueryKey, getPicksStatusQueryKey, getPlayerQueryKey, getPlayersQueryKey, getPropsQueryKey,
  getTeamQueryKey, getTeamsQueryKey, getTodayGamesQueryKey, useDashboardSummary, useDataHealth,
  useGetAudit, useGetFutureGames, useGetGame, useGetLiveAlerts, useGetMatchups,
  useGetModelPerformance, useGetOdds, useGetPicks, useGetPicksStatus, useGetPlayer, useGetPlayers, useGetProps,
  useGetTeam, useGetTeams, useGetTodayGames, useHealthCheck, useSyncNbaData,
} from '@/lib/api-hooks';
import type {
  AuditRecord, DataStatus, DashboardSummary, Game, LiveAlert, Matchup,
  ModelPerformance, OddsFeed, Pick, PicksStatus, Player, PlayerDetail, Prop, Team, TeamDetail,
} from '@workspace/api-client-react';
import { PlayerImage, TeamCrest } from '@/components/assets';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import '@/index.css';

const markets = ['all', 'points', 'assists', 'rebounds', 'threes'] as const;
type Market = (typeof markets)[number];

const nav = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/picks', label: 'Radar Picks', icon: Target, hot: true },
  { href: '/props', label: 'Prop board', icon: BarChart3 },
  { href: '/matchups', label: 'Matchups', icon: Trophy },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/teams', label: 'Teams', icon: Activity },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/audit', label: 'Audit trail', icon: BrainCircuit },
];

const WATCHLIST_KEY = 'rimraider-watchlist';

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(Number.isInteger(value) ? 0 : digits);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(value: string | Date | null | undefined) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function gameTime(value: string | null | undefined) {
  if (!value) return 'TBD';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function price(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function pointLabel(point: number, market: string) {
  if (market === 'total') return `${point}`;
  return `${point > 0 ? '+' : ''}${point}`;
}

function useWatchlist(): [string[], (id: string) => void] {
  const [items, setItems] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const toggle = (id: string) =>
    setItems((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });

  return [items, toggle];
}

function DataState({ status, compact = false }: { status?: DataStatus; compact?: boolean }) {
  const mode = status?.mode ?? 'unavailable';
  const tone =
    mode === 'live'
      ? 'border-primary/30 bg-primary/10 text-primary'
      : mode === 'stale'
        ? 'border-accent/30 bg-accent/10 text-accent'
        : 'border-destructive/30 bg-destructive/10 text-destructive';
  const label = mode === 'live' ? 'Live · ESPN' : mode === 'stale' ? 'Stale feed' : mode === 'demo' ? 'Demo' : 'Feed unavailable';

  return (
    <span
      title={status?.message}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${tone} ${compact ? '' : 'mt-2'}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function EmptyState({
  title,
  body,
  icon: Icon = Database,
}: {
  title: string;
  body: string;
  icon?: typeof Database;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
      <Icon size={22} className="mx-auto mb-3 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function QueryState({
  loading,
  error,
  errorMessage,
  empty,
  emptyTitle = 'No records returned',
  emptyBody = 'The provider returned no records for this view.',
  children,
  onRetry,
}: {
  loading?: boolean;
  error?: boolean;
  errorMessage?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-16 animate-pulse rounded-xl border border-border bg-card/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6">
        <p className="font-semibold">Feed unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The request failed{errorMessage ? ` (${errorMessage})` : ''}. Check that the API server is running with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pnpm --filter @workspace/api-server run dev</code>{' '}
          and retry.
        </p>
        {onRetry ? (
          <button
            onClick={onRetry}
            className="mt-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary"
          >
            <RefreshCw size={13} /> Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (empty) return <EmptyState title={emptyTitle} body={emptyBody} />;

  return <>{children}</>;
}

function PageHeader({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary">{eyebrow}</p>
        <h1 className="text-3xl font-extrabold tracking-[-.04em] text-foreground md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy}</p>
      </div>
      {action}
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const health = useDataHealth({ queryKey: getDataHealthQueryKey() });
  const alerts = useGetLiveAlerts({ queryKey: getLiveAlertsQueryKey(), refetchInterval: 60_000 });
  const feedLabel = health.isLoading
    ? 'CHECKING FEED'
    : health.isError
      ? 'API OFFLINE'
      : health.data?.connection === 'connected'
        ? 'DATA CURRENT'
        : 'SYNC REQUIRED';
  const events = alerts.data?.events ?? [];

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col border-r border-sidebar-border bg-sidebar transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-[76px] items-center border-b border-sidebar-border px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
              <Zap size={16} fill="currentColor" />
            </span>
            <span>
              <span className="block font-mono text-sm font-medium tracking-[-.04em] text-foreground">
                Rim<span className="text-primary">Raider</span>
              </span>
              <span className="mt-0.5 block font-mono text-[8px] tracking-[.08em] text-muted-foreground">
                NBA decision terminal
              </span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.4 : 1.7} />
                <span>{item.label}</span>
                {item.hot ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <a
            href="https://www.instagram.com/topcapperz/"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Instagram size={15} /> Daily plays <ExternalLink size={11} className="ml-auto opacity-50" />
          </a>
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs ${
              location === '/admin' ? 'bg-secondary/10 text-secondary' : 'text-sidebar-foreground hover:bg-sidebar-accent'
            }`}
          >
            <Shield size={15} /> Ops / data health
          </Link>
          <div className="mt-4 flex items-center gap-2 px-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${health.data?.connection === 'connected' ? 'bg-primary' : 'bg-accent'}`} />
            {feedLabel}
          </div>
        </div>
      </aside>

      {open ? (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden"
        >
          <X className="absolute right-5 top-5 text-muted-foreground" />
        </button>
      ) : null}

      <div className="md:pl-[244px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-xl md:px-8">
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-border p-2 text-muted-foreground md:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground md:flex">
            <span className="text-primary">NBA /</span> RimRaider
            <span className="mx-1 text-border">•</span> {shortDate(new Date())}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                aria-label="Injury alerts"
                onClick={() => setNotificationsOpen((value) => !value)}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                <Bell size={16} />
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-card/95 p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
                      Injury report
                    </p>
                    <button onClick={() => setNotificationsOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X size={14} />
                    </button>
                  </div>
                  {alerts.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading alerts…</p>
                  ) : events.length > 0 ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {events.slice(0, 6).map((alert) => (
                        <div key={alert.id} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                          <p className="text-xs font-semibold">{alert.title}</p>
                          <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{alert.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {alerts.isError ? 'Injury feed unavailable.' : 'No active injury reports.'}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <Link
              href="/admin"
              className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground sm:flex"
            >
              <span className={`h-2 w-2 rounded-full ${health.data?.connection === 'connected' ? 'bg-primary' : 'bg-accent'}`} />
              {feedLabel}
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-7 md:px-8 md:py-9">{children}</main>

        <footer className="border-t border-border/80 px-4 py-6 text-[10px] leading-5 text-muted-foreground md:px-8">
          <p>RimRaider is an independent NBA analytics project and is not affiliated with or endorsed by the National Basketball Association.</p>
          <p>Schedule, scores, rosters and injury data from ESPN. Game lines are as reported by ESPN's sportsbook partners. Informational only.</p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  accent = 'lime',
  icon: Icon = Activity,
}: {
  label: string;
  value: string | number;
  note: string;
  accent?: 'lime' | 'violet' | 'magenta';
  icon?: typeof Activity;
}) {
  const tones = {
    lime: 'text-primary border-primary/20',
    violet: 'text-secondary border-secondary/20',
    magenta: 'text-accent border-accent/20',
  };
  return (
    <div className={`rounded-xl border bg-card/80 p-4 ${tones[accent]}`}>
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span>
        <Icon size={15} />
      </div>
      <div className="text-2xl font-extrabold tracking-[-.04em] text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function ScoreLine({ game }: { game: Game }) {
  const hasScore = game.status !== 'scheduled' && game.awayScore !== null && game.homeScore !== null;
  return (
    <div className="text-center">
      {hasScore ? (
        <>
          <div className="font-mono text-2xl font-bold">
            {game.awayScore} <span className="text-muted-foreground">–</span> {game.homeScore}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            {game.status === 'live' ? `${game.period ?? ''} ${game.clock ?? ''}`.trim() : 'final'}
          </div>
        </>
      ) : (
        <>
          <div className="font-mono text-xl font-semibold text-secondary">{gameTime(game.tipoff)}</div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{shortDate(game.date)}</div>
        </>
      )}
    </div>
  );
}

function GameRow({ game }: { game: Game }) {
  const hasScore = game.status !== 'scheduled' && game.awayScore !== null && game.homeScore !== null;

  return (
    <Link
      href={`/games/${game.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className="w-[52px] shrink-0 text-center">
        <div className="font-mono text-[11px] font-medium text-foreground">{gameTime(game.tipoff)}</div>
        <div className={`mt-1 text-[9px] uppercase tracking-wider ${game.status === 'live' ? 'text-accent' : 'text-muted-foreground'}`}>
          {game.status}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TeamCrest team={game.awayTeam} size="sm" />
        <span className="text-sm font-semibold">{game.awayTeam.abbreviation}</span>
        <span className="font-mono text-[10px] uppercase text-muted-foreground">at</span>
        <TeamCrest team={game.homeTeam} size="sm" />
        <span className="text-sm font-semibold">{game.homeTeam.abbreviation}</span>
        <span className="ml-auto hidden truncate text-[10px] text-muted-foreground lg:block">{game.venue ?? ''}</span>
      </div>
      <div className="w-[54px] shrink-0 text-right">
        {hasScore ? (
          <div className="font-mono text-sm font-bold">
            {game.awayScore}–{game.homeScore}
          </div>
        ) : (
          <div className="font-mono text-[10px] text-muted-foreground">{shortDate(game.date)}</div>
        )}
      </div>
      <ChevronRight size={15} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}

function OddsPanel({ feed, loading, error, onRetry }: { feed?: OddsFeed; loading: boolean; error: boolean; onRetry: () => void }) {
  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card/70" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card/70" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6">
        <p className="font-semibold">Odds feed unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">No prices were filled in by assumption.</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"
        >
          Retry odds feed
        </button>
      </div>
    );
  }

  if (!feed || feed.games.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No verified game lines"
        body={
          feed?.provider
            ? `${feed.provider} did not publish prices for a game on the current slate.`
            : 'ESPN did not return sportsbook prices for the current slate.'
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {feed.games.map(({ game, sportsbooks }) => (
        <div key={game.id} className="rounded-xl border border-border bg-card/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Game market</p>
              <h3 className="mt-1 text-base font-bold">
                {game.awayTeam.abbreviation} at {game.homeTeam.abbreviation}
              </h3>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {shortDate(game.date)} · {gameTime(game.tipoff)}
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase text-muted-foreground">{sportsbooks.length} book{sportsbooks.length === 1 ? '' : 's'}</span>
          </div>
          <div className="space-y-3">
            {sportsbooks.map((book) => (
              <div key={book.key} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold">{book.title}</span>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">{feed.priceType}</span>
                </div>
                <div className="space-y-2">
                  {book.markets.map((market) => (
                    <div key={market.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{market.label}</span>
                      <div className="flex flex-wrap justify-end gap-2">
                        {market.outcomes.map((outcome) => (
                          <span
                            key={`${market.key}-${outcome.name}`}
                            className="rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-foreground"
                          >
                            {outcome.name} {outcome.point !== null ? pointLabel(outcome.point, market.key) : ''}{' '}
                            <b className="ml-1 text-primary">{price(outcome.price)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InjuryPanel() {
  const query = useGetLiveAlerts({ queryKey: getLiveAlertsQueryKey(), refetchInterval: 60_000 });
  const events: LiveAlert[] = query.data?.events ?? [];

  return (
    <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Availability</p>
          <h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Injury report</h2>
        </div>
        <DataState status={query.data?.dataStatus} />
      </div>
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && events.length === 0}
        onRetry={() => void query.refetch()}
      >
        <div className="space-y-2">
          {events.slice(0, 6).map((alert) => (
            <div key={alert.id} className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{alert.title}</p>
                <span className="font-mono text-[9px] uppercase text-muted-foreground">{shortDate(alert.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{alert.detail}</p>
            </div>
          ))}
        </div>
      </QueryState>
    </section>
  );
}

function Home() {
  const summary = useDashboardSummary({ queryKey: getDashboardSummaryQueryKey() });
  const today = useGetTodayGames({ queryKey: getTodayGamesQueryKey() });
  const future = useGetFutureGames({ queryKey: getFutureGamesQueryKey() });
  const odds = useGetOdds({ queryKey: getOddsQueryKey() });
  const picks = useGetPicks(undefined, { queryKey: getPicksQueryKey() });
  const [watchlist, toggleWatch] = useWatchlist();

  const data = summary.data;
  const todayGames = today.data ?? [];
  const futureGames = future.data ?? [];

  return (
    <>
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card/40 px-5 py-7 md:px-8 md:py-9">
        <div className="absolute right-[-4%] top-[-60%] h-[420px] w-[420px] rounded-full bg-secondary/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">NBA / live board</span>
              <DataState status={data?.dataStatus} compact />
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[.95] tracking-[-.065em] text-foreground md:text-6xl">
              RimRaider<br />
              <span className="text-primary">Your NBA. One spot.</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Real schedule, scores, rosters and injuries from ESPN, live player props from DunkAPI, and Radar Picks
              generated by the RimRaider model from recent form and de-vigged market prices.
            </p>
          </div>
          <div className="flex shrink-0 justify-center md:flex-1 md:-translate-x-6 lg:-translate-x-10">
            <img
              src="/rimraider-logo.png"
              alt="RimRaider emblem"
              className="h-auto w-[210px] object-contain drop-shadow-[0_0_34px_rgba(163,255,18,.18)] md:w-[250px] lg:w-[310px]"
            />
          </div>
          <div className="flex w-full flex-col gap-3 md:max-w-[360px]">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Provider</p>
              <p className="mt-2 text-xl font-bold">{data?.dataStatus?.provider ?? 'ESPN'}</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {data?.dataStatus?.message ?? 'Waiting for the API server.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Games today" value={data?.gamesOnSlate ?? '—'} note="On the current slate" icon={CalendarDays} />
        <StatCard label="Live now" value={data?.liveGames ?? '—'} note="In progress" accent="magenta" icon={Activity} />
        <StatCard
          label="Players analyzed"
          value={data?.playersAnalyzed ? data.playersAnalyzed : '—'}
          note={data?.playersAnalyzed ? 'Recent form + market prices' : 'Waiting for the props feed'}
          accent="violet"
          icon={Users}
        />
        <StatCard
          label="Radar picks"
          value={data?.topEdges?.length ?? 0}
          note={data?.topEdges?.length ? 'Model-generated edges' : 'No edges on this slate'}
          accent="magenta"
          icon={Target}
        />
      </div>

      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Market pulse</p>
              <h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Today's games</h2>
            </div>
            <Link href="/matchups" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
              Open lab <ArrowUpRight size={13} />
            </Link>
          </div>
          <QueryState
            loading={today.isLoading}
            error={today.isError}
            errorMessage={today.error?.message}
            empty={!today.isLoading && !today.isError && todayGames.length === 0}
            emptyTitle="No games today"
            emptyBody="The NBA schedule has no games on today's slate. Upcoming games are listed beside this panel."
            onRetry={() => void today.refetch()}
          >
            <div className="space-y-2">
              {todayGames.slice(0, 6).map((game) => (
                <GameRow game={game} key={game.id} />
              ))}
            </div>
          </QueryState>
        </section>

        <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-secondary">Next slate</p>
              <h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Upcoming games</h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {futureGames[0] ? shortDate(futureGames[0].date) : 'Date pending'}
            </span>
          </div>
          <QueryState
            loading={future.isLoading}
            error={future.isError}
            errorMessage={future.error?.message}
            empty={!future.isLoading && !future.isError && futureGames.length === 0}
            onRetry={() => void future.refetch()}
          >
            <div className="space-y-2">
              {futureGames.slice(0, 6).map((game) => (
                <GameRow game={game} key={game.id} />
              ))}
            </div>
          </QueryState>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card/70 p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Odds by book</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Sportsbook lines</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {odds.data?.provider ?? 'ESPN'}
          </span>
        </div>
        <OddsPanel
          feed={odds.data}
          loading={odds.isLoading}
          error={odds.isError}
          onRetry={() => void odds.refetch()}
        />
      </section>

      <div className="mt-6 grid gap-6 [&>*]:min-w-0 xl:grid-cols-[.85fr_1.15fr]">
        <InjuryPanel />
        <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Signal queue</p>
              <h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Highest conviction edges</h2>
            </div>
            <Link href="/picks" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
              Radar picks <ArrowUpRight size={13} />
            </Link>
          </div>
          <QueryState
            loading={picks.isLoading}
            error={picks.isError}
            errorMessage={picks.error?.message}
            empty={!picks.isLoading && !picks.isError && (picks.data ?? []).length === 0}
            onRetry={() => void picks.refetch()}
          >
            <div className="space-y-2">
              {(picks.data ?? []).slice(0, 5).map((pick) => (
                <div key={pick.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{pick.playerName}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {pick.team} vs {pick.opponent} · {pick.market} {fmt(pick.line)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-primary">
                        {pick.edge !== null ? `+${(pick.edge * 100).toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-[9px] uppercase text-muted-foreground">edge</p>
                    </div>
                    <button
                      onClick={() => toggleWatch(pick.playerId)}
                      className={`rounded-lg border p-2 ${watchlist.includes(pick.playerId) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                    >
                      <Star size={13} fill={watchlist.includes(pick.playerId) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </QueryState>
        </section>
      </div>
    </>
  );
}

function PicksPage() {
  const [market, setMarket] = useState<Market>('all');
  const [watchlist, toggleWatch] = useWatchlist();
  const query = useGetPicks(market === 'all' ? undefined : { market }, { queryKey: getPicksQueryKey() });
  const status = useGetPicksStatus({ queryKey: getPicksStatusQueryKey() });
  const rows: Pick[] = useMemo(() => query.data ?? [], [query.data]);
  const model: PicksStatus | undefined = status.data;

  return (
    <>
      <PageHeader
        eyebrow="Ranked signal / live board"
        title="Radar Picks"
        copy="Every pick is generated by the RimRaider model: recency-weighted player form blended with season baselines, compared against de-vigged sportsbook prices from DunkAPI. The projection, price and reasoning are attached to each row."
        action={
          <button
            onClick={() => void query.refetch()}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {markets.map((item) => (
          <button
            key={item}
            onClick={() => setMarket(item)}
            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-semibold capitalize transition-colors ${
              market === item ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {item === 'all' ? 'All signals' : item}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card/50 px-4 py-3 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
        <span className="text-primary">Model {model?.modelVersion ?? 'rimraider-v1'}</span>
        <span>{model?.slateGames ?? 0} slate games</span>
        <span>{model?.playersAnalyzed ?? 0} players analyzed</span>
        <span>{model?.picksGenerated ?? 0} picks</span>
        <span>
          {model?.lastUpdated ? `Updated ${new Date(model.lastUpdated).toLocaleTimeString()}` : 'Not generated yet'}
        </span>
        <span className="ml-auto">{model?.creditsSpent ?? 0} DunkAPI credits</span>
      </div>
      {model?.message ? <p className="mb-4 text-xs text-muted-foreground">{model.message}</p> : null}
      <div className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
        <div className="mb-4 hidden grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-4 border-b border-border pb-3 font-mono text-[9px] uppercase tracking-[.15em] text-muted-foreground md:grid">
          <span>Player / matchup</span>
          <span>Confidence</span>
          <span>Projection</span>
          <span>Model edge</span>
          <span>Context</span>
        </div>
        <QueryState
          loading={query.isLoading}
          error={query.isError}
          errorMessage={query.error?.message}
          onRetry={() => void query.refetch()}
        >
          <div>
            {rows.map((pick) => (
              <div key={pick.id} className="grid gap-4 border-b border-border/80 py-4 first:pt-0 last:border-0 md:grid-cols-[1.6fr_1fr_1fr_1fr_auto] md:items-center">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleWatch(pick.playerId)}
                    className={`rounded-lg border p-2 ${watchlist.includes(pick.playerId) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-primary'}`}
                  >
                    <Star size={14} fill={watchlist.includes(pick.playerId) ? 'currentColor' : 'none'} />
                  </button>
                  <div>
                    <Link href={`/players/${pick.playerId}`} className="text-sm font-bold hover:text-primary">
                      {pick.playerName}
                    </Link>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {pick.team} · {pick.market} vs {pick.opponent}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold capitalize">{pick.confidence}</div>
                  <div className="mt-1 h-1.5 w-24 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pick.signalScore, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="font-mono text-sm">{fmt(pick.projection)}</div>
                  <div className="text-[10px] text-muted-foreground">line {fmt(pick.line)}</div>
                </div>
                <div>
                  <div className="font-mono text-sm text-primary">
                    {pick.edge !== null ? `+${(pick.edge * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {pct(pick.overProbability)} over
                    {pick.overOdds !== null ? ` · ${pick.overOdds > 0 ? '+' : ''}${pick.overOdds}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 md:justify-end">
                  {pick.rationale.slice(0, 2).map((factor) => (
                    <span key={factor} className="rounded border border-secondary/25 bg-secondary/10 px-2 py-1 text-[9px] text-secondary">
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </QueryState>
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <EmptyState
            icon={Target}
            title={model?.configured ? 'No edges cleared the threshold' : 'Radar Picks needs a DunkAPI key'}
            body={
              model?.message ??
              'The model only lists a pick when its projected probability beats the de-vigged market price by the configured margin. When nothing clears that bar, the board stays empty.'
            }
          />
        ) : null}
      </div>
    </>
  );
}

function PropCard({ prop, watchlist, onWatch }: { prop: Prop; watchlist: string[]; onWatch: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onWatch(prop.playerId)}
            className={`rounded-lg border p-2 ${watchlist.includes(prop.playerId) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            <Star size={13} fill={watchlist.includes(prop.playerId) ? 'currentColor' : 'none'} />
          </button>
          <div>
            <Link href={`/players/${prop.playerId}`} className="text-sm font-bold hover:text-primary">
              {prop.playerName}
            </Link>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {prop.team} vs {prop.opponent} · {prop.market} · {prop.sportsbook ?? 'book unavailable'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-center">
          <div>
            <p className="font-mono text-sm">{fmt(prop.line)}</p>
            <p className="text-[9px] uppercase text-muted-foreground">line</p>
          </div>
          <div>
            <p className="font-mono text-sm">{fmt(prop.projection)}</p>
            <p className="text-[9px] uppercase text-muted-foreground">projection</p>
          </div>
          <div>
            <p className="font-mono text-sm text-primary">{pct(prop.overProbability)}</p>
            <p className="text-[9px] uppercase text-muted-foreground">over</p>
          </div>
          <div>
            <p className="font-mono text-sm text-primary">
              {prop.edge !== null ? `+${(prop.edge * 100).toFixed(1)}%` : '—'}
            </p>
            <p className="text-[9px] uppercase text-muted-foreground">edge</p>
          </div>
        </div>
      </div>
      {prop.rationale.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1 border-t border-border/70 pt-3">
          {prop.rationale.map((reason) => (
            <span key={reason} className="rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] text-primary">
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PropsPage() {
  const [market, setMarket] = useState<Market>('all');
  const [watchlist, toggleWatch] = useWatchlist();
  const query = useGetProps(market === 'all' ? undefined : { market }, { queryKey: getPropsQueryKey() });
  const rows = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Player markets / evidence"
        title="Prop board"
        copy="Live player-prop lines from DunkAPI paired with the RimRaider projection for the same market. Prices come straight from the sportsbooks; projections and edges come from the model."
        action={
          <Link href="/picks" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            Radar picks <ArrowUpRight size={14} />
          </Link>
        }
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {markets.map((item) => (
          <button
            key={item}
            onClick={() => setMarket(item)}
            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-semibold capitalize ${
              market === item ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {item === 'all' ? 'All markets' : item}
          </button>
        ))}
      </div>
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
      >
        <div className="space-y-2">
          {rows.map((prop) => (
            <PropCard key={prop.id} prop={prop} watchlist={watchlist} onWatch={toggleWatch} />
          ))}
        </div>
      </QueryState>
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Info}
            title="No player props to show"
            body="The board lists only the markets the model has analyzed, so it stays empty until DunkAPI returns prop lines with recent player form. Schedules, scores and injuries remain live on the other pages."
          />
        </div>
      ) : null}
    </>
  );
}

function MatchupsPage() {
  const query = useGetMatchups({ queryKey: getMatchupsQueryKey() });
  const rows: Matchup[] = query.data ?? [];
  const todayKey = new Date().toDateString();
  const showingFuture = rows.length > 0 && rows.every((row) => new Date(row.game.date).toDateString() !== todayKey);

  return (
    <>
      <PageHeader
        eyebrow="Game lab / environment"
        title="Matchups"
        copy="Every game ESPN reports for the current slate, with live scores and any verified game line. Projected pace and ratings stay blank until a model is connected."
      />
      {showingFuture ? (
        <div className="mb-4 rounded-lg border border-secondary/25 bg-secondary/5 px-4 py-3 text-xs text-secondary">
          No games are scheduled today. Showing the next slate on the ESPN schedule.
        </div>
      ) : null}
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && rows.length === 0}
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-2">
          {rows.map(({ game, projectedTotal, notes }) => (
            <div key={game.id} className="rounded-xl border border-border bg-card/70 p-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  {shortDate(game.date)} · {gameTime(game.tipoff)}
                </span>
                <span className={`rounded-full px-2 py-1 text-[9px] uppercase ${game.status === 'live' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                  {game.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-1 flex-col items-center gap-2">
                  <TeamCrest team={game.awayTeam} size="lg" />
                  <p className="text-sm font-bold">{game.awayTeam.name}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">away</p>
                </div>
                <ScoreLine game={game} />
                <div className="flex flex-1 flex-col items-center gap-2">
                  <TeamCrest team={game.homeTeam} size="lg" />
                  <p className="text-sm font-bold">{game.homeTeam.name}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">home</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-center">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Venue</p>
                  <p className="mt-1 text-xs font-semibold">{game.venue ?? 'unavailable'}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Posted total</p>
                  <p className="mt-1 text-xs font-semibold">{projectedTotal !== null ? fmt(projectedTotal) : 'not posted'}</p>
                </div>
              </div>
              {notes.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <Link href={`/games/${game.id}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                Game detail <ChevronRight size={12} />
              </Link>
            </div>
          ))}
        </div>
      </QueryState>
    </>
  );
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <Link href={`/players/${player.id}`} className="group flex items-center gap-3 rounded-xl border border-border bg-card/70 p-4 hover:border-primary/40">
      <PlayerImage player={player} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold group-hover:text-primary">{player.name}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {player.team.name} · {player.position}
          {player.jerseyNumber ? ` · #${player.jerseyNumber}` : ''}
        </p>
      </div>
      {player.points !== null ? (
        <div className="text-right">
          <p className="font-mono text-sm">{fmt(player.points)}</p>
          <p className="text-[9px] uppercase text-muted-foreground">pts</p>
        </div>
      ) : null}
      <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary" />
    </Link>
  );
}

function PlayersPage() {
  const [search, setSearch] = useState('');
  const params = search ? { search } : undefined;
  const query = useGetPlayers(params, { queryKey: getPlayersQueryKey(params) });
  const rows = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Player index / searchable"
        title="Players"
        copy="Current NBA rosters from ESPN. Season averages appear when the provider publishes them for that athlete."
        action={
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player"
              className="w-52 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </div>
        }
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && rows.length === 0}
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      </QueryState>
    </>
  );
}

function PlayerDetailPage() {
  const params = useParams<{ playerId: string }>();
  const query = useGetPlayer(params.playerId || '', { queryKey: getPlayerQueryKey(params.playerId || '') });
  const detail: PlayerDetail | undefined = query.data;
  const player = detail?.player;
  const stats = player
    ? [
        { label: 'PTS', value: player.points },
        { label: 'REB', value: player.rebounds },
        { label: 'AST', value: player.assists },
        { label: '3PM', value: player.threes },
        { label: 'STL', value: player.steals },
        { label: 'BLK', value: player.blocks },
        { label: 'TO', value: player.turnovers },
        { label: 'MIN', value: player.minutes },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Player detail / evidence"
        title={player?.name ?? 'Player detail'}
        copy={player ? `${player.team.name} · ${player.position}. ${detail?.seasonLabel ? `Season ${detail.seasonLabel}.` : 'Season averages unavailable.'}` : 'Loading the player record without filling missing fields.'}
        action={
          player ? (
            <Link href={`/teams/${player.team.id}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40">
              Open team <ArrowUpRight size={14} />
            </Link>
          ) : undefined
        }
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && !player}
        onRetry={() => void query.refetch()}
      >
        {player ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-primary/25 bg-card/70 p-5 md:p-7">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                <PlayerImage player={player} size="hero" />
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <TeamCrest team={player.team} size="xs" />
                    <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">
                      {player.team.abbreviation} / {player.position}
                    </p>
                  </div>
                  <h2 className="text-3xl font-bold tracking-[-.04em]">{player.name}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    #{player.jerseyNumber ?? '—'} · {player.status} · {player.headshotUrl ? 'provider headshot' : 'headshot unavailable'}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4 md:grid-cols-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <p className="font-mono text-lg font-bold">{fmt(stat.value)}</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold">Recent games</h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {(detail?.recentGames ?? []).length} rows
                </span>
              </div>
              {(detail?.recentGames ?? []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {['Date', 'Opponent', 'MIN', 'PTS', 'REB', 'AST', '3PM', 'STL', 'BLK', 'TO'].map((header) => (
                          <th key={header} className="border-b border-border px-3 py-3">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.recentGames ?? []).map((game, index) => (
                        <tr key={`${game.date}-${index}`} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-3">{shortDate(game.date)}</td>
                          <td className="px-3 py-3 font-semibold">{game.opponent}</td>
                          <td className="px-3 py-3 font-mono">{fmt(game.minutes)}</td>
                          <td className="px-3 py-3 font-mono">{game.points}</td>
                          <td className="px-3 py-3 font-mono">{game.rebounds}</td>
                          <td className="px-3 py-3 font-mono">{game.assists}</td>
                          <td className="px-3 py-3 font-mono">{game.threes}</td>
                          <td className="px-3 py-3 font-mono">{game.steals}</td>
                          <td className="px-3 py-3 font-mono">{game.blocks}</td>
                          <td className="px-3 py-3 font-mono">{game.turnovers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No game log" body="ESPN's roster and averages feed does not include a play-by-play game log here." />
              )}
            </section>
          </div>
        ) : null}
      </QueryState>
    </>
  );
}

function TeamsPage() {
  const query = useGetTeams({ queryKey: getTeamsQueryKey() });
  const rows = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Team index / pressure map"
        title="Teams"
        copy="All 30 NBA teams with conference, division and provider identity."
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && rows.length === 0}
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="group rounded-xl border border-border bg-card/70 p-4 hover:border-accent/40"
            >
              <div className="flex items-center gap-3">
                <TeamCrest team={team} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold group-hover:text-primary">{team.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {team.conference} · {team.division}
                  </p>
                </div>
                <ChevronRight size={15} className="text-muted-foreground group-hover:text-accent" />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{team.abbreviation}</span>
                <span>{team.logoUrl ? 'identity ready' : 'identity partial'}</span>
              </div>
            </Link>
          ))}
        </div>
      </QueryState>
    </>
  );
}

function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const query = useGetTeam(params.teamId || '', { queryKey: getTeamQueryKey(params.teamId || '') });
  const detail: TeamDetail | undefined = query.data;
  const team = detail?.team;
  const record = detail && (detail.wins !== null || detail.losses !== null) ? `${detail.wins ?? 0}-${detail.losses ?? 0}` : '—';

  return (
    <>
      <PageHeader
        eyebrow="Team detail / profile"
        title={team?.name ?? 'Team detail'}
        copy={team ? `${team.abbreviation} · ${team.conference} · ${team.division}.` : 'Loading team profile.'}
        action={
          <Link href="/players" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40">
            View player index
          </Link>
        }
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && !team}
        onRetry={() => void query.refetch()}
      >
        {team && detail ? (
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-xl border border-border bg-card/70 p-5 md:p-7">
              <div
                className="absolute inset-y-0 right-0 w-2/3 opacity-30"
                style={{ background: `radial-gradient(circle at 70% 45%, ${team.color}55, transparent 58%)` }}
              />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                <TeamCrest team={team} size="hero" />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-primary">{team.abbreviation} / team profile</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-[-.04em]">
                    {team.city} {team.name}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {team.conference} · {team.division} · record {record}
                    {team.logoUrl ? '' : ' · provider crest unavailable'}
                  </p>
                </div>
              </div>
              <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  ['Record', record],
                  ['Points for / game', detail.offensiveRating !== null ? fmt(detail.offensiveRating) : '—'],
                  ['Points against / game', detail.defensiveRating !== null ? fmt(detail.defensiveRating) : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-1 font-mono text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card/70 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold">Roster</h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {detail.roster.length} players
                </span>
              </div>
              {detail.roster.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {detail.roster.map((player) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              ) : (
                <EmptyState title="Roster unavailable" body="The provider returned no roster for this team." />
              )}
            </section>
          </div>
        ) : null}
      </QueryState>
    </>
  );
}

function WatchlistPage() {
  const [watchlist, toggleWatch] = useWatchlist();
  const query = useGetPlayers(undefined, { queryKey: getPlayersQueryKey() });
  const players = (query.data ?? []).filter((player) => watchlist.includes(player.id));

  return (
    <>
      <PageHeader
        eyebrow="Browser local / personal board"
        title="Watchlist"
        copy="A private browser-persisted shortlist. Nothing syncs to the server, and removing a name is immediate."
        action={
          watchlist.length > 0 ? (
            <button
              onClick={() => watchlist.forEach((id) => toggleWatch(id))}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-destructive/40 hover:text-destructive"
            >
              <X size={14} /> Clear all
            </button>
          ) : undefined
        }
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && players.length === 0}
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {players.map((player) => (
            <div key={player.id} className="relative">
              <PlayerCard player={player} />
              <button
                onClick={() => toggleWatch(player.id)}
                className="absolute right-3 top-3 rounded-md p-1 text-primary hover:bg-primary/10"
              >
                <Star size={14} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      </QueryState>
    </>
  );
}

function PerformanceRow({ metric }: { metric: ModelPerformance }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs font-semibold capitalize">{metric.market}</div>
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.min((metric.hitRate ?? 0) * 100, 100)}%` }} />
      </div>
      <div className="w-12 text-right font-mono text-xs text-secondary">{pct(metric.hitRate)}</div>
      <div className="w-16 text-right text-[10px] text-muted-foreground">{metric.sampleSize} n</div>
    </div>
  );
}

function AuditPage() {
  const audit = useGetAudit({ queryKey: getAuditQueryKey() });
  const performance = useGetModelPerformance({ queryKey: getModelPerformanceQueryKey() });
  const rows: AuditRecord[] = audit.data ?? [];
  const metrics: ModelPerformance[] = performance.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Transparent history / no hindsight"
        title="Audit trail"
        copy="Immutable prediction metadata and aggregate model performance. Records appear only after a model produces and scores picks."
        action={
          <Link href="/admin" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40">
            <Database size={14} /> Data health
          </Link>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {metrics.slice(0, 3).map((metric) => (
          <StatCard key={metric.market} label={`${metric.market} hit rate`} value={pct(metric.hitRate)} note={`${metric.sampleSize} scored records`} accent="violet" icon={TrendingUp} />
        ))}
      </div>
      <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Prediction records</h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{rows.length} visible</span>
        </div>
        <QueryState
          loading={audit.isLoading}
          error={audit.isError}
          errorMessage={audit.error?.message}
          empty={!audit.isLoading && !audit.isError && rows.length === 0}
          onRetry={() => void audit.refetch()}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {['Recorded', 'Player', 'Team', 'Market', 'Projection', 'Status'].map((header) => (
                    <th key={header} className="border-b border-border px-3 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3 text-muted-foreground">{shortDate(record.recordedAt)}</td>
                    <td className="px-3 py-3 font-semibold">{record.playerName}</td>
                    <td className="px-3 py-3">{record.team}</td>
                    <td className="px-3 py-3 capitalize">{record.market}</td>
                    <td className="px-3 py-3 font-mono">{fmt(record.projection)}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-muted bg-muted px-2 py-1 text-[9px] uppercase text-muted-foreground">
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
        {metrics.length > 0 ? (
          <div className="mt-5 space-y-3">
            {metrics.map((metric) => (
              <PerformanceRow key={metric.market} metric={metric} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

function AdminPage() {
  const health = useHealthCheck();
  const dataHealth = useDataHealth({ queryKey: getDataHealthQueryKey() });
  const { sync, isSyncing, result, error } = useSyncNbaData();
  const [message, setMessage] = useState<string | null>(null);

  const runSync = async () => {
    await sync();
    await Promise.all([health.refetch(), dataHealth.refetch()]);
  };

  const runChecks = async () => {
    setMessage(null);
    await Promise.all([health.refetch(), dataHealth.refetch()]);
    setMessage('Checks complete — the API is reachable. No import was run.');
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations / provider sync"
        title="Data health"
        copy="Inspect the live ESPN connection, the last successful import, and which data layers are still unavailable."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing ESPN data' : 'Sync ESPN data'}
            </button>
            <button
              onClick={runChecks}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary"
            >
              <RefreshCw size={14} /> Run checks
            </button>
          </div>
        }
      />

      {result ? (
        <div className={`mb-5 rounded-lg border px-4 py-3 text-xs ${result.ok ? 'border-primary/25 bg-primary/5 text-primary' : 'border-destructive/25 bg-destructive/5 text-destructive'}`}>
          {result.message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          Sync failed: {error.message}
        </div>
      ) : null}
      {message ? <div className="mb-5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-primary">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Activity size={17} /></div>
            <div>
              <h2 className="font-bold">API heartbeat</h2>
              <p className="text-xs text-muted-foreground">Local server reachability</p>
            </div>
            <span className={`ml-auto rounded-full border px-2 py-1 text-[9px] uppercase ${health.isError ? 'border-destructive/30 text-destructive' : 'border-primary/30 text-primary'}`}>
              {health.isLoading ? 'checking' : health.isError ? 'error' : health.data?.status ?? 'ready'}
            </span>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Endpoint</span>
              <span className="font-mono text-xs">/api/healthz</span>
            </div>
            <div className="flex justify-between border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-mono text-xs">{dataHealth.data?.provider ?? 'ESPN'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last successful sync</span>
              <span className="font-mono text-xs">
                {dataHealth.data?.lastSuccessfulSync ? shortDate(dataHealth.data.lastSuccessfulSync) : 'never'}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-secondary/10 p-2 text-secondary"><Database size={17} /></div>
            <div>
              <h2 className="font-bold">Import status</h2>
              <p className="text-xs text-muted-foreground">Indexed entities from provider</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Teams</span>
              <span className="font-mono text-xs">{dataHealth.data?.teamsImported ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Games on slate</span>
              <span className="font-mono text-xs">{dataHealth.data?.gamesImported ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Roster players</span>
              <span className="font-mono text-xs">{dataHealth.data?.playersImported ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connection</span>
              <span className="font-mono text-xs">{dataHealth.data?.connection ?? 'unknown'}</span>
            </div>
          </div>
          {dataHealth.data?.errors?.length ? (
            <ul className="mt-4 space-y-1 border-t border-border/70 pt-3 text-[10px] text-destructive">
              {dataHealth.data.errors.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card/70 p-5 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-accent/10 p-2 text-accent"><CircleAlert size={17} /></div>
          <div>
            <h2 className="font-bold">Data layers</h2>
            <p className="text-xs text-muted-foreground">What this build can and cannot show</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Schedule & scores', 'Live · ESPN scoreboard', true],
            ['Teams & rosters', 'Live · ESPN teams and rosters', true],
            ['Injuries', 'Live · ESPN injury report', true],
            ['Game lines (ML/spread/total)', 'Live · ESPN sportsbook partners', true],
            ['Player props', 'Not connected', false],
            ['Projection model', 'Not connected', false],
          ].map(([label, detail, available]) => (
            <div key={String(label)} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-3">
              <div>
                <p className="text-xs font-semibold">{label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
              </div>
              <span className={`h-2 w-2 rounded-full ${available ? 'bg-primary' : 'bg-muted-foreground'}`} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function GameDetailRoute() {
  const params = useParams<{ gameId: string }>();
  const query = useGetGame(params.gameId || '', { queryKey: getGameQueryKey(params.gameId || '') });
  const odds = useGetOdds({ queryKey: getOddsQueryKey() });
  const game = query.data;
  const line = odds.data?.games.find((entry) => entry.game.id === game?.id);

  return (
    <>
      <PageHeader
        eyebrow="Game detail / environment"
        title={game ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}` : 'Game detail'}
        copy={game ? `${shortDate(game.date)} · ${gameTime(game.tipoff)} · ${game.venue ?? 'venue unavailable'}` : 'Loading game record.'}
      />
      <QueryState
        loading={query.isLoading}
        error={query.isError}
        errorMessage={query.error?.message}
        empty={!query.isLoading && !query.isError && !game}
        onRetry={() => void query.refetch()}
      >
        {game ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card/70 p-6">
              <div className="flex items-start justify-center gap-6">
                <div className="flex flex-col items-center gap-2">
                  <TeamCrest team={game.awayTeam} size="lg" />
                  <p className="text-center text-sm font-bold">{game.awayTeam.name}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">away</p>
                </div>
                <div className="mt-6"><ScoreLine game={game} /></div>
                <div className="flex flex-col items-center gap-2">
                  <TeamCrest team={game.homeTeam} size="lg" />
                  <p className="text-center text-sm font-bold">{game.homeTeam.name}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">home</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 md:grid-cols-4">
                <div className="rounded-lg bg-muted/60 p-3 text-center">
                  <p className="font-mono text-[9px] uppercase text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-bold capitalize">{game.status}</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-center">
                  <p className="font-mono text-[9px] uppercase text-muted-foreground">Venue</p>
                  <p className="mt-1 text-sm font-bold">{game.venue ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-center">
                  <p className="font-mono text-[9px] uppercase text-muted-foreground">Posted total</p>
                  <p className="mt-1 text-sm font-bold">
                    {line?.sportsbooks.flatMap((book) => book.markets).find((market) => market.key === 'total')?.outcomes[0]?.point ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-center">
                  <p className="font-mono text-[9px] uppercase text-muted-foreground">Books</p>
                  <p className="mt-1 text-sm font-bold">{line?.sportsbooks.length ?? 0}</p>
                </div>
              </div>
            </div>

            {line ? (
              <section className="rounded-xl border border-border bg-card/70 p-5 md:p-6">
                <h2 className="mb-4 font-bold">Verified prices</h2>
                <div className="space-y-3">
                  {line.sportsbooks.map((book) => (
                    <div key={book.key} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-bold">{book.title}</p>
                      <div className="space-y-2">
                        {book.markets.map((market) => (
                          <div key={market.key} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[9px] uppercase text-muted-foreground">{market.label}</span>
                            <div className="flex flex-wrap gap-2">
                              {market.outcomes.map((outcome) => (
                                <span key={outcome.name} className="rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[10px]">
                                  {outcome.name} {outcome.point !== null ? pointLabel(outcome.point, market.key) : ''}{' '}
                                  <b className="text-primary">{price(outcome.price)}</b>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState icon={Clock3} title="No verified prices" body="No sportsbook partner published a line for this game." />
            )}
          </div>
        ) : null}
      </QueryState>
    </>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <AppShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/picks" component={PicksPage} />
          <Route path="/props" component={PropsPage} />
          <Route path="/matchups" component={MatchupsPage} />
          <Route path="/players" component={PlayersPage} />
          <Route path="/players/:playerId" component={PlayerDetailPage} />
          <Route path="/teams" component={TeamsPage} />
          <Route path="/teams/:teamId" component={TeamDetailPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/audit" component={AuditPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/games/:gameId" component={GameDetailRoute} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );
}

export default App;
