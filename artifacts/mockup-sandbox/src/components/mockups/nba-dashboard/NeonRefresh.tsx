import './_group.css';
import './NeonRefresh.css';
import { useState, type ReactNode } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bookmark,
  CheckCircle2, ChevronRight, CircleHelp, Crosshair, Database,
  Gauge, LayoutDashboard, Menu, Radio, Search, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Users, X,
} from 'lucide-react';

const navigation = [
  {
    label: 'COURT SIDE',
    items: [
      { label: 'Overview', target: 'overview', icon: LayoutDashboard },
      { label: 'Top signals', target: 'signals', icon: Crosshair },
      { label: 'Prop board', target: 'signals', icon: BarChart3 },
      { label: 'Matchups', target: 'matchups', icon: Activity },
    ],
  },
  {
    label: 'THE LEAGUE',
    items: [
      { label: 'Players', target: 'coverage', icon: Users },
      { label: 'Teams', target: 'coverage', icon: ShieldCheck },
    ],
  },
  {
    label: 'MY WORKSPACE',
    items: [
      { label: 'Slip builder', target: 'research', icon: SlidersHorizontal },
      { label: 'Watchlist', target: 'research', icon: Bookmark },
    ],
  },
  {
    label: 'MODEL ROOM',
    items: [
      { label: 'Model audit', target: 'sources', icon: Database },
      { label: 'Performance', target: 'sources', icon: Gauge },
    ],
  },
];

const metrics = [
  { label: 'GAMES ON SLATE', detail: 'Verified schedule' },
  { label: 'PLAYERS COVERED', detail: 'NBA player pool' },
  { label: 'PROP MARKETS', detail: 'Provider lines' },
  { label: 'ODDS SOURCES', detail: 'Connected books' },
];

export function NeonRefresh() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="neon-dashboard" id="overview">
      <aside className={`nd-sidebar ${mobileOpen ? 'nd-sidebar-open' : ''}`}>
        <a className="nd-brand" href="#overview" onClick={() => setMobileOpen(false)} aria-label="Rim Radar overview">
          <span className="nd-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="nd-brand-type">RIM<span>RADAR</span><small>ANALYTICS / COURTSIDE</small></span>
        </a>

        <div className="nd-season">
          <span className="nd-season-indicator" />
          <span>NBA DATA STATUS</span>
          <span className="nd-season-tag">OFFLINE</span>
        </div>

        <nav className="nd-nav" aria-label="Dashboard sections">
          {navigation.map((group) => (
            <div className="nd-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ label, target, icon: Icon }, index) => (
                <a
                  href={`#${target}`}
                  key={label}
                  className={`nd-nav-link ${group.label === 'COURT SIDE' && index === 0 ? 'is-active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{label}</span>
                  {group.label === 'COURT SIDE' && index === 0 && <span className="nd-nav-caret"><ChevronRight size={13} /></span>}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="nd-sidebar-bottom">
          <div className="nd-integrity-note">
            <CircleHelp size={15} />
            <div><strong>Source-first research</strong><span>No feed, no projection. Every output needs a verifiable source.</span></div>
          </div>
          <div className="nd-side-footer"><span>INDEPENDENT ANALYSIS</span><span>NBA</span></div>
        </div>
      </aside>

      {mobileOpen && <button className="nd-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <div className="nd-main">
        <header className="nd-topbar">
          <button className="nd-icon-button nd-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="nd-breadcrumb"><span>RIM RADAR</span><b>/</b><strong>SLATE OVERVIEW</strong></div>
          <div className="nd-top-actions">
            <span className="nd-connection-pill"><i /> NO VERIFIED DATA</span>
            <span className="nd-top-caption">SOURCE CONNECTION REQUIRED</span>
            <span className="nd-avatar">RR</span>
          </div>
        </header>

        <main className="nd-content">
          <div className="nd-page-head">
            <div>
              <div className="nd-eyebrow"><span /> DAILY RESEARCH / OVERVIEW</div>
              <h1>The board, at a glance<span>.</span></h1>
              <p>Transparent player-prop research starts with verified NBA and market data.</p>
            </div>
            <div className="nd-head-tools">
              {searchOpen && (
                <label className="nd-search">
                  <Search size={15} />
                  <input autoFocus aria-label="Search unavailable" placeholder="Search unavailable" disabled />
                  <span>FEED OFFLINE</span>
                </label>
              )}
              <button className="nd-tool-button" onClick={() => setSearchOpen((open) => !open)} aria-label={searchOpen ? 'Close search' : 'Open search'}>
                {searchOpen ? <X size={16} /> : <Search size={16} />}
              </button>
              <span className="nd-readonly"><Database size={14} /> READ ONLY</span>
            </div>
          </div>

          <section className="nd-alert" aria-label="Data availability notice">
            <span className="nd-alert-symbol"><ShieldAlert size={15} /></span>
            <div className="nd-alert-copy">
              <strong>VERIFIED FEEDS NOT CONNECTED</strong>
              <span>NBA statistics and sportsbook odds are unavailable. No sample players, lines, picks, or projections are shown.</span>
            </div>
            <span className="nd-alert-code">DATA INTEGRITY / 01</span>
          </section>

          <section className="nd-hero" aria-labelledby="nd-hero-title">
            <div className="nd-hero-grid" aria-hidden="true" />
            <div className="nd-court-art" aria-hidden="true">
              <span className="nd-court-center" />
              <span className="nd-court-lane" />
              <span className="nd-court-arc" />
            </div>
            <div className="nd-hero-copy">
              <div className="nd-hero-kicker"><span className="nd-live-mark" /> SLATE DESK <i /> FEED STATUS: OFFLINE</div>
              <h2 id="nd-hero-title">Read the game.<br /><em>Then read the numbers.</em></h2>
              <p>Analysis stays grounded. The board stays empty until its sources can be verified.</p>
            </div>
            <div className="nd-status-card">
              <div className="nd-status-card-head"><span>RESEARCH STATUS</span><span className="nd-status-off"><i /> BLOCKED</span></div>
              <div className="nd-status-value">—<small> SLATE</small></div>
              <div className="nd-status-card-foot"><span>Awaiting connected sources</span><ArrowUpRight size={15} /></div>
            </div>
            <div className="nd-hero-index" aria-hidden="true">RR / 01</div>
          </section>

          <section className="nd-metrics" aria-label="Research coverage">
            {metrics.map((metric, index) => (
              <div className="nd-metric" key={metric.label}>
                <div className="nd-metric-top"><span className={`nd-metric-index nd-tone-${index}`}>0{index + 1}</span><span className="nd-metric-state">SOURCE REQUIRED</span></div>
                <span className="nd-metric-label">{metric.label}</span>
                <strong>—</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
          </section>

          <div className="nd-dashboard-grid">
            <section className="nd-panel nd-slate-panel" id="matchups">
              <PanelHeading eyebrow="SCHEDULE / VERIFIED" title="Today’s matchups" side="NO SCHEDULE DATA" />
              <div className="nd-table-shell">
                <div className="nd-table-head">
                  <span>TIP / STATUS</span><span>AWAY</span><span>HOME</span><span>MARKET COVERAGE</span>
                </div>
                <div className="nd-empty-table">
                  <span className="nd-empty-orbit"><Activity size={17} /></span>
                  <div><strong>Schedule feed not connected</strong><p>Matchups will appear when the NBA schedule source is verified.</p></div>
                  <span className="nd-empty-mark">—</span>
                </div>
                <div className="nd-table-foot"><span>GAME ROWS</span><span>—</span><span className="nd-table-foot-sep">/</span><span>NO UNVERIFIED SCHEDULES</span></div>
              </div>
            </section>

            <section className="nd-panel nd-watch-panel">
              <PanelHeading eyebrow="LIVE CONTEXT / VERIFIED" title="Court watch" side="STANDBY" />
              <div className="nd-watch-empty">
                <div className="nd-radar" aria-hidden="true"><span /><span /><span /><i /></div>
                <strong>Monitoring is on hold</strong>
                <p>Live alerts need a connected NBA game feed. Nothing is being inferred from sample events.</p>
                <div className="nd-watch-meta"><span><Radio size={13} /> LIVE EVENTS</span><b>—</b></div>
              </div>
            </section>
          </div>

          <section className="nd-panel nd-signals-panel" id="signals">
            <PanelHeading eyebrow="MODEL OUTPUT / SOURCE-BACKED ONLY" title="Signals to know" side="NO PROJECTIONS" />
            <div className="nd-signals-table">
              <div className="nd-signals-head"><span>PLAYER / MATCHUP</span><span>MARKET</span><span>BOOK LINE</span><span>MODEL</span><span>LINE GAP</span><span>REASONING</span></div>
              <div className="nd-signals-empty">
                <Crosshair size={17} />
                <div><strong>No verified projections</strong><p>Connect a statistics feed and an odds provider before model signals can be calculated.</p></div>
                <span>—</span><span>—</span><span>—</span>
              </div>
            </div>
            <div className="nd-signals-foot"><span>MODEL STATUS <b>—</b></span><span>NO PLAYER OR MARKET DATA LOADED</span></div>
          </section>

          <section className="nd-lower-grid" id="coverage">
            <section className="nd-panel nd-sources-panel" id="sources">
              <PanelHeading eyebrow="INPUTS / PROVIDER HEALTH" title="Source integrity" side="2 INPUTS REQUIRED" />
              <div className="nd-source-list">
                <SourceRow icon={<Database size={15} />} label="NBA statistics" detail="Schedule, player and game data" />
                <SourceRow icon={<BarChart3 size={15} />} label="Sportsbook odds" detail="Player markets and current lines" />
                <SourceRow icon={<CheckCircle2 size={15} />} label="Model outputs" detail="Available after source validation" downstream />
              </div>
              <div className="nd-source-note"><ShieldCheck size={14} /><span>Outputs remain suppressed until inputs are attributable and current.</span></div>
            </section>

            <section className="nd-panel nd-method-panel" id="research">
              <PanelHeading eyebrow="METHOD / TRANSPARENT" title="Why this board is empty" side="RESEARCH RULES" />
              <div className="nd-method-list">
                <div><span>01</span><p><strong>Verify inputs</strong>NBA stats and odds need an identifiable source.</p><ArrowDownRight size={14} /></div>
                <div><span>02</span><p><strong>Expose reasoning</strong>Model outputs need traceable inputs and context.</p><ArrowDownRight size={14} /></div>
                <div><span>03</span><p><strong>Publish carefully</strong>No board values appear when either source is missing.</p><CheckCircle2 size={14} /></div>
              </div>
            </section>
          </section>

          <div className="nd-disclaimer"><ShieldAlert size={14} /><span>Independent research interface. No verified NBA or sportsbook data is connected; all unavailable values are intentionally shown as em dashes.</span><span className="nd-disclaimer-tag">NO DEMO DATA</span></div>
        </main>

        <footer className="nd-footer"><span>RIM RADAR <i>·</i> SOURCE-FIRST RESEARCH</span><span>Not affiliated with or endorsed by the National Basketball Association.</span></footer>
      </div>
    </div>
  );
}

function PanelHeading({ eyebrow, title, side }: { eyebrow: string; title: string; side: string }) {
  return (
    <div className="nd-panel-heading">
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      <span className="nd-panel-state"><i />{side}</span>
    </div>
  );
}

function SourceRow({ icon, label, detail, downstream = false }: { icon: ReactNode; label: string; detail: string; downstream?: boolean }) {
  return (
    <div className={`nd-source-row ${downstream ? 'nd-source-downstream' : ''}`}>
      <span className="nd-source-icon">{icon}</span>
      <div><strong>{label}</strong><small>{detail}</small></div>
      <span className="nd-source-status"><i />{downstream ? 'PAUSED' : 'NOT CONNECTED'}</span>
    </div>
  );
}
