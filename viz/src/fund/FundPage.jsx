import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFundData from './useFundData';
import './fund.css';

const SLEEVE_COLORS = {
  'Power & Grid': '#f5a83c',
  'Compute Chokepoints': '#4fd9ff',
  'Value & Ballast': '#7ddf80',
  'Hard Assets': '#e8c07a',
  Convex: '#b388ff',
  'Index Hedge': '#8fa6b8',
  'AI Disruption Victims': '#ef5350',
  'Valuation & Crowding': '#f06292',
  'Consumer & Rate Stress': '#ff8a65',
};

const money = (n, digits = 1) => {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};
const pct = (n, digits = 2) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`;
const cls = (n) => (n == null ? '' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

export default function FundPage() {
  const { fund, marks, navHistory, trades, live } = useFundData();
  const [tab, setTab] = useState('book');
  const [expanded, setExpanded] = useState(null);
  const [sort, setSort] = useState({ key: 'weight_pct', dir: 'desc' });
  const [sideFilter, setSideFilter] = useState('all');

  const pending = !marks.as_of || marks.positions.length === 0;

  const positions = useMemo(() => {
    const rows = marks.positions.filter(
      (p) => sideFilter === 'all' || p.side === sideFilter
    );
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av ?? -Infinity, bn = bv ?? -Infinity;
      return dir === 'asc' ? an - bn : bn - an;
    });
  }, [marks.positions, sort, sideFilter]);

  const winners = useMemo(
    () => [...marks.positions].sort((a, b) => b.unrealized_pnl - a.unrealized_pnl),
    [marks.positions]
  );

  const sleeves = useMemo(() => {
    const m = new Map();
    for (const p of marks.positions) {
      const cur = m.get(p.sleeve) || { sleeve: p.sleeve, mv: 0, pnl: 0, n: 0, side: p.side };
      cur.mv += p.market_value;
      cur.pnl += p.unrealized_pnl;
      cur.n += 1;
      m.set(p.sleeve, cur);
    }
    return [...m.values()].sort((a, b) => b.mv - a.mv);
  }, [marks.positions]);

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="fund-page">
      <header className="f-header">
        <div className="f-brand">
          <span className="f-mark" aria-hidden="true" />
          <div>
            <h1>Praxis Capital</h1>
            <span className="f-sub">simulated long / short · {fund.aggression}0 aggression</span>
          </div>
        </div>

        <nav className="f-tabs" role="tablist">
          {[
            ['book', 'Book'],
            ['performance', 'Performance'],
            ['blotter', 'Blotter'],
            ['mandate', 'Mandate'],
          ].map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="f-actions">
          <span className={`f-asof ${live ? 'live' : ''}`}>
            <span className="f-dot" />
            {marks.as_of ? `marked ${marks.as_of}` : 'awaiting first mark'}
          </span>
          <Link className="f-back" to="/">← The Apparatus</Link>
          <Link className="f-back" to="/grid">The Grid</Link>
        </div>
      </header>

      <div className="f-tiles">
        <Tile label="Net Asset Value" value={money(marks.nav, 2)} sub={`from ${money(marks.capital, 0)} committed`} />
        <Tile
          label="Total Return"
          value={pct(marks.total_return_pct)}
          sub={money(marks.total_pnl)}
          tone={cls(marks.total_return_pct)}
        />
        <Tile label="Day P&L" value={money(marks.day_pnl)} tone={cls(marks.day_pnl)} sub="last session" />
        <Tile label="Gross Exposure" value={`${marks.gross_pct.toFixed(0)}%`} sub={`cap ${fund.mandate.gross_cap_pct}%`} />
        <Tile
          label="Net Exposure"
          value={`${marks.net_pct.toFixed(0)}%`}
          sub={`band ${fund.mandate.net_band_pct[0]}–${fund.mandate.net_band_pct[1]}%`}
        />
        <Tile label="Cash" value={money(marks.cash, 0)} sub={`${(fund.cash_rate_annual * 100).toFixed(2)}% accrual`} />
      </div>

      {pending && (
        <div className="f-pending">
          <strong>Book is allocated but not yet priced.</strong> {marks.positions.length === 0 ? 42 : marks.positions.length} lines
          are staged at target weight. The first mark-to-market run converts those weights into
          share counts at the real closing price — no entry price is ever invented.
        </div>
      )}

      {marks.signals?.length > 0 && (
        <div className="f-signals">
          <h4>Signals for review ({marks.signals.length})</h4>
          <ul>{marks.signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      <main className="f-body">
        {tab === 'book' && (
          <>
            <div className="f-toolbar">
              <div className="f-seg">
                {[['all', `All ${marks.positions.length || 42}`], ['long', 'Long'], ['short', 'Short']].map(
                  ([k, label]) => (
                    <button key={k} className={sideFilter === k ? 'active' : ''} onClick={() => setSideFilter(k)}>
                      {label}
                    </button>
                  )
                )}
              </div>
              <span className="f-hint">click any row for the thesis and what would falsify it</span>
            </div>

            {pending ? (
              <StagedBook />
            ) : (
              <table className="f-table">
                <thead>
                  <tr>
                    <th className="left" onClick={() => toggleSort('ticker')}>Position</th>
                    <th onClick={() => toggleSort('weight_pct')}>Weight</th>
                    <th onClick={() => toggleSort('entry_price')}>Entry</th>
                    <th onClick={() => toggleSort('price')}>Last</th>
                    <th onClick={() => toggleSort('day_pct')}>Day</th>
                    <th onClick={() => toggleSort('week_pct')}>Week</th>
                    <th onClick={() => toggleSort('return_pct')}>Return</th>
                    <th onClick={() => toggleSort('unrealized_pnl')}>P&L</th>
                    <th className="spark-h">30d</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <PositionRow
                      key={p.id}
                      p={p}
                      open={expanded === p.id}
                      onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'performance' && (
          <div className="f-perf">
            <section className="f-card">
              <h3>NAV since inception</h3>
              <EquityCurve history={navHistory} capital={marks.capital} />
            </section>

            <div className="f-perf-grid">
              <section className="f-card">
                <h3>Exposure by sleeve</h3>
                {sleeves.length === 0 && <p className="f-empty">Populates after the first mark.</p>}
                {sleeves.map((s) => {
                  const max = Math.max(...sleeves.map((x) => x.mv));
                  return (
                    <div key={s.sleeve} className="f-sleeve">
                      <div className="f-sleeve-top">
                        <span className="f-swatch" style={{ background: SLEEVE_COLORS[s.sleeve] }} />
                        <span className="f-sleeve-name">{s.sleeve}</span>
                        <span className={`f-sleeve-pnl ${cls(s.pnl)}`}>{money(s.pnl)}</span>
                      </div>
                      <div className="f-sleeve-bar">
                        <div
                          style={{
                            width: `${(s.mv / max) * 100}%`,
                            background: SLEEVE_COLORS[s.sleeve],
                          }}
                        />
                      </div>
                      <div className="f-sleeve-meta">
                        {s.n} {s.n === 1 ? 'line' : 'lines'} · {money(s.mv)} {s.side === 'short' ? 'short' : 'long'}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="f-card">
                <h3>Contribution</h3>
                {winners.length === 0 && <p className="f-empty">Populates after the first mark.</p>}
                {winners.length > 0 && (
                  <>
                    <h5>Top contributors</h5>
                    {winners.slice(0, 5).map((p) => <Contrib key={p.id} p={p} />)}
                    <h5>Largest detractors</h5>
                    {winners.slice(-5).reverse().map((p) => <Contrib key={p.id} p={p} />)}
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === 'blotter' && (
          <section className="f-card">
            <h3>Trade blotter</h3>
            {trades.length === 0 ? (
              <p className="f-empty">No fills yet. The inception allocation is logged on the first mark run.</p>
            ) : (
              <table className="f-table blotter">
                <thead>
                  <tr>
                    <th className="left">Date</th>
                    <th className="left">Action</th>
                    <th className="left">Ticker</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Notional</th>
                    <th className="left">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trades].reverse().map((t, i) => (
                    <tr key={i}>
                      <td className="left mono">{t.date}</td>
                      <td className={`left ${t.action.includes('SHORT') || t.action === 'SELL' ? 'down' : 'up'}`}>{t.action}</td>
                      <td className="left mono">{t.ticker}</td>
                      <td className="mono">{t.shares?.toLocaleString()}</td>
                      <td className="mono">${t.price?.toFixed(2)}</td>
                      <td className="mono">{money(t.notional)}</td>
                      <td className="left note">{t.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {tab === 'mandate' && (
          <section className="f-card f-mandate">
            <h3>{fund.vehicle}</h3>
            <p className="f-strategy">{fund.strategy}</p>
            <dl>
              <div><dt>General Partner</dt><dd>{fund.general_partner}</dd></div>
              <div><dt>Limited Partner</dt><dd>{fund.limited_partner}</dd></div>
              <div><dt>Committed capital</dt><dd>{money(fund.inception_capital_usd, 0)}</dd></div>
              <div><dt>Inception</dt><dd>{fund.inception_date || 'pending first mark'}</dd></div>
              <div><dt>Benchmark</dt><dd>{fund.benchmark}</dd></div>
              <div><dt>Target gross / net</dt><dd>{fund.mandate.target_gross_pct}% / {fund.mandate.target_net_pct}%</dd></div>
            </dl>
            <h5>Risk rules</h5>
            <ul>{fund.risk_rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <p className="f-disclaimer">{fund.disclaimer}</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className="f-tile">
      <span className="f-tile-label">{label}</span>
      <span className={`f-tile-value ${tone || ''}`}>{value}</span>
      {sub && <span className="f-tile-sub">{sub}</span>}
    </div>
  );
}

function Contrib({ p }) {
  return (
    <div className="f-contrib">
      <span className="mono t">{p.ticker}</span>
      <span className={`side ${p.side}`}>{p.side === 'short' ? 'S' : 'L'}</span>
      <span className={`v ${cls(p.unrealized_pnl)}`}>{money(p.unrealized_pnl)}</span>
      <span className={`r ${cls(p.return_pct)}`}>{pct(p.return_pct, 1)}</span>
    </div>
  );
}

function PositionRow({ p, open, onToggle }) {
  return (
    <>
      <tr className={`f-row ${open ? 'open' : ''}`} onClick={onToggle}>
        <td className="left">
          <span className={`side-tag ${p.side}`}>{p.side === 'short' ? 'S' : 'L'}</span>
          <span className="mono tick">{p.ticker}</span>
          <span className="pname">{p.name}</span>
        </td>
        <td className="mono">{p.weight_pct?.toFixed(1)}%</td>
        <td className="mono dim">${p.entry_price?.toFixed(2)}</td>
        <td className="mono">${p.price?.toFixed(2)}</td>
        <td className={`mono ${cls(p.day_pct)}`}>{pct(p.day_pct, 1)}</td>
        <td className={`mono ${cls(p.week_pct)}`}>{pct(p.week_pct, 1)}</td>
        <td className={`mono strong ${cls(p.return_pct)}`}>{pct(p.return_pct, 1)}</td>
        <td className={`mono strong ${cls(p.unrealized_pnl)}`}>{money(p.unrealized_pnl)}</td>
        <td className="spark-c"><Sparkline data={p.sparkline} side={p.side} /></td>
      </tr>
      {open && (
        <tr className="f-detail-row">
          <td colSpan={9}>
            <div className="f-detail">
              <div className="f-detail-head">
                <span className="f-swatch" style={{ background: SLEEVE_COLORS[p.sleeve] }} />
                {p.sleeve} · {p.shares?.toLocaleString()} shares · entered {p.entry_date} at ${p.entry_price?.toFixed(2)}
              </div>
              <ul>
                <li>
                  <strong>Move.</strong> {pct(p.day_pct, 1)} today, {pct(p.week_pct, 1)} on the week,{' '}
                  {pct(p.month_pct, 1)} on the month. {p.catalyst}
                </li>
                <li>
                  <strong>Why we own it.</strong> {p.thesis}
                </li>
                {p.falsifier && (
                  <li className="f-falsifier">
                    <strong>What would prove this wrong.</strong> {p.falsifier}
                  </li>
                )}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Sparkline({ data, side }) {
  if (!data || data.length < 2) return <span className="dim">—</span>;
  const w = 74, h = 22, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rising = data[data.length - 1] >= data[0];
  const good = side === 'short' ? !rising : rising;
  return (
    <svg width={w} height={h} className="spark" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" strokeWidth="1.3"
        stroke={good ? 'var(--f-up)' : 'var(--f-down)'} />
    </svg>
  );
}

function EquityCurve({ history, capital }) {
  if (!history || history.length < 2) {
    return (
      <p className="f-empty">
        The curve draws itself once there are at least two daily marks. Each weekday close adds a point.
      </p>
    );
  }
  const w = 900, h = 260, padL = 62, padR = 16, padT = 16, padB = 28;
  const navs = history.map((d) => d.nav);
  const lo = Math.min(...navs, capital), hi = Math.max(...navs, capital);
  const span = hi - lo || 1;
  const x = (i) => padL + (i / (history.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / span) * (h - padT - padB);

  const line = history.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.nav).toFixed(1)}`).join('');
  const area = `${line}L${x(history.length - 1).toFixed(1)},${y(lo)}L${x(0).toFixed(1)},${y(lo)}Z`;
  const last = history[history.length - 1];
  const gain = last.nav >= capital;

  return (
    <div className="f-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="f-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="navfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gain ? 'var(--f-up)' : 'var(--f-down)'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={gain ? 'var(--f-up)' : 'var(--f-down)'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = lo + t * span;
          return (
            <g key={t}>
              <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} className="f-grid" />
              <text x={padL - 8} y={y(v) + 4} className="f-axis" textAnchor="end">
                ${(v / 1e9).toFixed(3)}B
              </text>
            </g>
          );
        })}
        <line x1={padL} y1={y(capital)} x2={w - padR} y2={y(capital)} className="f-basis" />
        <path d={area} fill="url(#navfill)" />
        <path d={line} fill="none" strokeWidth="2" className="f-navline"
          stroke={gain ? 'var(--f-up)' : 'var(--f-down)'} />
        <circle cx={x(history.length - 1)} cy={y(last.nav)} r="3.5"
          fill={gain ? 'var(--f-up)' : 'var(--f-down)'} />
      </svg>
      <div className="f-chart-foot">
        <span>{history[0].date}</span>
        <span className={cls(last.return_pct)}>
          {money(last.nav, 2)} · {pct(last.return_pct)} since inception
        </span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}

function StagedBook() {
  return (
    <p className="f-empty">
      Positions are staged and will render here with live prices, P&L and sparklines
      after the first weekday mark. Open the <strong>Mandate</strong> tab for the
      risk framework in the meantime.
    </p>
  );
}
