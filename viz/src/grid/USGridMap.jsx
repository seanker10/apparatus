import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature, mesh } from 'topojson-client';
import us from 'us-atlas/states-albers-10m.json';
import { LAYERS, LINK_STYLES, PULSING_STATUSES, VIEWS } from './gridConfig';

// us-atlas states-albers-10m is pre-projected to a 975x610 viewport;
// this projection places lon/lat points in the same coordinate space.
const W = 975;
const H = 610;
const projection = d3.geoAlbersUsa().scale(1300).translate([W / 2, H / 2]);

const statesFeature = feature(us, us.objects.states);
const stateBorders = mesh(us, us.objects.states, (a, b) => a !== b);
const nationBorder = mesh(us, us.objects.nation);
const geoPath = d3.geoPath();

const DC_CENTER = projection([-77.02, 38.895]);

const DC_GROUP_LABELS = {
  'executive-order': 'Executive Orders',
  policy: 'Policy & Rules',
  program: 'Programs',
  contract: 'Contracts',
  enforcement: 'Enforcement',
  corporate: 'Corporate Contracts',
  surveillance: 'Surveillance',
  detention: 'Detention',
  resistance: 'Resistance',
  legislation: 'Legislation',
};

function truncate(s, n = 28) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function arcPath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dr = Math.hypot(dx, dy) * 1.4;
  if (dr < 0.2) return null;
  return `M${a.x},${a.y}A${dr},${dr} 0 0,1 ${b.x},${b.y}`;
}

// Lay out Washington DC sites as a thematic board: labeled columns grouped
// by theme (EOs, policy, programs, contracts…), date-sorted top to bottom.
// Coordinates are in projected units, so the board reads as a tight cluster
// on DC at national zoom and resolves into readable columns when zoomed in.
function layoutDCBoard(dcSites) {
  if (dcSites.length === 0) return [];
  const groups = d3.group(dcSites, (d) =>
    d.layer === 'federal' ? d.category : d.layer
  );
  const keys = Array.from(groups.keys()).sort(
    (a, b) => groups.get(b).length - groups.get(a).length
  );
  const COLS = 3;
  const colW = 3.7;
  const headerH = 0.55;
  const itemH = 0.26;
  const rowGap = 0.8;

  const rows = [];
  for (let i = 0; i < keys.length; i += COLS) rows.push(keys.slice(i, i + COLS));
  const rowHeights = rows.map(
    (row) => Math.max(...row.map((k) => groups.get(k).length)) * itemH + headerH
  );
  const totalH =
    rowHeights.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  const totalW = COLS * colW;
  const x0 = DC_CENTER[0] - totalW / 2 + colW / 2;
  let y = DC_CENTER[1] - totalH / 2;

  const headers = [];
  rows.forEach((row, ri) => {
    row.forEach((key, ci) => {
      const items = groups
        .get(key)
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const x = x0 + ci * colW;
      headers.push({
        key,
        label: DC_GROUP_LABELS[key] || key,
        x,
        y,
        count: items.length,
        color: LAYERS[items[0].layer]?.color || '#9ad8ff',
      });
      items.forEach((d, i) => {
        d.x = x;
        d.y = y + headerH + i * itemH;
        d.dc = true;
      });
    });
    y += rowHeights[ri] + rowGap;
  });
  return headers;
}

export default function USGridMap({
  sites,        // filtered, visible sites
  links,        // all links (filtered to visible endpoints here)
  selectedId,
  onSelect,
  focus,        // { nonce, view? , siteId? } — imperative fly-to requests
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const fitRef = useRef({ s: 1, tx: 0, ty: 0 });
  const selsRef = useRef({});           // d3 selections for light updates
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [cursor, setCursor] = useState(null);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Project sites. DC sites form the thematic board; elsewhere, points that
  // share (or nearly share) a location fan out in a small ring that is
  // sub-pixel at national scale and resolves cleanly when zoomed in.
  const { placed, dcHeaders } = useMemo(() => {
    const dc = [];
    const rest = [];
    for (const s of sites) {
      const p = projection([s.lon, s.lat]);
      if (!p) continue;
      const d = { ...s, x: p[0], y: p[1] };
      if (s.state === 'DC') dc.push(d);
      else rest.push(d);
    }
    const byKey = d3.group(rest, (d) => `${Math.round(d.x * 2)}|${Math.round(d.y * 2)}`);
    for (const [, arr] of byKey) {
      if (arr.length < 2) continue;
      const cx = d3.mean(arr, (d) => d.x);
      const cy = d3.mean(arr, (d) => d.y);
      const R = 0.5 + 0.12 * arr.length;
      arr
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .forEach((d, i) => {
          const a = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
          d.x = cx + R * Math.cos(a);
          d.y = cy + R * Math.sin(a);
        });
    }
    const dcHeaders = layoutDCBoard(dc);
    return { placed: [...rest, ...dc], dcHeaders };
  }, [sites]);

  const placedById = useMemo(() => new Map(placed.map((d) => [d.id, d])), [placed]);

  const visibleLinks = useMemo(
    () =>
      links.filter((l) => placedById.has(l.source) && placedById.has(l.target)),
    [links, placedById]
  );

  const linkPartners = useMemo(() => {
    const m = new Map();
    for (const l of visibleLinks) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source).add(l.target);
      m.get(l.target).add(l.source);
    }
    return m;
  }, [visibleLinks]);

  // ---- Build / rebuild scene ----
  useEffect(() => {
    const { w, h } = size;
    if (!svgRef.current || w === 0 || h === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const s = Math.min(w / W, h / H) * 0.98;
    const tx = (w - W * s) / 2;
    const ty = (h - H * s) / 2;
    fitRef.current = { s, tx, ty };

    const zoomG = svg.append('g').attr('class', 'zoom-g');
    const baseG = zoomG
      .append('g')
      .attr('class', 'base-g')
      .attr('transform', `translate(${tx},${ty}) scale(${s})`);

    // --- terrain ---
    const mapG = baseG.append('g').attr('class', 'terrain');
    mapG
      .selectAll('path.state')
      .data(statesFeature.features)
      .join('path')
      .attr('class', 'state')
      .attr('d', geoPath);
    mapG
      .append('path')
      .attr('class', 'state-borders')
      .attr('d', geoPath(stateBorders));
    mapG
      .append('path')
      .attr('class', 'nation-border')
      .attr('d', geoPath(nationBorder));

    // --- connection arcs ---
    const arcsG = baseG.append('g').attr('class', 'arcs');
    const arcSel = arcsG
      .selectAll('path.arc')
      .data(visibleLinks)
      .join('path')
      .attr('class', 'arc')
      .attr('d', (l) => arcPath(placedById.get(l.source), placedById.get(l.target)))
      .attr('stroke', (l) => LINK_STYLES[l.type]?.color || '#888')
      .attr('stroke-dasharray', (l) => LINK_STYLES[l.type]?.dash || null)
      .attr('opacity', 0);
    arcSel.transition().delay(500).duration(700).attr('opacity', null);

    // --- keep-scale elements: site markers + DC board headers ---
    const applyKS = (k) => {
      const f = 1 / (s * k);
      selsRef.current.nodeSel?.attr(
        'transform',
        (d) => `translate(${d.x},${d.y}) scale(${f})`
      );
      selsRef.current.headSel?.attr(
        'transform',
        (d) => `translate(${d.x},${d.y}) scale(${f})`
      );
    };

    const headSel = baseG
      .append('g')
      .attr('class', 'dc-heads')
      .selectAll('g.dc-head')
      .data(dcHeaders)
      .join('g')
      .attr('class', 'dc-head')
      .style('color', (d) => d.color);
    headSel
      .append('text')
      .attr('class', 'dc-head-label')
      .attr('x', -8)
      .attr('y', 0)
      .text((d) => `${d.label.toUpperCase()} · ${d.count}`);
    headSel
      .append('line')
      .attr('class', 'dc-head-rule')
      .attr('x1', -10)
      .attr('y1', 5)
      .attr('x2', 120)
      .attr('y2', 5);

    const nodesG = baseG.append('g').attr('class', 'nodes');
    const nodeSel = nodesG
      .selectAll('g.node')
      .data(placed, (d) => d.id)
      .join('g')
      .attr('class', (d) => `node layer-${d.layer}${d.dc ? ' dc-node' : ''}`)
      .style('color', (d) => LAYERS[d.layer]?.color || '#999');

    nodeSel
      .filter((d) => PULSING_STATUSES.has(d.status))
      .append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', 6);

    nodeSel
      .append('circle')
      .attr('class', 'hit')
      .attr('r', 13)
      .attr('fill', 'transparent');

    nodeSel
      .filter((d) => PULSING_STATUSES.has(d.status))
      .append('circle')
      .attr('class', 'plan-ring')
      .attr('r', 7.5);

    nodeSel
      .append('circle')
      .attr('class', 'dot')
      .attr('r', 4.2);

    // targeting reticle — visible on selection
    const reticle = nodeSel.append('g').attr('class', 'reticle');
    reticle.append('circle').attr('class', 'reticle-ring').attr('r', 11);
    [0, 90, 180, 270].forEach((a) => {
      reticle
        .append('line')
        .attr('class', 'reticle-tick')
        .attr('transform', `rotate(${a})`)
        .attr('x1', 0)
        .attr('y1', -15)
        .attr('x2', 0)
        .attr('y2', -9);
    });

    nodeSel
      .append('text')
      .attr('class', 'site-label')
      .attr('x', 9)
      .attr('y', 3.5)
      .text((d) => truncate(d.title));

    // staggered pop-in
    nodeSel
      .attr('opacity', 0)
      .transition()
      .delay((d, i) => 120 + i * 5)
      .duration(260)
      .attr('opacity', 1);

    nodeSel
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelect(d.id);
      })
      .on('mouseenter', function (event, d) {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          site: d,
        });
        d3.select(this).raise().classed('hover', true);
      })
      .on('mousemove', (event, d) => {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          site: d,
        });
      })
      .on('mouseleave', function () {
        setTooltip(null);
        d3.select(this).classed('hover', false);
      });

    selsRef.current = { nodeSel, arcSel, headSel };

    // --- zoom / pan ---
    const zoom = d3
      .zoom()
      .scaleExtent([1, 180])
      .translateExtent([
        [-w * 0.25, -h * 0.25],
        [w * 1.25, h * 1.25],
      ])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        zoomG.attr('transform', event.transform);
        applyKS(event.transform.k);
        const eff = event.transform.k * s;
        svg.classed('labels-on', eff >= 9);
        svg.classed('dc-labels-on', eff >= 26);
      });
    zoomRef.current = zoom;
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', () => onSelect(null));

    // restore previous transform across rebuilds
    svg.call(zoom.transform, transformRef.current);
  }, [placed, dcHeaders, visibleLinks, placedById, size, onSelect]);

  // ---- selection highlighting (light update, no rebuild) ----
  useEffect(() => {
    const { nodeSel, arcSel } = selsRef.current;
    if (!nodeSel) return;
    if (!selectedId) {
      nodeSel
        .classed('selected', false)
        .classed('related', false)
        .classed('dim', false)
        .select('.dot')
        .attr('r', 4.2);
      arcSel.classed('hot', false).classed('dim', false);
      return;
    }
    const related = linkPartners.get(selectedId) || new Set();
    nodeSel
      .classed('selected', (d) => d.id === selectedId)
      .classed('related', (d) => related.has(d.id))
      .classed('dim', (d) => d.id !== selectedId && !related.has(d.id))
      .select('.dot')
      .attr('r', (d) => (d.id === selectedId ? 6.5 : 4.2));
    nodeSel.filter((d) => d.id === selectedId).raise();
    arcSel
      .classed('hot', (l) => l.source === selectedId || l.target === selectedId)
      .classed('dim', (l) => l.source !== selectedId && l.target !== selectedId);
  }, [selectedId, linkPartners, placed, size]);

  // ---- imperative fly-to (views & search) ----
  useEffect(() => {
    if (!focus || !focus.nonce || !svgRef.current || !zoomRef.current) return;
    const { s, tx, ty } = fitRef.current;
    const svg = d3.select(svgRef.current);
    const { w, h } = size;

    let target = null;
    if (focus.view) {
      const v = VIEWS[focus.view];
      if (!v) return;
      if (v.k === 1 || v.lon == null) {
        target = d3.zoomIdentity;
      } else {
        const p = projection([v.lon, v.lat]);
        if (!p) return;
        const bx = s * p[0] + tx;
        const by = s * p[1] + ty;
        target = d3.zoomIdentity
          .translate(w / 2, h / 2)
          .scale(v.k)
          .translate(-bx, -by);
      }
    } else if (focus.siteId) {
      const d = placedById.get(focus.siteId);
      if (!d) return;
      const k = d.state === 'DC' ? VIEWS.dc.k : Math.max(transformRef.current.k, 9);
      const bx = s * d.x + tx;
      const by = s * d.y + ty;
      target = d3.zoomIdentity
        .translate(w / 2, h / 2)
        .scale(k)
        .translate(-bx, -by);
    }
    if (target) {
      svg
        .transition()
        .duration(950)
        .ease(d3.easeCubicInOut)
        .call(zoomRef.current.transform, target);
    }
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- cursor crosshair + coordinate readout ----
  const handleMouseMove = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const t = transformRef.current;
    const { s, tx, ty } = fitRef.current;
    const px = ((x - t.x) / t.k - tx) / s;
    const py = ((y - t.y) / t.k - ty) / s;
    const ll = projection.invert ? projection.invert([px, py]) : null;
    setCursor({ x, y, ll });
  };

  return (
    <div
      className="gridmap"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCursor(null)}
    >
      <svg ref={svgRef} width={size.w} height={size.h} />

      {cursor && (
        <>
          <div className="crosshair-x" style={{ top: cursor.y }} />
          <div className="crosshair-y" style={{ left: cursor.x }} />
          <div className="coord-readout">
            {cursor.ll
              ? `${Math.abs(cursor.ll[1]).toFixed(2)}°N  ${Math.abs(cursor.ll[0]).toFixed(2)}°W`
              : '--.--°N  --.--°W'}
          </div>
        </>
      )}

      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(tooltip.x + 14, size.w - 240),
            top: Math.min(tooltip.y + 14, size.h - 90),
          }}
        >
          <span
            className="tt-layer"
            style={{ color: LAYERS[tooltip.site.layer]?.color }}
          >
            {LAYERS[tooltip.site.layer]?.label}
          </span>
          <span className="tt-title">{tooltip.site.title}</span>
          <span className="tt-loc">
            {tooltip.site.city}, {tooltip.site.state}
            {tooltip.site.date ? ` · ${tooltip.site.date}` : ''}
          </span>
        </div>
      )}
      <div className="map-hint">scroll to zoom · drag to pan · click a point</div>
    </div>
  );
}
