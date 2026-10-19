import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bookmark,
  Check, ChevronDown, CircleHelp, Clock3, Crosshair, Database, Filter,
  Gauge, LayoutDashboard, Menu, Search, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, Trophy, Users, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetNbaGameQueryKey, getGetNbaPlayerQueryKey, getGetNbaTeamQueryKey,
  useGetNbaAudit, useGetNbaDataStatus, useGetNbaDashboardSummary,
  useGetNbaGame, useGetNbaGames, useGetNbaLiveAlerts, useGetNbaMatchups,
  useGetNbaModelPerformance, useGetNbaPlayer, useGetNbaPlayers, useGetNbaProps,
  useGetNbaSnipes, useGetNbaTeam, useGetNbaTeams, useHealthCheck,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Market = 'all' | 'points' | 'rebounds' | 'assists' | 'threes' | 'steals' | 'blocks' | 'turnovers' | 'pra';
const marketNames: Record<string, string> = {
  points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threes: '3-pointers',
  steals: 'Steals', blocks: 'Blocks', turnovers: 'Turnovers', pra: 'PRA',
};
const markets: Market[] = ['all', 'points', 'rebounds', 'assists', 'threes', 'steals', 'blocks', 'turnovers', 'pra'];
const navGroups = [
  { label: 'COURT SIDE', items: [{ href: '/', title: 'Slate overview', icon: LayoutDashboard }, { href: '/snipes', title: 'Top signals', icon: Crosshair }, { href: '/props', title: 'Prop board', icon: BarChart3 }, { href: '/matchups', title: 'Matchups', icon: Activity }] },
  { label: 'THE LEAGUE', items: [{ href: '/players', title: 'Players', icon: Users }, { href: '/teams', title: 'Teams', icon: ShieldCheck }] },
  { label: 'MY WORKSPACE', items: [{ href: '/slip-builder', title: 'Slip builder', icon: SlidersHorizontal }, { href: '/watchlist', title: 'Watchlist', icon: Bookmark }] },
  { label: 'MODEL ROOM', items: [{ href: '/audit', title: 'Model audit', icon: Database }, { href: '/performance', title: 'Performance', icon: Gauge }] },
];

function AppShell() {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const dataStatus = useGetNbaDataStatus();
  const feedMode = dataStatus.data?.mode ?? 'unavailable';
  const feedLabel = feedMode === 'live' ? 'LIVE DATA' : feedMode === 'stale' ? 'STALE DATA' : 'SOURCE OFFLINE';
  const title = navGroups.flatMap((g) => g.items).find((i) => i.href === path)?.title ??
    (path.startsWith('/players/') ? 'Player profile' : path.startsWith('/teams/') ? 'Team profile' : 'NBA Snipes');
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" onClick={() => setMobileOpen(false)}>
        <span className="brand-mark"><span></span><span></span><span></span></span>
        <span className="brand-name">NBA<span>SNIPES</span><small>ANALYTICS</small></span>
      </Link>
      <div className="sidebar-season"><span className="season-dot"></span> NBA SEASON <span className="season-tag">NO FEED</span></div>
      <nav className="side-nav">
        {navGroups.map((group) => <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          {group.items.map(({ href, title: itemTitle, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-link ${path === href ? 'nav-active' : ''}`} data-testid={`link-nav-${itemTitle.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={17} strokeWidth={1.8} /><span>{itemTitle}</span>
          </Link>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="side-note"><div className="side-note-icon"><CircleHelp size={16}/></div><div><strong>Independent analysis</strong><p>Not affiliated with or endorsed by the NBA.</p></div></div>
        <div className="sidebar-foot"><span>BUILT FOR THE BOX SCORE</span><span>v0.1.0</span></div>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19}/></button>
        <div className="crumb"><span>NBA SNIPES</span><b>/</b><strong>{title.toUpperCase()}</strong></div>
        <div className="topbar-right"><span className={`source-status-pill status-${feedMode}`}><span></span>{feedLabel}</span><span className="topbar-season">{dataStatus.data?.provider ?? 'NBA · LIVE FEED REQUIRED'}</span><div className="user-mark">NS</div></div>
      </header>
      <div className="page-wrap">
        <Switch>
          <Route path="/" component={DashboardPage}/>
          <Route path="/snipes" component={SnipesPage}/>
          <Route path="/props" component={PropsPage}/>
          <Route path="/slip-builder" component={SlipBuilderPage}/>
          <Route path="/matchups" component={MatchupsPage}/>
          <Route path="/players/:playerId" component={PlayerProfilePage}/>
          <Route path="/players" component={PlayersPage}/>
          <Route path="/teams/:teamId" component={TeamProfilePage}/>
          <Route path="/teams" component={TeamsPage}/>
          <Route path="/watchlist" component={WatchlistPage}/>
          <Route path="/audit" component={AuditPage}/>
          <Route path="/performance" component={PerformancePage}/>
          <Route component={NotFound}/>
        </Switch>
        <footer className="page-footer"><span>NBA SNIPES ANALYTICS <i>·</i> INDEPENDENT RESEARCH</span><span>Not affiliated with or endorsed by the National Basketball Association.</span></footer>
      </div>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span></span>{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
function PanelTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) { return <div className="panel-title"><h2>{children}</h2>{meta}</div>; }
function DataNotice({ status, fallback = 'No verified data source is connected.' }: { status?: { mode?: string; provider?: string; message?: string; lastUpdated?: string | null }; fallback?: string }) {
  const mode = status?.mode ?? 'unavailable';
  const label = mode === 'live' ? 'LIVE PROVIDER' : mode === 'stale' ? 'STALE DATA' : mode === 'unavailable' ? 'SOURCE OFFLINE' : 'SOURCE STATUS UNKNOWN';
  return <div className={`data-notice notice-${mode}`}><span className="notice-icon">{mode === 'live' ? <Activity size={14}/> : mode === 'unavailable' ? <ShieldAlert size={14}/> : <Database size={14}/>}</span><div><strong>{label}</strong><span>{status?.message || fallback}{status?.provider ? ` · ${status.provider}` : ''}</span></div>{status?.lastUpdated && <small>{new Date(status.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}</div>;
}
function LoadingPanel({ rows = 4 }: { rows?: number }) { return <div className="skeleton-stack">{Array.from({ length: rows }, (_, i) => <div className="skeleton-line" key={i}/>)}</div>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><span className="empty-whistle"><Crosshair size={19}/></span><strong>{title}</strong><p>{body}</p></div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="error-state"><ShieldAlert size={18}/><span>Couldn’t load this feed.</span><button onClick={retry}>Try again</button></div>; }
function Metric({ label, value, suffix, accent }: { label: string; value: ReactNode; suffix?: string; accent?: string }) { return <div className="metric"><span>{label}</span><strong style={accent ? { color: accent } : undefined}>{value}{suffix && <small>{suffix}</small>}</strong></div>; }
function StatPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) { return <span className={`stat-pill ${tone}`}>{children}</span>; }
function marketLabel(market: string) { return marketNames[market] || market.toUpperCase(); }
function fmtLine(value: number | null | undefined) { return value == null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1); }
function fmtProbability(value: number | null | undefined) { return value == null ? '—' : `${(value * 100).toFixed(1)}%`; }
function fmtDelta(value: number | null | undefined) { return value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`; }
function initials(name: string) { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }
function PlayerAvatar({ name, image, size = 'md' }: { name: string; image?: string | null; size?: string }) {
  return image ? <img className={`avatar avatar-${size}`} src={image} alt={name} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span className={`avatar avatar-${size}`}>{initials(name)}</span>;
}
function GameCard({ game }: { game: any }) {
  const live = game.status === 'live';
  return <div className="game-card">
    <div className="game-meta"><span className={live ? 'live-label' : ''}>{live ? <><i className="live-dot"/> LIVE · Q{game.period ?? 1} {game.clock ?? ''}</> : game.status === 'final' ? 'FINAL' : new Date(game.tipoff || game.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span>{game.date ? new Date(game.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TODAY'}</span></div>
    {[game.awayTeam, game.homeTeam].map((team: any, i: number) => <div className="game-team" key={team.id || team.abbreviation}>
      <span className="team-monogram" style={{ '--team-color': team.color || '#d44b38' } as CSSProperties}>{team.abbreviation}</span><strong>{team.city || team.name}</strong><b>{(i === 0 ? game.awayScore : game.homeScore) ?? (game.status === 'scheduled' ? '' : '—')}</b>
    </div>)}
    <div className="game-card-foot"><span>{game.status === 'scheduled' ? 'TIP-OFF' : 'GAME CENTER'}</span><ArrowRight size={14}/></div>
  </div>;
}
function useStoredList<T,>(key: string): [T[], (next: T[] | ((old: T[]) => T[])) => void] {
  const [items, setItems] = useState<T[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; } });
  const update = (next: T[] | ((old: T[]) => T[])) => setItems((old) => {
    const value = typeof next === 'function' ? next(old) : next;
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  });
  return [items, update];
}

function DashboardPage() {
  const status = useGetNbaDataStatus();
  const health = useHealthCheck();
  const summary = useGetNbaDashboardSummary();
  const gamesQuery = useGetNbaGames();
  const alertsQuery = useGetNbaLiveAlerts();
  const dataStatus = status.data || summary.data?.dataStatus;
  const feedUnavailable = dataStatus?.mode === 'unavailable';
  const games = summary.data?.games?.length ? summary.data.games : gamesQuery.data || [];
  const top = summary.data?.topEdges || [];
  const alerts = alertsQuery.data?.events || [];
  return <div className="page-content">
    <PageHeading eyebrow="SLATE DESK" title="The board, at a glance." subtitle="NBA schedules, stats and player markets from verified sources." action={<Link href="/snipes" className="button-primary"><Crosshair size={16}/> Explore signals <ArrowRight size={15}/></Link>}/>
    <DataNotice status={dataStatus}/>
    <div className="hero-band"><div className="court-lines"></div><div className="hero-copy"><div className="hero-kicker"><span className="hero-mark"></span> TONIGHT’S SLATE <span className="kicker-divider"></span>{feedUnavailable ? 'SOURCE STATUS: OFFLINE' : summary.data?.date ? new Date(summary.data.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : 'WAITING FOR VERIFIED DATA'}</div><h2>Read the game.<br/><em>Then read the numbers.</em></h2><p>Independent player-prop analysis with the why behind every signal.</p></div><div className="hero-score"><div className="score-top"><span>SLATE HEALTH</span><span className={feedUnavailable || health.isError ? 'health-off' : 'health-on'}><i/>{feedUnavailable ? 'SOURCE OFFLINE' : health.isError ? 'CHECK SOURCE' : 'FEED CONNECTED'}</span></div><div className="hero-score-num">{feedUnavailable ? '—' : summary.data?.gamesOnSlate ?? (games.length || '—')}<small> GAMES</small></div><div className="score-bottom"><span>{feedUnavailable ? 'Awaiting verified data' : `${summary.data?.playersAnalyzed ?? '—'} players scanned`}</span><span className="score-arrow"><ArrowUpRight size={16}/></span></div></div></div>
    <div className="metric-grid">
      <Metric label="GAMES ON SLATE" value={feedUnavailable ? '—' : summary.data?.gamesOnSlate ?? (games.length || '—')} suffix={feedUnavailable ? ' source required' : ' matchups'}/>
      <Metric label="PLAYERS ANALYZED" value={feedUnavailable ? '—' : summary.data?.playersAnalyzed ?? '—'} suffix={feedUnavailable ? ' source required' : ' in pool'}/>
      <Metric label="TOP MODEL CONFIDENCE" value={feedUnavailable ? '—' : fmtProbability(summary.data?.topConfidence)} accent="hsl(var(--secondary))"/>
      <Metric label="LIVE GAMES" value={feedUnavailable ? '—' : summary.data?.liveGames ?? games.filter((g: any) => g.status === 'live').length} suffix={feedUnavailable ? ' source required' : ' right now'}/>
    </div>
    <div className="dashboard-grid">
      <Panel className="games-panel"><PanelTitle meta={<Link href="/matchups" className="text-link">Full matchup board <ArrowRight size={14}/></Link>}>Today’s matchups</PanelTitle>
        {summary.isLoading || gamesQuery.isLoading ? <LoadingPanel rows={3}/> : summary.isError && gamesQuery.isError ? <ErrorState retry={() => { void summary.refetch(); void gamesQuery.refetch(); }}/> : games.length ? <div className="games-grid">{games.slice(0, 6).map((game: any) => <GameCard game={game} key={game.id}/>)}</div> : <EmptyState title="No games in this slate" body="Game schedules are currently unavailable from the data provider."/>}
      </Panel>
      <Panel className="alerts-panel"><PanelTitle meta={<span className="mini-mode">{alertsQuery.data?.mode === 'live' ? 'LIVE FEED' : alertsQuery.data?.mode === 'unavailable' ? 'SOURCE OFFLINE' : 'WAITING FOR FEED'}</span>}>Court watch</PanelTitle>
        {alertsQuery.isLoading ? <LoadingPanel rows={3}/> : alertsQuery.isError ? <ErrorState retry={() => void alertsQuery.refetch()}/> : alerts.length ? <div className="alert-list">{alerts.slice(0, 4).map((a: any) => <div className="alert-row" key={a.id}><span className="alert-kind">{a.kind === 'milestone' ? <Trophy size={14}/> : <Activity size={14}/>}</span><div><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div></div>)}</div> : <div className="waiting-state"><Clock3 size={21}/><strong>No live events to report</strong><p>{alertsQuery.data?.dataStatus?.message || 'Live alerts appear only when a verified game feed is connected.'}</p></div>}
      </Panel>
    </div>
     <Panel className="signal-panel"><PanelTitle meta={<Link href="/snipes" className="text-link">View all signals <ArrowRight size={14}/></Link>}>Signals to know <span className="section-subtitle">Verified projections only</span></PanelTitle>
      {summary.isLoading ? <LoadingPanel rows={3}/> : summary.isError ? <ErrorState retry={() => void summary.refetch()}/> : top.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>RANK / PLAYER</th><th>MARKET</th><th>LINE</th><th>MODEL</th><th>LINE GAP</th><th>CONFIDENCE</th></tr></thead><tbody>{top.slice(0, 5).map((s: any) => <tr key={s.id}><td><div className="player-cell"><span className="rank-cell">{String(s.rank).padStart(2, '0')}</span><div><strong>{s.playerName}</strong><small>{s.team} · vs {s.opponent}</small></div></div></td><td>{marketLabel(s.market)}</td><td>{fmtLine(s.line)}</td><td className="model-value">{fmtLine(s.projection)}</td><td className="edge-value">{fmtDelta(s.edge)}</td><td><StatPill tone={s.confidence === 'high' ? 'good' : 'neutral'}>{s.confidence}</StatPill></td></tr>)}</tbody></table></div> : <EmptyState title="No ranked signals available" body="Verified stats and sportsbook markets must be connected before projections can appear."/>}
    </Panel>
    <div className="disclaimer-strip"><ShieldAlert size={15}/><span>No picks or projections are shown until the underlying NBA statistics and sportsbook markets can be verified.</span></div>
  </div>;
}

function MarketTabs({ selected, onSelect }: { selected: Market; onSelect: (m: Market) => void }) { return <div className="market-tabs">{markets.map((m) => <button key={m} className={selected === m ? 'market-tab selected' : 'market-tab'} onClick={() => onSelect(m)} data-testid={`filter-market-${m}`}>{m === 'all' ? 'All markets' : marketLabel(m)}</button>)}</div>; }
function SnipesPage() {
  const [market, setMarket] = useState<Market>('all');
  const query = useGetNbaSnipes(market === 'all' ? undefined : { market });
  const [watch, setWatch] = useStoredList<string>('nba-snipes-watchlist-v2');
  const snipes = (query.data || []).slice().sort((a: any, b: any) => a.rank - b.rank);
  return <div className="page-content">
    <PageHeading eyebrow="MODEL SIGNALS" title="Find the edge." subtitle="Ranked player props, with the reasoning left in." action={<Link href="/audit" className="button-secondary"><Database size={15}/> Model inputs</Link>}/>
    <DataNotice status={snipes[0]?.dataStatus} fallback="Verified NBA statistics and market odds are required before rankings can be shown."/>
    <div className="filter-row"><MarketTabs selected={market} onSelect={setMarket}/><span className="count-label">{query.data?.length ? query.data.length : '—'} signals</span></div>
    <Panel className="signal-list-panel">
       {query.isLoading ? <LoadingPanel rows={6}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : snipes.length ? <div className="table-wrap"><table className="data-table snipes-table"><thead><tr><th># / PLAYER</th><th>PROP</th><th>LINE</th><th>PROJECTION</th><th>OVER CHANCE</th><th>LINE GAP</th><th>SIGNAL</th><th></th></tr></thead><tbody>{snipes.map((s: any) => <tr key={s.id}><td><div className="player-cell"><span className="rank-cell">{String(s.rank).padStart(2, '0')}</span><div><strong>{s.playerName}</strong><small>{s.team} vs {s.opponent}</small></div></div></td><td>{marketLabel(s.market)}</td><td>{fmtLine(s.line)} <small className="muted">{s.sportsbook || 'market line'}</small></td><td><span className="model-value">{fmtLine(s.projection)}</span><small className="table-sub">{fmtProbability(s.overProbability)} model over</small></td><td><div className="probability"><span style={{ width: `${Math.min(100, Math.max(0, s.overProbability * 100))}%`}}></span></div><small>{fmtProbability(s.overProbability)}</small></td><td className="edge-value">{fmtDelta(s.edge)}</td><td><StatPill tone={s.confidence === 'high' ? 'good' : 'neutral'}>{s.confidence}</StatPill></td><td><button className={`icon-button save-button ${watch.includes(s.id) ? 'is-saved' : ''}`} aria-label="Save signal" onClick={() => setWatch((old) => old.includes(s.id) ? old.filter((id) => id !== s.id) : [...old, s.id])}><Bookmark size={16}/></button></td></tr>)}</tbody></table></div> : <EmptyState title="No signals for this market" body="There are no provider-backed signals to display for this selection. Try another market or check back later."/>}
    </Panel>
    {snipes.length > 0 && <div className="reasoning-grid">{snipes.slice(0, 2).map((s: any) => <Panel key={s.id} className="reason-card"><div className="reason-top"><span className="reason-icon"><Sparkles size={15}/></span><span>WHY THIS SIGNAL</span><span className="reason-score">SCORE {s.signalScore}</span></div><h3>{s.playerName} <span>{marketLabel(s.market)}</span></h3><p>{s.rationale?.join(' ') || 'No rationale was supplied by the provider.'}</p><div className="reason-foot"><span>{s.team} vs {s.opponent}</span><span>Projection {fmtLine(s.projection)} vs line {fmtLine(s.line)}</span></div></Panel>)}</div>}
    <div className="disclaimer-strip"><ShieldAlert size={15}/><span>Signal scores are model outputs, not guarantees. This board displays only projections with verified inputs.</span></div>
  </div>;
}
function PropsPage() {
  const [market, setMarket] = useState<Market>('all');
  const [search, setSearch] = useState('');
  const query = useGetNbaProps(market === 'all' ? undefined : { market });
  const [watch, setWatch] = useStoredList<string>('nba-snipes-watchlist-v2');
  const filtered = useMemo(() => (query.data || []).filter((p: any) => `${p.playerName} ${p.team} ${p.opponent}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  return <div className="page-content">
    <PageHeading eyebrow="MARKET EXPLORER" title="The prop board." subtitle="Search and compare player markets across the available slate." action={<span className="read-only-tag"><Database size={14}/> Provider dependent</span>}/>
    <DataNotice status={filtered[0]?.dataStatus} fallback="A verified sportsbook market feed is required before player props can be displayed."/>
    <Panel className="board-panel">
       <div className="board-tools"><div className="search-wrap"><Search size={16}/><input aria-label="Search props" data-testid="input-prop-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player, team or opponent"/></div><div className="filter-wrap"><Filter size={15}/><select aria-label="Market filter" value={market} onChange={(e) => setMarket(e.target.value as Market)} data-testid="select-prop-market">{markets.map((m) => <option key={m} value={m}>{m === 'all' ? 'All markets' : marketLabel(m)}</option>)}</select><ChevronDown size={14}/></div><span className="count-label">{filtered.length || '—'} props</span></div>
       {query.isLoading ? <LoadingPanel rows={7}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : filtered.length ? <div className="table-wrap"><table className="data-table prop-table"><thead><tr><th>PLAYER / GAME</th><th>MARKET</th><th>LINE</th><th>PROJECTION</th><th>OVER PROB.</th><th>LINE GAP</th><th>BOOK</th><th></th></tr></thead><tbody>{filtered.map((p: any) => <tr key={p.id}><td><div className="player-cell"><div><strong>{p.playerName}</strong><small>{p.team} · vs {p.opponent}</small></div></div></td><td>{marketLabel(p.market)}</td><td>{fmtLine(p.line)}</td><td className="model-value">{fmtLine(p.projection)}</td><td>{fmtProbability(p.overProbability)}</td><td className={p.edge && p.edge > 0 ? 'edge-value' : ''}>{fmtDelta(p.edge)}</td><td>{p.sportsbook || '—'}</td><td><button className={`icon-button save-button ${watch.includes(p.id) ? 'is-saved' : ''}`} onClick={() => setWatch((old) => old.includes(p.id) ? old.filter((id) => id !== p.id) : [...old, p.id])} aria-label={`Save ${p.playerName} prop`}><Bookmark size={15}/></button></td></tr>)}</tbody></table></div> : <EmptyState title={search ? 'No matching props' : 'No props available'} body={search ? 'Try a different player, team or opponent.' : 'No player prop markets are available until a verified sportsbook feed is connected.'}/>}
    </Panel>
  </div>;
}
function SlipBuilderPage() {
  const query = useGetNbaProps();
  const [selected, setSelected] = useStoredList<any>('nba-snipes-slip-v2');
  const [stake, setStake] = useState('10');
  const [search, setSearch] = useState('');
  const candidates = (query.data || []).filter((p: any) => `${p.playerName} ${p.team}`.toLowerCase().includes(search.toLowerCase()));
  const estimate = selected.reduce((acc: number, item: any) => acc * (item.odds > 0 ? 1 + item.odds / 100 : 1 + 100 / Math.abs(item.odds || -110)), 1);
  return <div className="page-content">
    <PageHeading eyebrow="BROWSER-ONLY WORKSPACE" title="Build a slip." subtitle="Collect single picks or combine legs. Your selections stay in this browser." action={<span className="read-only-tag"><Bookmark size={14}/> Saved locally</span>}/>
    <DataNotice status={candidates[0]?.dataStatus} fallback="Payouts use listed odds when available; otherwise a rough -110 estimate. This is an educational calculator, not a wagering service."/>
    <div className="slip-layout">
       <Panel className="slip-pick-panel"><div className="board-tools slip-search"><div className="search-wrap"><Search size={16}/><input aria-label="Search slip picks" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a player prop"/></div><span className="count-label">{candidates.length || '—'} available</span></div>
        {query.isLoading ? <LoadingPanel rows={5}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : candidates.length ? <div className="pick-candidates">{candidates.slice(0, 16).map((p: any) => <div className="pick-candidate" key={p.id}><div><strong>{p.playerName}</strong><small>{marketLabel(p.market)} {p.line == null ? 'line unavailable' : `over ${p.line}`} · {p.team} vs {p.opponent}</small></div><button className="add-pick" onClick={() => setSelected((old) => old.some((i: any) => i.id === p.id) ? old : [...old, { id: p.id, playerName: p.playerName, market: p.market, line: p.line, side: 'Over', odds: p.overOdds, projection: p.projection }])}>{selected.some((i: any) => i.id === p.id) ? <Check size={15}/> : <span>+</span>} {selected.some((i: any) => i.id === p.id) ? 'Added' : 'Add'}</button></div>)}</div> : <EmptyState title="No props to add" body="The prop provider has not supplied candidate legs."/>}
      </Panel>
      <Panel className="slip-card"><div className="slip-head"><div><span className="eyebrow"><span/> YOUR BUILD</span><h2>Slip builder</h2></div><span className="local-badge">LOCAL ONLY</span></div>
        <div className="slip-mode"><button className="mode-on">Parlay <small>{selected.length} legs</small></button><button onClick={() => { if (selected.length > 1) setSelected(selected.slice(0, 1)); }} className="mode-alt">Singles</button></div>
        <div className="slip-legs">{selected.length ? selected.map((item: any) => <div className="slip-leg" key={item.id}><span className="leg-marker"></span><div><strong>{item.playerName}</strong><small>{marketLabel(item.market)} {item.side} {fmtLine(item.line)}</small></div><span className="leg-odds">{item.odds ? `${item.odds > 0 ? '+' : ''}${item.odds}` : '—'}</span><button className="icon-button" aria-label="Remove leg" onClick={() => setSelected((old) => old.filter((i: any) => i.id !== item.id))}><X size={15}/></button></div>) : <div className="slip-empty"><Crosshair size={20}/><strong>Your slip is open.</strong><span>Add a pick from the board to begin.</span></div>}</div>
        <label className="stake-label">STAKE<input type="number" min="0" step="0.5" value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Stake amount"/></label>
        <div className="payout-estimate"><span>ESTIMATED RETURN</span><strong>{selected.length ? `$${(Number(stake || 0) * estimate).toFixed(2)}` : '—'}</strong><small>{selected.length ? 'Estimate from the selected market odds' : 'Add verified odds to calculate an estimate'}</small></div>
        <button className="button-secondary clear-slip" onClick={() => setSelected([])} disabled={!selected.length}>Clear slip</button>
        <div className="slip-disclaimer">No picks are submitted or stored remotely. This calculator is not connected to a sportsbook.</div>
      </Panel>
    </div>
  </div>;
}
function MatchupsPage() {
  const matchupsQuery = useGetNbaMatchups();
  const gamesQuery = useGetNbaGames();
  const entries = matchupsQuery.data || [];
  const [selectedId, setSelectedId] = useState('');
  const currentId = selectedId || entries[0]?.game?.id || gamesQuery.data?.[0]?.id || '';
  const gameQuery = useGetNbaGame(currentId, { query: { enabled: !!currentId, queryKey: getGetNbaGameQueryKey(currentId) } });
  return <div className="page-content">
    <PageHeading eyebrow="GAME ENVIRONMENT" title="Matchup notebook." subtitle="Pace, scoring context and team-level signals for each game."/>
    <DataNotice status={entries[0]?.dataStatus} fallback="Verified schedules and team statistics are required before matchup analysis can be shown."/>
    {matchupsQuery.isLoading ? <LoadingPanel rows={5}/> : matchupsQuery.isError ? <ErrorState retry={() => void matchupsQuery.refetch()}/> : entries.length ? <div className="matchup-layout">
      <div className="matchup-list">{entries.map((m: any) => <button key={m.game.id} onClick={() => setSelectedId(m.game.id)} className={`matchup-select ${m.game.id === currentId ? 'active' : ''}`}><div className="matchup-select-top"><span>{m.game.status === 'live' ? 'LIVE' : 'GAME ENVIRONMENT'}</span><span>{m.game.tipoff ? new Date(m.game.tipoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span></div><strong>{m.game.awayTeam.abbreviation} <i>@</i> {m.game.homeTeam.abbreviation}</strong><small>{m.game.awayTeam.city} at {m.game.homeTeam.city}</small></button>)}</div>
      <Panel className="matchup-detail"><PanelTitle meta={<span className="mini-mode">MODEL SNAPSHOT</span>}>Game environment</PanelTitle>
        {gameQuery.isLoading ? <LoadingPanel rows={3}/> : gameQuery.isError ? <ErrorState retry={() => void gameQuery.refetch()}/> : <div className="matchup-scoreline"><span>{gameQuery.data?.awayTeam?.abbreviation || entries.find((m: any) => m.game.id === currentId)?.game.awayTeam.abbreviation}</span><i>@</i><span>{gameQuery.data?.homeTeam?.abbreviation || entries.find((m: any) => m.game.id === currentId)?.game.homeTeam.abbreviation}</span></div>}
        {(() => { const m: any = entries.find((x: any) => x.game.id === currentId) || entries[0]; return <><div className="matchup-metrics"><Metric label="PROJECTED PACE" value={m.projectedPace?.toFixed?.(1) ?? '—'}/><Metric label="PROJECTED TOTAL" value={m.projectedTotal?.toFixed?.(1) ?? '—'}/><Metric label="AWAY OFF. RTG" value={m.awayOffenseRating?.toFixed?.(1) ?? '—'}/><Metric label="HOME OFF. RTG" value={m.homeOffenseRating?.toFixed?.(1) ?? '—'}/></div><div className="note-box"><div className="eyebrow"><span/> SCOUTING NOTES</div>{m.notes?.length ? m.notes.map((note: string, i: number) => <p key={i}><span>{String(i + 1).padStart(2, '0')}</span>{note}</p>) : <p><span>—</span>No notes were provided for this matchup.</p>}</div><DataNotice status={m.dataStatus}/></>; })()}
      </Panel>
    </div> : <EmptyState title="No matchup research available" body="The matchup provider has not returned a slate. We do not fill gaps with invented team analysis."/>}
    {!matchupsQuery.isLoading && !entries.length && gamesQuery.data?.length ? <Panel><PanelTitle>Scheduled games</PanelTitle><div className="games-grid">{gamesQuery.data.map((g: any) => <GameCard key={g.id} game={g}/>)}</div></Panel> : null}
  </div>;
}
function PlayersPage() {
  const [search, setSearch] = useState('');
  const query = useGetNbaPlayers(search ? { search } : undefined);
  return <div className="page-content">
    <PageHeading eyebrow="PLAYER DIRECTORY" title="Know the rotation." subtitle="Search the player pool and move from season rates to recent game logs."/>
     <DataNotice fallback="A verified NBA statistics source is required before player records can be displayed."/>
     <Panel><div className="directory-tools"><div className="search-wrap"><Search size={16}/><input data-testid="input-player-search" aria-label="Search players" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player or team"/></div><span className="count-label">{query.data?.length || '—'} players</span></div>
      {query.isLoading ? <LoadingPanel rows={7}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : query.data?.length ? <div className="player-grid">{query.data.map((p: any) => <Link href={`/players/${p.id}`} className="player-card" key={p.id}><PlayerAvatar name={p.name} image={p.headshotUrl}/><div className="player-card-info"><strong>{p.name}</strong><span>{p.team.abbreviation} · {p.position} {p.jerseyNumber ? `· #${p.jerseyNumber}` : ''}</span><div className="player-mini-stats"><b>{p.points.toFixed(1)}<small> PTS</small></b><b>{p.rebounds.toFixed(1)}<small> REB</small></b><b>{p.assists.toFixed(1)}<small> AST</small></b></div></div><ArrowRight size={15}/></Link>)}</div> : <EmptyState title={search ? 'No players found' : 'Player directory unavailable'} body="There are no player records to show from the configured provider."/>}
    </Panel>
  </div>;
}
function PlayerProfilePage() {
  const [path] = useLocation();
  const id = path.split('/').filter(Boolean).slice(-1)[0] || '';
  const query = useGetNbaPlayer(id, { query: { enabled: !!id, queryKey: getGetNbaPlayerQueryKey(id) } });
  const detail = query.data;
  const p = detail?.player;
  return <div className="page-content">
    {query.isLoading ? <LoadingPanel rows={5}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : p ? <>
      <PageHeading eyebrow={`${p.team.abbreviation} · ${p.position}`} title={p.name} subtitle={`${p.team.city} ${p.team.name}${p.jerseyNumber ? ` · #${p.jerseyNumber}` : ''}`} action={<Link href="/players" className="button-secondary">All players <ArrowRight size={15}/></Link>}/>
      <DataNotice status={detail.dataStatus}/>
      <div className="profile-overview"><div className="profile-person"><PlayerAvatar name={p.name} image={p.headshotUrl} size="xl"/><div><span className="profile-status"><i/> {p.status || 'ACTIVE'}</span><h2>{p.name}</h2><p>{p.team.abbreviation} <span>·</span> {p.position} <span>·</span> {p.minutes.toFixed(1)} MPG</p></div></div><div className="profile-stats">{[['PTS', p.points], ['REB', p.rebounds], ['AST', p.assists], ['3PM', p.threes], ['USG%', `${p.usageRate.toFixed(1)}%`]].map(([l, v]) => <div key={l}><span>{l}</span><strong>{typeof v === 'number' ? v.toFixed(1) : v}</strong></div>)}</div></div>
      <Panel><PanelTitle meta={<span className="mini-mode">VERIFIED FEED</span>}>Recent game log</PanelTitle>{detail.recentGames?.length ? <div className="table-wrap"><table className="data-table log-table"><thead><tr><th>DATE</th><th>OPP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th><th>STL</th><th>BLK</th><th>TOV</th></tr></thead><tbody>{detail.recentGames.map((g: any, i: number) => <tr key={`${g.date}-${i}`}><td>{new Date(g.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td><td>{g.opponent}</td><td>{g.minutes.toFixed(1)}</td><td className="model-value">{g.points}</td><td>{g.rebounds}</td><td>{g.assists}</td><td>{g.threes}</td><td>{g.steals}</td><td>{g.blocks}</td><td>{g.turnovers}</td></tr>)}</tbody></table></div> : <EmptyState title="No recent games" body="Recent game logs have not been supplied by the player data provider."/>}</Panel>
    </> : <EmptyState title="Player profile unavailable" body="The requested player could not be found in the current provider response."/>}
  </div>;
}
function TeamsPage() {
  const query = useGetNbaTeams();
  const [conference, setConference] = useState('All');
  const teams = (query.data || []).filter((t: any) => conference === 'All' || t.conference === conference);
  return <div className="page-content">
    <PageHeading eyebrow="LEAGUE DIRECTORY" title="Thirty team identities." subtitle="Team hubs for roster context and environment metrics."/>
    <DataNotice fallback="The team directory is reference data; live rosters and statistics require a verified NBA provider."/>
    <div className="directory-tools team-tools"><div className="market-tabs compact-tabs">{['All', 'East', 'West'].map((c) => <button key={c} onClick={() => setConference(c)} className={conference === c ? 'market-tab selected' : 'market-tab'}>{c === 'All' ? 'All teams' : c}</button>)}</div><span className="count-label">{teams.length} teams</span></div>
    {query.isLoading ? <LoadingPanel rows={7}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : teams.length ? <div className="team-grid">{teams.map((t: any) => <Link href={`/teams/${t.id}`} className="team-card" key={t.id}><span className="team-badge" style={{ '--team-color': t.color || '#d44b38' } as CSSProperties}>{t.abbreviation}</span><div><strong>{t.city} {t.name}</strong><span>{t.conference} · {t.division}</span></div><ArrowRight size={15}/></Link>)}</div> : <EmptyState title="No teams available" body="The team directory could not be populated by the data provider."/>}
  </div>;
}
function TeamProfilePage() {
  const [path] = useLocation();
  const id = path.split('/').filter(Boolean).slice(-1)[0] || '';
  const query = useGetNbaTeam(id, { query: { enabled: !!id, queryKey: getGetNbaTeamQueryKey(id) } });
  const d = query.data;
  return <div className="page-content">
    {query.isLoading ? <LoadingPanel rows={6}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : d ? <>
      <PageHeading eyebrow={`${d.team.conference.toUpperCase()} · ${d.team.division.toUpperCase()}`} title={`${d.team.city} ${d.team.name}`} subtitle="Team profile and roster context." action={<Link href="/teams" className="button-secondary">All teams <ArrowRight size={15}/></Link>}/>
      <DataNotice status={d.dataStatus}/>
      <div className="team-hero" style={{ '--team-color': d.team.color || '#d44b38' } as CSSProperties}><span className="team-large-mark">{d.team.abbreviation}</span><div><span className="eyebrow"><span/> TEAM SNAPSHOT</span><h2>{d.wins ?? '—'}–{d.losses ?? '—'}</h2><p>Win–loss record · {d.team.conference} conference</p></div><div className="team-profile-metrics"><Metric label="PACE" value={d.pace == null ? '—' : d.pace.toFixed(1)}/><Metric label="OFF. RATING" value={d.offensiveRating == null ? '—' : d.offensiveRating.toFixed(1)}/><Metric label="DEF. RATING" value={d.defensiveRating == null ? '—' : d.defensiveRating.toFixed(1)}/></div></div>
      <Panel><PanelTitle meta={<span className="mini-mode">{d.roster.length ? `${d.roster.length} PLAYERS` : 'ROSTER UNAVAILABLE'}</span>}>Roster</PanelTitle>{d.roster.length ? <div className="player-grid">{d.roster.map((p: any) => <Link href={`/players/${p.id}`} className="player-card" key={p.id}><PlayerAvatar name={p.name} image={p.headshotUrl}/><div className="player-card-info"><strong>{p.name}</strong><span>{p.position} {p.jerseyNumber ? `· #${p.jerseyNumber}` : ''}</span><div className="player-mini-stats"><b>{p.points.toFixed(1)}<small> PTS</small></b><b>{p.rebounds.toFixed(1)}<small> REB</small></b><b>{p.assists.toFixed(1)}<small> AST</small></b></div></div><ArrowRight size={15}/></Link>)}</div> : <EmptyState title="Roster unavailable" body="No roster members were included in the team response."/>}</Panel>
    </> : <EmptyState title="Team profile unavailable" body="The requested team could not be found in the current provider response."/>}
  </div>;
}
function WatchlistPage() {
  const [ids, setIds] = useStoredList<string>('nba-snipes-watchlist-v2');
  const [savedPicks, setSavedPicks] = useStoredList<any>('nba-snipes-slip-v2');
  const snipesQuery = useGetNbaSnipes();
  const propsQuery = useGetNbaProps();
  const items = [...(snipesQuery.data || []), ...(propsQuery.data || [])].filter((p: any) => ids.includes(p.id));
  return <div className="page-content">
    <PageHeading eyebrow="YOUR COURTSIDE LIST" title="Keep an eye on it." subtitle="Saved players and props live in this browser only." action={<button className="button-secondary" onClick={() => { setIds([]); setSavedPicks([]); }} disabled={!ids.length && !savedPicks.length}><X size={15}/> Clear saved</button>}/>
    <DataNotice fallback="This list is stored locally. Only currently verified market records can appear here."/>
    <div className="watch-count-row"><div><strong>{ids.length}</strong><span>saved market signals</span></div><div><strong>{savedPicks.length}</strong><span>slip legs in browser</span></div><Link href="/props" className="text-link">Browse prop board <ArrowRight size={14}/></Link></div>
    <Panel><PanelTitle meta={<span className="mini-mode">LOCAL BROWSER STORAGE</span>}>Saved signals</PanelTitle>
       {snipesQuery.isLoading || propsQuery.isLoading ? <LoadingPanel rows={3}/> : snipesQuery.isError && propsQuery.isError ? <ErrorState retry={() => { void snipesQuery.refetch(); void propsQuery.refetch(); }}/> : items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>PLAYER</th><th>MARKET</th><th>LINE</th><th>PROJECTION</th><th>LINE GAP</th><th></th></tr></thead><tbody>{items.map((p: any) => <tr key={p.id}><td><strong>{p.playerName}</strong><small className="table-sub">{p.team} vs {p.opponent}</small></td><td>{marketLabel(p.market)}</td><td>{fmtLine(p.line)}</td><td className="model-value">{fmtLine(p.projection)}</td><td className="edge-value">{fmtDelta(p.edge)}</td><td><button className="icon-button" aria-label="Remove saved prop" onClick={() => setIds(ids.filter((id) => id !== p.id))}><X size={15}/></button></td></tr>)}</tbody></table></div> : <EmptyState title="Nothing on your watchlist yet" body="Save a player prop or signal from the board. Items are saved only in this browser."/>}
    </Panel>
    {!!savedPicks.length && <Panel><PanelTitle>Slip builder legs</PanelTitle><div className="pick-candidates">{savedPicks.map((p: any) => <div className="pick-candidate" key={p.id}><div><strong>{p.playerName}</strong><small>{marketLabel(p.market)} {p.side} {fmtLine(p.line)}</small></div><button className="text-link" onClick={() => setSavedPicks(savedPicks.filter((s: any) => s.id !== p.id))}>Remove</button></div>)}</div><Link href="/slip-builder" className="button-primary inline-cta">Continue building <ArrowRight size={15}/></Link></Panel>}
  </div>;
}
function AuditPage() {
  const query = useGetNbaAudit();
  const rows = query.data || [];
  return <div className="page-content">
    <PageHeading eyebrow="TRANSPARENT BY DESIGN" title="Inside the model." subtitle="Review the inputs and adjustments attached to each projection."/>
    <DataNotice status={rows[0] ? { mode: rows[0].status === 'verified' ? 'live' : 'unavailable', provider: 'Model audit', message: rows[0].status === 'verified' ? 'Verified record from provider.' : 'Unverified model audit record withheld.' } : undefined} fallback="Verified model audit records appear after real projections are generated."/>
    <div className="audit-intro"><div className="audit-icon"><Database size={18}/></div><div><strong>Inspectable, not inscrutable.</strong><p>Each record lists the projection inputs and adjustment notes returned with the audit endpoint. Missing details stay missing.</p></div><span className="audit-count">{rows.length || '—'} RECORDS</span></div>
    {query.isLoading ? <LoadingPanel rows={6}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : rows.length ? <div className="audit-list">{rows.map((r: any) => <details className="audit-record" key={r.id}><summary><div className="audit-player"><span className="audit-rank"><Database size={15}/></span><div><strong>{r.playerName}</strong><small>{r.team} · {marketLabel(r.market)}</small></div></div><div className="audit-proj"><span>PROJECTION</span><strong>{fmtLine(r.projection)}</strong></div><span className="audit-date">{new Date(r.recordedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><StatPill tone={r.status === 'verified' ? 'good' : 'warn'}>{r.status}</StatPill><ChevronDown size={16}/></summary><div className="audit-details"><div><h3>Data inputs</h3>{r.dataInputs?.length ? r.dataInputs.map((item: string, i: number) => <p key={i}><Check size={13}/>{item}</p>) : <p className="empty-detail">No inputs recorded.</p>}</div><div><h3>Model adjustments</h3>{r.adjustments?.length ? r.adjustments.map((item: string, i: number) => <p key={i}><ArrowUpRight size={13}/>{item}</p>) : <p className="empty-detail">No adjustments recorded.</p>}</div></div></details>)}</div> : <EmptyState title="No audit records returned" body="The audit endpoint has no records available. We will not fabricate model inputs or adjustment history."/>}
  </div>;
}
function PerformancePage() {
  const query = useGetNbaModelPerformance();
  const rows = query.data || [];
  return <div className="page-content">
    <PageHeading eyebrow="MODEL TRACK RECORD" title="Measure the model." subtitle="Market-level tracking metrics with verified history and status in view."/>
    <DataNotice fallback="Tracking metrics appear only after model outputs are matched against verified historical outcomes."/>
    <div className="performance-banner"><div className="performance-mark"><BarChart3 size={19}/></div><div><strong>Performance is a process, not a promise.</strong><p>Model results will remain blank until predictions and completed game outcomes can be validated.</p></div><ShieldAlert size={19}/></div>
    {query.isLoading ? <LoadingPanel rows={6}/> : query.isError ? <ErrorState retry={() => void query.refetch()}/> : rows.length ? <Panel className="performance-panel"><div className="table-wrap"><table className="data-table performance-table"><thead><tr><th>MARKET</th><th>SAMPLE SIZE</th><th>HIT RATE</th><th>AVG. ERROR</th><th>ROI</th><th>TRACKING</th></tr></thead><tbody>{rows.map((r: any) => <tr key={r.market}><td><div className="market-name"><span className="market-bullet"></span><strong>{marketLabel(r.market)}</strong></div></td><td className="mono">{r.sampleSize.toLocaleString()}</td><td>{r.hitRate == null ? '—' : <><strong>{fmtProbability(r.hitRate)}</strong><div className="performance-track"><span style={{ width: `${Math.min(100, Math.max(0, r.hitRate * 100))}%` }}/></div></>}</td><td className="mono">{r.averageError == null ? '—' : r.averageError.toFixed(2)}</td><td className={r.roi != null && r.roi > 0 ? 'edge-value' : ''}>{r.roi == null ? '—' : `${r.roi > 0 ? '+' : ''}${r.roi.toFixed(1)}%`}</td><td><StatPill tone={r.status === 'verified' ? 'good' : r.status === 'tracking' ? 'neutral' : 'warn'}>{r.status}</StatPill></td></tr>)}</tbody></table></div></Panel> : <EmptyState title="No verified tracking history" body="Historical outcomes have not been connected, so no hit rates or return estimates are displayed."/>}
    <div className="method-note"><span className="method-dot"></span><span>Metrics describe only the tracked historical records. They do not guarantee future outcomes or imply independent verification unless labeled verified.</span></div>
  </div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><AppShell/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
