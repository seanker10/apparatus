import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useGridData from './useGridData';
import USGridMap from './USGridMap';
import { LAYERS, LAYER_GROUPS, LINK_STYLES, VIEWS } from './gridConfig';
import './grid.css';

const ALL_LAYERS = Object.keys(LAYERS);
const PLANNED_STATUSES = new Set(['planned', 'proposed', 'under-construction']);

function yearOf(site) {
  if (!site.date) return null;
  const y = parseInt(String(site.date).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export default function GridPage() {
  const { sites, links } = useGridData();

  const [enabledLayers, setEnabledLayers] = useState(() => new Set(ALL_LAYERS));
  const [statusMode, setStatusMode] = useState('all'); // all | built | planned
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('us');
  const [focus, setFocus] = useState(null);
  const [range, setRange] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const nonceRef = useRef(0);

  const flyToView = (v) => {
    setView(v);
    nonceRef.current += 1;
    setFocus({ nonce: nonceRef.current, view: v });
  };
  const flyToSite = (id) => {
    setSelectedId(id);
    nonceRef.current += 1;
    setFocus({ nonce: nonceRef.current, siteId: id });
  };

  // --- timeline bounds ---
  const yearBounds = useMemo(() => {
    const ys = sites.map(yearOf).filter((y) => y != null);
    if (ys.length === 0) return [2018, 2026];
    return [Math.min(...ys), Math.max(...ys)];
  }, [sites]);
  useEffect(() => {
    setRange([yearBounds[0], yearBounds[1]]);
  }, [yearBounds[0], yearBounds[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- filtering ---
  const layerFiltered = useMemo(
    () => sites.filter((s) => enabledLayers.has(s.layer)),
    [sites, enabledLayers]
  );

  const filtered = useMemo(() => {
    return layerFiltered.filter((s) => {
      if (statusMode === 'built' && PLANNED_STATUSES.has(s.status)) return false;
      if (statusMode === 'planned' && !PLANNED_STATUSES.has(s.status)) return false;
      if (range) {
        const y = yearOf(s);
        if (y != null && (y < range[0] || y > range[1])) return false;
      }
      return true;
    });
  }, [layerFiltered, statusMode, range]);

  const layerCounts = useMemo(() => {
    const m = {};
    for (const l of ALL_LAYERS) m[l] = 0;
    for (const s of sites) if (m[s.layer] != null) m[s.layer] += 1;
    return m;
  }, [sites]);

  // --- histogram for timeline ---
  const histogram = useMemo(() => {
    const [y0, y1] = yearBounds;
    const bins = [];
    for (let y = y0; y <= y1; y++) bins.push({ year: y, n: 0 });
    for (const s of layerFiltered) {
      const y = yearOf(s);
      if (y != null && y >= y0 && y <= y1) bins[y - y0].n += 1;
    }
    const max = Math.max(1, ...bins.map((b) => b.n));
    return { bins, max };
  }, [layerFiltered, yearBounds]);

  // --- search ---
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return sites
      .filter((s) => {
        const hay = [
          s.title,
          s.city,
          s.state,
          ...(s.tags || []),
          ...(s.actors || []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [sites, query]);

  // --- selection ---
  const selected = useMemo(
    () => sites.find((s) => s.id === selectedId) || null,
    [sites, selectedId]
  );
  const connections = useMemo(() => {
    if (!selectedId) return [];
    const byId = new Map(sites.map((s) => [s.id, s]));
    return links
      .filter((l) => l.source === selectedId || l.target === selectedId)
      .map((l) => {
        const otherId = l.source === selectedId ? l.target : l.source;
        return { link: l, other: byId.get(otherId), outgoing: l.source === selectedId };
      })
      .filter((c) => c.other);
  }, [links, selectedId, sites]);

  const toggleLayer = (l) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  };
  const soloLayer = (l) => setEnabledLayers(new Set([l]));

  return (
    <div className={`grid-page ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="g-header">
        <button
          className="g-menu"
          aria-label="Toggle layers"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
        <div className="g-brand">
          <span className="g-mark" aria-hidden="true" />
          <div>
            <h1>The Grid</h1>
            <span className="g-sub">a field map of the digital control grid</span>
          </div>
        </div>

        <div className="g-search">
          <input
            type="search"
            placeholder="Search sites, cities, actors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="g-results">
              {results.map((r) => (
                <li
                  key={r.id}
                  onClick={() => {
                    setQuery('');
                    if (!enabledLayers.has(r.layer)) toggleLayer(r.layer);
                    flyToSite(r.id);
                  }}
                >
                  <span
                    className="dot"
                    style={{ background: LAYERS[r.layer]?.color }}
                  />
                  <span className="r-title">{r.title}</span>
                  <span className="r-loc">{r.city}, {r.state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="g-views" aria-label="Map views">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button
              key={k}
              className={view === k ? 'active' : ''}
              onClick={() => flyToView(k)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="g-actions">
          <div className="g-readout">
            <span className="g-live" aria-hidden="true" />
            <span>{filtered.length}/{sites.length} nodes</span>
            <span className="g-readout-sep">·</span>
            <span>{links.length} links</span>
          </div>
          <button className="g-about-btn" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <Link className="g-back" to="/">← The Apparatus</Link>
        </div>
      </header>

      <div className="g-body">
        {drawerOpen && (
          <div className="g-backdrop" onClick={() => setDrawerOpen(false)} />
        )}

        <aside className="g-rail">
          <div className="g-rail-head">
            <span>Layers</span>
            <button className="g-rail-close" onClick={() => setDrawerOpen(false)}>×</button>
          </div>

          {LAYER_GROUPS.map((grp) => (
            <section key={grp.name} className="g-group">
              <h3>{grp.name}</h3>
              {grp.layers.map((l) => {
                const on = enabledLayers.has(l);
                return (
                  <div key={l} className={`g-layer ${on ? 'on' : 'off'}`}>
                    <button
                      className="g-layer-main"
                      onClick={() => toggleLayer(l)}
                      title={LAYERS[l].desc}
                    >
                      <span
                        className="g-swatch"
                        style={{
                          background: on ? LAYERS[l].color : 'transparent',
                          borderColor: LAYERS[l].color,
                        }}
                      />
                      <span className="g-layer-label">{LAYERS[l].label}</span>
                      <span className="g-layer-count">{layerCounts[l]}</span>
                    </button>
                    <button
                      className="g-solo"
                      title={`Show only ${LAYERS[l].label}`}
                      onClick={() => soloLayer(l)}
                    >
                      solo
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
          <button
            className="g-all"
            onClick={() => setEnabledLayers(new Set(ALL_LAYERS))}
          >
            show all layers
          </button>

          <section className="g-group">
            <h3>Status</h3>
            <div className="g-seg">
              {[
                ['all', 'All'],
                ['built', 'Existing'],
                ['planned', 'Planned'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={statusMode === k ? 'active' : ''}
                  onClick={() => setStatusMode(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="g-group">
            <h3>Connections</h3>
            {Object.entries(LINK_STYLES).map(([t, s]) => (
              <div key={t} className="g-linkrow">
                <svg width="30" height="6">
                  <line
                    x1="0" y1="3" x2="30" y2="3"
                    stroke={s.color}
                    strokeWidth="1.6"
                    strokeDasharray={s.dash || undefined}
                  />
                </svg>
                <span>{s.label}</span>
              </div>
            ))}
          </section>

          <div className="g-rail-foot">
            {filtered.length} of {sites.length} sites shown
          </div>
        </aside>

        <main className="g-map-wrap">
          <USGridMap
            sites={filtered}
            links={links}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focus={focus}
            viewLabel={VIEWS[view]?.label}
          />

          <div className="g-legend" role="group" aria-label="Layer quick toggles">
            {Object.entries(LAYERS).map(([k, l]) => (
              <button
                key={k}
                className={`g-chip ${enabledLayers.has(k) ? 'on' : 'off'}`}
                style={{ '--c': l.color }}
                title={l.label}
                onClick={() => toggleLayer(k)}
              >
                <span className="dot" />
                {l.short}
              </button>
            ))}
          </div>

          <Timeline
            bounds={yearBounds}
            range={range}
            onChange={setRange}
            histogram={histogram}
          />
        </main>

        {selected && (
          <aside className="g-detail" key={selected.id}>
            <button className="g-detail-close" onClick={() => setSelectedId(null)}>
              ×
            </button>
            <div
              className="d-layer"
              style={{ color: LAYERS[selected.layer]?.color }}
            >
              <span
                className="dot"
                style={{ background: LAYERS[selected.layer]?.color }}
              />
              {LAYERS[selected.layer]?.label}
              <span className="d-status">{selected.status}</span>
            </div>
            <h2>{selected.title}</h2>
            <div className="d-loc">
              {selected.city}, {selected.state}
              {selected.date ? ` · ${selected.date}` : ''}
              {selected.category ? ` · ${selected.category}` : ''}
            </div>
            <p className="d-desc">{selected.desc}</p>

            {selected.actors?.length > 0 && (
              <div className="d-tags">
                {selected.actors.map((a) => (
                  <span key={a} className="d-tag actor">{a}</span>
                ))}
              </div>
            )}
            {selected.tags?.length > 0 && (
              <div className="d-tags">
                {selected.tags.map((t) => (
                  <span key={t} className="d-tag">{t}</span>
                ))}
              </div>
            )}

            {connections.length > 0 && (
              <>
                <h4>Connected sites ({connections.length})</h4>
                {connections.map(({ link, other, outgoing }, i) => (
                  <div
                    key={i}
                    className="d-conn"
                    onClick={() => flyToSite(other.id)}
                  >
                    <span
                      className="d-conn-type"
                      style={{ color: LINK_STYLES[link.type]?.color }}
                    >
                      {outgoing ? '' : '⟵ '}
                      {LINK_STYLES[link.type]?.label || link.type}
                      {outgoing ? ' ⟶' : ''}
                    </span>
                    <span className="d-conn-title">{other.title}</span>
                    {link.note && <span className="d-conn-note">{link.note}</span>}
                  </div>
                ))}
              </>
            )}

            {selected.sources?.length > 0 && (
              <>
                <h4>Sources</h4>
                <div className="d-sources">
                  {selected.sources.map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noreferrer">
                      [{i + 1}] {hostOf(s)}
                    </a>
                  ))}
                </div>
              </>
            )}
            <button className="d-focus" onClick={() => flyToSite(selected.id)}>
              ⌖ focus on map
            </button>
          </aside>
        )}
      </div>

      {aboutOpen && (
        <div className="g-about" onClick={() => setAboutOpen(false)}>
          <div className="g-about-panel" onClick={(e) => e.stopPropagation()}>
            <button className="g-detail-close" onClick={() => setAboutOpen(false)}>
              ×
            </button>
            <h2>The Grid</h2>
            <p>
              A geographic companion to{' '}
              <Link to="/">The Apparatus</Link>. Where the Apparatus maps the
              conceptual architecture of digital authoritarianism, The Grid
              maps its physical footprint across the United States — and the
              counterweight rising against it.
            </p>
            <ul>
              {Object.entries(LAYERS).map(([k, l]) => (
                <li key={k}>
                  <span className="dot" style={{ background: l.color }} />
                  <strong>{l.label}.</strong> {l.desc}.
                </li>
              ))}
            </ul>
            <p className="g-about-note">
              Every point carries primary sources. Dashed arcs link resistance
              to its targets; solid arcs link power to its infrastructure. Use
              the Washington, DC view to navigate the dense cluster of federal
              actions, and Data Center Alley for Northern Virginia. Data lives
              in <code>data/grid/</code> in the repository and refreshes
              automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Timeline({ bounds, range, onChange, histogram }) {
  if (!range) return null;
  const [min, max] = bounds;
  const span = Math.max(1, max - min);
  const startPct = ((range[0] - min) / span) * 100;
  const endPct = ((range[1] - min) / span) * 100;

  return (
    <div className="g-timeline">
      <div className="g-hist">
        {histogram.bins.map((b) => (
          <div
            key={b.year}
            className={`g-bar ${
              b.year >= range[0] && b.year <= range[1] ? '' : 'out'
            }`}
            style={{ height: `${(b.n / histogram.max) * 100}%` }}
            title={`${b.year}: ${b.n}`}
          />
        ))}
      </div>
      <div className="g-track">
        <div className="g-track-bar" />
        <div
          className="g-track-active"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={range[0]}
          onChange={(e) =>
            onChange([Math.min(Number(e.target.value), range[1]), range[1]])
          }
        />
        <input
          type="range"
          min={min}
          max={max}
          value={range[1]}
          onChange={(e) =>
            onChange([range[0], Math.max(Number(e.target.value), range[0])])
          }
        />
      </div>
      <div className="g-tl-labels">
        <span>{min}</span>
        <span className="g-tl-current">
          {range[0]} — {range[1]}
        </span>
        <span>{max}</span>
      </div>
    </div>
  );
}
