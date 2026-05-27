import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

const TYPE_COLORS = {
  technology: '#d4a574',
  system:     '#a87c5a',
  policy:     '#7a9b8e',
  action:     '#9b6b5a',
  event:      '#b85c4a',
  concept:    '#8a7a9b',
  figure:     '#c8a878',
};

const EDGE_STYLES = {
  enables:     { color: '#d4a574', dash: 'none',     label: 'enables' },
  requires:    { color: '#e8c89a', dash: 'none',     label: 'requires' },
  accelerates: { color: '#b85c4a', dash: 'none',     label: 'accelerates' },
  legitimizes: { color: '#8a7a9b', dash: '4 3',      label: 'legitimizes' },
  precedent:   { color: '#7a9b8e', dash: '2 4',      label: 'precedent for' },
  obscures:    { color: '#5a4a8a', dash: '6 3 2 3',  label: 'obscures' },
  counters:    { color: '#5a8a7a', dash: '6 3 2 3',  label: 'counters' },
  contradicts: { color: '#b85c8a', dash: '1 3',      label: 'contradicts' },
};

const NODE_TYPES = Object.keys(TYPE_COLORS);

// Parse YYYY | YYYY-MM | YYYY-MM-DD to a Date (or null)
function parseDate(s) {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length === 1) return new Date(Number(parts[0]), 0, 1);
  if (parts.length === 2) return new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return null;
}
function fmtYear(date) {
  return date ? date.getFullYear().toString() : '';
}

function useIsMobile(query = '(max-width: 768px)') {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [query]);
  return matches;
}

export default function ApparatusMap({
  nodes,
  edges,
  dimension,
  loading,
  error,
  selectedId,
  onSelect,
  sidebarOpen,
  onCloseSidebar,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simRef = useRef(null);
  const isMobile = useIsMobile();

  // --- Filter state ---
  const [enabledTypes, setEnabledTypes] = useState(() => new Set(NODE_TYPES));
  const dimensionValues = useMemo(() => {
    const set = new Set();
    for (const n of nodes) {
      const v = n[dimension];
      set.add(v == null ? 'null' : v);
    }
    return Array.from(set).sort();
  }, [nodes, dimension]);
  const [enabledDimValues, setEnabledDimValues] = useState(() => new Set());
  useEffect(() => {
    setEnabledDimValues(new Set(dimensionValues));
  }, [dimensionValues.join('|')]);

  // --- Timeline state ---
  const dateBounds = useMemo(() => {
    const dates = nodes.map((n) => parseDate(n.date)).filter(Boolean);
    if (dates.length === 0) {
      return { min: new Date(2000, 0, 1), max: new Date() };
    }
    return {
      min: new Date(Math.min(...dates.map((d) => +d))),
      max: new Date(Math.max(...dates.map((d) => +d))),
    };
  }, [nodes]);
  const [range, setRange] = useState(null);
  useEffect(() => {
    setRange([+dateBounds.min, +dateBounds.max]);
  }, [+dateBounds.min, +dateBounds.max]);

  // --- Filtered graph ---
  const { fNodes, fEdges } = useMemo(() => {
    const fNodes = nodes.filter((n) => {
      if (!enabledTypes.has(n.type)) return false;
      const dimVal = n[dimension] == null ? 'null' : n[dimension];
      if (!enabledDimValues.has(dimVal)) return false;
      if (range && n.date) {
        const d = +parseDate(n.date);
        if (d < range[0] || d > range[1]) return false;
      }
      return true;
    });
    const ids = new Set(fNodes.map((n) => n.id));
    const fEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { fNodes, fEdges };
  }, [nodes, edges, enabledTypes, enabledDimValues, dimension, range]);

  // --- D3 simulation ---
  useEffect(() => {
    if (!svgRef.current || fNodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const compact = isMobile || width < 700;

    // Responsive tuning — denser, thinner, calmer on mobile.
    const linkDistance = compact ? 55 : 90;
    const chargeStrength = compact ? -150 : -260;
    const collideRadius = compact ? 18 : 28;
    const nodeR = compact ? 5 : 8;
    const nodeRSel = compact ? 8 : 12;
    const edgeWidth = compact ? 0.9 : 1.4;
    const edgeOpacity = compact ? 0.45 : 0.6;
    const arrowSize = compact ? 5 : 7;
    const arrowRefX = compact ? 11 : 16;
    const showLabels = !compact;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Arrowhead markers per edge type
    const defs = svg.append('defs');
    Object.entries(EDGE_STYLES).forEach(([type, style]) => {
      defs
        .append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', arrowRefX)
        .attr('refY', 0)
        .attr('markerWidth', arrowSize)
        .attr('markerHeight', arrowSize)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', style.color);
    });

    // Cluster centers per dimension value
    const dimVals = Array.from(
      new Set(fNodes.map((n) => (n[dimension] == null ? 'null' : n[dimension])))
    );
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.32;
    const clusterPos = {};
    dimVals.forEach((v, i) => {
      const angle = (i / Math.max(1, dimVals.length)) * 2 * Math.PI - Math.PI / 2;
      clusterPos[v] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    // Working copies (d3 mutates)
    const nodeData = fNodes.map((n) => ({ ...n }));
    const linkData = fEdges.map((e) => ({ ...e }));

    const sim = d3
      .forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData).id((d) => d.id).distance(linkDistance).strength(0.6))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('collide', d3.forceCollide().radius(collideRadius))
      .force(
        'x',
        d3.forceX((d) => {
          const v = d[dimension] == null ? 'null' : d[dimension];
          return clusterPos[v]?.x ?? centerX;
        }).strength(0.18)
      )
      .force(
        'y',
        d3.forceY((d) => {
          const v = d[dimension] == null ? 'null' : d[dimension];
          return clusterPos[v]?.y ?? centerY;
        }).strength(0.18)
      );

    simRef.current = sim;

    // Pan/zoom
    const root = svg.append('g').attr('class', 'root');
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => root.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);

    // Cluster labels (faint)
    const labelG = root.append('g').attr('class', 'cluster-labels');
    dimVals.forEach((v) => {
      const p = clusterPos[v];
      labelG
        .append('text')
        .attr('x', p.x)
        .attr('y', p.y - radius * 0.4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#5a4a3a')
        .attr('font-size', compact ? 9 : 11)
        .attr('letter-spacing', '0.18em')
        .attr('text-transform', 'uppercase')
        .text(v.toUpperCase());
    });

    const linkSel = root
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke', (d) => EDGE_STYLES[d.type]?.color || '#666')
      .attr('stroke-width', edgeWidth)
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', (d) => {
        const dash = EDGE_STYLES[d.type]?.dash;
        return dash && dash !== 'none' ? dash : null;
      })
      .attr('marker-end', (d) => `url(#arrow-${d.type})`)
      .attr('opacity', edgeOpacity);

    const nodeG = root
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelect(d.id);
      });

    // Larger invisible tap target on mobile for easier finger taps
    if (compact) {
      nodeG
        .append('circle')
        .attr('r', 16)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all');
    }

    nodeG
      .append('circle')
      .attr('class', 'node-dot')
      .attr('r', (d) => (d.id === selectedId ? nodeRSel : nodeR))
      .attr('fill', (d) => TYPE_COLORS[d.type] || '#888')
      .attr('stroke', (d) => (d.id === selectedId ? '#e8dfc8' : 'rgba(21,17,13,0.5)'))
      .attr('stroke-width', (d) => (d.id === selectedId ? 2 : 1))
      .attr('pointer-events', 'none');

    nodeG
      .append('text')
      .attr('class', 'node-label')
      .attr('x', 12)
      .attr('y', 4)
      .attr('pointer-events', 'none')
      .style('display', (d) =>
        showLabels || d.id === selectedId ? null : 'none'
      )
      .text((d) => d.title);

    svg.on('click', () => onSelect(null));

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodeG.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
    });

    return () => sim.stop();
  }, [fNodes, fEdges, dimension, selectedId, onSelect, isMobile]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  const incoming = useMemo(
    () => edges.filter((e) => e.target === selectedId),
    [edges, selectedId]
  );
  const outgoing = useMemo(
    () => edges.filter((e) => e.source === selectedId),
    [edges, selectedId]
  );

  // === Render ===
  return (
    <>
      {sidebarOpen && (
        <div
          className="drawer-backdrop"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <span>Filters</span>
          <button
            className="sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close filters"
          >
            ×
          </button>
        </div>

        <h3>Node types</h3>
        {NODE_TYPES.map((t) => (
          <label key={t} className="chk">
            <input
              type="checkbox"
              checked={enabledTypes.has(t)}
              onChange={(e) => {
                const next = new Set(enabledTypes);
                if (e.target.checked) next.add(t);
                else next.delete(t);
                setEnabledTypes(next);
              }}
            />
            <span className="swatch" style={{ background: TYPE_COLORS[t] }} />
            <span>{t}</span>
          </label>
        ))}

        <h3>{dimension}</h3>
        {dimensionValues.map((v) => (
          <label key={v} className="chk">
            <input
              type="checkbox"
              checked={enabledDimValues.has(v)}
              onChange={(e) => {
                const next = new Set(enabledDimValues);
                if (e.target.checked) next.add(v);
                else next.delete(v);
                setEnabledDimValues(next);
              }}
            />
            <span>{v}</span>
          </label>
        ))}

        <h3>Edges</h3>
        {Object.entries(EDGE_STYLES).map(([t, s]) => (
          <div key={t} className="edge-legend">
            <svg width="32" height="6">
              <line x1="0" y1="3" x2="32" y2="3" stroke={s.color} strokeWidth="1.5"
                strokeDasharray={s.dash === 'none' ? null : s.dash} />
            </svg>
            <span>{s.label}</span>
          </div>
        ))}
      </aside>

      <main className="graph-area" ref={containerRef}>
        {loading && <div className="loading">loading…</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && fNodes.length === 0 && (
          <div className="loading">no nodes match filters</div>
        )}
        <svg ref={svgRef} />
      </main>

      {selectedNode && (
        <aside className="detail">
          <button
            className="back"
            onClick={() => onSelect(null)}
            aria-label="Back to map"
          >
            <span aria-hidden="true">‹</span> Back to map
          </button>
          <button
            className="close"
            onClick={() => onSelect(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="type-line" style={{ color: TYPE_COLORS[selectedNode.type] }}>
            {selectedNode.type}
          </div>
          <h2>{selectedNode.title}</h2>
          <div className="dim-line">
            domain: {selectedNode.domain ?? '—'} · function: {selectedNode.function ?? '—'} · phase: {selectedNode.phase ?? '—'}
          </div>
          <div className="desc">{selectedNode.desc}</div>
          <div className="meta">date: {selectedNode.date ?? '—'}</div>
          {selectedNode.sources?.length > 0 && (
            <div className="meta">
              sources:{' '}
              {selectedNode.sources.map((s, i) => (
                <span key={i}>
                  <a href={s} target="_blank" rel="noreferrer">[{i + 1}]</a>{' '}
                </span>
              ))}
            </div>
          )}
          {selectedNode.tags?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedNode.tags.map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
          )}

          {outgoing.length > 0 && (
            <>
              <h4>Outgoing ({outgoing.length})</h4>
              {outgoing.map((e, i) => {
                const tgt = nodes.find((n) => n.id === e.target);
                return (
                  <div key={i} className="conn" onClick={() => onSelect(e.target)}>
                    <span className="conn-type">{e.type}</span>
                    <span>{tgt?.title ?? e.target}</span>
                    {e.note && <span className="conn-note">{e.note}</span>}
                  </div>
                );
              })}
            </>
          )}

          {incoming.length > 0 && (
            <>
              <h4>Incoming ({incoming.length})</h4>
              {incoming.map((e, i) => {
                const src = nodes.find((n) => n.id === e.source);
                return (
                  <div key={i} className="conn" onClick={() => onSelect(e.source)}>
                    <span className="conn-type">{e.type}</span>
                    <span>{src?.title ?? e.source}</span>
                    {e.note && <span className="conn-note">{e.note}</span>}
                  </div>
                );
              })}
            </>
          )}
        </aside>
      )}

      <Timeline
        bounds={dateBounds}
        range={range}
        onChange={setRange}
      />
    </>
  );
}

function Timeline({ bounds, range, onChange }) {
  if (!range) return null;
  const min = +bounds.min;
  const max = +bounds.max;
  const span = Math.max(1, max - min);

  const handleStart = (e) => {
    const v = Math.min(Number(e.target.value), range[1]);
    onChange([v, range[1]]);
  };
  const handleEnd = (e) => {
    const v = Math.max(Number(e.target.value), range[0]);
    onChange([range[0], v]);
  };
  const startPct = ((range[0] - min) / span) * 100;
  const endPct = ((range[1] - min) / span) * 100;

  return (
    <div className="timeline">
      <div className="timeline-labels">
        <span>{fmtYear(bounds.min)}</span>
        <span style={{ color: 'var(--accent)' }}>
          {fmtYear(new Date(range[0]))} — {fmtYear(new Date(range[1]))}
        </span>
        <span>{fmtYear(bounds.max)}</span>
      </div>
      <div className="timeline-track">
        <div className="timeline-bar" />
        <div
          className="timeline-bar-active"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={range[0]}
          onChange={handleStart}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={range[1]}
          onChange={handleEnd}
        />
      </div>
    </div>
  );
}
