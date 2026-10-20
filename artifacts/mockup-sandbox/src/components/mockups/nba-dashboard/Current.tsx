import './_group.css';
import { useState } from 'react';
import {
  Activity, ArrowRight, BarChart3, Bookmark, CircleHelp, Crosshair,
  Database, Gauge, LayoutDashboard, Menu, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Users, X,
} from 'lucide-react';

const groups = [
  { label: 'COURT SIDE', items: [['Overview', '/', LayoutDashboard], ['Radar picks', '/picks', Crosshair], ['Prop board', '/props', BarChart3], ['Matchups', '/matchups', Activity]] },
  { label: 'THE LEAGUE', items: [['Players', '/players', Users], ['Teams', '/teams', ShieldCheck]] },
  { label: 'MY WORKSPACE', items: [['Slip builder', '/slip-builder', SlidersHorizontal], ['Watchlist', '/watchlist', Bookmark]] },
  { label: 'MODEL ROOM', items: [['Model audit', '/audit', Database], ['Performance', '/performance', Gauge]] },
] as const;

export function Current() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <a href="#" className="brand-lockup" onClick={(event) => event.preventDefault()}>
        <span className="brand-mark"><span/><span/><span/></span>
        <span className="brand-name">RIM<span>RADAR</span><small>ANALYTICS</small></span>
      </a>
      <div className="sidebar-season"><span className="season-dot"/> NBA SEASON <span className="season-tag">NO FEED</span></div>
      <nav className="side-nav">
        {groups.map((group) => <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          {group.items.map(([label, href, Icon]) => <a key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-link ${href === '/' ? 'nav-active' : ''}`}>
            <Icon size={17} strokeWidth={1.8}/><span>{label}</span>
          </a>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="side-note"><div className="side-note-icon"><CircleHelp size={16}/></div><div><strong>Independent analysis</strong><p>Not affiliated with or endorsed by the NBA.</p></div></div>
        <div className="sidebar-foot"><span>BUILT FOR THE BOX SCORE</span><span>NBA</span></div>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)}/>}
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19}/></button>
        <div className="crumb"><span>RIM RADAR</span><b>/</b><strong>OVERVIEW</strong></div>
        <div className="topbar-right"><span className="demo-pill"><span/>NO VERIFIED DATA</span><span className="topbar-season">FEEDS NOT CONNECTED</span><div className="user-mark">RR</div></div>
      </header>
      <div className="page-wrap">
        <main className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow"><span/>LIVE SLATE</div><h1>The board, at a glance.</h1><p>NBA player markets will appear here when verified stats and odds feeds are connected.</p></div>
            <span className="read-only-tag"><Database size={14}/> Awaiting providers</span>
          </div>
          <div className="data-notice notice-unavailable">
            <span className="notice-icon"><ShieldAlert size={14}/></span>
            <div><strong>NO VERIFIED DATA</strong><span>No NBA statistics or sportsbook odds provider is connected. No sample picks are shown.</span></div>
          </div>
          <div className="hero-band">
            <div className="court-lines"/>
            <div className="hero-copy">
              <div className="hero-kicker"><span className="hero-mark"/> TONIGHT’S SLATE <span className="kicker-divider"/> FEED STATUS: OFFLINE</div>
              <h2>Read the game.<br/><em>Then read the numbers.</em></h2>
              <p>This board stays empty until live data can support it.</p>
            </div>
            <div className="hero-score">
              <div className="score-top"><span>SLATE STATUS</span><span className="health-off"><i/> SOURCE REQUIRED</span></div>
              <div className="hero-score-num">—<small> GAMES</small></div>
              <div className="score-bottom"><span>Projections unavailable</span><span className="score-arrow"><ArrowRight size={16}/></span></div>
            </div>
          </div>
          <div className="metric-grid">
            <Metric label="GAMES ON SLATE"/>
            <Metric label="PLAYERS ANALYZED"/>
            <Metric label="VERIFIED PROJECTIONS"/>
            <Metric label="LIVE ODDS BOOKS"/>
          </div>
          <div className="dashboard-grid">
            <section className="panel games-panel">
              <PanelTitle>Today’s matchups</PanelTitle>
              <EmptyState title="Schedule feed not connected" body="No matchup or player details are being invented while the NBA source is unconfigured."/>
            </section>
            <section className="panel alerts-panel">
              <PanelTitle>Court watch</PanelTitle>
              <EmptyState title="Live alerts unavailable" body="Alerts will appear only when a verified live feed is connected."/>
            </section>
          </div>
          <section className="panel signal-panel" id="signals">
            <PanelTitle>Signals to know</PanelTitle>
            <EmptyState title="No projections yet" body="Connect a stats feed and odds provider before this board can show daily targets."/>
          </section>
          <div className="disclaimer-strip"><ShieldAlert size={15}/><span>There are no picks or projections in this preview. The previous sample figures are intentionally omitted.</span></div>
        </main>
        <footer className="page-footer"><span>RIM RADAR <i>·</i> INDEPENDENT RESEARCH</span><span>Not affiliated with or endorsed by the National Basketball Association.</span></footer>
      </div>
    </div>
  </div>;
}

function Metric({ label }: { label: string }) {
  return <div className="metric"><span>{label}</span><strong>—<small> source required</small></strong></div>;
}

function PanelTitle({ children }: { children: string }) {
  return <div className="panel-title"><h2>{children}</h2></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><span className="empty-whistle"><Database size={19}/></span><strong>{title}</strong><p>{body}</p></div>;
}
